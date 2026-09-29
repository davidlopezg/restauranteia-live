/**
 * FASE 8 — Sección "Emplatado IA + Ficha técnica" en el detalle de un catálogo.
 *
 * Layout:
 *   - 2 botones:
 *       1. "Generar propuestas de emplatado (IA)" → modal con 3 imágenes a elegir
 *       2. "Generar ficha técnica" → modal con el resultado (solo si hay emplatado)
 *   - Estado inline: muestra la imagen de emplatado actual y la ficha técnica actual
 *
 * Modales:
 *   - GenerandoEmplatadoModal (spinner mientras llama OpenRouter)
 *   - GaleriaEmplatadoModal (3 imágenes en grid + "Elegir" cada una)
 *   - FichaTecnicaResultadoModal (muestra la ficha + botón descargar)
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
    catalogosEmplatadoService,
    catalogosEmplatadoKeys,
    type EmplatadoGenerarResponse,
    type ImagenPropuesta,
    type FichaTecnicaResponse,
} from "@/services/catalogos-emplatado";

interface Props {
    catalogoId: string;
    catalogoTitulo?: string;
    onChange?: () => void;
}

export const CatalogEmplatadoSection = ({ catalogoId, catalogoTitulo, onChange }: Props) => {
    const qc = useQueryClient();

    const { data: status } = useQuery({
        queryKey: catalogosEmplatadoKeys.status(catalogoId),
        queryFn: () => catalogosEmplatadoService.status(catalogoId),
        staleTime: 30_000,
    });

    const [showGenerar, setShowGenerar] = useState(false);
    const [showFicha, setShowFicha] = useState(false);
    const [generadas, setGeneradas] = useState<EmplatadoGenerarResponse | null>(null);
    const [ficha, setFicha] = useState<FichaTecnicaResponse | null>(null);

    const generar = useMutation({
        mutationFn: () => catalogosEmplatadoService.generar(catalogoId, 3),
        onSuccess: (data) => {
            setGeneradas(data);
            setShowGenerar(true);
        },
    });

    const seleccionar = useMutation({
        mutationFn: (url: string) => catalogosEmplatadoService.seleccionar(catalogoId, url),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: catalogosEmplatadoKeys.status(catalogoId) });
            setShowGenerar(false);
            setGeneradas(null);
            onChange?.();
        },
    });

    const generarFicha = useMutation({
        mutationFn: () => catalogosEmplatadoService.generarFichaTecnica(catalogoId),
        onSuccess: (data) => {
            setFicha(data);
            setShowFicha(true);
            qc.invalidateQueries({ queryKey: catalogosEmplatadoKeys.status(catalogoId) });
            onChange?.();
        },
    });

    return (
        <section
            className="rounded-lg border border-secondary bg-primary p-4"
            data-testid="catalog-emplatado-section"
        >
            <header className="mb-3">
                <h3 className="text-sm font-semibold text-primary">
                    🎨 Emplatado IA + Ficha técnica
                </h3>
                <p className="mt-1 text-xs text-tertiary">
                    Genera propuestas visuales con IA y la ficha técnica del producto.
                </p>
            </header>

            {/* Estado actual */}
            {status && (
                <div className="mb-3 flex flex-col gap-1 text-xs">
                    <EstadoRow
                        label="Imagen de emplatado"
                        ok={status.tiene_imagen_emplatado}
                        configured={status.configured}
                    />
                    <EstadoRow
                        label="Ficha técnica"
                        ok={status.tiene_ficha_tecnica}
                        needPrev={!status.tiene_imagen_emplatado}
                    />
                </div>
            )}

            {/* Botones */}
            <div className="flex flex-col gap-2">
                <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<SparklesIcon />}
                    onClick={() => generar.mutate()}
                    disabled={generar.isPending || (status && !status.configured)}
                    data-testid="btn-generar-emplatado"
                >
                    {generar.isPending
                        ? "Generando 3 propuestas…"
                        : status?.tiene_imagen_emplatado
                          ? "✨ Regenerar propuestas de emplatado"
                          : "✨ Generar propuestas de emplatado (IA)"}
                </Button>

                <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<FileTextIcon />}
                    onClick={() => generarFicha.mutate()}
                    disabled={
                        generarFicha.isPending ||
                        !status?.tiene_imagen_emplatado
                    }
                    data-testid="btn-generar-ficha"
                    title={
                        !status?.tiene_imagen_emplatado
                            ? "Primero genera y selecciona una imagen de emplatado"
                            : "Generar ficha técnica PNG"
                    }
                >
                    {generarFicha.isPending
                        ? "Generando ficha técnica…"
                        : status?.tiene_ficha_tecnica
                          ? "📄 Regenerar ficha técnica"
                          : "📄 Generar ficha técnica"}
                </Button>
            </div>

            {/* Errores inline */}
            {(generar.error || seleccionar.error || generarFicha.error) && (
                <p className="mt-2 text-xs text-error-primary" role="alert">
                    Error:{" "}
                    {(generar.error as Error | null)?.message ||
                        (seleccionar.error as Error | null)?.message ||
                        (generarFicha.error as Error | null)?.message}
                </p>
            )}

            {/* Modal galería */}
            {showGenerar && generadas && (
                <GaleriaEmplatadoModal
                    titulo={catalogoTitulo ?? ""}
                    imagenes={generadas.imagenes}
                    modelo={generadas.modelo}
                    onClose={() => {
                        setShowGenerar(false);
                        setGeneradas(null);
                    }}
                    onElegir={(url) => seleccionar.mutate(url)}
                    isSaving={seleccionar.isPending}
                />
            )}

            {/* Modal ficha técnica */}
            {showFicha && ficha && (
                <FichaTecnicaModal
                    ficha={ficha}
                    onClose={() => {
                        setShowFicha(false);
                        setFicha(null);
                    }}
                />
            )}
        </section>
    );
};

