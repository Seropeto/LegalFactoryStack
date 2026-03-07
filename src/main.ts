import './style.css'
import { appConfig } from './config';

const API_URL = appConfig.apiUrl;

function formatBytes(bytes: number, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

interface Case {
    id: string;
    n_causa: string;
    cliente_id: string;
    tribunal: string;
    estado: string;
    priority: 'High' | 'Medium' | 'Low';
    created_at: string;
}

interface Appointment {
    id: string;
    title: string;
    time: string;
    day: number;
    duration: number;
}

interface LegalDocument {
    id: string;
    name: string;
    type: string;
    case: string;
    size: string;
    updated: string;
    archivoId: string;
}

interface Client {
    id: string;
    nombre: string;
    rut: string;
    email: string;
    telefono: string;
}

let cases: Case[] = [];
let appointments: Appointment[] = [];
let clients: Client[] = [];
let stats = {
    activeCases: 0,
    weekAudiences: 0,
    totalClients: 0
};

let documents: LegalDocument[] = [];

type View = 'login' | 'dashboard' | 'casos' | 'citas' | 'clientes' | 'documentos' | 'configuracion'

let currentView: View = 'login'
let isModalOpen = false
let modalTitle = ''
let modalContent = ''
let isLoading = true;

// User Session State
type UserRole = 'ADMIN' | 'CLIENT' | 'NONE'
let userRole: UserRole = 'NONE'
let activeClientId: string | null = null
let activeClientName: string | null = null
let adminToken: string | null = null

// Helper: cabeceras autenticadas para operaciones de admin
function adminAuthHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (adminToken) h['Authorization'] = `Bearer ${adminToken}`;
    return h;
}

// Restore session
const savedRole = localStorage.getItem('legalRole');
const savedClientId = localStorage.getItem('legalClientId');
const savedClientName = localStorage.getItem('legalClientName');
const savedToken = sessionStorage.getItem('legalToken');

if (savedRole) {
    userRole = savedRole as UserRole;
    activeClientId = savedClientId;
    activeClientName = savedClientName;
    if (savedToken) adminToken = savedToken;
    currentView = 'dashboard';
}

async function fetchData() {
    isLoading = true;
    render();
    try {
        // 1. Fetch Expedientes
        let casesUrl = `${API_URL}/items/expedientes`;
        if (userRole === 'CLIENT') {
            casesUrl += `?filter[cliente_id][_eq]=${activeClientId}`;
        }
        const casesRes = await fetch(casesUrl);
        const casesData = await casesRes.json();
        cases = (casesData.data || []).map((c: any) => ({
            id: c.id,
            n_causa: c.n_causa,
            tribunal: c.tribunal,
            estado: c.estado,
            priority: (c.priority as 'High' | 'Medium' | 'Low') || 'Medium',
            created_at: new Date(c.created_at).toLocaleDateString()
        }));
        stats.activeCases = cases.filter(c => c.estado !== 'Cerrado' && c.estado !== 'Sentencia').length;

        // 2. Fetch Plazos/Audiencias
        let plazosUrl = `${API_URL}/items/plazos`;
        if (userRole === 'CLIENT') {
            plazosUrl += `?filter[expediente_id][cliente_id][_eq]=${activeClientId}`;
        }
        const plazosRes = await fetch(plazosUrl);
        const plazosData = await plazosRes.json();

        const startOfWeek = getStartOfWeek(new Date());
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        appointments = (plazosData.data || []).map((p: any) => {
            const date = new Date(p.vencimiento);
            const userOffset = date.getTimezoneOffset() * 60000;
            const localDate = new Date(date.getTime() + userOffset);

            return {
                id: p.id,
                title: p.titulo,
                time: localDate.getHours().toString().padStart(2, '0') + ':' + localDate.getMinutes().toString().padStart(2, '0'),
                day: localDate.getDay() === 0 ? 7 : localDate.getDay(),
                duration: 2,
                rawDate: localDate
            };
        });

        stats.weekAudiences = appointments.filter(a => {
            const d = (a as any).rawDate;
            return d >= startOfWeek && d < endOfWeek;
        }).length;

        // 3. Fetch Clientes
        const clientsRes = await fetch(`${API_URL}/items/clientes`);
        const clientsData = await clientsRes.json();
        clients = clientsData.data || [];
        stats.totalClients = clients.length;
        // 4. Fetch Documentos
    let docsUrl = `${API_URL}/items/documentos?fields=*,expediente_id.n_causa,archivo.filesize`;
    if (userRole === 'CLIENT') {
      docsUrl += `&filter[expediente_id][cliente_id][_eq]=${activeClientId}`;
    }
    const docsRes = await fetch(docsUrl);
    const docsData = await docsRes.json();
    documents = (docsData.data || []).map((d: any) => ({
      id: d.id,
      name: d.nombre,
      type: d.nombre.toLowerCase().endsWith('.pdf') ? 'PDF' : 'IMG',
      case: d.expediente_id?.n_causa || 'Sin asignar',
      size: d.archivo?.filesize ? formatBytes(d.archivo.filesize) : 'Desconocido',
      updated: new Date(d.date_created || Date.now()).toLocaleDateString(),
      archivoId: (typeof d.archivo === 'object' ? d.archivo?.id : d.archivo) || ''
    }));

  } catch (err) {
        console.error("Error fetching data:", err);
    } finally {
        isLoading = false;
        render();
    }
}

