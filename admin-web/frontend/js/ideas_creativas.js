// Vista "Ideas creativas" — skill 'ideas_creativas' del agente creativo.
// Flujo real del agente: generar 10 ideas → seleccionar una → aplicar método elBulli.
// Cada idea puede guardarse en la BD de Ideas con un click.

import { el, esc, toast } from './ui.js';
import { api } from './api.js';

export async function renderIdeasCreativas(content) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando generador de ideas…']));

    let iaOk = false;
    let metodos = [];
    try {
        const r = await fetch('/api/ia/status');
        const s = await r.json();
        iaOk = s.configured;
    } catch {}
    try {
        const r = await fetch('/api/ia/metodos');
        const m = await r.json();
        metodos = m.metodos || [];
    } catch {}

    const wrap = el('div', { style: { maxWidth: '720px' } });
    wrap.appendChild(el('h2', {}, ['💡 Ideas Creativas']));

    if (!iaOk) {
        wrap.appendChild(el('div', { class: 'empty', style: { background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', padding: '1.5rem', marginTop: '1rem' } }, [
            el('h3', { style: { margin: '0 0 .5rem 0', color: '#92400e' } }, ['⚠️ IA no configurada']),
            el('p', { style: { margin: '0 0 .5rem 0' } }, [
                'Esta vista funciona pero necesita tu API key de MiniMax para generar ideas.',
            ]),
            el('p', { style: { margin: 0, fontSize: '.85rem', color: '#6b7280' } }, [
                'Ve a ',
                el('strong', {}, ['Configuración']),
                ' → ',
                el('strong', {}, ['MiniMax — IA Creativa Principal']),
                ' y añade tu API key. Después podrás generar 10 ideas por petición y refinarlas con 17 métodos creativos de elBulli.',
            ]),
        ]));
        wrap.appendChild(el('div', { style: { marginTop: '1.5rem' } }, [
            el('h4', {}, ['Qué hace esta vista']),
            el('ul', { style: { fontSize: '.85rem', lineHeight: 1.7, color: '#4b5563' } }, [
                el('li', {}, [el('strong', {}, ['Paso 1']), ' — Escribe una petición libre (ej: "pizzas de otoño con calabaza"). El Chef Creativo genera 10 ideas estructuradas con tipo, razón y semilla.']),
                el('li', {}, [el('strong', {}, ['Paso 2']), ' — Selecciona una idea y un método elBulli (deconstrucción, simbiosis, minimalismo, etc.). El chef refina la idea aplicándolo.']),
                el('li', {}, [el('strong', {}, ['Resultado']), ' — Texto estructurado listo para pasar a ficha técnica o brainstorming de carta.']),
            ]),
        ]));
        content.replaceChildren(wrap);
        return;
    }

    // Intro
    wrap.appendChild(el('p', { style: { fontSize: '.85rem', color: '#6b7280', marginBottom: '1rem' } }, [
        'El Chef Creativo genera ',
        el('strong', {}, ['10 ideas']),
        ' usando métodos de elBulli. Cada idea trae tipo, por qué encaja y semilla. Después puedes aplicar un método para refinarla.'
    ]));

    // === PASO 1: generar 10 ideas ===
    const genCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    genCard.appendChild(el('h4', {}, ['1. Generar 10 ideas']));
    const form = el('form', { style: { display: 'flex', gap: '.5rem', marginTop: '.5rem' } });
    const input = el('input', {
        type: 'text', style: { flex: 1 }, required: true,
        placeholder: 'Ej: ideas de pizzas para otoño con calabaza',
    });
    form.appendChild(input);
    const genBtn = el('button', { type: 'submit', class: 'btn btn--primary' }, ['✨ Generar 10 ideas']);
    form.appendChild(genBtn);
    genCard.appendChild(form);
    genCard.appendChild(el('p', { style: { fontSize: '.78rem', color: '#9ca3af', marginTop: '.5rem' } }, [
        'Métodos disponibles: ' + (metodos.length ? metodos.join(', ') : 'cargando…'),
    ]));
    wrap.appendChild(genCard);

    // Contenedor de ideas generadas
    const ideasCont = el('div', { id: 'ic-ideas' });
    wrap.appendChild(ideasCont);

    // Hint visual persistente sobre cómo guardar
    wrap.appendChild(el('div', {
        style: { fontSize: '.78rem', color: '#9ca3af', marginTop: '1rem', fontStyle: 'italic' },
    }, ['Tip: en cada idea verás un botón 💾 Guardar como idea — la guarda en tu Archivo de Ideas.']));

    // === PASO 2: aplicar método ===
    const metodoCard = el('div', { class: 'relations-card', style: { display: 'none' } });
    metodoCard.id = 'ic-metodo-card';
    metodoCard.appendChild(el('h4', {}, ['2. Refinar con un método creativo']));
    const metodoForm = el('form', { class: 'form-grid', style: { marginTop: '.5rem', gap: '.5rem' } });

    metodoForm.appendChild(el('label', { for: 'ic-idea-sel' }, ['Idea a refinar']));
    const ideaSel = el('select', { id: 'ic-idea-sel', required: true });
    metodoForm.appendChild(ideaSel);

    metodoForm.appendChild(el('label', { for: 'ic-metodo-sel' }, ['Método elBulli']));
    const metodoSel = el('select', { id: 'ic-metodo-sel', required: true });
    for (const m of metodos) {
        metodoSel.appendChild(el('option', { value: m }, [m.charAt(0).toUpperCase() + m.slice(1)]));
    }
    metodoForm.appendChild(metodoSel);

    const metodoActions = el('div', { class: 'modal__actions', style: { gridColumn: '1/3' } });
    metodoActions.appendChild(el('button', { type: 'submit', class: 'btn btn--primary' }, ['🔬 Refinar idea']));
    metodoForm.appendChild(metodoActions);
    metodoCard.appendChild(metodoForm);

    const refinoCont = el('div', { id: 'ic-refino', style: { marginTop: '.5rem' } });
    metodoCard.appendChild(refinoCont);
    wrap.appendChild(metodoCard);

    // Estado de ideas actuales
    let ideasActuales = [];

    // Set para llevar control de qué ideas ya se guardaron (idx idea → true)
    const guardadas = new Set();

    // === Handler generar 10 ideas ===
    form.onsubmit = async (ev) => {
        ev.preventDefault();
        const peticion = input.value.trim();
        if (!peticion) { toast('Escribe una petición', 'err'); return; }
        genBtn.disabled = true;
        genBtn.textContent = 'Generando…';
        ideasCont.replaceChildren(el('div', { class: 'loading' }, ['El chef está pensando 10 ideas…']));
        try {
            const r = await fetch('/api/ia/ideas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ peticion, n: 10 }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({ detail: r.statusText }));
                throw new Error(err.detail || 'HTTP ' + r.status);
            }
            const data = await r.json();
            ideasActuales = data.ideas || [];
            guardadas.clear();
            renderIdeasLista(ideasActuales, ideaSel, guardadas, input);
            metodoCard.style.display = ideasActuales.length ? 'block' : 'none';
            if (ideasActuales.length) toast(`10 ideas generadas`, 'ok');
        } catch (e) {
            ideasCont.replaceChildren(el('div', { style: { color: '#ef4444', fontSize: '.85rem' } }, ['Error: ' + e.message]));
        } finally {
            genBtn.disabled = false;
            genBtn.textContent = '✨ Generar 10 ideas';
        }
    };

    // === Handler aplicar método ===
    metodoForm.onsubmit = async (ev) => {
        ev.preventDefault();
        const idx = parseInt(ideaSel.value, 10);
        const metodo = metodoSel.value;
        const idea = ideasActuales[idx];
        if (!idea) { toast('Selecciona una idea', 'err'); return; }
        refinoCont.replaceChildren(el('div', { class: 'loading' }, ['Aplicando método "' + metodo + '"…']));
        try {
            const r = await fetch('/api/ia/aplicar-metodo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idea, metodo, peticion_original: input.value.trim() }),
            });
            if (!r.ok) {
                const err = await r.json().catch(() => ({ detail: r.statusText }));
                throw new Error(err.detail || 'HTTP ' + r.status);
            }
            const data = await r.json();
            refinoCont.replaceChildren(el('div', {
                style: { background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '6px', padding: '.75rem', marginTop: '.5rem', fontSize: '.85rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' },
            }, [data.resultado || '(sin resultado)']));
        } catch (e) {
            refinoCont.replaceChildren(el('div', { style: { color: '#ef4444', fontSize: '.85rem' } }, ['Error: ' + e.message]));
        }
    };

    content.replaceChildren(wrap);
}

