/// <reference types="vite/client" />
// Configuración white-label — personalizable por cliente via .env
export const appConfig = {
    firmName:   import.meta.env.VITE_FIRM_NAME   || 'Toxiro Abogados',
    firmIcon:   import.meta.env.VITE_FIRM_ICON   || '⚖️',
    adminEmail: import.meta.env.VITE_ADMIN_EMAIL || 'admin@toxirodigital.cloud',
    version:    import.meta.env.VITE_APP_VERSION || 'v1.0',
    apiUrl:     import.meta.env.VITE_API_URL     || 'http://localhost:8055',
};
