import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { desarrolloService } from "@/services/desarrollo";
import { ESTADOS_DESARROLLO, ESTADO_LABELS, type EstadoDesarrollo } from "@/types/pipeline";
import type { TimelineEvent } from "@/types/agenda";
import { fmtDate } from "@/utils/date";

// Sección de desarrollo para agendas: estado actual, ciclo visual, próxima acción,
// timeline. Permite cambiar de estado con selector (validación cliente + servidor).

interface DevelopmentSectionProps {
    agenda: Record<string, unknown> & { id: string; estado_desarrollo?: EstadoDesarrollo | null; timeline?: TimelineEvent[] | null };
    onChange?: () => void;
}

export const DevelopmentSection = ({ agenda, onChange }: DevelopmentSectionProps) => {
    const [err, setErr] = useState<string | null>(null);
    const estado = agenda.estado_desarrollo ?? null;
    const qc = useQueryClient();

    const cambiar = useMutation({
        mutationFn: (destino: EstadoDesarrollo) =>
            desarrolloService.cambiarEstado(agenda.id, {
                estado_desarrollo: destino,
                descripcion: "Cambio desde sección desarrollo",
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["agendas"] });
            qc.invalidateQueries({ queryKey: ["desarrollo"] });
            onChange?.();
            setErr(null);
        },
        onError: (e: Error) => setErr(e.message),
    });

    const iniciar = useMutation({
        mutationFn: () =>
            desarrolloService.cambiarEstado(agenda.id, {
                estado_desarrollo: "CONCEPTO",
                descripcion: "Iniciado desde ficha",
            }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["agendas"] });
            onChange?.();
        },
    });

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4" data-testid="development-section">
            <h3 className="text-sm font-semibold text-primary">Desarrollo</h3>

            {!estado ? (
                <div className="mt-2">
                    <p className="text-xs text-tertiary">Sin estado de desarrollo asignado.</p>
                    <button
                        type="button"
                        onClick={() => iniciar.mutate()}
                        disabled={iniciar.isPending}
                        className="mt-2 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                    >
                        {iniciar.isPending ? "Iniciando…" : "Iniciar desarrollo (CONCEPTO)"}
                    </button>
                </div>
            ) : (
                <>
                    <div className="mt-2 inline-block rounded-full bg-brand-secondary px-2.5 py-0.5 text-xs font-medium text-brand-primary">
                        {ESTADO_LABELS[estado]}
                    </div>

                    {/* Selector de cambio */}
                    <div className="mt-3" data-testid="estado-change">
                        <p className="mb-1 text-xs text-tertiary">Mover a:</p>
                        <div className="flex flex-wrap gap-1">
                            {ESTADOS_DESARROLLO.map(destino => {
                                const isActual = destino === estado;
                                return (
                                    <button
                                        key={destino}
                                        type="button"
                                        disabled={isActual || cambiar.isPending}
                                        onClick={() => cambiar.mutate(destino)}
                                        className={`rounded-full px-2.5 py-0.5 text-xs ${isActual
                                                ? "bg-brand-primary text-white cursor-default"
                                                : "bg-secondary text-primary hover:bg-brand-secondary hover:text-brand-primary"
                                            }`}
                                    >
                                        {ESTADO_LABELS[destino]}
                                    </button>
                                );
                            })}
                        </div>
                        {err && <p className="mt-2 text-xs text-error-primary">{err}</p>}
                    </div>

                    {/* Timeline */}
                    {Array.isArray(agenda.timeline) && agenda.timeline.length > 0 && (
                        <div className="mt-4">
                            <h4 className="text-xs font-medium uppercase tracking-wide text-tertiary">Timeline</h4>
                            <ul className="mt-1 space-y-1 text-xs">
                                {[...agenda.timeline].reverse().slice(0, 6).map((ev, idx) => (
                                    <li key={idx} className="flex items-baseline gap-2">
                                        <span className="w-20 text-tertiary">{fmtDate(ev.ts)}</span>
                                        <span className="text-primary">{ev.tipo.replace(/_/g, " ")}</span>
                                        {ev.desc && <span className="text-tertiary">— {ev.desc}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};
