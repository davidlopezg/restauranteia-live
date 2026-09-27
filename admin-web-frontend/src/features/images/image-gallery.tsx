import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash01, X } from "@untitledui/icons";
import { imagesService, imagesKeys, imagesSupabase } from "@/services/images";
import type { EntityImage } from "@/types/image";
import type { EntityKind } from "@/types/entity";

// Galería de imágenes: miniatura + click para zoom + upload + eliminar.
//
// Limitación documentada: el backend expone 1 sola signed URL por imagen
// (sin transformaciones). La miniatura y el zoom usan la misma URL — el zoom
// muestra el tamaño "natural" (max-w/max-h 100%) que en la mayoría de fotos
// reales equivale a max-resolución. Si se necesita thumbnail dedicado,
// requiere añadir `transform` de Supabase Storage al backend.

interface ImageGalleryProps {
    entidad: EntityKind;
    entityId: string;
    /** Si se omite, la galería hace su propio fetch (recomendado para sub-entidades como tests). */
    images?: EntityImage[];
    onChange?: () => void;
}

export const ImageGallery = ({ entidad, entityId, images, onChange }: ImageGalleryProps) => {
    const [zoomed, setZoomed] = useState<EntityImage | null>(null);
    const [uploading, setUploading] = useState(false);

    // Si no nos pasan `images`, las buscamos nosotros mismos (necesario
    // para sub-entidades como `tests` donde el padre no las carga).
    const fetched = useQuery<EntityImage[]>({
        queryKey: [...imagesKeys.listFor(entidad, entityId)],
        queryFn: () => imagesSupabase.list(entidad, entityId) as Promise<EntityImage[]>,
        enabled: images === undefined,
    });
    const list: EntityImage[] = images ?? (fetched.data ?? []);

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4" data-testid="image-gallery">
            <header className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-primary">
                    Imágenes <span className="text-tertiary">({list.length})</span>
                </h3>
                <button
                    type="button"
                    onClick={() => setUploading(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                    data-testid="upload-image-btn"
                >
                    <Plus className="size-3" /> Subir
                </button>
            </header>

            {list.length === 0 ? (
                <p className="text-xs italic text-tertiary">Sin imágenes.</p>
            ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {list.map(img => (
                        <ImageThumb
                            key={img.id}
                            img={img}
                            onZoom={() => setZoomed(img)}
                            onDelete={onChange}
                            entidad={entidad}
                            entityId={entityId}
                        />
                    ))}
                </div>
            )}

            {zoomed && <ZoomModal img={zoomed} onClose={() => setZoomed(null)} />}
            {uploading && (
                <UploadModal
                    entidad={entidad}
                    entityId={entityId}
                    onClose={() => setUploading(false)}
                    onUploaded={() => {
                        setUploading(false);
                        onChange?.();
                        fetched.refetch();
                    }}
                />
            )}
        </section>
    );
};

const ImageThumb = ({
    img,
    onZoom,
    onDelete,
    entidad,
    entityId,
}: {
    img: EntityImage;
    onZoom: () => void;
    onDelete?: () => void;
    entidad: EntityKind;
    entityId: string;
}) => {
    const { data, error } = useQuery({
        queryKey: ["images", "signed", img.storage_bucket, img.storage_path],
        queryFn: () => imagesService.signedUrl(img.storage_bucket, img.storage_path),
        staleTime: 30 * 60_000,
    });

    const qc = useQueryClient();
    const remove = useMutation({
        mutationFn: () => imagesService.delete(entidad, entityId, img.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [entidad] });
            qc.invalidateQueries({ queryKey: imagesKeys.listFor(entidad, entityId) });
            onDelete?.();
        },
    });

    return (
        <div className="group relative overflow-hidden rounded-md border border-secondary">
            <button
                type="button"
                onClick={onZoom}
                className="block aspect-square w-full bg-secondary"
                title="Click para ampliar"
            >
                {error ? (
                    <span className="flex h-full items-center justify-center text-xs text-error-primary">⚠</span>
                ) : data ? (
                    <img src={data} alt={img.original_filename ?? "imagen"} className="size-full object-cover" loading="lazy" />
                ) : (
                    <span className="flex h-full items-center justify-center text-xs text-tertiary">…</span>
                )}
            </button>
            <button
                type="button"
                onClick={() => {
                    if (confirm("¿Eliminar imagen?")) remove.mutate();
                }}
                disabled={remove.isPending}
                className="absolute right-1 top-1 hidden rounded-full bg-overlay p-1 text-white group-hover:block"
                title="Eliminar"
                aria-label="Eliminar imagen"
            >
                <Trash01 className="size-3" />
            </button>
        </div>
    );
};

