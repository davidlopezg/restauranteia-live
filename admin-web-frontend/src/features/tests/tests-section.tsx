import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MagicWand01, Plus, Trash01 } from "@untitledui/icons";
import { testsService, feedbackService, aprobarService } from "@/services/tests";
import { iaService } from "@/services/ia";
import type { DevTest, TestEstado, TestCreate, EvaluacionCriterios, EvaluacionProducto } from "@/types/test";
import type { TestFeedback, FeedbackCreate } from "@/types/feedback";
import { fmtDate } from "@/utils/date";
import { ImageGallery } from "@/features/images/image-gallery";

// Sección de Pruebas para una agenda.
// Modelo mental: una Prueba = una iteración concreta del concepto que
// se muestra como una pila simple de campos:
//   🎯 Objetivo
//   🔧 Qué hice
//   📝 Resultado (con feedback de mesa adentro)
//   🔄 Qué cambiaré
//   📷 Fotos
//   ⭐ Evaluación (5 criterios con estrellas)
//   🧾 Ficha IA (botón, no campo)
//   🎯 Decisión
//
// La app empuja al siguiente paso: después de guardar, muestra acciones
// sugeridas según el estado.
// Ver docs/PRODUCT_WORKFLOW.md para el flujo completo.

interface TestsSectionProps {
    agendaId: string;
    onChange?: () => void;
}

const ESTADO_BADGE: Record<TestEstado, string> = {
    PENDIENTE: "bg-warning-secondary text-warning-primary",
    REALIZADA: "bg-success-secondary text-success-primary",
    APROBADO: "bg-brand-primary text-white",
    DESCARTADA: "bg-error-secondary text-error-primary",
};

const CRITERIOS: Array<{ key: keyof EvaluacionCriterios; label: string; hint: string }> = [
    { key: "sabor", label: "Está bueno", hint: "Sabor" },
    { key: "identidad", label: "Tiene identidad", hint: "No es genérico" },
    { key: "encaja", label: "Encaja con Sol de Nit", hint: "Concepto del restaurante" },
    { key: "ejecutable", label: "Ejecutable en servicio", hint: "Se puede hacer en cocina real" },
    { key: "viable", label: "Viable económicamente", hint: "Costes / tiempo vs precio" },
];

const EMPTY_CRITERIOS: EvaluacionCriterios = { sabor: 0, identidad: 0, encaja: 0, ejecutable: 0, viable: 0 };

function parseEvaluacion(raw: unknown): EvaluacionProducto | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as { criterios?: Partial<EvaluacionCriterios>; promedio?: number; veredicto?: string };
    const c = { ...EMPTY_CRITERIOS, ...(obj.criterios ?? {}) };
    const promedio = obj.promedio ?? (c.sabor + c.identidad + c.encaja + c.ejecutable + c.viable) / 5;
    const veredicto = (obj.veredicto as EvaluacionProducto["veredicto"] | undefined) ??
        (promedio >= 4 ? "APTA" : promedio >= 3 ? "REPASA" : "DESCARTAR");
    return { criterios: c, promedio, veredicto };
}