function renderIdeasLista(ideas, ideaSel, guardadasSet, inputPeticion) {
    const cont = document.getElementById('ic-ideas');
    if (!cont) return;

    // Limpiar select
    ideaSel.replaceChildren();

    const frag = el('div', {});
    ideas.forEach((idea, i) => {
        const card = el('div', { style: { background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '.65rem .75rem', marginBottom: '.5rem' } });
        card.appendChild(el('div', { style: { fontWeight: 600, fontSize: '.9rem' } }, [
            (idea.n || (i + 1)) + '. ' + (idea.nombre || '(sin nombre)'),
        ]));
        if (idea.tipo) card.appendChild(el('div', { style: { fontSize: '.78rem', color: '#6b7280', marginTop: '.15rem' } }, [
            el('strong', {}, ['Tipo: ']), idea.tipo,
        ]));
        if (idea.por_que) card.appendChild(el('div', { style: { fontSize: '.78rem', color: '#6b7280', marginTop: '.15rem' } }, [
            el('strong', {}, ['Por qué encaja: ']), idea.por_que,
        ]));
        if (idea.semilla) card.appendChild(el('div', { style: { fontSize: '.78rem', color: '#9ca3af', marginTop: '.15rem', fontStyle: 'italic' } }, [
            'Semilla: ' + idea.semilla,
        ]));

        // Botón guardar
        const acciones = el('div', { style: { marginTop: '.5rem', display: 'flex', gap: '.5rem', alignItems: 'center' } });
        const yaGuardada = guardadasSet.has(i);
        const btnGuardar = el('button', {
            class: 'btn btn--sm ' + (yaGuardada ? 'btn--ghost' : 'btn--primary'),
            disabled: !!yaGuardada,
            onclick: () => guardarIdeaCreativa(idea, i, btnGuardada, guardadasSet, inputPeticion),
        }, [yaGuardada ? '✓ Guardada' : '💾 Guardar como idea']);
        acciones.appendChild(btnGuardar);
        card.appendChild(acciones);

        frag.appendChild(card);

        // Añadir al select
        ideaSel.appendChild(el('option', { value: i }, [
            (idea.n || (i + 1)) + '. ' + (idea.nombre || 'idea'),
        ]));
    });

    cont.replaceChildren(
        el('div', { class: 'section-title', style: { marginTop: '.5rem' } }, ['Ideas generadas (' + ideas.length + ') — clic en 💾 Guardar para llevarlas a tu Archivo']),
        frag,
    );
}

async function guardarIdeaCreativa(idea, idx, btn, guardadasSet, inputPeticion) {
    const titulo = (idea.nombre || `Idea ${idx + 1}`).slice(0, 200);
    const descripcion = [
        inputPeticion ? `Petición original: ${inputPeticion.trim()}` : '',
        idea.tipo ? `Tipo: ${idea.tipo}` : '',
        idea.por_que ? `Por qué encaja: ${idea.por_que}` : '',
        idea.semilla ? `Semilla: ${idea.semilla}` : '',
    ].filter(Boolean).join('\n');

    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
        await api.ideas.create({
            titulo,
            descripcion,
            categorias: ['creativa'],
            estado_idea: 'NUEVA',
        });
        guardadasSet.add(idx);
        btn.textContent = '✓ Guardada';
        btn.classList.remove('btn--primary');
        btn.classList.add('btn--ghost');
        toast(`Idea guardada en el Archivo`, 'ok');
    } catch (e) {
        btn.disabled = false;
        btn.textContent = '💾 Guardar como idea';
        toast('Error guardando: ' + e.message, 'err');
    }
}