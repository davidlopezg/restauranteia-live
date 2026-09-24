import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { desarrolloKeys, desarrolloService, type PendienteItem } from "@/services/desarrollo";
import { ESTADO_LABELS } from "@/types/pipeline";

// Página /pendientes: lista priorizada por estado y días sin actividad.
// Prioridades (calculadas por backend): ROJO / NARANJA / AMARILLO / VERDE.

const GRUPO_TITULO: Record<string, { emoji: string; label: string }> = {
    ROJO: { emoji: "🔴", label: "Urgente (>3 días esperando)" },
    NARANJA: { emoji: "🟠", label: "Hoy" },
    AMARILLO: { emoji: "🟡", label: "Esta semana" },
    VERDE: { emoji: "🟢", label: "Listo para producto" },
};

const ACCION_POR_ESTADO: Record<string, string> = {
    CONCEPTO: "Crear Prueba 1",
    PRUEBA_1: "Registrar resultado",
    EVALUACION_1: "Crear evaluación",
    MODIFICACION: "Crear Prueba 2",
    PRUEBA_2: "Validar producto",
    VALIDACION: "Crear producto en catálogo",
    PRODUCTO: "Emplatado IA",
};

export const PendientesPage = () => {
    const navigate = useNavigate();
    const { data, isLoading, error } = useQuery({
        queryKey: desarrolloKeys.pendientes(),
        queryFn: () => desarrolloService.pendientes(),
    });

    if (isLoading) return <p className="text-sm text-tertiary">Cargando pendientes…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;
    if (!data || data.length === 0) {
        return (
            <div>
                <h1 className="text-lg font-semibold text-primary">Pendientes</h1>
                <p className="mt-3 text-sm text-tertiary">🎉 No hay pendientes. Todos los desarrollos están al día.</p>
            </div>
        );
    }

    const grupos: Record<string, PendienteItem[]> = { ROJO: [], NARANJA: [], AMARILLO: [], VERDE: [] };
    for (const it of data) {
        const p = it.prioridad ?? "AMARILLO";
        grupos[p] = grupos[p] ?? [];
        grupos[p].push(it);
    }

    return (
        <div className="space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">Pendientes</h1>
                <p className="text-sm text-tertiary">Derivado del estado real de cada desarrollo.</p>
            </header>

            {(["ROJO", "NARANJA", "AMARILLO", "VERDE"] as const).map(key => {
                const arr = grupos[key];
                if (!arr || arr.length === 0) return null;
                return (
                    <section key={key} className="rounded-lg border border-secondary bg-primary p-4">
                        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                            <span>{GRUPO_TITULO[key]!.emoji}</span>
                            <span>{GRUPO_TITULO[key]!.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs ${key === "ROJO" ? "bg-error-secondary text-error-primary" : "bg-secondary text-tertiary"}`}>
                                {arr.length}
                            </span>
                        </h2>
                        <ul className="space-y-1">
                            {arr.map(it => (
                                <li
                                    key={it.id}
                                    onClick={() => navigate(`/agendas/${it.id}`)}
                                    className="flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
                                >
                                    <div>
                                        <div className="font-medium text-primary">{it.titulo}</div>
                                        <div className="text-xs text-tertiary">
                                            {ESTADO_LABELS[it.estado_desarrollo]}
                                            {it.dias_sin_actividad != null && ` · ${it.dias_sin_actividad}d sin actividad`}
                                        </div>
                                    </div>
                                    <div className="text-xs text-tertiary">{ACCION_POR_ESTADO[it.estado_desarrollo] ?? "—"}</div>
                                </li>
                            ))}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
};
