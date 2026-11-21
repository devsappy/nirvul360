"""
Bangla & English WhatsApp expense message parser.
Extracts amounts (digits & Bengali words), expense heads, and intent.
Ambiguous amounts or multiple amounts are questioned, never guessed.
"""
import os
import json
import re
from typing import Dict, Any, List, Optional
import httpx
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
    if clean in NO_WORDS:
        return True
    tokens = set(re.split(r'[\s,।!?-]+', clean))
    return 'না' in tokens or bool(tokens & NO_WORDS)

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

async def parse_message_llm(text: str) -> Optional[Dict[str, Any]]:
    """
    Parse informal WhatsApp expense and withdrawal messages in Bangla, Banglish, or English using OpenAI.
    """
    key = os.getenv("OPENAI_API_KEY")
    if not key or key.strip() in ("", "your_openai_api_key"):
        return None

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    system_prompt = (
        "You are an expert accounting assistant for Bangladeshi e-commerce and retail merchants. "
        "Analyze informal WhatsApp messages in Bengali, Banglish, or English. "
        "Extract financial transactions (expenses, withdrawals, price changes). "
        "Categories (head): 'packaging', 'salary', 'rent', 'utilities', 'software', 'transport', 'ad_spend', 'other_expense'. "
        "Amount: extract total amount in Bangladeshi Taka as a float (e.g. 500.0, 5000.0 for '5k', 150.0 for 'দেড়শ টাকা'). "
        "If no transaction or amount is mentioned, amount_taka should be null. "
        "Return pure JSON format: "
        '{"intent": "expense"|"withdrawal"|"price_change"|"supplier_payment"|"other", '
        '"amount_taka": float|null, '
        '"head": string, '
        '"note": string}'
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key.strip()}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": text},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.0,
                },
            )
            if resp.status_code == 200:
                result = resp.json()
                content = result["choices"][0]["message"]["content"]
                parsed = json.loads(content)
                amt_taka = parsed.get("amount_taka")
                amt_poisha = int(round(float(amt_taka) * 100)) if amt_taka is not None else None
                head = parsed.get("head")
                valid_heads = {'packaging', 'salary', 'rent', 'utilities', 'software', 'transport', 'ad_spend', 'other_expense'}
                if head not in valid_heads:
                    head = 'other_expense'
                return {
                    'intent': parsed.get('intent', 'expense'),
                    'amount': amt_poisha,
                    'head': head,
                    'note': parsed.get('note') or text,
                    'raw_text': text,
                    'name': None,
                    'parser': 'llm_openai',
                }
    except Exception:
        return None
    return None
