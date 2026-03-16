// app.js - Consolidated Application Logic

const Auth = {
    getCurrentUser() {
        const userJson = localStorage.getItem('bp_current_user');
        return userJson ? JSON.parse(userJson) : null;
    },

    async register(name, email, phone, dob, username, password) {
        if (!name || !email || !phone || !dob || !username || !password) return { success: false, message: 'Todos los campos son obligatorios' };
        
        try {
            const usersRef = await db.ref('users').once('value');
            const users = usersRef.val() || {};
            
            if (Object.values(users).some(u => u.username === username)) {
                return { success: false, message: 'El nombre de usuario ya existe' };
            }

            const newId = Date.now().toString();
            const newUser = { 
                id: newId, name, email, phone, dob, 
                username, password, status: 'pending', 
                createdAt: new Date().toISOString() 
            };
            
            await db.ref(`users/${newId}`).set(newUser);
            return { success: true, message: 'Cuenta creada. Pendiente de aprobación del administrador.' };
        } catch(e) {
            console.error(e);
            return { success: false, message: 'Error de conexión con la nube.' };
        }
    },

    async login(username, password) {
        if (username === 'admin' && password === 'admin') {
            const sessionUser = { id: 'master', name: 'Master Admin', username: 'admin', role: 'admin' };
            localStorage.setItem('bp_current_user', JSON.stringify(sessionUser));
            return { success: true, user: sessionUser };
        }
        
        try {
            const usersRef = await db.ref('users').once('value');
            const users = usersRef.val() || {};
            const user = Object.values(users).find(u => u.username === username && u.password === password);
            
            if (user) {
                if (user.status === 'pending') {
                    return { success: false, message: 'Tu cuenta está pendiente de aprobación por el administrador.' };
                }
                const sessionUser = { id: user.id, name: user.name, username: user.username };
                localStorage.setItem('bp_current_user', JSON.stringify(sessionUser));
                return { success: true, user: sessionUser };
            }
            return { success: false, message: 'Nombre de usuario o contraseña inválidos' };
        } catch(e) {
            return { success: false, message: 'Error de conexión.' };
        }
    },

    logout() {
        localStorage.removeItem('bp_current_user');
    },

    async deleteUser(userId) {
        try {
            await db.ref(`users/${userId}`).remove();
            await db.ref(`records/${userId}`).remove();
            return true;
        } catch(e) {
            return false;
        }
    },

    async approveUser(userId) {
        try {
             await db.ref(`users/${userId}`).update({ status: 'approved' });
             return true;
        } catch(e) {
             return false;
        }
    }
};

