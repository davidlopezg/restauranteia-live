import { useQuery } from "@tanstack/react-query";
import { healthcheckSupabase, type HealthResult } from "@/lib/healthcheck";

export const HomePage = () => {
    const { data, isLoading, error } = useQuery<HealthResult>({
        queryKey: ["health"],
        queryFn: () => healthcheckSupabase(),
        retry: false,
    });

    if (isLoading) return <p>Conectando…</p>;
    if (error) return <p className="text-error-primary">Sin conexión: {(error as Error).message}</p>;
    return (
        <div className="space-y-2">
            <h1 className="text-display-sm font-semibold">Sol de Nit — Admin</h1>
            <p className="text-tertiary">
                {data?.ok ? "Conectado" : "Sin conexión"}
                {data?.schema ? ` · schema ${data.schema}` : ""}
                {data?.error ? ` · ${data.error}` : ""}
            </p>
        </div>
    );
};