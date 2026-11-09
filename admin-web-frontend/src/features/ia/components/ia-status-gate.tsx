import type { ReactNode } from "react";
import { isEdgeFunctionMissing } from "@/services/edge-functions";
import type { IaStatusResponse } from "@/types/ia";

interface IaStatusGateProps {
    status: IaStatusResponse | undefined;
    isLoading: boolean;
    error: Error | null;
    children: ReactNode;
}

/**
 * Puerta de las pantallas de IA. Distingue TRES estados que antes se
 * confundían todos en "⚠️ IA no configurada":
 *
 *  1. Cargando → spinner.
 *  2. Error técnico (p. ej. la Edge Function `ia-status` no está desplegada)
 *     → se dice LO QUE PASA, no "te falta la API key".
 *  3. Sin API key → la instruccion correcta: ve a Configuración.
 *
 * La fuente de verdad del estado es `app_settings` (la BD), la misma que usa
 * la página de Configuración.
 */
export const IaStatusGate = ({ status, isLoading, error, children }: IaStatusGateProps) => {
    if (isLoading) {
        return (
            <div className="mx-auto max-w-2xl rounded-lg border border-secondary bg-primary p-6">
                <p className="text-sm text-secondary">⏳ Comprobando la configuración de la IA…</p>
            </div>
        );
    }

    if (error) {
        const noDesplegada = isEdgeFunctionMissing(error);
        return (
            <div className="border-warning-primary mx-auto max-w-2xl rounded-lg border bg-warning-secondary p-6">
                <h2 className="text-base font-semibold text-primary">⚠️ No se pudo comprobar la IA</h2>
                <p className="mt-2 text-sm text-secondary">
                    {noDesplegada
                        ? "Las funciones de IA no están desplegadas en este proyecto, así que no se puede ni generar contenido ni leer el estado de la API key."
                        : error.message}
                </p>
                <p className="mt-2 text-xs text-tertiary">
                    {noDesplegada
                        ? "Se despliegan con el workflow «Deploy Frontend + Edge Functions» (necesita un access token válido de Supabase en el secret SUPABASE_ACCESS_TOKEN)."
                        : "Detalle técnico: " + error.message}
                </p>
                <p className="mt-3 text-sm text-secondary">
                    La API key se guarda en{" "}
                    <a href="#/settings" className="text-brand-primary underline">
                        Configuración
                    </a>
                    .
                </p>
            </div>
        );
    }

    if (!status?.configured) {
        return (
            <div className="border-warning-primary mx-auto max-w-2xl rounded-lg border bg-warning-secondary p-6">
                <h2 className="text-base font-semibold text-primary">⚠️ Falta la API key</h2>
                <p className="mt-2 text-sm text-secondary">
                    Ve a{" "}
                    <a href="#/settings" className="text-brand-primary underline">
                        Configuración → MiniMax
                    </a>{" "}
                    y guarda tu API key. Sin ella no se puede generar nada con IA.
                </p>
            </div>
        );
    }

    return <>{children}</>;
};
