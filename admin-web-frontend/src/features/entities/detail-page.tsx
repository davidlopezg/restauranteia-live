import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { EntityKind } from "@/types/entity";
import { useEntityDetail } from "@/features/entities/hooks/use-entity-detail";
import { useConvertirIdea, useEntityMutations } from "@/features/entities/hooks/use-entity-mutations";
import { EntityEditForm } from "@/features/entities/components/entity-edit-form";
import { ConfirmDialog } from "@/features/entities/components/confirm-dialog";
import { BlockRenderer } from "@/features/blocks/block-renderer";
import { ImageGallery } from "@/features/images/image-gallery";
import { RelationsPanel } from "@/features/relations/relations-panel";
import { TestsSection } from "@/features/tests/tests-section";
import { DevelopmentSection } from "@/features/tests/development-section";
import { ENTITY_SINGULAR, ENTITY_PLURAL } from "@/features/entities/get-service";
import { DangerButton } from "@/components/ui/danger-button";
import { fmtDate } from "@/utils/date";
import { fmtPrice } from "@/utils/currency";

// DetailPage genérica para ideas/agendas/catalogos.
// Estructura:
//   - Header: título + acciones (Editar/Eliminar/Convertir)
//   - Cuerpo: propiedades + bloques (placeholder) + galería (placeholder)
//   - Lateral: relaciones (placeholder)
// Las secciones marcadas con placeholder se llenan en sus respectivas sub-fases.

interface DetailPageProps {
    entidad: EntityKind;
}

// Tipo unión mínima para leer props comunes. El detalle real (con blocks/images/relations)
// lo trae cada service.detail; aquí lo tratamos como Record<string, unknown> + id + titulo.
type AnyDetail = {
    item: Record<string, unknown> & { id: string; titulo: string };
    blocks?: unknown[];
    images?: unknown[];
    relations?: unknown;
};

