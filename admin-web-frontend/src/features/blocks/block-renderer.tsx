import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { imagesService } from "@/services/images";
import type { Block, BlockType } from "@/types/block";
import type { EntityImage } from "@/types/image";

// Renderer de bloques Notion. Versión 1:1 de admin-web/frontend/js/blocks.js
// pero en JSX + React. Maneja 11 tipos de bloque.

interface BlockRendererProps {
    blocks: Block[];
    images: EntityImage[];
}

export const BlockRenderer = ({ blocks, images }: BlockRendererProps) => {
    if (!blocks.length) return <p className="text-sm italic text-tertiary">Sin bloques.</p>;

    // Agrupa listas consecutivas (bulleted/numbered) en ul/ol.
    const items: Array<{ kind: "list"; type: "ul" | "ol"; items: Block[] } | { kind: "block"; block: Block }> = [];
    for (const b of blocks) {
        if (b.block_type === "bulleted_list_item" || b.block_type === "numbered_list_item") {
            const wanted = b.block_type === "bulleted_list_item" ? "ul" : "ol";
            const last = items[items.length - 1];
            if (last && last.kind === "list" && last.type === wanted) {
                last.items.push(b);
            } else {
                items.push({ kind: "list", type: wanted, items: [b] });
            }
        } else {
            items.push({ kind: "block", block: b });
        }
    }

    return (
        <div className="space-y-2">
            {items.map((it, idx) =>
                it.kind === "list" ? (
                    it.type === "ul" ? (
                        <ul key={idx} className="ml-6 list-disc space-y-1">
                            {it.items.map(b => (
                                <li key={b.id}>{b.content_text ?? ""}</li>
                            ))}
                        </ul>
                    ) : (
                        <ol key={idx} className="ml-6 list-decimal space-y-1">
                            {it.items.map(b => (
                                <li key={b.id}>{b.content_text ?? ""}</li>
                            ))}
                        </ol>
                    )
                ) : (
                    <BlockNode key={it.block.id} block={it.block} images={images} />
                ),
            )}
        </div>
    );
};

const BlockNode = ({ block, images }: { block: Block; images: EntityImage[] }) => {
    switch (block.block_type) {
        case "divider":
            return <hr className="my-3 border-secondary" />;
        case "code":
            return (
                <div className="rounded-md border border-secondary bg-secondary/40 p-3">
                    <div className="mb-1 text-xs uppercase text-tertiary">
                        Receta / código{block.code_language ? ` (${block.code_language})` : ""}
                    </div>
                    <pre className="whitespace-pre-wrap font-mono text-sm">{block.content_text ?? ""}</pre>
                </div>
            );
        case "embed":
            return block.is_broken || !block.embed_url ? (
                <div className="rounded-md border border-warning-primary bg-warning-secondary p-3 text-sm">
                    <strong>⚠ Embed roto</strong>
                    <div className="mt-1 text-tertiary">{block.content_text ?? "Sin URL"}</div>
                </div>
            ) : (
                <div className="rounded-md border border-secondary p-3 text-sm">
                    <strong>🔗 Embed</strong>
                    <div>
                        <a href={block.embed_url} target="_blank" rel="noopener" className="break-all text-brand-primary underline">
                            {block.embed_url}
                        </a>
                    </div>
                </div>
            );
        case "image":
            return <ImageBlock block={block} images={images} />;
        case "video":
            return block.video_url ? (
                <div className="rounded-md border border-secondary p-3 text-sm">
                    <strong>🎬 Video</strong>
                    <div>
                        <a href={block.video_url} target="_blank" rel="noopener" className="break-all text-brand-primary underline">
                            {block.video_url}
                        </a>
                    </div>
                </div>
            ) : (
                <div className="rounded-md border border-warning-primary bg-warning-secondary p-3 text-sm">
                    ⚠ Vídeo sin URL
                </div>
            );
        case "heading_1":
            return <h1 className="text-2xl font-bold text-primary">{block.content_text ?? ""}</h1>;
        case "heading_2":
            return <h2 className="text-xl font-semibold text-primary">{block.content_text ?? ""}</h2>;
        case "heading_3":
            return <h3 className="text-lg font-semibold text-primary">{block.content_text ?? ""}</h3>;
        default:
            return <p className="text-primary">{block.content_text ?? ""}</p>;
    }
};

const ImageBlock = ({ block, images }: { block: Block; images: EntityImage[] }) => {
    const matched = block.notion_block_id
        ? images.find(i => i.notion_block_id === block.notion_block_id)
        : null;

    if (!matched) {
        return (
            <div className="rounded-md border border-warning-primary bg-warning-secondary p-3 text-sm">
                ⚠ Imagen sin storage_path
            </div>
        );
    }

    return <SignedImage bucket={matched.storage_bucket} path={matched.storage_path} alt={matched.original_filename ?? "imagen"} />;
};

const SignedImage = ({ bucket, path, alt }: { bucket: string; path: string; alt: string }) => {
    const [zoomed, setZoomed] = useState(false);
    const { data, error } = useQuery({
        queryKey: ["images", "signed", bucket, path],
        queryFn: () => imagesService.signedUrl(bucket, path),
        staleTime: 30 * 60_000, // 30 min: las URLs signed duran 1h por defecto en backend
    });

    if (error) {
        return <div className="rounded-md border border-warning-primary bg-warning-secondary p-3 text-sm">⚠ No se pudo cargar imagen</div>;
    }

    if (!data) {
        return <div className="aspect-video w-full max-w-md animate-pulse rounded-md bg-secondary" />;
    }

    return (
        <>
            <button
                type="button"
                onClick={() => setZoomed(true)}
                className="block max-w-md overflow-hidden rounded-md border border-secondary"
            >
                <img src={data.url} alt={alt} className="block w-full" loading="lazy" />
            </button>
            {zoomed && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
                    onClick={() => setZoomed(false)}
                    role="dialog"
                >
                    <img src={data.url} alt={alt} className="max-h-full max-w-full object-contain" />
                </div>
            )}
        </>
    );
};

// Helper exportado para tests.
export function classifyBlock(t: BlockType): "list" | "code" | "divider" | "embed" | "image" | "video" | "heading" | "paragraph" {
    if (t === "bulleted_list_item" || t === "numbered_list_item") return "list";
    if (t === "code") return "code";
    if (t === "divider") return "divider";
    if (t === "embed") return "embed";
    if (t === "image") return "image";
    if (t === "video") return "video";
    if (t === "heading_1" || t === "heading_2" || t === "heading_3") return "heading";
    return "paragraph";
}
