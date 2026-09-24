// Vista /desarrollo — Pipeline Kanban de desarrollos por estado.
// Sin drag & drop: usa botones ◀ ▶ grandes en cada tarjeta.
// moverTarjeta() actualiza el DOM localmente tras el PATCH (sin re-render).

import { api } from './api.js';
import { el, esc, fmtDate, toast } from './ui.js';


const ESTADOS = [
    'CONCEPTO',
    'PRUEBA_1',
    'EVALUACION_1',
    'MODIFICACION',
    'PRUEBA_2',
    'VALIDACION',
    'PRODUCTO',
];

const ESTADO_LABEL = {
    CONCEPTO: 'Concepto',
    PRUEBA_1: 'Prueba 1',
    EVALUACION_1: 'Evaluación 1',
    MODIFICACION: 'Modificación',
    PRUEBA_2: 'Prueba 2',
    VALIDACION: 'Validación',
    PRODUCTO: 'Producto',
};

// Cache de transiciones válidas (estado -> [siguientes]).
let TRANSICIONES_CACHE = {};

// Estado actual del board: agenda_id -> {estado, item}.
// Permite mover tarjetas sin re-render completo.
const BOARD_STATE = new Map();


export async function renderPipeline(content, _topbar) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando pipeline…']));

    let pipeline;
    try {
        pipeline = await api.desarrollo.pipeline();
    } catch (e) {
        content.replaceChildren(el('div', { class: 'empty' }, ['Error: ' + e.message]));
        return;
    }

    // Cargar transiciones válidas.
    try {
        const { transiciones } = await api.desarrollo.estados();
        TRANSICIONES_CACHE = transiciones || {};
    } catch (e) {
        console.warn('No se pudieron cargar transiciones:', e);
        TRANSICIONES_CACHE = {};
    }

    // Poblar BOARD_STATE para acceso rápido.
    BOARD_STATE.clear();
    for (const estado of ESTADOS) {
        for (const item of (pipeline[estado] || [])) {
            BOARD_STATE.set(item.id, { estado, item });
        }
    }

    const header = el('div', { class: 'pipeline-header', style: { marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' } }, [
        el('div', {}, [
            el('h2', { style: { margin: 0 } }, ['Desarrollo de productos']),
            el('div', { style: { color: '#6b7280', fontSize: '.85rem', marginTop: '.25rem' } }, [
                'Vista Kanban. Cada tarjeta tiene flechas ◀ ▶ para moverla al estado anterior/siguiente.',
            ]),
        ]),
        el('div', { style: { display: 'flex', gap: '.5rem' } }, [
            el('button', {
                class: 'btn btn--ghost btn--sm',
                title: 'Refrescar desde el servidor',
                onclick: () => renderPipeline(content),
            }, ['🔄 Refrescar']),
            el('button', {
                class: 'btn btn--primary btn--sm',
                onclick: () => crearConcepto(),
            }, ['+ Nuevo desarrollo (CONCEPTO)']),
        ]),
    ]);

    const board = el('div', { class: 'pipeline', 'data-board': '1' });
    for (const estado of ESTADOS) {
        const items = pipeline[estado] || [];
        board.appendChild(buildColumn(estado, items));
    }

    content.replaceChildren(header, board);
}