export const TestsSection = ({ agendaId, onChange }: TestsSectionProps) => {
    const qc = useQueryClient();
    const { data: tests, isLoading, error } = useQuery<DevTest[]>({
        queryKey: ["tests", "agenda", agendaId, "all"],
        queryFn: () => testsService.listByAgenda(agendaId) as Promise<DevTest[]>,
    });

    const create = useMutation({
        mutationFn: (body: TestCreate) => testsService.create(agendaId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tests", "agenda", agendaId] });
            onChange?.();
            setShowNew(false);
        },
    });

    const remove = useMutation({
        mutationFn: (testId: string) => testsService.delete(testId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tests", "agenda", agendaId] });
            onChange?.();
        },
    });

    const [showNew, setShowNew] = useState(false);

    return (
        <section className="rounded-lg border border-secondary bg-primary p-4" data-testid="tests-section">
            <header className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-tertiary">
                    Pruebas <span className="text-tertiary">({tests?.length ?? 0})</span>
                </h2>
                <button
                    type="button"
                    onClick={() => setShowNew(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                    data-testid="new-test-btn"
                >
                    <Plus className="size-3" /> Nueva prueba
                </button>
            </header>

            {isLoading ? (
                <p className="text-xs text-tertiary">Cargando…</p>
            ) : error ? (
                <p className="text-xs text-error-primary">Error: {(error as Error).message}</p>
            ) : (tests?.length ?? 0) === 0 ? (
                <p className="text-xs italic text-tertiary">Sin pruebas todavía. Empezá con la prueba 1.</p>
            ) : (
                <ul className="space-y-6">
                    {tests!.map(test => (
                        <TestItem
                            key={test.id}
                            test={test}
                            onDelete={() => {
                                if (confirm(`¿Eliminar prueba #${test.numero}?`)) remove.mutate(test.id);
                            }}
                            onChange={() => {
                                qc.invalidateQueries({ queryKey: ["tests", "agenda", agendaId] });
                                onChange?.();
                            }}
                            onCreateNext={(body) => create.mutate(body)}
                        />
                    ))}
                </ul>
            )}

            {showNew && (
                <NewTestModal
                    onClose={() => setShowNew(false)}
                    onCreate={body => create.mutate(body)}
                    submitting={create.isPending}
                    error={create.error as Error | null}
                />
            )}
        </section>
    );
};

// === Una prueba ===

interface TestItemProps {
    test: DevTest;
    onDelete: () => void;
    onChange: () => void;
    onCreateNext: (body: TestCreate) => void;
}

const TestItem = ({ test, onDelete, onChange, onCreateNext }: TestItemProps) => {
    const qc = useQueryClient();
    const [generatingFicha, setGeneratingFicha] = useState(false);
    const [showFicha, setShowFicha] = useState(false);
    const [editingDate, setEditingDate] = useState(false);

    const update = useMutation({
        mutationFn: (body: Partial<DevTest>) => testsService.update(test.id, body as never),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tests", "agenda", test.agenda_id] });
            onChange();
        },
    });

    const { data: feedbacks } = useQuery<TestFeedback[]>({
        queryKey: ["feedback", "test", test.id],
        queryFn: () => feedbackService.list(test.id) as Promise<TestFeedback[]>,
    });

    const evaluacion = parseEvaluacion(test.evaluacion);

    const fichaTexto = test.ficha_generada
        ? typeof test.ficha_generada === "string"
            ? test.ficha_generada
            : (test.ficha_generada as { texto?: string }).texto ?? JSON.stringify(test.ficha_generada, null, 2)
        : null;

    return (
        <li className="overflow-hidden rounded-lg border border-secondary bg-secondary/20" data-testid={`test-${test.id}`}>
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-secondary bg-secondary/40 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">#{test.numero}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[test.estado]}`}>
                        {test.estado}
                    </span>
                    {editingDate ? (
                        <input
                            type="date"
                            defaultValue={test.fecha ?? ""}
                            autoFocus
                            onBlur={ev => {
                                update.mutate({ fecha: ev.target.value || null } as never);
                                setEditingDate(false);
                            }}
                            className="rounded-md border border-secondary bg-primary px-2 py-0.5 text-xs"
                        />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setEditingDate(true)}
                            className="text-xs text-tertiary hover:underline"
                            title="Editar fecha"
                        >
                            📅 {fmtDate(test.fecha)}
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onDelete}
                    className="rounded-md px-2 py-0.5 text-xs text-error-primary hover:bg-error-secondary"
                    title="Eliminar prueba"
                >
                    <Trash01 className="size-3" />
                </button>
            </header>

            {/* Bloques */}
            <div className="divide-y divide-secondary">
                <Block title="🎯 Objetivo" field="objetivo" value={test.objetivo} update={update}>
                    {test.objetivo || <Placeholder>Qué querés probar en esta vuelta.</Placeholder>}
                </Block>

                <Block title="🔧 Qué hice" field="receta_utilizada" value={test.receta_utilizada} update={update}>
                    {test.receta_utilizada || <Placeholder>Receta usada + cambios durante la prueba.</Placeholder>}
                </Block>

                <Block
                    title="📝 Resultado"
                    field="resultado"
                    value={test.resultado}
                    update={update}
                    tone="success"
                    extra={<FeedbackInline testId={test.id} feedbacks={feedbacks ?? []} onChange={onChange} />}
                >
                    {test.resultado || <Placeholder>Qué pasó (1-3 frases).</Placeholder>}
                </Block>

                <Block
                    title="🔄 Qué cambiaré"
                    field="modificaciones"
                    value={test.modificaciones}
                    update={update}
                    hint="Hipótesis para la próxima prueba"
                >
                    {test.modificaciones || <Placeholder>Qué cambiarías la próxima vez.</Placeholder>}
                </Block>

                {/* Fotos */}
                <Block title="📷 Fotos" inset={false}>
                    <ImageGallery entidad="tests" entityId={test.id} onChange={onChange} />
                </Block>

                {/* Evaluación */}
                <Block
                    title="⭐ Evaluación"
                    actions={
                        <EvaluacionEditor
                            current={evaluacion}
                            onSave={(ev) => update.mutate({ evaluacion: ev } as never)}
                        />
                    }
                >
                    {evaluacion ? (
                        <EvaluacionSummary ev={evaluacion} />
                    ) : (
                        <Placeholder>Marcá las 5 estrellas para evaluar el producto.</Placeholder>
                    )}
                </Block>

                {/* Ficha IA (botón, no campo inline) */}
                <Block
                    title="🧾 Ficha IA"
                    tone="warning"
                    actions={
                        <>
                            {!fichaTexto && (
                                <button
                                    type="button"
                                    onClick={() => setGeneratingFicha(true)}
                                    className="inline-flex items-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-xs text-white hover:bg-brand-primary_hover"
                                    data-testid={`generar-ficha-${test.id}`}
                                >
                                    <MagicWand01 className="size-3" /> Generar
                                </button>
                            )}
                            {fichaTexto && (
                                <button
                                    type="button"
                                    onClick={() => setShowFicha(true)}
                                    className="text-xs text-brand-primary hover:underline"
                                >
                                    Ver / Regenerar
                                </button>
                            )}
                        </>
                    }
                >
                    {fichaTexto ? (
                        <p className="text-xs text-secondary">
                            Ficha generada. Click "Ver / Regenerar" para revisarla o actualizarla.
                        </p>
                    ) : (
                        <Placeholder>Generá la ficha a partir de objetivo + qué hice + resultado.</Placeholder>
                    )}
                </Block>

                {/* Decisión */}
                <Block title="🎯 Decisión">
                    <DecisionPanel
                        test={test}
                        evaluacion={evaluacion}
                        onChange={onChange}
                        onCreateNext={onCreateNext}
                        onUpdate={(body) => update.mutate(body as never)}
                    />
                </Block>
            </div>

            {/* Modales */}
            {generatingFicha && (
                <GenerarFichaModal
                    test={test}
                    onClose={() => setGeneratingFicha(false)}
                    onSave={text => {
                        update.mutate({ ficha_generada: { texto: text } } as never);
                        setGeneratingFicha(false);
                    }}
                />
            )}
            {showFicha && fichaTexto && (
                <FichaModal
                    initial={fichaTexto}
                    onClose={() => setShowFicha(false)}
                    onSave={text => {
                        update.mutate({ ficha_generada: { texto: text } } as never);
                        setShowFicha(false);
                    }}
                />
            )}
        </li>
    );
};

// === Componentes de bloque ===

const Block = ({
    title,
    children,
    field,
    value,
    update,
    hint,
    tone,
    actions,
    extra,
    inset = true,
}: {
    title: string;
    children: React.ReactNode;
    field?: keyof DevTest;
    value?: string | null;
    update?: { mutate: (body: Partial<DevTest>) => void };
    hint?: string;
    tone?: "success" | "warning";
    actions?: React.ReactNode;
    extra?: React.ReactNode;
    inset?: boolean;
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value ?? "");

    const toneClass = tone === "success"
        ? "bg-success-secondary/30 border-l-4 border-success-primary"
        : tone === "warning"
            ? "bg-warning-secondary/30 border-l-4 border-warning-primary"
            : "";

    const startEdit = () => {
        setDraft(value ?? "");
        setEditing(true);
    };

    const save = () => {
        if (update) update.mutate({ [field as string]: draft || null } as Partial<DevTest>);
        setEditing(false);
    };

    return (
        <div className={`px-4 py-3 ${toneClass}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{title}</h3>
                    {hint && <p className="text-[10px] text-tertiary">{hint}</p>}
                </div>
                <div className="flex items-center gap-2">
                    {actions}
                    {field && update && !editing && (
                        <button type="button" onClick={startEdit} className="text-xs text-brand-primary hover:underline">
                            Editar
                        </button>
                    )}
                </div>
            </div>
            {editing ? (
                <div className="space-y-2">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        rows={3}
                        autoFocus
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setEditing(false)}
                            className="rounded-md px-3 py-1 text-xs text-secondary hover:bg-secondary"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={save}
                            disabled={update && (update as { isPending?: boolean }).isPending}
                            className="rounded-md bg-brand-primary px-3 py-1 text-xs font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className={inset ? "pl-1 text-sm" : ""}>{children}</div>
                    {extra}
                </>
            )}
        </div>
    );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs italic text-tertiary">{children}</p>
);

// === Feedback de mesa inline (dentro del bloque Resultado) ===

const FeedbackInline = ({ testId, feedbacks, onChange }: { testId: string; feedbacks: TestFeedback[]; onChange: () => void }) => {
    const qc = useQueryClient();
    const [adding, setAdding] = useState(false);

    const create = useMutation({
        mutationFn: (body: FeedbackCreate) => feedbackService.create(testId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["feedback", "test", testId] });
            onChange();
        },
    });

    const remove = useMutation({
        mutationFn: (id: string) => feedbackService.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["feedback", "test", testId] });
            onChange();
        },
    });

    if (feedbacks.length === 0 && !adding) {
        return (
            <p className="mt-2 text-[11px] italic text-tertiary">
                Cuando sirvas esta versión en mesa, cargá el feedback por mesa acá.
            </p>
        );
    }

    return (
        <div className="mt-2 rounded border border-secondary bg-primary/40 p-2">
            <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-tertiary">
                    Feedback de mesa ({feedbacks.length})
                </span>
                {!adding && (
                    <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="text-[11px] text-brand-primary hover:underline"
                    >
                        + Añadir mesa
                    </button>
                )}
            </div>
            {feedbacks.length > 0 && (
                <ul className="space-y-1 text-xs">
                    {feedbacks.map(fb => (
                        <li key={fb.id} className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                                <span className="font-medium">Mesa {fb.mesa}</span>
                                {fb.valoracion != null && <span className="ml-2 text-tertiary">★ {fb.valoracion}/5</span>}
                                {fb.criterio && <span className="ml-2 text-tertiary">· {fb.criterio}</span>}
                                {fb.observacion && <div className="text-secondary">{fb.observacion}</div>}
                            </div>
                            <button
                                type="button"
                                onClick={() => remove.mutate(fb.id)}
                                className="rounded-full p-0.5 text-tertiary hover:text-error-primary"
                                aria-label="Eliminar feedback"
                            >
                                <Trash01 className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {adding && (
                <NewFeedbackInline
                    onClose={() => setAdding(false)}
                    onCreate={body => {
                        create.mutate(body);
                        setAdding(false);
                    }}
                />
            )}
        </div>
    );
};

const NewFeedbackInline = ({ onClose, onCreate }: { onClose: () => void; onCreate: (body: FeedbackCreate) => void }) => {
    const [mesa, setMesa] = useState("");
    const [valoracion, setValoracion] = useState<number | "">("");
    const [criterio, setCriterio] = useState("");
    const [obs, setObs] = useState("");
    return (
        <div className="mt-2 space-y-1 rounded border border-secondary bg-primary/60 p-2">
            <div className="grid grid-cols-3 gap-1">
                <input
                    type="text"
                    value={mesa}
                    onChange={e => setMesa(e.target.value)}
                    placeholder="Mesa"
                    autoFocus
                    className="rounded border border-secondary bg-primary px-2 py-1 text-xs"
                />
                <input
                    type="number"
                    value={valoracion}
                    onChange={e => setValoracion(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="★ 1-5"
                    min={1}
                    max={5}
                    className="rounded border border-secondary bg-primary px-2 py-1 text-xs"
                />
                <input
                    type="text"
                    value={criterio}
                    onChange={e => setCriterio(e.target.value)}
                    placeholder="criterio"
                    className="rounded border border-secondary bg-primary px-2 py-1 text-xs"
                />
            </div>
            <input
                type="text"
                value={obs}
                onChange={e => setObs(e.target.value)}
                placeholder="observación"
                className="w-full rounded border border-secondary bg-primary px-2 py-1 text-xs"
            />
            <div className="flex justify-end gap-1">
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded px-2 py-1 text-xs text-secondary hover:bg-secondary"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (!mesa.trim()) return;
                        onCreate({
                            mesa: mesa.trim(),
                            valoracion: typeof valoracion === "number" ? valoracion : undefined,
                            criterio: criterio.trim() || undefined,
                            observacion: obs.trim() || undefined,
                            fecha: new Date().toISOString().slice(0, 10),
                        });
                    }}
                    className="rounded bg-brand-primary px-2 py-1 text-xs text-white hover:bg-brand-primary_hover"
                >
                    Guardar
                </button>
            </div>
        </div>
    );
};

// === Evaluación con estrellas ===

const EvaluacionEditor = ({ current, onSave }: { current: EvaluacionProducto | null; onSave: (ev: EvaluacionProducto) => void }) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<EvaluacionCriterios>(current?.criterios ?? EMPTY_CRITERIOS);

    const abrir = () => {
        setDraft(current?.criterios ?? EMPTY_CRITERIOS);
        setOpen(true);
    };

    const promedio = (draft.sabor + draft.identidad + draft.encaja + draft.ejecutable + draft.viable) / 5;
    const veredicto = promedio >= 4 ? "APTA" : promedio >= 3 ? "REPASA" : "DESCARTAR";

    if (!open) {
        return (
            <button
                type="button"
                onClick={abrir}
                className="rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
            >
                {current ? "Reevaluar" : "Evaluar"}
            </button>
        );
    }

    return (
        <Modal title="Evaluación del producto" onClose={() => setOpen(false)}>
            <p className="mb-3 text-xs text-tertiary">
                Marcá de 1 a 5 estrellas en cada criterio. Es una evaluación
                cualitativa — usala para decidir si seguís, ajustás o aprobás.
            </p>
            <div className="space-y-2">
                {CRITERIOS.map(c => (
                    <div key={c.key} className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                            <div className="text-sm">{c.label}</div>
                            <div className="text-[11px] text-tertiary">{c.hint}</div>
                        </div>
                        <Stars value={draft[c.key]} onChange={n => setDraft(d => ({ ...d, [c.key]: n }))} />
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2 text-sm">
                <span>Promedio</span>
                <strong>{promedio.toFixed(1)} / 5</strong>
            </div>
            <p className={`mt-2 text-xs ${veredicto === "APTA" ? "text-success-primary" : veredicto === "REPASA" ? "text-warning-primary" : "text-error-primary"}`}>
                {veredicto === "APTA" && "🟢 APTA para promover"}
                {veredicto === "REPASA" && "🟡 Ajustar antes de promover"}
                {veredicto === "DESCARTAR" && "🔴 Repensar enfoque"}
            </p>
            <div className="mt-4 flex justify-end gap-2">
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onSave({ criterios: draft, promedio, veredicto });
                        setOpen(false);
                    }}
                    className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover"
                >
                    Guardar evaluación
                </button>
            </div>
        </Modal>
    );
};

const Stars = ({ value, onChange }: { value: number; onChange: (n: number) => void }) => (
    <div className="flex">
        {[1, 2, 3, 4, 5].map(n => (
            <button
                key={n}
                type="button"
                onClick={() => onChange(n === value ? 0 : n)}
                className={`px-0.5 text-base ${n <= value ? "text-warning-primary" : "text-tertiary"}`}
                aria-label={`${n} estrellas`}
            >
                ★
            </button>
        ))}
    </div>
);

const EvaluacionSummary = ({ ev }: { ev: EvaluacionProducto }) => (
    <div className="space-y-1 text-sm">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
            {CRITERIOS.map(c => (
                <div key={c.key} className="flex flex-col">
                    <span className="text-tertiary">{c.hint}</span>
                    <span className="text-warning-primary">{"★".repeat(ev.criterios[c.key])}<span className="text-tertiary">{"★".repeat(5 - ev.criterios[c.key])}</span></span>
                </div>
            ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
            <span>Promedio:</span>
            <strong>{ev.promedio.toFixed(1)} / 5</strong>
            <span className={ev.veredicto === "APTA" ? "text-success-primary" : ev.veredicto === "REPASA" ? "text-warning-primary" : "text-error-primary"}>
                {ev.veredicto === "APTA" && "🟢"}
                {ev.veredicto === "REPASA" && "🟡"}
                {ev.veredicto === "DESCARTAR" && "🔴"}
                {" "}
                {ev.veredicto === "APTA" ? "Apta" : ev.veredicto === "REPASA" ? "Ajustar" : "Repensar"}
            </span>
        </div>
    </div>
);

// === Decisión ===

const DecisionPanel = ({
    test,
    evaluacion,
    onChange,
    onCreateNext,
    onUpdate,
}: {
    test: DevTest;
    evaluacion: EvaluacionProducto | null;
    onChange: () => void;
    onCreateNext: (body: TestCreate) => void;
    onUpdate: (body: Partial<DevTest>) => void;
}) => {
    const qc = useQueryClient();
    const [aproving, setAproving] = useState(false);
    const [creatingNext, setCreatingNext] = useState(false);

    const aprobar = useMutation({
        mutationFn: () => aprobarService.run(test.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tests", "agenda", test.agenda_id] });
            qc.invalidateQueries({ queryKey: ["agendas", test.agenda_id] });
            qc.invalidateQueries({ queryKey: ["catalogos"] });
            onChange();
        },
    });

    const createNext = () => {
        onCreateNext({
            objetivo: test.modificaciones ?? "",
            estado: "PENDIENTE",
            fecha: new Date().toISOString().slice(0, 10),
        });
        setCreatingNext(false);
    };

    const descartar = () => {
        if (!confirm("¿Marcar esta prueba como descartada?")) return;
        onUpdate({ estado: "DESCARTADA" });
    };

    if (test.estado === "APROBADO") {
        return (
            <div className="rounded-md bg-brand-primary/10 p-3">
                <p className="text-sm">
                    🟢 <strong>Prueba aprobada.</strong> Se creó un producto en el catálogo y la agenda pasó a PRODUCTO.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <p className="text-xs text-tertiary">
                ¿Qué hacés con esta prueba?
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <button
                    type="button"
                    onClick={createNext}
                    disabled={creatingNext || !test.modificaciones}
                    className="rounded-md border border-warning-primary bg-warning-secondary px-3 py-2 text-sm font-medium text-warning-primary hover:bg-warning-primary hover:text-white disabled:opacity-40"
                    title={!test.modificaciones ? "Anotá qué cambiarías primero" : "Crear prueba #N+1 con lo aprendido"}
                >
                    🟡 Repetir modificando
                </button>
                <button
                    type="button"
                    onClick={() => setAproving(true)}
                    disabled={aprobar.isPending || !evaluacion || evaluacion.veredicto !== "APTA"}
                    className="rounded-md bg-brand-primary px-3 py-2 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-40"
                    title={
                        !evaluacion
                            ? "Evaluá primero"
                            : evaluacion.veredicto !== "APTA"
                                ? "La evaluación no es APTA — ajustá o descartá"
                                : "Promover a producto en catálogo"
                    }
                >
                    🟢 Aprobar y promover
                </button>
                <button
                    type="button"
                    onClick={descartar}
                    className="rounded-md border border-error-primary bg-error-secondary px-3 py-2 text-sm font-medium text-error-primary hover:bg-error-primary hover:text-white"
                >
                    🔴 Descartar
                </button>
            </div>

            {aproving && (
                <Modal title="¿Aprobar y promover?" onClose={() => setAproving(false)}>
                    <p className="text-sm text-secondary">
                        Esto va a:
                    </p>
                    <ul className="ml-4 mt-2 list-disc text-sm text-secondary">
                        <li>Marcar esta prueba como <strong>APROBADO</strong></li>
                        <li>Crear un nuevo producto en <strong>catálogos</strong> con la ficha de esta prueba</li>
                        <li>Vincular agenda ↔ catálogo</li>
                        <li>Mover la agenda a estado <strong>PRODUCTO</strong></li>
                    </ul>
                    {(aprobar.error as Error | null) && (
                        <p className="mt-2 text-xs text-error-primary">
                            Error: {(aprobar.error as Error).message}
                        </p>
                    )}
                    <div className="mt-4 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setAproving(false)}
                            className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={() => aprobar.mutate()}
                            disabled={aprobar.isPending}
                            className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                        >
                            {aprobar.isPending ? "Promoviendo…" : "Confirmar aprobación"}
                        </button>
                    </div>
                </Modal>
            )}
        </div>
    );
};

// === Modales auxiliares ===

const NewTestModal = ({ onClose, onCreate, submitting, error }: { onClose: () => void; onCreate: (body: TestCreate) => void; submitting?: boolean; error?: Error | null }) => {
    const [objetivo, setObjetivo] = useState("");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    return (
        <Modal title="Nueva prueba" onClose={onClose}>
            <form
                onSubmit={ev => {
                    ev.preventDefault();
                    if (!objetivo.trim() || submitting) return;
                    onCreate({ objetivo: objetivo.trim(), fecha, estado: "PENDIENTE" });
                }}
                className="space-y-3"
            >
                {error && (
                    <p className="rounded-md bg-error-secondary px-3 py-2 text-xs text-error-primary">
                        Error: {error.message}
                    </p>
                )}
                <label className="block text-xs text-tertiary">Objetivo</label>
                <input
                    type="text"
                    value={objetivo}
                    onChange={e => setObjetivo(e.target.value)}
                    className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    autoFocus
                    required
                    disabled={submitting}
                />
                <label className="block text-xs text-tertiary">Fecha</label>
                <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    disabled={submitting}
                />
                <ModalActions onClose={onClose} submitLabel={submitting ? "Creando…" : "Crear"} disabled={submitting} />
            </form>
        </Modal>
    );
};

const GenerarFichaModal = ({ test, onClose, onSave }: { test: DevTest; onClose: () => void; onSave: (text: string) => void }) => {
    const [text, setText] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const generar = async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = (await iaService.generarFicha(test.id)) as { texto?: string; ficha?: string; result?: string } | string;
            const ficha = typeof res === "string" ? res : res.texto ?? res.ficha ?? res.result ?? JSON.stringify(res, null, 2);
            setText(ficha);
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal title="Generar ficha de prueba con IA" onClose={onClose}>
            {!text && !loading && !err && (
                <div>
                    <p className="mb-3 text-sm text-secondary">
                        La IA mira objetivo + qué hice + resultado + qué cambiaré + evaluación
                        y devuelve una ficha estructurada.
                    </p>
                    <button
                        type="button"
                        onClick={generar}
                        className="w-full rounded-md bg-brand-primary px-3 py-2 text-sm font-medium text-white hover:bg-brand-primary_hover"
                    >
                        ✨ Generar
                    </button>
                </div>
            )}
            {loading && <p className="text-sm text-tertiary">Generando… puede tardar unos segundos.</p>}
            {err && <p className="text-sm text-error-primary">{err}</p>}
            {text && (
                <div>
                    <textarea
                        value={text}
                        onChange={e => setText(e.target.value)}
                        rows={12}
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-2 font-mono text-xs"
                    />
                    <ModalActions onClose={onClose} onSubmit={() => onSave(text)} submitLabel="Guardar ficha" />
                </div>
            )}
        </Modal>
    );
};

const FichaModal = ({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (text: string) => void }) => {
    const [text, setText] = useState(initial);
    return (
        <Modal title="Ficha IA — Ver / Editar" onClose={onClose}>
            <p className="mb-2 text-xs text-tertiary">
                Editá lo que quieras y guardá. O regenerá una versión nueva con el botón Generar.
            </p>
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={14}
                className="w-full rounded-md border border-secondary bg-primary px-3 py-2 font-mono text-xs"
            />
            <ModalActions onClose={onClose} onSubmit={() => onSave(text)} submitLabel="Guardar cambios" />
        </Modal>
    );
};

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose} role="dialog">
        <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-primary p-6 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-primary">{title}</h3>
            {children}
        </div>
    </div>
);

const ModalActions = ({ onClose, onSubmit, submitLabel, disabled }: { onClose: () => void; onSubmit?: () => void; submitLabel: string; disabled?: boolean }) => (
    <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary">
            Cancelar
        </button>
        <button
            type={onSubmit ? "button" : "submit"}
            onClick={onSubmit}
            disabled={disabled}
            className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
        >
            {submitLabel}
        </button>
    </div>
);
