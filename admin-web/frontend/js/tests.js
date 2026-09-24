// UI de pruebas + feedback para una agenda.
// Renderiza historial de tests y permite añadir feedback.

import { api } from './api.js';
import { el, fmtDate, toast, confirmDialog } from './ui.js';

const ESTADO_LABELS = {
    PENDIENTE: 'Pendiente',
    REALIZADA: 'Realizada',
    DESCARTADA: 'Descartada',
};

const ESTADO_COLORS = {
    PENDIENTE: '#f59e0b',
    REALIZADA: '#10b981',
    DESCARTADA: '#ef4444',
};


export async function renderTestsSection(agendaId, refresh) {
    const section = el('div', { class: 'relations-card' });
    section.appendChild(el('h4', {}, ['Pruebas']));

    let tests = [];
    try {
        tests = await api.desarrollo.tests.list(agendaId);
    } catch (e) {
        section.appendChild(el('div', { style: { color: '#ef4444', fontSize: '.85rem' } }, [
            'Error cargando pruebas: ' + e.message,
        ]));
        return section;
    }

    // Botón nuevo test
    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' } }, [
        el('div', { style: { fontSize: '.75rem', color: '#6b7280' } }, [
            `${tests.length} prueba${tests.length === 1 ? '' : 's'}`,
        ]),
        el('button', {
            class: 'btn btn--primary btn--sm',
            onclick: () => openTestModal(agendaId, refresh),
        }, ['+ Nueva prueba']),
    ]);
    section.appendChild(header);

    if (!tests.length) {
        section.appendChild(el('div', { style: { color: '#9ca3af', fontSize: '.85rem' } }, [
            'Sin pruebas todavía. Empieza con la prueba 1.',
        ]));
        return section;
    }

    const list = el('div', { class: 'tests-list' });
    for (const t of tests) {
        list.appendChild(buildTestCard(agendaId, t, refresh));
    }
    section.appendChild(list);
    return section;
}


