// Dashboard de objetivos semanales (cadencia)

import { el, toast } from './ui.js';

export async function renderCadencia(content, topbar) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando dashboard semanal…']));

    let data;
    try {
        const r = await fetch('/api/cadencia/semana-actual');
        data = await r.json();
    } catch (e) {
        content.replaceChildren(el('div', { class: 'empty' }, ['Error al cargar: ' + e.message]));
        return;
    }

    let historial;
    try {
        const r = await fetch('/api/cadencia/historial?limit=8');
        historial = await r.json();
    } catch {}

    const week = data.week || {};
    const actividad = data.actividad || {};
    const wrap = el('div', { style: { maxWidth: '800px' } });

    // ===== HEADER =====
    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' } });
    header.appendChild(el('h2', {}, ['Dashboard Semanal']));
    const semLabel = week.semana_inicio
        ? el('span', { style: { fontSize: '.85rem', color: '#6b7280' } }, ['Semana ' + week.semana_inicio + ' → ' + (week.semana_fin || '')])
        : el('span', { style: { fontSize: '.85rem', color: '#9ca3af' } }, ['Sin semana activa']);
    header.appendChild(semLabel);
    wrap.appendChild(header);

    // ===== OBJETIVOS =====
    const objCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    objCard.appendChild(el('h4', {}, [' Objetivos de la semana']));
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.5rem' } });

    function stat(label, value, color = '#1f2937') {
        return el('div', { style: { background: '#f9fafb', borderRadius: '8px', padding: '.75rem' } }, [
            el('div', { style: { fontSize: '.75rem', color: '#6b7280', marginBottom: '.15rem' } }, [label]),
            el('div', { style: { fontSize: '1.4rem', fontWeight: 700, color } }, [value != null ? String(value) : '—']),
        ]);
    }

    const objMin = week.objetivo_minimo;
    const completados = week.productos_completados || 0;
    const pct = objMin && objMin > 0 ? Math.round((completados / objMin) * 100) : 0;
    const pctColor = pct >= 100 ? '#065f46' : pct >= 50 ? '#b45309' : '#991b1b';

    grid.appendChild(stat(' Objetivo minimo', objMin));
    grid.appendChild(stat(' Completados', completados));
    grid.appendChild(stat(' Avance', pct + '%', pctColor));
    grid.appendChild(stat(' Deuda', week.deuda ?? 0, week.deuda > 0 ? '#991b1b' : '#065f46'));
    objCard.appendChild(grid);

    // Estado
    const estadoBadge = el('span', {
        style: {
            display: 'inline-block', marginTop: '.5rem', padding: '.2rem .75rem', borderRadius: '12px',
            fontSize: '.82rem', fontWeight: 600,
            background: week.estado === 'COMPLETADA' ? '#d1fae5' : week.estado === 'APLAZADA' ? '#fef3c7' : '#e5e7eb',
            color: week.estado === 'COMPLETADA' ? '#065f46' : week.estado === 'APLAZADA' ? '#92400e' : '#374151',
        }
    }, ['Estado: ' + (week.estado || 'ACTIVA')]);
    objCard.appendChild(estadoBadge);

    // Notas de aplazamiento
    if (week.aplazamiento_motivo) {
        objCard.appendChild(el('div', { style: { marginTop: '.5rem', padding: '.5rem', background: '#fef3c7', borderRadius: '6px', fontSize: '.82rem' } }, [
            el('strong', {}, ['Motivo aplazamiento: ']), week.aplazamiento_motivo,
            week.aplazamiento_notas ? el('p', { style: { marginTop: '.25rem', color: '#6b7280' } }, [week.aplazamiento_notas]) : null,
        ]));
    }
    wrap.appendChild(objCard);

    // ===== ACTIVIDAD =====
    const actCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    actCard.appendChild(el('h4', {}, [' Actividad reciente']));
    const actGrid = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.75rem', marginTop: '.5rem' } });
    actGrid.appendChild(stat('Tests creados', actividad.tests_creados || 0));
    actGrid.appendChild(stat('Tests completados', actividad.tests_completados || 0));
    actGrid.appendChild(stat('Productos en CONCEPTO', actividad.conceptos || 0));
    actGrid.appendChild(stat('Productos terminados', actividad.productos || 0));
    actCard.appendChild(actGrid);
    wrap.appendChild(actCard);

    // ===== ACTION: actualizar objetivo =====
    const editCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    editCard.appendChild(el('h4', {}, [' Configurar objetivo']));
    const form = el('form', { class: 'form-grid', style: { marginTop: '.5rem', gap: '.5rem' } });
    form.appendChild(el('label', { for: 'obj-min' }, ['Objetivo minimo (productos)']));
    const objInput = el('input', { id: 'obj-min', type: 'number', min: 0, value: objMin ?? '' });
    form.appendChild(objInput);
    form.appendChild(el('label', { for: 'obj-deuda' }, ['Deuda acumulada']));
    const deudaInput = el('input', { id: 'obj-deuda', type: 'number', min: 0, value: week.deuda ?? '' });
    form.appendChild(deudaInput);
    const actions = el('div', { class: 'modal__actions', style: { gridColumn: '1/3' } });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn--primary' }, ['Guardar']);
    actions.appendChild(saveBtn);
    // Boton aplazar
    if (week.id && week.estado !== 'COMPLETADA') {
        const aplazarBtn = el('button', {
            type: 'button', class: 'btn btn--ghost', style: { marginLeft: '.5rem' },
            onclick: () => aplazarSemana(week.id, refresh),
        }, [' Aplazar semana']);
        actions.appendChild(aplazarBtn);
    }
    form.appendChild(actions);

    form.onsubmit = async (ev) => {
        ev.preventDefault();
        const payload = {};
        const obj = parseInt(document.getElementById('obj-min').value);
        const deuda = parseInt(document.getElementById('obj-deuda').value);
        if (!isNaN(obj) && obj >= 0) payload.objetivo_minimo = obj;
        if (!isNaN(deuda) && deuda >= 0) payload.deuda = deuda;
        if (!Object.keys(payload).length) { toast('Sin cambios', 'err'); return; }
        try {
            const r = await fetch('/api/cadencia/' + week.id, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            toast('Objetivo actualizado', 'ok');
            renderCadencia(content);
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    };
    editCard.appendChild(form);
    wrap.appendChild(editCard);

    // ===== HISTORIAL =====
    if (historial && historial.length) {
        const histCard = el('div', { class: 'relations-card' });
        histCard.appendChild(el('h4', {}, [' Historial de semanas']));
        const table = el('table', {
            style: { width: '100%', borderCollapse: 'collapse', marginTop: '.5rem', fontSize: '.85rem' },
        });
        table.innerHTML = '<thead><tr style="background:#f3f4f6"><th style="padding:.35rem .5rem;text-align:left">Semana</th><th style="padding:.35rem .5rem;text-align:left">Obj</th><th style="padding:.35rem .5rem;text-align:left">Hecho</th><th style="padding:.35rem .5rem;text-align:left">%</th><th style="padding:.35rem .5rem;text-align:left">Estado</th></tr></thead>';
        const tbody = el('tbody');
        for (const w of historial) {
            const p = w.objetivo_minimo > 0 ? Math.round(((w.productos_completados || 0) / w.objetivo_minimo) * 100) : 0;
            const tr = el('tr', { style: { borderBottom: '1px solid #e5e7eb' } });
            tr.innerHTML = '<td style="padding:.35rem .5rem">' + (w.semana_inicio || '?') + '</td>'
                + '<td style="padding:.35rem .5rem">' + (w.objetivo_minimo ?? '—') + '</td>'
                + '<td style="padding:.35rem .5rem">' + (w.productos_completados ?? '—') + '</td>'
                + '<td style="padding:.35rem .5rem">' + p + '%</td>'
                + '<td style="padding:.35rem .5rem">' + (w.estado || '—') + '</td>';
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        histCard.appendChild(table);
        wrap.appendChild(histCard);
    }

    content.replaceChildren(wrap);
}

async function refresh() {
    // Re-render desde el router
    location.hash = '#/cadencia';
}

async function aplazarSemana(weekId, refreshFn) {
    const motivo = prompt('Motivo del aplazamiento:');
    if (!motivo) return;
    try {
        const r = await fetch('/api/cadencia/' + weekId + '/aplazar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        toast('Semana aplazada', 'ok');
        if (refreshFn) refreshFn();
    } catch (e) {
        toast('Error: ' + e.message, 'err');
    }
}