"""
WhatsApp Assistant Conversation Loop.
2-Step Confirmation State Machine:
1. Message -> parse -> draft stored (NOT in ledger) -> confirmation in Bengali
2. "হ্যাঁ" -> written to double-entry ledger with source 'whatsapp_confirmed'
3. "না" -> discarded
"""
import json
from typing import Dict, Any, List
from app.db.session import insert, update, one, all, tx
from app.lib.dates import now_iso, today
from app.lib.money import format_taka, format_taka_bn
from app.domain.accounts import ACCOUNTS
from app.domain.entries import record_expense, record_withdrawal
from app.domain.reports import profit_and_loss
from app.whatsapp.parser import parse_message, is_yes, is_no
from app.lib.events import event_bus

HEAD_BN = {
    'packaging': 'প্যাকেজিং ও ব্যাগ',
    'salary': 'বেতন ও মজুরি',
    'rent': 'দোকান/অফিস ভাড়া',
    'utilities': 'বিদ্যুৎ ও অন্যান্য বিল',
    'software': 'সফটওয়্যার ও ডোমেইন',
    'transport': 'যাতায়াত ও ভাড়া',
    'ad_spend': 'বিজ্ঞাপন ও বুস্টিং',
    'other_expense': 'অন্যান্য সাধারণ খরচ',
}

async def handle_incoming(from_phone: str, text: str) -> List[str]:
    clean_phone = from_phone.replace('+', '').strip()
    user = one("SELECT * FROM users WHERE whatsapp = ? OR whatsapp LIKE ?", clean_phone, f"%{clean_phone[-10:]}")
    if not user:
        return [f"দুঃখিত, এই নম্বরটি ({from_phone}) কোনো মার্চেন্ট অ্যাকাউন্টের সাথে যুক্ত নেই। Settings থেকে WhatsApp নম্বরটি যোগ করুন।"]

    merchant_id = user['merchant_id']

    # 1. Check for pending draft
    pending = one(
        "SELECT * FROM whatsapp_drafts WHERE user_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1",
        user['id']
    )

    if pending:
        if is_yes(text):
            return [commit_draft(user, pending)]
        elif is_no(text):
            update('whatsapp_drafts', pending['id'], {'status': 'rejected', 'decided_at': now_iso()})
            return ["❌ এন্ট্রি বাতিল করা হয়েছে। কোনো তথ্য লেজারে লেখা হয়নি।"]

    # 2. Check for queries
    if any(q in text.lower() for q in ['হিসাব', 'আজকের প্রফিট', 'summary', 'আজকের লাভ', 'আজকের হিসাব']):
        pnl = profit_and_loss(merchant_id, today(), today())
        sales = format_taka_bn(pnl['gross_sales'])
        cogs = format_taka_bn(pnl['cogs'])
        net = format_taka_bn(pnl['net_profit'])
        sign = "লাভ" if pnl['net_profit'] >= 0 else "লোকসান"
        return [f"📊 আজকের সংক্ষিপ্ত হিসাব:\n• ডেলিভারি সেলস: {sales}\n• পণ্যের ক্রয়মূল্য (COGS): {cogs}\n• আজকের নিট {sign}: {net}"]

    # 3. Parse new expense message
    parsed = parse_message(text)
    if not parsed['amount']:
        return ["টাকার পরিমাণ বুঝতে পারিনি। অনুগ্রহ করে টাকার অঙ্ক স্পষ্টভাবে লিখুন (যেমন: 'packaging 500 tk' বা 'ভাড়া ১৫০০০ টাকা')।"]

    draft_payload = {
        'intent': parsed['intent'],
        'amount': parsed['amount'],
        'head': parsed['head'],
        'date': today(),
        'note': f"WhatsApp: {text}",
    }

    draft_id = insert('whatsapp_drafts', {
        'merchant_id': merchant_id,
        'user_id': user['id'],
        'status': 'pending',
        'stage': 'confirm',
        'intent': parsed['intent'],
        'draft': json.dumps(draft_payload),
        'raw_text': text,
        'parser': 'regex',
        'created_at': now_iso(),
    })

    taka_str = format_taka_bn(parsed['amount'])
    head_name = HEAD_BN.get(parsed['head'], parsed['head'])

    return [
        f"📝 এই এন্ট্রিটি ড্রাফট করা হয়েছে:\n"
        f"  খাত: {head_name}\n"
        f"  পরিমাণ: {taka_str}\n"
        f"  তারিখ: {today()}\n\n"
        f"নিশ্চিত করতে 'হ্যাঁ' লিখুন, অথবা বাতিল করতে 'না' লিখুন।"
    ]

def commit_draft(user: Dict[str, Any], pending: Dict[str, Any]) -> str:
    m = user['merchant_id']
    d = json.loads(pending['draft']) if isinstance(pending['draft'], str) else pending['draft']
    ctx = {'source': 'whatsapp_confirmed', 'actor': f"user:{user['id']}", 'draft_id': pending['id']}

    with tx():
        if d['intent'] == 'expense':
            jid = record_expense(m, {'head': d['head'], 'amount': d['amount'], 'date': d['date'], 'note': d['note']}, ctx)
            ref = f"জার্নাল #{jid}"
            from app.domain.exceptions import raised_unmatched_expense
            if d['head'] == 'other_expense':
                # Category could not be determined from the message: posted to
                # 'other_expense' for now, and the queue asks the merchant to assign
                # the right financial head.
                raised_unmatched_expense(m, d['amount'], jid, d.get('note') or '', f"user:{user['id']}")
        elif d['intent'] == 'withdrawal':
            jid = record_withdrawal(m, {'amount': d['amount'], 'date': d['date'], 'note': d['note']}, ctx)
            ref = f"উত্তোলন #{jid}"
        else:
            raise ValueError(f"unknown intent {d['intent']}")

        update('whatsapp_drafts', pending['id'], {'status': 'confirmed', 'decided_at': now_iso(), 'result_ref': ref})

    event_bus.broadcast('whatsapp_confirmed', {'ref': ref, 'intent': d['intent']}, m)
    return f"✅ লিখে রাখা হয়েছে ({ref})। ড্যাশবোর্ডে 'WhatsApp' ট্যাগসহ দেখা যাবে।"