function buildTestCard(agendaId, test, refresh) {
    const card = el('div', {
        class: 'test-card',
        style: {
            border: '1px solid #e5e7eb',
            borderRadius: '6px',
            padding: '.65rem .75rem',
            marginBottom: '.5rem',
            background: '#fafafa',
        },
    });

    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '.5rem' } }, [
            el('strong', {}, [`#${test.numero}`]),
            el('span', {
                style: { fontSize: '.7rem', background: ESTADO_COLORS[test.estado] || '#6b7280', color: 'white', padding: '.1rem .5rem', borderRadius: '12px' },
            }, [ESTADO_LABELS[test.estado] || test.estado]),
            el('span', { style: { fontSize: '.7rem', color: '#6b7280' } }, [fmtDate(test.fecha)]),
        ]),
        el('div', { style: { display: 'flex', gap: '.25rem' } }, [
            el('button', {
                class: 'btn btn--sm btn--ghost',
                title: 'Editar',
                onclick: () => openTestModal(agendaId, refresh, test),
            }, ['✎']),
            el('button', {
                class: 'btn btn--sm btn--danger',
                title: 'Eliminar',
                onclick: async () => {
                    const ok = await confirmDialog({
                        title: 'Eliminar prueba',
                        message: `Eliminar prueba #${test.numero} y todos sus feedbacks?`,
                        okText: 'Eliminar',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await api.desarrollo.tests.delete(test.id);
                        toast('Prueba eliminada', 'ok');
                        refresh();
                    } catch (e) { toast('Error: ' + e.message, 'err'); }
                },
            }, ['×']),
        ]),
    ]);
    card.appendChild(header);

    if (test.objetivo) {
        card.appendChild(el('div', { style: { fontSize: '.8rem', color: '#4b5563', marginBottom: '.25rem' } }, [
            el('strong', {}, ['Objetivo: ']), test.objetivo,
        ]));
    }
    if (test.receta_utilizada) {
        card.appendChild(el('div', { style: { fontSize: '.78rem', color: '#6b7280' } }, [
            el('strong', {}, ['Receta: ']), test.receta_utilizada,
        ]));
    }
    if (test.modificaciones) {
        card.appendChild(el('div', { style: { fontSize: '.78rem', color: '#6b7280' } }, [
            el('strong', {}, ['Modificaciones: ']), test.modificaciones,
        ]));
    }
    if (test.resultado) {
        card.appendChild(el('div', { style: { fontSize: '.85rem', color: '#1f2937', marginTop: '.35rem', padding: '.4rem .5rem', background: '#ecfdf5', borderRadius: '4px' } }, [
            el('strong', {}, ['Resultado: ']), test.resultado,
        ]));
    }
    if (test.observaciones) {
        card.appendChild(el('div', { style: { fontSize: '.75rem', color: '#6b7280', marginTop: '.25rem' } }, [
            el('em', {}, [test.observaciones]),
        ]));
    }

    // Boton generar ficha con IA
    const iaRow = el('div', { style: { margin: '.5rem 0', display: 'flex', gap: '.35rem' } });
    iaRow.appendChild(el('button', {
        class: 'btn btn--primary btn--sm',
        style: { fontSize: '.75rem' },
        onclick: async () => await generarFichaIA(agendaId, test, refresh),
    }, ['🤖 Generar ficha con IA']));
    iaRow.appendChild(el('button', {
        class: 'btn btn--ghost btn--sm',
        style: { fontSize: '.75rem' },
        onclick: async () => await openEvaluacionModal(test.id, refresh),
    }, ['📌 Evaluar minimos']));
    card.appendChild(iaRow);

    // Ficha generada (si existe)
    if (test.ficha_generada) {
        const fg = (typeof test.ficha_generada === 'string' ? JSON.parse(test.ficha_generada) : test.ficha_generada);
        const fichaDiv = el('div', { style: { background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '.65rem .75rem', margin: '.5rem 0', fontSize: '.85rem', whiteSpace: 'pre-wrap' } }, [
            (fg.texto || fg || '').slice(0, 1000),
        ]);
        card.appendChild(fichaDiv);
    }

    // Evaluacion (si existe)
    if (test.evaluacion) {
        const ev = typeof test.evaluacion === 'string' ? JSON.parse(test.evaluacion) : test.evaluacion;
        const evDiv = el('div', { style: { background: '#ecfdf5', border: '1px solid #10b981', borderRadius: '6px', padding: '.65rem .75rem', margin: '.5rem 0', fontSize: '.85rem' } }, [
            el('strong', {}, ['Evaluacion']),
            el('br'),
            el('span', {}, [ev.resultado || 'Completada']),
        ]);
        card.appendChild(evDiv);
    }

    // Feedback inline
    const fbNode = el('div', { style: { marginTop: '.5rem', borderTop: '1px dashed #e5e7eb', paddingTop: '.5rem' } });
    fbNode.appendChild(buildFeedbackSection(agendaId, test, refresh));
    card.appendChild(fbNode);

    return card;
}


function buildFeedbackSection(agendaId, test, refresh) {
    const wrap = el('div', {});
    wrap.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.35rem' } }, [
        el('div', { style: { fontSize: '.75rem', color: '#6b7280', fontWeight: 600 } }, [
            'Feedback de mesa',
        ]),
        el('button', {
            class: 'btn btn--sm btn--ghost',
            style: { fontSize: '.75rem' },
            onclick: () => openFeedbackModal(test.id, refresh),
        }, ['+ Añadir feedback']),
    ]));

    // Renderizar feedbacks (lazy load)
    const container = el('div', { class: 'feedback-list' });
    container.appendChild(el('div', { style: { fontSize: '.75rem', color: '#9ca3af', fontStyle: 'italic' } }, ['Cargando…']));

    api.desarrollo.feedback.list(test.id)
        .then(feedbacks => {
            container.replaceChildren();
            if (!feedbacks || !feedbacks.length) {
                container.appendChild(el('div', { style: { fontSize: '.75rem', color: '#9ca3af', fontStyle: 'italic' } }, [
                    'Sin feedback todavía.',
                ]));
                return;
            }
            feedbacks.forEach(fb => container.appendChild(buildFeedbackCard(test.id, fb, refresh)));
        })
        .catch(e => {
            container.replaceChildren(el('div', { style: { color: '#ef4444', fontSize: '.75rem' } }, [
                'Error: ' + e.message,
            ]));
        });

    wrap.appendChild(container);
    return wrap;
}