async function updateClientPassword(newPassword: string) {
    if (!activeClientId) return;
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/items/clientes/${activeClientId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ clave: newPassword })
        });
        if (res.ok) {
            alert('¡Clave actualizada con éxito!');
            toggleModal(false);
        } else {
            const errorData = await res.json().catch(() => ({}));
            console.error('Directus Error:', errorData);
            alert(`Error al actualizar la clave: ${errorData.errors?.[0]?.message || 'Permisos insuficientes en Directus.'}`);
        }
    } catch (err) {
        alert('Error de conexión');
    } finally {
        isLoading = false;
        render();
    }
}

function renderPortalChoice() {
    return `
    <div class="login-screen">
      <div class="login-card">
        <div class="logo" style="margin-bottom: 2.5rem; justify-content: center;">
          <span class="logo-icon">${appConfig.firmIcon}</span>
          <div class="logo-text">${appConfig.firmName.split(' ')[0]}<span>${appConfig.firmName.split(' ').slice(1).join(' ')}</span></div>
        </div>
        <h1 style="font-size: 1.5rem; margin-bottom: 0.5rem;">Bienvenido al Ecosistema Legal</h1>
        <p class="muted-text" style="margin-bottom: 2.5rem;">Seleccione su perfil de acceso para continuar.</p>
        
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          <button class="btn btn-glow" onclick="window.showAdminLogin()" style="padding: 1.25rem;">
            <span>💼</span> Acceso Equipo Legal (Abogados)
          </button>
          <div style="display: flex; align-items: center; margin: 1rem 0;">
             <hr style="flex: 1; opacity: 0.1" /> <span style="padding: 0 1rem; font-size: 0.8rem; opacity: 0.4">O BIEN</span> <hr style="flex: 1; opacity: 0.1" />
          </div>
          <button class="btn btn-outline" onclick="window.showClientLogin()" style="padding: 1.25rem;">
            <span>👥</span> Portal de Transparencia (Clientes)
          </button>
        </div>
        
        <p style="margin-top: 3rem; font-size: 0.75rem; opacity: 0.3;">${appConfig.firmName} ${appConfig.version} - Sistema de Gestión Judicial</p>
      </div>
    </div>
  `;
}

function renderDashboard() {
    if (isLoading) return `<div class="loading">Cargando ecosistema legal...</div>`;

    return `
    <div class="header-row">
      <div class="welcome-section">
        <h1>${userRole === 'ADMIN' ? 'Buenos días, Abogado' : 'Estado de mis Causas'}</h1>
        <p>${userRole === 'ADMIN' ? 'Aquí tienes el estado actual de Toxiro Abogados.' : `Bienvenido ${activeClientName}, aquí puedes ver el progreso de tus trámites.`}</p>
      </div>
      <div class="header-actions">
        ${userRole === 'ADMIN' ? `
          <button class="btn btn-outline" onclick="window.prepareNewClientForm()">Nuevo Cliente</button>
          <button class="btn btn-glow open-modal-trigger">Nuevo Expediente</button>
        ` : `
          <button class="btn btn-outline" onclick="window.showChangePasswordModal()">🔑 Cambiar Clave</button>
        `}
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Causas Activas</div>
        <div class="stat-value">${stats.activeCases}</div>
        <p style="color: #22c55e; font-size: 0.8rem">Sincronizado</p>
      </div>
      <div class="stat-card">
        <div class="stat-label">Audiencias (7 días)</div>
        <div class="stat-value">${stats.weekAudiences}</div>
        <p style="color: var(--accent); font-size: 0.8rem">Próximos hitos</p>
      </div>
      ${userRole === 'ADMIN' ? `
      <div class="stat-card">
        <div class="stat-label">Total Clientes</div>
        <div class="stat-value">${stats.totalClients}</div>
        <p style="color: var(--text-muted); font-size: 0.8rem">Base de datos</p>
      </div>
      ` : ''}
    </div>

    <div class="section-card">
      <div class="section-header">
        <h2>${userRole === 'ADMIN' ? 'Expedientes con Movimientos Recientes' : 'Resumen de mis Procesos'}</h2>
        <button class="btn-link" onclick="window.navigate('casos')">${userRole === 'ADMIN' ? 'Gestionar todos' : 'Ver todos'}</button>
      </div>
      <table class="case-table">
        <thead>
          <tr>
            <th>ROL/RIT (CAUSA)</th>
            <th>TRIBUNAL</th>
            <th>ESTADO ACTUAL</th>
            <th>ALTA</th>
          </tr>
        </thead>
        <tbody>
          ${cases.length === 0 ? '<tr><td colspan="4">No hay expedientes registrados aún.</td></tr>' :
            cases.slice(0, 5).map(c => `
              <tr>
                <td><strong>${c.n_causa}</strong></td>
                <td>${c.tribunal}</td>
                <td><span class="status-badge" style="background: rgba(0, 210, 255, 0.1); color: var(--accent)">${c.estado}</span></td>
                <td>${c.created_at}</td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderCasos() {
    return `
    <div class="header-row">
      <div class="welcome-section">
        <h1>${userRole === 'ADMIN' ? 'Gestión de Expedientes' : 'Mis Expedientes'}</h1>
        <p>${userRole === 'ADMIN' ? 'Administra todos los procesos judiciales vinculados a la base de datos.' : 'Consulta el detalle y estado actual de tus procesos legales.'}</p>
      </div>
      <div class="header-actions">
        <input type="text" id="case-search" placeholder="Buscar por ROL, RUT o Tribunal..." class="search-input" />
        <button class="btn btn-glow open-modal-trigger">Nuevo Expediente</button>
      </div>
    </div>

    <div class="section-card">
      <table class="case-table">
        <thead>
          <tr>
            <th>ROL/RIT</th>
            <th>TRIBUNAL</th>
            <th>PRIORIDAD</th>
            <th>ESTADO</th>
            <th>CREADO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${cases.map(c => `
            <tr class="case-row-hover">
              <td><strong>${c.n_causa}</strong></td>
              <td>${c.tribunal}</td>
              <td><span class="priority-tag prio-${c.priority.toLowerCase()}">${c.priority}</span></td>
              <td><span class="status-badge" style="background: rgba(0, 210, 255, 0.1); color: var(--accent)">${c.estado}</span></td>
                <td>${c.created_at}</td>
                <td><button class="btn-icon" onclick="window.viewTimeline('${c.id}')">👁️</button></td>
              </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderCitas() {
    const startOfWeek = getStartOfWeek(new Date());
    const times = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'];

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startOfWeek);
        d.setDate(startOfWeek.getDate() + i);
        let label = d.toLocaleDateString('es-ES', { weekday: 'long' });
        if (label.toLowerCase() === 'miércoles') label = 'Miérc.';

        weekDays.push({
            label: label.charAt(0).toUpperCase() + label.slice(1),
            dateLabel: d.getDate() + '/' + (d.getMonth() + 1),
            fullDate: d
        });
    }

    return `
    <div class="header-row">
      <div class="welcome-section">
        <h1>${userRole === 'ADMIN' ? 'Agenda de Plazos' : 'Mis Próximos Eventos'}</h1>
        <p>${userRole === 'ADMIN' ? `Vencimientos para la semana del ${startOfWeek.toLocaleDateString()}.` : 'Revisa tus audiencias y plazos legales.'}</p>
      </div>
      ${userRole === 'ADMIN' ? `<button class="btn btn-glow" onclick="window.prepareNewDeadlineForm()">Nuevo Hito</button>` : ''}
    </div>

    <div class="calendar-grid">
      <div class="cal-time-col">
        <div class="cal-header">Hora</div>
        ${times.map(t => `<div class="cal-time-slot">${t}</div>`).join('')}
      </div>
      ${weekDays.map((wd, idx) => {
        const dayAppointments = appointments.filter(a => {
            const d = (a as any).rawDate;
            return d.getDate() === wd.fullDate.getDate() &&
                d.getMonth() === wd.fullDate.getMonth() &&
                d.getFullYear() === wd.fullDate.getFullYear();
        });

        return `
          <div class="cal-day-col">
            <div class="cal-header">
              <span class="day-name">${wd.label}</span>
              <span class="day-date">${wd.dateLabel}</span>
            </div>
            ${times.map(() => `<div class="cal-cell"></div>`).join('')}
            ${dayAppointments.map(a => {
            const [hour, min] = a.time.split(':').map(Number);
            if (hour < 7 || hour > 20) return ''; // Visual range 07-20
            const top = (hour - 7) * 60 + min + 40;
            const height = a.duration * 30;
            return `<div class="cal-event" style="top: ${top}px; height: ${height}px;" title="${a.title}">
                <div class="event-time">${a.time}</div>
                <div class="event-title">${a.title}</div>
              </div>`;
        }).join('')}
          </div>
        `;
    }).join('')}
    </div>
  `
}

