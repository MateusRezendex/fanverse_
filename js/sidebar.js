(function () {
    const STORAGE_KEY = 'sqv_sidebar_collapsed';

    function injectStyles() {
        if (document.getElementById('sidebar-collapse-style')) return;

        const style = document.createElement('style');
        style.id = 'sidebar-collapse-style';
        style.textContent = `
            html,
            body,
            main {
                background: #ffffff !important;
                color: #000000 !important;
            }

            aside,
            .bg-brand-card,
            .bg-brand-dark,
            .bg-brand-dark\\/40,
            .bg-brand-dark\\/50,
            .bg-brand-dark\\/60,
            .bg-brand-dark\\/95 {
                background-color: #ffffff !important;
            }

            body,
            body * {
                color: #000000 !important;
            }

            .border-brand-border,
            .divide-brand-border\\/40 > :not([hidden]) ~ :not([hidden]) {
                border-color: #e5e7eb !important;
            }

            input,
            select,
            textarea,
            option {
                background: #ffffff !important;
                color: #000000 !important;
            }

            input::placeholder,
            textarea::placeholder {
                color: #000000 !important;
                opacity: .65;
            }

            main .bg-black\\/20,
            main .bg-black\\/30,
            .bg-black\\/20,
            .bg-black\\/30,
            .bg-black\\/80 {
                background-color: #f9fafb !important;
            }

            aside nav a:hover,
            aside nav button:hover,
            main .hover\\:bg-white\\/5:hover,
            main .hover\\:bg-white\\/\\[0\\.02\\]:hover {
                background-color: #f3f4f6 !important;
                color: #000000 !important;
            }

            .fixed.inset-0.bg-black\\/80 {
                background-color: rgb(17 24 39 / 0.55) !important;
            }

            #modal-novo-pedido {
                color: #000000;
            }

            #modal-novo-pedido .bg-brand-card,
            #modal-novo-pedido .bg-brand-dark\\/40,
            #modal-novo-pedido .bg-brand-dark\\/50,
            #modal-novo-pedido .bg-brand-dark\\/60,
            #modal-novo-pedido .bg-brand-dark\\/95 {
                background-color: #ffffff !important;
            }

            #modal-novo-pedido .bg-black\\/20 {
                background-color: #f9fafb !important;
            }

            #modal-novo-pedido input,
            #modal-novo-pedido select,
            #modal-novo-pedido textarea {
                background-color: #ffffff !important;
                color: #000000 !important;
                border-color: #d1d5db !important;
            }

            #modal-novo-pedido input::placeholder,
            #modal-novo-pedido textarea::placeholder {
                color: #000000 !important;
                opacity: .65;
            }

            #modal-novo-pedido label,
            #modal-novo-pedido .text-gray-400,
            #modal-novo-pedido .text-gray-500 {
                color: #000000 !important;
            }

            #modal-novo-pedido .text-white {
                color: #000000 !important;
            }

            #modal-novo-pedido #customer-suggest {
                background-color: #ffffff !important;
                border-color: #d1d5db !important;
                box-shadow: 0 16px 35px rgb(15 23 42 / 0.18);
            }

            #modal-novo-pedido #customer-suggest-list button:hover {
                background-color: #fff7ed !important;
            }

            #modal-novo-pedido #order-flavors-selection > div > div:not(:first-child) {
                background-color: #f9fafb !important;
                border-color: #d1d5db !important;
            }

            #modal-novo-pedido #order-flavors-selection button {
                background-color: #f3f4f6 !important;
                color: #000000 !important;
            }

            #modal-novo-pedido #order-flavors-selection input[readonly] {
                width: 2.25rem !important;
                background-color: #f3f4f6 !important;
                color: #000000 !important;
                border: 0 !important;
                border-radius: .5rem;
                font-weight: 900;
            }

            #modal-novo-pedido button.bg-gradient-to-r,
            #modal-novo-pedido button.bg-brand-accentOrange {
                color: #000000 !important;
            }

            .sidebar-toggle {
                width: 2rem;
                height: 2rem;
                border-radius: 9999px;
                border: 1px solid #e5e7eb;
                background: #ffffff;
                color: #000000;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: color .2s ease, border-color .2s ease, background .2s ease, transform .2s ease;
            }

            .sidebar-toggle:hover {
                color: #000000;
                border-color: rgba(249, 115, 22, .55);
                background: #f9fafb;
            }

            .sidebar-mobile-toggle {
                width: 2.5rem;
                height: 2.5rem;
                border-radius: 9999px;
                border: 1px solid #e5e7eb;
                background: #ffffff;
                color: #000000;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: color .2s ease, border-color .2s ease, background .2s ease, transform .2s ease;
            }

            .sidebar-mobile-toggle:hover {
                border-color: rgba(249, 115, 22, .55);
                background: #f9fafb;
            }

            @media (max-width: 767px) {
                aside {
                    width: 100% !important;
                    padding: 1rem !important;
                    border-right: 0 !important;
                    border-bottom: 1px solid #e5e7eb !important;
                    position: sticky;
                    top: 0;
                    z-index: 50;
                    max-height: 100vh;
                    overflow-y: auto;
                }

                aside > div:first-child {
                    width: 100%;
                }

                aside .sidebar-brand-row {
                    margin-bottom: 0 !important;
                    padding-right: 3.25rem;
                }

                aside nav,
                aside > div:last-child {
                    display: none !important;
                }

                body.sidebar-mobile-open aside nav {
                    display: block !important;
                    margin-top: 1.25rem;
                }

                .sidebar-toggle {
                    display: none !important;
                }

                .sidebar-mobile-toggle {
                    position: absolute;
                    top: 1.25rem;
                    right: 1rem;
                    z-index: 60;
                }
            }

            @media (min-width: 768px) {
                .sidebar-mobile-toggle {
                    display: none !important;
                }

                body.sidebar-collapsed aside {
                    width: 5rem !important;
                    padding-left: .75rem !important;
                    padding-right: .75rem !important;
                    align-items: center;
                }

                body.sidebar-collapsed aside nav a,
                body.sidebar-collapsed aside button {
                    justify-content: center !important;
                    padding-left: .75rem !important;
                    padding-right: .75rem !important;
                    gap: 0 !important;
                }

                body.sidebar-collapsed aside nav a i,
                body.sidebar-collapsed aside button i {
                    flex-shrink: 0;
                }

                body.sidebar-collapsed .sidebar-text,
                body.sidebar-collapsed .sidebar-brand-copy {
                    display: none !important;
                }

                body.sidebar-collapsed .sidebar-brand-row {
                    justify-content: center;
                }

                body.sidebar-collapsed .sidebar-toggle i {
                    transform: rotate(180deg);
                }
            }
        `;
        document.head.appendChild(style);
    }

    function wrapTextNodes(element) {
        Array.from(element.childNodes).forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return;
            const span = document.createElement('span');
            span.className = 'sidebar-text';
            span.textContent = node.textContent.trim();
            node.replaceWith(span);
        });
    }

    function initSidebar() {
        const aside = document.querySelector('aside');
        if (!aside) return;

        injectStyles();
        aside.classList.add('relative', 'transition-all', 'duration-200');

        const nav = aside.querySelector('nav');
        if (nav && !nav.querySelector('a[href="gestao.html"]')) {
            const managementLink = document.createElement('a');
            managementLink.href = 'gestao.html';
            managementLink.className = 'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all font-semibold text-sm';
            managementLink.innerHTML = '<i data-lucide="brain-circuit" class="w-5 h-5"></i> Gestão';
            nav.appendChild(managementLink);
        }

        const firstBlock = aside.firstElementChild;
        const brandRow = firstBlock ? firstBlock.firstElementChild : null;
        if (brandRow) {
            brandRow.classList.add('sidebar-brand-row');
            const brandCopy = brandRow.children[1];
            if (brandCopy) brandCopy.classList.add('sidebar-brand-copy');
        }

        aside.querySelectorAll('nav a, button').forEach((item) => {
            wrapTextNodes(item);
            if (!item.title) {
                const label = item.querySelector('.sidebar-text');
                if (label) item.title = label.textContent.trim();
            }
        });

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'sidebar-toggle absolute top-5 right-3 md:-right-4 z-30';
        toggle.setAttribute('aria-label', 'Minimizar menu lateral');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.title = 'Minimizar menu';
        toggle.innerHTML = '<i data-lucide="panel-left-close" class="w-4 h-4 transition-transform"></i>';
        aside.appendChild(toggle);

        const mobileToggle = document.createElement('button');
        mobileToggle.type = 'button';
        mobileToggle.className = 'sidebar-mobile-toggle';
        mobileToggle.setAttribute('aria-label', 'Abrir menu');
        mobileToggle.setAttribute('aria-expanded', 'false');
        mobileToggle.title = 'Abrir menu';
        mobileToggle.innerHTML = '<i data-lucide="menu" class="w-5 h-5"></i>';
        aside.appendChild(mobileToggle);

        const setMobileOpen = (open) => {
            document.body.classList.toggle('sidebar-mobile-open', open);
            mobileToggle.setAttribute('aria-expanded', String(open));
            mobileToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
            mobileToggle.title = open ? 'Fechar menu' : 'Abrir menu';
            mobileToggle.innerHTML = open
                ? '<i data-lucide="x" class="w-5 h-5"></i>'
                : '<i data-lucide="menu" class="w-5 h-5"></i>';
            if (window.lucide) lucide.createIcons();
        };

        const setCollapsed = (collapsed) => {
            document.body.classList.toggle('sidebar-collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral');
            toggle.title = collapsed ? 'Expandir menu' : 'Minimizar menu';
            localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        };

        setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
        toggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('sidebar-collapsed')));
        mobileToggle.addEventListener('click', () => setMobileOpen(!document.body.classList.contains('sidebar-mobile-open')));
        aside.querySelectorAll('nav a').forEach(link => {
            link.addEventListener('click', () => setMobileOpen(false));
        });

        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
