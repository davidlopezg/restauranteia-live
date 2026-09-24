// Vista "Ideas Científicas" — skill 'idea_cientifica' (Flavor Engine).
// Analiza combinaciones por química molecular, aromas compartidos y afinidad culinaria.

import { el, toast } from './ui.js';
import { api } from './api.js';

export async function renderIdeasCientificas(content) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando laboratorio de ideas…']));

    let iaOk = false;
    try {
        const r = await fetch('/api/ia/status');
        const s = await r.json();
        iaOk = s.configured;
    } catch {}

    const wrap = el('div', { style: { maxWidth: '720px' } });
    wrap.appendChild(el('h2', {}, ['🔬 Ideas Científicas']));

    if (!iaOk) {
        wrap.appendChild(el('div', { class: 'empty', style: { background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '1.5rem', marginTop: '1rem' } }, [
            el('h3', { style: { margin: '0 0 .5rem 0', color: '#92400e' } }, ['⚠️ IA no configurada']),
            el('p', { style: { margin: '0 0 .5rem 0' } }, [
                'Esta vista funciona pero necesita tu API key de MiniMax para analizar combinaciones con el Flavor Engine.',
            ]),
            el('p', { style: { margin: 0, fontSize: '.85rem', color: '#6b7280' } }, [
                'Ve a ',
                el('strong', {}, ['Configuración']),
                ' → ',
                el('strong', {}, ['MiniMax — IA Creativa Principal']),
                ' y añade tu API key. Después podrás analizar combinaciones de ingredientes por química molecular (PubChem) con razonamiento estructurado.',
            ]),
        ]));
        wrap.appendChild(el('div', { style: { marginTop: '1.5rem' } }, [
            el('h4', {}, ['Qué hace esta vista']),
            el('ul', { style: { fontSize: '.85rem', lineHeight: 1.7, color: '#4b5563' } }, [
                el('li', {}, [el('strong', {}, ['Flavor Engine']), ' — Busca en PubChem los compuestos aromáticos de cada ingrediente (con CIDs verificables).']),
                el('li', {}, [el('strong', {}, ['Pairings por afinidad química']), ' — Encuentra ingredientes que comparten compuestos aromáticos, aunque jamás se hayan combinado.']),
                el('li', {}, [el('strong', {}, ['Respuesta estructurada']), ' — Formato Base / Contraste / Textura / Viabilidad operativa.']),
            ]),
        ]));
        content.replaceChildren(wrap);
        return;
    }

    // Qué hace el Flavor Engine
    wrap.appendChild(el('div', { style: { fontSize: '.85rem', color: '#6b7280', marginBottom: '1rem', lineHeight: 1.6 } }, [
        el('p', {}, [
            'El ',
            el('strong', {}, ['Flavor Engine']),
            ' busca en PubChem los compuestos aromáticos de cada ingrediente (con CIDs verificables).',
        ]),
        el('p', {}, [
            'Encuentra ',
            el('strong', {}, ['pairings por afinidad química']),
            ' — ingredientes que comparten compuestos aromáticos, aunque jamás se hayan combinado.',
        ]),
        el('p', { style: { marginTop: '.25rem' } }, [
            'Formato de respuesta: ',
            el('strong', {}, ['Base / Contraste / Textura / Viabilidad']),
            ' con razonamiento estructurado.',
        ]),
    ]));

    // === Formulario ===
    const card = el('div', { class: 'relations-card' });
    card.appendChild(el('h4', {}, ['Petición científica']));
    card.appendChild(el('p', { style: { fontSize: '.82rem', color: '#6b7280', marginBottom: '.5rem' } }, [
        'Escribe aquí tu petición libre. Ejemplos:',
    ]));
    card.appendChild(el('ul', { style: { fontSize: '.78rem', color: '#6b7280', marginBottom: '.75rem', paddingLeft: '1.25rem' } }, [
        el('li', {}, ['Topping con base de alcachofa que combine con queso de cabra y miel']),
        el('li', {}, ['Producto proteico que funcione con cebolla caramelizada y queso azul']),
        el('li', {}, ['Postre con calabaza y especias que sorprenda en textura']),
    ]));

    const form = el('form', { class: 'form-grid', style: { gap: '.5rem' } });
    form.appendChild(el('label', { for: 'ic-pet' }, ['Tu petición']));
    const input = el('textarea', {
        id: 'ic-pet', rows: 3, required: true,
        placeholder: 'Escribe tu petición libre aquí…',
    });
    form.appendChild(input);

    const actions = el('div', { class: 'modal__actions', style: { gridColumn: '1/2' } });
    const submitBtn = el('button', { type: 'submit', class: 'btn btn--primary' }, ['🔬 Analizar con Flavor Engine']);
    actions.appendChild(submitBtn);
    form.appendChild(actions);
    card.appendChild(form);

    wrap.appendChild(card);

    // El resultado se renderiza aquí debajo, con su botón Guardar
    const resultCont = el('div', { id: 'ic-sci-result', style: { marginTop: '1rem' } });
    wrap.appendChild(resultCont);

    wrap.appendChild(el('div', {
        style: { fontSize: '.78rem', color: '#9ca3af', marginTop: '1rem', fontStyle: 'italic' },
    }, ['Tip: cuando recibas el análisis, debajo aparecerá un botón 💾 Guardar como idea para llevarlo a tu Archivo.']));

    // Historial
    let historial = [];

    form.onsubmit = async (ev) => {
        ev.preventDefault();
        const peticion = input.value.trim();
        if (!peticion) { toast('Escribe una petición', 'err'); return; }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Consultando Flavor Engine…';
        resultCont.replaceChildren(el('div', { class: 'loading' }, ['Buscando en PubChem, calculando afinidades…']));

        try {
            const r = await fetch('/api/ia/idea-cientifica', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ peticion }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({ detail: r.statusText }));
                throw new Error(err.detail || 'HTTP ' + r.status);
            }
            const data = await r.json();
            const texto = data.texto || data.resultado || '';
            if (!texto) throw new Error('Respuesta vacía del modelo');

            historial.unshift({ peticion, texto, ts: new Date().toISOString() });
            if (historial.length > 5) historial = historial.slice(0, 5);

            renderResultado(texto, peticion, historial, resultCont, input, submitBtn);
        } catch (e) {
            resultCont.replaceChildren(el('div', { style: { color: '#ef4444', fontSize: '.85rem' } }, [
                'Error: ' + e.message,
            ]));
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '🔬 Analizar con Flavor Engine';
        }
    };

    content.replaceChildren(wrap);
}