function buildFeedbackCard(testId, fb, refresh) {
    const card = el('div', {
        style: {
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '4px',
            padding: '.4rem .55rem',
            marginBottom: '.35rem',
            fontSize: '.8rem',
        },
    });
    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', {}, [
            el('strong', {}, [fb.mesa]),
            fb.num_personas ? el('span', { style: { color: '#6b7280', marginLeft: '.4rem' } }, [`· ${fb.num_personas} pers.`]) : null,
            fb.valoracion ? el('span', { style: { marginLeft: '.4rem' } }, [
                '· ', el('strong', { style: { color: fb.valoracion >= 4 ? '#10b981' : fb.valoracion >= 3 ? '#f59e0b' : '#ef4444' } }, [`${'⭐'.repeat(fb.valoracion)}${'☆'.repeat(5 - fb.valoracion)}`]),
            ]) : null,
            fb.criterio ? el('span', { style: { color: '#6b7280', marginLeft: '.4rem' } }, [`· ${fb.criterio}`]) : null,
        ].filter(Boolean)),
        el('div', { style: { display: 'flex', gap: '.25rem' } }, [
            el('button', {
                class: 'btn btn--sm btn--ghost',
                style: { fontSize: '.7rem', padding: '.1rem .35rem' },
                onclick: () => openFeedbackModal(testId, refresh, fb),
            }, ['✎']),
            el('button', {
                class: 'btn btn--sm btn--danger',
                style: { fontSize: '.7rem', padding: '.1rem .35rem' },
                onclick: async () => {
                    const ok = await confirmDialog({
                        title: 'Eliminar feedback',
                        message: `Eliminar feedback de "${fb.mesa}"?`,
                        okText: 'Eliminar',
                        danger: true,
                    });
                    if (!ok) return;
                    try {
                        await api.desarrollo.feedback.delete(fb.id);
                        toast('Feedback eliminado', 'ok');
                        refresh();
                    } catch (e) { toast('Error: ' + e.message, 'err'); }
                },
            }, ['×']),
        ]),
    ]);
    card.appendChild(header);
    if (fb.observacion) {
        card.appendChild(el('div', { style: { color: '#4b5563', marginTop: '.25rem' } }, [fb.observacion]));
    }
    return card;
}


async function openTestModal(agendaId, refresh, test = null) {
    const isEdit = !!test;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__panel" style="min-width:540px; max-width:90vw;">
            <button class="modal__close" data-close>×</button>
            <h3>${isEdit ? `Editar prueba #${test.numero}` : 'Nueva prueba'}</h3>
            <form id="test-form">
                <div class="form-grid" style="margin-top:.5rem">
                    <label>Fecha</label>
                    <input id="t-fecha" type="date" value="${test?.fecha || new Date().toISOString().slice(0, 10)}" />
                    <label>Estado</label>
                    <select id="t-estado">
                        <option value="PENDIENTE" ${(!test || test.estado === 'PENDIENTE') ? 'selected' : ''}>Pendiente</option>
                        <option value="REALIZADA" ${test?.estado === 'REALIZADA' ? 'selected' : ''}>Realizada</option>
                        <option value="DESCARTADA" ${test?.estado === 'DESCARTADA' ? 'selected' : ''}>Descartada</option>
                    </select>
                    <label>Objetivo</label>
                    <textarea id="t-objetivo" rows="2" placeholder="Que quieres comprobar con esta prueba?">${test?.objetivo || ''}</textarea>
                    <label>Receta utilizada</label>
                    <textarea id="t-receta" rows="2">${test?.receta_utilizada || ''}</textarea>
                    <label>Modificaciones vs prueba anterior</label>
                    <textarea id="t-modif" rows="2">${test?.modificaciones || ''}</textarea>
                    <label>Resultado</label>
                    <textarea id="t-resultado" rows="2">${test?.resultado || ''}</textarea>
                    <label>Observaciones</label>
                    <textarea id="t-obs" rows="2">${test?.observaciones || ''}</textarea>
                </div>
                <div class="modal__actions">
                    <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
                    <button type="submit" class="btn btn--primary">${isEdit ? 'Guardar' : 'Crear'}</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => modal.remove());
    modal.querySelector('#test-form').onsubmit = async (ev) => {
        ev.preventDefault();
        const get = id => modal.querySelector(id).value.trim() || null;
        const payload = {
            fecha: get('#t-fecha'),
            estado: get('#t-estado'),
            objetivo: get('#t-objetivo'),
            receta_utilizada: get('#t-receta'),
            modificaciones: get('#t-modif'),
            resultado: get('#t-resultado'),
            observaciones: get('#t-obs'),
        };
        try {
            if (isEdit) {
                await api.desarrollo.tests.update(test.id, payload);
            } else {
                await api.desarrollo.tests.create(agendaId, payload);
            }
            toast(isEdit ? 'Prueba actualizada' : 'Prueba creada', 'ok');
            modal.remove();
            refresh();
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    };
}


