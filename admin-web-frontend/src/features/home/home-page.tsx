import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/services/http-client";

// Fase 1: smoke page. Se sustituye por el shell real en Fase 2.
type Health = { status: string; schema?: string };

export const HomePage = () => {
    const { data, isLoading, error } = useQuery({
        queryKey: ["health"],
        queryFn: () => httpClient.get<Health>("/api/healthz"),
        retry: false,
    });

    if (isLoading) return <p>Conectando…</p>;
    if (error) return <p className="text-error-primary">Sin conexión: {(error as Error).message}</p>;
    return (
        <div className="space-y-2">
            <h1 className="text-display-sm font-semibold">Sol de Nit — Admin</h1>
            <p className="text-tertiary">
                Conectado · {data?.status ?? "ok"}
                {data?.schema ? ` · schema ${data.schema}` : ""}
            </p>
        </div>
    );
};
