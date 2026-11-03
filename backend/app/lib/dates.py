"""
Date and timezone helpers for Asia/Dhaka (UTC+6).
Accounting dates are strictly 'YYYY-MM-DD'. Timestamps are ISO-8601 UTC.
"""
from datetime import datetime, timezone, timedelta, date

DHAKA_OFFSET = timedelta(hours=6)
DHAKA_TZ = timezone(DHAKA_OFFSET)

_clock_override = None

def set_clock(fn):
    global _clock_override
    _clock_override = fn

def reset_clock():
    global _clock_override
    _clock_override = None

def now_utc() -> datetime:
    if _clock_override:
        return _clock_override()
    return datetime.now(timezone.utc)

def now_iso() -> str:
    return now_utc().strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'

def dhaka_now() -> datetime:
    return now_utc().astimezone(DHAKA_TZ)

def today() -> str:
    return dhaka_now().strftime('%Y-%m-%d')

def dhaka_time() -> str:
    return dhaka_now().strftime('%H:%M')

def month_start(d_str: str) -> str:
    return f"{d_str[:7]}-01"

def month_end(d_str: str) -> str:
    year = int(d_str[:4])
    month = int(d_str[5:7])
    if month == 12:
        next_m = date(year + 1, 1, 1)
    else:
        next_m = date(year, month + 1, 1)
    end_d = next_m - timedelta(days=1)
    return end_d.strftime('%Y-%m-%d')

def add_days(d_str: str, days: int) -> str:
    d = datetime.strptime(d_str, '%Y-%m-%d').date() + timedelta(days=days)
    return d.strftime('%Y-%m-%d')

def is_iso_date(s: str) -> bool:
    if not isinstance(s, str) or len(s) != 10:
        return False
    try:
        datetime.strptime(s, '%Y-%m-%d')
        return True
    except ValueError:
        return False
