#!/usr/bin/env python3
"""Fix double-data template bug in Directus Flow ops."""
import urllib.request, json, base64, time

BASE = "http://localhost:8055"
FLOW_ID = "cc93367d-6cc4-47c8-b094-88d6a52b063f"
TWILIO_SID = "YOUR_TWILIO_SID"
TWILIO_TOKEN = "YOUR_TWILIO_AUTH_TOKEN"
TWILIO_FROM = "whatsapp:+14155238886"
DIRECTUS_TOKEN = "n8n_directus_static_token_legal"
twilio_auth = base64.b64encode((TWILIO_SID + ":" + TWILIO_TOKEN).encode()).decode()

# mark_not body with $now template
mark_body = '{"notificado_sentencia": true, "fecha_notificacion_sentencia": "{{$now}}"}'

def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=hdrs, method=method)
    try:
        raw = urllib.request.urlopen(r, timeout=15).read()
        return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  ERR {e.code}: {err[:300]}")
        raise

# Auth
token = api("POST", "/auth/login", {"email": "admin@toxirodigital.cloud", "password": "admin"})["data"]["access_token"]
print("Authenticated")

# Get ops
ops = api("GET", f"/operations?filter[flow][_eq]={FLOW_ID}&fields=id,key,type", token=token)["data"]
for op in ops:
    print(f"  Found: [{op['key']}] type={op['type']}")

# Fix send_whatsapp: body templates use .data.data. (double nesting for Directus API response)
for op in ops:
    if op["key"] == "send_whatsapp":
        print("\nFixing send_whatsapp templates...")
        api("PATCH", f"/operations/{op['id']}", {
            "options": {
                "url": f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
                "method": "POST",
                "headers": [
                    {"header": "Authorization", "value": f"Basic {twilio_auth}"},
                    {"header": "Content-Type",  "value": "application/x-www-form-urlencoded"}
                ],
                # Use .data.data. because Directus wraps response: { data: { data: { ...item } } }
                "body": {
                    "From": TWILIO_FROM,
                    "To":   "whatsapp:{{get_expediente.data.data.cliente_id.telefono}}",
                    "Body": "Estimado {{get_expediente.data.data.cliente_id.nombre}}, su expediente N {{get_expediente.data.data.n_causa}} ha recibido sentencia. Contacte a su abogado para mas detalles."
                }
            }
        }, token=token)
        print("  send_whatsapp fixed - To: whatsapp:{{get_expediente.data.data.cliente_id.telefono}}")

    elif op["key"] == "mark_not":
        print("\nFixing mark_not URL template...")
        api("PATCH", f"/operations/{op['id']}", {
            "options": {
                "url": "http://api-legal:8055/items/expedientes/{{get_expediente.data.data.id}}",
                "method": "PATCH",
                "headers": [
                    {"header": "Authorization", "value": f"Bearer {DIRECTUS_TOKEN}"},
                    {"header": "Content-Type",  "value": "application/json"}
                ],
                "body": mark_body
            }
        }, token=token)
        print("  mark_not fixed - URL uses {{get_expediente.data.data.id}}")

print("\nAll templates fixed. The .data.data. path is required because:")
print("  Directus GET /items/X/{id} returns: { data: { id: ..., ... } }")
print("  Request op wraps that as:           { status, headers, data: { data: { id: ..., ... } } }")
print("  So full path is: get_expediente.data.data.id")
