import { useQuery } from "@tanstack/react-query";

// Vista /documentacion: documentación viva del producto.
// Carga el PRODUCT_WORKFLOW.md directamente desde /docs.
//
// Limitación documentada: el backend actual no expone un endpoint para servir
// docs (el frontend actual lo lee desde /docs/PRODUCT_WORKFLOW.md que el
// backend FastAPI sirve como static). En esta versión se carga directamente
// desde el mismo origen; si el proxy está configurado, también funciona.

interface DocResponse {
    text: string;
}

export const DocumentationPage = () => {
    const { data, isLoading, error } = useQuery({
        queryKey: ["docs", "PRODUCT_WORKFLOW"],
        queryFn: async () => {
            // Como el backend FastAPI sirve /docs/* como estáticos, hacemos
            // fetch directo al mismo origen (sin pasar por /api).
            const r = await fetch("/docs/PRODUCT_WORKFLOW.md");
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const text = await r.text();
            return { text } as DocResponse;
        },
        staleTime: 5 * 60_000,
    });

    return (
        <div className="space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">Cómo funciona el sistema</h1>
                <p className="text-sm text-tertiary">Documentación viva. Se actualiza cuando cambia el modelo o el flujo.</p>
            </header>

            {isLoading && <p className="text-sm text-tertiary">Cargando…</p>}
            {error && (
                <div className="rounded-lg border border-warning-primary bg-warning-secondary p-4 text-sm">
                    <p className="font-medium text-primary">No se pudo cargar el documento</p>
                    <p className="mt-1 text-tertiary">{(error as Error).message}</p>
                    <p className="mt-2 text-xs text-tertiary">
                        El backend FastAPI expone <code>/docs/*</code> como archivos estáticos. Si este error persiste, verifica que el backend está corriendo.
                    </p>
                </div>
            )}
            {data && (
                <article className="rounded-lg border border-secondary bg-primary p-6">
                    <pre className="whitespace-pre-wrap font-mono text-xs text-primary">{data.text}</pre>
                </article>
            )}
        </div>
    );
};
