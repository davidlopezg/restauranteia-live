// Vista /documentacion — documentación viva del producto.
// Carga los archivos Markdown desde /static/docs/*.md y los renderiza.

import { el } from './ui.js';


const SECCIONES = [
    { id: 'VISION', title: 'A. Visión general', file: null },
    { id: 'FLUJO', title: 'B. Flujo completo', file: null },
    { id: 'DIAGRAMA_FLUJO', title: '  └─ Diagrama', file: 'docs/diagrams/product-development.mmd', kind: 'mermaid' },
    { id: 'MODELO', title: 'C. Modelo de datos', file: null },
    { id: 'DIAGRAMA_MODELO', title: '  └─ Diagrama ER', file: 'docs/diagrams/data-model.mmd', kind: 'mermaid' },
    { id: 'CICLO', title: 'D. Ciclo de vida', file: null },
    { id: 'IA', title: 'E. Flujo de IA', file: null },
    { id: 'DIAGRAMA_IA', title: '  └─ Diagrama', file: 'docs/diagrams/ai-workflow.mmd', kind: 'mermaid' },
    { id: 'REGLAS', title: 'F. Reglas del sistema', file: 'docs/PRODUCT_WORKFLOW.md' },
    { id: 'HISTORIAL', title: 'G. Historial de cambios', file: null },
];


