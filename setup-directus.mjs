
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

        // 2. Crear Colección 'documentos' si no existe
        console.log("Verificando colección 'documentos'...");
        const collRes = await fetch(`${API_URL}/collections`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                collection: 'documentos',
                schema: {},
                meta: { icon: 'description', display_template: '{{nombre}}' }
            })
        });
        const collData = await collRes.json();
        if (collRes.ok) {
            console.log("Colección 'documentos' creada.");
        } else {
            console.log("Colección 'documentos' ya existe (OK).");
        }

        // 3. Crear Campos de 'documentos'
        const fields = [
            { field: 'nombre', type: 'string', meta: { interface: 'input' } },
            { field: 'archivo', type: 'uuid', meta: { interface: 'file' }, schema: { foreign_key_column: 'id', foreign_key_table: 'directus_files' } },
            { field: 'expediente_id', type: 'uuid', meta: { interface: 'select-relational' }, schema: { foreign_key_column: 'id', foreign_key_table: 'expedientes' } }
        ];

        for (const f of fields) {
            const fieldRes = await fetch(`${API_URL}/fields/documentos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(f)
            });
            if (fieldRes.ok) console.log(`Campo '${f.field}' creado.`);
            else console.log(`Campo '${f.field}' ya existe (OK).`);
        }

        // 4. Obtener ID de la política pública (Directus 11)
        console.log("\nObteniendo política pública...");
        const policiesRes = await fetch(`${API_URL}/policies?limit=20`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const policiesData = await policiesRes.json();

        // Buscar política pública por nombre o por ser la única sin admin_access
        const publicPolicy = policiesData.data.find(p =>
            p.name === '$t:public_label' ||
            (!p.admin_access && !p.app_access && p.name?.toLowerCase().includes('public'))
        ) || policiesData.data.find(p => !p.admin_access && !p.app_access);

        if (!publicPolicy) {
            throw new Error("No se encontró la política pública de Directus");
        }
        console.log(`Política pública encontrada: ${publicPolicy.name} (${publicPolicy.id})`);

        // 5. Configurar permisos para todas las colecciones del sistema
        const permisos = [
            // Clientes: lectura para login por RUT, escritura para crear y actualizar clave
            { collection: 'clientes', action: 'read' },
            { collection: 'clientes', action: 'create' },
            { collection: 'clientes', action: 'update' },
            // Expedientes: CRUD completo
            { collection: 'expedientes', action: 'read' },
            { collection: 'expedientes', action: 'create' },
            { collection: 'expedientes', action: 'update' },
            { collection: 'expedientes', action: 'delete' },
            // Actuaciones: lectura y creación
            { collection: 'actuaciones', action: 'read' },
            { collection: 'actuaciones', action: 'create' },
            { collection: 'actuaciones', action: 'update' },
            { collection: 'actuaciones', action: 'delete' },
            // Plazos: CRUD completo
            { collection: 'plazos', action: 'read' },
            { collection: 'plazos', action: 'create' },
            { collection: 'plazos', action: 'update' },
            { collection: 'plazos', action: 'delete' },
            // Documentos: CRUD completo
            { collection: 'documentos', action: 'read' },
            { collection: 'documentos', action: 'create' },
            { collection: 'documentos', action: 'update' },
            { collection: 'documentos', action: 'delete' },
            // Archivos: lectura y creación para documentos
            { collection: 'directus_files', action: 'read' },
            { collection: 'directus_files', action: 'create' },
        ];

        console.log("\nConfigurando permisos...");
        let creados = 0;
        let existentes = 0;

        for (const p of permisos) {
            const pRes = await fetch(`${API_URL}/permissions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    policy: publicPolicy.id,
                    collection: p.collection,
                    action: p.action,
                    permissions: {},
                    validation: {},
                    fields: ['*']
                })
            });
            if (pRes.ok) {
                creados++;
            } else {
                const err = await pRes.json();
                if (err.errors?.[0]?.message?.includes('unique') || err.errors?.[0]?.extensions?.code === 'RECORD_NOT_UNIQUE') {
                    existentes++;
                } else {
                    console.log(`  Aviso ${p.action} en ${p.collection}:`, err.errors?.[0]?.message);
                }
            }
        }

        console.log(`  ✓ ${creados} permisos creados, ${existentes} ya existían.`);
        console.log("\n✅ ¡Configuración completada! El sistema está listo.");
        console.log("   Frontend: http://localhost:5173");
        console.log("   Directus: http://localhost:8055/admin");
        console.log("   n8n:      http://localhost:5678");

    } catch (err) {
        console.error("ERROR:", err.message);
        process.exit(1);
    }
}

setup();
