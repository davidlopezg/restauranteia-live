// Vista de detalle + edición.
// Renderiza propiedades, bloques, galería de imágenes (con CRUD) y panel de relaciones.

import { api } from './api.js';
import { el, esc, fmtDate, fmtPrice, toast, confirmDialog } from './ui.js';
import { renderBlocks, indexImagesByBlockId } from './blocks.js';
import { renderImageGallery } from './images.js';
import { renderRelationsPanel } from './relations.js';
import { renderTestsSection } from './tests.js';

export async function renderDetail(entidad, id, content, _topbar) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando…']));
    let detail;
    try {
        detail = await api[entidad].detail(id);
    } catch (e) {
        content.replaceChildren(el('div', { class: 'empty' }, ['Error: ' + e.message]));
        return;
    }

    document.getElementById('topbar-title').textContent = detail.item.titulo || '(sin título)';
    document.getElementById('btn-back').hidden = false;

    const isCatalogos = entidad === 'catalogos';
    const isAgendas = entidad === 'agendas';

    async function refresh() {
        const fresh = await api[entidad].detail(id);
        detail = fresh;
        render();
    }

    async function render() {
        const header = buildHeader(detail.item, () => openEditForm());
        const props = buildProps(detail.item, isCatalogos, isAgendas);
        const blocksSection = buildBlocksSection(detail);
        const galleryNode = renderImageGallery(entidad, id, detail.images, refresh);
        const devSection = isAgendas ? buildDesarrolloSection(detail.item, refresh) : null;
        const convertirSection = (!isAgendas && !isCatalogos) ? buildConvertirSection(detail.item, refresh) : null;
        const testsSection = isAgendas ? await renderTestsSectionSafe(id, refresh) : null;
        const relPanel = renderRelationsPanel(entidad, id, detail.relations, refresh);

        const main = el('div', { class: 'detail__main' }, [header, props, blocksSection]);
        const side = el('div', { class: 'detail__side' }, [devSection, convertirSection, galleryNode, testsSection, relPanel].filter(Boolean));
        content.replaceChildren(el('div', { class: 'detail' }, [main, side]));

        setTimeout(() => resolveBlockImages(content), 0);
    }

    function openEditForm() {
        const form = renderEditForm(entidad, detail.item);
        const main = content.querySelector('.detail__main');
        main.replaceChildren(form);
    }

    async function onDelete() {
        const ok = await confirmDialog({
            title: 'Eliminar registro',
            message: `Vas a eliminar "${detail.item.titulo}". Esta acción NO se puede deshacer (se borrarán también sus bloques, imágenes y relaciones).`,
            okText: 'Eliminar',
            danger: true,
        });
        if (!ok) return;
        try {
            await api[entidad].delete(id);
            toast('Eliminado', 'ok');
            location.hash = `#/${entidad}`;
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    }

    render();

    // Expongo handlers al scope accesible desde header (closure-friendly)
    render._refresh = refresh;
    render._openEdit = openEditForm;
    render._onDelete = onDelete;
    // Hack: hacemos accesibles las funciones para los botones de header
    // re-renderizando con callbacks reales. Más simple: re-asignar handlers aquí.
    const editBtn = content.querySelector('.detail__actions .btn--ghost');
    const delBtn = content.querySelector('.detail__actions .btn--danger');
    if (editBtn) editBtn.onclick = openEditForm;
    if (delBtn) delBtn.onclick = onDelete;
}


function buildHeader(item, _onEdit) {
    return el('div', { class: 'detail__header' }, [
        el('h1', { class: 'detail__title' }, [item.titulo || '(sin título)']),
        el('div', { class: 'detail__actions' }, [
            // Botones sin handler — los handlers se asignan en renderDetail post-mount
            el('button', { class: 'btn btn--ghost btn--sm', 'data-action': 'edit' }, ['✎ Editar']),
            el('button', { class: 'btn btn--danger btn--sm', 'data-action': 'delete' }, ['🗑 Eliminar']),
        ]),
    ]);
}


