import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IaStatusGate } from "@/features/ia/components/ia-status-gate";
import { iaKeys, iaService } from "@/services/ia";

// Vista /ideas-cientificas: Flavor Engine (PubChem) + análisis por química molecular.

export const IdeasCientificasPage = () => {
    const [peticion, setPeticion] = useState("");
    const [resultado, setResultado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const {
        data: status,
        isPending: statusPending,
        error: statusError,
    } = useQuery({
        queryKey: iaKeys.status(),
        queryFn: () => iaService.status(),
        retry: false,
    });

    const analizar = useMutation({
        mutationFn: () => iaService.ideaCientifica({ peticion }),
        onSuccess: (data: unknown) => {
            // El backend devuelve un objeto con análisis estructurado.
            // Lo mostramos como JSON pretty + un resumen textual si existe.
            const obj = data as Record<string, unknown>;
            const texto = typeof obj.resultado === "string" ? obj.resultado : typeof obj.analisis === "string" ? obj.analisis : JSON.stringify(data, null, 2);
            setResultado(texto);
            setError(null);
        },
        onError: (e: Error) => setError(e.message),
    });

    return (
        <IaStatusGate status={status} isLoading={statusPending} error={statusError as Error | null}>
            <div className="mx-auto max-w-3xl space-y-4">
                <header>
                    <h1 className="text-lg font-semibold text-primary">🔬 Ideas Científicas</h1>
                    <p className="text-sm text-tertiary">Flavor Engine: combinaciones por química molecular (PubChem).</p>
                </header>

                <section className="rounded-lg border border-secondary bg-primary p-4">
                    <h2 className="text-sm font-semibold text-primary">Petición científica</h2>
                    <form
                        onSubmit={(ev) => {
                            ev.preventDefault();
                            if (peticion.trim()) analizar.mutate();
                        }}
                        className="mt-2 space-y-2"
                    >
                        <textarea
                            value={peticion}
                            onChange={(e) => setPeticion(e.target.value)}
                            rows={3}
                            placeholder='ej: "Topping con base de alcachofa que combine con queso de cabra y miel"'
                            required
                            className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        />
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={analizar.isPending}
                                className="rounded-md bg-brand-solid px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-solid_hover disabled:opacity-50"
                            >
                                {analizar.isPending ? "Analizando…" : "🔬 Analizar"}
                            </button>
                        </div>
                    </form>
                    {error && <p className="mt-2 text-xs text-error-primary">{error}</p>}
                </section>

                {resultado && (
                    <section className="rounded-lg border border-secondary bg-primary p-4">
                        <h2 className="text-sm font-semibold text-primary">Resultado</h2>
                        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-secondary p-3 text-xs whitespace-pre-wrap text-primary">{resultado}</pre>
                    </section>
                )}
            </div>
        </IaStatusGate>
    );
};
