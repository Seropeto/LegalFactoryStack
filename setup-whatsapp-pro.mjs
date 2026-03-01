
const WALINK_URL = 'http://127.0.0.1:8080';
const API_KEY = 'secret_api_key_legal';
const INSTANCE_NAME = 'toxiro_prime';
import fs from 'fs';

async function nuclearSetup() {
    console.log("=== VINCULACIÓN WHATSAPP PRIME (Híbrida v2.2.0) ===");

    // 1. Espera de arranque del servidor
    process.stdout.write("Despertando al servidor (Paciencia Prime)... ");
    let ok = false;
    for (let i = 0; i < 30; i++) {
        try {
            const r = await fetch(`${WALINK_URL}/instance/fetchInstances`, { headers: { apikey: API_KEY } });
            if (r.ok) { ok = true; break; }
        } catch (e) { }
        process.stdout.write(".");
        await new Promise(r => setTimeout(r, 2000));
    }
    if (!ok) { console.log("\n[ERROR] El servidor no responde."); return; }
    console.log("\n[OK] Servidor en línea.");

    // 2. Limpieza total
    async function cleanup() {
        console.log("Limpiando cualquier rastro anterior...");
        try {
            await fetch(`${WALINK_URL}/instance/logout/${INSTANCE_NAME}`, { method: 'DELETE', headers: { apikey: API_KEY } });
            await fetch(`${WALINK_URL}/instance/delete/${INSTANCE_NAME}`, { method: 'DELETE', headers: { apikey: API_KEY } });
        } catch (e) { }
    }
    await cleanup();

    // 3. Creación con QR Habilitado
    console.log("Creando instancia Prime...");
    let createRes = await fetch(`${WALINK_URL}/instance/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: API_KEY },
        body: JSON.stringify({
            instanceName: INSTANCE_NAME,
            token: 'token_legal_123',
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS'
        })
    });

    if (!createRes.ok) {
        console.log("[AVISO] La creación devolvió un aviso.");
    } else {
        console.log("[OK] Instancia creada. Entrando en modo de espera estratégica...");
    }

    // 4. Pausa de asentamiento (Baileys necesita tiempo en Windows para abrir el socket)
    await new Promise(r => setTimeout(r, 10000));

    // 5. Polling Pasivo
    console.log("Monitorizando generación de QR...");
    for (let i = 1; i <= 40; i++) {
        process.stdout.write(`\rIntento ${i}/40... `);
        try {
            const instancesRes = await fetch(`${WALINK_URL}/instance/fetchInstances`, {
                headers: { apikey: API_KEY }
            });
            const instances = await instancesRes.json();
            const me = instances.find(ins => ins.name === INSTANCE_NAME);

            if (me) {
                const qrCode = me.qrcode?.base64 || me.base64;

                if (qrCode) {
                    console.log("\n\n!!! ÉXITO: CÓDIGO QR PRIME CAPTURADO (HÍBRIDO) !!!");
                    const html = `<html><body style="display:flex;justify-content:center;align-items:center;height:100vh;background:#030712;font-family:sans-serif;color:white;">
                        <div style="background:#111827;padding:70px;border-radius:50px;text-align:center;box-shadow:0 0 100px rgba(16,185,129,0.2);border:1px solid #1f2937;">
                            <h1 style="color:#10b981;font-size:3.5em;margin-bottom:10px;text-transform:uppercase;letter-spacing:4px;font-weight:900;">Toxiro Prime</h1>
                            <p style="color:#9ca3af;margin-bottom:50px;font-size:1.3em;letter-spacing:1px;">CONFIGURACIÓN HÍBRIDA MAESTRA</p>
                            <div style="background:white;padding:30px;border-radius:30px;display:inline-block;box-shadow:0 0 50px rgba(16,185,129,0.4);">
                                <img src="${qrCode}" style="width:360px;" />
                            </div>
                            <div style="margin-top:50px;padding:25px;background:#1f2937;border-radius:20px;font-size:1em;color:#d1d5db;border-left:5px solid #10b981;">
                                <b>ID:</b> ${INSTANCE_NAME}<br>
                                <span style="font-size:0.9em;opacity:0.7;">Escanea ahora para estabilizar la conexión</span>
                            </div>
                        </div></body></html>`;
                    fs.writeFileSync('qr-whatsapp.html', html);
                    console.log("¡LO TENEMOS! ABRE: C:\\proyectos\\ToxiroAbogados\\qr-whatsapp.html");
                    return;
                }

                if (me.connectionStatus === 'open') {
                    console.log("\n[OK] El bot ya está conectado.");
                    return;
                }
            }
        } catch (e) { }
        await new Promise(r => setTimeout(r, 5000));
    }

    console.log("\n[FINAL] No se obtuvo el QR. Revisa 'docker logs whatsapp-api-factory'.");
}

nuclearSetup();
