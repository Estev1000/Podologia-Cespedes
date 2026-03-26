// ========================================
// PODOPRO - Sistema de Gestión Podológica
// ========================================

const Storage = {
    get: (key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    },
    getOne: (key) => {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    },
    set: (key, data) => {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (e) {
            throw new Error(`StorageError: No se pudo guardar "${key}" en el navegador (${e && e.name ? e.name : 'error'})`);
        }
    },
    add: (key, item) => {
        const data = Storage.get(key);
        const numericIds = data
            .map(i => Number(i && i.id))
            .filter(n => Number.isFinite(n) && n > 0);
        const nextId = numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1;
        item.id = nextId;
        data.push(item);
        Storage.set(key, data);
        return item;
    },
    update: (key, item) => {
        const data = Storage.get(key);
        const index = data.findIndex(i => i.id == item.id);
        if (index !== -1) {
            data[index] = item;
            Storage.set(key, data);
            return true;
        }
        return false;
    },
    delete: (key, id) => {
        let data = Storage.get(key);
        data = data.filter(i => i.id != id);
        Storage.set(key, data);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupModals();
    loadDashboard();
    populateSelects();
    setupPhotoPreviews();
    setupMobileMenu();
    setupCalendarControls();
    setupNotifications();

    // Check alerts every minute
    setInterval(checkUpcomingAppointments, 60000);

    // Limpiar formulario de historial al abrirlo como nuevo
    const newHistoryBtn = document.querySelector('button[onclick*="history-modal"]');
    if (newHistoryBtn) {
        newHistoryBtn.addEventListener('click', () => {
            document.getElementById('history-form').reset();
            document.getElementById('h-id').value = '';
            clearPhotoPreviews();
        });
    }
});

function setupCalendarControls() {
    document.getElementById('cal-prev')?.addEventListener('click', () => {
        if (CalState.view === 'week') {
            if (!CalState.weekDate) CalState.weekDate = new Date();
            CalState.weekDate.setDate(CalState.weekDate.getDate() - 7);
            CalState.month = CalState.weekDate.getMonth();
            CalState.year = CalState.weekDate.getFullYear();
        } else {
            CalState.month--;
            if (CalState.month < 0) { CalState.month = 11; CalState.year--; }
        }
        renderCalendar();
    });
    document.getElementById('cal-next')?.addEventListener('click', () => {
        if (CalState.view === 'week') {
            if (!CalState.weekDate) CalState.weekDate = new Date();
            CalState.weekDate.setDate(CalState.weekDate.getDate() + 7);
            CalState.month = CalState.weekDate.getMonth();
            CalState.year = CalState.weekDate.getFullYear();
        } else {
            CalState.month++;
            if (CalState.month > 11) { CalState.month = 0; CalState.year++; }
        }
        renderCalendar();
    });
    document.getElementById('cal-today')?.addEventListener('click', () => {
        const now = new Date();
        CalState.year = now.getFullYear();
        CalState.month = now.getMonth();
        CalState.weekDate = new Date(now);
        renderCalendar();
    });
    document.querySelectorAll('.cal-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cal-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            CalState.view = tab.dataset.view;
            if (CalState.view === 'week') {
                if (!CalState.weekDate || CalState.month !== CalState.weekDate.getMonth() || CalState.year !== CalState.weekDate.getFullYear()) {
                    CalState.weekDate = new Date(CalState.year, CalState.month, 1);
                    if (CalState.month === new Date().getMonth() && CalState.year === new Date().getFullYear()) {
                        CalState.weekDate = new Date();
                    }
                }
            }
            document.querySelectorAll('.cal-view').forEach(v => v.classList.remove('active'));
            document.getElementById(`cal-view-${CalState.view}`)?.classList.add('active');
            // Cerrar panel al cambiar de vista
            document.getElementById('cal-day-panel').style.display = 'none';
            CalState.selectedDate = null;
            renderCalendar();
        });
    });
}

// --- Alarms / Notifications ---
function setupNotifications() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }
}

function checkUpcomingAppointments() {
    if (Notification.permission !== "granted") return;
    const allApps = Storage.get('appointments');
    const patients = Storage.get('patients');
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const notified = JSON.parse(sessionStorage.getItem('notified_appointments') || '[]');

    allApps.forEach(a => {
        if (a.date === todayStr && (a.status || 'Pendiente') === 'Pendiente' && !notified.includes(a.id)) {
            const [hh, mm] = a.time.split(':').map(Number);
            const appTime = new Date(); appTime.setHours(hh, mm, 0);
            const diffMin = Math.round((appTime - now) / 60000);
            if (diffMin > 0 && diffMin <= 15) {
                const p = patients.find(x => x.id == a.patientId) || { name: 'Paciente', lastname: '' };
                new Notification("Turno Próximo", { body: `En ${diffMin} min: ${p.name} ${p.lastname} a las ${a.time}`, icon: 'https://cdn-icons-png.flaticon.com/512/1048/1048953.png' });
                new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => { });
                notified.push(a.id); sessionStorage.setItem('notified_appointments', JSON.stringify(notified));
            }
        }
    });
}