function buildColumn(estado, items) {
    const col = el('div', { class: 'pipeline__col', 'data-estado': estado });

    col.appendChild(el('div', { class: 'pipeline__col-title' }, [
        el('span', {}, [ESTADO_LABEL[estado]]),
        el('span', { class: 'pipeline__col-count', 'data-count-for': estado }, [String(items.length)]),
    ]));

    const body = el('div', { class: 'pipeline__col-body', 'data-body-for': estado });
    if (!items.length) {
        body.appendChild(el('div', {
            style: { color: '#9ca3af', fontSize: '.75rem', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' },
        }, ['Vacío']));
    } else {
        items.forEach(item => body.appendChild(buildCard(item)));
    }
    col.appendChild(body);

    return col;
}


function buildCard(item) {
    const card = el('div', {
        class: 'pipeline__card',
        'data-agenda-id': item.id,
        'data-estado-origen': item.estado_desarrollo || 'CONCEPTO',
    });
    card.appendChild(el('div', { class: 'pipeline__card-title' }, [item.titulo || '(sin título)']));
    if (item.objetivo) {
        card.appendChild(el('div', { style: { color: '#6b7280', fontSize: '.78rem', marginBottom: '.25rem', lineHeight: 1.3 } }, [
            item.objetivo.slice(0, 80) + (item.objetivo.length > 80 ? '…' : ''),
        ]));
    }
    card.appendChild(el('div', { class: 'pipeline__card-meta' }, [
        el('span', {}, [item.fecha ? fmtDate(item.fecha) : '—']),
        el('span', {}, [item.receta_final ? '✓ receta' : '']),
    ]));

    // Botones de flecha grandes.
    const permitidos = TRANSICIONES_CACHE[item.estado_desarrollo] || [];
    const idxEstado = ESTADOS.indexOf(item.estado_desarrollo);
    const acciones = el('div', { class: 'pipeline__card-actions' });
    const btnPrev = el('button', {
        class: 'btn btn--ghost btn--move',
        title: 'Mover a la columna anterior',
        disabled: idxEstado <= 0,
        onclick: (ev) => {
            ev.stopPropagation();
            if (idxEstado > 0) moverTarjeta(item.id, ESTADOS[idxEstado - 1]);
        },
    }, ['◀']);
    const btnNext = el('button', {
        class: 'btn btn--primary btn--move',
        title: permitidos.length ? ('Avanzar a ' + ESTADO_LABEL[permitidos[0]]) : 'No hay transición siguiente',
        disabled: permitidos.length === 0,
        onclick: (ev) => {
            ev.stopPropagation();
            if (permitidos.length) moverTarjeta(item.id, permitidos[0]);
        },
    }, [permitidos.length ? '▶ ' + ESTADO_LABEL[permitidos[0]] : '▶ (fin)']);
    acciones.appendChild(btnPrev);
    acciones.appendChild(btnNext);
    card.appendChild(acciones);

    card.addEventListener('click', (ev) => {
        if (ev.target.closest('.pipeline__card-actions')) return;
        location.hash = `#/agendas/${item.id}`;
    });

    return card;
}


async function moverTarjeta(agendaId, destinoEstado) {
    const card = document.querySelector(`.pipeline__card[data-agenda-id="${agendaId}"]`);
    if (!card) return;

    // Deshabilitar botones mientras dura el PATCH (evita doble-click).
    const btns = card.querySelectorAll('button');
    btns.forEach(b => b.disabled = true);

    try {
        await api.desarrollo.cambiarEstado(agendaId, destinoEstado, 'Movido desde pipeline');
        toast(`Movido a ${ESTADO_LABEL[destinoEstado]}`, 'ok');
        // Actualización local: mover el nodo de columna sin re-render completo.
        moverNodoLocal(card, destinoEstado);
    } catch (e) {
        toast('Error: ' + e.message, 'err');
        // Si falla, rehabilitar botones.
        btns.forEach(b => b.disabled = false);
        // Y re-pintar para reflejar estado real del servidor.
        const content = document.getElementById('content');
        if (content) await renderPipeline(content);
    }
}


function moverNodoLocal(card, destinoEstado) {
    const destinoCol = document.querySelector(`.pipeline__col[data-estado="${destinoEstado}"]`);
    if (!destinoCol) return;
    const destinoBody = destinoCol.querySelector('[data-body-for]');

    card.parentNode?.removeChild(card);
    card.setAttribute('data-estado-origen', destinoEstado);

    const emptyMsg = destinoBody.querySelector('div[style*="italic"]');
    if (emptyMsg) emptyMsg.remove();

    destinoBody.appendChild(card);

    // Reconstruir acciones con el nuevo estado.
    const acciones = card.querySelector('.pipeline__card-actions');
    if (acciones) acciones.replaceChildren();

    const agendaId = card.getAttribute('data-agenda-id');
    const permitidos = TRANSICIONES_CACHE[destinoEstado] || [];
    const item = BOARD_STATE.get(agendaId)?.item;
    if (item) BOARD_STATE.set(agendaId, { estado: destinoEstado, item });

    const btnPrincipal = el('button', {
        class: 'btn btn--primary btn--block btn--move',
        disabled: permitidos.length === 0,
        onclick: (ev) => {
            ev.stopPropagation();
            if (permitidos.length) moverTarjeta(agendaId, permitidos[0]);
        },
    }, [permitidos.length
        ? 'Pasar a ' + ESTADO_LABEL[permitidos[0]]
        : 'Sin transiciones disponibles']);
    acciones.appendChild(btnPrincipal);

    const btnCambiar = el('button', {
        class: 'btn btn--ghost btn--sm btn--block btn--move-secondary',
        disabled: permitidos.length === 0,
        onclick: (ev) => {
            ev.stopPropagation();
            abrirSelectorEstado(agendaId, permitidos);
        },
    }, ['Cambiar estado…']);
    acciones.appendChild(btnCambiar);

    actualizarContadores();
}


function actualizarContadores() {
    document.querySelectorAll('.pipeline__col').forEach(col => {
        const estado = col.getAttribute('data-estado');
        const count = col.querySelectorAll('.pipeline__card').length;
        const counter = col.querySelector('[data-count-for]');
        if (counter) counter.textContent = String(count);
        // Poner "Vacío" si quedó vacía.
        const body = col.querySelector('[data-body-for]');
        if (body && !body.children.length) {
            body.appendChild(el('div', {
                style: { color: '#9ca3af', fontSize: '.75rem', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' },
            }, ['Vacío']));
        }
    });
}


async function crearConcepto() {
    const titulo = prompt('Título del nuevo desarrollo (CONCEPTO):');
    if (!titulo || !titulo.trim()) return;
    try {
        const created = await api.agendas.create({ titulo: titulo.trim() });
        await api.desarrollo.cambiarEstado(created.id, 'CONCEPTO', 'Creación inicial');
        toast('Desarrollo creado', 'ok');
        location.hash = `#/agendas/${created.id}`;
    } catch (e) {
        toast('Error: ' + e.message, 'err');
    }
}