function renderDocumentos() {
    return `
    <div class="header-row">
      <div class="welcome-section">
        <h1>Documentos</h1>
        <p>Repositorio central asociado a sus causas vigentes.</p>
      </div>
      ${userRole === 'ADMIN' ? `<button class="btn btn-glow" onclick="window.prepareUploadForm()">+ Subir Documento</button>` : ''}
    </div>
    <div class="section-card">
      <table class="case-table">
        <thead>
          <tr>
            <th>NOMBRE</th>
            <th>CAUSA / EXPEDIENTE</th>
            <th>TAMAÑO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${documents.map(d => `
            <tr class="document-row-hover">
              <td>
                <div style="display: flex; align-items: center; gap: 0.8rem; cursor: pointer;" onclick="window.previewDocument('${d.id}', '${d.name}')">
                  <span style="font-size: 1.2rem;">${d.type === 'PDF' ? '📄' : '🖼️'}</span>
                  <strong class="link-text">${d.name}</strong>
                </div>
              </td>
              <td><span class="muted-text">${d.case}</span></td>
              <td>${d.size}</td>
              <td style="display: flex; gap: 0.5rem;">
                <button class="btn-icon" title="Vista Previa" onclick="window.previewDocument('${d.id}', '${d.name}')">👁️</button>
                <button class="btn-icon" title="Descargar" onclick="window.downloadDocument('${d.id}', '${d.name}')">📥</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderClientes() {
    return `
    <div class="header-row">
      <div class="welcome-section">
        <h1>Gestión de Clientes</h1>
        <p>Directorio central de clientes y prospectos.</p>
      </div>
      <button class="btn btn-glow" onclick="window.prepareNewClientForm()">+ Nuevo Cliente</button>
    </div>

    <div class="section-card">
      <table class="case-table">
        <thead>
          <tr>
            <th>NOMBRE</th>
            <th>RUT</th>
            <th>EMAIL</th>
            <th>TELÉFONO</th>
            <th>ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          ${clients.length === 0 ? '<tr><td colspan="5">No hay clientes registrados.</td></tr>' :
            clients.map(c => `
              <tr>
                <td><strong>${c.nombre}</strong></td>
                <td>${c.rut}</td>
                <td>${c.email}</td>
                <td>${c.telefono || '-'}</td>
                <td>
                  <button class="btn-icon" title="Enviar Email" onclick="window.location.href='mailto:${c.email}'">📧</button>
                  ${c.telefono ? `<button class="btn-icon" title="Llamar" onclick="window.location.href='tel:${c.telefono}'">📞</button>` : ''}
                </td>
              </tr>
            `).join('')}
        </tbody>
      </table>
    </div>
  `
}

function renderConfiguracion() {
    return `<div class="section-card"><h2>Configuracion</h2><p>Servicios operativos: PostgreSQL, Directus, n8n.</p></div>`
}

function renderModal() {
    return `
    <div class="modal-overlay ${isModalOpen ? 'active' : ''}" id="modal-overlay">
      <div class="modal-content">
        <button class="close-modal" onclick="window.toggleModal(false)">&times;</button>
        <h2>${modalTitle}</h2>
        <div class="modal-body-scroll">${modalContent}</div>
      </div>
    </div>
  `;
}

function navigate(view: View) {
    currentView = view
    render()
}

// @ts-ignore
window.navigate = navigate

async function viewTimeline(expId: string) {
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/items/actuaciones?filter[expediente_id][_eq]=${expId}&sort=-fecha`);
        const data = await res.json();
        const timeline = data.data || [];

        const content = `
      <div class="timeline-header-actions">
        <button class="btn btn-glow btn-sm" onclick="window.showAddActuacionForm('${expId}')">+ Registrar Actuación</button>
      </div>
      <div class="timeline-container">
        ${timeline.length === 0 ? '<p class="muted-text">No hay actuaciones registradas para este expediente.</p>' :
                timeline.map((t: any) => `
            <div class="timeline-item">
              <div class="timeline-date">${new Date(t.fecha).toLocaleDateString()}</div>
              <div class="timeline-bitacora">${t.bitacora}</div>
            </div>
          `).join('')}
      </div>
    `;

        showModal('Línea de Tiempo', content);
    } catch (err) {
        console.error("Error fetching timeline:", err);
    } finally {
        isLoading = false;
        render();
    }
}

// @ts-ignore
window.viewTimeline = viewTimeline;

function showModal(title: string, content: string) {
    modalTitle = title;
    modalContent = content;
    toggleModal(true);
}

function attachModalEvents() {
    document.querySelector('#new-expediente-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target as HTMLFormElement;
        const submitBtn = btn.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Guardando...';

        const body = {
            cliente_id: (document.querySelector('#client-select') as HTMLSelectElement).value,
            n_causa: (document.querySelector('#rit-input') as HTMLInputElement).value,
            tribunal: (document.querySelector('#tribunal-input') as HTMLInputElement).value,
            estado: (document.querySelector('#estado-select') as HTMLSelectElement).value,
            priority: (document.querySelector('#priority-select') as HTMLSelectElement)?.value || 'Medium'
        };

        try {
            const createRes = await fetch(`${API_URL}/items/expedientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (createRes.ok) {
                toggleModal(false);
                fetchData();
            } else {
                const errorData = await createRes.json();
                alert(`Error: ${errorData.errors?.[0]?.message || 'No se pudo guardar'}`);
                submitBtn.disabled = false;
                submitBtn.innerText = 'Crear Expediente';
            }
        } catch (err) {
            alert("Error de red");
            submitBtn.disabled = false;
            submitBtn.innerText = 'Crear Expediente';
        }
    });

    document.querySelector('#new-actuacion-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target as HTMLFormElement;
        const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
        const expId = (document.querySelector('#exp-id-hidden') as HTMLInputElement).value;

        submitBtn.disabled = true;
        submitBtn.innerText = 'Registrando...';

        const body = {
            expediente_id: expId,
            fecha: (document.querySelector('#act-fecha') as HTMLInputElement).value,
            bitacora: (document.querySelector('#act-bitacora') as HTMLTextAreaElement).value
        };

        try {
            const res = await fetch(`${API_URL}/items/actuaciones`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                viewTimeline(expId);
            } else {
                alert("Error al registrar actuación");
                submitBtn.disabled = false;
                submitBtn.innerText = 'Registrar';
            }
        } catch (err) {
            alert("Error de red");
            submitBtn.disabled = false;
            submitBtn.innerText = 'Registrar';
        }
    });

    document.querySelector('#new-cliente-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target as HTMLFormElement;
        const submitBtn = btn.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Guardando...';

        const body = {
            nombre: (document.querySelector('#cl-nombre') as HTMLInputElement).value,
            rut: (document.querySelector('#cl-rut') as HTMLInputElement).value,
            email: (document.querySelector('#cl-email') as HTMLInputElement).value,
            telefono: (document.querySelector('#cl-telefono') as HTMLInputElement).value
        };

        try {
            const res = await fetch(`${API_URL}/items/clientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                toggleModal(false);
                fetchData();
            } else {
                const errData = await res.json();
                alert(`Error: ${errData.errors?.[0]?.message}`);
                submitBtn.disabled = false;
                submitBtn.innerText = 'Registrar Cliente';
            }
        } catch (err) {
            alert("Error de red");
            submitBtn.disabled = false;
            submitBtn.innerText = 'Registrar Cliente';
        }
    });

    document.querySelector('#new-plazo-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target as HTMLFormElement;
        const submitBtn = btn.querySelector('button[type="submit"]') as HTMLButtonElement;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Agendando...';

        const fecha = (document.querySelector('#pl-fecha') as HTMLInputElement).value;
        const hora = (document.querySelector('#pl-hora') as HTMLInputElement).value;

        const body = {
            expediente_id: (document.querySelector('#pl-expediente') as HTMLSelectElement).value,
            titulo: (document.querySelector('#pl-titulo') as HTMLInputElement).value,
            vencimiento: `${fecha}T${hora}:00`,
            alerta: (document.querySelector('#pl-alerta') as HTMLInputElement).checked
        };

        try {
            const res = await fetch(`${API_URL}/items/plazos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                toggleModal(false);
                fetchData();
            } else {
                const errData = await res.json();
                alert(`Error: ${errData.errors?.[0]?.message}`);
                submitBtn.disabled = false;
                submitBtn.innerText = 'Agendar Hito';
            }
        } catch (err) {
            alert("Error de red");
            submitBtn.disabled = false;
            submitBtn.innerText = 'Agendar Hito';
        }
    });
}