const Measurements = {
    async getAll() {
        const user = Auth.getCurrentUser();
        if (!user) return [];
        return await this.getAllForUser(user.id);
    },

    async getAllForUser(userId) {
        try {
            const snap = await db.ref(`records/${userId}`).once('value');
            const recordsObj = snap.val() || {};
            const records = Object.values(recordsObj);
            return records.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch(e) {
            return [];
        }
    },

    async getUsersList() {
        try {
            const snap = await db.ref('users').once('value');
            const users = snap.val() || {};
            return Object.values(users);
        } catch(e) {
            return [];
        }
    },

    async add(sys, dia, pulse, date) {
        const user = Auth.getCurrentUser();
        if (!user) return false;

        const newId = Date.now().toString();
        const record = {
            id: newId,
            sys: parseInt(sys), dia: parseInt(dia), pulse: parseInt(pulse),
            date: date || new Date().toISOString()
        };

        try {
            await db.ref(`records/${user.id}/${newId}`).set(record);
            return true;
        } catch(e) {
            return false;
        }
    },

    async delete(recordId) {
        const user = Auth.getCurrentUser();
        if (!user) return false;
        
        try {
            await db.ref(`records/${user.id}/${recordId}`).remove();
            return true;
        } catch(e) {
            return false;
        }
    },
    
    // UI Helper logic 
    calculateStats(records) {
        if (!records || records.length === 0) return null;
        const sum = records.reduce((acc, curr) => {
            acc.sys += curr.sys; acc.dia += curr.dia; acc.pulse += curr.pulse;
            return acc;
        }, { sys: 0, dia: 0, pulse: 0 });

        return {
            avgSys: Math.round(sum.sys / records.length),
            avgDia: Math.round(sum.dia / records.length),
            avgPulse: Math.round(sum.pulse / records.length)
        };
    },
    
    getClassification(sys, dia) {
        if (sys < 120 && dia < 80) return { label: 'Normal', class: 'status-normal' };
        if (sys >= 120 && sys <= 129 && dia < 80) return { label: 'Elevada', class: 'status-elevated' };
        if (sys >= 130 && sys <= 139 || dia >= 80 && dia <= 89) return { label: 'Presión Alta (Etapa 1)', class: 'status-high1' };
        if (sys >= 140 || dia >= 90) return { label: 'Presión Alta (Etapa 2)', class: 'status-high2' };
        return { label: 'Desconocido', class: 'status-normal' };
    }
};

let bpChartInstance = null;
let globalBpChartInstance = null;

const TrendChart = {
    init() {
        const ctx = document.getElementById('bpChart');
        if (!ctx) return;
        
        const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        Chart.defaults.color = cssVar('--text-secondary');
        Chart.defaults.font.family = "'Inter', sans-serif";

        bpChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Sistólica', data: [], borderColor: cssVar('--sys-color'), backgroundColor: cssVar('--sys-color') + '20',
                        borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: cssVar('--bg-primary'),
                        pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                    },
                    {
                        label: 'Diastólica', data: [], borderColor: cssVar('--dia-color'), backgroundColor: cssVar('--dia-color') + '20',
                        borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: cssVar('--bg-primary'),
                        pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } }, tooltip: { cornerRadius: 8, padding: 12 } },
                scales: {
                    y: { min: 40, max: 200, grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } }
                }
            }
        });
    },

    update(records) {
        if (!bpChartInstance) return;
        const sortedRecords = [...(records||[])].reverse();
        
        const labels = sortedRecords.map(r => {
            const d = new Date(r.date);
            return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
        });
        
        bpChartInstance.data.labels = labels;
        bpChartInstance.data.datasets[0].data = sortedRecords.map(r => r.sys);
        bpChartInstance.data.datasets[1].data = sortedRecords.map(r => r.dia);
        bpChartInstance.update();
    },

    initAdminChart() {
        const ctx = document.getElementById('globalBpChart');
        if (!ctx) return;
        
        const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        globalBpChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Sistólica', data: [], borderColor: cssVar('--sys-color'), backgroundColor: cssVar('--sys-color') + '20',
                        borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: cssVar('--bg-primary'),
                        pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                    },
                    {
                        label: 'Diastólica', data: [], borderColor: cssVar('--dia-color'), backgroundColor: cssVar('--dia-color') + '20',
                        borderWidth: 3, tension: 0.4, fill: true, pointBackgroundColor: cssVar('--bg-primary'),
                        pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top', labels: { usePointStyle: true, padding: 20 } }, tooltip: { cornerRadius: 8, padding: 12 } },
                scales: {
                    y: { min: 40, max: 200, grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
                    x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } }
                }
            }
        });
    },

    updateAdminChart(records) {
        if (!globalBpChartInstance) return;
        
        const sortedRecords = [...records].reverse(); // Oldest to newest for the chart
        
        const labels = sortedRecords.map(r => {
            const d = new Date(r.date);
            return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
        });
        
        globalBpChartInstance.data.labels = labels;
        globalBpChartInstance.data.datasets[0].data = sortedRecords.map(r => r.sys);
        globalBpChartInstance.data.datasets[1].data = sortedRecords.map(r => r.dia);
        globalBpChartInstance.update();
    }
};

