# Guía de Deploy — VPS

## Requisitos del servidor
- Ubuntu 22.04+ / Debian 12+
- Docker + Docker Compose instalados
- Mínimo 2 GB RAM, 20 GB disco
- Puerto 80 abierto (443 si usas SSL)

---

## 1. Clonar el repositorio en el VPS

```bash
git clone https://github.com/Seropeto/LegalFactoryStack.git
cd LegalFactoryStack
```

---

## 2. Crear archivo de secrets

```bash
cp .env.vps.example .env.prod
nano .env.prod   # Editar todos los valores antes de continuar
```

Campos obligatorios:
- `DIRECTUS_KEY` / `DIRECTUS_SECRET` — claves aleatorias (usa `openssl rand -hex 32`)
- `DIRECTUS_ADMIN_EMAIL` / `DIRECTUS_ADMIN_PASSWORD`
- `DB_PASS_LEGAL` / `DB_PASS_EVOLUTION` / `N8N_PASS` / `EVOLUTION_API_KEY`
- Variables `VITE_*` para el branding del estudio

---

## 3. Construir el frontend con las variables del cliente

```bash
# Copia las VITE_* del .env.prod al .env local temporalmente
grep "^VITE_" .env.prod > .env

npm install
npm run build    # Genera dist/ con el branding correcto

rm .env          # Limpiar
```

---

## 4. Levantar los servicios

```bash
docker-compose -f docker-compose-vps.yml --env-file .env.prod up -d
```

Esperar ~30 segundos, luego configurar Directus:

```bash
# Ajustar la URL de la API en el script
sed -i "s|http://localhost:8055|http://localhost:8055|g" setup-directus.mjs
node setup-directus.mjs
```

---

## 5. Verificar que todo está corriendo

```bash
docker-compose -f docker-compose-vps.yml ps
```

Deberías ver todos los servicios en estado `Up`.

---

## 6. Acceso al sistema

| Servicio       | URL                           |
|----------------|-------------------------------|
| Frontend       | `http://tu-servidor.cl`       |
| Directus admin | `http://tu-servidor.cl/directus/admin` |
| n8n            | `http://tu-servidor.cl/n8n`   |

---

## 7. SSL con Let's Encrypt (opcional pero recomendado)

```bash
# Instalar certbot
apt install certbot python3-certbot-nginx

# Obtener certificado
certbot --nginx -d tu-dominio.cl

# Renovación automática (ya viene configurada)
certbot renew --dry-run
```

---

## Pasos para un nuevo cliente (white-label)

1. Clonar repositorio en nueva carpeta
2. Editar `.env.prod` con datos del cliente
3. `npm run build` para generar dist/ con branding
4. Levantar stack con nuevo `--env-file`
5. Ejecutar `setup-directus.mjs`
6. Escanear QR de WhatsApp con `setup-whatsapp-pro.mjs`
