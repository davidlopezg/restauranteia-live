// UI para gestión de imágenes: upload modal + gallery con edit/delete.

import { api } from './api.js';
import { el, esc, toast, confirmDialog, openImage } from './ui.js';


/**
 * Abre un modal para subir una imagen a la entidad.
 * Devuelve Promise<boolean> true si se subió/añadió correctamente.
 */
export function openUploadImageModal(entidad, entityId, opts = {}) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal__backdrop" data-close></div>
            <div class="modal__panel" style="min-width:480px">
                <button class="modal__close" data-close>×</button>
                <h3>${opts.title || 'Subir imagen'}</h3>
                <form id="upload-form">
                    <div class="form-grid" style="margin-top:.5rem">
                        <label>Archivo</label>
                        <input id="up-file" type="file" accept="image/*" required />
                        <label>Tipo</label>
                        <select id="up-source">
                            <option value="block_image">Bloque (imagen dentro del contenido)</option>
                            <option value="property">Propiedad (cover / icono)</option>
                        </select>
                        <label>ID bloque (opcional)</label>
                        <input id="up-block" type="text" placeholder="ej: 13a70531-cc1b-80d4-bb73-f1f37cd523df" />
                        <label>Propiedad (opcional)</label>
                        <input id="up-property" type="text" placeholder="ej: cover, icon" />
                        <label>Posición</label>
                        <input id="up-position" type="number" min="0" />
                    </div>
                    <div class="modal__actions">
                        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
                        <button type="submit" class="btn btn--primary">Subir</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        const close = (val) => { modal.remove(); resolve(val); };
        modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => close(null));
        const form = modal.querySelector('#upload-form');
        form.onsubmit = async (ev) => {
            ev.preventDefault();
            const fileInput = modal.querySelector('#up-file');
            if (!fileInput.files[0]) { toast('Selecciona un archivo', 'err'); return; }
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            fd.append('source_type', modal.querySelector('#up-source').value);
            const block = modal.querySelector('#up-block').value.trim();
            const prop = modal.querySelector('#up-property').value.trim();
            const pos = modal.querySelector('#up-position').value;
            if (block) fd.append('notion_block_id', block);
            if (prop) fd.append('notion_property', prop);
            if (pos) fd.append('position', pos);
            try {
                const submitBtn = form.querySelector('button[type=submit]');
                submitBtn.disabled = true;
                submitBtn.textContent = 'Subiendo…';
                const r = await fetch(`/api/${entidad}/${entityId}/images`, { method: 'POST', body: fd });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({ detail: r.statusText }));
                    throw new Error(err.detail || `HTTP ${r.status}`);
                }
                const data = await r.json();
                if (data.deduplicated) {
                    toast('Imagen deduplicada (mismo SHA-256 ya existía)', 'ok');
                } else {
                    toast('Imagen subida', 'ok');
                }
                close(true);
            } catch (e) {
                toast('Error: ' + e.message, 'err');
                const submitBtn = form.querySelector('button[type=submit]');
                submitBtn.disabled = false;
                submitBtn.textContent = 'Subir';
            }
        };
        setTimeout(() => modal.querySelector('#up-file').focus(), 50);
    });
}


/**
 * Modal para editar metadatos de una imagen (no el archivo físico).
 */
