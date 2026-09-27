import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "@untitledui/icons";
import { DangerIconButton } from "@/components/ui/danger-button";
import { relationsService } from "@/services/relations";
import { ideasService, agendasService, catalogosService } from "@/services/entities";
import type { EntityKind } from "@/types/entity";
import type { Relations, RelationKind } from "@/types/relation";

// Panel de relaciones N:M para una entidad.
// Muestra las relaciones existentes agrupadas por tipo, permite añadir (vía
// modal de selección) y eliminar (con confirmación).

interface RelationsPanelProps {
    entidad: EntityKind;
    entityId: string;
    relations: Relations;
    onChange?: () => void;
}

const RELATIONS_BY_ENTITY: Record<EntityKind, Array<{ rel: RelationKind; label: string; target: EntityKind; key: keyof Relations }>> = {
    tests: [],
    ideas: [
        { rel: "idea_agenda", label: "Agendas relacionadas", target: "agendas", key: "agendas" },
        { rel: "idea_catalogo", label: "Catálogos relacionados", target: "catalogos", key: "catalogos" },
    ],
    agendas: [
        { rel: "idea_agenda", label: "Ideas relacionadas", target: "ideas", key: "ideas" },
        { rel: "agenda_catalogo", label: "Catálogos relacionados", target: "catalogos", key: "catalogos" },
    ],
    catalogos: [
        { rel: "idea_catalogo", label: "Ideas relacionadas", target: "ideas", key: "ideas" },
        { rel: "agenda_catalogo", label: "Agendas relacionadas", target: "agendas", key: "agendas" },
    ],
};

const SERVICE_BY_ENTITY = {
    ideas: ideasService,
    agendas: agendasService,
    catalogos: catalogosService,
    tests: ideasService, // stub: tests no aparece como target de relaciones
} as const;

export const RelationsPanel = ({ entidad, entityId, relations, onChange }: RelationsPanelProps) => {
    const sections = RELATIONS_BY_ENTITY[entidad];
    const total = sections.reduce((acc, s) => acc + ((relations[s.key] as unknown[] | undefined)?.length ?? 0), 0);

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4" data-testid="relations-panel">
            <h3 className="mb-2 text-sm font-semibold text-primary">
                Relaciones <span className="text-tertiary">({total})</span>
            </h3>
            {sections.map(sec => (
                <RelationSection
                    key={sec.rel}
                    entidad={entidad}
                    entityId={entityId}
                    rel={sec.rel}
                    label={sec.label}
                    target={sec.target}
                    items={(relations[sec.key] as Array<{ id: string; titulo: string }> | undefined) ?? []}
                    onChange={onChange}
                />
            ))}
        </section>
    );
};

const RelationSection = ({
    entidad,
    entityId,
    rel,
    label,
    target,
    items,
    onChange,
}: {
    entidad: EntityKind;
    entityId: string;
    rel: RelationKind;
    label: string;
    target: EntityKind;
    items: Array<{ id: string; titulo: string }>;
    onChange?: () => void;
}) => {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false);

    const remove = useMutation({
        mutationFn: (otherId: string) => relationsService.remove(rel, entityId, otherId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: [entidad] });
            onChange?.();
        },
    });

    return (
        <div className="mt-3" data-testid={`rel-${rel}`}>
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium uppercase tracking-wide text-tertiary">{label} ({items.length})</h4>
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-tertiary hover:bg-secondary"
                    data-testid={`add-${rel}`}
                >
                    <Plus className="size-3" /> Añadir
                </button>
            </div>
            {items.length === 0 ? (
                <p className="mt-1 text-xs italic text-tertiary">—</p>
            ) : (
                <ul className="mt-1 space-y-1">
                    {items.map(it => (
                        <li key={it.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-secondary">
                            <a href={`#/${target}/${it.id}`} className="flex-1 truncate text-primary hover:underline">
                                {it.titulo ?? "(sin título)"}
                            </a>
                            <DangerIconButton
                                onClick={() => {
                                    if (confirm("¿Eliminar relación?")) remove.mutate(it.id);
                                }}
                                disabled={remove.isPending}
                                aria-label="Eliminar relación"
                            >
                                <X className="size-3" />
                            </DangerIconButton>
                        </li>
                    ))}
                </ul>
            )}
            {adding && (
                <AddRelationModal
                    entidad={entidad}
                    entityId={entityId}
                    rel={rel}
                    target={target}
                    exclude={items.map(i => i.id)}
                    onClose={() => setAdding(false)}
                    onAdded={() => {
                        setAdding(false);
                        onChange?.();
                    }}
                />
            )}
        </div>
    );
};

const AddRelationModal = ({
    entidad,
    entityId,
    rel,
    target,
    exclude,
    onClose,
    onAdded,
}: {
    entidad: EntityKind;
    entityId: string;
    rel: RelationKind;
    target: EntityKind;
    exclude: string[];
    onClose: () => void;
    onAdded: () => void;
}) => {
    const [search, setSearch] = useState("");
    const [submitting, setSubmitting] = useState<string | null>(null);
    const [err, setErr] = useState<string | null>(null);

    const service = SERVICE_BY_ENTITY[target];
    const { data, isLoading } = useQuery({
        queryKey: [target, "list", { search }],
        queryFn: () => (service.list as unknown as (p: { search?: string; limit?: number }) => Promise<{ items: Array<{ id: string; titulo?: string }> }>)({ search: search || undefined, limit: 20 }),
    });

    const qc = useQueryClient();
    const add = async (otherId: string) => {
        setErr(null);
        setSubmitting(otherId);
        try {
            await relationsService.add(rel, { a_id: entityId, b_id: otherId });
            qc.invalidateQueries({ queryKey: [entidad] });
            onAdded();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setSubmitting(null);
        }
    };

    const items = (data?.items ?? []).filter(i => !exclude.includes(i.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose} role="dialog">
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-lg bg-primary p-4 shadow-xl">
                <h3 className="mb-3 text-sm font-semibold text-primary">Añadir {rel}</h3>
                {err && <p className="mb-2 text-xs text-error-primary">{err}</p>}
                <input
                    type="search"
                  placeholder="Buscar…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="mb-3 w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    autoFocus
                />
                <div className="max-h-64 overflow-y-auto rounded-md border border-secondary">
                    {isLoading ? (
                        <p className="p-3 text-xs text-tertiary">Cargando…</p>
                    ) : items.length === 0 ? (
                        <p className="p-3 text-xs italic text-tertiary">Sin resultados.</p>
                    ) : (
                        <ul>
                            {items.map((it: { id: string; titulo?: string }) => (
                                <li key={it.id}>
                                    <button
                                        type="button"
                                        onClick={() => add(it.id)}
                                        disabled={submitting === it.id}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-50"
                                    >
                                        <span className="truncate">{it.titulo ?? "(sin título)"}</span>
                                        {submitting === it.id && <span className="text-xs text-tertiary">…</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="mt-3 flex justify-end">
                    <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};