window.sendWhatsAppReminder = function (id) {
    const a = Storage.get('appointments').find(x => x.id == id);
    const p = Storage.get('patients').find(x => x.id == (a?.patientId));
    if (!p?.phone) { alert("El paciente no tiene un número de teléfono registrado."); return; }
    const msg = encodeURIComponent(`Hola ${p.name}, te recordamos tu turno de podología hoy a las ${a.time}. ¡Te esperamos!`);
    const phone = p.phone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
};

function setupMobileMenu() {
    const toggle = document.getElementById('menu-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    if (toggle) {
        toggle.addEventListener('click', () => {
            document.body.classList.toggle('sidebar-open');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            document.body.classList.remove('sidebar-open');
        });
    }
}

function setupNavigation() {
    const links = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            const titleMap = {
                'dashboard': 'Dashboard',
                'patients': 'Gestión de Pacientes',
                'appointments': 'Turnos Programados',
                'history': 'Historial Clínico',
                'settings': 'Configuración'
            };
            document.getElementById('page-title').innerText = titleMap[targetId];
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            if (targetId === 'dashboard') loadDashboard();
            if (targetId === 'patients') loadPatients();
            if (targetId === 'appointments') { loadAppointments(); populateSelects(); }
            if (targetId === 'history') { populateSelects(); searchHistory(); }

            if (window.innerWidth <= 768) {
                document.body.classList.remove('sidebar-open');
            }
        });
    });
}

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    populateSelects();
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

window.openNewPatientModal = function () {
    const form = document.getElementById('patient-form');
    if (form) form.reset();
    const pid = document.getElementById('p-id');
    if (pid) pid.value = '';
    openModal('patient-modal');
};

window.openNewAppointmentModal = function () {
    const form = document.getElementById('appointment-form');
    if (form) form.reset();
    const aid = document.getElementById('a-id');
    if (aid) aid.value = '';
    const title = document.getElementById('appointment-modal-title');
    if (title) title.textContent = 'Nuevo Turno';

    const patientSearch = document.getElementById('a-patient-search');
    if (patientSearch) patientSearch.value = '';
    const results = document.getElementById('a-patient-results');
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }

    openModal('appointment-modal');

    if (typeof window.filterAppointmentPatients === 'function') {
        window.filterAppointmentPatients();
    }
};

window.openNewHistoryModal = function () {
    const form = document.getElementById('history-form');
    if (form) form.reset();
    const hid = document.getElementById('h-id');
    if (hid) hid.value = '';
    if (typeof clearPhotoPreviews === 'function') clearPhotoPreviews();
    openModal('history-modal');
};

function _escapeHtml(str) {
    return (str || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function _renderAppointmentPatientResults(patients) {
    const results = document.getElementById('a-patient-results');
    if (!results) return;

    if (!patients || patients.length === 0) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
    }

    const max = 8;
    const items = patients.slice(0, max);
    results.innerHTML = items.map(p => {
        const phone = p.phone ? ` - ${_escapeHtml(p.phone)}` : '';
        const label = `${_escapeHtml(p.name || '')} ${_escapeHtml(p.lastname || '')}${phone}`.trim();
        return `<div class="select-result-item" onclick="selectAppointmentPatient('${_escapeHtml(p.id)}')">${label}</div>`;
    }).join('');
    results.style.display = 'block';
}

window.selectAppointmentPatient = function (id) {
    const sel = document.getElementById('a-patient');
    if (sel) sel.value = id;
    const results = document.getElementById('a-patient-results');
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
};

window.filterAppointmentPatients = function () {
    const input = document.getElementById('a-patient-search');
    const select = document.getElementById('a-patient');
    if (!select) return;

    const currentValue = select.value;
    const q = (input ? input.value : '').trim().toLowerCase();

    const patients = Storage.get('patients');
    const filtered = q
        ? patients.filter(p => {
            const name = `${p.name || ''} ${p.lastname || ''}`.trim().toLowerCase();
            const phone = (p.phone || '').toString().toLowerCase();
            return name.includes(q) || phone.includes(q);
        })
        : patients;

    _renderAppointmentPatientResults(q ? filtered : []);

    select.innerHTML = '<option value="">Seleccione Paciente</option>';
    filtered.forEach(p => {
        const phoneLabel = p.phone ? ` - ${p.phone}` : '';
        select.innerHTML += `<option value="${p.id}">${p.name} ${p.lastname}${phoneLabel}</option>`;
    });

    if (currentValue && Array.from(select.options).some(o => o.value === currentValue)) {
        select.value = currentValue;
    }
};

function setupModals() {
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.classList.remove('active');
        }
    };
}

function loadDashboard() {
    const p = Storage.get('patients');
    const a = Storage.get('appointments');
    const h = Storage.get('history');
    const today = new Date().toISOString().split('T')[0];
    const todayApps = a.filter(item => item.date === today && (item.status || 'Pendiente') === 'Pendiente');

    document.getElementById('total-patients').innerText = p.length;
    document.getElementById('today-appointments').innerText = todayApps.length;
    document.getElementById('total-history').innerText = h.length;
}

