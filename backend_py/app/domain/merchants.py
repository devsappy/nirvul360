"""
Merchant, Team & Hierarchy, and Settings management.
"""
import os
import secrets
import hashlib
import json
from typing import Dict, Any, List, Optional
from app.db.session import insert, update, one, all, tx, run
from app.lib.dates import now_iso
from app.lib.money import to_poisha
from app.domain.roles import ROLES

DEFAULT_INTEGRATIONS = {
    'courier_website': {
        'connected': False,
        'provider': 'steadfast',
        'api_key': '',
        'api_secret': '',
        'base_url': 'https://portal.steadfast.com.bd/api/v1',
        'webhook_url': '',
        'auto_sync': True,
        'last_synced_at': None,
    },
    'meta_ads': {
        'connected': False,
        'ad_account_id': '',
        'access_token': '',
        'pixel_id': '',
        'currency': 'USD',
        'auto_sync': True,
        'last_synced_at': None,
    },
    'whatsapp_business': {
        'connected': False,
        'phone_number_id': '',
        'business_account_id': '',
        'access_token': '',
        'verify_token': 'gross_verify_token',
        'phone_number': '',
        'last_tested_at': None,
    },
}

DEFAULT_SETTINGS = {
    'stuck_parcel_threshold_days': 5,
    'unsettled_cod_window_days': 10,
    'duplicate_window_hours': 72,
    'daily_summary': {'enabled': True, 'time': '21:00'},
    'integrations': DEFAULT_INTEGRATIONS,
}

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.scrypt(password.encode('utf-8'), salt=salt.encode('utf-8'), n=16384, r=8, p=1, dklen=64)
    return f"{salt}:{dk.hex()}"

def verify_password(password: str, hashed: str) -> bool:
    if not hashed or ':' not in hashed:
        return False
    salt, hash_hex = hashed.split(':', 1)
    dk = hashlib.scrypt(password.encode('utf-8'), salt=salt.encode('utf-8'), n=16384, r=8, p=1, dklen=64)
    return secrets.compare_digest(dk.hex(), hash_hex)

def create_merchant(data: Dict[str, Any]) -> int:
    name = data['name']
    api_key = f"gm_{secrets.token_hex(18)}"
    merchant_id = insert('merchants', {
        'name': name,
        'api_key': api_key,
        'settings': json.dumps(DEFAULT_SETTINGS),
        'created_at': now_iso(),
    })
    return merchant_id

def get_merchant(merchant_id: int) -> Dict[str, Any]:
    m = one("SELECT * FROM merchants WHERE id = ?", merchant_id)
    if not m:
        raise ValueError(f"merchant {merchant_id} not found")
    return m

def list_merchants() -> List[Dict[str, Any]]:
    return all("SELECT id, name, api_key, created_at FROM merchants ORDER BY id ASC")

def get_settings(merchant_id: int) -> Dict[str, Any]:
    m = get_merchant(merchant_id)
    raw = m.get('settings')
    cfg = json.loads(raw) if isinstance(raw, str) else (raw or {})
    res = {**DEFAULT_SETTINGS, **cfg}
    res['integrations'] = {**DEFAULT_INTEGRATIONS, **(cfg.get('integrations') or {})}
    return res

def update_settings(merchant_id: int, patch: Dict[str, Any], actor: str = 'system') -> Dict[str, Any]:
    current = get_settings(merchant_id)
    merged = {**current, **patch}
    if 'integrations' in patch:
        merged['integrations'] = {**current['integrations'], **patch['integrations']}
    update('merchants', merchant_id, {'settings': json.dumps(merged)})
    return merged

def create_user(merchant_id: int, data: Dict[str, Any]) -> int:
    pwd_hash = hash_password(data.get('password') or 'password123')
    name = data.get('name') or data.get('full_name') or 'User'
    phone = data.get('whatsapp') or data.get('phone')
    return insert('users', {
        'merchant_id': merchant_id,
        'name': name,
        'email': data.get('email', '').lower().strip() or None,
        'password_hash': pwd_hash,
        'whatsapp': phone,
        'role': data.get('role', 'accountant'),
        'created_at': now_iso(),
    })

def create_cash_account(merchant_id: int, data: Dict[str, Any], actor: str = 'system') -> int:
    # Callers use both spellings: seed.py/admin.py pass opening_balance, the API
    # passes openingBalance. Accept both so the opening posting is never dropped.
    opening = data.get('openingBalance') if data.get('openingBalance') is not None else data.get('opening_balance')
    opening = opening if isinstance(opening, int) and opening != 0 else (to_poisha(opening) if opening else 0)
    opening_date = data.get('opening_date') or data.get('openingDate') or now_iso()[:10]

    acct_id = insert('cash_accounts', {
        'merchant_id': merchant_id,
        'name': data['name'],
        'kind': data['kind'],
        'is_default': bool(data.get('isDefault', False)),
        'created_at': now_iso(),
    })
    if opening:
        from app.domain.ledger import post
        post({
            'merchant_id': merchant_id,
            'date': opening_date,
            'kind': 'opening_balance',
            'memo': f"Opening balance: {data['name']}",
            'source': 'manual',
            'created_by': actor,
        }, [
            {'account': 'cash', 'party': str(acct_id), 'amount': opening},
            {'account': 'opening_equity', 'party': None, 'amount': -opening},
        ])
    return acct_id

def resolve_cash_account(merchant_id: int, cash_account_id: Optional[int] = None) -> str:
    if cash_account_id:
        return str(cash_account_id)
    default_acct = one("SELECT id FROM cash_accounts WHERE merchant_id = ? AND is_default = 1 LIMIT 1", merchant_id)
    if default_acct:
        return str(default_acct['id'])
    first_acct = one("SELECT id FROM cash_accounts WHERE merchant_id = ? LIMIT 1", merchant_id)
    if first_acct:
        return str(first_acct['id'])
    return "cash"

def create_supplier(merchant_id: int, data: Dict[str, Any], actor: str = 'system') -> int:
    return insert('suppliers', {
        'merchant_id': merchant_id,
        'name': data['name'],
        'phone': data.get('phone'),
        'created_at': now_iso(),
    })
