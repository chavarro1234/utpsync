// Estado global de la aplicación (ahora se carga desde la Base de Datos)
let state = {
    users: [],
    rooms: [],
    schedules: [],
    assignments: [],
    shiftRequests: [],
    currentUser: null
};

// Rutas API
const API_URL = 'api.php';

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const registerScreen = document.getElementById('register-screen');
const appContainer = document.getElementById('app-container');
const loginError = document.getElementById('login-error');

const sidebarLinks = document.querySelectorAll('.sidebar-nav li');
const contentArea = document.getElementById('content-area');
const modalOverlay = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

const topbarTitle = document.getElementById('topbar-title');
const navBadgeCambios = document.getElementById('nav-badge-cambios');
const navBadgeUsuarios = document.getElementById('nav-badge-usuarios');
const todayTimeline = document.getElementById('today-timeline');
const activityFeed = document.getElementById('activity-feed');

// Util Functions
function getInitials(name) {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function showToast(type, title, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-circle-xmark';
    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 500);
    }, 6000);
}

// Data Fetching
async function loadStateFromDB() {
    try {
        const formData = new FormData();
        formData.append('action', 'get_state');
        if (state.currentUser && state.currentUser.id) {
            formData.append('user_id', state.currentUser.id);
        } else {
            const cached = localStorage.getItem('utp_session');
            if (cached) {
                const session = JSON.parse(cached);
                if (session.id) formData.append('user_id', session.id);
            }
        }
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            state.users = data.state.users;
            state.rooms = data.state.rooms;
            state.schedules = data.state.schedules;
            state.assignments = data.state.assignments;
            state.shiftRequests = data.state.shiftRequests;
        }
    } catch (err) {
        console.error("Error al cargar datos:", err);
        showToast('error', 'Error de red', 'No se pudieron cargar los datos de la base de datos.');
    }
}

// Auth Flow
const initAppUI = async () => {
    loginError.style.display = 'none';
    await loadStateFromDB();
    document.getElementById('current-user-name').textContent = state.currentUser.nombre;
    document.getElementById('current-user-role').textContent = state.currentUser.rol === 'admin' ? 'Administrador' : 'Monitor';
    document.getElementById('current-user-avatar').textContent = getInitials(state.currentUser.nombre);
    document.querySelectorAll('li.admin-only, div.admin-only').forEach(el => {
        el.style.display = state.currentUser.rol === 'admin' ? (el.tagName === 'LI' ? 'flex' : 'block') : 'none';
    });
    loginScreen.style.display = 'none';
    appContainer.style.display = 'flex';
    
    // Restaurar última vista o ir al dashboard
    const lastView = localStorage.getItem('utp_last_view') || 'dashboard';
    const viewLink = document.querySelector(`[data-view="${lastView}"]`);
    if (viewLink) {
        viewLink.click();
    } else {
        document.querySelector('[data-view="dashboard"]').click();
    }
    
    updateWidgets();
};

window.handleLogin = async (e) => {
    e.preventDefault();
    const cedula = document.getElementById('login-cedula').value;
    const password = document.getElementById('login-password').value;
    const btn = document.querySelector('.btn-login span');
    btn.textContent = "Conectando...";
    try {
        const formData = new FormData();
        formData.append('action', 'login');
        formData.append('cedula', cedula);
        formData.append('password', password);
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            state.currentUser = data.user;
            localStorage.setItem('utp_session', JSON.stringify(data.user)); // Guardar sesión
            await initAppUI();
            showToast('success', 'Sesión Iniciada', 'Bienvenido al panel de gestión UTP.');
        } else {
            loginError.textContent = data.message;
            loginError.style.display = 'block';
        }
    } catch (err) {
        loginError.textContent = 'Error conectando al servidor. Verifica que XAMPP esté corriendo.';
        loginError.style.display = 'block';
    } finally {
        btn.textContent = "Acceder al Sistema";
    }
};

window.handleLogout = () => {
    state.currentUser = null;
    localStorage.removeItem('utp_session'); // Eliminar sesión
    localStorage.removeItem('utp_last_view'); // Limpiar vista recordada
    appContainer.style.display = 'none';
    loginScreen.style.display = 'flex';
    if (registerScreen) registerScreen.style.display = 'none';
    document.getElementById('form-login').reset();
    loginError.style.display = 'none';
};

window.showRegisterScreen = () => {
    loginScreen.style.display = 'none';
    registerScreen.style.display = 'flex';
    renderScheduleGrid();
};

window.showLoginScreen = () => {
    registerScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
};

window.handleRegister = async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const cedula = document.getElementById('reg-cedula').value;
    const password = document.getElementById('reg-password').value;
    const promedio = parseFloat(document.getElementById('reg-promedio').value);
    const correo = document.getElementById('reg-correo').value;
    const celular = document.getElementById('reg-celular').value;
    const programa = document.getElementById('reg-programa').value;

    // Validar rango de promedio
    if (isNaN(promedio) || promedio < 3.5 || promedio > 5.0) {
        document.getElementById('register-error').textContent = 'El promedio debe estar entre 3.5 y 5.0.';
        document.getElementById('register-error').style.display = 'block';
        return;
    }
    
    // Recolectar disponibilidad
    const selectedSlots = [];
    document.querySelectorAll('.sched-cell.selected').forEach(cell => {
        selectedSlots.push({
            dia: cell.dataset.day,
            hora: cell.dataset.time
        });
    });
    
    if (selectedSlots.length === 0) {
        document.getElementById('register-error').textContent = 'Debes marcar al menos un bloque de tiempo disponible.';
        document.getElementById('register-error').style.display = 'block';
        return;
    }

    const btn = document.querySelector('.btn-register span');
    btn.textContent = "Enviando...";
    document.getElementById('register-error').style.display = 'none';
    
    try {
        const formData = new FormData();
        formData.append('action', 'register_monitor');
        formData.append('name', name);
        formData.append('cedula', cedula);
        formData.append('password', password);
        formData.append('promedio', promedio);
        formData.append('correo', correo);
        formData.append('disponibilidad', JSON.stringify(selectedSlots));
        formData.append('celular', celular);
        formData.append('programa', programa);
        
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.success) {
            showToast('success', 'Solicitud Enviada', data.message);
            document.getElementById('form-register').reset();
            document.querySelectorAll('.sched-cell').forEach(c => c.classList.remove('selected'));
            showLoginScreen();
        } else {
            document.getElementById('register-error').textContent = data.message;
            document.getElementById('register-error').style.display = 'block';
        }
    } catch (err) {
        document.getElementById('register-error').textContent = 'Error conectando al servidor.';
        document.getElementById('register-error').style.display = 'block';
    } finally {
        btn.textContent = "Enviar Solicitud";
    }
};