function showAddActuacionForm(expId: string) {
    const content = `
    <form id="new-actuacion-form">
      <input type="hidden" id="exp-id-hidden" value="${expId}" />
      <div class="form-group">
        <label>Fecha del Hito</label>
        <input type="date" id="act-fecha" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
      </div>
      <div class="form-group">
        <label>Descripción / Bitácora</label>
        <textarea id="act-bitacora" class="form-control" rows="4" placeholder="Ej: Se presenta escrito de defensa..." required></textarea>
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
        <button type="button" class="btn btn-outline" onclick="window.viewTimeline('${expId}')" style="flex:1">Volver</button>
        <button type="submit" class="btn btn-glow" style="flex:1">Registrar</button>
      </div>
    </form>
  `;
    showModal('Nuevo Hito en Bitácora', content);
}

// @ts-ignore
window.showAddActuacionForm = showAddActuacionForm;

function prepareNewClientForm() {
    const content = `
    <form id="new-cliente-form">
      <div class="form-group">
        <label>Nombre Completo</label>
        <input type="text" id="cl-nombre" class="form-control" placeholder="Ej: Juan Pérez" required />
      </div>
      <div class="form-group">
        <label>RUT / DNI</label>
        <input type="text" id="cl-rut" class="form-control" placeholder="Ej: 12.345.678-9" required />
      </div>
      <div class="form-group">
        <label>Correo Electrónico</label>
        <input type="email" id="cl-email" class="form-control" placeholder="ejemplo@correo.com" required />
      </div>
      <div class="form-group">
        <label>Teléfono / WhatsApp</label>
        <input type="text" id="cl-telefono" class="form-control" placeholder="Ej: +569 1234 5678" />
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 2rem;">
        <button type="button" class="btn btn-outline" onclick="window.toggleModal(false)" style="flex:1">Cancelar</button>
        <button type="submit" class="btn btn-glow" style="flex:1">Registrar Cliente</button>
      </div>
    </form>
  `;
    showModal('Registro de Nuevo Cliente', content);
}

