// UI para gestión de relaciones N:M: visualizar + añadir + eliminar.

import { api } from './api.js';
import { el, esc, fmtDate, toast, confirmDialog } from './ui.js';


// Mapeo de secciones segun la entidad actual.
const REL_SECTIONS = {
    ideas: [
        { label: 'Agendas relacionadas', rel: 'idea_agenda', target: 'agendas', fkInTarget: 'agenda_id' },
        { label: 'Catálogos relacionados', rel: 'idea_catalogo', target: 'catalogos', fkInTarget: 'catalogo_id' },
    ],
    agendas: [
        { label: 'Ideas relacionadas', rel: 'idea_agenda', target: 'ideas', fkInTarget: 'idea_id' },
        { label: 'Catálogos relacionados', rel: 'agenda_catalogo', target: 'catalogos', fkInTarget: 'catalogo_id' },
    ],
    catalogos: [
        { label: 'Ideas relacionadas', rel: 'idea_catalogo', target: 'ideas', fkInTarget: 'idea_id' },
        { label: 'Agendas relacionadas', rel: 'agenda_catalogo', target: 'agendas', fkInTarget: 'agenda_id' },
    ],
};

// Las keys devueltas por la API (en detail.relations) por seccion origen.
const REL_KEYS = {
    ideas: { idea_agenda: 'agendas', idea_catalogo: 'catalogos' },
    agendas: { idea_agenda: 'ideas', agenda_catalogo: 'catalogos' },
    catalogos: { idea_catalogo: 'ideas', agenda_catalogo: 'agendas' },
};


/**
 * Renderiza el panel completo de relaciones para una entidad.
 * Devuelve un nodo DOM listo para insertar.
 */
export function renderRelationsPanel(entidad, entityId, relations, onChange) {
    const card = el('div', { class: 'relations-card' });
    card.appendChild(el('h4', {}, ['Relaciones']));

    const sections = REL_SECTIONS[entidad] || [];
    const keys = REL_KEYS[entidad] || {};
    if (!sections.length) {
        card.appendChild(el('div', { style: { color: '#9ca3af', fontSize: '.85rem' } }, ['Entidad no soporta relaciones.']));
        return card;
    }

    let total = 0;
    for (const sec of sections) {
        const key = keys[sec.rel];
        const items = (relations && relations[key]) || [];
        total += items.length;
        card.appendChild(relSection(entidad, entityId, sec, items, onChange));
    }
    if (total === 0) {
        card.appendChild(el('div', { style: { color: '#9ca3af', fontSize: '.85rem', marginTop: '.5rem' } }, ['Sin relaciones. Usa los botones "+ Añadir" para crear nuevas.']));
    }
    return card;
}


function relSection(entidad, entityId, sec, items, onChange) {
    const block = el('div', { style: { marginBottom: '1rem' } });
    block.appendChild(el('div', { class: 'relations-section-title' }, [
        el('span', {}, [`${sec.label} (${items.length})`]),
        el('button', {
            class: 'btn btn--ghost btn--sm',
            style: { marginLeft: '.5rem' },
            onclick: () => openAddRelationModal(entidad, entityId, sec, onChange),
        }, ['+ Añadir']),
    ]));

    if (!items.length) {
        block.appendChild(el('div', { style: { color: '#9ca3af', fontSize: '.85rem' } }, ['—']));
        return block;
    }

    const ul = el('ul', { class: 'relations-list' });
    items.forEach(it => {
        const li = el('li', {});
        const a = el('a', {
            href: `#/${sec.target}/${it.id}`,
            style: { flex: 1 },
        }, [
            el('span', {}, [it.titulo || '(sin título)']),
            el('span', { style: { fontSize: '.7rem', color: '#9ca3af' } }, [fmtDate(it.fecha_creacion || it.fecha)]),
        ]);
        li.appendChild(a);
        const delBtn = el('button', {
            class: 'btn btn--sm btn--danger',
            title: 'Eliminar relación',
            style: { padding: '.15rem .45rem' },
            onclick: async () => {
                const ok = await confirmDialog({
                    title: 'Eliminar relación',
                    message: `Vas a eliminar la relación con "${it.titulo}". Los registros NO se eliminan, solo el vínculo.`,
                    okText: 'Eliminar relación',
                    danger: true,
                });
                if (!ok) return;
                try {
                    const r = await fetch(
                        `/api/relations/${sec.rel}?a_id=${encodeURIComponent(entityId)}&b_id=${encodeURIComponent(it.id)}`,
                        { method: 'DELETE' }
                    );
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    toast('Relación eliminada', 'ok');
                    if (onChange) onChange();
                } catch (e) {
                    toast('Error: ' + e.message, 'err');
                }
            },
        }, ['×']);
        li.appendChild(delBtn);
        ul.appendChild(li);
    });
    block.appendChild(ul);
    return block;
}


