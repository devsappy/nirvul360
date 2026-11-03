"""
Courier settlement sheet API: courier catalog, preview (CSV/XLSX upload or JSON rows),
commit, and recent uploads.

Preview never writes. Commit is idempotent — the same consignment in the same or a
different sheet cannot be paid twice (settlement_once unique index + dedupe check).
"""
import hashlib
import json
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile
from pydantic import BaseModel
from app.api.auth import get_current_user
from app.domain import courier_map
from app.domain.settlements import prepare_records, commit_settlement, recent_uploads
from app.db.session import all as db_all

router = APIRouter(prefix="/api/settlements", tags=["Courier Settlements"])


class CommitBody(BaseModel):
    courier: str
    rows: List[Dict[str, Any]]
    deposit_account_id: Optional[int] = None
    filename: Optional[str] = None


class PreviewBody(BaseModel):
    courier: str
    rows: List[Dict[str, Any]]


@router.get("/couriers")
async def list_couriers(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/settlements/couriers
    → {"couriers": [{"key": "steadfast", "display_name": "Steadfast",
                     "columns": {"consignment_id": ["cod amount", ...], ...},
                     "status_words": {"delivered": ["delivered", ...], ...}}, ...]}
    """
    return {"couriers": courier_map.courier_catalog()}


@router.post("/preview")
async def preview_upload(
    file: UploadFile = File(...),
    courier: str = Form(...),
    current: Dict[str, Any] = Depends(get_current_user),
):
    """
    POST /api/settlements/preview   (multipart: file=CSV or XLSX, courier=steadfast|pathao|redx|sa_paribahan)

    Maps the sheet and returns the normalised rows + warnings + summary. Writes nothing.

    Response:
      {
        "courier", "display_name",
        "rows": [{"row_no", "consignment_id", "customer_name", "order_id",
                  "status_raw", "status", "cod_collected", "delivery_charge",
                  "cod_fee", "return_charge", "settlement_date",
                  "consignment_total", "errors": ["..."]?}, ...],
        "warnings": ["column not found for 'cod_fee' — accepted names: ..."],
        "errors": [{"row_no", "consignment_id", "errors": [...]}, ...],
        "summary": {"rows", "errors", "total_cod_poisha", "total_fees_poisha",
                    "by_status": {"delivered": {"count", "cod_poisha", "fees_poisha"}, ...}}
      }
    """
    m_id = current["merchantId"]
    data = await file.read()
    try:
        raw_rows, file_warnings = courier_map.parse_file_bytes(data, file.filename or 'sheet.csv')
        result = prepare_records(raw_rows, courier)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    result['warnings'] = file_warnings + result.get('warnings', [])
    result['summary'] = _match_summary(m_id, result['rows'])
    return result


@router.post("/preview-json")
async def preview_json(body: PreviewBody, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/settlements/preview-json
    Body: {"courier": "redx", "rows": [{"Tracking ID": "...", "Status": "Delivered", ...}, ...]}
    (The frontend may pre-parse the CSV itself and send raw header-keyed rows.)
    Response shape: identical to /preview, nothing stored.
    """
    m_id = current["merchantId"]
    try:
        result = prepare_records(body.rows, body.courier)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    result['summary'] = _match_summary(m_id, result['rows'])
    return result


def _match_summary(merchant_id: int, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Read-only consignment→order matching for the preview summary."""
    matched = 0
    for r in rows:
        consignment = r.get('consignment_id')
        if consignment:
            hit = db_all(
                "SELECT id FROM orders WHERE merchant_id = ? AND consignment_id = ? LIMIT 1",
                merchant_id, consignment
            )
            if hit:
                r['order_id'] = hit[0]['id']
                matched += 1

    by_status: Dict[str, Dict[str, Any]] = {}
    total_cod = 0
    total_fees = 0
    errors = 0
    rows_n = 0
    for r in rows:
        rows_n += 1
        stat = r.get('status') or 'unknown'
        slot = by_status.setdefault(stat, {'count': 0, 'cod_poisha': 0, 'fees_poisha': 0})
        slot['count'] += 1
        fees = (r.get('delivery_charge') or 0) + (r.get('cod_fee') or 0) + (r.get('return_charge') or 0)
        slot['cod_poisha'] += r.get('cod_collected') or 0
        slot['fees_poisha'] += fees
        if r.get('errors'):
            errors += 1
            continue
        total_cod += r.get('cod_collected') or 0
        total_fees += fees
    return {'rows': rows_n, 'matched': matched, 'errors': errors,
            'total_cod_poisha': total_cod, 'total_fees_poisha': total_fees,
            'by_status': by_status}


@router.post("/commit")
async def commit(body: CommitBody, current: Dict[str, Any] = Depends(get_current_user)):
    """
    POST /api/settlements/commit
    Body:
      {
        "courier": "steadfast",
        "rows": [ ...normalised (or raw header-keyed) rows... ],
        "deposit_account_id": 3?,        // cash account the payout lands in (default: default cash)
        "filename": "steadfast-oct.csv"? // required only when rows were pre-parsed by the frontend
      }

    Writes an uploads row (source-tagged settlement_rows), threads payment postings
    for delivered parcels, raises courier exceptions (missing_parcel /
    short_settlement / zero_settlement) and is idempotent per consignment.

    Response:
      {"ok": true, "upload_id": 4, "courier": "steadfast", "rows": 9,
       "posted": 6, "exceptions": 1, "unmatched": 1, "skipped": 1,
       "total_cash_poisha": 254500, "row_errors": [...]}
    """
    m_id = current["merchantId"]
    actor = current["actor"]
    try:
        rows = body.rows
        needs_norm = any(rec for rec in rows if ('consignment_id' not in (rec or {})))
        if needs_norm:
            prepared = prepare_records(rows, body.courier)
            prepared_rows = prepared['rows']
        else:
            prepared_rows = rows
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))

    sha = hashlib.sha256(
        json.dumps(prepared_rows, sort_keys=True, default=str).encode('utf-8')
    ).hexdigest()
    filename = body.filename or f"{body.courier}-{sha[:8]}.csv"

    try:
        result = commit_settlement(
            m_id, prepared_rows, body.courier, filename, sha,
            {'source': 'courier_sheet_upload', 'actor': actor},
            deposit_account_id=body.deposit_account_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))
    return {"ok": True, **result}


@router.get("")
async def list_settlements(current: Dict[str, Any] = Depends(get_current_user)):
    """
    GET /api/settlements → recent uploads with row stats.
    {"uploads": [{"id", "kind", "courier", "filename", "status", "row_count",
                  "summary": {...}, "rows": {"posted": n, "exceptions": n, "unmatched": n, "total": n},
                  "created_at", "committed_at"}, ...]}
    """
    m_id = current["merchantId"]
    return {"uploads": recent_uploads(m_id)}