// === Sub-componentes ===

const EstadoRow = ({
    label,
    ok,
    configured,
    needPrev,
}: {
    label: string;
    ok: boolean;
    configured?: boolean;
    needPrev?: boolean;
}) => {
    let texto = "text-tertiary";
    let icono = "○";
    let detalle = "";
    if (needPrev) {
        texto = "text-tertiary";
        icono = "🔒";
        detalle = " (requiere imagen de emplatado)";
    } else if (configured === false) {
        icono = "⚠️";
        texto = "text-warning-primary";
        detalle = " (configura OpenRouter en Settings)";
    } else if (ok) {
        icono = "✅";
        texto = "text-success-primary";
    } else {
        icono = "○";
    }
    return (
        <div className="flex items-center gap-1.5">
            <span className={`text-xs ${texto}`}>
                {icono} {label}
            </span>
            {detalle && <span className="text-[10px] text-tertiary">{detalle}</span>}
        </div>
    );
};

const GaleriaEmplatadoModal = ({
    titulo,
    imagenes,
    modelo,
    onClose,
    onElegir,
    isSaving,
}: {
    titulo: string;
    imagenes: ImagenPropuesta[];
    modelo: string;
    onClose: () => void;
    onElegir: (url: string) => void;
    isSaving: boolean;
}) => {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
            onClick={onClose}
            role="dialog"
            aria-label="Elige una imagen de emplatado"
        >
            <div
                className="w-full max-w-4xl space-y-3 rounded-lg bg-primary p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-primary">
                            Elige el emplatado
                        </h3>
                        <p className="mt-1 text-xs text-tertiary">
                            {titulo ? `Para "${titulo}".` : ""} Modelo: <span className="font-mono">{modelo}</span>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-secondary"
                        aria-label="Cerrar"
                    >
                        <CloseIcon />
                    </button>
                </header>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    {imagenes.map((img, idx) => (
                        <div
                            key={idx}
                            className="flex flex-col gap-2 rounded-lg border border-secondary p-2"
                        >
                            <div className="aspect-square overflow-hidden rounded-md bg-secondary">
                                <img
                                    src={img.url}
                                    alt={`Propuesta ${idx + 1}`}
                                    className="size-full object-cover"
                                    loading="lazy"
                                />
                            </div>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => onElegir(img.url)}
                                disabled={isSaving}
                                data-testid={`elegir-emplatado-${idx}`}
                            >
                                {isSaving ? "Guardando…" : `✅ Elegir ${idx + 1}`}
                            </Button>
                        </div>
                    ))}
                </div>

                <footer className="text-[11px] text-tertiary">
                    La imagen seleccionada se guarda en Storage y se asocia al producto.
                </footer>
            </div>
        </div>
    );
};

const FichaTecnicaModal = ({
    ficha,
    onClose,
}: {
    ficha: FichaTecnicaResponse;
    onClose: () => void;
}) => {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
            onClick={onClose}
            role="dialog"
        >
            <div
                className="w-full max-w-2xl space-y-3 rounded-lg bg-primary p-6 shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between">
                    <h3 className="text-base font-semibold text-primary">
                        📄 Ficha técnica generada
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1 hover:bg-secondary"
                        aria-label="Cerrar"
                    >
                        <CloseIcon />
                    </button>
                </header>

                <div className="overflow-hidden rounded-md border border-secondary">
                    <img
                        src={ficha.signed_url}
                        alt="Ficha técnica"
                        className="block max-h-[60vh] w-full object-contain"
                    />
                </div>

                <div className="flex items-center justify-between text-xs text-tertiary">
                    <span>
                        {Math.round(ficha.size_bytes / 1024)} KB &middot; PNG alta resolución
                    </span>
                    <a
                        href={ficha.signed_url}
                        download={`ficha-tecnica-${ficha.sha256.slice(0, 8)}.png`}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-solid px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-solid_hover"
                    >
                        <DownloadIcon /> Descargar
                    </a>
                </div>
            </div>
        </div>
    );
};

// === Iconos inline (lucide-react no estaba en package.json; lo usamos via fallback seguro) ===

function SparklesIcon() {
    return <span aria-hidden>✨</span>;
}
function FileTextIcon() {
    return <span aria-hidden>📄</span>;
}
function CloseIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
        </svg>
    );
}
function DownloadIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
        </svg>
    );
}