function renderScheduleGrid() {
    const grid = document.getElementById('reg-schedule-grid');
    if (grid.children.length > 0) return; // ya renderizado
    
    const style = document.createElement('style');
    style.innerHTML = `
        /* Ocultar barra de desplazamiento en la tarjeta */
        .login-card-glass::-webkit-scrollbar {
            display: none;
        }
        .login-card-glass {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }

        /* Mejora del diseño de selección */
        .sched-cell {
            position: relative;
            overflow: hidden;
        }
        .sched-cell:hover { 
            background: var(--bg-surface-hover) !important; 
            transform: translateY(-1px);
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            z-index: 1;
        }
        .sched-cell.selected { 
            background: var(--brand-accent) !important; 
            color: white !important; 
            border-color: var(--brand-accent) !important; 
            transform: scale(1.05);
            box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
            font-weight: bold;
            z-index: 2;
        }
        .sched-cell.selected::after {
            content: '✓';
            position: absolute;
            top: 2px;
            right: 4px;
            font-size: 0.6rem;
            color: rgba(255,255,255,0.9);
        }
    `;
    document.head.appendChild(style);

    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const hours = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
    // TODAS LAS HORAS DISPONIBLES
    // const hours = ['06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
    
    let html = '';
    // Cabeceras de dias
    days.forEach(d => {
        html += `<div style="text-align:center; font-size:0.75rem; font-weight:bold; color:var(--text-secondary); margin-bottom: 4px;">${d.substring(0,3)}</div>`;
    });
    
    hours.forEach(h => {
        days.forEach(d => {
            html += `<div class="sched-cell" data-day="${d}" data-time="${h}" onclick="this.classList.toggle('selected')" style="border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.02); border-radius: 4px; padding: 4px; text-align: center; cursor: pointer; font-size: 0.7rem; color: var(--text-primary); transition: all 0.2s; user-select: none;">${h}</div>`;
        });
    });
    
    grid.innerHTML = html;
}

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            sidebarLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const viewName = link.dataset.view;
            localStorage.setItem('utp_last_view', viewName); // Guardar vista actual
            topbarTitle.textContent = link.querySelector('span').textContent;
            loadView(viewName);
        });
    });

    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn-close-modal') || e.target.closest('.close-modal-btn')) {
            closeModal();
        }
    });

    // Verificar si las inscripciones están abiertas y mostrar/ocultar sección de registro en el login
    try {
        const fd = new FormData();
        fd.append('action', 'get_settings');
        const settingsRes = await fetch(API_URL, { method: 'POST', body: fd });
        const settingsData = await settingsRes.json();
        const loginFooter = document.querySelector('.login-footer');
        if (loginFooter) {
            loginFooter.style.display = (settingsData.success && settingsData.config.registrations_enabled) ? '' : 'none';
        }
    } catch (e) { /* si falla la red, se deja visible por defecto */ }

    // Restaurar sesión si existe (ahora los eventos de click ya están listos)
    const cachedSession = localStorage.getItem('utp_session');
    if (cachedSession) {
        try {
            state.currentUser = JSON.parse(cachedSession);
            await initAppUI();
        } catch (e) {
            localStorage.removeItem('utp_session');
        }
    }
});

// View Router
function loadView(view) {
    if (view === 'configuracion') {
        if (state.currentUser.rol !== 'admin') {
            contentArea.innerHTML = '<h2 style="color:var(--status-error)">Acceso Denegado</h2>';
            return;
        }
        renderConfiguracion().then(html => {
            contentArea.innerHTML = html;
            attachEventListeners(view);
            updateWidgets();
        });
        return;
    }
    let content = '';
    switch (view) {
        case 'dashboard': content = renderDashboard(); break;
        case 'usuarios': content = renderUsuarios(); break;
        case 'salas': content = renderSalas(); break;
        case 'asignaciones': content = renderAsignaciones(); break;
        case 'cambios': content = renderCambios(); break;
        case 'configuracion': content = renderConfiguracion(); break;
    }
    contentArea.innerHTML = content;
    attachEventListeners(view);
    updateWidgets();
}

// Widgets Laterales
function updateWidgets() {
    const isAdmin = state.currentUser.rol === 'admin';
    const uid = parseInt(state.currentUser.id);

    const pendingRequests = isAdmin
        ? state.shiftRequests.filter(r =>
            r.estado === 'pendiente' && parseInt(r.reemplazo_acepto) === 1
        ).length
        : state.shiftRequests.filter(r =>
            parseInt(r.monitor_reemplazo_id) === uid &&
            parseInt(r.reemplazo_acepto) === 0 &&
            r.estado !== 'rechazada' &&
            r.estado !== 'aprobada'
        ).length;

    if (pendingRequests > 0) {
        navBadgeCambios.textContent = pendingRequests;
        navBadgeCambios.style.display = 'block';
    } else {
        navBadgeCambios.style.display = 'none';
    }

    if (isAdmin && navBadgeUsuarios) {
        const pendingUsers = state.users.filter(u => u.estado_cuenta === 'pendiente').length;
        if (pendingUsers > 0) {
            navBadgeUsuarios.textContent = pendingUsers;
            navBadgeUsuarios.style.display = 'block';
        } else {
            navBadgeUsuarios.style.display = 'none';
        }
    }

// Today Timeline
if (todayTimeline) {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayStr = days[new Date().getDay()];
    const hoyLocal = new Date();
    const todayDate = hoyLocal.getFullYear() + '-' +
        String(hoyLocal.getMonth() + 1).padStart(2, '0') + '-' +
        String(hoyLocal.getDate()).padStart(2, '0');

    // Función helper: ¿hay reemplazo activo para esta asignación hoy?
    function getReemplazoHoy(asignacion, sched) {
        return state.shiftRequests.find(r => {
            if (String(r.asignacion_id) !== String(asignacion.id)) return false;
            if (r.estado !== 'aprobada') return false;
            // Si tiene fecha específica, comparar con hoy
            if (!r.fecha_reemplazo) return false; // sin fecha = ignorar
            return r.fecha_reemplazo === todayDate;
        });
    }

    const todaysAssignments = state.assignments.filter(a => {
        const sched = state.schedules.find(s => s.id == a.horario_id);
        if (!sched || sched.dia !== todayStr) return false;
        if (!isAdmin) {
            const esTitular = parseInt(a.monitor_id) === uid;
            const reemplazo = getReemplazoHoy(a, sched);
            const esReemplazoHoy = reemplazo && parseInt(reemplazo.monitor_reemplazo_id) === uid;
            // Titular cedió su turno hoy → no mostrar
            const cediTurno = esTitular && reemplazo && parseInt(reemplazo.monitor_solicitante_id) === uid;
            if (!esTitular && !esReemplazoHoy) return false;
            if (cediTurno) return false;
        }
        return true;
    });

    if (todaysAssignments.length === 0) {
        todayTimeline.innerHTML = '<p style="font-size:0.875rem; color:var(--text-muted)">No hay turnos programados para hoy.</p>';
    } else {
        todayTimeline.innerHTML = todaysAssignments.map(a => {
            const sched = state.schedules.find(s => s.id == a.horario_id);
            const room = state.rooms.find(r => r.id == sched.sala_id);
            const reemplazo = getReemplazoHoy(a, sched);
            const monitorId = reemplazo ? reemplazo.monitor_reemplazo_id : a.monitor_id;
            const monitor = state.users.find(u => String(u.id) === String(monitorId));
            const isPast = parseInt(sched.hora_inicio.substring(0, 2)) < new Date().getHours();
            const iconClass = isPast ? 'green' : 'blue';
            const icon = isPast ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-regular fa-clock"></i>';
            return `
            <div class="timeline-item">
                <div class="tl-icon ${iconClass}">${icon}</div>
                <div class="tl-content">
                    <h4>${room ? (room.nombre !== room.ubicacion ? `${room.nombre} - ${room.ubicacion}` : room.ubicacion) : 'Sala'}</h4>
                    <p>${monitor ? monitor.nombre : 'Sin Asignar'}${reemplazo ? ' <span style="font-size:0.7rem;color:var(--accent-primary)">(reemplazo)</span>' : ''}</p>
                    <span class="tl-time">${sched.hora_inicio.substring(0, 5)} - ${sched.hora_fin.substring(0, 5)}</span>
                </div>
            </div>`;
        }).join('');
    }
}

    // Activity Feed
    if (activityFeed) {
        const feedSource = isAdmin
            ? state.shiftRequests
            : state.shiftRequests.filter(r =>
                parseInt(r.monitor_solicitante_id) === uid ||
                parseInt(r.monitor_reemplazo_id) === uid
            );

        const feedItems = feedSource.slice(-5).reverse().map(req => {
            const requester = state.users.find(u => u.id == req.monitor_solicitante_id);
            const reemplazo = state.users.find(u => u.id == req.monitor_reemplazo_id);
            let statusColor = 'bg-pending';
            let actionText = 'solicitó un cambio';
            if (parseInt(req.reemplazo_acepto) === 0 && req.estado !== 'aprobada' && req.estado !== 'rechazada') {
                actionText = 'esperando confirmación de ' + (reemplazo?.nombre?.split(' ')[0] || '...');
            }
            if (parseInt(req.reemplazo_acepto) === 1 && req.estado === 'pendiente') {
                actionText = 'reemplazo confirmado, en revisión';
            }
            if (req.estado === 'aprobada') { statusColor = 'style="background:var(--status-success)"'; actionText = 'cambio aprobado'; }
            if (req.estado === 'rechazada') { statusColor = 'style="background:var(--status-error)"'; actionText = 'cambio rechazado'; }

            return `
            <div class="activity-item">
                <div class="activity-avatar">${getInitials(requester ? requester.nombre : '?')}</div>
                <div class="activity-info">
                    <p><strong>${requester ? requester.nombre.split(' ')[0] : 'Alguien'}</strong> ${actionText}</p>
                    <div style="display:flex; align-items:center; margin-top:0.25rem;">
                        <span class="activity-status ${statusColor}"></span>
                        <span style="font-size:0.7rem; color:var(--text-muted);">${req.fecha_solicitud ? req.fecha_solicitud.substring(0, 10) : ''}</span>
                    </div>
                </div>
            </div>`;
        });

        activityFeed.innerHTML = feedItems.length === 0
            ? '<p style="font-size:0.875rem; color:var(--text-muted)">No hay actividad reciente.</p>'
            : feedItems.join('');
    }
}

