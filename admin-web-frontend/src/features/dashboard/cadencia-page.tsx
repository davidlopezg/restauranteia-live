import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cadenciaKeys, cadenciaService } from "@/services/cadencia";
import { fmtDate } from "@/utils/date";

// Dashboard semanal: objetivo, completados, deuda, estado, actividad reciente,
// historial y opción de aplazar la semana.

export const CadenciaPage = () => {
    const qc = useQueryClient();
    const { data, isLoading, error } = useQuery({
        queryKey: cadenciaKeys.semanaActual(),
        queryFn: () => cadenciaService.semanaActual(),
    });
    const { data: historial } = useQuery({
        queryKey: cadenciaKeys.historial(8),
        queryFn: () => cadenciaService.historial(8),
    });

    const [objetivo, setObjetivo] = useState<string>("");
    const [deuda, setDeuda] = useState<string>("");

    const update = useMutation({
        mutationFn: (body: { objetivo_minimo?: number; deuda?: number }) =>
            cadenciaService.update(data!.week.id, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cadenciaKeys.semanaActual() });
            qc.invalidateQueries({ queryKey: cadenciaKeys.historial(8) });
        },
    });

    const aplazar = useMutation({
        mutationFn: (motivo: string) => cadenciaService.aplazar(data!.week.id, { motivo }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: cadenciaKeys.semanaActual() });
        },
    });

    if (isLoading) return <p className="text-sm text-tertiary">Cargando dashboard…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;
    if (!data) return null;

    const { week, actividad } = data;
    const obj = objetivo !== "" ? Number(objetivo) : week.objetivo_minimo;
    const d = deuda !== "" ? Number(deuda) : week.deuda;
    const pct = obj > 0 ? Math.round((week.productos_completados / obj) * 100) : 0;

    return (
        <div className="space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">Dashboard Semanal</h1>
                <p className="text-sm text-tertiary">
                    Semana {week.semana_inicio} → {week.semana_fin ?? "?"}
                </p>
            </header>

            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">Objetivos de la semana</h2>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Objetivo mínimo" value={String(obj)} />
                    <Stat label="Completados" value={String(week.productos_completados)} />
                    <Stat label="Avance" value={`${pct}%`} highlight={pct >= 100 ? "ok" : pct >= 50 ? "warn" : "err"} />
                    <Stat label="Deuda" value={String(d)} highlight={d > 0 ? "err" : "ok"} />
                </div>
                <div className="mt-3">
                    <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                        week.estado === "COMPLETADA"
                            ? "bg-success-secondary text-success-primary"
                            : week.estado === "APLAZADA"
                                ? "bg-warning-secondary text-warning-primary"
                                : "bg-secondary text-secondary"
                    }`}>
                        Estado: {week.estado}
                    </span>
                </div>
                {week.aplazamiento_motivo && (
                    <div className="mt-3 rounded-md bg-warning-secondary p-2 text-xs">
                        <strong>Motivo aplazamiento:</strong> {week.aplazamiento_motivo}
                        {week.aplazamiento_notas && <p className="mt-1 text-tertiary">{week.aplazamiento_notas}</p>}
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">Actividad reciente</h2>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Stat label="Tests creados" value={String(actividad.tests_creados)} />
                    <Stat label="Tests completados" value={String(actividad.tests_completados)} />
                    <Stat label="En CONCEPTO" value={String(actividad.conceptos)} />
                    <Stat label="Terminados" value={String(actividad.productos)} />
                </div>
            </section>

            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">Configurar objetivo</h2>
                <form
                    onSubmit={ev => {
                        ev.preventDefault();
                        const body: { objetivo_minimo?: number; deuda?: number } = {};
                        if (objetivo !== "") body.objetivo_minimo = Number(objetivo);
                        if (deuda !== "") body.deuda = Number(deuda);
                        if (Object.keys(body).length > 0) update.mutate(body);
                    }}
                    className="mt-2 grid grid-cols-2 gap-3"
                >
                    <div>
                        <label className="mb-1 block text-xs text-tertiary">Objetivo mínimo</label>
                        <input
                            type="number"
                            min={0}
                            placeholder={String(week.objetivo_minimo)}
                            value={objetivo}
                            onChange={e => setObjetivo(e.target.value)}
                            className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-tertiary">Deuda acumulada</label>
                        <input
                            type="number"
                            min={0}
                            placeholder={String(week.deuda)}
                            value={deuda}
                            onChange={e => setDeuda(e.target.value)}
                            className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        />
                    </div>
                    <div className="col-span-2 flex justify-end gap-2">
                        {week.estado !== "COMPLETADA" && (
                            <button
                                type="button"
                                onClick={() => {
                                    const motivo = prompt("Motivo del aplazamiento:");
                                    if (motivo) aplazar.mutate(motivo);
                                }}
                                className="rounded-md border border-secondary px-3 py-1.5 text-sm hover:bg-secondary"
                            >
                                Aplazar semana
                            </button>
                        )}
                        <button type="submit" disabled={update.isPending} className="rounded-md bg-brand-solid px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-solid_hover disabled:opacity-50">
                            {update.isPending ? "Guardando…" : "Guardar"}
                        </button>
                    </div>
                </form>
            </section>

            {historial && historial.length > 0 && (
                <section className="rounded-lg border border-secondary bg-primary p-4">
                    <h2 className="text-sm font-semibold text-primary">Historial de semanas</h2>
                    <table className="mt-2 w-full text-sm">
                        <thead className="text-xs uppercase text-tertiary">
                            <tr>
                                <th className="px-2 py-1 text-left">Semana</th>
                                <th className="px-2 py-1 text-left">Obj</th>
                                <th className="px-2 py-1 text-left">Hecho</th>
                                <th className="px-2 py-1 text-left">%</th>
                                <th className="px-2 py-1 text-left">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historial.map(w => {
                                const p = w.objetivo_minimo > 0
                                    ? Math.round((w.productos_completados / w.objetivo_minimo) * 100)
                                    : 0;
                                return (
                                    <tr key={w.id} className="border-t border-secondary">
                                        <td className="px-2 py-1">{fmtDate(w.semana_inicio)}</td>
                                        <td className="px-2 py-1">{w.objetivo_minimo}</td>
                                        <td className="px-2 py-1">{w.productos_completados}</td>
                                        <td className="px-2 py-1">{p}%</td>
                                        <td className="px-2 py-1">{w.estado}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
};

const Stat = ({ label, value, highlight }: { label: string; value: string; highlight?: "ok" | "warn" | "err" }) => (
    <div className="rounded-md bg-secondary/40 p-2">
        <div className="text-xs text-tertiary">{label}</div>
        <div className={`text-xl font-bold ${highlight === "ok" ? "text-success-primary" : highlight === "warn" ? "text-warning-primary" : highlight === "err" ? "text-error-primary" : "text-primary"}`}>
            {value}
        </div>
    </div>
);