// @ts-ignore
window.prepareNewClientForm = prepareNewClientForm;

async function prepareNewDeadlineForm() {
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/items/expedientes`);
        const data = await res.json();
        const casesList = data.data || [];

        const content = `
      <form id="new-plazo-form">
        <div class="form-group">
          <label>Causa Vinculada</label>
          <select id="pl-expediente" class="form-control" required>
            <option value="">Seleccione el expediente...</option>
            ${casesList.map((c: any) => `<option value="${c.id}">${c.n_causa} (${c.tribunal})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Título del Hito</label>
          <input type="text" id="pl-titulo" class="form-control" placeholder="Ej: Audiencia Preparatoria" required />
        </div>
        <div style="display: flex; gap: 1rem;">
          <div class="form-group" style="flex: 2">
            <label>Fecha</label>
            <input type="date" id="pl-fecha" class="form-control" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          <div class="form-group" style="flex: 1">
            <label>Hora</label>
            <input type="time" id="pl-hora" class="form-control" value="09:00" required />
          </div>
        </div>
        <div class="form-group" style="display: flex; align-items: center; gap: 0.5rem; margin-top: 1rem;">
          <input type="checkbox" id="pl-alerta" checked />
          <label for="pl-alerta" style="margin-bottom: 0">Activar recordatorio (WhatsApp/Email)</label>
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <button type="button" class="btn btn-outline" onclick="window.toggleModal(false)" style="flex:1">Cancelar</button>
          <button type="submit" class="btn btn-glow" style="flex:1">Agendar Hito</button>
        </div>
      </form>
    `;
        showModal('Nuevo Hito en Agenda', content);
    } catch (err) {
        console.error("Error fetching cases for deadline:", err);
    } finally {
        isLoading = false;
        render();
    }
}

// @ts-ignore
window.prepareNewDeadlineForm = prepareNewDeadlineForm;

async function loginClient(rut: string, clave: string) {
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/items/clientes?filter[rut][_eq]=${rut}&filter[clave][_eq]=${clave}`);
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            const client = data.data[0];
            activeClientId = client.id;
            activeClientName = client.nombre;
            userRole = 'CLIENT';

            localStorage.setItem('legalRole', 'CLIENT');
            localStorage.setItem('legalClientId', client.id);
            localStorage.setItem('legalClientName', client.nombre);

            currentView = 'dashboard';
            await fetchData();
            toggleModal(false);
        } else {
            alert('RUT o Clave incorrectos. Por favor, intente nuevamente.');
        }
    } catch (err) {
        alert('Error de conexión');
    } finally {
        isLoading = false;
        render();
    }
}

async function loginAdmin(password: string) {
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: appConfig.adminEmail, password })
        });
        const data = await res.json();
        if (!res.ok) {
            alert('Credenciales incorrectas. Verifique su contraseña.');
            return;
        }
        adminToken = data.data.access_token;
        sessionStorage.setItem('legalToken', adminToken!);
        userRole = 'ADMIN';
        localStorage.setItem('legalRole', 'ADMIN');
        currentView = 'dashboard';
        await fetchData();
        toggleModal(false);
    } catch (err) {
        alert('Error de conexión con el servidor.');
    } finally {
        isLoading = false;
        render();
    }
}

function showAdminLogin() {
    const content = `
    <div style="text-align: center; padding: 1rem;">
      <p class="muted-text" style="margin-bottom: 2rem;">Acceso restringido para personal del estudio legal.</p>
      <form id="admin-login-form">
        <div class="form-group">
          <label>Contraseña de Acceso</label>
          <input type="password" id="admin-pass" class="form-control" placeholder="••••••••" required />
        </div>
        <button type="submit" class="btn btn-glow" style="width: 100%; margin-top: 2rem;">Validar Credenciales</button>
      </form>
    </div>
  `;
    showModal('Acceso Abogados', content);

    setTimeout(() => {
        document.querySelector('#admin-login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = (document.querySelector('#admin-pass') as HTMLInputElement).value;
            loginAdmin(pass);
        });
    }, 100);
}

function showChangePasswordModal() {
    const content = `
    <div style="text-align: center; padding: 1rem;">
      <p class="muted-text" style="margin-bottom: 2rem;">Actualice su clave de acceso al portal.</p>
      <form id="change-pass-form">
        <div class="form-group">
          <label>Nueva Clave</label>
          <input type="password" id="new-pass" class="form-control" placeholder="Mínimo 6 caracteres" required />
        </div>
        <button type="submit" class="btn btn-glow" style="width: 100%; margin-top: 2rem;">Cambiar Clave</button>
      </form>
    </div>
  `;
    showModal('Gestionar Clave', content);

    setTimeout(() => {
        document.querySelector('#change-pass-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const pass = (document.querySelector('#new-pass') as HTMLInputElement).value;
            if (pass.length < 4) {
                alert('La clave es muy corta.');
                return;
            }
            updateClientPassword(pass);
        });
    }, 100);
}

function logout() {
    userRole = 'NONE';
    activeClientId = null;
    activeClientName = null;
    adminToken = null;
    localStorage.clear();
    sessionStorage.clear();
    currentView = 'login';
    render();
}

// @ts-ignore
window.showAdminLogin = showAdminLogin;
// @ts-ignore
window.showChangePasswordModal = showChangePasswordModal;
// @ts-ignore
window.loginAdmin = loginAdmin;
// @ts-ignore
window.loginClient = loginClient;
// @ts-ignore
window.logout = logout;

function showClientLogin() {
    const content = `
    <div style="text-align: center; padding: 1rem;">
      <p class="muted-text" style="margin-bottom: 2rem;">Ingrese su RUT y Clave Temporal enviada por correo.</p>
      <form id="client-login-form">
        <div class="form-group">
          <label>RUT del Cliente</label>
          <input type="text" id="login-rut" class="form-control" placeholder="12.345.678-9" required />
        </div>
        <div class="form-group" style="margin-top: 1rem;">
          <label>Clave Temporal</label>
          <input type="password" id="login-clave" class="form-control" placeholder="••••••••" required />
        </div>
        <button type="submit" class="btn btn-glow" style="width: 100%; margin-top: 2rem;">Ingresar al Portal</button>
      </form>
    </div>
  `;
    showModal('Acceso de Clientes', content);

    setTimeout(() => {
        document.querySelector('#client-login-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const rut = (document.querySelector('#login-rut') as HTMLInputElement).value;
            const clave = (document.querySelector('#login-clave') as HTMLInputElement).value;
            loginClient(rut, clave);
        });
    }, 100);
}

// @ts-ignore
window.showClientLogin = showClientLogin;

function getStartOfWeek(d: Date) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(date.setDate(diff));
    start.setHours(0, 0, 0, 0);
    return start;
}

function toggleModal(open: boolean) {
    isModalOpen = open
    render()
}

// @ts-ignore
window.toggleModal = toggleModal;

async function prepareNewCaseForm() {
    isLoading = true;
    render();
    try {
        const res = await fetch(`${API_URL}/items/clientes`);
        const data = await res.json();
        const clients = data.data || [];

        const content = `
      <form id="new-expediente-form">
        <div class="form-group">
          <label>Cliente</label>
          <select id="client-select" class="form-control" required>
            <option value="">Seleccione un cliente...</option>
            ${clients.map((cl: any) => `<option value="${cl.id}">${cl.nombre} (${cl.rut})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>ROL / RIT (Identificador)</label>
          <input type="text" id="rit-input" class="form-control" placeholder="Ej: C-1234-2026" required />
        </div>
        <div class="form-group">
          <label>Tribunal</label>
          <input type="text" id="tribunal-input" class="form-control" placeholder="Ej: 1er Juzgado de Letras" required />
        </div>
        <div style="display: flex; gap: 1rem;">
          <div class="form-group" style="flex:2">
            <label>Estado Inicial</label>
            <select id="estado-select" class="form-control" required>
              <option value="Ingresada">Ingresada</option>
              <option value="En Tramitación">En Tramitación</option>
              <option value="Audiencia">Audiencia</option>
              <option value="Sentencia">Sentencia</option>
            </select>
          </div>
          <div class="form-group" style="flex:1">
            <label>Prioridad</label>
            <select id="priority-select" class="form-control">
              <option value="High">Alta</option>
              <option value="Medium" selected>Media</option>
              <option value="Low">Baja</option>
            </select>
          </div>
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <button type="button" class="btn btn-outline" onclick="window.toggleModal(false)" style="flex:1">Cancelar</button>
          <button type="submit" class="btn btn-glow" style="flex:1">Crear Expediente</button>
        </div>
      </form>
    `;
        showModal('Nuevo Expediente', content);
    } catch (err) {
        console.error("Error fetching clients for form:", err);
    } finally {
        isLoading = false;
        render();
    }
}

// @ts-ignore
window.prepareNewCaseForm = prepareNewCaseForm;

function renderMainContent() {
    switch (currentView) {
        case 'dashboard': return renderDashboard();
        case 'casos': return renderCasos();
        case 'citas': return renderCitas();
        case 'clientes': return renderClientes();
        case 'documentos': return renderDocumentos();
        case 'configuracion': return renderConfiguracion();
        default: return renderDashboard();
    }
}

function render() {
    const app = document.querySelector<HTMLDivElement>('#app')!

    const mainHTML = (userRole === 'NONE' || currentView === 'login')
        ? renderPortalChoice()
        : `
    <div class="app-container">
      <aside class="sidebar">
        <div class="logo">
          <div class="logo-icon">${appConfig.firmIcon}</div>
          ${appConfig.firmName.split(' ')[0]} <span>${appConfig.firmName.split(' ').slice(1).join(' ')}</span>
        </div>
        <ul class="nav-links">
          ${userRole === 'ADMIN' ? `
            <li class="nav-item ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">Inicio</li>
            <li class="nav-item ${currentView === 'casos' ? 'active' : ''}" data-view="casos">Expedientes</li>
            <li class="nav-item ${currentView === 'citas' ? 'active' : ''}" data-view="citas">Plazos</li>
            <li class="nav-item ${currentView === 'clientes' ? 'active' : ''}" data-view="clientes">Clientes</li>
          ` : `
            <li class="nav-item ${currentView === 'dashboard' ? 'active' : ''}" data-view="dashboard">Mis Causas</li>
            <li class="nav-item ${currentView === 'citas' ? 'active' : ''}" data-view="citas">Mis Plazos</li>
          `}
          <li class="nav-item ${currentView === 'documentos' ? 'active' : ''}" data-view="documentos">Archivos</li>
        </ul>

        <div class="sidebar-footer" style="padding: 1.5rem; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 0.8rem;">
          ${userRole === 'CLIENT' ? `
            <div style="font-size: 0.8rem; margin-bottom: 0.5rem;">
              <p class="muted-text">Hola,</p>
              <strong style="display: block; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${activeClientName}</strong>
            </div>
          ` : `
            <button class="btn btn-outline btn-sm" style="width: 100%" onclick="window.showClientLogin()">Cambiar a Cliente</button>
          `}
          <button class="btn btn-outline btn-sm" style="width: 100%; border-color: rgba(255,100,100,0.3); color: #ff7676" onclick="window.logout()">Salir del Sistema</button>
        </div>
      </aside>
      <main class="main-viewport">
        ${renderMainContent()}
      </main>
    </div>
  `;

    app.innerHTML = `
    ${mainHTML}
    ${renderModal()}
  `;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const view = (e.currentTarget as HTMLElement).dataset.view as View
            if (view) navigate(view)
        })
    })

    document.querySelectorAll('.open-modal-trigger').forEach(btn => {
        btn.addEventListener('click', () => prepareNewCaseForm())
    })

    document.querySelector('#close-modal')?.addEventListener('click', () => toggleModal(false))
    document.querySelector('#cancel-modal')?.addEventListener('click', () => toggleModal(false))

    attachModalEvents();

    const searchInput = document.querySelector<HTMLInputElement>('#case-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = (e.target as HTMLInputElement).value.toLowerCase();
            const filtered = cases.filter(c =>
                c.n_causa.toLowerCase().includes(query) ||
                c.tribunal.toLowerCase().includes(query)
            );
            renderTableBody(filtered);
        });
    }
}