// ==========================================
// RENDERERS
// ==========================================

function renderDashboard() {
    const isMonitor = state.currentUser.rol === 'monitor';
    const uid = parseInt(state.currentUser.id);
    const myAssignments = isMonitor
        ? state.assignments.filter(a => a.monitor_id == uid).length
        : state.assignments.length;

    const myRequests = isMonitor
        ? state.shiftRequests.filter(r =>
            parseInt(r.monitor_solicitante_id) === uid ||
            parseInt(r.monitor_reemplazo_id) === uid)
        : state.shiftRequests;

    const pendingCount = isMonitor
        ? myRequests.filter(r =>
            parseInt(r.reemplazo_acepto) === 0 &&
            r.estado !== 'rechazada' &&
            r.estado !== 'aprobada').length
        : state.shiftRequests.filter(r =>
            r.estado === 'pendiente' &&
            parseInt(r.reemplazo_acepto) === 1).length;

    return `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Hola, ${state.currentUser.nombre.split(' ')[0]} 👋</h1>
                    <p>Aquí tienes un resumen de la gestión de monitores del día.</p>
                </div>
            </div>

            <div class="stats-grid">
                ${state.currentUser.rol === 'admin' ? `
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Monitores Activos</span>
                        <div class="stat-icon blue"><i class="fa-solid fa-users"></i></div>
                    </div>
                    <div class="stat-value">${state.users.filter(u => u.rol === 'monitor').length}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Salas Configuradas</span>
                        <div class="stat-icon purple"><i class="fa-solid fa-server"></i></div>
                    </div>
                    <div class="stat-value">${state.rooms.length}</div>
                </div>` : ''}
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">${isMonitor ? 'Mis Turnos' : 'Total Asignaciones'}</span>
                        <div class="stat-icon green"><i class="fa-solid fa-calendar-check"></i></div>
                    </div>
                    <div class="stat-value">${myAssignments}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-header">
                        <span class="stat-title">Solicitudes Pendientes</span>
                        <div class="stat-icon orange"><i class="fa-solid fa-arrows-rotate"></i></div>
                    </div>
                    <div class="stat-value">${pendingCount}</div>
                </div>
            </div>

            <div class="table-container">
                <div class="table-header">
                    <h2>Últimas Solicitudes</h2>
                    <button class="btn-secondary" onclick="document.querySelector('[data-view=\\'cambios\\']').click()">Ver Detalles</button>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Solicitante</th>
                            <th>Reemplazo</th>
                            <th>Motivo</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${myRequests.slice(0, 5).reverse().map(req => {
        const solicitante = state.users.find(u => u.id == req.monitor_solicitante_id);
        const reemplazo = state.users.find(u => u.id == req.monitor_reemplazo_id);
        let badgeClass = 'badge-warning', textStatus = 'Pendiente';
        if (parseInt(req.reemplazo_acepto) === 0 && req.estado !== 'aprobada' && req.estado !== 'rechazada') { badgeClass = 'badge-warning'; textStatus = 'Esp. reemplazo'; }
        if (parseInt(req.reemplazo_acepto) === 1 && req.estado === 'pendiente') { badgeClass = 'badge-info'; textStatus = 'Esp. admin'; }
        if (req.estado === 'aprobada') { badgeClass = 'badge-success'; textStatus = 'Aprobado'; }
        if (req.estado === 'rechazada') { badgeClass = 'badge-error'; textStatus = 'Rechazado'; }
        return `
                            <tr>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(solicitante?.nombre)}</div>
                                        <span style="font-weight:500">${solicitante?.nombre || 'N/A'}</span>
                                    </div>
                                </td>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(reemplazo?.nombre)}</div>
                                        <span>${reemplazo?.nombre || 'N/A'}</span>
                                    </div>
                                </td>
                                <td><span style="color:var(--text-secondary)">${req.motivo}</span></td>
                                <td><span class="status-badge ${badgeClass}">${textStatus}</span></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function renderUsuarios() {
    if (state.currentUser.rol !== 'admin') return '<h2 style="color:var(--status-error)">Acceso Denegado</h2>';

    const pendientes = state.users.filter(u => u.estado_cuenta === 'pendiente');
    const registrados = state.users.filter(u => u.estado_cuenta !== 'pendiente' && u.estado_cuenta !== 'rechazado');

    return `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Equipo de Trabajo</h1>
                    <p>Gestiona los permisos y accesos de todo el personal</p>
                </div>
                <button class="btn-primary" id="btn-add-user">
                    <i class="fa-solid fa-plus"></i> <span>Añadir Usuario</span>
                </button>
            </div>

            ${pendientes.length > 0 ? `
            <div class="table-container" style="margin-bottom: 2rem;">
                <div class="table-header"><h2 style="color:var(--accent-primary)">Solicitudes de Registro Pendientes (${pendientes.length})</h2></div>
                <table>
                    <thead>
                        <tr>
                            <th>Usuario</th><th>Cédula</th><th>Promedio</th><th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pendientes.map(u => `
                            <tr>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(u.nombre)}</div>
                                        <div>
                                            <strong style="color:var(--text-primary); display:block">${u.nombre}</strong>
                                            <span style="font-size:0.75rem; color:var(--text-muted)">${u.correo || 'Sin correo'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>${u.cedula}</td>
                                <td><span class="status-badge ${parseFloat(u.promedio) >= 4.0 ? 'badge-success' : 'badge-warning'}">${u.promedio ? (parseFloat(u.promedio) === 5 ? '5' : parseFloat(u.promedio).toFixed(1)) : 'N/A'}</span></td>
                                <td>
                                    <div class="action-menu">
                                        <button class="action-btn-small approve" onclick="updateUserStatus(${u.id}, 'aprobado')" title="Aprobar"><i class="fa-solid fa-check"></i></button>
                                        <button class="action-btn-small delete" onclick="updateUserStatus(${u.id}, 'rechazado')" title="Rechazar"><i class="fa-solid fa-xmark"></i></button>
                                        <button class="action-btn-small info" onclick="viewUserAvailability(${u.id})" title="Ver Disponibilidad"><i class="fa-solid fa-calendar"></i></button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>` : ''}

            <div class="table-container">
                <div class="table-header"><h2>Directorio Completo</h2></div>
                <table>
                    <thead>
                        <tr>
                            <th>Usuario</th><th>Cédula</th><th>Rol / Permisos</th><th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registrados.map(u => `
                            <tr>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(u.nombre)}</div>
                                        <div>
                                            <strong style="color:var(--text-primary); display:block">${u.nombre}</strong>
                                            <span style="font-size:0.75rem; color:var(--text-muted)">UTP Access</span>
                                        </div>
                                    </div>
                                </td>
                                <td>${u.cedula}</td>
                                <td>
                                    <span class="status-badge ${u.rol === 'admin' ? 'badge-role' : 'badge-info'}">
                                        <i class="fa-solid ${u.rol === 'admin' ? 'fa-shield' : 'fa-user'}"></i>
                                        ${u.rol === 'admin' ? 'Admin' : 'Monitor'}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-menu">
                                        <button class="action-btn-small edit"><i class="fa-solid fa-pen"></i></button>
                                        <button class="action-btn-small delete" onclick="deleteUser(${u.id})"><i class="fa-solid fa-trash"></i></button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function renderSalas() {
    if (state.currentUser.rol !== 'admin') return '<h2 style="color:var(--status-error)">Acceso Denegado</h2>';
    return `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Infraestructura Física</h1>
                    <p>Control de salas de cómputo y sus horarios de apertura</p>
                </div>
                <button class="btn-primary" id="btn-add-room">
                    <i class="fa-solid fa-plus"></i> <span>Nueva Sala</span>
                </button>
            </div>
            <div class="table-container">
                <div class="table-header"><h2>Inventario de Salas</h2></div>
                <table>
                    <thead>
                        <tr>
                            <th>Sala</th><th>Ubicación</th><th>Capacidad</th><th>Horario Abierta</th><th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.rooms.map(r => `
                            <tr>
                                <td><strong style="color:var(--text-primary)">${r.nombre}</strong></td>
                                <td><span style="color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
                                    <i class="fa-solid fa-location-dot" style="color:var(--text-muted)"></i> ${r.ubicacion}
                                </span></td>
                                <td>${r.capacidad} Equipos</td>
                                <td><span class="status-badge badge-role">
                                    ${r.hora_apertura ? r.hora_apertura.substring(0, 5) : '08:00'} - ${r.hora_cierre ? r.hora_cierre.substring(0, 5) : '22:00'}
                                </span></td>
                                <td>
                                    <div class="action-menu">
                                        <button class="action-btn-small delete" onclick="deleteRoom(${r.id})" title="Eliminar Sala">
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
}

function renderAsignaciones() {
    const isAdmin = state.currentUser.rol === 'admin';
    const visibleAssignments = isAdmin
        ? state.assignments
        : state.assignments.filter(a => a.monitor_id == state.currentUser.id);

    return `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Asignaciones</h1>
                    <p>${isAdmin ? 'Relación de monitores y bloques horarios' : 'Tus turnos asignados'}</p>
                </div>
                ${isAdmin ? `
                <button class="btn-primary" id="btn-add-assignment">
                    <i class="fa-solid fa-link"></i> <span>Vincular Monitor</span>
                </button>` : ''}
            </div>
            <div class="table-container">
                <div class="table-header"><h2>${isAdmin ? 'Agenda General' : 'Mis Turnos'}</h2></div>
                ${visibleAssignments.length === 0 ? `
                    <div style="padding:2rem; text-align:center; color:var(--text-muted);">
                        <i class="fa-regular fa-calendar-xmark" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
                        No tienes turnos asignados actualmente.
                    </div>` : `
                <table>
                    <thead>
                        <tr>
                            <th>Espacio</th><th>Día</th><th>Rango Horario</th><th>Monitor a Cargo</th>
                            ${isAdmin ? '<th>Acciones</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${visibleAssignments.map(a => {
        const sched = state.schedules.find(s => s.id == a.horario_id);
        const room = state.rooms.find(r => r.id == sched?.sala_id);
        const monitor = state.users.find(u => u.id == a.monitor_id);
        return `
                            <tr>
                                <td><strong style="color:var(--text-primary)">
    ${room ? (room.nombre !== room.ubicacion ? `${room.nombre} - ${room.ubicacion}` : room.ubicacion) : 'N/A'}
</strong></td>
                                <td><span class="status-badge badge-role">${sched?.dia || 'N/A'}</span></td>
                                <td><span style="font-weight:500">
                                    ${sched?.hora_inicio ? sched.hora_inicio.substring(0, 5) : '??'} -
                                    ${sched?.hora_fin ? sched.hora_fin.substring(0, 5) : '??'}
                                </span></td>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(monitor?.nombre || 'N/A')}</div>
                                        <span>${isAdmin ? (monitor?.nombre || 'N/A') : '<strong style="color:var(--status-success)">Tú</strong>'}</span>
                                    </div>
                                </td>
                                ${isAdmin ? `
                                <td>
                                    <div class="action-menu">
                                        <button class="action-btn-small delete" onclick="deleteAssignment(${a.id})" title="Desvincular">
                                            <i class="fa-solid fa-unlink"></i>
                                        </button>
                                    </div>
                                </td>` : ''}
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>`}
            </div>
        </div>`;
}

function renderCambios() {
    const isAdmin = state.currentUser.rol === 'admin';
    const uid = parseInt(state.currentUser.id);

    const visibleRequests = isAdmin
        ? state.shiftRequests
        : state.shiftRequests.filter(req =>
            parseInt(req.monitor_solicitante_id) === uid ||
            parseInt(req.monitor_reemplazo_id) === uid
        );

    return `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Cambios de Turno</h1>
                    <p>Bandeja de solicitudes y novedades</p>
                </div>
                ${!isAdmin ? `
                <button class="btn-primary" id="btn-request-change">
                    <i class="fa-solid fa-hand"></i> <span>Solicitar Reemplazo</span>
                </button>` : ''}
            </div>
            <div class="table-container">
                <div class="table-header"><h2>Historial de Peticiones</h2></div>
                ${visibleRequests.length === 0 ? `
                    <div style="padding:2rem; text-align:center; color:var(--text-muted);">
                        <i class="fa-regular fa-inbox" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
                        No tienes solicitudes de cambio registradas.
                    </div>` : `
                <table>
                    <thead>
                        <tr>
                            <th>Detalle del Turno</th>
                            <th>Titular → Reemplazo</th>
                            <th>Justificación</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${visibleRequests.slice().reverse().map(req => {
        const assign = state.assignments.find(a => a.id == req.asignacion_id);
        const sched = state.schedules.find(s => s.id == assign?.horario_id);
        const room = state.rooms.find(r => r.id == sched?.sala_id);
        const titular = state.users.find(u => u.id == req.monitor_solicitante_id);
        const reemplazo = state.users.find(u => u.id == req.monitor_reemplazo_id);

        const isSolicitante = parseInt(req.monitor_solicitante_id) === uid;
        const isReemplazo = parseInt(req.monitor_reemplazo_id) === uid;
        const reemplazoPendiente = parseInt(req.reemplazo_acepto) === 0 && req.estado !== 'rechazada' && req.estado !== 'aprobada';
        const reemplazConfirmo = parseInt(req.reemplazo_acepto) === 1;

        let badgeClass = 'badge-warning', textStatus = 'Pendiente';
        if (reemplazoPendiente) { badgeClass = 'badge-warning'; textStatus = 'Esperando reemplazo'; }
        if (reemplazConfirmo && req.estado === 'pendiente') { badgeClass = 'badge-info'; textStatus = 'Esperando admin'; }
        if (req.estado === 'aprobada') { badgeClass = 'badge-success'; textStatus = 'Aprobado'; }
        if (req.estado === 'rechazada') { badgeClass = 'badge-error'; textStatus = 'Rechazado'; }

        let actionsHtml = '';

        if (isAdmin) {
            if (reemplazConfirmo && req.estado === 'pendiente') {
                actionsHtml = `
                                        <button class="action-btn-small approve" onclick="updateRequestStatus(${req.id}, 'aprobada')" title="Aprobar solicitud">
                                            <i class="fa-solid fa-check"></i>
                                        </button>
                                        <button class="action-btn-small delete" onclick="updateRequestStatus(${req.id}, 'rechazada')" title="Rechazar solicitud">
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>`;
            } else if (reemplazoPendiente) {
                actionsHtml = `<span style="font-size:0.72rem; color:var(--text-muted);">Esperando a ${reemplazo?.nombre?.split(' ')[0] || '...'}</span>`;
            } else {
                actionsHtml = `<span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Procesado</span>`;
            }
        } else if (isReemplazo && reemplazoPendiente) {
            // ✅ El reemplazo confirma PRIMERO — botones sin confirm() nativo
            actionsHtml = `
                                    <div style="display:flex; gap:6px;">
                                        <button class="action-btn-small approve" onclick="acceptReplacement(${req.id}, true)" title="Aceptar reemplazo">
                                            <i class="fa-solid fa-check"></i>
                                        </button>
                                        <button class="action-btn-small delete" onclick="acceptReplacement(${req.id}, false)" title="Rechazar reemplazo">
                                            <i class="fa-solid fa-xmark"></i>
                                        </button>
                                    </div>`;
        } else if (isReemplazo && reemplazConfirmo) {
            actionsHtml = `<span style="font-size:0.72rem; color:#3b82f6;">✓ Confirmado — en revisión del admin</span>`;
        } else if (isSolicitante && reemplazoPendiente) {
            actionsHtml = `<span style="font-size:0.72rem; color:var(--text-muted);">Esperando a ${reemplazo?.nombre?.split(' ')[0] || '...'}...</span>`;
        } else if (isSolicitante && reemplazConfirmo) {
            actionsHtml = `<span style="font-size:0.72rem; color:var(--text-muted);">En revisión del admin...</span>`;
        } else {
            actionsHtml = `<span style="font-size:0.72rem; color:var(--text-muted);">—</span>`;
        }

        return `
                            <tr>
                                <td>
                                    <div style="font-weight:600; color:var(--text-primary)">${room?.nombre || 'N/A'}</div>
                                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
                                        <i class="fa-regular fa-calendar"></i>
                                        ${sched?.dia || 'N/A'}${req.fecha_reemplazo ? ` <strong style="color:var(--accent-primary)">${req.fecha_reemplazo}</strong>` : ''} |
                                        ${sched?.hora_inicio ? sched.hora_inicio.substring(0, 5) : '??'} -
                                        ${sched?.hora_fin ? sched.hora_fin.substring(0, 5) : '??'}
                                    </div>
                                </td>
                                <td>
                                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                                        <div class="user-cell" style="gap:6px;">
                                            <div class="table-avatar">${getInitials(titular?.nombre)}</div>
                                            <span style="font-size:0.8rem">${titular?.nombre?.split(' ')[0] || 'N/A'}</span>
                                        </div>
                                        <i class="fa-solid fa-arrow-right" style="color:var(--text-muted); font-size:0.75rem;"></i>
                                        <div class="user-cell" style="gap:6px;">
                                            <div class="table-avatar">${getInitials(reemplazo?.nombre)}</div>
                                            <span style="font-size:0.8rem">${reemplazo?.nombre?.split(' ')[0] || 'N/A'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td><span style="color:var(--text-secondary)">${req.motivo}</span></td>
                                <td><span class="status-badge ${badgeClass}">${textStatus}</span></td>
                                <td><div class="action-menu">${actionsHtml}</div></td>
                            </tr>`;
    }).join('')}
                    </tbody>
                </table>`}
            </div>
        </div>`;
}

// ==========================================
// EVENT LISTENERS & MODALS
// ==========================================

function attachEventListeners(view) {
    if (view === 'usuarios') {
        const btnAdd = document.getElementById('btn-add-user');
        if (btnAdd) {
            btnAdd.addEventListener('click', () => {
                openModal('Registrar Miembro', `
                    <form id="form-user" onsubmit="handleUserSubmit(event)">
                        <div class="form-group">
                            <label>Nombre Completo</label>
                            <input type="text" id="u-name" class="form-control" required placeholder="Ej. Juan Pérez">
                        </div>
                        <div class="form-group">
                            <label>Cédula</label>
                            <input type="text" id="u-cedula" class="form-control" required placeholder="Ej. 1088...">
                        </div>
                        <div class="form-group">
                            <label>Contraseña Inicial</label>
                            <input type="text" id="u-pass" class="form-control" required value="12345">
                        </div>
                        <div class="form-group">
                            <label>Rol en el sistema</label>
                            <select id="u-role" class="form-control" required>
                                <option value="monitor">Monitor</option>
                                ${state.currentUser.cedula !== '987654321' ? '<option value="admin">Administrador</option>' : ''}
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary close-modal-btn">Cancelar</button>
                            <button type="submit" class="btn-primary">Guardar Usuario</button>
                        </div>
                    </form>`);
            });
        }
    }

    if (view === 'salas') {
        const btnAddRoom = document.getElementById('btn-add-room');
        if (btnAddRoom) {
            btnAddRoom.addEventListener('click', () => {
                openModal('Registrar Sala', `
                    <form id="form-room" onsubmit="handleRoomSubmit(event)">
                        <div class="form-group">
                            <label>Nombre de la Sala</label>
                            <input type="text" id="r-name" class="form-control" required placeholder="Ej. Sala A - Sistemas">
                        </div>
                        <div class="form-group">
                            <label>Ubicación</label>
                            <input type="text" id="r-location" class="form-control" required placeholder="Ej. Bloque 3 - Piso 1">
                        </div>
                        <div class="form-group">
                            <label>Capacidad (N° Equipos)</label>
                            <input type="number" id="r-capacity" class="form-control" required placeholder="Ej. 30" min="1">
                        </div>
                        <div class="form-group" style="display:flex; gap:1rem;">
                            <div style="flex:1">
                                <label>Hora Apertura</label>
                                <input type="time" id="r-open" class="form-control" required value="08:00">
                            </div>
                            <div style="flex:1">
                                <label>Hora Cierre</label>
                                <input type="time" id="r-close" class="form-control" required value="22:00">
                            </div>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary close-modal-btn">Cancelar</button>
                            <button type="submit" class="btn-primary">Guardar Sala</button>
                        </div>
                    </form>`);
            });
        }
    }

    if (view === 'asignaciones') {
        const btnAddAssignment = document.getElementById('btn-add-assignment');
        if (btnAddAssignment) {
            btnAddAssignment.addEventListener('click', () => {
                const monitors = state.users.filter(u => u.rol === 'monitor');
                openModal('Vincular Monitor a Horario', `
                    <form id="form-assignment" onsubmit="handleAssignmentSubmit(event)">
                        <div class="form-group">
                            <label>Sala</label>
                            <select id="a-room" class="form-control" required>
                                ${state.rooms.map(r => `<option value="${r.id}">${r.nombre !== r.ubicacion ? `${r.nombre} - ${r.ubicacion}` : r.ubicacion}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Día de la semana</label>
                            <select id="a-day" class="form-control" required>
                                <option value="Lunes">Lunes</option>
                                <option value="Martes">Martes</option>
                                <option value="Miércoles">Miércoles</option>
                                <option value="Jueves">Jueves</option>
                                <option value="Viernes">Viernes</option>
                                <option value="Sábado">Sábado</option>
                            </select>
                        </div>
                        <div class="form-group" style="display:flex; gap:1rem;">
                            <div style="flex:1">
                                <label>Hora Inicio</label>
                                <input type="time" id="a-start" class="form-control" required>
                            </div>
                            <div style="flex:1">
                                <label>Hora Fin</label>
                                <input type="time" id="a-end" class="form-control" required>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Monitor a Asignar</label>
                            <select id="a-monitor" class="form-control" required>
                                ${monitors.map(m => `<option value="${m.id}">${m.nombre} - ${m.cedula}</option>`).join('')}
                            </select>
                        </div>
                        <div class="form-actions">
                            <button type="button" class="btn-secondary close-modal-btn">Cancelar</button>
                            <button type="submit" class="btn-primary">Vincular Monitor</button>
                        </div>
                    </form>`);
            });
        }
    }

    if (view === 'cambios') {
        const btnRequest = document.getElementById('btn-request-change');
        if (btnRequest) {
            btnRequest.addEventListener('click', () => {
                const myAssignments = state.assignments.filter(a => a.monitor_id == state.currentUser.id);
                const otherMonitors = state.users.filter(u => u.rol === 'monitor' && u.id != state.currentUser.id);

                if (myAssignments.length === 0) {
                    showToast('error', 'Sin Asignaciones', 'No tienes turnos asignados para ceder.');
                    return;
                }

                    openModal('Solicitar Reemplazo', `
                        <form id="form-change" onsubmit="handleChangeSubmit(event)">
                            <div class="form-group">
                                <label>Turno a reemplazar</label>
                                <select id="c-assignment" class="form-control" required>
                                    ${myAssignments.map(a => {
                                        const sched = state.schedules.find(s => s.id == a.horario_id);
                                        const room = state.rooms.find(r => r.id == sched?.sala_id);
                                        return `<option value="${a.id}">${room ? (room.nombre !== room.ubicacion ? `${room.nombre} - ${room.ubicacion}` : room.ubicacion) : 'N/A'} | ${sched?.dia || 'N/A'} ${sched?.hora_inicio ? sched.hora_inicio.substring(0, 5) : '??'}-${sched?.hora_fin ? sched.hora_fin.substring(0, 5) : '??'}</option>`;
                                    }).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Monitor Reemplazo</label>
                                <select id="c-replacement" class="form-control" required>
                                    ${otherMonitors.map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}
                                </select>
                            </div>
                                <div class="form-group">
                                    <label>Motivo de la solicitud</label>
                                    <textarea id="c-reason" class="form-control" rows="3" required placeholder="Ej: Cita médica, cruce con parcial..."></textarea>
                                </div>
                                <div class="form-actions">
                                    <button type="button" class="btn-secondary close-modal-btn">Cancelar</button>
                                    <button type="submit" class="btn-primary">Enviar Solicitud</button>
                                </div>
                        </form>`);
            });
        }
    }
}

function openModal(title, contentHtml) {
    modalTitle.textContent = title;
    modalBody.innerHTML = contentHtml;
    modalOverlay.classList.add('active');
}

function closeModal() {
    modalOverlay.classList.remove('active');
}

// ==========================================
// FORM HANDLERS (Real DB Interactions)
// ==========================================

window.handleUserSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const formData = new FormData();
    formData.append('action', 'add_user');
    formData.append('name', document.getElementById('u-name').value);
    formData.append('cedula', document.getElementById('u-cedula').value);
    formData.append('password', document.getElementById('u-pass').value);
    formData.append('role', document.getElementById('u-role').value);
    if (state.currentUser && state.currentUser.id) {
        formData.append('creado_por', state.currentUser.id);
    }
    try {
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            showToast('success', 'Usuario Registrado', data.message);
            await loadStateFromDB();
            closeModal();
            loadView('usuarios');
        } else {
            showToast('error', 'No se pudo guardar', data.message);
        }
    } catch (err) {
        showToast('error', 'Error de red', 'No hay conexión con la base de datos.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Usuario';
    }
};

window.deleteUser = async (id) => {
    if (id === state.currentUser.id) {
        showToast('error', 'Acción Inválida', 'No puedes eliminarte a ti mismo.');
        return;
    }
    openModal('Confirmar eliminación', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Estás seguro de revocar permanentemente el acceso a este usuario?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-delete-user" style="background:var(--status-error)">Sí, eliminar</button>
        </div>`);
    document.getElementById('btn-confirm-delete-user').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'delete_user');
        formData.append('id', id);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Usuario Eliminado', data.message);
                await loadStateFromDB();
                loadView('usuarios');
            } else {
                showToast('error', 'No se pudo eliminar', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'No hay conexión con la base de datos.');
        }
    });
};

// ✅ FIX PRINCIPAL: sin confirm() nativo — usa modal del sistema
window.acceptReplacement = async (id, accepted) => {
    const accion = accepted ? 'aceptar' : 'rechazar';
    const btnColor = accepted ? '' : 'style="background:var(--status-error)"';

    openModal('Confirmar acción', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Estás seguro de que deseas <strong>${accion}</strong> este reemplazo?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-replacement" ${btnColor}>
                Sí, ${accion}
            </button>
        </div>`);

    document.getElementById('btn-confirm-replacement').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'accept_replacement');
        formData.append('id', id);
        formData.append('accepted', accepted ? '1' : '0');
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                const msg = accepted
                    ? 'Confirmaste el reemplazo. Ahora el admin tomará la decisión final.'
                    : 'Rechazaste el reemplazo. El solicitante será notificado.';
                showToast('success', accepted ? 'Reemplazo Aceptado' : 'Reemplazo Rechazado', msg);
                await loadStateFromDB();
                loadView('cambios');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'No hay conexión con la base de datos.');
        }
    });
};

window.updateRequestStatus = async (id, status) => {
    const accion = status === 'aprobada' ? 'aprobar' : 'rechazar';
    const btnColor = status === 'rechazada' ? 'style="background:var(--status-error)"' : '';

    openModal('Confirmar decisión', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Confirmas que deseas <strong>${accion}</strong> esta solicitud?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-status" ${btnColor}>
                Sí, ${accion}
            </button>
        </div>`);

    document.getElementById('btn-confirm-status').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'update_request_status');
        formData.append('id', id);
        formData.append('status', status);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Solicitud Actualizada', data.message);
                await loadStateFromDB();
                loadView('cambios');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'No hay conexión con la base de datos.');
        }
    });
};

