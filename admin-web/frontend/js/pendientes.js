// Vista /pendientes — panel priorizado de accionables.

import { api } from './api.js';
import { el, fmtDate, toast } from './ui.js';


const GRUPO_TITULO = {
    ROJO: { emoji: '🔴', label: 'Urgente (>3 días esperando)' },
    NARANJA: { emoji: '🟠', label: 'Hoy' },
    AMARILLO: { emoji: '🟡', label: 'Esta semana' },
    VERDE: { emoji: '🟢', label: 'Listo para producto' },
};

const ACCION_POR_ESTADO = {
    CONCEPTO: 'Crear Prueba 1',
    PRUEBA_1: 'Registrar resultado',
    EVALUACION_1: 'Crear evaluación de mesa',
    MODIFICACION: 'Crear Prueba 2',
    PRUEBA_2: 'Validar producto',
    VALIDACION: 'Crear producto en catálogo',
    PRODUCTO: 'Emplatado IA',
};


export async function renderPendientes(content, _topbar) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando pendientes…']));

    let items;
    try {
        items = await api.desarrollo.pendientes();
    } catch (e) {
        content.replaceChildren(el('div', { class: 'empty' }, ['Error: ' + e.message]));
        return;
    }

    const wrap = el('div', { class: 'pendientes' });
    wrap.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } }, [
        el('h2', { style: { margin: 0 } }, ['Pendientes']),
        el('div', { style: { color: '#6b7280', fontSize: '.85rem' } }, [
            'Derivado del estado real de cada desarrollo.',
        ]),
    ]));

    // Agrupar por prioridad
    const grupos = { ROJO: [], NARANJA: [], AMARILLO: [], VERDE: [] };
    items.forEach(it => {
        const p = it.prioridad || 'AMARILLO';
        (grupos[p] = grupos[p] || []).push(it);
    });

    // Si no hay nada
    if (!items.length) {
        wrap.appendChild(el('div', { class: 'empty' }, [
            '🎉 No hay pendientes. Todos los desarrollos están al día.',
        ]));
        content.replaceChildren(wrap);
        return;
    }

    for (const key of ['ROJO', 'NARANJA', 'AMARILLO', 'VERDE']) {
        const arr = grupos[key];
        if (!arr || !arr.length) continue;
        const grupo = el('div', { class: 'pendientes__grupo' });
        grupo.appendChild(el('div', { class: 'pendientes__grupo-titulo' }, [
            el('span', {}, [GRUPO_TITULO[key].emoji + ' ' + GRUPO_TITULO[key].label]),
            el('span', { class: `prio-${key}`, style: { padding: '.15rem .5rem', borderRadius: '12px', fontSize: '.7rem', fontWeight: 600 } }, [String(arr.length)]),
        ]));
        arr.forEach(it => grupo.appendChild(buildItem(it)));
        wrap.appendChild(grupo);
    }
    content.replaceChildren(wrap);
}


function buildItem(it) {
    const row = el('div', { class: 'pendientes__item' });
    const left = el('div', {}, [
        el('div', { class: 'pendientes__item-titulo' }, [it.titulo || '(sin título)']),
        el('div', { class: 'pendientes__item-meta' }, [
            it.estado_desarrollo + (it.dias_sin_actividad != null ? ` · ${it.dias_sin_actividad}d sin actividad` : ''),
        ]),
    ]);
    const right = el('div', { class: 'pendientes__item-accion' }, [
        ACCION_POR_ESTADO[it.estado_desarrollo] || '—',
    ]);
    row.appendChild(left);
    row.appendChild(right);
    row.addEventListener('click', () => {
        location.hash = `#/agendas/${it.id}`;
    });
    return row;
}
