// Vista de listado genérica para las 3 entidades.
// Decide qué vista pintar (Ideas, Agendas o Catálogos) según el parámetro.

import { api } from './api.js';
import { el, esc, fmtDate, fmtPrice, chip, chipsList, loading, toast, confirmDialog, openImage } from './ui.js';

const VIEW_KEY = 'admin-view-mode';

export async function renderList(entidad, content, opts = {}) {
    const filters = await loadFilters(entidad);
    const initial = loadListState(entidad);
    let state = {
        search: initial.search || '',
        categoria: initial.categoria || '',
        estado: initial.estado || '',
        cursor: null,
        order: initial.order || defaultOrder(entidad),
        ascending: initial.ascending ?? defaultAsc(entidad),
        view: localStorage.getItem(VIEW_KEY) || 'table',
        items: [],
        selected: new Set(),
    };

    const viewMode = el('div', { class: 'view-toggle' }, [
        viewBtn('cards', 'Tarjetas', state),
        viewBtn('table', 'Tabla', state),
        ...(entidad === 'catalogos' ? [viewBtn('grupos', 'Categorias', state)] : []),
        ...(entidad === 'catalogos' ? [exportPdfBtn(state)] : []),
    ]);

    // Botón contextual "Nuevo" en la cabecera de la vista de lista.
    const headerRow = el('div', { class: 'list-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' } }, [
        el('div', {}, [
            el('h2', { style: { margin: 0, fontSize: '1.1rem' } }, [labelFor(entidad)]),
        ]),
        el('button', {
            class: 'btn btn--primary btn--sm',
            onclick: () => crearEntidad(entidad),
        }, ['+ Nuevo ' + labelFor(entidad).toLowerCase().replace(/archivo de |agenda |catálogo/i, m => m.trim()).trim()]),
    ]);

    const filterBar = el('div', { class: 'filters' });

    const searchInput = el('input', {
        type: 'search', placeholder: 'Buscar por título…', value: state.search,
    });
    searchInput.addEventListener('input', debounce(() => {
        state.search = searchInput.value.trim();
        state.cursor = null;
        saveListState(entidad, state);
        reload();
    }, 280));

    const catSelect = el('select', {}, [
        el('option', { value: '' }, ['— Categoría —']),
        ...filters.categorias.map(c => el('option', { value: c, selected: c === state.categoria }, [c])),
    ]);
    catSelect.addEventListener('change', () => {
        state.categoria = catSelect.value;
        state.cursor = null;
        saveListState(entidad, state);
        reload();
    });

    filterBar.appendChild(searchInput);
    if (filters.categorias.length) {
        filterBar.appendChild(el('label', {}, ['Categoría:']));
        filterBar.appendChild(catSelect);
    }
    if (filters.estados.length && entidad !== 'agendas') {
        const estSelect = el('select', {}, [
            el('option', { value: '' }, ['— Estado —']),
            ...filters.estados.map(s => el('option', { value: s, selected: s === state.estado }, [s])),
        ]);
        estSelect.addEventListener('change', () => {
            state.estado = estSelect.value;
            state.cursor = null;
            saveListState(entidad, state);
            reload();
        });
        filterBar.appendChild(el('label', {}, ['Estado:']));
        filterBar.appendChild(estSelect);
    }

    const orderSelect = el('select', {}, orderOptions(entidad).map(([v, label]) =>
        el('option', { value: v, selected: v === state.order }, [label])
    ));
    orderSelect.addEventListener('change', () => {
        state.order = orderSelect.value;
        state.cursor = null;
        saveListState(entidad, state);
        reload();
    });
    const dirBtn = el('button', {
        class: 'btn btn--ghost btn--sm',
        title: 'Cambiar orden',
        onclick: () => {
            state.ascending = !state.ascending;
            dirBtn.textContent = state.ascending ? '↑ Asc' : '↓ Desc';
            state.cursor = null;
            saveListState(entidad, state);
            reload();
        },
    }, [state.ascending ? '↑ Asc' : '↓ Desc']);
    filterBar.appendChild(el('label', {}, ['Orden:']));
    filterBar.appendChild(orderSelect);
    filterBar.appendChild(dirBtn);

    const listArea = el('div', { id: 'list-area' });
    const pagination = el('div', { class: 'pagination' });
    const bulkBar = el('div', { id: 'bulk-bar', class: 'bulk-bar', style: { display: 'none' } });

    content.replaceChildren(headerRow, filterBar, viewMode, bulkBar, listArea, pagination);

    async function reload() {
        loading(listArea);
        try {
            const params = {
                search: state.search || undefined,
                categoria: state.categoria || undefined,
                estado: entidad === 'agendas' ? undefined : (state.estado || undefined),
                etiqueta: entidad === 'agendas' ? (state.categoria || undefined) : undefined,
                order: state.order,
                ascending: state.ascending ? 'true' : 'false',
                cursor: state.cursor || undefined,
                limit: 30,
            };
            Object.keys(params).forEach(k => params[k] === undefined && delete params[k]);

            const data = await api[entidad].list(params);
            state.items = data.items;
            const idsEnPagina = new Set(state.items.map(i => i.id));
            state.selected.forEach(id => { if (!idsEnPagina.has(id)) state.selected.delete(id); });
            paint();
        } catch (e) {
            listArea.replaceChildren(el('div', { class: 'empty', style: { color: '#991b1b' } }, [
                el('strong', {}, ['Error al cargar: ' + e.message]),
                el('pre', { style: { fontSize: '.7rem', marginTop: '.5rem', whiteSpace: 'pre-wrap', color: '#6b7280' } }, [e.stack || '']),
            ]));
            console.error('list.js reload error:', e);
            toast('Error: ' + e.message, 'err');
        }
    }

    function paint() {
        actualizarBulkBar();
        if (state.view === 'grupos' && entidad === 'catalogos') {
            renderGrupos(listArea, state.items);
            pagination.replaceChildren();
            return;
        }
        if (!state.items.length) {
            listArea.replaceChildren(el('div', { class: 'empty' }, [
                'Sin resultados. ',
                el('button', {
                    class: 'btn btn--primary btn--sm',
                    style: { marginLeft: '.5rem' },
                    onclick: () => crearEntidad(entidad),
                }, ['Crear el primero']),
            ]));
            pagination.replaceChildren();
            return;
        }
        if (state.view === 'table') {
            listArea.replaceChildren(renderTable(state.items, entidad, state));
        } else {
            listArea.replaceChildren(renderCards(state.items, entidad, state));
        }
        // Pagination
        pagination.replaceChildren();
        const count = el('span', {}, [`Mostrando ${state.items.length}`]);
        const next = el('button', {
            class: 'btn btn--ghost btn--sm',
            onclick: () => {
                if (state.items.length) state.cursor = state.items[state.items.length - 1].id;
                reload();
            },
        }, ['Siguiente →']);
        pagination.appendChild(count);
        pagination.appendChild(next);
    }

    function actualizarBulkBar() {
        const n = state.selected.size;
        if (n === 0) {
            bulkBar.style.display = 'none';
            bulkBar.replaceChildren();
            return;
        }
        bulkBar.style.display = 'flex';
        bulkBar.replaceChildren(
            el('strong', {}, [n + ' seleccionado' + (n > 1 ? 's' : '')]),
            el('button', {
                class: 'btn btn--danger btn--sm',
                onclick: () => eliminarSeleccionados(entidad, state),
            }, ['🗑 Eliminar']),
            el('button', {
                class: 'btn btn--ghost btn--sm',
                onclick: () => { state.selected.clear(); actualizarBulkBar(); paint(); },
            }, ['Cancelar']),
        );
    }

    function viewBtn(mode, label, st) {
        const b = el('button', {
            class: `btn btn--sm ${st.view === mode ? 'btn--primary' : 'btn--ghost'}`,
            onclick: () => {
                st.view = mode;
                localStorage.setItem(VIEW_KEY, mode);
                paint();
                viewMode.querySelectorAll('button').forEach(btn => {
                    btn.className = `btn btn--sm ${btn.textContent.includes(label) ? 'btn--primary' : 'btn--ghost'}`;
                });
            },
        }, [label]);
        return b;
    }

    function exportPdfBtn(st) {
        const b = el('button', {
            class: 'btn btn--sm btn--ghost',
            title: 'Exportar vista actual a PDF (vía diálogo de impresión del navegador)',
            onclick: async () => {
                await ensurePrintHeader();
                setTimeout(() => window.print(), 50);
            },
        }, ['📄 Exportar PDF']);
        return b;
    }

    async function ensurePrintHeader() {
        let header = document.querySelector('.print-header');
        if (!header) {
            header = el('div', { class: 'print-header' }, [
                el('h1', {}, ['Catálogo · Sol de Nit']),
                el('div', { class: 'print-meta', id: 'print-meta' }, [
                    new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
                ]),
            ]);
            const content = document.getElementById('content');
            if (content) content.insertBefore(header, content.firstChild);
        } else {
            const meta = header.querySelector('#print-meta');
            if (meta) {
                meta.textContent = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        }
    }

    await reload();
}