const ZoomModal = ({ img, onClose }: { img: EntityImage; onClose: () => void }) => {
    const { data, isLoading } = useQuery({
        queryKey: ["images", "signed", img.storage_bucket, img.storage_path],
        queryFn: () => imagesService.signedUrl(img.storage_bucket, img.storage_path),
        staleTime: 30 * 60_000,
    });

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
            onClick={onClose}
            role="dialog"
        >
            <button
                type="button"
                onClick={onClose}
                className="absolute right-4 top-4 rounded-full bg-overlay p-2 text-white"
                aria-label="Cerrar"
            >
                <X className="size-5" />
            </button>
            {isLoading || !data ? (
                <span className="text-white">Cargando…</span>
            ) : (
                <img
                    src={data}
                    alt={img.original_filename ?? "imagen"}
                    className="max-h-full max-w-full object-contain"
                    onClick={e => e.stopPropagation()}
                />
            )}
        </div>
    );
};

const UploadModal = ({
    entidad,
    entityId,
    onClose,
    onUploaded,
}: {
    entidad: EntityKind;
    entityId: string;
    onClose: () => void;
    onUploaded: () => void;
}) => {
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const [dedup, setDedup] = useState(false);

    const handleSubmit = async (ev: React.FormEvent<HTMLFormElement>) => {
        ev.preventDefault();
        setErr(null);
        setSubmitting(true);
        const fd = new FormData(ev.currentTarget);
        const file = fd.get("file");
        if (!(file instanceof File)) {
            setErr("Archivo requerido");
            setSubmitting(false);
            return;
        }
        const meta = {
            source_type: (fd.get("source_type") as string) || undefined,
            notion_block_id: (fd.get("notion_block_id") as string) || undefined,
            notion_property: (fd.get("notion_property") as string) || undefined,
            position: fd.get("position") ? Number(fd.get("position")) : undefined,
        };
        try {
            const result = await imagesService.upload(entidad, entityId, file, meta);
            if (result?.deduplicated) setDedup(true);
            onUploaded();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
            onClick={onClose}
            role="dialog"
        >
            <form
                onClick={e => e.stopPropagation()}
                onSubmit={handleSubmit}
                className="w-full max-w-md space-y-3 rounded-lg bg-primary p-6 shadow-xl"
                data-testid="upload-form"
            >
                <h3 className="text-base font-semibold text-primary">Subir imagen</h3>
                {dedup && (
                    <p className="rounded-md bg-success-secondary px-3 py-1 text-xs text-success-primary">
                        Imagen deduplicada (mismo SHA-256 ya existía).
                    </p>
                )}
                {err && <p className="text-xs text-error-primary">{err}</p>}
                <label className="block text-xs text-tertiary">Archivo</label>
                <input name="file" type="file" accept="image/*" required className="block w-full text-sm" />
                <label className="block text-xs text-tertiary">Tipo</label>
                <select name="source_type" defaultValue="block_image" className="block w-full rounded-md border border-secondary bg-primary px-2 py-1 text-sm">
                    <option value="block_image">Bloque (contenido)</option>
                    <option value="property">Propiedad (cover / icono)</option>
                </select>
                <label className="block text-xs text-tertiary">ID bloque (opcional)</label>
                <input name="notion_block_id" type="text" placeholder="UUID" className="block w-full rounded-md border border-secondary bg-primary px-2 py-1 text-sm" />
                <label className="block text-xs text-tertiary">Posición (opcional)</label>
                <input name="position" type="number" className="block w-full rounded-md border border-secondary bg-primary px-2 py-1 text-sm" />
                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary">
                        Cancelar
                    </button>
                    <button type="submit" disabled={submitting} className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50">
                        {submitting ? "Subiendo…" : "Subir"}
                    </button>
                </div>
            </form>
        </div>
    );
};
