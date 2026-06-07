(function () {
    const STORAGE_KEY = 'sqv_sidebar_collapsed';

    function injectStyles() {
        if (document.getElementById('sidebar-collapse-style')) return;

        const style = document.createElement('style');
        style.id = 'sidebar-collapse-style';
        style.textContent = `
            .sidebar-toggle {
                width: 2rem;
                height: 2rem;
                border-radius: 9999px;
                border: 1px solid #2a1e17;
                background: #120c08;
                color: #cbd5e1;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                transition: color .2s ease, border-color .2s ease, background .2s ease, transform .2s ease;
            }

            .sidebar-toggle:hover {
                color: #fff;
                border-color: rgba(249, 115, 22, .55);
                background: rgba(255, 255, 255, .05);
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
