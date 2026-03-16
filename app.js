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
    const patients = Storage.get('patients');
    const tbody = document.getElementById('patients-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
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
}

// --- Gestión de Turnos ---
const appForm = document.getElementById('appointment-form');
if (appForm) {
    appForm.addEventListener('submit', (e) => {
        e.preventDefault();
        try {
            const id = document.getElementById('a-id') ? document.getElementById('a-id').value : '';
            if (id) {
                const current = Storage.get('appointments').find(a => a.id == id);
                if (!current) throw new Error('Turno no encontrado');
                current.patientId = document.getElementById('a-patient').value;
                current.date = document.getElementById('a-date').value;
                current.time = document.getElementById('a-time').value;
                Storage.update('appointments', current);
            } else {
                Storage.add('appointments', {
                    patientId: document.getElementById('a-patient').value,
                    date: document.getElementById('a-date').value,
                    time: document.getElementById('a-time').value,
                    status: 'Pendiente'
                });
            }
            closeModal('appointment-modal');
            appForm.reset();
            if (document.getElementById('a-id')) document.getElementById('a-id').value = '';
            loadAppointments();
            loadDashboard();
            alert('✅ Turno agendado');
        } catch (err) {
            alert(`❌ No se pudo agendar el turno.\n${err && err.message ? err.message : err}`);
        }
    });
}

function loadAppointments() {
    const appointments = Storage.get('appointments');
    const patients = Storage.get('patients');
    const tbody = document.getElementById('appointments-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    appointments.forEach(a => {
        const p = patients.find(pat => pat.id == a.patientId) || { name: 'Desconocido', lastname: '' };
        const status = a.status || 'Pendiente';
        const statusStyle = status === 'Pendiente' ? 'color: #e67e22; font-weight: bold;' : (status === 'Asistió' ? 'color: green; font-weight: bold;' : 'color: #e74c3c; font-weight: bold;');
        const actions = status === 'Pendiente'
            ? `
                <button class="btn-secondary" onclick="editAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#3498db;">Editar</button>
                <button class="btn-secondary" onclick="markAppointmentAsAttended(${a.id})" style="padding:5px 8px; font-size:11px; background:#27ae60;">Asistió</button>
                <button class="btn-secondary" onclick="cancelAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#e74c3c; margin-left:6px;">Cancelar</button>
                <button class="btn-secondary" onclick="deleteAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#7f8c8d; margin-left:6px;">Eliminar</button>
              `
            : `
                <button class="btn-secondary" onclick="editAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#3498db;">Editar</button>
                <button class="btn-secondary" onclick="reopenAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#2c3e50; margin-left:6px;">Reabrir</button>
                <button class="btn-secondary" onclick="deleteAppointment(${a.id})" style="padding:5px 8px; font-size:11px; background:#7f8c8d; margin-left:6px;">Eliminar</button>
              `;
        tbody.innerHTML += `
            <tr>
                <td>#${a.id}</td>
                <td>${a.date}</td>
                <td>${a.time}</td>
                <td>${p.name} ${p.lastname}</td>
                <td>Podólogo/a</td>
                <td><span style="${statusStyle}">${status}</span></td>
                <td>${actions}</td>
            </tr>
        `;
    });
}

window.markAppointmentAsAttended = function (id) {
    try {
        const appointment = Storage.get('appointments').find(a => a.id == id);
        if (!appointment) return;
        appointment.status = 'Asistió';
        Storage.update('appointments', appointment);
        loadAppointments();
        loadDashboard();
    } catch (err) {
        alert(`❌ No se pudo actualizar el turno.\n${err && err.message ? err.message : err}`);
    }
};

window.cancelAppointment = function (id) {
    if (!confirm('¿Cancelar este turno?')) return;
    try {
        const appointment = Storage.get('appointments').find(a => a.id == id);
        if (!appointment) return;
        appointment.status = 'Cancelado';
        Storage.update('appointments', appointment);
        loadAppointments();
        loadDashboard();
    } catch (err) {
        alert(`❌ No se pudo actualizar el turno.\n${err && err.message ? err.message : err}`);
    }
};

window.reopenAppointment = function (id) {
    try {
        const appointment = Storage.get('appointments').find(a => a.id == id);
        if (!appointment) return;
        appointment.status = 'Pendiente';
        Storage.update('appointments', appointment);
        loadAppointments();
        loadDashboard();
    } catch (err) {
        alert(`❌ No se pudo actualizar el turno.\n${err && err.message ? err.message : err}`);
    }
};

window.deleteAppointment = function (id) {
    if (!confirm('¿Eliminar este turno?')) return;
    try {
        Storage.delete('appointments', id);
        loadAppointments();
        loadDashboard();
    } catch (err) {
        alert(`❌ No se pudo eliminar el turno.\n${err && err.message ? err.message : err}`);
    }
};

window.editAppointment = function (id) {
    const a = Storage.get('appointments').find(x => x.id == id);
    if (!a) return;
    if (document.getElementById('a-id')) document.getElementById('a-id').value = a.id;
    document.getElementById('a-patient').value = a.patientId;
    document.getElementById('a-date').value = a.date;
    document.getElementById('a-time').value = a.time;
    openModal('appointment-modal');
};

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

function searchHistory() {
    const q = document.getElementById('history-search').value;
    const history = q ? Storage.get('history').filter(h => h.patientId == q) : Storage.get('history');
    const patients = Storage.get('patients');
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
}

window.deleteHistory = function (id) {
    if (confirm('¿Eliminar registro?')) {
        Storage.delete('history', id);
        searchHistory();
        loadDashboard();
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