function buildProps(item, isCatalogos, isAgendas) {
    const props = el('dl', { class: 'detail__props' });
    pushProp(props, 'ID', item.id);
    pushProp(props, 'Notion ID', item.notion_id);
    if (item.descripcion) pushProp(props, 'Descripción', item.descripcion);
    const estado = isCatalogos ? item.estado : item.estado_idea;
    if (estado) pushProp(props, 'Estado', estado);
    if (item.puntuacion) pushProp(props, 'Puntuación', item.puntuacion);
    if (item.fecha_creacion) pushProp(props, 'Fecha creación', fmtDate(item.fecha_creacion));
    if (item.fecha) pushProp(props, 'Fecha', fmtDate(item.fecha));
    if (isCatalogos) {
        if (item.orden != null) pushProp(props, 'Orden', item.orden);
        if (item.precio != null) pushProp(props, 'Precio', fmtPrice(item.precio));
        if (item.anio) pushProp(props, 'Año', item.anio);
        if (item.seleccionada != null) pushProp(props, 'Seleccionada', item.seleccionada ? 'Sí' : 'No');
        if (item.ingredientes) pushProp(props, 'Ingredientes', item.ingredientes);
    }
    if (isAgendas && Array.isArray(item.etiquetas) && item.etiquetas.length) {
        pushProp(props, 'Etiquetas', item.etiquetas.join(', '));
    }
    if (Array.isArray(item.categorias) && item.categorias.length) {
        pushProp(props, 'Categorías', item.categorias.join(', '));
    }
    if (item.notion_last_edited) pushProp(props, 'Última edición Notion', fmtDate(item.notion_last_edited));
    if (item.migrated_at) pushProp(props, 'Migrado', fmtDate(item.migrated_at));
    return props;
}


function buildBlocksSection(detail) {
    const imagesByBlockId = indexImagesByBlockId(detail.images);
    const blocksFrag = renderBlocks(detail.blocks, imagesByBlockId);
    return el('div', {}, [
        el('div', { class: 'section-title' }, [`Contenido (${detail.blocks.length} bloques)`]),
        blocksFrag,
    ]);
}


// === Desarrollo section (solo para agendas) ===

// === Convertir en concepto (solo para ideas) ===
function buildConvertirSection(item, refresh) {
    const section = el('div', { class: 'relations-card' });
    section.appendChild(el('h4', {}, ['Convertir en concepto']));
    section.appendChild(el('p', { style: { fontSize: '.82rem', color: '#6b7280', marginBottom: '.5rem' } }, [
        'Convierte esta idea en un desarrollo (agenda) en estado CONCEPTO. Se crea la relación idea↔agenda automáticamente.',
    ]));
    section.appendChild(el('button', {
        class: 'btn btn--primary btn--block',
        onclick: async () => {
            const btn = arguments[0]?.target || section.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Convirtiendo…';
            try {
                const r = await fetch(`/api/ideas/${item.id}/convertir`, { method: 'POST' });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({ detail: r.statusText }));
                    throw new Error(err.detail || 'HTTP ' + r.status);
                }
                const data = await r.json();
                if (data.already_exists) {
                    toast('Ya existe una agenda para esta idea', 'ok');
                    location.hash = `#/agendas/${data.agenda_id}`;
                } else {
                    toast('Idea convertida en concepto', 'ok');
                    location.hash = `#/agendas/${data.agenda_id}`;
                }
            } catch (e) {
                toast('Error: ' + e.message, 'err');
                btn.disabled = false;
                btn.textContent = 'Convertir en concepto';
            }
        },
    }, ['🚀 Convertir en concepto']));
    return section;
}


const ESTADOS = ['CONCEPTO', 'PRUEBA_1', 'EVALUACION_1', 'MODIFICACION', 'PRUEBA_2', 'VALIDACION', 'PRODUCTO'];
const ESTADO_LABELS = {
    CONCEPTO: 'Concepto', PRUEBA_1: 'Prueba 1', EVALUACION_1: 'Evaluación',
    MODIFICACION: 'Modificación', PRUEBA_2: 'Prueba 2', VALIDACION: 'Validación', PRODUCTO: 'Producto',
};
const SIGUIENTE_ACCION = {
    CONCEPTO: ['Crear Prueba 1', 'PRUEBA_1'],
    PRUEBA_1: ['Registrar resultado', 'EVALUACION_1'],
    EVALUACION_1: ['Crear evaluación', 'PRUEBA_2'],
    MODIFICACION: ['Crear Prueba 2', 'PRUEBA_2'],
    PRUEBA_2: ['Validar producto', 'VALIDACION'],
    VALIDACION: ['Crear producto en catálogo', 'PRODUCTO'],
    PRODUCTO: ['Generar emplatado IA', null],
};