const UI = {
    views: { auth: document.getElementById('auth-view'), dashboard: document.getElementById('dashboard-view'), master: document.getElementById('master-view') },
    
    showView(viewId) {
        Object.values(this.views).forEach(el => {
            if (el.id !== viewId) {
                el.classList.remove('active');
                setTimeout(() => {
                    if (!el.classList.contains('active')) {
                        el.classList.add('hidden');
                    }
                }, 300);
            }
        });
        const target = document.getElementById(viewId);
        target.classList.remove('hidden');
        setTimeout(() => target.classList.add('active'), 10);
    },

    async updateDashboard() {
        const user = Auth.getCurrentUser();
        if (!user) return;
        
        document.getElementById('welcome-msg').textContent = `Bienvenido, ${user.name}`;
        const records = await Measurements.getAllForUser(user.id);
        const stats = Measurements.calculateStats(records);

        document.getElementById('avg-systolic').textContent = stats ? stats.avgSys : '--';
        document.getElementById('avg-diastolic').textContent = stats ? stats.avgDia : '--';
        document.getElementById('avg-pulse').textContent = stats ? stats.avgPulse : '--';

        this.renderHistory(records);
        TrendChart.update(records);
    },

    renderHistory(records) {
        const list = document.getElementById('history-list');
        const tableBody = document.getElementById('history-table-body');
        
        if (records.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="ph ph-wind icon-large"></i><p>Aún no hay mediciones. ¡Registra la primera!</p></div>`;
            tableBody.innerHTML = '';
            return;
        }

        // Render standard descending list
        list.innerHTML = records.map(record => {
            const date = new Date(record.date);
            const formattedDate = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
            const classInfo = Measurements.getClassification(record.sys, record.dia);

            return `
                <div class="history-item">
                    <div class="history-bp">
                        <span class="bp-value">${record.sys} / ${record.dia}</span>
                        <span class="bp-status ${classInfo.class}">${classInfo.label}</span>
                    </div>
                    <div class="history-details">
                        <span class="history-date">${formattedDate}</span>
                        <span class="history-pulse"><i class="ph ph-heartbeat"></i> ${record.pulse} bpm</span>
                    </div>
                </div>
            `;
        }).join('');

        // Render printable ascending table (chronological order)
        const ascendingRecords = [...records].reverse();
        tableBody.innerHTML = ascendingRecords.map(record => {
            const date = new Date(record.date);
            const formattedDate = date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' });
            const classInfo = Measurements.getClassification(record.sys, record.dia);

            return `
                <tr>
                    <td>${formattedDate}</td>
                    <td>${record.sys}</td>
                    <td>${record.dia}</td>
                    <td>${record.pulse}</td>
                    <td>${classInfo.label}</td>
                </tr>
            `;
        }).join('');
    },

    async updateMasterDashboard() {
        const user = Auth.getCurrentUser();
        if (!user || user.role !== 'admin') return;

        const sidebar = document.getElementById('admin-user-list');
        const pendingSidebar = document.getElementById('admin-pending-list');
        const pendingSection = document.getElementById('pending-users-section');
        
        const allUsers = await Measurements.getUsersList();
        const approvedUsers = allUsers.filter(u => u.status !== 'pending');
        const pendingUsers = allUsers.filter(u => u.status === 'pending');
        
        // Render Pending Users
        if (pendingUsers.length > 0) {
            pendingSection.classList.remove('hidden');
            pendingSidebar.innerHTML = pendingUsers.map(u => `
                <div class="user-item pending-user-item" style="flex-direction:column; align-items:flex-start;">
                    <div class="user-item-info" style="display:flex; align-items:center; gap:8px; width:100%;">
                        <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
                        <div class="user-details" style="display:flex; flex-direction:column; gap:2px;">
                            <span class="user-name">${u.name}</span>
                            <span class="user-username" style="font-size:0.8rem; color:var(--text-secondary);">@${u.username}</span>
                        </div>
                    </div>
                    <div class="pending-extra-details" style="font-size:0.75rem; color: #64748b; margin-top:8px; display:grid; gap:4px;">
                        <span><i class="ph ph-envelope"></i> ${u.email || 'N/A'}</span>
                        <span><i class="ph ph-phone"></i> ${u.phone || 'N/A'}</span>
                        <span><i class="ph ph-calendar"></i> Nacimiento: ${u.dob || 'N/A'}</span>
                    </div>
                    <div class="pending-actions" style="display:flex; gap:4px; margin-top:12px; width:100%;">
                        <button class="btn btn-primary btn-sm approve-btn" data-id="${u.id}" style="padding:4px 8px; flex:1;">Aprobar</button>
                        <button class="btn btn-outline btn-sm reject-btn" data-id="${u.id}" style="padding:4px 8px; flex:1;">Rechazar</button>
                    </div>
                </div>
            `).join('');
            
            document.querySelectorAll('.approve-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const userId = e.currentTarget.dataset.id;
                    if (await Auth.approveUser(userId)) await UI.updateMasterDashboard();
                });
            });
            
            document.querySelectorAll('.reject-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const userId = e.currentTarget.dataset.id;
                    if (confirm('¿Rechazar y eliminar esta solicitud de registro?')) {
                        if (await Auth.deleteUser(userId)) await UI.updateMasterDashboard();
                    }
                });
            });
        } else {
            if (pendingSection) pendingSection.classList.add('hidden');
            if (pendingSidebar) pendingSidebar.innerHTML = '';
        }

        // Render Approved Users
        if (approvedUsers.length === 0) {
            sidebar.innerHTML = '<div class="empty-state">No se encontraron usuarios</div>';
            return;
        }

        sidebar.innerHTML = approvedUsers.map(u => `
            <div class="user-item" data-userid="${u.id}" data-username="${u.name}">
                <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
                <div class="user-info">
                    <span class="user-name">${u.name}</span>
                    <span class="user-username">@${u.username}</span>
                </div>
            </div>
        `).join('');

        // Add Click Listeners for Approved Users
        document.querySelectorAll('#admin-user-list .user-item').forEach(item => {
            item.addEventListener('click', (e) => {
                document.querySelectorAll('#admin-user-list .user-item').forEach(i => i.classList.remove('active'));
                const el = e.currentTarget;
                el.classList.add('active');
                
                const userId = el.dataset.userid;
                const userName = el.dataset.username;
                this.loadAdminUserData(userId, userName);
            });
        });
    },

    async loadAdminUserData(userId, userName) {
        document.getElementById('selected-user-title').textContent = `Registros de ${userName}`;
        document.getElementById('admin-actions').classList.remove('hidden');
        document.getElementById('admin-user-data').classList.remove('hidden');

        // Store the currently selected user for deletion
        document.getElementById('admin-actions').dataset.selectedId = userId;
        document.getElementById('admin-actions').dataset.selectedName = userName;

        const records = await Measurements.getAllForUser(userId);
        
        // Calculate Stats
        const stats = Measurements.calculateStats(records);
        if (stats) {
            document.getElementById('admin-avg-sys').textContent = stats.avgSys;
            document.getElementById('admin-avg-dia').textContent = stats.avgDia;
            document.getElementById('admin-avg-pulse').textContent = stats.avgPulse;
        } else {
            document.getElementById('admin-avg-sys').textContent = '--';
            document.getElementById('admin-avg-dia').textContent = '--';
            document.getElementById('admin-avg-pulse').textContent = '--';
        }

        // Render List and Table
        const list = document.getElementById('global-history-list');
        const tableBody = document.getElementById('global-history-table-body');

        if (records.length === 0) {
            list.innerHTML = `<div class="empty-state"><i class="ph ph-wind icon-large"></i><p>Este usuario no tiene mediciones.</p></div>`;
            tableBody.innerHTML = '';
        } else {
            // Screen display (Newest first)
            list.innerHTML = records.map(record => {
                const date = new Date(record.date);
                const formattedDate = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
                const classInfo = Measurements.getClassification(record.sys, record.dia);

                return `
                    <div class="history-item">
                        <div class="history-bp">
                            <span class="bp-value">${record.sys} / ${record.dia}</span>
                            <span class="bp-status ${classInfo.class}">${classInfo.label}</span>
                        </div>
                        <div class="history-details">
                            <span class="history-date">${formattedDate}</span>
                            <span class="history-pulse"><i class="ph ph-heartbeat"></i> ${record.pulse} bpm</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Print table (Oldest first)
            const ascendingRecords = [...records].reverse();
            tableBody.innerHTML = ascendingRecords.map(record => {
                const date = new Date(record.date);
                const formattedDate = date.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' });
                const classInfo = Measurements.getClassification(record.sys, record.dia);

                return `
                    <tr>
                        <td>${formattedDate}</td>
                        <td>${record.sys}</td>
                        <td>${record.dia}</td>
                        <td>${record.pulse}</td>
                        <td>${classInfo.label}</td>
                    </tr>
                `;
            }).join('');
        }
        
        TrendChart.updateAdminChart(records);
    },
    
    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
        if (modalId === 'record-modal') {
            const now = new Date();
            now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
            document.getElementById('date-input').value = now.toISOString().slice(0, 16);
        }
    },
    hideModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }
};

