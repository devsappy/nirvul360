"""WhatsApp Cloud API client."""
import os
import httpx

class DisabledError(Exception):
    pass

async def send_text(phone: str, text: str) -> dict:
    token = os.getenv('WHATSAPP_TOKEN') or os.getenv('WHATSAPP_ACCESS_TOKEN')
    phone_number_id = os.getenv('WHATSAPP_PHONE_NUMBER_ID')
    # settings fallback handled by caller passing? keep env
    if not token or not phone_number_id:
        raise DisabledError('no_credentials')
    url = f"https://graph.facebook.com/v18.0/{phone_number_id}/messages"
    payload = {"messaging_product": "whatsapp", "to": phone, "type": "text", "text": {"body": text}}
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as c:
        r = await c.post(url, json=payload, headers=headers, timeout=30)
        return r.json()