function buildDesarrolloSection(item, refresh) {
    const section = el('div', { class: 'relations-card' });
    section.appendChild(el('h4', {}, ['Desarrollo']));

    const estado = item.estado_desarrollo;
    if (!estado) {
        section.appendChild(el('div', { style: { color: '#9ca3af', fontSize: '.85rem', marginBottom: '.5rem' } }, [
            'Sin estado de desarrollo asignado.',
        ]));
        section.appendChild(el('button', {
            class: 'btn btn--primary btn--block btn--sm',
            onclick: async () => {
                try {
                    await api.desarrollo.cambiarEstado(item.id, 'CONCEPTO', 'Iniciado desde ficha');
                    toast('Estado asignado: CONCEPTO', 'ok');
                    if (refresh) refresh();
                } catch (e) { toast('Error: ' + e.message, 'err'); }
            },
        }, ['Iniciar desarrollo (CONCEPTO)']));
        return section;
    }

    // Pill de estado
    section.appendChild(el('div', {
        class: `estado-${estado}`,
        style: { display: 'inline-block', padding: '.25rem .75rem', borderRadius: '12px', fontSize: '.8rem', fontWeight: 600, marginBottom: '.5rem' },
    }, [ESTADO_LABELS[estado] || estado]));

    // Ciclo visual
    const ciclo = el('div', { class: 'dev-ficha__ciclo' });
    let reached = false;
    for (const e of ESTADOS) {
        const cls = e === estado ? 'activo' : (reached ? '' : (e === estado || reached ? '' : 'hecho'));
        if (e === estado) reached = true;
        const item_el = el('span', {
            class: `dev-ficha__ciclo-item ${e === estado ? 'activo' : (reached ? '' : 'hecho')}`,
        }, [ESTADO_LABELS[e]]);
        ciclo.appendChild(item_el);
        if (e !== 'PRODUCTO') ciclo.appendChild(el('span', { style: { color: '#9ca3af', fontSize: '.65rem' } }, ['→']));
    }
    section.appendChild(ciclo);

    // Próxima acción
    const next = SIGUIENTE_ACCION[estado];
    if (next) {
        const accion = el('div', { class: 'dev-ficha__siguiente-accion' }, [
            el('span', {}, [next[0]]),
            el('button', {
                class: 'btn btn--primary btn--sm',
                onclick: async () => {
                    if (next[1]) {
                        await avanzarEstado(item.id, next[1], refresh);
                    } else {
                        toast('Siguiente acción: ve a la sección Emplatado', 'ok');
                    }
                },
            }, ['→']),
        ]);
        section.appendChild(accion);
    }

    // Timeline (últimos 6 eventos)
    const timeline = item.timeline || [];
    if (timeline.length) {
        section.appendChild(el('div', { class: 'section-title' }, ['Timeline']));
        const ul = el('ul', { class: 'dev-ficha__timeline' });
        [...timeline].reverse().slice(0, 6).forEach(ev => {
            const ts = ev.ts ? new Date(ev.ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '—';
            const li = el('li', {}, [
                el('div', { class: 'dev-ficha__timeline-fecha' }, [ts]),
                el('div', { class: 'dev-ficha__timeline-tipo' }, [ev.tipo.replace(/_/g, ' ')]),
                ev.desc ? el('div', { style: { fontSize: '.78rem', color: '#4b5563' } }, [ev.desc]) : null,
            ].filter(Boolean));
            ul.appendChild(li);
        });
        section.appendChild(ul);
    }

    return section;
}


async function avanzarEstado(agendaId, nuevoEstado, refresh) {
    try {
        await api.desarrollo.cambiarEstado(agendaId, nuevoEstado, '');
        toast(`Estado cambiado a ${ESTADO_LABELS[nuevoEstado] || nuevoEstado}`, 'ok');
        if (refresh) refresh();
    } catch (e) {
        toast('Error: ' + e.message, 'err');
    }
}


async function renderTestsSectionSafe(agendaId, refresh) {
    try {
        return await renderTestsSection(agendaId, refresh);
    } catch (e) {
        return el('div', { style: { color: '#ef4444', fontSize: '.85rem' } }, [
            'Error cargando pruebas: ' + e.message,
        ]);
    }
}


function pushProp(dl, label, value) {
    if (value === null || value === undefined || value === '') return;
    dl.appendChild(el('dt', {}, [label]));
    dl.appendChild(el('dd', {}, [String(value)]));
}


async function resolveBlockImages(root) {
    const imgs = root.querySelectorAll('img[data-lazy]');
    for (const im of imgs) {
        const wrap = im.closest('.block--image');
        if (!wrap) continue;
        const bucket = wrap.dataset.bucket;
        const path = wrap.dataset.path;
        if (!bucket || !path) continue;
        try {
            const { url } = await api.images.signedUrl(bucket, path);
            im.src = url;
            im.addEventListener('click', () => {
                // openImage imported dynamically to avoid circular
                import('./ui.js').then(m => m.openImage(url));
            });
        } catch {
            im.replaceWith(el('div', { class: 'block--embed-broken' }, ['⚠ No se pudo cargar imagen']));
        }
    }
}


// === Form de edición ===
function renderEditForm(entidad, current) {
    const form = el('form', { class: 'detail__main' });
    form.appendChild(el('h2', {}, ['Editar']));

    const grid = el('div', { class: 'form-grid' });

    const fields = [
        ['titulo', 'Título', 'text', current.titulo],
        ['descripcion', 'Descripción', 'textarea', current.descripcion],
        ['categorias', 'Categorías (separadas por coma)', 'text', (current.categorias || []).join(', ')],
        ['etiquetas', 'Etiquetas (Agenda, separadas por coma)', 'text', (current.etiquetas || []).join(', ')],
        ['puntuacion', 'Puntuación', 'text', current.puntuacion],
        ['estado_idea', 'Estado (Idea)', 'text', current.estado_idea],
        ['estado', 'Estado (Catálogo)', 'text', current.estado],
        ['fecha_creacion', 'Fecha creación', 'datetime-local', current.fecha_creacion ? current.fecha_creacion.slice(0, 16) : ''],
        ['fecha', 'Fecha (Agenda)', 'date', current.fecha],
        ['orden', 'Orden (Catálogo)', 'number', current.orden],
        ['precio', 'Precio (Catálogo)', 'number', current.precio],
        ['anio', 'Año (Catálogo)', 'text', current.anio],
        ['ingredientes', 'Ingredientes (Catálogo)', 'textarea', current.ingredientes],
    ];

    const inputs = {};
    for (const [key, label, type, value] of fields) {
        const skip = (
            (entidad === 'ideas' && ['etiquetas', 'estado', 'fecha', 'orden', 'precio', 'anio', 'ingredientes'].includes(key)) ||
            (entidad === 'agendas' && ['descripcion', 'categorias', 'puntuacion', 'estado_idea', 'estado', 'orden', 'precio', 'anio', 'ingredientes'].includes(key)) ||
            (entidad === 'catalogos' && ['descripcion', 'puntuacion', 'estado_idea', 'etiquetas', 'fecha'].includes(key))
        );
        if (skip && (value === '' || value == null)) continue;

        grid.appendChild(el('label', { for: `f-${key}` }, [label]));
        let inp;
        if (type === 'textarea') {
            inp = el('textarea', { id: `f-${key}`, name: key, rows: 3 }, [value || '']);
        } else {
            inp = el('input', {
                id: `f-${key}`, name: key, type, value: value ?? '',
                step: type === 'number' ? '0.01' : undefined,
            });
        }
        inputs[key] = inp;
        grid.appendChild(inp);
    }
    form.appendChild(grid);

    const actions = el('div', { class: 'form-actions' }, [
        el('button', { type: 'button', class: 'btn btn--ghost', onclick: () => location.hash = `#/${entidad}/${current.id}` }, ['Cancelar']),
        el('button', { type: 'submit', class: 'btn btn--primary' }, ['Guardar']),
    ]);
    form.appendChild(actions);

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const payload = {};
        for (const [k, inp] of Object.entries(inputs)) {
            let v = inp.value;
            if (k === 'categorias' || k === 'etiquetas') {
                v = v.split(',').map(x => x.trim()).filter(Boolean);
                if (v.length === 0) v = null;
            }
            if (k === 'orden') v = v === '' ? null : parseInt(v, 10);
            if (k === 'precio') v = v === '' ? null : parseFloat(v);
            if (k === 'fecha_creacion' && v) v = new Date(v).toISOString();
            if (v === '') v = null;
            if (v !== null && v !== undefined) payload[k] = v;
        }
        try {
            await api[entidad].update(current.id, payload);
            toast('Guardado', 'ok');
            location.hash = `#/${entidad}/${current.id}`;
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    });

    return form;
}
