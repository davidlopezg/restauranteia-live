import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MagicWand01, Plus, Trash01 } from "@untitledui/icons";
import { testsService, feedbackService, commentsService } from "@/services/tests";
import { iaService } from "@/services/ia";
import type { DevTest, TestEstado, TestCreate } from "@/types/test";
import type { TestFeedback, FeedbackCreate } from "@/types/feedback";
import type { TestComment, TestCommentCreate } from "@/services/tests";
import { fmtDate } from "@/utils/date";
import { ImageGallery } from "@/features/images/image-gallery";

// Sección de Pruebas para una agenda.
// Modelo: una Prueba = 1 iteración de desarrollo que se muestra como una
// secuencia vertical de BLOQUES apilados (estilo Notion):
//   * Objetivo
//   * Receta utilizada
//   * Modificaciones
//   * Resultado
//   * Ficha de prueba
//   * Evaluación de mínimos
//   * Comentarios (N)
//   * Imágenes (N)
//   * Feedback de mesa (N)
// Cada bloque se puede editar / eliminar / añadir (vía "+ Añadir bloque").
// Ver docs/PRODUCT_WORKFLOW.md para el flujo completo.

interface TestsSectionProps {
    agendaId: string;
    onChange?: () => void;
}

const ESTADO_BADGE: Record<TestEstado, string> = {
    PENDIENTE: "bg-warning-secondary text-warning-primary",
    REALIZADA: "bg-success-secondary text-success-primary",
    DESCARTADA: "bg-error-secondary text-error-primary",
};

const EVAL_QUESTIONS = [
    { id: "reproducible", label: "¿La receta es reproducible (ingredientes + cantidades exactas)?" },
    { id: "tiempos", label: "¿Están definidos los tiempos de cada paso?" },
    { id: "temperaturas", label: "¿Están definidas las temperaturas?" },
    { id: "emplatado", label: "¿Hay instrucciones claras de emplatado?" },
    { id: "criticos", label: "¿Se identifican los puntos críticos de fallo?" },
];

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
                <p className="text-xs italic text-tertiary">Sin pruebas todavía. Empieza con la prueba 1.</p>
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
                        />
                    ))}
                </ul>
            )}

            {showNew && (
                <NewTestModal
                    onClose={() => setShowNew(false)}
                    onCreate={body => create.mutate(body)}
                />
            )}
        </section>
    );
};

// === Bloques ===

type BlockKind = "objetivo" | "receta" | "modificaciones" | "resultado" | "observaciones";

interface QuickEditState {
    field: BlockKind;
    value: string;
}

