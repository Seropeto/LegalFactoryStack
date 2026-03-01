
const API_URL = 'http://localhost:8055';
const ADMIN_EMAIL = 'admin@toxirodigital.cloud';
const ADMIN_PASSWORD = 'admin';

async function setup() {
    console.log("Iniciando configuración de Directus...");
    try {
        // 1. Obtener Token de Admin
        const loginRes = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        });
        const loginData = await loginRes.json();
        if (!loginRes.ok) throw new Error("Fallo en login: " + JSON.stringify(loginData));
        const token = loginData.data.access_token;
        console.log("Token obtenido con éxito.");

        // 2. Crear Colección 'documentos'
        console.log("Creando colección 'documentos'...");
        const collRes = await fetch(`${API_URL}/collections`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                collection: 'documentos',
                schema: {},
                meta: {
                    icon: 'description',
                    display_template: '{{nombre}}'
                }
            })
        });
        const collData = await collRes.json();
        if (collRes.ok) {
            console.log("Colección creada.");
        } else {
            console.log("La colección ya podría existir:", collData.errors?.[0]?.message);
        }

        // 3. Crear Campos
        const fields = [
            { field: 'nombre', type: 'string', meta: { interface: 'input' } },
            { field: 'archivo', type: 'uuid', meta: { interface: 'file' }, schema: { foreign_key_column: 'id', foreign_key_table: 'directus_files' } },
            { field: 'expediente_id', type: 'uuid', meta: { interface: 'select-relational' }, schema: { foreign_key_column: 'id', foreign_key_table: 'expedientes' } }
        ];

        for (const f of fields) {
            console.log(`Creando campo '${f.field}'...`);
            const fieldRes = await fetch(`${API_URL}/fields/documentos`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(f)
            });
            if (fieldRes.ok) console.log(`Campo '${f.field}' creado.`);
            else console.log(`Nota sobre campo '${f.field}':`, (await fieldRes.json()).errors?.[0]?.message);
        }

        // 4. Configurar Permisos Públicos
        console.log("Configurando permisos para rol Público...");
        // Obtener ID del rol Público
        const rolesRes = await fetch(`${API_URL}/roles`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const rolesData = await rolesRes.json();
        const publicRole = rolesData.data.find(r => r.name === 'Public');

        if (publicRole) {
            const permissions = [
                { collection: 'documentos', action: 'create', permissions: {}, validation: {}, fields: ['*'] },
                { collection: 'documentos', action: 'read', permissions: {}, validation: {}, fields: ['*'] },
                { collection: 'directus_files', action: 'create', permissions: {}, validation: {}, fields: ['*'] },
                { collection: 'directus_files', action: 'read', permissions: {}, validation: {}, fields: ['*'] },
                { collection: 'expedientes', action: 'read', permissions: {}, validation: {}, fields: ['*'] }
            ];

            for (const p of permissions) {
                p.role = publicRole.id;
                const pRes = await fetch(`${API_URL}/permissions`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(p)
                });
                if (pRes.ok) console.log(`Permiso '${p.action}' en '${p.collection}' creado.`);
                else console.log(`Nota sobre permiso '${p.action}' en '${p.collection}':`, (await pRes.json()).errors?.[0]?.message);
            }
            console.log("Permisos configurados.");
        }

        console.log("¡Todo listo! Directus ha sido configurado.");

    } catch (err) {
        console.error("ERROR:", err.message);
    }
}

setup();
