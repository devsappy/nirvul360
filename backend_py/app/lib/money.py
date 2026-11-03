"""
Money helpers: Bangladeshi Taka is stored as integer poisha (1 Taka = 100 poisha). Never float.
Supports standard digits and Bengali numerals.
"""
import re
from typing import Union

BN_DIGITS = '০১২৩৪৫৬৭৮৯'
DIGIT_MAP = {bn: str(i) for i, bn in enumerate(BN_DIGITS)}
REV_DIGIT_MAP = {str(i): bn for i, bn in enumerate(BN_DIGITS)}

def bn_to_ascii_digits(s: str) -> str:
    return ''.join(DIGIT_MAP.get(c, c) for c in str(s))

def ascii_to_bn_digits(s: str) -> str:
    return ''.join(REV_DIGIT_MAP.get(c, c) for c in str(s))

def to_poisha(v: Union[str, int, float, None]) -> int:
    """Parse a Taka string or number into integer poisha."""
    if v is None:
        raise ValueError("amount required")
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return int(round(float(v) * 100))
    
    clean = bn_to_ascii_digits(str(v)).strip()
    clean = re.sub(r'[,৳\s]', '', clean)
    clean = re.sub(r'(tk|taka|টাকা|\/-)$', '', clean, flags=re.IGNORECASE).strip()

    if not clean:
        raise ValueError("empty amount")

    m = re.match(r'^(-)?(\d+)(?:\.(\d{1,2}))?$', clean)
    if not m:
        raise ValueError(f"invalid amount format: {v}")

    sign = -1 if m.group(1) else 1
    taka = int(m.group(2))
    poisha_part = (m.group(3) or '').ljust(2, '0')
    poisha = int(poisha_part[:2]) if poisha_part else 0

    return sign * (taka * 100 + poisha)

def format_taka(poisha: int, show_decimals: bool = True) -> str:
    """Format poisha into Bangladeshi comma-separated Taka (e.g. 1,55,550)."""
    if poisha is None:
        return "৳0"
    sign = "-" if poisha < 0 else ""
    p_abs = abs(poisha)
    taka = p_abs // 100
    sub = p_abs % 100

    # Bangladeshi numbering format: 12,34,567
    s = str(taka)
    if len(s) <= 3:
        formatted = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        chunks = []
        while len(rest) > 2:
            chunks.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            chunks.insert(0, rest)
        formatted = ','.join(chunks) + ',' + last3

    if show_decimals and sub > 0:
        return f"{sign}৳{formatted}.{sub:02d}"
    return f"{sign}৳{formatted}"

def format_taka_bn(poisha: int) -> str:
    return ascii_to_bn_digits(format_taka(poisha))
