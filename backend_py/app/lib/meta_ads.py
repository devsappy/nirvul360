import os
from typing import Dict, Any, List, Optional


class DisabledError(Exception):
    pass


def _creds(settings: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    meta = (settings or {}).get('meta') or (settings or {}).get('integrations', {}).get('meta_ads')
    if not meta:
        token = os.environ.get('META_ADS_TOKEN')
        account = os.environ.get('META_ADS_ACCOUNT_ID')
        if token and account:
            return {'access_token': token, 'account_id': account}
        return None
    token = meta.get('access_token') or meta.get('accessToken') or os.environ.get('META_ADS_TOKEN')
    account = meta.get('account_id') or meta.get('ad_account_id') or meta.get('adAccountId') or os.environ.get('META_ADS_ACCOUNT_ID')
    if not token or not account:
        return None
    return {'access_token': token, 'account_id': account}


async def fetch_spend(settings: Dict[str, Any], from_date: str, to_date: str) -> List[Dict[str, Any]]:
    creds = _creds(settings)
    if not creds:
        raise DisabledError('meta not configured')
    token = creds['access_token']
    acct = creds['account_id']
    if not str(acct).startswith('act_'):
        acct = f"act_{acct}"
    out: List[Dict[str, Any]] = []
    url = f"https://graph.facebook.com/v19.0/{acct}/insights"
    params = {
        'access_token': token,
        'level': 'campaign',
        'time_range': f'{{"since":"{from_date}","until":"{to_date}"}}',
        'fields': 'date_start,campaign_name,spend',
        'limit': 100,
    }
    import httpx
    async with httpx.AsyncClient(timeout=30.0) as client:
        next_url = url
        pages = 0
        while next_url and pages < 3:
            pages += 1
            r = await client.get(next_url, params=params if next_url == url else None)
            r.raise_for_status()
            data = r.json()
            for row in data.get('data', []):
                out.append({
                    'date': row.get('date_start'),
                    'amount': float(row.get('spend') or 0),
                    'campaign': row.get('campaign_name'),
                })
            next_url = (data.get('paging') or {}).get('next')
            params = None
    return out