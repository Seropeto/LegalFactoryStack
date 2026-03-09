# Deploy ToxiroAbogados — Dokploy

## Arquitectura

```
Dokploy / Traefik (SSL automatico)
         |
   ------+------------------+-------------------
   |                        |                   |
abogados.toxirodigital.cloud   api.toxirodigital.cloud   n8n.toxirodigital.cloud
   (frontend nginx)             (Directus 11)             (ya existe, proy aparte)
                                     |
                               db-legal (PostgreSQL, interno)
```

**Servicios en este Compose:** `db-legal`, `api-legal`, `web`
**n8n** corre en proyecto separado "Automatizaciones"

---

## Prerequisitos

- Dokploy funcionando en el VPS
- Repo GitHub: `https://github.com/Seropeto/LegalFactoryStack`
- Subdominios DNS configurados:
  - `abogados.toxirodigital.cloud` -> IP del VPS
  - `api.toxirodigital.cloud` -> IP del VPS
- n8n accesible en `n8n.toxirodigital.cloud`

---

## Paso 1: Crear proyecto en Dokploy

1. En Dokploy UI -> "Projects" -> Crear nuevo proyecto **ToxiroAbogados**
   - (O limpiar el proyecto existente eliminando servicios viejos)
2. Agregar servicio tipo **Compose**
3. Configurar origen:
   - Provider: **GitHub**
   - Repository: `Seropeto/LegalFactoryStack`
   - Branch: `main` (o la rama de produccion)
   - Compose Path: `docker-compose-vps.yml`

---

## Paso 2: Variables de entorno en Dokploy

En la seccion "Environment" del servicio Compose, agregar:

```
DB_PASS_LEGAL=<contraseña-segura-postgres>
DIRECTUS_KEY=<openssl rand -hex 32>
DIRECTUS_SECRET=<openssl rand -hex 32>
DIRECTUS_ADMIN_EMAIL=admin@toxirodigital.cloud
DIRECTUS_ADMIN_PASSWORD=<contraseña-admin-segura>
```

> Generar keys con: `openssl rand -hex 32`

---

## Paso 3: Deploy

1. Click "Deploy" en Dokploy
2. Dokploy clonara el repo, construira el `Dockerfile.frontend` y levantara los 3 servicios
3. Esperar hasta que los 3 contenedores esten en estado `Running`

---

## Paso 4: Asignar dominios en Dokploy

Para el servicio **api-legal**:
1. Ir a la seccion "Domains" del servicio
2. Agregar dominio: `api.toxirodigital.cloud`
3. Habilitar HTTPS (Let's Encrypt automatico)

Para el servicio **web**:
1. Ir a la seccion "Domains" del servicio
2. Agregar dominio: `abogados.toxirodigital.cloud`
3. Habilitar HTTPS

---

## Paso 5: Configurar Directus

Desde tu maquina local (con Node.js instalado):

```bash
# El setup-directus.mjs ya apunta a api.toxirodigital.cloud
node setup-directus.mjs
```

Esto crea las colecciones y permisos publicos necesarios.

### Crear Directus Flows (desde Directus Admin UI)

Acceder a `https://api.toxirodigital.cloud/admin` -> Settings -> Flows:

**Flow 1 — Onboarding Email (nuevo cliente)**
- Trigger: `items.create` en coleccion `clientes` (tipo: action/async)
- Operacion 1 (`get_cliente`): GET `http://toxiro-api:8055/items/clientes/{{$trigger.key}}?fields=id,nombre,rut,email,telefono`
  - Headers: `Authorization: Bearer n8n_directus_static_token_legal`
- Operacion 2 (`send_to_n8n`): POST `https://n8n.toxirodigital.cloud/webhook/onboarding-cliente`
  - Body JSON con `{{get_cliente.data.data.id}}`, `{{get_cliente.data.data.nombre}}`, etc.

**Flow 2 — Notificacion Sentencia (WhatsApp)**
- Trigger: `items.update` en `expedientes` (action/async)
- Condition: `{"$trigger":{"payload":{"estado":{"_eq":"Sentencia"}}}}`
- GET expediente con cliente -> POST Twilio API -> Mark notificado

**Flow 3 — Notificacion Cierre (Email)**
- Trigger: `items.update` en `expedientes` (action/async)
- Condition: `{"$trigger":{"payload":{"estado":{"_eq":"Cerrado"}}}}`
- GET expediente -> POST `https://n8n.toxirodigital.cloud/webhook/cierre-expediente` -> Mark notificado

> IMPORTANTE: Las llamadas internas entre servicios del mismo Compose usan
> `http://toxiro-api:8055` (nombre del container). Las llamadas a n8n usan
> la URL publica `https://n8n.toxirodigital.cloud` porque esta en otro proyecto.

---

## Paso 6: Configurar n8n

Acceder a `https://n8n.toxirodigital.cloud`:

### Importar workflows
Importar estos archivos JSON desde el menu de n8n:
- `infra/n8n-onboarding.json` — Email de bienvenida
- `infra/n8n-cierre-expediente.json` — Email de cierre

### Crear credenciales
1. **Directus Bearer Token** (tipo: Header Auth)
   - Name: `Authorization`
   - Value: `Bearer n8n_directus_static_token_legal`

2. **Twilio Basic Auth** (tipo: HTTP Basic Auth)
   - Username: `<Tu Twilio Account SID>` (empieza con AC...)
   - Password: `<Twilio Auth Token>`

3. **SMTP Email** (tipo: SMTP)
   - Host: `smtp.hostinger.com`, Port: `587`, STARTTLS
   - User: `contacto@toxirodigital.cloud`

### Activar workflows
Activar todos los workflows importados desde la UI de n8n.

---

## Paso 7: Crear token estatico en Directus

En Directus Admin -> Settings -> Users -> Admin:
1. Ir a la seccion "Token" del usuario admin
2. Crear token estatico: `n8n_directus_static_token_legal`
3. Este token es usado por n8n y los Directus Flows para autenticarse

---

## Verificacion

```bash
# Directus API
curl -I https://api.toxirodigital.cloud/server/health

# Frontend
curl -I https://abogados.toxirodigital.cloud

# Test: crear un cliente deberia enviar email de onboarding
```

---

## URLs de acceso

| Servicio       | URL                                        |
|----------------|--------------------------------------------|
| Frontend       | `https://abogados.toxirodigital.cloud`     |
| Directus Admin | `https://api.toxirodigital.cloud/admin`    |
| Directus API   | `https://api.toxirodigital.cloud`          |
| n8n            | `https://n8n.toxirodigital.cloud`          |

---

## Notas de seguridad

- Las variables de entorno se configuran en Dokploy UI (nunca en archivos del repo)
- El compose NO expone puertos al host — todo va por Traefik
- La red `toxiro-net` es aislada, no afecta otros proyectos en Dokploy
- Los volumenes usan prefijo `toxiro_` para evitar colisiones
