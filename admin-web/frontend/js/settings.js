// Vista /settings — configuración de la app (API keys IA, etc.)

import { el, esc, toast } from './ui.js';
import { currentTheme, setTheme } from './app.js';

export async function renderSettings(content, _topbar) {
    content.replaceChildren(el('div', { class: 'loading' }, ['Cargando configuración…']));

    let settings;
    try {
        const r = await fetch('/api/settings');
        settings = await r.json();
    } catch (e) {
        content.replaceChildren(el('div', { class: 'empty' }, ['Error: ' + e.message]));
        return;
    }

    let keyStatus;
    try {
        const r = await fetch('/api/settings/key-status');
        keyStatus = await r.json();
    } catch {}

    const wrap = el('div', { style: { maxWidth: '650px' } });
    wrap.appendChild(el('h2', {}, ['Configuración']));

    // ================================================================
    // APARIENCIA — Tema claro/oscuro
    // ================================================================
    const themeCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    themeCard.appendChild(el('h4', {}, ['🎨 Apariencia']));
    themeCard.appendChild(el('p', { style: { fontSize: '.82rem', color: '#6b7280', marginBottom: '.75rem' } }, [
        'Cambia entre tema claro y oscuro. La elección se guarda en este navegador.',
    ]));
    const themeRow = el('div', { style: { display: 'flex', gap: '.5rem', alignItems: 'center' } });
    const themeBadge = el('span', {
        style: { background: '#e5e7eb', color: '#1f2937', padding: '.25rem .75rem', borderRadius: '12px', fontSize: '.78rem', fontWeight: 600 },
    }, ['Tema actual: ' + (currentTheme() === 'dark' ? 'oscuro 🌙' : 'claro ☀️')]);
    const themeBtn = el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: () => {
            const next = currentTheme() === 'dark' ? 'light' : 'dark';
            setTheme(next);
            themeBadge.textContent = 'Tema actual: ' + (next === 'dark' ? 'oscuro 🌙' : 'claro ☀️');
            themeBtn.textContent = next === 'dark' ? '☀️ Cambiar a claro' : '🌙 Cambiar a oscuro';
        },
    }, [currentTheme() === 'dark' ? '☀️ Cambiar a claro' : '🌙 Cambiar a oscuro']);
    themeRow.appendChild(themeBadge);
    themeRow.appendChild(themeBtn);
    themeCard.appendChild(themeRow);
    wrap.appendChild(themeCard);

    // ================================================================
    // MINIMAX — IA Creativa
    // ================================================================
    const miniCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    miniCard.appendChild(el('h4', {}, ['🧠 MiniMax — IA Creativa Principal']));

    const statusInfo = el('div', { style: { marginBottom: '.75rem', fontSize: '.85rem' } });
    if (keyStatus?.ia_configured) {
        statusInfo.appendChild(el('span', {
            style: { background: '#d1fae5', color: '#065f46', padding: '.25rem .75rem', borderRadius: '12px', fontWeight: 600 },
        }, ['✅ MiniMax configurada — modelo: ' + (keyStatus.model || 'Minimax-M3')]));
    } else {
        statusInfo.appendChild(el('span', {
            style: { background: '#fee2e2', color: '#991b1b', padding: '.25rem .75rem', borderRadius: '12px', fontWeight: 600 },
        }, ['❌ MiniMax no configurada — añade tu API key abajo']));
    }
    miniCard.appendChild(statusInfo);

    const miniForm = el('form', { class: 'form-grid', style: { marginTop: '.5rem' } });

    miniForm.appendChild(el('label', { for: 's-key' }, ['API Key de MiniMax']));
    const keyInput = el('input', {
        id: 's-key',
        type: 'password',
        placeholder: keyStatus?.ia_configured
            ? '(ya configurada — escribe solo si quieres cambiarla)'
            : 'sk-... (pega tu key aquí)',
        autocomplete: 'off',
    });
    miniForm.appendChild(keyInput);
    if (keyStatus?.ia_configured && keyStatus.key_source) {
        miniForm.appendChild(el('div', {
            style: { fontSize: '.75rem', color: '#6b7280', marginTop: '-.25rem', marginBottom: '.5rem' },
        }, ['Origen de la key actual: ', el('strong', {}, [keyStatus.key_source])]));
    }

    miniForm.appendChild(el('label', { for: 's-url' }, ['Base URL']));
    const urlInput = el('input', {
        id: 's-url', type: 'text',
        value: settings.minimax_base_url || 'https://api.minimax.io/v1',
    });
    miniForm.appendChild(urlInput);

    miniForm.appendChild(el('label', { for: 's-model' }, ['Modelo']));
    const modelInput = el('input', {
        id: 's-model', type: 'text',
        value: settings.minimax_model || 'MiniMax-M3',
    });
    miniForm.appendChild(modelInput);

    const miniActions = el('div', { class: 'modal__actions', style: { marginTop: '.5rem' } });
    miniActions.appendChild(el('button', {
        type: 'submit', class: 'btn btn--primary',
    }, ['Guardar']));
    miniForm.appendChild(miniActions);
    miniCard.appendChild(miniForm);

    wrap.appendChild(miniCard);

    // ================================================================
    // OPENROUTER — Fichas de prueba con IA
    // ================================================================
    const orCard = el('div', { class: 'relations-card', style: { marginBottom: '1rem' } });
    orCard.appendChild(el('h4', {}, ['🌐 OpenRouter — Fichas de Prueba con IA']));

    const orInfo = el('p', { style: { fontSize: '.82rem', color: '#6b7280', marginBottom: '.75rem' } }, [
        'OpenRouter se usa para generar fichas de prueba automáticamente desde el botón "🤖 Generar ficha con IA" en cada test.',
        ' Modelo configurado ahora: ',
        el('strong', {}, [settings.openrouter_model || '(ninguno)']),
    ]);
    orCard.appendChild(orInfo);

    const orForm = el('form', { class: 'form-grid', style: { marginTop: '.5rem' } });

    orForm.appendChild(el('label', { for: 'or-key' }, ['API Key de OpenRouter']));
    const orKeyInput = el('input', {
        id: 'or-key',
        type: 'password',
        placeholder: keyStatus?.openrouter_configured
            ? '(ya configurada — escribe solo si quieres cambiarla)'
            : 'sk-or-v1-... (pega tu key aquí)',
        autocomplete: 'off',
    });
    orForm.appendChild(orKeyInput);
    if (keyStatus?.openrouter_configured && settings.openrouter_key_source) {
        orForm.appendChild(el('div', {
            style: { fontSize: '.75rem', color: '#6b7280', marginTop: '-.25rem', marginBottom: '.5rem' },
        }, ['Origen de la key actual: ', el('strong', {}, [settings.openrouter_key_source])]));
    }

    orForm.appendChild(el('label', { for: 'or-url' }, ['Base URL']));
    const orUrlInput = el('input', {
        id: 'or-url', type: 'text',
        value: settings.openrouter_base_url || 'https://openrouter.ai/api/v1',
    });
    orForm.appendChild(orUrlInput);

    orForm.appendChild(el('label', { for: 'or-model' }, ['Modelo']));
    const orModelInput = el('input', {
        id: 'or-model', type: 'text',
        value: settings.openrouter_model || 'nano-banana/nano-banana',
    });
    orForm.appendChild(orModelInput);

    orForm.appendChild(el('label', { for: 'or-prompt' }, ['Prompt para generar ficha']));
    const orPromptInput = el('textarea', {
        id: 'or-prompt', rows: 4,
        style: { fontFamily: 'monospace', fontSize: '.82rem' },
        placeholder: 'Prompt por defecto: "Genera una ficha técnica estructurada para esta prueba..."',
    });
    orPromptInput.value = settings.prompt_ficha_test || '';
    orForm.appendChild(orPromptInput);

    const orActions = el('div', { class: 'modal__actions', style: { marginTop: '.5rem' } });
    orActions.appendChild(el('button', {
        type: 'submit', class: 'btn btn--primary',
    }, ['Guardar']));
    orForm.appendChild(orActions);
    orCard.appendChild(orForm);

    wrap.appendChild(orCard);

    // ================================================================
    // INFO — Habilidades del agente creativo
    // ================================================================
    const infoCard = el('div', { class: 'relations-card' });
    infoCard.appendChild(el('h4', {}, ['🤖 ¿Qué hace el agente creativo?']));
    infoCard.appendChild(el('div', { style: { fontSize: '.85rem', lineHeight: 1.6 } }, [
        el('p', {}, ['El Chef Creativo de Sol de Nit tiene dos cerebros:']),
        el('ul', {}, [
            el('li', {}, [
                el('strong', {}, ['MiniMax-M3']),
                ' — para brainstorming de ideas, propuestas de emplatado, análisis de vajilla, ideas científicas (Flavor Engine), chat creativo y ayuda semanal.',
            ]),
            el('li', {}, [
                el('strong', {}, ['OpenRouter (' + (settings.openrouter_model || 'nano-banana/nano-banana') + ')']),
                ' — para generar fichas técnicas de prueba con IA, evaluando el producto contra el contexto.',
            ]),
        ]),
        el('p', { style: { color: '#6b7280', fontStyle: 'italic', marginTop: '.5rem' } }, [
            'La IA nunca modifica datos automáticamente. Siempre requiere acción explícita del usuario para aceptar/rechazar propuestas.',
        ]),
    ]));
    wrap.appendChild(infoCard);

    // ================================================================
    // DIAGNÓSTICO — Probar conexión real con cada proveedor
    // ================================================================
    const diagCard = el('div', { class: 'relations-card', style: { marginTop: '1rem' } });
    diagCard.appendChild(el('h4', {}, ['🔍 Diagnóstico de proveedores']));
    diagCard.appendChild(el('p', { style: { fontSize: '.82rem', color: '#6b7280', marginBottom: '.75rem' } }, [
        'Hace una petición real a cada proveedor con la configuración actual. ',
        'Muestra el estado HTTP, fuente de la key y errores sanitizados. ',
        'Nunca expone la API key completa.',
    ]));
    const diagResult = el('pre', {
        style: { background: '#0f172a', color: '#e2e8f0', padding: '.75rem', borderRadius: '6px', fontSize: '.75rem', overflowX: 'auto', minHeight: '60px', whiteSpace: 'pre-wrap' },
    }, ['Pulsa "Probar" para ver el diagnóstico.']);
    diagCard.appendChild(diagResult);
    diagCard.appendChild(el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: async () => {
            diagResult.textContent = 'Probando...';
            try {
                const r = await fetch('/api/settings/test-providers');
                const data = await r.json();
                diagResult.textContent = JSON.stringify(data, null, 2);
            } catch (e) {
                diagResult.textContent = 'Error: ' + e.message;
            }
        },
    }, ['Probar MiniMax y OpenRouter ahora']));
    wrap.appendChild(diagCard);

    // ================================================================
    // UNIFICAR SUBMIT para ambos formularios
    // ================================================================
    async function saveSettingsFromForm(formId) {
        const prefix = formId === 'mini' ? 's-' : 'or-';
        const payload = {};

        const key = document.getElementById(prefix + 'key')?.value?.trim();
        const url = document.getElementById(prefix + 'url')?.value?.trim();
        const model = document.getElementById(prefix + 'model')?.value?.trim();

        if (formId === 'mini') {
            // Aceptamos la key SOLO si David escribió algo que NO son solo bullets.
            if (key && !/^[•\s]+$/.test(key)) payload.minimax_api_key = key;
            if (url && url !== (settings.minimax_base_url || 'https://api.minimax.io/v1')) payload.minimax_base_url = url;
            if (model && model !== (settings.minimax_model || 'MiniMax-M3')) payload.minimax_model = model;
        } else {
            if (key && !/^[•\s]+$/.test(key)) payload.openrouter_api_key = key;
            if (url && url !== (settings.openrouter_base_url || 'https://openrouter.ai/api/v1')) payload.openrouter_base_url = url;
            if (model && model !== (settings.openrouter_model || 'nano-banana/nano-banana')) payload.openrouter_model = model;
            const prompt = document.getElementById('or-prompt')?.value?.trim();
            if (prompt !== undefined && prompt !== (settings.prompt_ficha_test || '')) payload.prompt_ficha_test = prompt;
        }

        if (!Object.keys(payload).length) { toast('Sin cambios', 'err'); return; }
        try {
            const r = await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            toast('Configuración guardada.', 'ok');
            // Limpiar el input de key tras guardar (sensibilidad).
            if (key) document.getElementById(prefix + 'key').value = '';
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    }

    miniForm.onsubmit = (ev) => { ev.preventDefault(); saveSettingsFromForm('mini'); };
    orForm.onsubmit = (ev) => { ev.preventDefault(); saveSettingsFromForm('or'); };

    content.replaceChildren(wrap);
}