// --- Gestión de Pacientes ---
const patientForm = document.getElementById('patient-form');
if (patientForm) {
    patientForm.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
            const id = document.getElementById('p-id').value;
            const patientData = {
                name: document.getElementById('p-name').value,
                lastname: document.getElementById('p-lastname').value,
                dob: document.getElementById('p-dob').value,
                phone: document.getElementById('p-phone').value,
                email: document.getElementById('p-email').value,
                diabetes: document.getElementById('p-diabetes').value,
                foottype: document.getElementById('p-foottype').value,
                shoesize: document.getElementById('p-shoesize').value
            };

            if (id) {
                patientData.id = parseInt(id);
                Storage.update('patients', patientData);
            } else {
                Storage.add('patients', patientData);
            }
            closeModal('patient-modal');
            patientForm.reset();
            loadPatients();
            loadDashboard();
            alert('✅ Paciente guardado correctamente');
        } catch (err) {
            alert(`❌ No se pudo guardar el paciente.\n${err && err.message ? err.message : err}`);
        }
    });
}

window.editPatient = function (id) {
    const p = Storage.get('patients').find(i => i.id == id);
    if (!p) return;
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-lastname').value = p.lastname;
    document.getElementById('p-dob').value = p.dob;
    document.getElementById('p-phone').value = p.phone;
    document.getElementById('p-email').value = p.email || '';
    document.getElementById('p-diabetes').value = p.diabetes || 'no';
    document.getElementById('p-foottype').value = p.foottype || '';
    document.getElementById('p-shoesize').value = p.shoesize || '';
    openModal('patient-modal');
};