function renderTableBody(filteredCases: Case[]) {
    const tbody = document.querySelector('.case-table tbody');
    if (tbody) {
        tbody.innerHTML = filteredCases.map(c => `
      <tr class="case-row-hover">
        <td><strong>${c.n_causa}</strong></td>
        <td>${c.tribunal}</td>
        <td><span class="priority-tag prio-medium">Medium</span></td>
        <td><span class="status-badge" style="background: rgba(0, 210, 255, 0.1); color: var(--accent)">${c.estado}</span></td>
        <td>${c.created_at}</td>
        <td><button class="btn-icon" onclick="window.viewTimeline('${c.id}')">👁️</button></td>
      </tr>
    `).join('');
    }
}

fetchData();
render();

function downloadDocument(id: string, _name: string) {
    const doc = documents.find(d => d.id === id);
    if (!doc?.archivoId) {
        alert('Archivo no encontrado en el repositorio.');
        return;
    }
    const url = `${API_URL}/assets/${doc.archivoId}?download`;
    window.open(url, '_blank');
}

function previewDocument(id: string, name: string) {
    const doc = documents.find(d => d.id === id);
    const fileUrl = doc?.archivoId ? `${API_URL}/assets/${doc.archivoId}` : null;
    const isPDF = name.toLowerCase().endsWith('.pdf');

    const mediaContent = fileUrl
        ? (isPDF
            ? `<iframe src="${fileUrl}" style="width:100%; height:520px; border:none; border-radius:4px;"></iframe>`
            : `<img src="${fileUrl}" alt="${name}" style="max-width:100%; max-height:520px; object-fit:contain; border-radius:4px;" onerror="this.outerHTML='<p class=\\'muted-text\\' style=\\'padding:2rem\\'>No se pudo cargar la imagen.</p>'" />`)
        : `<p class="muted-text" style="padding: 3rem; text-align:center;">Archivo no disponible.</p>`;

    const content = `
        <div style="background:#0d0d0d; border-radius:8px; overflow:hidden; border:1px solid var(--border);">
            <div style="padding:1rem 1.5rem; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:0.8rem;">
                <span style="font-size:1.2rem;">${isPDF ? '📄' : '🖼️'}</span>
                <span style="font-size:0.9rem; color:var(--text-muted);">${name}</span>
            </div>
            <div style="background:#111; padding:0.5rem;">
                ${mediaContent}
            </div>
            <div style="padding:1rem 1.5rem; display:flex; justify-content:flex-end; gap:0.8rem;">
                <button class="btn btn-outline" onclick="window.toggleModal(false)">Cerrar</button>
                <button class="btn btn-glow" onclick="window.downloadDocument('${id}', '${name}')">📥 Descargar</button>
            </div>
        </div>
    `;
    showModal(`Previsualización`, content);
}

