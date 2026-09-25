import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MagicWand01, Trash01 } from "@untitledui/icons";
import { testsService } from "@/services/tests";
import { feedbackService } from "@/services/feedback";
import { iaService } from "@/services/ia";
import type { DevTest, TestEstado, TestCreate } from "@/types/test";
import type { TestFeedback, FeedbackCreate } from "@/types/feedback";
import { fmtDate } from "@/utils/date";

// Sección de Pruebas + Feedback para una agenda. Subcomponentes:
// - Lista de tests con acciones (editar, eliminar, generar ficha IA, evaluar)
// - Lista de feedbacks por test
// - Modales para crear/editar test, generar ficha IA, evaluar mínimos, añadir feedback

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
                <h3 className="text-sm font-semibold text-primary">
                    Pruebas <span className="text-tertiary">({tests?.length ?? 0})</span>
                </h3>
                <button
                    type="button"
                    onClick={() => setShowNew(true)}
                    className="rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                    data-testid="new-test-btn"
                >
                    + Nueva prueba
                </button>
            </header>

            {isLoading ? (
                <p className="text-xs text-tertiary">Cargando…</p>
            ) : error ? (
                <p className="text-xs text-error-primary">Error: {(error as Error).message}</p>
            ) : (tests?.length ?? 0) === 0 ? (
                <p className="text-xs italic text-tertiary">Sin pruebas todavía. Empieza con la prueba 1.</p>
            ) : (
                <ul className="space-y-3">
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

const TestItem = ({ test, onDelete, onChange }: { test: DevTest; onDelete: () => void; onChange: () => void }) => {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [generatingFicha, setGeneratingFicha] = useState(false);
    const [evaluating, setEvaluating] = useState(false);
    const [showFichaEdit, setShowFichaEdit] = useState(false);

    const update = useMutation({
        mutationFn: (body: Partial<DevTest>) => testsService.update(test.id, body as never),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["tests", "agenda", test.agenda_id] });
            onChange();
        },
    });

    const { data: feedbacks } = useQuery<TestFeedback[]>({
        queryKey: ["feedback", "test", test.id],
        queryFn: () => feedbackService.listByTest(test.id) as Promise<TestFeedback[]>,
    });

    const fichaTexto = test.ficha_generada
        ? typeof test.ficha_generada === "string"
            ? test.ficha_generada
            : (test.ficha_generada as { texto?: string }).texto ?? JSON.stringify(test.ficha_generada, null, 2)
        : null;

    return (
        <li className="rounded-md border border-secondary bg-secondary/30 p-3" data-testid={`test-${test.id}`}>
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <strong className="text-sm">#{test.numero}</strong>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${ESTADO_BADGE[test.estado]}`}>
                        {test.estado}
                    </span>
                    {test.fecha && <span className="text-xs text-tertiary">{fmtDate(test.fecha)}</span>}
                </div>
                <div className="flex gap-1">
                    <button type="button" onClick={() => setEditing(true)} className="rounded-md px-2 py-0.5 text-xs hover:bg-secondary">
                        ✎
                    </button>
                    <button type="button" onClick={onDelete} className="rounded-md px-2 py-0.5 text-xs text-error-primary hover:bg-error-secondary">
                        <Trash01 className="size-3" />
                    </button>
                </div>
            </header>

            {test.objetivo && (
                <p className="mt-1 text-xs text-secondary">
                    <strong>Objetivo:</strong> {test.objetivo}
                </p>
            )}
            {test.receta_utilizada && (
                <p className="mt-0.5 text-xs text-tertiary">
                    <strong>Receta:</strong> {test.receta_utilizada}
                </p>
            )}
            {test.resultado && (
                <div className="mt-2 rounded-md bg-success-secondary p-2 text-xs">
                    <strong>Resultado:</strong> {test.resultado}
                </div>
            )}

            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={() => setGeneratingFicha(true)}
                    className="inline-flex items-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-xs text-white hover:bg-brand-primary_hover"
                    data-testid={`generar-ficha-${test.id}`}
                >
                    <MagicWand01 className="size-3" /> Generar ficha IA
                </button>
                <button
                    type="button"
                    onClick={() => setEvaluating(true)}
                    className="rounded-md border border-secondary px-2 py-1 text-xs hover:bg-secondary"
                    data-testid={`evaluar-${test.id}`}
                >
                    Evaluar mínimos
                </button>
            </div>

            {fichaTexto && (
                <div className="mt-2 rounded-md bg-warning-secondary p-2 text-xs">
                    <div className="mb-1 flex items-center justify-between">
                        <strong>Ficha IA</strong>
                        <button type="button" onClick={() => setShowFichaEdit(true)} className="text-xs text-brand-primary hover:underline">
                            Editar
                        </button>
                    </div>
                    <pre className="whitespace-pre-wrap">{fichaTexto.slice(0, 600)}{fichaTexto.length > 600 ? "…" : ""}</pre>
                </div>
            )}

            {/* Feedback */}
            <FeedbackList testId={test.id} feedbacks={feedbacks ?? []} onChange={onChange} />

            {editing && (
                <EditTestModal
                    test={test}
                    onClose={() => setEditing(false)}
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

const FeedbackList = ({ testId, feedbacks, onChange }: { testId: string; feedbacks: TestFeedback[]; onChange: () => void }) => {
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
        <div className="mt-2 border-t border-secondary pt-2">
            <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-tertiary">Feedback de mesa ({feedbacks.length})</span>
                <button type="button" onClick={() => setAdding(true)} className="text-xs text-brand-primary hover:underline">
                    + Añadir
                </button>
            </div>
            {feedbacks.length === 0 ? (
                <p className="text-xs italic text-tertiary">Sin feedback todavía.</p>
            ) : (
                <ul className="space-y-1">
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
        </div>
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
        <Modal title="Generar ficha con IA" onClose={onClose}>
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
        <Modal title="Editar ficha IA" onClose={onClose}>
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
        <Modal title="Nuevo feedback" onClose={onClose}>
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