async function openFeedbackModal(testId, refresh, fb = null) {
    const isEdit = !!fb;
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__panel" style="min-width:480px;">
            <button class="modal__close" data-close>×</button>
            <h3>${isEdit ? 'Editar feedback' : 'Nuevo feedback de mesa'}</h3>
            <form id="fb-form">
                <div class="form-grid" style="margin-top:.5rem">
                    <label>Mesa *</label>
                    <input id="f-mesa" type="text" required value="${fb?.mesa || ''}" placeholder="Mesa 12, Mesa 18..." />
                    <label>Nº personas</label>
                    <input id="f-pers" type="number" min="0" value="${fb?.num_personas || ''}" />
                    <label>Valoración (1-5)</label>
                    <select id="f-valor">
                        <option value="">—</option>
                        <option value="1" ${fb?.valoracion === 1 ? 'selected' : ''}>1 ⭐ (muy malo)</option>
                        <option value="2" ${fb?.valoracion === 2 ? 'selected' : ''}>2 ⭐⭐</option>
                        <option value="3" ${fb?.valoracion === 3 ? 'selected' : ''}>3 ⭐⭐⭐ (regular)</option>
                        <option value="4" ${fb?.valoracion === 4 ? 'selected' : ''}>4 ⭐⭐⭐⭐ (bueno)</option>
                        <option value="5" ${fb?.valoracion === 5 ? 'selected' : ''}>5 ⭐⭐⭐⭐⭐ (excelente)</option>
                    </select>
                    <label>Criterio evaluado</label>
                    <input id="f-crit" type="text" value="${fb?.criterio || ''}" placeholder="Textura, sabor, presentacion..." />
                    <label>Observación</label>
                    <textarea id="f-obs" rows="3">${fb?.observacion || ''}</textarea>
                    <label>Fecha</label>
                    <input id="f-fecha" type="date" value="${fb?.fecha || new Date().toISOString().slice(0, 10)}" />
                </div>
                <div class="modal__actions">
                    <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
                    <button type="submit" class="btn btn--primary">${isEdit ? 'Guardar' : 'Crear'}</button>
                </div>
            </form>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => modal.remove());
    modal.querySelector('#fb-form').onsubmit = async (ev) => {
        ev.preventDefault();
        const get = id => modal.querySelector(id).value.trim() || null;
        const mesa = get('#f-mesa');
        if (!mesa) return toast('Mesa obligatoria', 'err');
        const payload = {
            mesa,
            num_personas: get('#f-pers') ? parseInt(get('#f-pers'), 10) : null,
            valoracion: get('#f-valor') ? parseInt(get('#f-valor'), 10) : null,
            criterio: get('#f-crit'),
            observacion: get('#f-obs'),
            fecha: get('#f-fecha'),
        };
        try {
            if (isEdit) {
                await api.desarrollo.feedback.update(fb.id, payload);
            } else {
                await api.desarrollo.feedback.create(testId, payload);
            }
            toast(isEdit ? 'Feedback actualizado' : 'Feedback creado', 'ok');
            modal.remove();
            refresh();
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    };
}


