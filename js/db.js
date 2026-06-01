// js/db.js
// Cliente do backend (HTTP + WebSocket). Mantém um cache local em memória,
// atualizado em tempo real via WS, e expõe a mesma interface usada pelos HTMLs.
//
// Uso típico em cada página:
//   document.addEventListener('DOMContentLoaded', async () => {
//       await initDb();
//       onDataChange(() => render());
//       render();
//   });

const API_BASE = (location.origin && location.origin !== 'null') ? location.origin : 'http://localhost:3000';
const WS_URL   = API_BASE.replace(/^http/, 'ws') + '/ws';

const _cache = {
    orders: [],
    flavors: [],
    neighborhoods: [],
    customers: [],
    expenses: [],
    expenseCategories: [],
    recurringExpenses: [],
    ready: false,
};

const _connection = {
    wsState: 'connecting',  // 'connecting' | 'open' | 'closed'
    lastUpdate: null,       // timestamp do último evento aplicado
};

const _listeners = new Set();
const _connectionListeners = new Set();

// --- Overrides locais (ex.: editar dados do cliente na UI) ---
const _customerOverrides = {
    loaded: false,
    map: {}, // key -> { name, phone }
};

function _normalizeKey(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function _digits(value) {
    return String(value || '').replace(/\D/g, '');
}

function _customerKey(customer) {
    const phone = _digits(customer && customer.phone);
    if (phone) return `p:${phone}`;
    const name = _normalizeKey(customer && customer.name);
    return name ? `n:${name}` : '';
}

function _loadCustomerOverrides() {
    if (_customerOverrides.loaded) return;
    _customerOverrides.loaded = true;
    try {
        const raw = localStorage.getItem('sqv_customer_overrides_v1');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') _customerOverrides.map = parsed;
    } catch (_) { /* ignore */ }
}

function _saveCustomerOverrides() {
    try { localStorage.setItem('sqv_customer_overrides_v1', JSON.stringify(_customerOverrides.map || {})); }
    catch (_) { /* ignore */ }
}

function applyCustomerOverrides(customers) {
    _loadCustomerOverrides();
    const list = Array.isArray(customers) ? customers : [];
    return list.map(c => {
        const key = _customerKey(c);
        const o = key ? _customerOverrides.map[key] : null;
        if (!o) return c;
        return {
            ...c,
            name: (o.name != null && String(o.name).trim() !== '') ? String(o.name).trim() : c.name,
            phone: (o.phone != null && String(o.phone).trim() !== '') ? String(o.phone).trim() : c.phone,
            address: (o.address != null && String(o.address).trim() !== '') ? String(o.address).trim() : c.address,
            neighborhood: (o.neighborhood != null && String(o.neighborhood).trim() !== '') ? String(o.neighborhood).trim() : c.neighborhood,
            source: (o.source != null && String(o.source).trim() !== '') ? String(o.source).trim() : c.source,
        };
    });
}

function setCustomerOverride(baseCustomer, patch) {
    _loadCustomerOverrides();
    const key = _customerKey(baseCustomer);
    if (!key) return null;
    const next = {
        name: patch && patch.name != null ? String(patch.name).trim() : '',
        phone: patch && patch.phone != null ? String(patch.phone).trim() : '',
        address: patch && patch.address != null ? String(patch.address).trim() : '',
        neighborhood: patch && patch.neighborhood != null ? String(patch.neighborhood).trim() : '',
        source: patch && patch.source != null ? String(patch.source).trim() : '',
    };
    _customerOverrides.map[key] = next;
    _saveCustomerOverrides();
    _emit();
    return next;
}

function clearCustomerOverride(baseCustomer) {
    _loadCustomerOverrides();
    const key = _customerKey(baseCustomer);
    if (!key) return false;
    if (!_customerOverrides.map[key]) return false;
    delete _customerOverrides.map[key];
    _saveCustomerOverrides();
    _emit();
    return true;
}

function _emit() {
    _listeners.forEach(fn => {
        try { fn(); } catch (e) { console.error('[db] listener falhou:', e); }
    });
}

function onDataChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

function onConnectionChange(fn) {
    _connectionListeners.add(fn);
    return () => _connectionListeners.delete(fn);
}

function getConnectionState() {
    return { ..._connection };
}

function _emitConnection() {
    _connectionListeners.forEach(fn => {
        try { fn(_connection); } catch (e) { console.error('[db] connection listener falhou:', e); }
    });
}

// --- Boot ---
async function initDb() {
    await Promise.all([
        _refreshFlavors(),
        _refreshNeighborhoods().catch(() => {}),
        _refreshOrders(),
        _refreshCustomers(),
        _refreshExpenses().catch(() => {}),
        _refreshExpenseCategories().catch(() => {}),
        _refreshRecurringExpenses().catch(() => {}),
    ]);
    _cache.ready = true;
    _connectWs();
    _emit();
}

async function _refreshFlavors()           { _cache.flavors           = await _fetchJson('/api/flavors'); }
async function _refreshNeighborhoods()     { _cache.neighborhoods     = await _fetchJson('/api/neighborhoods'); }
async function _refreshOrders()            { _cache.orders            = await _fetchJson('/api/orders'); }
async function _refreshCustomers()         { _cache.customers         = await _fetchJson('/api/orders/customers/aggregate'); }
async function _refreshExpenses()          { _cache.expenses          = await _fetchJson('/api/expenses'); }
async function _refreshExpenseCategories() { _cache.expenseCategories = await _fetchJson('/api/expense-categories'); }
async function _refreshRecurringExpenses() { _cache.recurringExpenses = await _fetchJson('/api/recurring-expenses'); }

// --- Leituras síncronas (cache) ---
function getOrders()            { return _cache.orders.slice(); }
function getFlavors()           { return _cache.flavors.slice(); }
function getNeighborhoods()     { return _cache.neighborhoods.slice(); }
function getCustomers()         { return applyCustomerOverrides(_cache.customers.slice()); }
function getExpenses()          { return _cache.expenses.slice(); }
function getExpenseCategories() { return _cache.expenseCategories.slice(); }
function getRecurringExpenses() { return _cache.recurringExpenses.slice(); }
function isReady()              { return _cache.ready; }

// --- Mutadores (chamam a API; WS dispara a atualização do cache) ---
async function createFlavor(payload) {
    return _fetchJson('/api/flavors', { method: 'POST', body: payload });
}
async function updateFlavor(id, patch) {
    return _fetchJson(`/api/flavors/${id}`, { method: 'PATCH', body: patch });
}
async function deleteFlavor(id) {
    return _fetchJson(`/api/flavors/${id}`, { method: 'DELETE', expectStatus: 204 });
}

// --- Custos base (massa/embalagem/gás) ---
async function getBaseCosts() {
    return _fetchJson('/api/costs');
}
async function updateBaseCosts(items) {
    return _fetchJson('/api/costs', { method: 'PATCH', body: { items } });
}

async function createOrder(payload) {
    return _fetchJson('/api/orders', { method: 'POST', body: payload });
}
async function updateOrder(id, patch) {
    return _fetchJson(`/api/orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
}
async function deleteOrder(id) {
    return _fetchJson(`/api/orders/${encodeURIComponent(id)}`, { method: 'DELETE', expectStatus: 204 });
}

async function createExpenseCategory(payload) {
    return _fetchJson('/api/expense-categories', { method: 'POST', body: payload });
}
async function updateExpenseCategory(id, patch) {
    return _fetchJson(`/api/expense-categories/${id}`, { method: 'PATCH', body: patch });
}
async function deleteExpenseCategory(id) {
    return _fetchJson(`/api/expense-categories/${id}`, { method: 'DELETE', expectStatus: 204 });
}

async function getWeeklyRevenue() {
    return _fetchJson('/api/orders/stats/weekly');
}

async function getDashboardStats(queryString = '') {
    return _fetchJson('/api/orders/stats/dashboard' + (queryString || ''));
}

async function createNeighborhood(payload) {
    return _fetchJson('/api/neighborhoods', { method: 'POST', body: payload });
}

// --- Financeiro ---
async function createExpense(payload)       { return _fetchJson('/api/expenses', { method: 'POST',  body: payload }); }
async function updateExpense(id, patch)     { return _fetchJson(`/api/expenses/${id}`, { method: 'PATCH', body: patch }); }
async function deleteExpense(id)            { return _fetchJson(`/api/expenses/${id}`, { method: 'DELETE', expectStatus: 204 }); }

async function createRecurringExpense(p)    { return _fetchJson('/api/recurring-expenses', { method: 'POST', body: p }); }
async function updateRecurringExpense(id,p) { return _fetchJson(`/api/recurring-expenses/${id}`, { method: 'PATCH', body: p }); }
async function deleteRecurringExpense(id)   { return _fetchJson(`/api/recurring-expenses/${id}`, { method: 'DELETE', expectStatus: 204 }); }
async function runRecurringExpenses()       { return _fetchJson('/api/recurring-expenses/run', { method: 'POST' }); }

async function getProfitReport(qs = '')     { return _fetchJson('/api/reports/profit' + qs); }

function buildCsvUrl(params) {
    const qs = new URLSearchParams(params).toString();
    return `${API_BASE}/api/reports/export.csv?${qs}`;
}

// --- HTTP helper ---
async function _fetchJson(path, opts = {}) {
    const init = {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json' },
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

    const r = await fetch(API_BASE + path, init);
    if (opts.expectStatus && r.status === opts.expectStatus) return null;
    if (!r.ok) {
        let err;
        try { err = (await r.json()).error; } catch { err = r.statusText; }
        throw new Error(`API ${r.status}: ${err}`);
    }
    if (r.status === 204) return null;
    return r.json();
}

// --- WebSocket ---
let _ws = null;
let _reconnectTimer = null;

function _connectWs() {
    try {
        _ws = new WebSocket(WS_URL);
    } catch (e) {
        console.warn('[ws] falhou ao abrir:', e);
        _scheduleReconnect();
        return;
    }

    _ws.addEventListener('open', async () => {
        console.log('[ws] conectado');
        _connection.wsState = 'open';
        _emitConnection();
        // Após reconectar, refaz fetch para recuperar eventos perdidos durante o downtime
        try {
            await Promise.all([_refreshFlavors(), _refreshNeighborhoods().catch(() => {}), _refreshOrders(), _refreshCustomers()]);
            _connection.lastUpdate = Date.now();
            _emit();
            _emitConnection();
        } catch (e) { console.warn('[ws] refresh pós-reconexão falhou', e); }
    });
    _ws.addEventListener('message', (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            _applyEvent(msg.type, msg.payload);
            _connection.lastUpdate = Date.now();
            _emitConnection();
        } catch (e) { console.warn('[ws] mensagem inválida', e); }
    });
    _ws.addEventListener('close', () => {
        console.warn('[ws] desconectado — tentando reconectar');
        _connection.wsState = 'closed';
        _emitConnection();
        _scheduleReconnect();
    });
    _ws.addEventListener('error', () => { /* close trata */ });
}

function _scheduleReconnect() {
    if (_reconnectTimer) return;
    _reconnectTimer = setTimeout(() => {
        _reconnectTimer = null;
        _connectWs();
    }, 2000);
}

function _applyEvent(type, payload) {
    let changed = true;
    switch (type) {
        case 'hello':
            changed = false;
            break;

        case 'flavor:created':
            _cache.flavors.push(payload);
            break;
        case 'flavor:updated': {
            const i = _cache.flavors.findIndex(f => f.id === payload.id);
            if (i !== -1) _cache.flavors[i] = payload;
            break;
        }
        case 'flavor:deleted':
            _cache.flavors = _cache.flavors.filter(f => f.id !== payload.id);
            break;

        case 'neighborhood:created': {
            const i = _cache.neighborhoods.findIndex(n => n.id === payload.id);
            if (i === -1) _cache.neighborhoods.push(payload);
            else _cache.neighborhoods[i] = payload;
            break;
        }

        case 'order:created':
            _cache.orders.push(payload);
            _refreshCustomers().catch(() => {});
            break;
        case 'order:updated': {
            const i = _cache.orders.findIndex(o => o.id === payload.id);
            if (i !== -1) _cache.orders[i] = payload;
            _refreshCustomers().catch(() => {});
            break;
        }
        case 'order:deleted':
            _cache.orders = _cache.orders.filter(o => o.id !== payload.id);
            _refreshCustomers().catch(() => {});
            break;

        case 'expense:created':
            _cache.expenses.unshift(payload);
            break;
        case 'expense:updated': {
            const i = _cache.expenses.findIndex(e => e.id === payload.id);
            if (i !== -1) _cache.expenses[i] = payload;
            break;
        }
        case 'expense:deleted':
            _cache.expenses = _cache.expenses.filter(e => e.id !== payload.id);
            break;

        case 'recurring-expense:created':
            _cache.recurringExpenses.push(payload);
            break;
        case 'recurring-expense:updated': {
            const i = _cache.recurringExpenses.findIndex(e => e.id === payload.id);
            if (i !== -1) _cache.recurringExpenses[i] = payload;
            break;
        }
        case 'recurring-expense:deleted':
            _cache.recurringExpenses = _cache.recurringExpenses.filter(e => e.id !== payload.id);
            break;

        case 'expense-category:created':
            {
                const i = _cache.expenseCategories.findIndex(c => c.id === payload.id);
                if (i === -1) _cache.expenseCategories.push(payload);
                else _cache.expenseCategories[i] = payload;
            }
            break;
        case 'expense-category:updated':
            {
                const i = _cache.expenseCategories.findIndex(c => c.id === payload.id);
                if (i === -1) _cache.expenseCategories.push(payload);
                else _cache.expenseCategories[i] = payload;
            }
            break;
        case 'expense-category:deleted':
            _cache.expenseCategories = _cache.expenseCategories.filter(c => c.id !== payload.id);
            break;

        default:
            changed = false;
    }
    if (changed) _emit();
}

// --- Helpers de UI (mantidos) ---
function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBRL(value) {
    const n = Number(value) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear()
        && d1.getMonth()    === d2.getMonth()
        && d1.getDate()     === d2.getDate();
}

function isToday(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    return !isNaN(d.getTime()) && isSameDay(d, new Date());
}

const ORDER_STATUS_FLOW = ['Pendente', 'Em Preparo', 'Pronto', 'Entregue'];

function nextStatus(current) {
    const i = ORDER_STATUS_FLOW.indexOf(current);
    if (i < 0 || i === ORDER_STATUS_FLOW.length - 1) return null;
    return ORDER_STATUS_FLOW[i + 1];
}

function previousStatus(current) {
    const i = ORDER_STATUS_FLOW.indexOf(current);
    if (i <= 0) return null;
    return ORDER_STATUS_FLOW[i - 1];
}

function formatTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    const hhmm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return sameDay ? `Hoje às ${hhmm}` : d.toLocaleDateString('pt-BR') + ' ' + hhmm;
}

function formatDurationMinutes(totalMinutes) {
    const mins = Math.max(0, Math.floor(Number(totalMinutes) || 0));
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}min` : `${h}h`;
}

function getOrderWaitMinutes(order) {
    if (!order) return 0;
    const start = new Date(order.createdAt);
    if (isNaN(start.getTime())) return 0;

    // Para pedidos finalizados, tenta usar o timestamp de conclusão; senão, usa "agora"
    let end = null;
    if (order.status === 'Entregue' && order.deliveredAt) end = new Date(order.deliveredAt);
    if (!end || isNaN(end.getTime())) end = new Date();

    return (end.getTime() - start.getTime()) / 60000;
}

function formatOrderWait(order) {
    return formatDurationMinutes(getOrderWaitMinutes(order));
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
}

// --- Toast ---
function showToast(title, message, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = "fixed bottom-6 right-6 bg-[#1a120e] border border-emerald-500 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transform translate-y-20 opacity-0 pointer-events-none transition-all duration-300 z-50";
        toast.innerHTML = `
            <div class="toast-icon-box w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <i data-lucide="check" class="w-5 h-5"></i>
            </div>
            <div>
                <h5 class="font-bold text-sm text-white" id="toast-title"></h5>
                <p class="text-xs text-gray-400" id="toast-message"></p>
            </div>
        `;
        document.body.appendChild(toast);
        if (window.lucide) lucide.createIcons();
    }

    const titleEl = toast.querySelector('#toast-title');
    const msgEl   = toast.querySelector('#toast-message');
    const iconBox = toast.querySelector('.toast-icon-box');

    if (titleEl) titleEl.textContent = title;
    if (msgEl)   msgEl.textContent   = message;

    toast.classList.remove('border-emerald-500', 'border-red-500');
    if (isError) {
        toast.classList.add('border-red-500');
        if (iconBox) {
            iconBox.className = "toast-icon-box w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400";
            iconBox.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
        }
    } else {
        toast.classList.add('border-emerald-500');
        if (iconBox) {
            iconBox.className = "toast-icon-box w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400";
            iconBox.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i>';
        }
    }
    if (window.lucide) lucide.createIcons();

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 3000);
}