/**
 * Modal para añadir una relación. Muestra buscador sobre la entidad destino.
 */
async function openAddRelationModal(entidad, entityId, sec, onChange) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__panel" style="min-width:520px; max-height:80vh; display:flex; flex-direction:column;">
            <button class="modal__close" data-close>×</button>
            <h3>Añadir a "${sec.label}"</h3>
            <div style="margin: .5rem 0;">
                <input id="rel-search" type="search" placeholder="Buscar por título…" style="width:100%; padding:.5rem .65rem; border:1px solid #d1d5db; border-radius:5px;" />
            </div>
            <div id="rel-results" style="flex:1; overflow:auto; border:1px solid #e5e7eb; border-radius:6px; min-height:200px;"></div>
            <div class="modal__actions">
                <button class="btn btn--ghost" data-close>Cerrar</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = close);

    const results = modal.querySelector('#rel-results');
    results.replaceChildren(el('div', { class: 'loading' }, ['Cargando…']));
    const search = modal.querySelector('#rel-search');

    async function load(q) {
        results.replaceChildren(el('div', { class: 'loading' }, ['Buscando…']));
        try {
            const params = new URLSearchParams({ limit: '50' });
            if (q) params.set('search', q);
            const data = await api[sec.target].list(Object.fromEntries(params));
            results.replaceChildren();
            if (!data.items.length) {
                results.appendChild(el('div', { class: 'gallery-empty', style: { padding: '1rem' } }, ['Sin resultados.']));
                return;
            }
            const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '.25rem' } });
            data.items.forEach(it => {
                const row = el('div', {
                    class: 'relation-pick',
                    style: {
                        padding: '.5rem .65rem',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                    },
                }, [
                    el('span', {}, [it.titulo || '(sin título)']),
                    el('span', { style: { fontSize: '.7rem', color: '#9ca3af' } }, [fmtDate(it.fecha_creacion || it.fecha)]),
                ]);
                row.onmouseover = () => { row.style.background = '#fef3c7'; };
                row.onmouseout = () => { row.style.background = ''; };
                row.onclick = async () => {
                    try {
                        const r = await fetch(`/api/relations/${sec.rel}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ a_id: entityId, b_id: it.id }),
                        });
                        if (!r.ok) {
                            const err = await r.json().catch(() => ({ detail: r.statusText }));
                            throw new Error(err.detail || `HTTP ${r.status}`);
                        }
                        toast('Relación añadida', 'ok');
                        close();
                        if (onChange) onChange();
                    } catch (e) {
                        toast('Error: ' + e.message, 'err');
                    }
                };
                list.appendChild(row);
            });
            results.appendChild(list);
        } catch (e) {
            results.replaceChildren(el('div', { class: 'empty' }, ['Error: ' + e.message]));
        }
    }

    let debounceTimer;
    search.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => load(search.value.trim()), 220);
    });
    load('');
    setTimeout(() => search.focus(), 50);
}
