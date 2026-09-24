import type { ReactNode } from "react";
import { Hourglass01 } from "@untitledui/icons";

interface PlaceholderPageProps {
    title: string;
    phase: string;
    children?: ReactNode;
}

// Placeholder que se muestra en rutas cuya feature aún no se ha migrado.
// No usar para errores ni empty states — esos tienen su propio componente.

export const PlaceholderPage = ({ title, phase, children }: PlaceholderPageProps) => (
    <div className="mx-auto max-w-2xl py-8">
        <div className="rounded-lg border border-secondary bg-secondary p-6">
            <div className="flex items-center gap-3">
                <Hourglass01 className="size-6 text-warning-primary" />
                <h2 className="text-lg font-semibold text-primary">{title}</h2>
            </div>
            <p className="mt-2 text-sm text-tertiary">{phase}</p>
            {children && <div className="mt-4 text-sm text-secondary">{children}</div>}
        </div>
    </div>
);
