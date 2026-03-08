#!/usr/bin/env python3
"""
Rebuild Directus Flow for Sentencia WhatsApp notification.
Chain: condition($trigger.payload.estado==Sentencia) → get_expediente → send_whatsapp → mark_not
"""
import urllib.request
import json
import uuid

BASE = "http://localhost:8055"
FLOW_ID = "cc93367d-6cc4-47c8-b094-88d6a52b063f"
TWILIO_SID = "AC2dd91dc7c1f67a1817bc7caab8823f4a"
TWILIO_TOKEN = "1d8ec5318f344c9a4d6948b70c7b6b2f"
TWILIO_FROM = "whatsapp:+14155238886"
DIRECTUS_TOKEN = "n8n_directus_static_token_legal"

import base64
twilio_auth = base64.b64encode(f"{TWILIO_SID}:{TWILIO_TOKEN}".encode()).decode()

def req(method, path, body=None, token=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=15)
        raw = resp.read()
        return json.loads(raw) if raw.strip() else {}
    except urllib.error.HTTPError as e:
        body_err = e.read().decode()
        print(f"  HTTP {e.code} on {method} {path}: {body_err[:300]}")
        raise

# --- Auth ---
print("=== Authenticating ===")
resp = req("POST", "/auth/login", {"email": "admin@toxirodigital.cloud", "password": "admin"})
TOKEN = resp["data"]["access_token"]
print(f"  Token: {TOKEN[:20]}...")

# --- Step 1: Get current ops and delete them ---
print("\n=== Clearing existing ops ===")
ops_resp = req("GET", f"/operations?filter[flow][_eq]={FLOW_ID}&fields=id,key,resolve,reject", token=TOKEN)
ops = ops_resp["data"]
print(f"  Found {len(ops)} ops: {[o['key'] for o in ops]}")

# First: null all resolve/reject to remove FK constraints
for op in ops:
    if op.get("resolve") or op.get("reject"):
        req("PATCH", f"/operations/{op['id']}", {"resolve": None, "reject": None}, token=TOKEN)
        print(f"  Nulled resolves for {op['key']}")

# Also null the flow's entry operation
req("PATCH", f"/flows/{FLOW_ID}", {"operation": None}, token=TOKEN)
print("  Nulled flow.operation")

# Delete all ops (returns 204 No Content on success)
for op in ops:
    try:
        req("DELETE", f"/operations/{op['id']}", token=TOKEN)
        print(f"  Deleted op {op['key']}")
    except Exception as e:
        print(f"  Could not delete {op['key']}: {e} (may already be gone, continuing)")

# --- Step 2: Create new ops ---
print("\n=== Creating new ops ===")

# IDs
id_cond = str(uuid.uuid4())
id_get  = str(uuid.uuid4())
id_send = str(uuid.uuid4())
id_mark = str(uuid.uuid4())

print(f"  condition: {id_cond}")
print(f"  get_exp:   {id_get}")
print(f"  send_wsp:  {id_send}")
print(f"  mark_not:  {id_mark}")

# OP 4: mark_not — PATCH expediente notificado_sentencia=true
mark_not = req("POST", "/operations", {
    "id": id_mark,
    "key": "mark_not",
    "type": "request",
    "flow": FLOW_ID,
    "resolve": None,
    "reject": None,
    "position_x": 800,
    "position_y": 200,
    "options": {
        "url": f"http://api-legal:8055/items/expedientes/{{{{get_expediente.data.id}}}}",
        "method": "PATCH",
        "headers": [
            {"header": "Authorization", "value": f"Bearer {DIRECTUS_TOKEN}"},
            {"header": "Content-Type",  "value": "application/json"}
        ],
        "body": json.dumps({
            "notificado_sentencia": True,
            "fecha_notificacion_sentencia": "{{$now}}"
        })
    }
}, token=TOKEN)
print(f"  Created mark_not: {mark_not['data']['id'][:8]}...")