window.handleChangeSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');

    const assignId    = parseInt(document.getElementById('c-assignment').value);
    const replacemeId = parseInt(document.getElementById('c-replacement').value);

    // ✅ Validar que el monitor de reemplazo no tenga un cruce horario ese día
    const targetAssign = state.assignments.find(a => a.id == assignId);
    const targetSched  = state.schedules.find(s => s.id == targetAssign?.horario_id);

    if (targetSched) {
        const toMin = t => {
            const p = String(t || '0:0').split(':');
            return parseInt(p[0]) * 60 + parseInt(p[1]);
        };
        const reqStart = toMin(targetSched.hora_inicio);
        const reqEnd   = toMin(targetSched.hora_fin);

        const cross = state.assignments.find(a => {
            if (a.monitor_id != replacemeId) return false;
            const s = state.schedules.find(sc => sc.id == a.horario_id);
            if (!s || s.dia !== targetSched.dia) return false;
            return reqStart < toMin(s.hora_fin) && reqEnd > toMin(s.hora_inicio);
        });

        if (cross) {
            const crossSched   = state.schedules.find(sc => sc.id == cross.horario_id);
            const crossRoom    = state.rooms.find(r => r.id == crossSched?.sala_id);
            const replaceName  = state.users.find(u => u.id == replacemeId)?.nombre || 'El reemplazo';
            showToast('error', 'Reemplazo Imposible',
                `${replaceName} ya tiene turno en ${crossRoom?.nombre || 'otra sala'} de ` +
                `${crossSched.hora_inicio.substring(0,5)} a ${crossSched.hora_fin.substring(0,5)} ` +
                `el ${targetSched.dia}. Los horarios se cruzan.`
            );
            return;
        }
    }

    btn.disabled = true;
    btn.textContent = 'Enviando...';
    const formData = new FormData();
    formData.append('action', 'add_shift_request');
    formData.append('asignacion_id', assignId);
    formData.append('solicitante_id', state.currentUser.id);
    formData.append('reemplazo_id', replacemeId);
    formData.append('motivo', document.getElementById('c-reason').value);
    // Calcular la próxima fecha del día de la semana del turno seleccionado
    const targetAssign2 = state.assignments.find(a => a.id == assignId);
    const targetSched2 = state.schedules.find(s => s.id == targetAssign2?.horario_id);
    const diasSemana = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const diaObjetivo = diasSemana.indexOf(targetSched2?.dia || 'Lunes');
    const hoy = new Date();
    const diff = (diaObjetivo - hoy.getDay() + 7) % 7;
    const fechaAutoDate = new Date(hoy);
    fechaAutoDate.setDate(hoy.getDate() + diff);
    const fechaAuto = fechaAutoDate.toISOString().split('T')[0];
    formData.append('fecha_reemplazo', fechaAuto);