export async function renderDocumentacion(content, _topbar) {
    const wrap = el('div', { class: 'doc' });

    wrap.appendChild(el('h1', {}, ['Cómo funciona el sistema creativo']));
    wrap.appendChild(el('p', { style: { color: '#6b7280' } }, [
        'Documentación viva. Se actualiza cuando cambia el modelo o el flujo.',
    ]));

    // Indice rapido
    wrap.appendChild(el('div', { style: { background: '#fef3c7', padding: '.75rem 1rem', borderRadius: '6px', marginBottom: '1.5rem', fontSize: '.85rem' } }, [
        el('strong', {}, ['Indice']),
        el('ul', { style: { margin: '.35rem 0 0', paddingLeft: '1.25rem' } }, [
            el('li', {}, [el('a', { href: '#DOC-VISION' }, ['A. Vision general'])]),
            el('li', {}, [el('a', { href: '#DOC-FLUJO' }, ['B. Flujo completo'])]),
            el('li', {}, [el('a', { href: '#DOC-MODELO' }, ['C. Modelo de datos'])]),
            el('li', {}, [el('a', { href: '#DOC-CICLO' }, ['D. Ciclo de vida'])]),
            el('li', {}, [el('a', { href: '#DOC-IA' }, ['E. Flujo de IA'])]),
            el('li', {}, [el('a', { href: '#DOC-REGLAS' }, ['F. Reglas del sistema'])]),
        ]),
    ]));

    // A. Vision
    wrap.appendChild(section('A. Vision general', 'DOC-VISION', [
        el('p', {}, ['La app es el centro operativo del ciclo de vida de un producto en Sol de Nit.']),
        el('pre', {}, [el('code', {}, [
            'IDEA\n  ↓\nDESARROLLO\n  ↓\nVALIDACION\n  ↓\nPRODUCTO\n  ↓\nEMPLATADO\n  ↓\nVAJILLA',
        ])]),
    ]));

    // B. Flujo completo
    wrap.appendChild(section('B. Flujo completo', 'DOC-FLUJO', [
        el('pre', {}, [el('code', {}, [
            'ARCHIVO DE IDEAS\n       ↓ (promover)\n    CONCEPTO\n       ↓\n   PRUEBA 1\n       ↓\n  EVALUACION\n       ↓\n MODIFICACION\n       ↓\n   PRUEBA 2\n       ↓\n  VALIDACION\n       ↓\nPRODUCTO FINAL\n       ↓\n EMPLATADO IA\n       ↓\n     VAJILLA',
        ])]),
        el('p', { style: { color: '#6b7280', fontSize: '.85rem' } }, [
            'Ver ', el('a', { href: '/docs/PRODUCT_WORKFLOW.md', target: '_blank' }, ['PRODUCT_WORKFLOW.md']), ' para detalle de cada estado y transicion.',
        ]),
    ]));

    // Diagrama Mermaid de flujo
    wrap.appendChild(section('  └─ Diagrama de flujo', 'DOC-DIAGRAMA-FLUJO', []));
    wrap.appendChild(await renderMermaid('docs/diagrams/product-development.mmd'));

    // C. Modelo de datos
    wrap.appendChild(section('C. Modelo de datos', 'DOC-MODELO', [
        el('p', {}, ['El sistema usa Supabase (proyecto notion-migration-staging, schema notion_migration).']),

        el('h3', {}, ['Entidades existentes']),
        el('ul', {}, [
            el('li', {}, [el('strong', {}, ['ideas']), ' (71) — Archivo de Ideas']),
            el('li', {}, [el('strong', {}, ['agendas']), ' (27) — Centro del desarrollo. Campos clave: estado_desarrollo, objetivo, receta_final, timeline']),
            el('li', {}, [el('strong', {}, ['catalogos']), ' (72) — Producto final. Campo nuevo: receta_estructurada']),
        ]),

        el('h3', {}, ['Relaciones N:M']),
        el('pre', {}, [el('code', {}, [
            'ideas }o--o{ agendas  : idea_agenda (10)\n' +
            'ideas }o--o{ catalogos : idea_catalogo (13)\n' +
            'agendas }o--o{ catalogos : agenda_catalogo (7)',
        ])]),

        el('h3', {}, ['Imagenes y bloques']),
        el('ul', {}, [
            el('li', {}, [el('strong', {}, ['idea_blocks / agenda_blocks / catalogo_blocks']), ' — contenido libre por entidad (683 filas)']),
            el('li', {}, [el('strong', {}, ['idea_images / agenda_images / catalogo_images']), ' — imagenes con dedup SHA-256 (149 filas)']),
            el('li', {}, [el('strong', {}, ['Storage']), ': bucket notion-migration-staging (privado, signed URLs)']),
        ]),

        el('h3', {}, ['Tablas nuevas (propuestas, pendientes de aprobacion)']),
        el('ul', {}, [
            el('li', {}, [el('strong', {}, ['development_tests']), ' — historial de pruebas por agenda']),
            el('li', {}, [el('strong', {}, ['test_feedback']), ' — evaluaciones de mesa']),
            el('li', {}, [el('strong', {}, ['plating_proposals']), ' — propuestas de emplatado IA']),
            el('li', {}, [el('strong', {}, ['ware']), ' — inventario de vajilla']),
            el('li', {}, [el('strong', {}, ['catalogo_ware']), ' — relacion N:M catalogo ↔ vajilla']),
        ]),
    ]));

    // Diagrama ER
    wrap.appendChild(section('  └─ Diagrama ER', 'DOC-DIAGRAMA-ER', []));
    wrap.appendChild(await renderMermaid('docs/diagrams/data-model.mmd'));

    // D. Ciclo de vida
    wrap.appendChild(section('D. Ciclo de vida', 'DOC-CICLO', [
        el('pre', {}, [el('code', {}, [
            'CONCEPTO      → La idea esta aterrizada. Sin pruebas.\n' +
            'PRUEBA_1      → Primera prueba en cocina.\n' +
            'EVALUACION_1  → Evaluada en mesa (1-2 mesas, feedback).\n' +
            'MODIFICACION  → Receta ajustada tras feedback.\n' +
            'PRUEBA_2      → Segunda prueba con receta modificada.\n' +
            'VALIDACION    → Checklist + receta definitiva + imagen definitiva.\n' +
            'PRODUCTO      → Entrada en Catalogo creada.',
        ])]),
        el('p', {}, ['Cada estado tiene una accion contextual sugerida (boton principal en la ficha).']),
    ]));

    // E. Flujo IA
    wrap.appendChild(section('E. Flujo de IA', 'DOC-IA', [
        el('pre', {}, [el('code', {}, [
            'RECETA\n  ↓\nCONTEXTO (ingredientes, objetivo, restricciones)\n  ↓\nAGENTE IA (MiniMax-M3)\n  ↓\n3 PROPUESTAS de emplatado\n  ↓\nELECCION\n  ↓\nINVENTARIO ware\n  ↓\nAGENTE IA\n  ↓\n3 PROPUESTAS de vajilla con explicacion',
        ])]),
        el('p', {}, ['La IA usa MiniMax API (MiniMax-M3). El prompt se construye en el backend con datos reales de la DB.']),
    ]));
    wrap.appendChild(await renderMermaid('docs/diagrams/ai-workflow.mmd'));

    // F. Reglas del sistema
    wrap.appendChild(section('F. Reglas del sistema', 'DOC-REGLAS', [
        el('ul', {}, [
            el('li', {}, [el('strong', {}, ['Que significa cada estado']), ' — ver PRODUCT_WORKFLOW.md seccion 2.']),
            el('li', {}, [el('strong', {}, ['Cuando se crea un registro']), ' — al promover una Idea, se crea Agenda en CONCEPTO. Al validar, se crea Catalogo.']),
            el('li', {}, [el('strong', {}, ['Cuando cambia de estado']), ' — solo por botones contextuales o por ', el('code', {}, ['PATCH /api/agendas/{id}/estado']), '. Validacion de transicion automatica.']),
            el('li', {}, [el('strong', {}, ['Cuando se crea Catalogo']), ' — al validar un desarrollo con checklist completo.']),
            el('li', {}, [el('strong', {}, ['Cuando entra IA']), ' — al pulsar "Generar propuestas de emplatado" o "Analizar vajilla".']),
            el('li', {}, [el('strong', {}, ['Fuente de verdad']), ' — Supabase (notion_migration). Notion es solo historico.']),
            el('li', {}, [el('strong', {}, ['Operaciones destructivas']), ' — borrado de Agenda hace CASCADE en pruebas, feedback, bloques, imagenes. Borrado de Catalo NO afecta a Agenda origen. Siempre pide confirmacion.']),
            el('li', {}, [el('strong', {}, ['Credenciales']), ' — service_role y management token SOLO en backend. Frontend nunca las ve.']),
        ]),
    ]));

    // G. Historial de cambios (timeline automatico por agenda)
    wrap.appendChild(section('G. Historial de cambios', 'DOC-HISTORIAL', [
        el('p', {}, ['Cada agenda tiene un campo ', el('code', {}, ['timeline']), ' (jsonb) que registra automaticamente:']),
        el('ul', {}, [
            el('li', {}, ['Cambio de estado_desarrollo']),
            el('li', {}, ['Creacion de pruebas y feedback (cuando se implementen las tablas)']),
            el('li', {}, ['Validacion']),
            el('li', {}, ['Creacion de producto en catalogo']),
            el('li', {}, ['Generacion de propuestas de emplatado IA']),
            el('li', {}, ['Generacion de propuestas de vajilla IA']),
        ]),
        el('p', { style: { color: '#6b7280', fontSize: '.85rem' } }, [
            'Se puede consultar desde la ficha de desarrollo (timeline visual).',
        ]),
    ]));

    content.replaceChildren(wrap);
}


function section(title, id, children) {
    const sec = el('section', { id });
    sec.appendChild(el('h2', {}, [title]));
    sec.appendChild(el('div', {}, children));
    return sec;
}


async function renderMermaid(path) {
    // Cargamos el .mmd como texto y mostramos como bloque monoespaciado
    // (renderizado Mermaid real requeriria una lib externa; lo dejamos como texto)
    try {
        const r = await fetch('/' + path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const text = await r.text();
        return el('div', { class: 'mermaid-block' }, [
            el('pre', {}, [el('code', {}, [text])]),
            el('div', { style: { color: '#9ca3af', fontSize: '.72rem', textAlign: 'right', marginTop: '.25rem' } }, [
                '(codigo Mermaid — ', path, ')',
            ]),
        ]);
    } catch (e) {
        return el('div', { class: 'empty' }, ['No se pudo cargar el diagrama: ' + path]);
    }
}