export const DetailPage = ({ entidad }: DetailPageProps) => {
    const navigate = useNavigate();
    const params = useParams<{ id: string }>();
    const id = params.id ?? "";
    const { data, isLoading, error } = useEntityDetail<AnyDetail>(entidad, id || undefined);
    const mutations = useEntityMutations(entidad);
    const convertir = useConvertirIdea();
    const [editing, setEditing] = useState(false);

    if (!id) return <p className="text-sm text-error-primary">Falta ID en la URL.</p>;
    if (isLoading) return <p className="text-sm text-tertiary">Cargando…</p>;
    if (error) return <p className="text-sm text-error-primary">Error: {(error as Error).message}</p>;
    if (!data) return null;

    const item = data.item;
    const titulo = (item.titulo as string) || "(sin título)";

    const onDelete = () => {
        mutations.remove.mutate(id);
    };

    const onUpdate = (body: Record<string, unknown>) => {
        mutations.update.mutate(
            { id, body },
            { onSuccess: () => setEditing(false) },
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <header className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs text-tertiary">{ENTITY_PLURAL[entidad]} · {item.id as string}</p>
                    <h1 className="truncate text-xl font-semibold text-primary">{titulo}</h1>
                </div>
                {!editing && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setEditing(true)}
                            className="rounded-md border border-secondary px-3 py-1.5 text-sm hover:bg-secondary"
                        >
                            ✎ Editar
                        </button>
                        <ConfirmDialog
                            title={`Eliminar ${ENTITY_SINGULAR[entidad].toLowerCase()}`}
                            message={
                                <>
                                    Vas a eliminar <strong>{titulo}</strong>. Esta acción NO se puede
                                    deshacer (se borrarán también sus bloques, imágenes y relaciones).
                                </>
                            }
                            confirmLabel="Eliminar"
                            onConfirm={onDelete}
                        >
                            <DangerButton data-testid={`delete-${entidad}-${id}`}>
                                🗑 Eliminar
                            </DangerButton>
                        </ConfirmDialog>
                    </div>
                )}
            </header>

            {editing ? (
                <EntityEditForm
                    entidad={entidad}
                    item={item}
                    onSubmit={onUpdate}
                    onCancel={() => setEditing(false)}
                    isSubmitting={mutations.update.isPending}
                />
            ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Columna principal */}
                    <div className="space-y-6 lg:col-span-2">
                        <section data-testid="props">
                            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
                                Propiedades
                            </h2>
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                                <Prop label="ID" value={item.id as string} />
                                {item.notion_id != null && (
                                    <Prop label="Notion ID" value={String(item.notion_id)} />
                                )}
                                {item.descripcion != null && (
                                    <Prop label="Descripción" value={String(item.descripcion)} wide />
                                )}
                                {item.estado_idea != null && (
                                    <Prop label="Estado" value={String(item.estado_idea)} />
                                )}
                                {item.estado != null && (
                                    <Prop label="Estado" value={String(item.estado)} />
                                )}
                                {item.puntuacion != null && (
                                    <Prop label="Puntuación" value={String(item.puntuacion)} />
                                )}
                                {item.fecha_creacion != null && (
                                    <Prop label="Fecha creación" value={fmtDate(item.fecha_creacion as string)} />
                                )}
                                {item.fecha != null && (
                                    <Prop label="Fecha" value={fmtDate(item.fecha as string)} />
                                )}
                                {entidad === "catalogos" && (
                                    <>
                                        {item.orden != null && <Prop label="Orden" value={String(item.orden)} />}
                                        {item.precio != null && (
                                            <Prop label="Precio" value={fmtPrice(item.precio as number)} />
                                        )}
                                        {item.anio != null && <Prop label="Año" value={String(item.anio)} />}
                                        {item.seleccionada != null && (
                                            <Prop label="Seleccionada" value={item.seleccionada ? "Sí" : "No"} />
                                        )}
                                        {item.ingredientes != null && (
                                            <Prop label="Ingredientes" value={String(item.ingredientes)} wide />
                                        )}
                                    </>
                                )}
                                {entidad === "agendas" &&
                                    Array.isArray(item.etiquetas) &&
                                    item.etiquetas.length > 0 && (
                                        <Prop label="Etiquetas" value={(item.etiquetas as string[]).join(", ")} />
                                    )}
                                {Array.isArray(item.categorias) && (item.categorias as string[]).length > 0 && (
                                    <Prop label="Categorías" value={(item.categorias as string[]).join(", ")} />
                                )}
                            </dl>
                        </section>

                        {/* Para agendas: Pruebas es el protagonista, va en la columna principal */}
                        {entidad === "agendas" && (
                            <section data-testid="pruebas-section">
                                <TestsSection
                                    agendaId={id}
                                    onChange={() => mutations.update.mutate({ id, body: {} })}
                                />
                            </section>
                        )}

                        {/* Bloques de Notion: secundario. Para agendas queda debajo de Pruebas
                            (la mayor parte del trabajo se hace dentro de las pruebas). */}
                        <section data-testid="bloques-section">
                            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
                                Contenido ({(data.blocks ?? []).length} bloques)
                            </h2>
                            <BlockRenderer
                                blocks={(data.blocks ?? []) as never}
                                images={(data.images ?? []) as never}
                            />
                        </section>
                    </div>

                    {/* Columna lateral */}
                    <aside className="space-y-4">
                        {entidad === "ideas" && (
                            <section
                                className="rounded-lg border border-secondary bg-primary p-4"
                                data-testid="convertir-section"
                            >
                                <h3 className="text-sm font-semibold text-primary">Convertir en concepto</h3>
                                <p className="mt-1 text-xs text-tertiary">
                                    Crea una agenda en CONCEPTO con esta idea y la relación.
                                    {convertir.isSuccess && convertir.data?.already_exists && (
                                        <span className="mt-1 block text-warning-primary">
                                            Ya existe una agenda para esta idea.
                                        </span>
                                    )}
                                </p>
                                <button
                                    type="button"
                                    disabled={convertir.isPending}
                                    onClick={() => convertir.mutate(id)}
                                    className="mt-3 w-full rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                                    data-testid={`convertir-${id}`}
                                >
                                    {convertir.isPending ? "Convirtiendo…" : "🚀 Convertir en concepto"}
                                </button>
                            </section>
                        )}

                        <ImageGallery
                            entidad={entidad}
                            entityId={id}
                            images={(data.images ?? []) as never}
                        />

                        {entidad === "agendas" && (
                            <DevelopmentSection
                                agenda={item as never}
                                onChange={() => mutations.update.mutate({ id, body: {} })}
                            />
                        )}

                        <RelationsPanel
                            entidad={entidad}
                            entityId={id}
                            relations={(data.relations ?? {}) as never}
                            onChange={() => mutations.update.mutate({ id, body: {} })}
                        />
                    </aside>
                </div>
            )}

            {(mutations.create.isError ||
                mutations.update.isError ||
                mutations.remove.isError ||
                convertir.isError) && (
                <p className="text-sm text-error-primary">
                    Error:{" "}
                    {(mutations.create.error as Error | null)?.message ||
                        (mutations.update.error as Error | null)?.message ||
                        (mutations.remove.error as Error | null)?.message ||
                        (convertir.error as Error | null)?.message}
                </p>
            )}

            {mutations.update.isSuccess && !editing && (
                <p className="text-sm text-success-primary" role="status">
                    Guardado.
                </p>
            )}

            {/* boton volver invisible para tests visuales */}
            <button
                type="button"
                onClick={() => navigate(`/${entidad}`)}
                className="hidden"
                data-testid={`back-to-list-${entidad}`}
            >
                volver
            </button>
        </div>
    );
};

const Prop = ({ label, value, wide }: { label: string; value: string; wide?: boolean }) => (
    <>
        <dt className="text-xs uppercase tracking-wide text-tertiary">{label}</dt>
        <dd className={`text-primary ${wide ? "sm:col-span-2" : ""}`}>{value}</dd>
    </>
);