async function generarFichaIA(agendaId, test, refresh) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal__backdrop" data-close></div>\
<div class="modal__panel" style="min-width:540px;max-width:90vw;">\
<button class="modal__close" data-close>X</button>\
<h3>Generar ficha con IA</h3>\
<div id="ia-result"></div>\
<div class="modal__actions"><button class="btn btn--ghost" data-close>Cerrar</button></div>\
</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => modal.remove());
    const resultDiv = modal.querySelector('#ia-result');
    resultDiv.innerHTML = '<div class="loading">Llamando a la IA...</div>';
    try {
        const r = await fetch(('/api/tests/' + test.id + '/generar-ficha'), { method: 'POST' });
        if (!r.ok) {
            const err = await r.json().catch(() => ({ detail: r.statusText }));
            throw new Error(err.detail || 'HTTP ' + r.status);
        }
        const data = await r.json();
        resultDiv.innerHTML = '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:.75rem;white-space:pre-wrap;font-size:.85rem">' + (data.texto || '(sin contenido)') + '</div><div style="margin-top:.5rem;color:#6b7280;font-size:.75rem">Modelo: ' + (data.modelo || '?') + ' · Guardado automaticamente</div>';
        if (refresh) refresh();
    } catch (e) {
        resultDiv.innerHTML = '<div style="color:#ef4444;font-size:.85rem">Error: ' + e.message + '</div>';
    }
}


async function openEvaluacionModal(testId, refresh) {
    let ev = {};
    try {
        const r = await fetch(('/api/tests/' + testId));
        const td = await r.json();
        ev = td.evaluacion ? (typeof td.evaluacion === 'string' ? JSON.parse(td.evaluacion) : td.evaluacion) : {};
    } catch {}
    const sel = (id, val) => '<option value="">--</option>' + ['si','parcial','no'].map(o => '<option value="' + o + '">' + {si:'Si',parcial:'Parcial',no:'No'}[o] + '</option>').join('');

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal__backdrop" data-close></div>\
<div class="modal__panel" style="min-width:580px;">\
<button class="modal__close" data-close>X</button>\
<h3>Evaluacion de minimos</h3>\
<p style="font-size:.82rem;color:#6b7280">Comprueba que el producto cumple el estandar minimo operativo.</p>\
<div class="form-grid" style="gap:.5rem;margin-top:.5rem">\
' + ['e1|El resultado corresponde al concepto?','e2|Sabor equilibrado?','e3|Textura/temperatura correctas?','e4|Presentacion clara?','e5|Puede reproducirse?','e6|Tiempo de pase viable?','e7|Mise en place definida?','e8|Porcion definida?','e9|Montaje definido?'].map(f => {
        const [id, label] = f.split('|');
        return '<label>' + label + '</label><select id="ev-' + id + '">' + sel(id, ev[id]) + '</select>';
    }).join('') + '\
<div style="grid-column:1/3;font-weight:600;font-size:.82rem;margin-top:.5rem">Resultado</div>\
<label>Resultado</label>\
<select id="ev-resultado">\
<option value="OK">Puede continuar</option>\
<option value="MODIFICAR">Requiere modificacion</option>\
<option value="KO">No cumple minimo</option>\
</select>\
<label>Observaciones</label>\
<textarea id="ev-obs" rows="3">' + (ev.observaciones || '') + '</textarea>\
</div>\
<div class="modal__actions"><button class="btn btn--ghost" data-close>Cancelar</button>\
<button class="btn btn--primary" id="ev-guardar">Guardar evaluacion</button></div>\
</div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => modal.remove());
    modal.querySelector('#ev-guardar').onclick = async () => {
        const payload = {
            e1: document.getElementById('ev-e1').value,
            e2: document.getElementById('ev-e2').value,
            e3: document.getElementById('ev-e3').value,
            e4: document.getElementById('ev-e4').value,
            e5: document.getElementById('ev-e5').value,
            e6: document.getElementById('ev-e6').value,
            e7: document.getElementById('ev-e7').value,
            e8: document.getElementById('ev-e8').value,
            e9: document.getElementById('ev-e9').value,
            resultado: document.getElementById('ev-resultado').value,
            observaciones: document.getElementById('ev-obs').value,
            fecha: new Date().toISOString().slice(0,10),
        };
        try {
            const r = await fetch('/api/tests/' + testId + '/evaluacion', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            toast('Evaluacion guardada', 'ok');
            modal.remove();
            if (refresh) refresh();
        } catch (e) { toast('Error: ' + e.message, 'err'); }
    };
}
