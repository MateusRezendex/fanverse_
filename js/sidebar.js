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
                color: #1f2937;
            }

            aside,
            .bg-brand-card,
            .bg-brand-dark {
                background-color: #ffffff !important;
            }

            .border-brand-border,
            .divide-brand-border\\/40 > :not([hidden]) ~ :not([hidden]) {
                border-color: #e5e7eb !important;
            }

            main .text-white,
            aside .text-white,
            main .text-gray-200,
            aside .text-gray-200 {
                color: #111827 !important;
            }

            main .text-gray-300,
            aside .text-gray-300 {
                color: #374151 !important;
            }

            main .text-gray-400,
            aside .text-gray-400 {
                color: #4b5563 !important;
            }

            main .text-gray-500,
            aside .text-gray-500,
            main .text-gray-600,
            aside .text-gray-600 {
                color: #6b7280 !important;
            }

            main input,
            main select,
            main textarea {
                background: #ffffff !important;
                color: #111827 !important;
            }

            main .bg-black\\/20,
            main .bg-black\\/30 {
                background-color: #f9fafb !important;
            }

            aside nav a:hover,
            aside nav button:hover,
            main .hover\\:bg-white\\/5:hover,
            main .hover\\:bg-white\\/\\[0\\.02\\]:hover {
                background-color: #f3f4f6 !important;
                color: #111827 !important;
            }

            .bg-gradient-to-r,
            .bg-gradient-to-br,
            button.bg-brand-accentOrange,
            main button.text-white,
            main a.text-white,
            aside a.text-white,
            .bg-gradient-to-r .text-white,
            .bg-gradient-to-br .text-white {
                color: #ffffff !important;
            }

            .fixed.inset-0.bg-black\\/80 {
                background-color: rgb(17 24 39 / 0.55) !important;
            }

            .sidebar-toggle {
                width: 2rem;
                height: 2rem;
                border-radius: 9999px;
                border: 1px solid #e5e7eb;
                background: #ffffff;
                color: #4b5563;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: color .2s ease, border-color .2s ease, background .2s ease, transform .2s ease;
            }

            .sidebar-toggle:hover {
                color: #111827;
                border-color: rgba(249, 115, 22, .55);
                background: #f9fafb;
            }

            @media (min-width: 768px) {
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

        const setCollapsed = (collapsed) => {
            document.body.classList.toggle('sidebar-collapsed', collapsed);
            toggle.setAttribute('aria-expanded', String(!collapsed));
            toggle.setAttribute('aria-label', collapsed ? 'Expandir menu lateral' : 'Minimizar menu lateral');
            toggle.title = collapsed ? 'Expandir menu' : 'Minimizar menu';
            localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
        };

        setCollapsed(localStorage.getItem(STORAGE_KEY) === '1');
        toggle.addEventListener('click', () => setCollapsed(!document.body.classList.contains('sidebar-collapsed')));

        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidebar);
    } else {
        initSidebar();
    }
})();
