
const API_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@toxirodigital.cloud';
const ADMIN_PASSWORD = 'admin';

async function setupWebhooks() {
    console.log("=== CONFIGURANDO WEBHOOK DE ESTADO (n8n) ===");
    try {
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });
        const loginData = await loginRes.json();
        const token = loginData.data.access_token;

        const webhooks = [
            {
                name: 'n8n Cambio Estado Expediente',
                method: 'POST',
                url: 'http://n8n-legal:5678/webhook/cambio-estado',
                status: 'active',
                actions: ['update'],
                collections: ['expedientes'],
                data: true
            }
        ];

        for (const wh of webhooks) {
            console.log(`\nCreando Webhook: ${wh.name}...`);
            const res = await fetch(`${API_URL}/webhooks`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(wh)
            });
            const data = await res.json();
            if (res.ok) {
                console.log(`[OK] Webhook configurado.`);
            } else {
                console.log(`[Nota] ${data.errors?.[0]?.message || 'Ya existe o error de conexión'}`);
            }
        }

        console.log("\n=== CONEXIÓN ESTABLECIDA PARA EXPEDIENTES ===");

    } catch (err) {
        console.error("ERROR:", err.message);
    }
}

setupWebhooks();
