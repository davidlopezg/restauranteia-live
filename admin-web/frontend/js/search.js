// Búsqueda global unificada (Cmd+K o clic en barra de búsqueda)
// Busca en ideas, agendas y catálogos simultáneamente.

import { el, esc, toast } from './ui.js';
let _resultCache = {};

export function setupGlobalSearch() {
    // Handler de teclado: Cmd+K o Ctrl+K
    document.addEventListener('keydown', (ev) => {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
            ev.preventDefault();
            toggleSearch();
        }
    });
}

function toggleSearch() {
    if (_searchOverlay) {
        closeSearch();
        return;
    }
    openSearchOverlay();
}

async function openSearchOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'global-search-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9999;display:flex;justify-content:center;padding-top:15vh;';
    overlay.onclick = (e) => { if (e.target === overlay) closeSearch(); };

    const panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:12px;width:600px;max-width:90vw;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);';
    overlay.appendChild(panel);

    // Header con input
    const header = document.createElement('div');
    header.style.cssText = 'padding:.75rem 1rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:.75rem;';
    const icon = document.createElement('span');
    icon.textContent = '🔍';
    icon.style.cssText = 'font-size:1.2rem;';
    header.appendChild(icon);
    const input = document.createElement('input');
    input.id = 'gs-input';
    input.type = 'text';
    input.placeholder = 'Buscar en ideas, agenda, catálogo…';
    input.style.cssText = 'flex:1;border:none;outline:none;font-size:.95rem;background:transparent;';
    input.autofocus = true;
    header.appendChild(input);
    const escText = document.createElement('span');
    escText.textContent = 'Esc';
    escText.style.cssText = 'font-size:.7rem;color:#9ca3af;background:#f3f4f6;padding:.15rem .4rem;border-radius:4px;';
    header.appendChild(escText);
    panel.appendChild(header);

    // Resultados
    const results = document.createElement('div');
    results.id = 'gs-results';
    results.style.cssText = 'overflow-y:auto;padding:.5rem;flex:1;';
    results.textContent = '';
    panel.appendChild(results);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = 'padding:.35rem 1rem;border-top:1px solid #e5e7eb;font-size:.7rem;color:#9ca3af;';
    footer.textContent = 'Escribe para buscar · Enter abre el primero · ↑↓ navega';
    panel.appendChild(footer);

    document.body.appendChild(overlay);
    _searchOverlay = overlay;

    // Eventos
    let debounceTimer;
    input.oninput = () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 2) { results.replaceChildren(); return; }
        debounceTimer = setTimeout(() => doSearch(q, results), 250);
    };
    input.onkeydown = (ev) => {
        if (ev.key === 'Escape') { closeSearch(); return; }
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { navigateResults(ev, results); return; }
        if (ev.key === 'Enter') { openFirstResult(results); return; }
    };
    document.addEventListener('keydown', onEsc);
}

function onEsc(ev) {
    if (ev.key === 'Escape') closeSearch();
}

function closeSearch() {
    if (_searchOverlay) {
        _searchOverlay.remove();
        _searchOverlay = null;
    }
    document.removeEventListener('keydown', onEsc);
}

async function doSearch(query, resultsContainer) {
    resultsContainer.replaceChildren(el('div', { style: { padding: '1rem', textAlign: 'center', color: '#9ca3af', fontSize: '.85rem' } }, ['Buscando…']));

    try {
        const [ideas, agendas, catalogos] = await Promise.all([
            fetch(`/api/ideas?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()).catch(() => ({ items: [] })),
            fetch(`/api/agendas?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()).catch(() => ({ items: [] })),
            fetch(`/api/catalogos?search=${encodeURIComponent(query)}&limit=5`).then(r => r.json()).catch(() => ({ items: [] })),
        ]);
        _resultCache = { ideas: ideas.items || [], agendas: agendas.items || [], catalogos: catalogos.items || [] };
        renderSearchResults(query, _resultCache, resultsContainer);
    } catch {
        resultsContainer.replaceChildren(el('div', { style: { padding: '1rem', textAlign: 'center', color: '#ef4444', fontSize: '.85rem' } }, ['Error de búsqueda']));
    }
}

function renderSearchResults(query, data, container) {
    container.replaceChildren();
    let total = 0;
    let firstResult = null;

    function addSection(title, items, url) {
        if (!items.length) return;
        const section = document.createElement('div');
        section.style.cssText = 'margin-bottom:.5rem;';

        const header = document.createElement('div');
        header.style.cssText = 'font-size:.7rem;color:#6b7280;padding:.25rem .75rem;text-transform:uppercase;letter-spacing:.05em;font-weight:600;';
        header.textContent = title + ' (' + items.length + ')';
        section.appendChild(header);

        items.forEach((item, i) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:.5rem .75rem;cursor:pointer;border-radius:6px;';
            row.onclick = () => {
                closeSearch();
                location.hash = url + '/' + item.id;
            };
            row.onmouseover = () => { row.style.background = '#f3f4f6'; };
            row.onmouseout = () => { row.style.background = 'transparent'; };
            row.innerHTML = '<span style="font-weight:500;font-size:.85rem">' +
                esc(item.titulo || '(sin titulo)') + '</span>' +
                (item.precio ? ' <span style="color:#6b7280;font-size:.78rem">' + item.precio + ' EUR</span>' : '');
            section.appendChild(row);

            if (!firstResult) firstResult = { row, url: url + '/' + item.id };
        });
        container.appendChild(section);
        total += items.length;
    }

    addSection('Ideas', data.ideas, '#/ideas');
    addSection('Agenda', data.agendas, '#/agendas');
    addSection('Catálogo', data.catalogos, '#/catalogos');

    if (total === 0) {
        container.appendChild(el('div', { style: { padding: '1.5rem', textAlign: 'center', color: '#6b7280', fontSize: '.85rem' } }, [
            'Sin resultados para "' + query + '"',
        ]));
    }
}

function navigateResults(ev, container) {
    const rows = container.querySelectorAll('div[style*="cursor:pointer"]');
    if (!rows.length) return;
    const idx = Array.from(rows).findIndex(r => r.style.background === 'rgb(243, 244, 246)');
    const nextIdx = ev.key === 'ArrowDown'
        ? (idx + 1) % rows.length
        : idx <= 0 ? rows.length - 1 : idx - 1;
    rows.forEach(r => { r.style.background = 'transparent'; });
    rows[nextIdx].style.background = '#f3f4f6';
    rows[nextIdx].scrollIntoView({ block: 'nearest' });
}

function openFirstResult(container) {
    const rows = container.querySelectorAll('div[style*="cursor:pointer"]');
    const idx = Array.from(rows).findIndex(r => r.style.background === 'rgb(243, 244, 246)');
    const target = idx >= 0 ? rows[idx] : rows[0];
    if (target) target.click();
}
