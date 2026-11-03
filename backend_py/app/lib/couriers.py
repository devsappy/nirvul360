import os
from typing import Dict, Any, Optional

class DisabledError(Exception):
    pass

PROVIDERS = {
    'steadfast': {'name': 'Steadfast', 'base_url': 'https://portal.steadfast.com.bd/api/v1'},
    'pathao': {'name': 'Pathao', 'base_url': 'https://api.pathao.com/api/v1'},
    'redx': {'name': 'RedX', 'base_url': 'https://api.redx.com.bd/v1'},
    'sa_paribahan': {'name': 'SA Paribahan', 'base_url': 'https://api.saparibahan.com/v1'},
}


def _creds(settings, code):
    courier_cfg = (settings or {}).get('courier', {}) or (settings or {}).get('integrations', {}).get('courier_website', {})
    if isinstance(courier_cfg, dict) and code in courier_cfg:
        c = courier_cfg[code]
    else:
        c = courier_cfg
    token = None
    if isinstance(c, dict):
        token = c.get('api_key') or c.get('apiKey') or c.get('token')
    if not token:
        token = os.environ.get(f'COURIER_{code.upper()}_TOKEN') or os.environ.get('COURIER_TOKEN')
    if not token:
        return None
    return {'token': token, 'base_url': (c.get('base_url') if isinstance(c, dict) else None) or PROVIDERS[code]['base_url']}


def get_provider(code):
    code = (code or '').lower()
    if code not in PROVIDERS:
        raise ValueError(f'unknown courier {code}')
    return PROVIDERS[code]


async def fetch_status(settings, code, consignment_id):
    code = (code or '').lower()
    if code not in PROVIDERS:
        raise ValueError(f'unknown courier {code}')
    creds = _creds(settings, code)
    if not creds:
        raise DisabledError('courier not configured')
    # thin client: returns normalized status via a GET; tests mock httpx
    import httpx
    url = f"{creds['base_url'].rstrip('/')}/consignments/{consignment_id}"
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, headers={'Authorization': f"Bearer {creds['token']}"})
        r.raise_for_status()
        data = r.json()
    raw = data.get('status') or data.get('delivery_status') or data.get('state')
    from app.domain.courier_map import normalize_status
    norm = normalize_status(code, raw)
    return norm or raw