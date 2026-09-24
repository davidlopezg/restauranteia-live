// Router + entry point.

import { api } from './api.js';
import { el, toast } from './ui.js';
import { setupImageModal } from './ui.js';
import { renderList } from './list.js';
import { renderDetail } from './detail.js';
import { renderPipeline } from './pipeline.js';
import { renderPendientes } from './pendientes.js';
import { renderDocumentacion } from './documentacion.js';
import { renderSettings } from './settings.js';
import { renderCadencia } from './cadencia.js';
import { renderIdeasCreativas } from './ideas_creativas.js';
import { renderIdeasCientificas } from './ideas_cientificas.js';
import { setupGlobalSearch } from './search.js';

const $content = () => document.getElementById('content');
const $topbarTitle = () => document.getElementById('topbar-title');
const $btnBack = () => document.getElementById('btn-back');
const $btnNew = () => document.getElementById('btn-new');
const $status = () => document.getElementById('status');

async function bootstrap() {
    setupImageModal();
    setupSidebar();
    setupGlobalButtons();
    setupGlobalSearch();
    applySavedTheme();

    setStatus('idle', 'Conectando…');
    try {
        const h = await api.health();
        setStatus('ok', `Conectado · ${h.schema}`);
        loadCounts();
    } catch (e) {
        setStatus('err', 'Sin conexión');
        toast('No se pudo conectar al backend: ' + e.message, 'err');
    }

    window.addEventListener('hashchange', route);
    route();
}

async function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'desarrollo';
    const parts = hash.split('/');
    const section = parts[0]; // ideas | agendas | catalogos | desarrollo | pendientes | documentacion | ...
    const id = parts[1];

    document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.toggle('active', a.dataset.route === section);
    });

    $topbarTitle().textContent = labelFor(section);
    $btnBack().hidden = !id;

    switch (section) {
        case 'desarrollo':
            $btnNew().textContent = '+ Nuevo desarrollo';
            $btnNew().onclick = () => crearDesarrollo();
            renderPipeline($content());
            break;
        case 'pendientes':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderPendientes($content());
            break;
        case 'documentacion':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderDocumentacion($content());
            break;
        case 'ideas':
        case 'agendas':
        case 'catalogos':
            $btnNew().textContent = `+ Nuevo`;
            $btnNew().onclick = () => crear(section);
            if (id) {
                renderDetail(section, id, $content());
            } else {
                renderList(section, $content());
            }
            break;
        case 'evaluaciones':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderPlaceholder($content(), 'Evaluaciones', 'Lista de feedback de mesas por producto y fecha.');
            break;
        case 'emplatado':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderPlaceholder($content(), 'Emplatado', 'Propuestas de emplatado generadas por IA.');
            break;
        case 'vajilla':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderPlaceholder($content(), 'Vajilla', 'Inventario de vajilla + CRUD.');
            break;
        case 'cadencia':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderCadencia($content());
            break;
        case 'ideas-creativas':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderIdeasCreativas($content());
            break;
        case 'ideas-cientificas':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderIdeasCientificas($content());
            break;
        case 'settings':
            $btnNew().textContent = '';
            $btnNew().onclick = null;
            renderSettings($content());
            break;
        default:
            location.hash = '#/desarrollo';
            return;
    }
}


function labelFor(section) {
    return {
        desarrollo: 'Pipeline de desarrollo',
        pendientes: 'Pendientes',
        documentacion: 'Documentación',
        settings: 'Configuración',
        cadencia: 'Dashboard',
        'ideas-creativas': 'Ideas creativas',
        'ideas-cientificas': 'Ideas científicas',
        ideas: 'Ideas',
        agendas: 'Pruebas',
        catalogos: 'Catálogo',
        evaluaciones: 'Evaluaciones de mesa',
        emplatado: 'Emplatado IA',
        vajilla: 'Inventario de Vajilla',
    }[section] || section;
}


function renderPlaceholder(content, title, subtitle) {
    content.replaceChildren(el('div', { class: 'empty' }, [
        el('h2', {}, [title]),
        el('p', { style: { color: '#6b7280' } }, [subtitle]),
        el('p', { style: { color: '#9ca3af', fontSize: '.85rem', marginTop: '1rem' } }, [
            'Pendiente de las fases 6, 8 y 9 de PRODUCT_ARCHITECTURE_PROPOSAL.md.',
        ]),
    ]));
}


function setupSidebar() {
    document.querySelectorAll('.nav-item').forEach(a => {
        a.addEventListener('click', () => {
            setTimeout(() => {
                document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === a));
            }, 0);
        });
    });
}


function setupGlobalButtons() {
    $btnBack().addEventListener('click', () => {
        const hash = location.hash;
        const m = hash.match(/^#\/(\w+)\/[\w-]+/);
        if (m) location.hash = `#/${m[1]}`;
        else history.back();
    });
}


async function loadCounts() {
    try {
        const [i, a, c, p] = await Promise.all([
            api.ideas.list({ limit: 200 }),
            api.agendas.list({ limit: 200 }),
            api.catalogos.list({ limit: 200 }),
            api.desarrollo.pendientes(),
        ]);
        document.getElementById('count-ideas').textContent = i.items.length;
        document.getElementById('count-agendas').textContent = a.items.length;
        document.getElementById('count-catalogos').textContent = c.items.length;
        document.getElementById('count-pendientes').textContent = p.length;
    } catch {
        // silencioso
    }
}


function setStatus(kind, text) {
    const s = $status();
    s.querySelector('.dot').className = `dot dot--${kind}`;
    s.querySelector('.status-dot__text').textContent = text;
}


async function crear(entidad) {
    const titleByEnt = {
        ideas: 'Nueva idea',
        agendas: 'Nueva agenda',
        catalogos: 'Nuevo catálogo',
    };
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal__backdrop" data-close></div>
        <div class="modal__panel modal__panel--confirm">
            <h3>${titleByEnt[entidad] || 'Nuevo'}</h3>
            <div class="form-grid" style="margin-top:.5rem">
                <label>Título</label>
                <input id="new-title" type="text" autofocus />
            </div>
            <div class="modal__actions">
                <button class="btn btn--ghost" data-close id="new-cancel">Cancelar</button>
                <button class="btn btn--primary" id="new-ok">Crear</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const close = (val) => { modal.remove(); };
    modal.querySelectorAll('[data-close]').forEach(n => n.onclick = close);
    modal.querySelector('#new-ok').onclick = async () => {
        const v = modal.querySelector('#new-title').value.trim();
        if (!v) return toast('Título obligatorio', 'err');
        try {
            const row = await api[entidad].create({ titulo: v });
            toast('Creado', 'ok');
            modal.remove();
            location.hash = `#/${entidad}/${row.id}`;
        } catch (e) {
            toast('Error: ' + e.message, 'err');
        }
    };
    modal.querySelector('#new-title').addEventListener('keydown', e => {
        if (e.key === 'Enter') modal.querySelector('#new-ok').click();
    });
    setTimeout(() => modal.querySelector('#new-title').focus(), 50);
}


async function crearDesarrollo() {
    const titulo = prompt('Título del nuevo desarrollo (estado: CONCEPTO):');
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

function applySavedTheme() {
    const saved = localStorage.getItem('sdn-theme');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('sdn-theme', theme);
}

export function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}

export function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
}

bootstrap();