function renderResultado(texto, peticion, historial, resultCont, input, submitBtn) {
    const wrapper = el('div', {});

    // Resultado principal
    const resDiv = el('div', {
        style: {
            background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px',
            padding: '1rem', whiteSpace: 'pre-wrap', fontSize: '.85rem', lineHeight: 1.7,
        },
    }, [texto]);

    const header = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' } });
    const title = el('h4', { style: { margin: 0 } }, ['📊 Resultado del Flavor Engine']);
    header.appendChild(title);
    const modelBadge = el('span', { style: { fontSize: '.7rem', color: '#6b7280', background: '#e5e7eb', padding: '.15rem .5rem', borderRadius: '8px' } }, ['MiniMax-M3']);
    header.appendChild(modelBadge);
    wrapper.appendChild(header);
    wrapper.appendChild(resDiv);

    // === Botón Guardar como idea ===
    const acciones = el('div', {
        style: { marginTop: '.75rem', display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' },
    });
    const btnGuardar = el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: () => guardarIdeaCientifica(texto, peticion, btnGuardar),
    }, ['💾 Guardar como idea']);
    acciones.appendChild(btnGuardar);
    const hint = el('span', { style: { fontSize: '.75rem', color: '#6b7280' } },
        ['Lo guarda en tu Archivo de Ideas con categoría “científica”.']);
    acciones.appendChild(hint);
    wrapper.appendChild(acciones);

    // Historial de último 5
    if (historial.length > 1) {
        const histDiv = el('div', { style: { marginTop: '1.5rem', borderTop: '1px solid #e5e7eb', paddingTop: '.75rem' } });
        histDiv.appendChild(el('div', { class: 'section-title' }, ['Historial reciente']));
        historial.slice(1, 5).forEach((h, i) => {
            const item = el('div', {
                style: { padding: '.4rem .5rem', fontSize: '.78rem', color: '#6b7280', cursor: 'pointer', borderRadius: '4px', marginBottom: '.2rem' },
                onmouseover: function () { this.style.background = '#f3f4f6'; },
                onmouseout: function () { this.style.background = 'transparent'; },
            }, [
                new Date(h.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) + ' — ' + h.peticion.slice(0, 80) + (h.peticion.length > 80 ? '…' : ''),
            ]);
            item.onclick = () => {
                input.value = h.peticion;
                // Re-render con botón Guardar también en el historial
                const fakeHist = [h];
                renderResultado(h.texto, h.peticion, fakeHist, resultCont, input, submitBtn);
            };
            histDiv.appendChild(item);
        });
        wrapper.appendChild(histDiv);
    }

    resultCont.replaceChildren(wrapper);
}

async function guardarIdeaCientifica(texto, peticion, btn) {
    // Título: primeras palabras significativas de la petición (o fallback genérico)
    const tituloBase = (peticion || '').trim().split('\n')[0].slice(0, 80);
    const titulo = tituloBase ? `Análisis científico — ${tituloBase}` : 'Análisis científico del Flavor Engine';
    const descripcion = [
        peticion ? `Petición original:\n${peticion}` : '',
        '',
        'Análisis del Flavor Engine:',
        texto,
    ].join('\n');

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
        await api.ideas.create({
            titulo,
            descripcion,
            categorias: ['cientifica'],
            estado_idea: 'NUEVA',
        });
        btn.textContent = '✓ Guardada';
        btn.classList.remove('btn--primary');
        btn.classList.add('btn--ghost');
        toast('Análisis guardado en el Archivo de Ideas', 'ok');
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '💾 Guardar como idea';
        toast('Error guardando: ' + e.message, 'err');
    }
}