// @ts-ignore
window.downloadDocument = downloadDocument;
// @ts-ignore
window.previewDocument = previewDocument;

async function prepareUploadForm() {
  isLoading = true;
  render();
  try {
    const res = await fetch(`${API_URL}/items/expedientes`);
    const data = await res.json();
    const casesList = data.data || [];

    const content = `
      <form id="upload-doc-form">
        <div class="form-group">
          <label>Causa Vinculada</label>
          <select id="doc-expediente" class="form-control" required>
            <option value="">Seleccione el expediente...</option>
            ${casesList.map((c: any) => `<option value="${c.id}">${c.n_causa} (${c.tribunal})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Nombre del Documento</label>
          <input type="text" id="doc-name" class="form-control" placeholder="Ej: Escritura de Propiedad" required />
        </div>
        <div class="form-group" style="margin-top: 1rem;">
          <label>Archivo</label>
          <input type="file" id="doc-file" class="form-control" required style="padding: 0.5rem;" />
        </div>
        <div style="display: flex; gap: 1rem; margin-top: 2rem;">
          <button type="button" class="btn btn-outline" onclick="window.toggleModal(false)" style="flex:1">Cancelar</button>
          <button type="submit" class="btn btn-glow" id="upload-submit-btn" style="flex:1">Subir Archivo</button>
        </div>
      </form>
    `;
    showModal('Cargar Nuevo Documento', content);
    
    // Attach event specifically for this form
    setTimeout(() => {
        document.querySelector('#upload-doc-form')?.addEventListener('submit', handleUploadSubmit);
    }, 100);

  } catch (err) {
    console.error("Error fetching cases for upload:", err);
  } finally {
    isLoading = false;
    render();
  }
}

async function handleUploadSubmit(e: Event) {
    e.preventDefault();
    const submitBtn = document.querySelector('#upload-submit-btn') as HTMLButtonElement;
    const fileInput = document.querySelector('#doc-file') as HTMLInputElement;
    const expId = (document.querySelector('#doc-expediente') as HTMLSelectElement).value;
    const docName = (document.querySelector('#doc-name') as HTMLInputElement).value;

    if (!fileInput.files || fileInput.files.length === 0) return;
    
    submitBtn.disabled = true;
    submitBtn.innerText = 'Subiendo...';

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', docName);

    try {
        // 1. Upload to Directus Files
        const fileRes = await fetch(`${API_URL}/files`, {
            method: 'POST',
            body: formData
        });
        
        let fileData;
        const fileText = await fileRes.text();
        
        if (fileRes.status === 204) {
            throw new Error("El archivo se subió (204), pero no tienes permisos de lectura para ver el resultado. Asegúrate de que el rol Public tenga permisos de 'Read' en Directus Files.");
        }

        try {
            fileData = JSON.parse(fileText);
        } catch (e) {
            console.error("Non-JSON response from /files:", fileText);
            throw new Error(`El servidor respondió con un formato inesperado (${fileRes.status}).`);
        }
        
        if (!fileRes.ok) throw new Error(fileData.errors?.[0]?.message || 'Error al subir archivo');

        const directusFileId = fileData.data.id;

        // 2. Create entry in Documentos collection
        const docRes = await fetch(`${API_URL}/items/documentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nombre: docName,
                archivo: directusFileId,
                expediente_id: expId
            })
        });

        if (docRes.ok) {
            alert('¡Documento cargado exitosamente!');
            toggleModal(false);
            fetchData();
        } else {
            const docText = await docRes.text();
            let docErr;
            try {
                docErr = JSON.parse(docText);
            } catch (e) {
                docErr = { errors: [{ message: `Error del servidor (${docRes.status})` }] };
            }
            throw new Error(docErr.errors?.[0]?.message || 'Error al crear registro de documento');
        }

    } catch (err: any) {
        alert(`Fallo en la carga: ${err.message}`);
        submitBtn.disabled = false;
        submitBtn.innerText = 'Subir Archivo';
    }
}

// @ts-ignore
window.prepareUploadForm = prepareUploadForm;