# OP 3: send_whatsapp — POST to Twilio (body as object → axios serializes to form-encoded)
send_wsp = req("POST", "/operations", {
    "id": id_send,
    "key": "send_whatsapp",
    "type": "request",
    "flow": FLOW_ID,
    "resolve": id_mark,
    "reject": None,
    "position_x": 600,
    "position_y": 200,
    "options": {
        "url": f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json",
        "method": "POST",
        "headers": [
            {"header": "Authorization",  "value": f"Basic {twilio_auth}"},
            {"header": "Content-Type",   "value": "application/x-www-form-urlencoded"}
        ],
        # Body as OBJECT so axios serializes + properly URL-encodes
        "body": {
            "From": TWILIO_FROM,
            "To":   "whatsapp:{{get_expediente.data.cliente_id.telefono}}",
            "Body": "Estimado {{get_expediente.data.cliente_id.nombre}}, su expediente N\u00b0 {{get_expediente.data.n_causa}} ha recibido sentencia. Contacte a su abogado para m\u00e1s detalles."
        }
    }
}, token=TOKEN)
print(f"  Created send_whatsapp: {send_wsp['data']['id'][:8]}...")

# OP 2: get_expediente — GET expediente with client phone
get_exp = req("POST", "/operations", {
    "id": id_get,
    "key": "get_expediente",
    "type": "request",
    "flow": FLOW_ID,
    "resolve": id_send,
    "reject": None,
    "position_x": 400,
    "position_y": 200,
    "options": {
        "url": "http://api-legal:8055/items/expedientes/{{$trigger.keys[0]}}?fields=id,n_causa,estado,notificado_sentencia,cliente_id.nombre,cliente_id.telefono",
        "method": "GET",
        "headers": [
            {"header": "Authorization", "value": f"Bearer {DIRECTUS_TOKEN}"}
        ]
    }
}, token=TOKEN)
print(f"  Created get_expediente: {get_exp['data']['id'][:8]}...")

# OP 1: condition — only proceed when payload.estado == "Sentencia"
# Using $trigger.payload.estado filter (not $trigger.keys, not get_ data)
cond = req("POST", "/operations", {
    "id": id_cond,
    "key": "check_sentencia",
    "type": "condition",
    "flow": FLOW_ID,
    "resolve": id_get,   # on pass → get expediente
    "reject": None,      # on fail → stop
    "position_x": 200,
    "position_y": 200,
    "options": {
        "filter": {
            "$trigger": {
                "payload": {
                    "estado": {"_eq": "Sentencia"}
                }
            }
        }
    }
}, token=TOKEN)
print(f"  Created condition: {cond['data']['id'][:8]}...")

# --- Step 3: Set flow entry point ---
print("\n=== Setting flow entry point ===")
req("PATCH", f"/flows/{FLOW_ID}", {"operation": id_cond, "status": "active"}, token=TOKEN)
print(f"  Flow entry = check_sentencia ({id_cond[:8]}...)")

# --- Verify ---
print("\n=== Final verification ===")
ops_final = req("GET", f"/operations?filter[flow][_eq]={FLOW_ID}&fields=id,key,type,resolve", token=TOKEN)
flow_final = req("GET", f"/flows/{FLOW_ID}?fields=name,status,operation", token=TOKEN)
print(f"  Flow: {flow_final['data']['name']} | {flow_final['data']['status']} | entry={flow_final['data']['operation'][:8]}...")
for op in ops_final["data"]:
    res = op['resolve'][:8]+'...' if op.get('resolve') else 'None'
    print(f"  [{op['key']}] type={op['type']} → {res}")

print("\n=== DONE ===")
print("Chain: check_sentencia → get_expediente → send_whatsapp → mark_not")
print("Logic: condition passes only when PATCH payload has estado=Sentencia")
print("       mark_not's PATCH has {notificado_sentencia:true} in payload → no estado → condition fails → no loop")