document.addEventListener('DOMContentLoaded', async () => {
    TrendChart.init();
    TrendChart.initAdminChart();

    const currentUser = Auth.getCurrentUser();
    if (currentUser) {
        if (currentUser.role === 'admin') {
            UI.showView('master-view');
            await UI.updateMasterDashboard();
        } else {
            UI.showView('dashboard-view');
            await UI.updateDashboard();
        }
    } else {
        UI.showView('auth-view');
    }

    document.getElementById('tab-login').addEventListener('click', (e) => {
        e.target.classList.add('active'); document.getElementById('tab-signup').classList.remove('active');
        document.getElementById('login-form').classList.remove('hidden'); document.getElementById('signup-form').classList.add('hidden');
    });

    document.getElementById('tab-signup').addEventListener('click', (e) => {
        e.target.classList.add('active'); document.getElementById('tab-login').classList.remove('active');
        document.getElementById('signup-form').classList.remove('hidden'); document.getElementById('login-form').classList.add('hidden');
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = document.getElementById('login-username').value;
        const pass = document.getElementById('login-password').value;
        const res = await Auth.login(user, pass);
        if (res.success) {
            document.getElementById('login-error').textContent = '';
            if (res.user.role === 'admin') {
                UI.showView('master-view');
                await UI.updateMasterDashboard();
            } else {
                UI.showView('dashboard-view');
                await UI.updateDashboard();
            }
            e.target.reset();
        } else {
            document.getElementById('login-error').textContent = res.message;
        }
    });

    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('signup-name').value;
        const email = document.getElementById('signup-email').value;
        const phone = document.getElementById('signup-phone').value;
        const dob = document.getElementById('signup-dob').value;
        const user = document.getElementById('signup-username').value;
        const pass = document.getElementById('signup-password').value;
        
        const res = await Auth.register(name, email, phone, dob, user, pass);
        if (res.success) {
            document.getElementById('signup-error').textContent = '';
            alert(res.message);
            document.getElementById('signup-form').reset();
            document.getElementById('tab-login').click();
        } else {
            document.getElementById('signup-error').textContent = res.message;
            document.getElementById('signup-error').classList.add('visible');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        Auth.logout(); UI.showView('auth-view');
    });

    document.getElementById('master-logout-btn').addEventListener('click', () => {
        Auth.logout(); UI.showView('auth-view');
    });

    document.getElementById('admin-print-btn').addEventListener('click', () => {
        window.print();
    });

    document.getElementById('admin-delete-btn').addEventListener('click', async () => {
        const actionsContainer = document.getElementById('admin-actions');
        const userId = actionsContainer.dataset.selectedId;
        const userName = actionsContainer.dataset.selectedName;

        if (!userId) return;

        if (confirm(`¿Estás seguro de que deseas eliminar al usuario "${userName}" y TODO su historial de mediciones? Esto no se puede deshacer.`)) {
            if (await Auth.deleteUser(userId)) {
                // Clear the current view
                document.getElementById('selected-user-title').textContent = 'Selecciona un Usuario';
                document.getElementById('admin-actions').classList.add('hidden');
                document.getElementById('admin-user-data').classList.add('hidden');
                
                // Refresh the sidebar
                await UI.updateMasterDashboard();
                alert(`El usuario ${userName} ha sido eliminado.`);
            } else {
                alert('Ocurrió un error al eliminar el usuario.');
            }
        }
    });

    document.getElementById('open-record-modal').addEventListener('click', () => UI.showModal('record-modal'));
    document.getElementById('close-modal').addEventListener('click', () => UI.hideModal('record-modal'));
    document.getElementById('cancel-modal').addEventListener('click', () => UI.hideModal('record-modal'));
    document.getElementById('record-modal').addEventListener('click', (e) => {
        if (e.target.id === 'record-modal') UI.hideModal('record-modal');
    });

    document.getElementById('record-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const sys = document.getElementById('sys-input').value;
        const dia = document.getElementById('dia-input').value;
        const pulse = document.getElementById('pulse-input').value;
        const date = document.getElementById('date-input').value;
        
        if (await Measurements.add(sys, dia, pulse, date)) {
            UI.hideModal('record-modal'); await UI.updateDashboard(); e.target.reset();
        } else {
            alert('Error al guardar el registro.');
        }
    });
});
