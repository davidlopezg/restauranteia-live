import { useQuery } from "@tanstack/react-query";
import { healthcheckSupabase, type HealthResult } from "@/lib/healthcheck";
import { cx } from "@/utils/cx";

// Status pill del sidebar — healthcheck con polling cada 30s.
// Reemplaza /api/healthz por query directo a Supabase.

export const StatusPill = () => {
    const { data, error, isLoading } = useQuery<HealthResult>({
        queryKey: ["health"],
        queryFn: () => healthcheckSupabase(),
        refetchInterval: 30_000,
        retry: false,
    });

    let label: string;
    let dotClass: string;
    if (isLoading) {
        label = "Conectando…";
        dotClass = "bg-fg-quaternary";
    } else if (error || (data && !data.ok)) {
        label = "Sin conexión";
        dotClass = "bg-error-primary";
    } else {
        label = `Conectado · ${data?.schema ?? "ok"}`;
        dotClass = "bg-success-primary";
    }

    return (
        <div
            className="flex items-center gap-2 px-3 py-2 text-xs text-tertiary"
            role="status"
            aria-live="polite"
            title={label}
        >
            <span className={cx("size-2 rounded-full", dotClass)} aria-hidden />
            <span className="truncate">{label}</span>
        </div>
    );
};