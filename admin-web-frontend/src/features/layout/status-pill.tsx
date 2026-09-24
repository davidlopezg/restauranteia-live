import { useQuery } from "@tanstack/react-query";
import { httpClient } from "@/services/http-client";
import { cx } from "@/utils/cx";

type Health = { status: string; schema?: string };

// Status pill del sidebar — healthcheck con polling cada 30s.
// Coincide con el frontend actual (status-dot del sidebar).

export const StatusPill = () => {
    const { data, error, isLoading } = useQuery({
        queryKey: ["health"],
        queryFn: () => httpClient.get<Health>("/api/healthz"),
        refetchInterval: 30_000,
        retry: false,
    });

    let label: string;
    let dotClass: string;
    if (isLoading) {
        label = "Conectando…";
        dotClass = "bg-fg-quaternary";
    } else if (error) {
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