try {
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            showToast('success', 'Petición Registrada', data.message);
            await loadStateFromDB();
            closeModal();
            loadView('cambios');
        } else {
            showToast('error', 'Error', data.message);
        }
    } catch (err) {
        showToast('error', 'Error de red', 'No hay conexión con la base de datos.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar Solicitud';
    }
};

window.handleRoomSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    const formData = new FormData();
    formData.append('action', 'add_room');
    formData.append('name', document.getElementById('r-name').value);
    formData.append('location', document.getElementById('r-location').value);
    formData.append('capacity', document.getElementById('r-capacity').value);
    formData.append('open_time', document.getElementById('r-open').value);
    formData.append('close_time', document.getElementById('r-close').value);
    if (state.currentUser && state.currentUser.id) {
        formData.append('creado_por', state.currentUser.id);
    }
    try {
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            showToast('success', 'Sala Creada', data.message);
            await loadStateFromDB();
            closeModal();
            loadView('salas');
        } else {
            showToast('error', 'Error', data.message);
        }
    } catch (err) {
        showToast('error', 'Error de red', 'No hay conexión.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar Sala';
    }
};

window.handleAssignmentSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const start = document.getElementById('a-start').value;
    const end = document.getElementById('a-end').value;
    const t1 = new Date(`2000-01-01T${start}:00`);
    const t2 = new Date(`2000-01-01T${end}:00`);
    const diffHours = (t2 - t1) / (1000 * 60 * 60);

    if (diffHours < 2 || diffHours > 6) {
        showToast('error', 'Horario Inválido', 'El turno de un monitor debe ser entre 2 y 6 horas máximo.');
        return;
    }

    // Validar horario de apertura de la sala
    const selectedRoom = state.rooms.find(r => r.id == document.getElementById('a-room').value);
    if (selectedRoom) {
        const toMin = t => {
            const parts = String(t || '00:00').split(':');
            return parseInt(parts[0]) * 60 + parseInt(parts[1]);
        };
        const startMin = toMin(start);
        const endMin = toMin(end);
        const aperturaMin = toMin(selectedRoom.hora_apertura || '08:00');
        const cierreMin = toMin(selectedRoom.hora_cierre || '22:00');
        if (startMin < aperturaMin || endMin > cierreMin) {
            const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
            showToast('error', 'Fuera de Horario',
                `La sala abre a las ${fmt(aperturaMin)} y cierra a las ${fmt(cierreMin)}. El turno debe estar dentro de ese rango.`
            );
            return;
        }
    }

    const monitorId = document.getElementById('a-monitor').value;
    const roomId = document.getElementById('a-room').value;
    const day = document.getElementById('a-day').value;

    // Validar máximo 6 horas diarias del monitor
    const horasYaAsignadas = state.assignments
        .filter(a => {
            if (a.monitor_id != monitorId) return false;
            const s = state.schedules.find(sc => sc.id == a.horario_id);
            return s && s.dia === day;
        })
        .reduce((total, a) => {
            const s = state.schedules.find(sc => sc.id == a.horario_id);
            const ini = new Date(`2000-01-01T${s.hora_inicio}`);
            const fin = new Date(`2000-01-01T${s.hora_fin}`);
            return total + (fin - ini) / (1000 * 60 * 60);
        }, 0);

    if (horasYaAsignadas + diffHours > 6) {
        const monitor = state.users.find(u => u.id == monitorId);
        showToast('error', 'Límite de Horas',
            `${monitor?.nombre || 'El monitor'} ya tiene ${horasYaAsignadas}h ese día. Agregar este turno superaría las 6h permitidas.`
        );
        return;
    }

    // Helper: convierte HH:MM o HH:MM:SS a minutos (robusto ante ambos formatos de BD)
    const toMin = t => {
        const p = String(t || '0:0').split(':');
        return parseInt(p[0]) * 60 + parseInt(p[1]);
    };
    const startMin = toMin(start);
    const endMin   = toMin(end);

    // Validar que no haya otro monitor ya en esa sala ese día en ese rango
    const conflict = state.assignments.find(a => {
        const sched = state.schedules.find(s => s.id == a.horario_id);
        if (!sched) return false;
        if (sched.sala_id != roomId || sched.dia !== day) return false;
        return startMin < toMin(sched.hora_fin) && endMin > toMin(sched.hora_inicio);
    });

    if (conflict) {
        const sched   = state.schedules.find(s => s.id == conflict.horario_id);
        const monitor = state.users.find(u => u.id == conflict.monitor_id);
        showToast('error', 'Horario Ocupado',
            `${monitor?.nombre || 'Un monitor'} ya está asignado de ${sched.hora_inicio.substring(0,5)} a ${sched.hora_fin.substring(0,5)} ese día.`
        );
        return;
    }

    // Validar cruce del monitor entre salas distintas
    const monitorConflict = state.assignments.find(a => {
        if (a.monitor_id != monitorId) return false;
        const s = state.schedules.find(sc => sc.id == a.horario_id);
        if (!s || s.dia !== day) return false;
        return startMin < toMin(s.hora_fin) && endMin > toMin(s.hora_inicio);
    });

    if (monitorConflict) {
        const s       = state.schedules.find(sc => sc.id == monitorConflict.horario_id);
        const room    = state.rooms.find(r => r.id == s?.sala_id);
        const monitor = state.users.find(u => u.id == monitorId);
        showToast('error', 'Cruce de Horarios',
            `${monitor?.nombre || 'El monitor'} ya está en ${room?.nombre || 'otra sala'} de ${s.hora_inicio.substring(0,5)} a ${s.hora_fin.substring(0,5)} ese día.`
        );
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Vinculando...';
    const formData = new FormData();
    formData.append('action', 'add_assignment');
    formData.append('room_id', roomId);
    formData.append('day', day);
    formData.append('start_time', start);
    formData.append('end_time', end);
    formData.append('monitor_id', monitorId);
    try {
        const res = await fetch(API_URL, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.success) {
            showToast('success', 'Asignación Creada', data.message);
            await loadStateFromDB();
            closeModal();
            loadView('asignaciones');
        } else {
            showToast('error', 'Error', data.message);
        }
    } catch (err) {
        showToast('error', 'Error de red', 'No hay conexión.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Vincular Monitor';
    }
};

window.deleteRoom = async (id) => {
    openModal('Confirmar eliminación', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Seguro que deseas eliminar esta sala y todos sus horarios vinculados?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-delete-room" style="background:var(--status-error)">Sí, eliminar</button>
        </div>`);
    document.getElementById('btn-confirm-delete-room').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'delete_room');
        formData.append('id', id);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Sala Eliminada', data.message);
                await loadStateFromDB();
                loadView('salas');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'Sin conexión.');
        }
    });
};

window.deleteAssignment = async (id) => {
    openModal('Confirmar desvinculación', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Seguro que deseas remover a este monitor de la sala y horario?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-delete-assignment" style="background:var(--status-error)">Sí, desvincular</button>
        </div>`);
    document.getElementById('btn-confirm-delete-assignment').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'delete_assignment');
        formData.append('id', id);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Monitor Desvinculado', data.message);
                await loadStateFromDB();
                loadView('asignaciones');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'Sin conexión.');
        }
    });
};

