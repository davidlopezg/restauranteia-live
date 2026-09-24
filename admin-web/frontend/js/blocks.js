// Render de bloques Notion migrados.
// block_type ∈ {paragraph, heading_1, heading_2, heading_3, bulleted_list_item,
//                numbered_list_item, divider, code, embed, image, video}
//
// Los bloques de tipo 'image' no tienen la imagen embebida: hay que
// cruzarla con `*_images` por `notion_block_id`. Esta función recibe un
// mapa `imagesByBlockId` para resolver.

import { el, esc } from './ui.js';

export function renderBlocks(blocks, imagesByBlockId = {}) {
    if (!blocks || !blocks.length) {
        return el('div', { class: 'empty' }, ['Sin bloques registrados.']);
    }

    // Agrupar listas consecutivas (bulleted/numbered) para ul/ol correcto.
    const frag = document.createDocumentFragment();
    let listGroup = null;
    let listType = null;

    const flushList = () => {
        if (listGroup) {
            frag.appendChild(listGroup);
            listGroup = null;
            listType = null;
        }
    };

    for (const b of blocks) {
        const t = b.block_type;
        if (t === 'bulleted_list_item' || t === 'numbered_list_item') {
            const wanted = t === 'bulleted_list_item' ? 'ul' : 'ol';
            if (listType !== wanted) {
                flushList();
                listType = wanted;
                listGroup = el(wanted, { class: 'block block--' + t });
            }
            listGroup.appendChild(el('li', {}, [esc(b.content_text || '')]));
            continue;
        }
        flushList();

        if (t === 'divider') {
            frag.appendChild(el('hr', { class: 'block block--divider' }));
        } else if (t === 'code') {
            const lang = b.code_language ? ` (${b.code_language})` : '';
            const wrapper = el('div', { class: 'block block--code' }, [
                el('div', { class: 'block--code-meta' }, ['Receta / código' + lang]),
                el('pre', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, [esc(b.content_text || '')]),
            ]);
            frag.appendChild(wrapper);
        } else if (t === 'embed') {
            const url = b.embed_url || '';
            const broken = b.is_broken || !url;
            if (broken) {
                frag.appendChild(el('div', { class: 'block block--embed-broken' }, [
                    el('strong', {}, ['⚠ Embed roto']),
                    el('br'),
                    el('span', { style: { fontSize: '.85rem' } }, [esc(b.content_text || 'Sin URL')]),
                ]));
            } else {
                frag.appendChild(el('div', { class: 'block block--embed' }, [
                    el('strong', {}, ['🔗 Embed']),
                    el('br'),
                    el('a', { href: url, target: '_blank', rel: 'noopener' }, [esc(url)]),
                ]));
            }
        } else if (t === 'image') {
            // Resolver contra imagesByBlockId
            const matched = b.notion_block_id ? imagesByBlockId[b.notion_block_id] : null;
            const wrapper = el('div', { class: 'block block--image' });
            if (matched) {
                wrapper.dataset.bucket = matched.storage_bucket || '';
                wrapper.dataset.path = matched.storage_path || '';
                wrapper.appendChild(el('img', {
                    src: '#', alt: esc(matched.original_filename || 'imagen'),
                    'data-lazy': '1',
                }));
            } else {
                wrapper.appendChild(el('div', { class: 'block--embed-broken' }, [
                    '⚠ Imagen sin storage_path',
                ]));
            }
            frag.appendChild(wrapper);
        } else if (t === 'video') {
            const url = b.video_url;
            if (url) {
                frag.appendChild(el('div', { class: 'block block--video' }, [
                    el('strong', {}, ['🎬 Video']),
                    el('br'),
                    el('a', { href: url, target: '_blank', rel: 'noopener' }, [esc(url)]),
                ]));
            } else {
                frag.appendChild(el('div', { class: 'block--embed-broken' }, ['⚠ Vídeo sin URL']));
            }
        } else if (t === 'heading_1' || t === 'heading_2' || t === 'heading_3') {
            const level = t.slice(-1);
            const node = el(`h${level}`, { class: 'block block--' + t }, [esc(b.content_text || '')]);
            frag.appendChild(node);
        } else {
            // paragraph (default)
            const txt = b.content_text || '';
            const p = el('p', { class: 'block block--paragraph' }, [esc(txt)]);
            frag.appendChild(p);
        }
    }
    flushList();
    return frag;
}

// Helper: indexa imágenes por notion_block_id
export function indexImagesByBlockId(images) {
    const out = {};
    if (!images) return out;
    for (const img of images) {
        if (img.notion_block_id) out[img.notion_block_id] = img;
    }
    return out;
}
