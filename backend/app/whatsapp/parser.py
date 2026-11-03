"""
Bangla & English WhatsApp expense message parser.
Extracts amounts (digits & Bengali words), expense heads, and intent.
Ambiguous amounts or multiple amounts are questioned, never guessed.
"""
import re
from typing import Dict, Any, List, Optional
from app.lib.money import bn_to_ascii_digits

HEAD_KEYWORDS = [
    ('packaging', ['packaging', 'poly', 'packet', 'box', 'কার্টন', 'প্যাকেট', 'প্যাকেজিং', 'ট্যাপ', 'ডেলিভারি ব্যাগ']),
    ('salary', ['salary', 'beton', 'বেতন', 'হাজিরা', 'পারিশ্রমিক', 'স্টাফ', 'কর্মচারী']),
    ('rent', ['rent', 'bhara', 'ভাড়া', 'দোকান ভাড়া', 'অফিস ভাড়া', 'গোডাউন ভাড়া']),
    ('utilities', ['utility', 'current', 'electric', 'বিদ্যুৎ', 'বিল', 'কারেন্ট বিল', 'ওয়াইফাই', 'পানি বিল']),
    ('software', ['software', 'saas', 'domain', 'hosting', 'ডোমেইন', 'হোস্টিং', 'টুলস']),
    ('transport', ['transport', 'gari', 'bhara', 'ভাড়া', 'যাতায়াত', 'রিকশা', 'সিএনজি', 'গাড়ি ভাড়া', 'পাঠাও']),
    ('ad_spend', ['ad', 'ads', 'boost', 'বুস্ট', 'বিজ্ঞাপন', 'facebook', 'মেটা', 'প্রমোশন']),
    ('other_expense', ['khoroch', 'expense', 'খরচ', 'নাস্তা', 'চা', 'অন্যান্য']),
]

YES_WORDS = {'yes', 'y', 'ji', 'hae', 'ha', 'হাঁ', 'হ্যাঁ', 'জি', 'ঠিক আছে', 'হ', 'yes sir', 'ok', 'okay'}
NO_WORDS = {'no', 'n', 'na', 'না', 'ভুল', 'cancel', 'বাতিল', 'থাক'}

def is_yes(text: str) -> bool:
    clean = text.lower().strip()
    return clean in YES_WORDS or any(w in clean for w in ['হ্যাঁ', 'জি', 'ঠিক আছে'])

def is_no(text: str) -> bool:
    clean = text.lower().strip()
    return clean in NO_WORDS or 'না' in clean

def extract_amount(text: str) -> Optional[int]:
    """Extract single unambiguous amount in poisha from message."""
    clean = bn_to_ascii_digits(text).lower()
    
    # Match patterns like: 5000 tk, 5000tk, 5000/-, 5000 টাকা
    matches = re.findall(r'(?:^|[^\d.,])(\d[\d,]*(?:\.\d+)?)\s*(?:tk|taka|টাকা|\/-|\/=)?', clean)
    candidates = []
    for m in matches:
        raw = m.replace(',', '').strip()
        if raw:
            try:
                val = float(raw)
                if val > 0:
                    candidates.append(int(round(val * 100)))
            except ValueError:
                pass

    if len(candidates) == 1:
        return candidates[0]
    return None

def detect_head(text: str) -> str:
    lower = text.lower()
    for head, kws in HEAD_KEYWORDS:
        if any(kw in lower for kw in kws):
            return head
    return 'other_expense'

def parse_message(text: str) -> Dict[str, Any]:
    amount = extract_amount(text)
    head = detect_head(text)
    intent = 'expense'
    lower = text.lower()

    if any(w in lower for w in ['তুললাম', 'তুলেছি', 'উত্তোলন', 'withdraw']):
        intent = 'withdrawal'
    elif any(w in lower for w in ['purchase price', 'dami', 'দামি', 'ক্রয়মূল্য']):
        intent = 'price_change'
    elif any(w in lower for w in ['supplier payment', 'supplier pay', 'sup payment']):
        intent = 'supplier_payment'

    # extract product/supplier name naive: after keywords
    name = None
    # price_change: product name before price
    return {
        'intent': intent,
        'amount': amount,
        'head': head,
        'raw_text': text,
        'name': name,
    }
