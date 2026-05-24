// js/db.js
// Este ficheiro gere o estado global e a persistência de dados utilizando o localStorage.

// Dados iniciais para demonstração (caso o localStorage esteja vazio)
const defaultFlavors = [
    { id: 1, name: "Esfiha de Carne", price: 4.50, category: "Salgada", available: true },
    { id: 2, name: "Esfiha de Queijo", price: 4.90, category: "Salgada", available: true },
    { id: 3, name: "Esfiha de Calabresa", price: 4.70, category: "Salgada", available: true },
    { id: 4, name: "Esfiha de Frango c/ Catupiry", price: 5.20, category: "Salgada", available: true },
    { id: 5, name: "Esfiha de Chocolate", price: 6.00, category: "Doce", available: true },
    { id: 6, name: "Esfiha de Romeu e Julieta", price: 5.80, category: "Doce", available: true }
];

const defaultOrders = [
    {
        id: "#1001",
        customer: "Ana Paula de Melo",
        phone: "(81) 98111-2233",
        items: [
            { name: "Esfiha de Carne", quantity: 5, price: 4.50 },
            { name: "Esfiha de Queijo", quantity: 3, price: 4.90 }
        ],
        total: 37.20,
        status: "Pendente",
        notes: "Queijo bem derretido, por favor",
        createdAt: "Hoje às 10:20"
    },
    {
        id: "#1002",
        customer: "Carlos Alberto",
        phone: "(81) 99222-3344",
        items: [
            { name: "Esfiha de Calabresa", quantity: 10, price: 4.70 }
        ],
        total: 47.00,
        status: "Em Preparo",
        notes: "Sem cebola",
        createdAt: "Hoje às 10:15"
    },
    {
        id: "#1003",
        customer: "Juliana Santos",
        phone: "(81) 98777-6655",
        items: [
            { name: "Esfiha de Frango c/ Catupiry", quantity: 4, price: 5.20 },
            { name: "Esfiha de Chocolate", quantity: 2, price: 6.00 }
        ],
        total: 32.80,
        status: "Pronto",
        notes: "",
        createdAt: "Hoje às 10:02"
    }
];

const defaultCustomers = [
    { name: "Ana Paula de Melo", phone: "(81) 98111-2233", totalOrders: 14, totalSpent: 285.50, lastBuy: "Hoje" },
    { name: "Carlos Alberto", phone: "(81) 99222-3344", totalOrders: 8, totalSpent: 194.00, lastBuy: "Hoje" },
    { name: "Juliana Santos", phone: "(81) 98777-6655", totalOrders: 21, totalSpent: 412.30, lastBuy: "Hoje" }
];

// Inicialização do LocalStorage
if (!localStorage.getItem('sabor_orders')) {
    localStorage.setItem('sabor_orders', JSON.stringify(defaultOrders));
}
if (!localStorage.getItem('sabor_flavors')) {
    localStorage.setItem('sabor_flavors', JSON.stringify(defaultFlavors));
}
if (!localStorage.getItem('sabor_customers')) {
    localStorage.setItem('sabor_customers', JSON.stringify(defaultCustomers));
}

// Funções de acesso rápido e escrita
function getOrders() {
    return JSON.parse(localStorage.getItem('sabor_orders'));
}

function saveOrders(orders) {
    localStorage.setItem('sabor_orders', JSON.stringify(orders));
}

function getFlavors() {
    return JSON.parse(localStorage.getItem('sabor_flavors'));
}

function saveFlavors(flavors) {
    localStorage.setItem('sabor_flavors', JSON.stringify(flavors));
}

function getCustomers() {
    return JSON.parse(localStorage.getItem('sabor_customers'));
}

function saveCustomers(customers) {
    localStorage.setItem('sabor_customers', JSON.stringify(customers));
}

// Helper para Toasts (Notificações) em todas as páginas
function showToast(title, message, isError = false) {
    let toast = document.getElementById('toast');
    if (!toast) {
        // Cria dinamicamente se não existir na página
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = "fixed bottom-6 right-6 bg-[#1a120e] border text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 transform translate-y-20 opacity-0 pointer-events-none transition-all duration-300 z-50";
        toast.innerHTML = `
            <div class="toast-icon-box w-8 h-8 rounded-full flex items-center justify-center text-emerald-400">
                <i data-lucide="check" class="w-5 h-5"></i>
            </div>
            <div>
                <h5 class="font-bold text-sm text-white id-toast-title"></h5>
                <p class="text-xs text-gray-400 id-toast-message"></p>
            </div>
        `;
        document.body.appendChild(toast);
        lucide.createIcons();
    }

    const toastTitle = toast.querySelector('.id-toast-title');
    const toastMsg = toast.querySelector('.id-toast-message');
    const iconBox = toast.querySelector('.toast-icon-box');

    toastTitle.textContent = title;
    toastMsg.textContent = message;

    if (isError) {
        toast.className = toast.className.replace('border-emerald-500', 'border-red-500');
        toast.classList.add('border-red-500');
        iconBox.className = "toast-icon-box w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400";
        iconBox.innerHTML = '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    } else {
        toast.className = toast.className.replace('border-red-500', 'border-emerald-500');
        toast.classList.add('border-emerald-500');
        iconBox.className = "toast-icon-box w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400";
        iconBox.innerHTML = '<i data-lucide="check" class="w-5 h-5"></i>';
    }
    lucide.createIcons();

    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');
    toast.classList.add('translate-y-0', 'opacity-100');

    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 3000);
}