function loadPatients() {
    const allPatients = Storage.get('patients');
    const searchInput = document.getElementById('patient-search');
    const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const patients = q
        ? allPatients.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.lastname && p.lastname.toLowerCase().includes(q)) ||
            (p.phone && p.phone.toLowerCase().includes(q))
        )
        : allPatients;

    const tbody = document.getElementById('patients-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (patients.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#888; padding:30px;">
            <i class='bx bx-search' style="font-size:2rem; display:block; margin-bottom:8px;"></i>
            No se encontraron pacientes${q ? ` para "<strong>${q}</strong>"` : ''}.
        </td></tr>`;
        return;
    }

    patients.forEach(p => {
        const age = new Date().getFullYear() - new Date(p.dob).getFullYear();
        const diabetesIcon = p.diabetes === 'si' ? '⚠️' : '';
        tbody.innerHTML += `
            <tr>
                <td>#${p.id}</td>
                <td>${p.name} ${diabetesIcon}</td>
                <td>${p.lastname}</td>
                <td>${age} años</td>
                <td>${p.phone}</td>
                <td>
                    <button class="btn-secondary" onclick="editPatient(${p.id})" style="padding:5px 10px; font-size:12px;">Editar</button>
                    <button class="btn-secondary" onclick="deletePatient(${p.id})" style="background:#e74c3c; padding:5px 10px; font-size:12px; margin-left:5px;">Eliminar</button>
                </td>
            </tr>
        `;
    });
}

window.deletePatient = function (id) {
    if (confirm('¿Eliminar paciente?')) {
        Storage.delete('patients', id);
        loadPatients();
        loadDashboard();
    }
};

function populateSelects() {
    const patients = Storage.get('patients');
    ['a-patient', 'h-patient'].forEach(id => {
        const sel = document.getElementById(id);
        if (sel) {
            sel.innerHTML = '<option value="">Seleccione Paciente</option>';
            patients.forEach(p => {
                sel.innerHTML += `<option value="${p.id}">${p.name} ${p.lastname}</option>`;
            });
        }
    });

    if (typeof window.filterAppointmentPatients === 'function') {
        window.filterAppointmentPatients();
    }
}

// --- Gestión de Turnos — Vista Calendario ---

// Estado del calendario
const CalState = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),  // 0-indexed
    view: 'month',
    selectedDate: null,
};

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS_SHORT_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function statusClass(status) {
    if (status === 'Asistió') return 'status-asistio';
    if (status === 'Cancelado') return 'status-cancelado';
    return 'status-pendiente';
}

function formatDateES(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return `${DAYS_SHORT_ES[dt.getDay()]} ${parseInt(d)} de ${MONTHS_ES[parseInt(m) - 1]} ${y}`;
}

function getAppointmentsForDate(dateStr) {
    const allApps = Storage.get('appointments');
    const patients = Storage.get('patients');
    return allApps
        .filter(a => a.date === dateStr)
        .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
        .map(a => {
            const p = patients.find(x => x.id == a.patientId) || { name: 'Desconocido', lastname: '' };
            return { ...a, patientName: `${p.name} ${p.lastname}` };
        });
}

// --- Renderizado principal ---
function renderCalendar() {
    const label = document.getElementById('cal-month-label');
    if (label && CalState.view !== 'week') {
        label.textContent = `${MONTHS_ES[CalState.month]} ${CalState.year}`;
    }

    if (CalState.view === 'month') renderMonthView();
    else if (CalState.view === 'week') renderWeekView();
    else if (CalState.view === 'list') renderListView();
}

// --- Vista MES ---
function renderMonthView() {
    const grid = document.getElementById('cal-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const firstDay = new Date(CalState.year, CalState.month, 1).getDay(); // 0=Dom
    const daysInMonth = new Date(CalState.year, CalState.month + 1, 0).getDate();
    const prevDays = new Date(CalState.year, CalState.month, 0).getDate();

    const allApps = Storage.get('appointments');
    const patients = Storage.get('patients');

    // Construir mapa fecha → turnos
    const appsMap = {};
    allApps.forEach(a => {
        if (!appsMap[a.date]) appsMap[a.date] = [];
        const p = patients.find(x => x.id == a.patientId) || { name: '?', lastname: '' };
        appsMap[a.date].push({ ...a, patientName: `${p.name} ${p.lastname}` });
    });

    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

    for (let i = 0; i < totalCells; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-cell';

        let dayNum, month, year, isOther = false;
        if (i < firstDay) {
            dayNum = prevDays - firstDay + 1 + i;
            month = CalState.month - 1;
            year = CalState.year;
            if (month < 0) { month = 11; year--; }
            isOther = true;
        } else if (i >= firstDay + daysInMonth) {
            dayNum = i - firstDay - daysInMonth + 1;
            month = CalState.month + 1;
            year = CalState.year;
            if (month > 11) { month = 0; year++; }
            isOther = true;
        } else {
            dayNum = i - firstDay + 1;
            month = CalState.month;
            year = CalState.year;
        }

        const mm = String(month + 1).padStart(2, '0');
        const dd = String(dayNum).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;

        if (isOther) cell.classList.add('cal-other-month');
        if (dateStr === todayStr) cell.classList.add('cal-today');
        if (dateStr === CalState.selectedDate) cell.classList.add('cal-selected');

        // Número del día
        const numEl = document.createElement('div');
        numEl.className = 'cal-day-num';
        numEl.textContent = dayNum;
        cell.appendChild(numEl);

        // Eventos del día
        const dayApps = (appsMap[dateStr] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
        const maxVisible = 2;
        dayApps.slice(0, maxVisible).forEach(a => {
            const ev = document.createElement('div');
            ev.className = `cal-event ${statusClass(a.status || 'Pendiente')}`;
            ev.innerHTML = `<span class="cal-event-dot"></span>${a.time || ''} ${a.patientName}`;
            ev.onclick = (e) => { e.stopPropagation(); openDayPanel(dateStr); };
            cell.appendChild(ev);
        });
        if (dayApps.length > maxVisible) {
            const more = document.createElement('div');
            more.className = 'cal-more';
            more.textContent = `+${dayApps.length - maxVisible} más`;
            more.onclick = (e) => { e.stopPropagation(); openDayPanel(dateStr); };
            cell.appendChild(more);
        }

        cell.onclick = () => openDayPanel(dateStr);
        grid.appendChild(cell);
    }
}

// --- Vista SEMANA ---
function renderWeekView() {
    const container = document.getElementById('cal-week-container');
    if (!container) return;

    if (!CalState.weekDate) {
        CalState.weekDate = new Date();
    }
    const today = new Date();
    const ref = new Date(CalState.weekDate);

    const startOfWeek = new Date(ref);
    startOfWeek.setDate(ref.getDate() - ref.getDay());

    // Configurar el título superior para mostrar el rango de la semana
    const label = document.getElementById('cal-month-label');
    if (label) {
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
            label.textContent = `Semana ${startOfWeek.getDate()} al ${endOfWeek.getDate()} de ${MONTHS_ES[startOfWeek.getMonth()]}`;
        } else {
            label.textContent = `Sem ${startOfWeek.getDate()} ${MONTHS_ES[startOfWeek.getMonth()]} al ${endOfWeek.getDate()} ${MONTHS_ES[endOfWeek.getMonth()]}`;
        }
    }

    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    let headerHTML = `<div class="cal-week-day-header"><div class="cal-week-day-col"></div>`;
    const weekDates = [];
    for (let d = 0; d < 7; d++) {
        const dt = new Date(startOfWeek);
        dt.setDate(startOfWeek.getDate() + d);
        const ds = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        weekDates.push(ds);
        const isToday = ds === todayStr;
        headerHTML += `<div class="cal-week-day-col${isToday ? ' cal-today-col' : ''}">
            ${DAYS_SHORT_ES[dt.getDay()]}<br><strong>${dt.getDate()}</strong>
        </div>`;
    }
    headerHTML += `</div>`;

    const hours = [];
    for (let h = 7; h <= 20; h++) hours.push(h);

    let timeSlotsHTML = '';
    hours.forEach(h => {
        timeSlotsHTML += `<div class="cal-week-time-slot">${String(h).padStart(2, '0')}:00</div>`;
    });

    const allApps = Storage.get('appointments');
    const patients = Storage.get('patients');

    let dayColsHTML = weekDates.map(ds => {
        const dayApps = allApps.filter(a => a.date === ds);
        let eventsHTML = '';
        // Draw hour lines
        for (let h = 0; h < hours.length; h++) {
            eventsHTML += `<div style="height:54px; border-bottom:1px solid #f0f0f0;"></div>`;
        }
        dayApps.forEach(a => {
            const p = patients.find(x => x.id == a.patientId) || { name: '?', lastname: '' };
            const [hh, mm] = (a.time || '08:00').split(':').map(Number);
            const topOffset = ((hh - 7) * 54) + (mm / 60 * 54);
            const status = a.status || 'Pendiente';
            const bgColor = status === 'Asistió' ? '#27ae60' : (status === 'Cancelado' ? '#e74c3c' : '#f39c12');
            eventsHTML += `<div class="cal-week-event" style="top:${topOffset}px; height:48px; background:${bgColor}20; color:${bgColor}; border-left:3px solid ${bgColor};"
                onclick="openDayPanel('${ds}')">
                ${a.time} ${p.name}
            </div>`;
        });
        return `<div class="cal-week-day-events" style="position:relative; min-height:${hours.length * 54}px;">${eventsHTML}</div>`;
    }).join('');

    container.innerHTML = `
        ${headerHTML}
        <div class="cal-week-body">
            <div class="cal-week-time-col">${timeSlotsHTML}</div>
            ${dayColsHTML}
        </div>
    `;
}

// --- Vista LISTA ---
function renderListView() {
    const body = document.getElementById('cal-list-body');
    if (!body) return;

    const allApps = Storage.get('appointments');
    const patients = Storage.get('patients');
    const q = (document.getElementById('appointment-search') || {}).value?.trim().toLowerCase() || '';
    const statusQ = (document.getElementById('appointment-status-filter') || {}).value || '';

    let apps = allApps
        .map(a => {
            const p = patients.find(x => x.id == a.patientId) || { name: 'Desconocido', lastname: '' };
            return { ...a, patientName: `${p.name} ${p.lastname}` };
        })
        .filter(a => {
            const matchText = !q || a.patientName.toLowerCase().includes(q) || (a.date || '').includes(q);
            const matchStatus = !statusQ || (a.status || 'Pendiente') === statusQ;
            return matchText && matchStatus;
        })
        .sort((a, b) => {
            const ds = (a.date || '').localeCompare(b.date || '');
            return ds !== 0 ? ds : (a.time || '').localeCompare(b.time || '');
        });

    if (apps.length === 0) {
        body.innerHTML = `<div class="cal-list-empty">
            <i class='bx bx-calendar-x'></i>
            No hay turnos${q ? ` para "<strong>${q}</strong>"` : ''}${statusQ ? ` con estado "${statusQ}"` : ''}
        </div>`;
        return;
    }

    // Agrupar por fecha
    const groups = {};
    apps.forEach(a => {
        if (!groups[a.date]) groups[a.date] = [];
        groups[a.date].push(a);
    });

    body.innerHTML = Object.keys(groups).sort().map(date => {
        const label = formatDateES(date);
        const items = groups[date].map(a => {
            const status = a.status || 'Pendiente';
            const sc = statusClass(status);
            const statusLabel = status;
            const actionsPending = status === 'Pendiente' ? `
                <button title="Asistió" onclick="calMarkAttended(${a.id})"><i class='bx bx-check'></i></button>
                <button title="Cancelar" onclick="calCancel(${a.id})" style="color:#e74c3c;"><i class='bx bx-x'></i></button>` : `
                <button title="Reabrir" onclick="calReopen(${a.id})"><i class='bx bx-revision'></i></button>`;
            return `<div class="cal-list-item">
                <div class="cal-list-status-bar ${sc}"></div>
                <div class="cal-list-info">
                    <div class="cal-list-time"><i class='bx bx-time-five'></i> ${a.time || '--:--'}</div>
                    <div class="cal-list-patient">${a.patientName}</div>
                    ${a.notes ? `<div class="cal-list-notes">${a.notes}</div>` : ''}
                </div>
                <span class="cal-list-badge ${sc}">${status}</span>
                <div class="cal-list-actions">
                    <button title="WhatsApp" onclick="sendWhatsAppReminder(${a.id})" style="color:#27ae60;"><i class='bx bxl-whatsapp'></i></button>
                    <button title="Editar" onclick="calEdit(${a.id})"><i class='bx bxs-edit'></i></button>
                    ${actionsPending}
                    <button title="Eliminar" onclick="calDelete(${a.id})" style="color:#e74c3c;"><i class='bx bxs-trash'></i></button>
                </div>
            </div>`;
        }).join('');
        return `<div class="cal-list-group">
            <div class="cal-list-date-label">${label}</div>
            ${items}
        </div>`;
    }).join('');
}

// --- Panel lateral del día ---
let _selectedDayForNew = null;

function openDayPanel(dateStr) {
    CalState.selectedDate = dateStr;
    _selectedDayForNew = dateStr;
    renderCalendar();

    const panel = document.getElementById('cal-day-panel');
    const title = document.getElementById('cal-day-panel-title');
    const panelBody = document.getElementById('cal-day-panel-body');
    if (!panel) return;

    title.textContent = formatDateES(dateStr);
    const apps = getAppointmentsForDate(dateStr);

    if (apps.length === 0) {
        panelBody.innerHTML = `<div class="cal-panel-empty"><i class='bx bx-calendar' style="font-size:2rem; display:block; margin-bottom:6px;"></i>Sin turnos este día</div>`;
    } else {
        panelBody.innerHTML = apps.map(a => {
            const status = a.status || 'Pendiente';
            const sc = statusClass(status);
            const actions = status === 'Pendiente'
                ? `<button class="cal-panel-btn-attend" onclick="calMarkAttended(${a.id})">✓ Asistió</button>
                   <button class="cal-panel-btn-cancel" onclick="calCancel(${a.id})">✗ Cancelar</button>`
                : `<button class="cal-panel-btn-reopen" onclick="calReopen(${a.id})">↩ Reabrir</button>`;
            return `<div class="cal-panel-event ${sc}">
                <div class="cal-panel-event-time"><i class='bx bx-time-five'></i> ${a.time || '--:--'}</div>
                <div class="cal-panel-event-patient"><strong>${a.patientName}</strong></div>
                ${a.notes ? `<div class="cal-panel-event-notes">${a.notes}</div>` : ''}
                <div class="cal-panel-event-actions">
                    <button class="cal-panel-btn-edit" onclick="calEdit(${a.id})">✏ Editar</button>
                    <button class="cal-panel-btn-attend" style="background:#e8fdf0; color:#27ae60;" onclick="sendWhatsAppReminder(${a.id})">📲 WhatsApp</button>
                    ${actions}
                    <button class="cal-panel-btn-delete" onclick="calDelete(${a.id})">🗑</button>
                </div>
            </div>`;
        }).join('');
    }

    panel.style.display = 'block';
}

window.closeDayPanel = function () {
    const panel = document.getElementById('cal-day-panel');
    if (panel) panel.style.display = 'none';
    CalState.selectedDate = null;
    renderCalendar();
};

window.openNewTurnoForDay = function () {
    document.getElementById('appointment-form').reset();
    document.getElementById('a-id').value = '';
    if (_selectedDayForNew) document.getElementById('a-date').value = _selectedDayForNew;
    document.getElementById('appointment-modal-title').textContent = 'Nuevo Turno';

    const patientSearch = document.getElementById('a-patient-search');
    if (patientSearch) patientSearch.value = '';
    const results = document.getElementById('a-patient-results');
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }

    openModal('appointment-modal');

    if (typeof window.filterAppointmentPatients === 'function') {
        window.filterAppointmentPatients();
    }
};

// --- Acciones rápidas del calendario ---
window.calMarkAttended = function (id) {
    const a = Storage.get('appointments').find(x => x.id == id);
    if (!a) return;
    a.status = 'Asistió';
    Storage.update('appointments', a);
    loadDashboard();
    renderCalendar();
    if (CalState.selectedDate) openDayPanel(CalState.selectedDate);
};

window.calCancel = function (id) {
    if (!confirm('¿Cancelar este turno?')) return;
    const a = Storage.get('appointments').find(x => x.id == id);
    if (!a) return;
    a.status = 'Cancelado';
    Storage.update('appointments', a);
    loadDashboard();
    renderCalendar();
    if (CalState.selectedDate) openDayPanel(CalState.selectedDate);
};

window.calReopen = function (id) {
    const a = Storage.get('appointments').find(x => x.id == id);
    if (!a) return;
    a.status = 'Pendiente';
    Storage.update('appointments', a);
    loadDashboard();
    renderCalendar();
    if (CalState.selectedDate) openDayPanel(CalState.selectedDate);
};

window.calEdit = function (id) {
    const a = Storage.get('appointments').find(x => x.id == id);
    if (!a) return;

    const patientSearch = document.getElementById('a-patient-search');
    if (patientSearch) patientSearch.value = '';
    const results = document.getElementById('a-patient-results');
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }

    if (typeof window.filterAppointmentPatients === 'function') {
        window.filterAppointmentPatients();
    }

    document.getElementById('a-id').value = a.id;
    document.getElementById('a-patient').value = a.patientId;
    document.getElementById('a-date').value = a.date;
    document.getElementById('a-time').value = a.time;
    document.getElementById('a-notes').value = a.notes || '';
    document.getElementById('appointment-modal-title').textContent = 'Editar Turno';
    openModal('appointment-modal');

    if (typeof window.filterAppointmentPatients === 'function') {
        window.filterAppointmentPatients();
    }
};

window.calDelete = function (id) {
    if (!confirm('¿Eliminar este turno?')) return;
    Storage.delete('appointments', id);
    loadDashboard();
    renderCalendar();
    if (CalState.selectedDate) openDayPanel(CalState.selectedDate);
};

// Mantener compatibilidad con funciones antiguas
window.editAppointment = window.calEdit;
window.deleteAppointment = window.calDelete;
window.markAppointmentAsAttended = window.calMarkAttended;
window.cancelAppointment = window.calCancel;
window.reopenAppointment = window.calReopen;

// --- Formulario de turno ---
const appForm = document.getElementById('appointment-form');
if (appForm) {
    appForm.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
            const id = document.getElementById('a-id').value;
            const patientId = document.getElementById('a-patient').value;
            const date = document.getElementById('a-date').value;
            const time = document.getElementById('a-time').value;
            const notes = document.getElementById('a-notes').value;

            // Validar turno duplicado (evitar doble reserva)
            const allAppointments = Storage.get('appointments');
            const isDuplicate = allAppointments.some(a =>
                a.date === date &&
                a.time === time &&
                a.status !== 'Cancelado' &&
                a.id != id // Permite editar el mismo turno sin saltar el error
            );

            if (isDuplicate) {
                alert(`⚠️ ¡ATENCIÓN! Ya existe un turno programado para el día ${date} a las ${time}.\n\nPor favor, revisa el calendario y elige otro horario para evitar sobreposiciones.`);
                return; // Detenemos el guardado
            }

            if (id) {
                const current = Storage.get('appointments').find(a => a.id == id);
                if (!current) throw new Error('Turno no encontrado');
                current.patientId = patientId; current.date = date; current.time = time; current.notes = notes;
                Storage.update('appointments', current);
            } else {
                Storage.add('appointments', { patientId, date, time, notes, status: 'Pendiente' });
            }
            closeModal('appointment-modal');
            appForm.reset();
            document.getElementById('a-id').value = '';
            document.getElementById('appointment-modal-title').textContent = 'Nuevo Turno';
            loadDashboard();
            renderCalendar();
            if (CalState.selectedDate) openDayPanel(CalState.selectedDate);
        } catch (err) {
            alert(`❌ No se pudo agendar el turno.\n${err && err.message ? err.message : err}`);
        }
    });
}

// Alias para el sistema de navegación
function loadAppointments() { renderCalendar(); }


// --- Fotos: Previsualización y Procesamiento ---
function setupPhotoPreviews() {
    const ids = [
        'h-photo-before-1', 'h-photo-before-2', 'h-photo-before-3',
        'h-photo-after-1', 'h-photo-after-2', 'h-photo-after-3'
    ];
    const prevIds = ['p-b-1', 'p-b-2', 'p-b-3', 'p-a-1', 'p-a-2', 'p-a-3'];

    ids.forEach((id, i) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                const preview = document.getElementById(prevIds[i]);
                if (file && preview) {
                    const reader = new FileReader();
                    reader.onload = (re) => {
                        preview.innerHTML = `<img src="${re.target.result}" style="width:50px; height:50px; object-fit:cover; border-radius:4px; border:1px solid #ddd;">`;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }
    });
}

function clearPhotoPreviews() {
    ['p-b-1', 'p-b-2', 'p-b-3', 'p-a-1', 'p-a-2', 'p-a-3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

async function getPhotoBase64(inputId) {
    const input = document.getElementById(inputId);
    if (!input || !input.files[0]) return null;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.readAsDataURL(input.files[0]);
    });
}

// --- Gestión de Historial Clínico ---
const historyForm = document.getElementById('history-form');
if (historyForm) {
    historyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('h-id').value;

        // Capturar fotos actuales del formulario
        const currentPhotosBefore = [
            await getPhotoBase64('h-photo-before-1'),
            await getPhotoBase64('h-photo-before-2'),
            await getPhotoBase64('h-photo-before-3')
        ];
        const currentPhotosAfter = [
            await getPhotoBase64('h-photo-after-1'),
            await getPhotoBase64('h-photo-after-2'),
            await getPhotoBase64('h-photo-after-3')
        ];

        const historyData = {
            patientId: document.getElementById('h-patient').value,
            date: document.getElementById('h-date').value,
            diagnosis: document.getElementById('h-diagnosis').value,
            treatment: document.getElementById('h-treatment').value,
            notes: document.getElementById('h-notes').value,
            photosBefore: currentPhotosBefore,
            photosAfter: currentPhotosAfter
        };

        if (id) {
            // En edición: si un slot está vacío, intentar mantener la foto anterior
            const oldRecord = Storage.get('history').find(item => item.id == id);
            if (oldRecord) {
                historyData.photosBefore = historyData.photosBefore.map((img, i) => img || (oldRecord.photosBefore ? oldRecord.photosBefore[i] : null));
                historyData.photosAfter = historyData.photosAfter.map((img, i) => img || (oldRecord.photosAfter ? oldRecord.photosAfter[i] : null));
            }
            historyData.id = parseInt(id);
            Storage.update('history', historyData);
            alert('✅ Historial actualizado');
        } else {
            Storage.add('history', historyData);
            alert('✅ Historial guardado');
        }

        closeModal('history-modal');
        historyForm.reset();
        clearPhotoPreviews();
        searchHistory();
        loadDashboard();
    });
}

window.editHistory = function (id) {
    const h = Storage.get('history').find(item => item.id == id);
    if (!h) return;
    document.getElementById('h-id').value = h.id;
    document.getElementById('h-patient').value = h.patientId;
    document.getElementById('h-date').value = h.date;
    document.getElementById('h-diagnosis').value = h.diagnosis;
    document.getElementById('h-treatment').value = h.treatment;
    document.getElementById('h-notes').value = h.notes || '';

    clearPhotoPreviews();
    const prevsBefore = ['p-b-1', 'p-b-2', 'p-b-3'];
    const prevsAfter = ['p-a-1', 'p-a-2', 'p-a-3'];

    if (h.photosBefore) {
        h.photosBefore.forEach((img, i) => {
            if (img) document.getElementById(prevsBefore[i]).innerHTML = `<img src="${img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">`;
        });
    }
    if (h.photosAfter) {
        h.photosAfter.forEach((img, i) => {
            if (img) document.getElementById(prevsAfter[i]).innerHTML = `<img src="${img}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;">`;
        });
    }
    openModal('history-modal');
};

window.searchHistory = function () {
    const q = document.getElementById('history-search').value.toLowerCase().trim();
    const patients = Storage.get('patients');

    const history = q ? Storage.get('history').filter(h => {
        const p = patients.find(pat => pat.id == h.patientId) || { name: '', lastname: '' };
        const fullName = `${p.name} ${p.lastname}`.toLowerCase();
        return h.patientId == q || fullName.includes(q);
    }) : Storage.get('history');

    const tbody = document.getElementById('history-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    history.forEach(h => {
        const p = patients.find(pat => pat.id == h.patientId) || { name: 'Desconocido', lastname: '' };
        const count = (h.photosBefore ? h.photosBefore.filter(x => x).length : 0) + (h.photosAfter ? h.photosAfter.filter(x => x).length : 0);
        tbody.innerHTML += `
            <tr>
                <td>${h.date}</td>
                <td>${p.name} ${p.lastname}</td>
                <td>${h.diagnosis.substring(0, 20)}...</td>
                <td>${h.treatment.substring(0, 20)}...</td>
                <td>${h.notes ? h.notes.substring(0, 15) + '...' : ''}</td>
                <td>
                    ${count > 0 ? `<span style="background:#3498db; color:white; padding:2px 6px; border-radius:10px; font-size:10px;">📸 ${count}</span>` : ''}
                    <button class="btn-secondary" onclick="openViewer(${h.id})" style="padding:5px 8px; font-size:11px; background:#3498db;"><i class='bx bx-show'></i> Fotos</button>
                    <button class="btn-secondary" onclick="editHistory(${h.id})" style="padding:5px 8px; font-size:11px;"><i class='bx bxs-edit'></i></button>
                    <button class="btn-secondary" onclick="deleteHistory(${h.id})" style="background:#e74c3c; padding:5px 8px; font-size:11px;"><i class='bx bxs-trash'></i></button>
                </td>
            </tr>
        `;
    });
};

window.deleteHistory = function (id) {
    if (confirm('¿Eliminar registro?')) {
        Storage.delete('history', id);
        searchHistory();
        loadDashboard();
    }
};

window.deleteAllHistory = function () {
    if (confirm('¿Está seguro de que desea borrar TODO el historial clínico? Esta acción no se puede deshacer.')) {
        Storage.set('history', []);
        searchHistory();
        loadDashboard();
        alert('Historial borrado completamente.');
    }
};

// --- Visor de Fotos con Scroll Vertical ---
window.openViewer = function (id) {
    const record = Storage.get('history').find(h => h.id == id);
    if (!record) return;
    const gallery = document.getElementById('scroll-gallery');
    gallery.innerHTML = '';

    for (let i = 0; i < 3; i++) {
        const b = record.photosBefore ? record.photosBefore[i] : null;
        const a = record.photosAfter ? record.photosAfter[i] : null;
        if (b || a) {
            const div = document.createElement('div');
            div.className = 'compare-container';
            div.style.marginBottom = "30px";
            div.innerHTML = `
                <div class="compare-box">
                    <span class="badget-before">ANTES - PAR ${i + 1}</span>
                    ${b ? `<img src="${b}">` : '<p style="color:#777">Sin foto</p>'}
                </div>
                <div class="compare-box">
                    <span class="badget-after">DESPUÉS - PAR ${i + 1}</span>
                    ${a ? `<img src="${a}">` : '<p style="color:#777">Sin foto</p>'}
                </div>
            `;
            gallery.appendChild(div);
        }
    }
    if (gallery.innerHTML === '') {
        alert("No hay fotos en este registro");
        return;
    }
    document.getElementById('photo-viewer').classList.add('active');
};

window.closeViewer = function () {
    document.getElementById('photo-viewer').classList.remove('active');
};

// --- Buscador de Pacientes para Historial ---
function _renderHistoryPatientResults(patients) {
    const results = document.getElementById('h-patient-results');
    if (!results) return;

    if (!patients || patients.length === 0) {
        results.innerHTML = '';
        results.style.display = 'none';
        return;
    }

    const max = 8;
    const items = patients.slice(0, max);
    results.innerHTML = items.map(p => {
        const phone = p.phone ? ` - ${_escapeHtml(p.phone)}` : '';
        const label = `${_escapeHtml(p.name || '')} ${_escapeHtml(p.lastname || '')}${phone}`.trim();
        return `<div class="select-result-item" onclick="selectHistoryPatient('${_escapeHtml(p.id)}')">${label}</div>`;
    }).join('');
    results.style.display = 'block';
}

window.selectHistoryPatient = function (id) {
    const sel = document.getElementById('h-patient');
    if (sel) sel.value = id;
    const results = document.getElementById('h-patient-results');
    if (results) { results.innerHTML = ''; results.style.display = 'none'; }
};

window.filterHistoryPatients = function () {
    const input = document.getElementById('h-patient-search');
    const select = document.getElementById('h-patient');
    if (!select) return;

    const currentValue = select.value;
    const q = (input ? input.value : '').trim().toLowerCase();

    const patients = Storage.get('patients');
    const filtered = q
        ? patients.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.lastname && p.lastname.toLowerCase().includes(q)) ||
            (p.phone && p.phone.toLowerCase().includes(q))
        )
        : patients;

    _renderHistoryPatientResults(q ? filtered : []);

    select.innerHTML = '<option value="">Seleccione Paciente</option>';
    filtered.forEach(p => {
        const phoneLabel = p.phone ? ` - ${p.phone}` : '';
        select.innerHTML += `<option value="${p.id}">${p.name} ${p.lastname}${phoneLabel}</option>`;
    });

    if (currentValue && Array.from(select.options).some(o => o.value === currentValue)) {
        select.value = currentValue;
    }
};

// --- Export/Import ---
window.exportPodologyData = function () {
    const data = {
        patients: Storage.get('patients'),
        appointments: Storage.get('appointments'),
        history: Storage.get('history'),
        exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `podo_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
};

window.importPodologyData = function (event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const data = JSON.parse(e.target.result);
        if (confirm('⚠️ ¿Reemplazar todos los datos actuales?')) {
            Storage.set('patients', data.patients || []);
            Storage.set('appointments', data.appointments || []);
            Storage.set('history', data.history || []);
            location.reload();
        }
    };
    reader.readAsText(file);
};