async function renderGrupos(listArea, items) {
    // Pedir datos agrupados al backend
    let grupos;
    try {
        const r = await fetch('/api/catalogos/grupos');
        grupos = await r.json();
    } catch (e) {
        listArea.replaceChildren(el('div', { class: 'empty' }, ['Error al cargar grupos: ' + e.message]));
        return;
    }
    const wrap = el('div', { class: 'catalogos-grupos' });
    for (const grupo of grupos) {
        const items = grupo.items || [];
        const section = el('div', { style: { marginBottom: '1rem' } });
        const header = el('div', {
            style: { cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.5rem', padding: '.5rem .75rem', background: '#f3f4f6', borderRadius: '6px', fontWeight: 600, fontSize: '.9rem' },
            onclick: function() {
                const body = this.nextElementSibling;
                body.hidden = !body.hidden;
                this.querySelector('.collapse-icon').textContent = body.hidden ? '▶' : '▼';
            },
        });
        header.innerHTML = '<span class="collapse-icon">▼</span> ' + esc(grupo.categoria || 'Sin categoria') + ' <span style="color:#6b7280;font-size:.75rem;font-weight:400;">(' + items.length + ')</span>';
        section.appendChild(header);

        const body = el('div', {}, items.map((it, idx) => {
            const pos = it.orden || idx + 1;
            const card = el('div', {
                style: { padding: '.5rem .75rem', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
                onclick: () => { location.hash = '#/catalogos/' + it.id; },
            });
            const left = el('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } }, [
                el('span', { style: { color: '#9ca3af', fontSize: '.75rem', minWidth: '24px' } }, [pos + '.']),
                el('span', { style: { fontWeight: 500 } }, [it.titulo || '(sin titulo)']),
            ]);
            const right = el('span', { style: { color: '#6b7280', fontSize: '.75rem' } }, [it.precio ? it.precio + ' EUR' : '']);
            card.appendChild(left);
            card.appendChild(right);
            return card;
        }));
        section.appendChild(body);
        wrap.appendChild(section);
    }
    listArea.replaceChildren(wrap);
}



function renderTable(items, entidad, state) {
    const allSelected = items.length > 0 && items.every(i => state.selected.has(i.id));
    const headers = ['', 'Título'];
    if (entidad === 'ideas') {
        headers.push('Fase de proceso', 'Categoría', 'Fecha');
    } else if (entidad === 'agendas') {
        headers.push('Categoría', 'Fecha');
    } else if (entidad === 'catalogos') {
        headers.push('Estado', 'Categoría', 'Precio', 'Orden');
    }
    headers.push('Acciones');

    const headerCheck = el('input', {
        type: 'checkbox',
        checked: allSelected,
        title: 'Seleccionar todos',
        onclick: (ev) => {
            ev.stopPropagation();
            if (ev.target.checked) items.forEach(i => state.selected.add(i.id));
            else state.selected.clear();
            paint();
        },
    });

    const table = el('table', { class: 'table table--selectable' }, [
        el('thead', {}, [
            el('tr', {}, headers.map((h, idx) => el('th', { style: idx === 0 ? { width: '32px' } : (h === 'Acciones' ? { width: '110px', textAlign: 'right' } : {}) }, [
                idx === 0 ? headerCheck : h,
            ])))
        ]),
        el('tbody', {}, items.map(it => {
            const cats = (it.categorias || it.etiquetas || []).join(', ');
            const fase = it.estado || it.estado_idea || '';
            const isSelected = state.selected.has(it.id);

            const checkbox = el('input', {
                type: 'checkbox',
                checked: isSelected,
                onclick: (ev) => {
                    ev.stopPropagation();
                    if (ev.target.checked) state.selected.add(it.id);
                    else state.selected.delete(it.id);
                    actualizarBulkBar();
                    row.classList.toggle('row--selected', state.selected.has(it.id));
                },
            });

            const tds = [
                el('td', { onclick: (ev) => ev.stopPropagation() }, [checkbox]),
                el('td', {}, [el('strong', {}, [it.titulo || '(sin título)'])]),
            ];

            if (entidad === 'ideas') {
                // Fase de proceso: chip coloreado por estado
                tds.push(el('td', {}, [
                    fase
                        ? el('span', {
                            class: 'phase-chip phase-chip--' + esc((fase || '').toLowerCase().replace(/\s+/g, '-')),
                            title: 'Fase actual del proceso creativo',
                        }, [fase])
                        : el('span', { style: { color: '#9ca3af', fontStyle: 'italic' } }, ['—']),
                ]));
                tds.push(el('td', {}, [cats || el('span', { style: { color: '#9ca3af' } }, ['—'])]));
                tds.push(el('td', {}, [fmtDate(it.fecha_creacion)]));
            } else if (entidad === 'agendas') {
                tds.push(el('td', {}, [cats || el('span', { style: { color: '#9ca3af' } }, ['—'])]));
                tds.push(el('td', {}, [fmtDate(it.fecha)]));
            } else if (entidad === 'catalogos') {
                tds.push(el('td', {}, [fase || el('span', { style: { color: '#9ca3af' } }, ['—'])]));
                tds.push(el('td', {}, [cats || el('span', { style: { color: '#9ca3af' } }, ['—'])]));
                tds.push(el('td', {}, [fmtPrice(it.precio)]));
                tds.push(el('td', {}, [it.orden ?? '']));
            }

            // Acciones inline
            const acciones = el('div', { class: 'row-actions' }, [
                el('button', {
                    class: 'row-action-btn',
                    title: 'Editar',
                    onclick: (ev) => { ev.stopPropagation(); location.hash = `#/${entidad}/${it.id}`; },
                }, ['✏️']),
                el('button', {
                    class: 'row-action-btn row-action-btn--danger',
                    title: 'Eliminar',
                    onclick: (ev) => {
                        ev.stopPropagation();
                        eliminarUno(entidad, it);
                    },
                }, ['🗑']),
            ]);
            tds.push(el('td', { class: 'row-actions-cell', onclick: (ev) => ev.stopPropagation() }, [acciones]));

            const row = el('tr', { class: isSelected ? 'row--selected' : '' }, tds);
            row.addEventListener('click', () => { location.hash = `#/${entidad}/${it.id}`; });
            return row;
        })),
    ]);
    return table;
}

function renderCards(items, entidad, state) {
    const wrap = el('div', { class: 'cards' });
    for (const it of items) {
        wrap.appendChild(cardFor(it, entidad, state));
    }
    return wrap;
}

function cardFor(it, entidad, state) {
    const title = it.titulo || '(sin título)';
    const meta = [];
    if (it.fecha_creacion) meta.push(fmtDate(it.fecha_creacion));
    if (it.fecha) meta.push(fmtDate(it.fecha));
    if (entidad === 'catalogos' && it.precio != null) meta.push(fmtPrice(it.precio));
    if (entidad === 'catalogos' && it.orden != null) meta.push('orden ' + it.orden);
    if (entidad === 'catalogos' && it.anio) meta.push('año ' + it.anio);

    const chips = [];
    if (entidad === 'ideas' && it.estado_idea) {
        chips.push({ label: 'Fase: ' + it.estado_idea, variant: 'phase' });
    }
    if (Array.isArray(it.categorias)) chips.push(...it.categorias.filter(Boolean).map(c => ({ label: c })));
    if (Array.isArray(it.etiquetas)) chips.push(...it.etiquetas.filter(Boolean).map(t => ({ label: t })));
    if (entidad === 'catalogos' && it.estado) chips.push({ label: it.estado });

    const chipsNode = el('div', { class: 'chips' });
    chips.forEach(c => chipsNode.appendChild(el('span', {
        class: 'chip' + (c.variant === 'phase' ? ' chip--phase' : ''),
    }, [c.label])));

    const acciones = el('div', { class: 'row-actions', style: { marginTop: '.5rem' } }, [
        el('button', {
            class: 'row-action-btn',
            title: 'Editar',
            onclick: (ev) => { ev.stopPropagation(); location.hash = `#/${entidad}/${it.id}`; },
        }, ['✏️ Editar']),
        el('button', {
            class: 'row-action-btn row-action-btn--danger',
            title: 'Eliminar',
            onclick: (ev) => { ev.stopPropagation(); eliminarUno(entidad, it); },
        }, ['🗑 Eliminar']),
    ]);

    const card = el('div', { class: 'card' }, [
        el('div', { class: 'card__title' }, [title]),
        el('div', { class: 'card__meta' }, [meta.join(' · ') || '']),
        chipsNode,
        acciones,
    ]);
    card.addEventListener('click', (ev) => {
        if (ev.target.closest('.row-actions')) return;
        location.hash = `#/${entidad}/${it.id}`;
    });
    return card;
}

function labelFor(entidad) {
    return {
        ideas: 'Ideas',
        agendas: 'Agenda',
        catalogos: 'Catálogo',
    }[entidad] || entidad;
}

function crearEntidad(entidad) {
    const titleByEnt = {
        ideas: 'Nueva idea',
        agendas: 'Nueva agenda',
        catalogos: 'Nuevo catálogo',
    };
    const label = labelFor(entidad).toLowerCase();
    const titulo = prompt('Título del nuevo ' + label + ':');
    if (!titulo || !titulo.trim()) return;
    api[entidad].create({ titulo: titulo.trim() })
        .then(row => {
            toast('Creado', 'ok');
            location.hash = `#/${entidad}/${row.id}`;
        })
        .catch(e => toast('Error: ' + e.message, 'err'));
}

function eliminarUno(entidad, item) {
    if (!confirm('¿Eliminar "' + (item.titulo || 'sin título') + '"?')) return;
    api[entidad].delete(item.id)
        .then(() => {
            toast('Eliminado', 'ok');
            // Limpiar selección y recargar via hashchange para que la UI se actualice.
            refreshCurrentList();
        })
        .catch(e => toast('Error: ' + e.message, 'err'));
}

function eliminarSeleccionados(entidad, state) {
    const ids = [...state.selected];
    if (!ids.length) return;
    if (!confirm('¿Eliminar ' + ids.length + ' elemento' + (ids.length > 1 ? 's' : '') + '?')) return;
    Promise.all(ids.map(id => api[entidad].delete(id).catch(e => ({ id, error: e.message }))))
        .then(results => {
            const errores = results.filter(r => r && r.error);
            if (errores.length) {
                toast(errores.length + ' error(es): ' + errores.map(e => e.error).join('; '), 'err');
            } else {
                toast(ids.length + ' eliminado' + (ids.length > 1 ? 's' : ''), 'ok');
            }
            state.selected.clear();
            refreshCurrentList();
        });
}

function refreshCurrentList() {
    // Dispara hashchange (mismo valor) para forzar re-render de la lista.
    const h = location.hash;
    location.hash = '';
    setTimeout(() => { location.hash = h; }, 0);
}

function debounce(fn, ms) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

async function loadFilters(entidad) {
    try {
        return await api.filters(entidad);
    } catch {
        return { categorias: [], estados: [] };
    }
}

function defaultOrder(ent) {
    return ent === 'catalogos' ? 'orden' : (ent === 'agendas' ? 'fecha' : 'fecha_creacion');
}
function defaultAsc(ent) {
    return ent === 'catalogos';
}

function orderOptions(ent) {
    if (ent === 'catalogos') {
        return [['orden', 'Orden'], ['titulo', 'Título'], ['precio', 'Precio'], ['anio', 'Año']];
    }
    if (ent === 'agendas') {
        return [['fecha', 'Fecha'], ['titulo', 'Título'], ['fecha_creacion', 'Creación']];
    }
    return [['fecha_creacion', 'Creación'], ['titulo', 'Título'], ['estado_idea', 'Estado']];
}

function loadListState(ent) {
    try { return JSON.parse(sessionStorage.getItem('admin-list-' + ent) || '{}'); }
    catch { return {}; }
}
function saveListState(ent, st) {
    try {
        sessionStorage.setItem('admin-list-' + ent, JSON.stringify({
            search: st.search, categoria: st.categoria, estado: st.estado,
            order: st.order, ascending: st.ascending,
        }));
    } catch {}
}