const TestItem = ({ test, onDelete, onChange }: { test: DevTest; onDelete: () => void; onChange: () => void }) => {
    const qc = useQueryClient();
    const [editingFull, setEditingFull] = useState(false);
    const [generatingFicha, setGeneratingFicha] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [showFichaEdit, setShowFichaEdit] = useState(false);
    const [quickEdit, setQuickEdit] = useState<QuickEditState | null>(null);

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

    const { data: comments } = useQuery<TestComment[]>({
        queryKey: ["comments", "test", test.id],
        queryFn: () => commentsService.list(test.id),
    });

    const fichaTexto = test.ficha_generada
        ? typeof test.ficha_generada === "string"
            ? test.ficha_generada
            : (test.ficha_generada as { texto?: string }).texto ?? JSON.stringify(test.ficha_generada, null, 2)
        : null;

    const evaluacionResultado = (test.evaluacion as { resultado?: string } | null)?.resultado;

    const saveQuickEdit = () => {
        if (!quickEdit) return;
        update.mutate({ [quickEdit.field]: quickEdit.value || null } as never);
        setQuickEdit(null);
    };

    return (
        <li
            className="overflow-hidden rounded-lg border border-secondary bg-secondary/20"
            data-testid={`test-${test.id}`}
        >
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-secondary bg-secondary/40 px-4 py-2">
                <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm">#{test.numero}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[test.estado]}`}>
                        {test.estado}
                    </span>
                    <span className="text-xs text-tertiary" title="Fecha de la prueba">
                        📅 {fmtDate(test.fecha)}
                    </span>
                </div>
                <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => setEditingFull(true)}
                        className="rounded-md px-2 py-0.5 text-xs hover:bg-secondary"
                        title="Editar prueba completa"
                    >
                        ✎ Editar todo
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="rounded-md px-2 py-0.5 text-xs text-error-primary hover:bg-error-secondary"
                        title="Eliminar prueba"
                    >
                        <Trash01 className="size-3" />
                    </button>
                </div>
            </header>

            {/* Bloques apilados */}
            <div className="divide-y divide-secondary">
                <Block title="🎯 Objetivo" onEdit={() => setQuickEdit({ field: "objetivo", value: test.objetivo ?? "" })}>
                    {test.objetivo || <Placeholder>Definí qué querés probar en esta vuelta.</Placeholder>}
                </Block>

                <Block title="📝 Receta utilizada" onEdit={() => setQuickEdit({ field: "receta", value: test.receta_utilizada ?? "" })}>
                    {test.receta_utilizada || <Placeholder>Anotá la versión de la receta que probaste.</Placeholder>}
                </Block>

                <Block title="🔄 Modificaciones" onEdit={() => setQuickEdit({ field: "modificaciones", value: test.modificaciones ?? "" })}>
                    {test.modificaciones || <Placeholder>Qué cambió respecto de la prueba anterior.</Placeholder>}
                </Block>

                <Block title="✅ Resultado" tone="success" onEdit={() => setQuickEdit({ field: "resultado", value: test.resultado ?? "" })}>
                    {test.resultado || <Placeholder>Cómo salió (observaciones gruesas).</Placeholder>}
                </Block>

                <Block title="💭 Observaciones" onEdit={() => setQuickEdit({ field: "observaciones", value: test.observaciones ?? "" })}>
                    {test.observaciones || <Placeholder>Notas libres adicionales.</Placeholder>}
                </Block>

                {/* Ficha de prueba */}
                <Block
                    title="🧾 Ficha de prueba"
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
                                    onClick={() => setShowFichaEdit(true)}
                                    className="text-xs text-brand-primary hover:underline"
                                >
                                    Editar
                                </button>
                            )}
                        </>
                    }
                >
                    {fichaTexto ? (
                        <pre className="whitespace-pre-wrap font-mono text-xs">{fichaTexto}</pre>
                    ) : (
                        <Placeholder>Aún sin ficha. Generala con IA a partir del objetivo y la receta.</Placeholder>
                    )}
                </Block>

                {/* Evaluación de mínimos */}
                <Block
                    title="⭐ Evaluación de mínimos"
                    actions={
                        <button
                            type="button"
                            onClick={() => setEvaluating(true)}
                            className="rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                            data-testid={`evaluar-${test.id}`}
                        >
                            {evaluacionResultado ? "Reevaluar" : "Evaluar"}
                        </button>
                    }
                >
                    {evaluacionResultado ? (
                        <p className={`text-xs ${evaluacionResultado === "APTA" ? "text-success-primary" : "text-warning-primary"}`}>
                            {evaluacionResultado === "APTA" ? "✅ APTA para servicio" : "⚠️ Repasar antes de servir"}
                        </p>
                    ) : (
                        <Placeholder>Marcá los 5 puntos para saber si la receta es apta.</Placeholder>
                    )}
                </Block>

                {/* Comentarios cronológicos */}
                <CommentsBlock testId={test.id} comments={comments ?? []} onChange={onChange} />

                {/* Galería de imágenes */}
                <Block title="🖼 Imágenes" inset={false}>
                    <ImageGallery entidad="tests" entityId={test.id} onChange={onChange} />
                </Block>

                {/* Feedback de mesa */}
                <FeedbackBlock testId={test.id} feedbacks={feedbacks ?? []} onChange={onChange} />
            </div>

            {/* Quick edit (inline, por campo) */}
            {quickEdit && (
                <Modal title={`Editar ${quickEdit.field}`} onClose={() => setQuickEdit(null)}>
                    <textarea
                        value={quickEdit.value}
                        onChange={e => setQuickEdit(s => (s ? { ...s, value: e.target.value } : s))}
                        rows={4}
                        autoFocus
                        className="w-full rounded-md border border-secondary bg-primary px-3 py-2 text-sm"
                    />
                    <div className="mt-3 flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setQuickEdit(null)}
                            className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={saveQuickEdit}
                            disabled={update.isPending}
                            className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                        >
                            {update.isPending ? "Guardando…" : "Guardar"}
                        </button>
                    </div>
                </Modal>
            )}

            {editingFull && (
                <EditTestModal
                    test={test}
                    onClose={() => setEditingFull(false)}
                    onSave={body => update.mutate(body)}
                />
            )}
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
            {showFichaEdit && fichaTexto && (
                <FichaEditModal
                    initial={fichaTexto}
                    onClose={() => setShowFichaEdit(false)}
                    onSave={text => {
                        update.mutate({ ficha_generada: { texto: text } } as never);
                        setShowFichaEdit(false);
                    }}
                />
            )}
            {evaluating && (
                <EvaluacionModal
                    test={test}
                    onClose={() => setEvaluating(false)}
                    onSave={result => {
                        update.mutate({ evaluacion: result } as never);
                        setEvaluating(false);
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
    onEdit,
    actions,
    tone,
    inset = true,
}: {
    title: string;
    children: React.ReactNode;
    onEdit?: () => void;
    actions?: React.ReactNode;
    tone?: "success" | "warning";
    inset?: boolean;
}) => {
    const toneClass = tone === "success"
        ? "bg-success-secondary/30 border-l-4 border-success-primary"
        : tone === "warning"
            ? "bg-warning-secondary/30 border-l-4 border-warning-primary"
            : "";
    return (
        <div className={`px-4 py-3 ${toneClass}`}>
            <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-tertiary">{title}</h3>
                <div className="flex items-center gap-2">
                    {actions}
                    {onEdit && (
                        <button
                            type="button"
                            onClick={onEdit}
                            className="text-xs text-brand-primary hover:underline"
                            aria-label={`Editar ${title}`}
                        >
                            Editar
                        </button>
                    )}
                </div>
            </div>
            <div className={inset ? "pl-1 text-sm" : ""}>{children}</div>
        </div>
    );
};

const Placeholder = ({ children }: { children: React.ReactNode }) => (
    <p className="text-xs italic text-tertiary">{children}</p>
);

// === Comentarios (bloque) ===

const CommentsBlock = ({ testId, comments, onChange }: { testId: string; comments: TestComment[]; onChange: () => void }) => {
    const qc = useQueryClient();
    const [autor, setAutor] = useState("");

    const create = useMutation({
        mutationFn: (body: TestCommentCreate) => commentsService.create(testId, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["comments", "test", testId] });
            onChange();
        },
    });

    const remove = useMutation({
        mutationFn: (id: string) => commentsService.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["comments", "test", testId] });
            onChange();
        },
    });

    const submit = () => {
        const texto = window.prompt("Comentario / anotación:");
        if (!texto?.trim()) return;
        create.mutate({ autor: autor.trim() || undefined, texto: texto.trim() });
    };

    return (
        <Block
            title={`💬 Comentarios / Anotaciones (${comments.length})`}
            actions={
                <div className="flex items-center gap-1">
                    <input
                        type="text"
                        value={autor}
                        onChange={e => setAutor(e.target.value)}
                        placeholder="autor"
                        className="w-28 rounded-md border border-secondary bg-primary px-2 py-0.5 text-xs"
                    />
                    <button
                        type="button"
                        onClick={submit}
                        className="inline-flex items-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-xs text-white hover:bg-brand-primary_hover disabled:opacity-50"
                        disabled={create.isPending}
                        data-testid={`add-comment-${testId}`}
                    >
                        <Plus className="size-3" /> Añadir
                    </button>
                </div>
            }
        >
            {comments.length === 0 ? (
                <Placeholder>Sin comentarios. Útil para notas durante la prueba (ej: "David dice: subir sal").</Placeholder>
            ) : (
                <ul className="space-y-1.5">
                    {comments.map(c => (
                        <li key={c.id} className="flex items-start justify-between gap-2 text-xs">
                            <div className="flex-1">
                                <span className="font-medium">{c.autor ?? "Anónimo"}</span>
                                <span className="ml-2 text-tertiary">{fmtDate(c.created_at)}</span>
                                <div className="text-secondary">{c.texto}</div>
                            </div>
                            <button
                                type="button"
                                onClick={() => remove.mutate(c.id)}
                                className="rounded-full p-0.5 text-tertiary hover:text-error-primary"
                                aria-label="Eliminar comentario"
                            >
                                <Trash01 className="size-3" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </Block>
    );
};

// === Feedback de mesa (bloque) ===

const FeedbackBlock = ({ testId, feedbacks, onChange }: { testId: string; feedbacks: TestFeedback[]; onChange: () => void }) => {
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

    return (
        <Block
            title={`🍽 Feedback de mesa (${feedbacks.length})`}
            actions={
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="inline-flex items-center gap-1 rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                >
                    <Plus className="size-3" /> Añadir
                </button>
            }
        >
            {feedbacks.length === 0 ? (
                <Placeholder>Sin feedback de mesa todavía.</Placeholder>
            ) : (
                <ul className="space-y-1.5">
                    {feedbacks.map(fb => (
                        <li key={fb.id} className="flex items-start justify-between gap-2 text-xs">
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
                <NewFeedbackModal
                    onClose={() => setAdding(false)}
                    onCreate={body => create.mutate(body)}
                />
            )}
        </Block>
    );
};

// === Modales ===

const NewTestModal = ({ onClose, onCreate }: { onClose: () => void; onCreate: (body: TestCreate) => void }) => {
    const [objetivo, setObjetivo] = useState("");
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
    return (
        <Modal title="Nueva prueba" onClose={onClose}>
            <form
                onSubmit={ev => {
                    ev.preventDefault();
                    if (!objetivo.trim()) return;
                    onCreate({ objetivo: objetivo.trim(), fecha, estado: "PENDIENTE" });
                }}
                className="space-y-3"
            >
                <label className="block text-xs text-tertiary">Objetivo</label>
                <input
                    type="text"
                    value={objetivo}
                    onChange={e => setObjetivo(e.target.value)}
                    className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    autoFocus
                    required
                />
                <label className="block text-xs text-tertiary">Fecha</label>
                <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                />
                <ModalActions onClose={onClose} submitLabel="Crear" />
            </form>
        </Modal>
    );
};

const EditTestModal = ({ test, onClose, onSave }: { test: DevTest; onClose: () => void; onSave: (body: Partial<DevTest>) => void }) => {
    return (
        <Modal title={`Editar prueba #${test.numero}`} onClose={onClose}>
            <form
                onSubmit={ev => {
                    ev.preventDefault();
                    const fd = new FormData(ev.currentTarget);
                    const body: Record<string, unknown> = {};
                    for (const [k, v] of fd.entries()) {
                        if (typeof v === "string" && v !== "") body[k] = v;
                    }
                    onSave(body);
                }}
                className="space-y-2"
            >
                <Field label="Objetivo" name="objetivo" defaultValue={test.objetivo ?? ""} />
                <Field label="Receta utilizada" name="receta_utilizada" defaultValue={test.receta_utilizada ?? ""} />
                <Field label="Modificaciones" name="modificaciones" defaultValue={test.modificaciones ?? ""} />
                <Field label="Resultado" name="resultado" defaultValue={test.resultado ?? ""} textarea />
                <Field label="Observaciones" name="observaciones" defaultValue={test.observaciones ?? ""} textarea />
                <label className="block text-xs text-tertiary">Estado</label>
                <select
                    name="estado"
                    defaultValue={test.estado}
                    className="rounded-md border border-secondary bg-primary px-2 py-1 text-sm"
                >
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="REALIZADA">Realizada</option>
                    <option value="DESCARTADA">Descartada</option>
                </select>
                <Field label="Fecha" name="fecha" type="date" defaultValue={test.fecha ?? ""} />
                <ModalActions onClose={onClose} submitLabel="Guardar" />
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
                        Se usará OpenRouter con el prompt configurado en Settings.
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

const FichaEditModal = ({ initial, onClose, onSave }: { initial: string; onClose: () => void; onSave: (text: string) => void }) => {
    const [text, setText] = useState(initial);
    return (
        <Modal title="Editar ficha de prueba" onClose={onClose}>
            <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={12}
                className="w-full rounded-md border border-secondary bg-primary px-3 py-2 font-mono text-xs"
            />
            <ModalActions onClose={onClose} onSubmit={() => onSave(text)} submitLabel="Guardar" />
        </Modal>
    );
};

const EvaluacionModal = ({ test, onClose, onSave }: { test: DevTest; onClose: () => void; onSave: (r: { resultado: string; respuestas: Record<string, boolean>; puntos: number }) => void }) => {
    const initial = (test.evaluacion as { respuestas?: Record<string, boolean> } | null)?.respuestas ?? {};
    const [resp, setResp] = useState<Record<string, boolean>>(initial);

    const puntos = EVAL_QUESTIONS.reduce((acc, q) => acc + (resp[q.id] ? 1 : 0), 0);
    const pasa = puntos === EVAL_QUESTIONS.length;

    return (
        <Modal title="Evaluación de mínimos" onClose={onClose}>
            <p className="mb-3 text-xs text-tertiary">
                Marca los puntos que cumple. Si todos están en verde, la elaboración es apta para servicio.
            </p>
            <ul className="space-y-2">
                {EVAL_QUESTIONS.map(q => (
                    <li key={q.id} className="flex items-start gap-2 text-sm">
                        <input
                            type="checkbox"
                            id={`eq-${q.id}`}
                            checked={!!resp[q.id]}
                            onChange={e => setResp(r => ({ ...r, [q.id]: e.target.checked }))}
                            className="mt-0.5"
                        />
                        <label htmlFor={`eq-${q.id}`}>{q.label}</label>
                    </li>
                ))}
            </ul>
            <p className={`mt-3 text-xs ${pasa ? "text-success-primary" : "text-warning-primary"}`}>
                {puntos} / {EVAL_QUESTIONS.length} — {pasa ? "✅ APTA para servicio" : "⚠️ Repasar antes de servir"}
            </p>
            <ModalActions
                onClose={onClose}
                onSubmit={() =>
                    onSave({
                        resultado: pasa ? "APTA" : "REPASA",
                        respuestas: resp,
                        puntos,
                    })
                }
                submitLabel="Guardar evaluación"
            />
        </Modal>
    );
};

const NewFeedbackModal = ({ onClose, onCreate }: { onClose: () => void; onCreate: (body: FeedbackCreate) => void }) => {
    return (
        <Modal title="Nuevo feedback de mesa" onClose={onClose}>
            <form
                onSubmit={ev => {
                    ev.preventDefault();
                    const fd = new FormData(ev.currentTarget);
                    const mesa = String(fd.get("mesa") ?? "").trim();
                    if (!mesa) return;
                    const valoracion = fd.get("valoracion") ? Number(fd.get("valoracion")) : undefined;
                    const numPersonas = fd.get("num_personas") ? Number(fd.get("num_personas")) : undefined;
                    onCreate({
                        mesa,
                        valoracion: Number.isNaN(valoracion) ? undefined : valoracion,
                        num_personas: Number.isNaN(numPersonas) ? undefined : numPersonas,
                        criterio: String(fd.get("criterio") ?? "") || undefined,
                        observacion: String(fd.get("observacion") ?? "") || undefined,
                        fecha: String(fd.get("fecha") ?? "") || undefined,
                    });
                }}
                className="space-y-2"
            >
                <Field label="Mesa" name="mesa" required />
                <div className="grid grid-cols-2 gap-2">
                    <Field label="Nº personas" name="num_personas" type="number" />
                    <Field label="Valoración (1-5)" name="valoracion" type="number" />
                </div>
                <Field label="Criterio" name="criterio" placeholder="ej: sabor, textura" />
                <Field label="Observación" name="observacion" textarea />
                <Field label="Fecha" name="fecha" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
                <ModalActions onClose={onClose} submitLabel="Guardar" />
            </form>
        </Modal>
    );
};

// === Helpers UI ===

const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4" onClick={onClose} role="dialog">
        <div onClick={e => e.stopPropagation()} className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-primary p-6 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-primary">{title}</h3>
            {children}
        </div>
    </div>
);

const ModalActions = ({ onClose, onSubmit, submitLabel }: { onClose: () => void; onSubmit?: () => void; submitLabel: string }) => (
    <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary">
            Cancelar
        </button>
        <button
            type={onSubmit ? "button" : "submit"}
            onClick={onSubmit}
            className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover"
        >
            {submitLabel}
        </button>
    </div>
);

const Field = ({ label, name, type = "text", defaultValue, placeholder, textarea, required }: {
    label: string;
    name: string;
    type?: string;
    defaultValue?: string;
    placeholder?: string;
    textarea?: boolean;
    required?: boolean;
}) => (
    <div>
        <label className="mb-1 block text-xs text-tertiary">{label}</label>
        {textarea ? (
            <textarea
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                rows={3}
                required={required}
                className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
            />
        ) : (
            <input
                type={type}
                name={name}
                defaultValue={defaultValue}
                placeholder={placeholder}
                required={required}
                className="w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
            />
        )}
    </div>
);
