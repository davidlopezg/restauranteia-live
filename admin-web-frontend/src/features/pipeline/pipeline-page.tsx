import { Plus } from "@untitledui/icons";
import { KanbanBoard } from "@/features/pipeline/components/kanban-board";
import { PlaceholderPage } from "@/features/layout/placeholder-page";

// Página /desarrollo — Pipeline Kanban.
// El FAB "+ Nuevo desarrollo" llega en Fase 6 cuando esté el CRUD de agendas.

export const PipelinePage = () => (
    <div className="flex flex-col gap-4">
        <header className="flex items-center justify-between">
            <div>
                <h1 className="text-lg font-semibold text-primary">Pipeline de desarrollo</h1>
                <p className="text-sm text-tertiary">
                    7 columnas, una por estado. Drag &amp; drop o selector por card.
                </p>
            </div>
            <button
                type="button"
                disabled
                className="inline-flex items-center gap-1 rounded-md bg-secondary px-3 py-1.5 text-sm text-disabled"
                title="Llega en Fase 6 — CRUD de agendas"
            >
                <Plus className="size-4" />
                Nuevo desarrollo
            </button>
        </header>

        <KanbanBoard />

        <PlaceholderPage
            title="Detalle rápido"
            phase="Click en una card para abrir el detalle completo de la agenda."
        />
    </div>
);
