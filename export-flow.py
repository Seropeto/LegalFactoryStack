#!/usr/bin/env python3
"""Export Directus Flow for Sentencia notification to infra/directus-flow-sentencia.json"""
import urllib.request, json

BASE = "http://localhost:8055"
FLOW_ID = "cc93367d-6cc4-47c8-b094-88d6a52b063f"

def api(method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=hdrs, method=method)
    raw = urllib.request.urlopen(r, timeout=15).read()
    return json.loads(raw) if raw.strip() else {}

# Auth
token = api("POST", "/auth/login", {"email": "admin@toxirodigital.cloud", "password": "admin"})["data"]["access_token"]

# Get flow
flow = api("GET", f"/flows/{FLOW_ID}", token=token)["data"]

# Get ops sorted by position
ops = api("GET", f"/operations?filter[flow][_eq]={FLOW_ID}&sort[]=position_x&limit=-1", token=token)["data"]

export = {
    "_comment": "Directus Flow: Notificacion WhatsApp al dictar Sentencia (via Twilio)",
    "_architecture": "check_sentencia(condition) -> get_expediente(request) -> send_whatsapp(request) -> mark_not(item-update)",
    "_note": "exec op NOT AVAILABLE in standard Directus Docker image (isolated-vm missing). Use request+item-update ops instead.",
    "_bugs_fixed": [
        "exec op: isolated-vm not installed in docker image -> use request+item-update instead",
        "body templates: Directus wraps API response as {data:{data:{...}}} -> use .data.data. path",
        "infinite loop: item-update with emitEvents:false prevents re-triggering the flow",
        "condition filter: use {\"$trigger\":{\"payload\":{\"estado\":{\"_eq\":\"Sentencia\"}}}} syntax"
    ],
    "flow": {
        "id": flow["id"],
        "name": flow["name"],
        "status": flow["status"],
        "trigger": flow["trigger"],
        "options": flow["options"],
        "operation": flow["operation"]
    },
    "operations": [
        {
            "id": op["id"],
            "key": op["key"],
            "name": op.get("name", op["key"]),
            "type": op["type"],
            "flow": op["flow"],
            "resolve": op.get("resolve"),
            "reject": op.get("reject"),
            "position_x": op.get("position_x", 0),
            "position_y": op.get("position_y", 0),
            "options": op.get("options", {})
        }
        for op in ops
    ]
}

output = json.dumps(export, indent=2, ensure_ascii=False)
with open("infra/directus-flow-sentencia.json", "w", encoding="utf-8") as f:
    f.write(output)

print(f"Exported {len(ops)} ops to infra/directus-flow-sentencia.json")
for op in ops:
    resolve = op.get("resolve", "")[:8] + "..." if op.get("resolve") else "END"
    print(f"  [{op['key']}] type={op['type']} -> {resolve}")
