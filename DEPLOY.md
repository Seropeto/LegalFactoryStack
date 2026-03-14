# Deploy ToxiroAbogados — Coolify

## Arquitectura

```
Coolify / Traefik (SSL automatico)
         |
   ------+---------------------------+
         |                           |
abogados.toxirodigital.cloud   api.toxirodigital.cloud   n8n.toxirodigital.cloud
   (frontend nginx)             (Directus 11)             (proyecto aparte en Coolify)
                                     |
                               db-legal (PostgreSQL, interno)
```

**Servicios en este Compose:** `db-legal`, `api-legal`, `web`
**n8n** corre en proyecto separado en Coolify

---

## Prerequisitos

- Coolify funcionando en el VPS (http://72.60.248.159:8000)
- Repo GitHub: `https://github.com/Seropeto/LegalFactoryStack`
- Subdominios DNS configurados:
  - `abogados.toxirodigital.cloud` -> IP del VPS
  - `api.toxirodigital.cloud` -> IP del VPS
- n8n accesible en `n8n.toxirodigital.cloud`

---

## Paso 1: Crear proyecto en Coolify

1. Ir a **Coolify UI** -> **Projects** -> **+ New Project**
2. Nombre: `ToxiroAbogados`

---

## Paso 2: Agregar recurso Docker Compose

1. Dentro del proyecto -> **+ New Resource**
2. Seleccionar **Docker Compose**
3. Seleccionar source: **GitHub** (conectar si no esta conectado)
   - Repository: `Seropeto/LegalFactoryStack`
   - Branch: `master`
   - Compose Location: `docker-compose-vps.yml`
4. Click **Continue**

---

## Paso 3: Variables de entorno en Coolify

En la seccion **Environment Variables** del recurso, agregar:

```
DB_PASS_LEGAL=<contraseña-segura-postgres>
DIRECTUS_KEY=<openssl rand -hex 32>
DIRECTUS_SECRET=<openssl rand -hex 32>
DIRECTUS_ADMIN_EMAIL=admin@toxirodigital.cloud
DIRECTUS_ADMIN_PASSWORD=<contraseña-admin-segura>
```

> Generar keys con: `openssl rand -hex 32`

---

## Paso 4: Configurar dominios en Coolify

Coolify permite asignar dominios por servicio dentro del Compose.

### Servicio `api-legal`
- En la config del recurso, buscar servicio `api-legal`
- Dominio: `https://api.toxirodigital.cloud`
- Puerto interno: `8055`
- Habilitar HTTPS (Let's Encrypt automatico)

### Servicio `web`
- En la config del recurso, buscar servicio `web`
- Dominio: `https://abogados.toxirodigital.cloud`
- Puerto interno: `80`
- Habilitar HTTPS

> **Nota**: El servicio `db-legal` NO necesita dominio — es solo interno.

---

## Paso 5: Deploy

1. Click **Deploy** en Coolify
2. Coolify clonara el repo, construira el `Dockerfile.frontend` y levantara los 3 servicios
3. Esperar hasta que los 3 contenedores esten en estado `Running`
4. Verificar logs por si hay errores de conexion DB (Directus tarda ~30s en arrancar)

---

## Paso 6: Configurar Directus

Desde tu maquina local (con Node.js instalado):

```bash
node setup-directus.mjs
```

Esto crea las colecciones y permisos publicos necesarios.

### Crear Directus Flows (desde Directus Admin UI)

Acceder a `https://api.toxirodigital.cloud/admin` -> Settings -> Flows.

Importar los flows exportados:
- `infra/directus-flow-sentencia.json` — Notificacion WhatsApp al dictar Sentencia

Para los flows de Onboarding y Cierre hay que recrearlos manualmente (ver DEPLOY.md anterior) o importar desde Settings -> Data Model -> Import/Export.

**Referencias de URLs internas** (los flows usan nombre de container):
- Directus interno: `http://toxiro-api:8055`
- n8n: `https://n8n.toxirodigital.cloud` (publico, esta en otro proyecto Coolify)

---

## Paso 7: Configurar n8n

Acceder a `https://n8n.toxirodigital.cloud`:

### Importar workflows
- `infra/n8n-onboarding.json` — Email de bienvenida
- `infra/n8n-cierre-expediente.json` — Email de cierre
- `infra/n8n-plazos-twilio.json` — Recordatorio plazos WhatsApp

### Credenciales necesarias

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

## Paso 8: Crear token estatico en Directus

En Directus Admin -> Settings -> Users -> Admin:
1. Ir a la seccion "Token" del usuario admin
2. Crear token estatico: `n8n_directus_static_token_legal`
3. Este token es usado por n8n y los Directus Flows para autenticarse

---

## Verificacion

```bash
# Directus API health
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
| Coolify        | `http://72.60.248.159:8000`                |

---

## Notas de seguridad

- Las variables de entorno se configuran en Coolify UI (nunca en archivos del repo)
- El compose NO expone puertos al host — todo va por Traefik de Coolify
- `db-legal` solo esta en la red interna `toxiro-net` (no accesible desde afuera)
- `api-legal` y `web` estan en `toxiro-net` (comunicacion interna) y `coolify` (proxy)
- Los volumenes usan prefijo `toxiro_` para evitar colisiones