export function openEditImageModal(entidad, entityId, image) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal__backdrop" data-close></div>
            <div class="modal__panel" style="min-width:480px">
                <button class="modal__close" data-close>×</button>
                <h3>Editar imagen</h3>
                <div style="font-size:.8rem;color:#6b7280;margin:.5rem 0">
                    <div><strong>Archivo:</strong> ${esc(image.original_filename || '')}</div>
                    <div><strong>SHA-256:</strong> <code>${esc((image.sha256 || '').slice(0, 16))}…</code></div>
                    <div><strong>Path:</strong> <code>${esc(image.storage_path || '')}</code></div>
                </div>
                <form id="edit-form">
                    <div class="form-grid">
                        <label>Tipo</label>
                        <select id="ed-source">
                            <option value="block_image" ${image.source_type === 'block_image' ? 'selected' : ''}>Bloque</option>
                            <option value="property" ${image.source_type === 'property' ? 'selected' : ''}>Propiedad</option>
                        </select>
                        <label>ID bloque</label>
                        <input id="ed-block" type="text" value="${esc(image.notion_block_id || '')}" />
                        <label>Propiedad</label>
                        <input id="ed-property" type="text" value="${esc(image.notion_property || '')}" />
                        <label>Posición</label>
                        <input id="ed-position" type="number" min="0" value="${image.position ?? ''}" />
                    </div>
                    <div class="modal__actions">
                        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
                        <button type="submit" class="btn btn--primary">Guardar</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
        const close = (val) => { modal.remove(); resolve(val); };
        modal.querySelectorAll('[data-close]').forEach(n => n.onclick = () => close(null));
        modal.querySelector('#edit-form').onsubmit = async (ev) => {
            ev.preventDefault();
            const payload = {
                source_type: modal.querySelector('#ed-source').value,
                notion_block_id: modal.querySelector('#ed-block').value.trim() || null,
                notion_property: modal.querySelector('#ed-property').value.trim() || null,
                position: modal.querySelector('#ed-position').value === '' ? null : parseInt(modal.querySelector('#ed-position').value, 10),
            };
            try {
                const r = await fetch(`/api/${entidad}/${entityId}/images/${image.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!r.ok) {
                    const err = await r.json().catch(() => ({ detail: r.statusText }));
                    throw new Error(err.detail || `HTTP ${r.status}`);
                }
                toast('Imagen actualizada', 'ok');
                close(true);
            } catch (e) {
                toast('Error: ' + e.message, 'err');
            }
        };
    });
}


/**
 * Construye un panel de galería con upload + edit + delete para una entidad.
 * Devuelve un nodo DOM listo para insertar.
 */
export function renderImageGallery(entidad, entityId, images, onChange) {
    const section = el('div', { class: 'gallery-section' });
    section.appendChild(el('div', { class: 'section-title' }, [`Imágenes (${images.length})`]));

    const actionsBar = el('div', { style: { marginBottom: '.5rem' } });
    const addBtn = el('button', {
        class: 'btn btn--primary btn--sm',
        onclick: async () => {
            const ok = await openUploadImageModal(entidad, entityId);
            if (ok && onChange) onChange();
        },
    }, ['+ Añadir imagen']);
    actionsBar.appendChild(addBtn);
    section.appendChild(actionsBar);

    if (!images.length) {
        section.appendChild(el('div', { class: 'gallery-empty' }, ['Sin imágenes.']));
        return section;
    }

    const grid = el('div', { class: 'gallery' });
    images.forEach(img => grid.appendChild(imageCard(entidad, entityId, img, onChange)));
    section.appendChild(grid);
    return section;
}


function imageCard(entidad, entityId, img, onChange) {
    const wrap = el('div', { class: 'gallery-card', style: { position: 'relative' } });
    const im = el('img', {
        src: '#', alt: esc(img.original_filename || ''),
        title: `${img.original_filename || ''}\nSHA: ${(img.sha256 || '').slice(0, 12)}…\nTamaño: ${formatSize(img.file_size_bytes)}`,
        'data-bucket': img.storage_bucket || '',
        'data-path': img.storage_path || '',
    });
    im.addEventListener('click', async (ev) => {
        // Si pulsa en la X, no abrir imagen
        if (ev.target.classList.contains('gallery-card__del')) return;
        try {
            const { url } = await api.images.signedUrl(img.storage_bucket, img.storage_path);
            openImage(url);
        } catch (e) {
            toast('No se pudo abrir imagen: ' + e.message, 'err');
        }
    });
    wrap.appendChild(im);

    // Botones overlay
    const overlay = el('div', { class: 'gallery-card__overlay' });
    const editBtn = el('button', {
        class: 'btn btn--sm btn--ghost gallery-card__btn',
        title: 'Editar',
        onclick: async () => {
            const ok = await openEditImageModal(entidad, entityId, img);
            if (ok && onChange) onChange();
        },
    }, ['✎']);
    overlay.appendChild(editBtn);
    const delBtn = el('button', {
        class: 'btn btn--sm btn--danger gallery-card__btn gallery-card__del',
        title: 'Eliminar',
        onclick: async () => {
            const ok = await confirmDialog({
                title: 'Eliminar imagen',
                message: `Vas a eliminar la referencia a "${img.original_filename}".\n\nSi el archivo no está usado por otros registros, también se borrará físicamente de Storage.`,
                okText: 'Eliminar',
                danger: true,
            });
            if (!ok) return;
            try {
                const r = await fetch(`/api/${entidad}/${entityId}/images/${img.id}`, { method: 'DELETE' });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const data = await r.json();
                if (data.physical_file_deleted) {
                    toast(`Imagen eliminada (archivo físico borrado, 0 referencias restantes)`, 'ok');
                } else {
                    toast(`Imagen eliminada (${data.remaining_refs} referencia(s) mantienen el archivo)`, 'ok');
                }
                if (onChange) onChange();
            } catch (e) {
                toast('Error: ' + e.message, 'err');
            }
        },
    }, ['×']);
    overlay.appendChild(delBtn);
    wrap.appendChild(overlay);

    // Caption con metadatos
    const meta = el('div', { class: 'gallery-card__meta' }, [
        el('div', { style: { fontSize: '.72rem', color: '#6b7280' } }, [
            `${img.source_type === 'block_image' ? '🖼 bloque' : '🏷 propiedad'} · ${formatSize(img.file_size_bytes)}`,
        ]),
    ]);
    wrap.appendChild(meta);

    // Cargar signed URL lazy
    queueSignedUrl(im, img.storage_bucket, img.storage_path);
    return wrap;
}


function queueSignedUrl(im, bucket, path) {
    if (!bucket || !path) return;
    api.images.signedUrl(bucket, path)
        .then(({ url }) => { im.src = url; })
        .catch(() => { /* silencioso */ });
}


function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
