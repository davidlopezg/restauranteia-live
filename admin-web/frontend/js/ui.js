// Utilidades UI: toasts, modal de confirmación, modal de imagen, escape HTML.

export function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') {
            node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'html') {
            node.innerHTML = v;
        } else if (v !== null && v !== undefined && v !== false) {
            node.setAttribute(k, v === true ? '' : v);
        }
    }
    for (const c of [].concat(children)) {
        if (c == null || c === false) continue;
        if (typeof c === 'string' || typeof c === 'number') node.appendChild(document.createTextNode(String(c)));
        else node.appendChild(c);
    }
    return node;
}

export function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
}

export function fmtDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('es-ES', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch { return iso; }
}

export function fmtPrice(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

// === Toast ===
export function toast(msg, kind = '') {
    const container = document.getElementById('toast-container');
    const t = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}` }, [msg]);
    container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
}

// === Modal Confirm ===
export function confirmDialog({ title = '¿Confirmar?', message = '', okText = 'Confirmar', danger = true }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        const okBtn = document.getElementById('confirm-ok');
        const cancelBtn = document.getElementById('confirm-cancel');
        okBtn.textContent = okText;
        okBtn.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
        modal.hidden = false;

        const cleanup = (val) => {
            modal.hidden = true;
            okBtn.removeEventListener('click', okHandler);
            cancelBtn.removeEventListener('click', cancelHandler);
            modal.querySelectorAll('[data-close]').forEach(n => n.removeEventListener('click', cancelHandler));
            resolve(val);
        };
        const okHandler = () => cleanup(true);
        const cancelHandler = () => cleanup(false);

        okBtn.addEventListener('click', okHandler);
        cancelBtn.addEventListener('click', cancelHandler);
        modal.querySelectorAll('[data-close]').forEach(n => n.addEventListener('click', cancelHandler));
    });
}

// === Modal Imagen ===
export function openImage(url) {
    const modal = document.getElementById('image-modal');
    const img = document.getElementById('modal-img');
    img.src = url;
    modal.hidden = false;
}

export function setupImageModal() {
    const modal = document.getElementById('image-modal');
    modal.querySelectorAll('[data-close]').forEach(n => {
        n.addEventListener('click', () => { modal.hidden = true; });
    });
    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!modal.hidden) modal.hidden = true;
        }
    });
}

// === Loading ===
export function loading(target) {
    const node = el('div', { class: 'loading' }, ['Cargando…']);
    target.replaceChildren(node);
    return node;
}

// === Chip helpers ===
export function chip(text, kind = '') {
    if (!text) return null;
    const safeKind = kind ? ` chip--estado-${kind.replace(/ /g, '-')}` : '';
    return el('span', { class: `chip${safeKind}` }, [text]);
}

export function chipsList(arr) {
    if (!arr || !arr.length) return null;
    return el('div', { class: 'card__chips' }, arr.map(v => chip(v)));
}