window.updateUserStatus = async (id, status) => {
    openModal('Confirmar acción', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Estás seguro de que deseas <strong>${status === 'aprobado' ? 'aprobar' : 'rechazar'}</strong> a este usuario?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-status" style="background:var(--${status === 'aprobado' ? 'status-success' : 'status-error'})">Sí, ${status}</button>
        </div>`);
    document.getElementById('btn-confirm-status').addEventListener('click', async () => {
        closeModal();
        const formData = new FormData();
        formData.append('action', 'update_user_status');
        formData.append('id', id);
        formData.append('status', status);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Éxito', data.message);
                await loadStateFromDB();
                loadView('usuarios');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'Sin conexión.');
        }
    });
};

// ==========================================
// CONFIGURACIÓN (ADMIN)
// ==========================================

async function renderConfiguracion() {
    if (state.currentUser.rol !== 'admin') return '<h2 style="color:var(--status-error)">Acceso Denegado</h2>';

    // Cargamos la configuración y los usuarios rechazados antes de pintar
    let registrationsEnabled = true;
    let rejectedUsers = [];

    try {
        const fd = new FormData();
        fd.append('action', 'get_settings');
        const res = await fetch(API_URL, { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) registrationsEnabled = data.config.registrations_enabled;
    } catch (e) { /* silencioso */ }

    rejectedUsers = state.users.filter(u => u.estado_cuenta === 'rechazado');

    const html = `
        <div class="view-section">
            <div class="page-header">
                <div class="page-title">
                    <h1>Configuración del Sistema</h1>
                    <p>Administra las opciones globales de la plataforma</p>
                </div>
            </div>

            <!-- Tarjeta: Inscripciones -->
            <div class="table-container" style="margin-bottom: 1.5rem;">
                <div class="table-header">
                    <h2><i class="fa-solid fa-door-open" style="margin-right:8px; color:var(--accent-primary)"></i>Ventana de Inscripciones</h2>
                </div>
                <div style="padding: 1.5rem; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <p style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">
                            Permitir nuevas solicitudes de registro
                        </p>
                        <p style="font-size:0.85rem; color:var(--text-muted);">
                            Cuando esté activo, los aspirantes a monitor podrán enviar su solicitud desde la pantalla de login.
                        </p>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span id="reg-status-label" style="font-size:0.85rem; font-weight:600; color:${registrationsEnabled ? 'var(--status-success)' : 'var(--text-muted)'}">
                            ${registrationsEnabled ? 'Activas' : 'Cerradas'}
                        </span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="toggle-registrations" ${registrationsEnabled ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Tarjeta: Solicitudes rechazadas -->
            <div class="table-container">
                <div class="table-header">
                    <h2><i class="fa-solid fa-ban" style="margin-right:8px; color:var(--status-error)"></i>Solicitudes Rechazadas</h2>
                    <button class="btn-primary" id="btn-clean-rejected" style="background:var(--status-error)" ${rejectedUsers.length === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
                        <i class="fa-solid fa-broom"></i> Limpiar todo (${rejectedUsers.length})
                    </button>
                </div>

                ${rejectedUsers.length === 0 ? `
                    <div style="padding:2rem; text-align:center; color:var(--text-muted);">
                        <i class="fa-regular fa-circle-check" style="font-size:2rem; margin-bottom:0.5rem; display:block; color:var(--status-success)"></i>
                        No hay solicitudes rechazadas en este momento.
                    </div>
                ` : `
                <table>
                    <thead>
                        <tr>
                            <th>Solicitante</th>
                            <th>Cédula</th>
                            <th>Promedio</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rejectedUsers.map(u => `
                            <tr>
                                <td>
                                    <div class="user-cell">
                                        <div class="table-avatar">${getInitials(u.nombre)}</div>
                                        <div>
                                            <strong style="color:var(--text-primary); display:block">${u.nombre}</strong>
                                            <span style="font-size:0.75rem; color:var(--text-muted)">${u.correo || 'Sin correo'}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>${u.cedula}</td>
                                <td>
                                    <span class="status-badge ${parseFloat(u.promedio) >= 4.0 ? 'badge-success' : 'badge-warning'}">
                                        ${u.promedio ? parseFloat(u.promedio).toFixed(1) : 'N/A'}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-menu">
                                        <button class="action-btn-small approve" onclick="restoreRejected(${u.id}, 'pendiente')" title="Mover a Pendiente">
                                            <i class="fa-solid fa-rotate-left"></i>
                                        </button>
                                        <button class="action-btn-small info" onclick="restoreRejected(${u.id}, 'aprobado')" title="Aprobar Directamente">
                                            <i class="fa-solid fa-check"></i>
                                        </button>
                                        <button class="action-btn-small delete" onclick="deleteUser(${u.id})" title="Eliminar Permanentemente">
                                            <i class="fa-solid fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>`}
            </div>
        </div>`;

    // Usamos setTimeout para que el DOM esté listo antes de adjuntar listeners
    setTimeout(() => {
        const toggle = document.getElementById('toggle-registrations');
        if (toggle) {
            toggle.addEventListener('change', async (e) => {
                const enabled = e.target.checked;
                const label = document.getElementById('reg-status-label');
                if (label) {
                    label.textContent = enabled ? 'Activas' : 'Cerradas';
                    label.style.color = enabled ? 'var(--status-success)' : 'var(--text-muted)';
                }
                const fd = new FormData();
                fd.append('action', 'update_settings');
                fd.append('registrations_enabled', enabled);
                try {
                    const res = await fetch(API_URL, { method: 'POST', body: fd });
                    const data = await res.json();
                    showToast(
                        data.success ? 'success' : 'error',
                        data.success ? (enabled ? 'Inscripciones abiertas' : 'Inscripciones cerradas') : 'Error',
                        data.message
                    );
                } catch (err) {
                    showToast('error', 'Error de red', 'No hay conexión con el servidor.');
                }
                // Sincronizar visibilidad del footer de registro en la pantalla de login
                const loginFooter = document.querySelector('.login-footer');
                if (loginFooter) loginFooter.style.display = enabled ? '' : 'none';
            });
        }

        const btnClean = document.getElementById('btn-clean-rejected');
        if (btnClean && !btnClean.disabled) {
            btnClean.addEventListener('click', () => {
                openModal('Confirmar limpieza', `
                    <p style="margin-bottom:0.5rem; color:var(--text-secondary)">
                        Esto eliminará <strong>permanentemente</strong> los ${rejectedUsers.length} registro(s) con estado <em>rechazado</em>.
                    </p>
                    <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:1.5rem;">
                        Al hacerlo, esas personas podrán volver a inscribirse cuando se abra la próxima ventana de registro.
                    </p>
                    <div class="form-actions">
                        <button class="btn-secondary close-modal-btn">Cancelar</button>
                        <button class="btn-primary" id="btn-confirm-clean" style="background:var(--status-error)">
                            <i class="fa-solid fa-broom"></i> Sí, limpiar
                        </button>
                    </div>`);

                document.getElementById('btn-confirm-clean').addEventListener('click', async () => {
                    closeModal();
                    const fd = new FormData();
                    fd.append('action', 'delete_rejected_users');
                    try {
                        const res = await fetch(API_URL, { method: 'POST', body: fd });
                        const data = await res.json();
                        if (data.success) {
                            showToast('success', 'Limpieza completada', `Se eliminaron ${rejectedUsers.length} solicitud(es) rechazada(s).`);
                            await loadStateFromDB();
                            loadView('configuracion');
                        } else {
                            showToast('error', 'Error', data.message);
                        }
                    } catch (err) {
                        showToast('error', 'Error de red', 'No hay conexión con el servidor.');
                    }
                });
            });
        }
    }, 50);

    return html;
}

window.restoreRejected = async (id, newStatus) => {
    const accion = newStatus === 'pendiente' ? 'mover a pendiente' : 'aprobar directamente';
    const btnColor = newStatus === 'aprobado' ? 'var(--status-success)' : newStatus === 'pendiente' ? '#f59e0b' : 'var(--accent-primary)';

    openModal('Confirmar cambio de estado', `
        <p style="margin-bottom:1.5rem; color:var(--text-secondary)">
            ¿Confirmas que deseas <strong>${accion}</strong> a este usuario?
        </p>
        <div class="form-actions">
            <button class="btn-secondary close-modal-btn">Cancelar</button>
            <button class="btn-primary" id="btn-confirm-restore" style="background:${btnColor}">
                Sí, confirmar
            </button>
        </div>`);

    document.getElementById('btn-confirm-restore').addEventListener('click', async () => {
        closeModal();
        const fd = new FormData();
        fd.append('action', 'update_user_status');
        fd.append('id', id);
        fd.append('status', newStatus);
        try {
            const res = await fetch(API_URL, { method: 'POST', body: fd });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Estado actualizado', data.message);
                await loadStateFromDB();
                loadView('configuracion');
            } else {
                showToast('error', 'Error', data.message);
            }
        } catch (err) {
            showToast('error', 'Error de red', 'Sin conexión.');
        }
    });
};

window.viewUserAvailability = (id) => {
    const user = state.users.find(u => u.id == id);
    if (!user) return;
    
    let html = '<div style="display:grid; grid-template-columns: repeat(3, 1fr); gap:10px;">';
    let disponibilidades = [];
    try {
        if (user.disponibilidad) disponibilidades = JSON.parse(user.disponibilidad);
    } catch (e) {}

    if (disponibilidades.length === 0) {
        html = '<p>No hay horarios registrados.</p>';
    } else {
        const porDia = {};
        disponibilidades.forEach(d => {
            if (!porDia[d.dia]) porDia[d.dia] = [];
            porDia[d.dia].push(d.hora);
        });
        
        for (const [dia, horas] of Object.entries(porDia)) {
            html += `<div style="background:var(--bg-secondary); padding:10px; border-radius:6px; border:1px solid var(--border-color);">
                <strong style="color:var(--accent-primary); display:block; margin-bottom:6px;">${dia}</strong>
                ${horas.sort().map(h => `<span style="display:inline-block; background:var(--bg-primary); padding:2px 6px; border-radius:4px; font-size:0.8rem; margin:2px;">${h}</span>`).join('')}
            </div>`;
        }
        html += '</div>';
    }
    
    openModal(`Disponibilidad: ${user.nombre}`, html);
};