/**
 * FASE 9 — Sección "Ficha Catálogo Completa" en el detalle de un catálogo.
 *
 * Muestra la receta unificada (catalogos.receta) con sus 9 secciones:
 *   1. Identidad
 *   2. Rendimiento
 *   3. Ingredientes (con enlace a tabla ingredientes + alérgenos auto)
 *   4. Elaboración (con puntos críticos APPCC)
 *   5. Parámetros
 *   6. Conservación
 *   7. Servicio
 *   8. Información (alérgenos, dietas)
 *   9. Economía (food cost %, margen)
 *
 * Modo edición inline para todas las secciones.
 * Vista diferenciada: este componente SIEMPRE muestra TODO (incluye PVP/economía).
 * El componente `FichaTecnicaImagen` (existente) usa esta misma fuente para
 * renderizar la ficha presentable sin PVP.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
    recetaService, recetaKeys,
} from "@/services/receta.service";
import type { Receta } from "@/types/catalogo";
import type { UnidadMedida, EstadoReceta } from "@/types/catalogo";
import { cx } from "@/utils/cx";

interface Props {
    catalogoId: string;
    receta: Receta | null;
    /** Precio del catálogo (de catalogos.precio, separado de la receta). */
    pvpCatalogo?: number | null;
    onChange?: () => void;
}

// === Helpers de UI ===

const fmtMoney = (n: number | null | undefined) =>
    typeof n === "number" ? `${n.toFixed(2)} €` : "—";

const fmtPct = (n: number | null | undefined) =>
    typeof n === "number" ? `${n.toFixed(1)} %` : "—";

const fmtQty = (n: number | null | undefined, unidad?: string | null) => {
    if (typeof n !== "number") return "—";
    return `${n}${unidad ? ` ${unidad}` : ""}`;
};

const UNIDADES: UnidadMedida[] = ["kg", "g", "L", "ml", "ud", "docena"];
const ESTADOS: EstadoReceta[] = ["borrador", "activa", "archivada"];

// === Sub-componente: sección colapsable ===

const CollapsibleSection = ({
    id, title, badge, children, defaultOpen = false,
}: {
    id: string;
    title: string;
    badge?: React.ReactNode;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <section
            className="rounded-md border border-secondary bg-primary"
            data-testid={`ficha-seccion-${id}`}
        >
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-full items-center justify-between gap-2 border-b border-secondary px-4 py-2.5 text-left hover:bg-secondary"
                aria-expanded={open}
            >
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-tertiary">
                    {open ? "▼" : "▶"} {title}
                </h3>
                {badge && <div className="flex items-center gap-1.5">{badge}</div>}
            </button>
            {open && <div className="p-4">{children}</div>}
        </section>
    );
};

// === Componente principal ===

export const FichaCatalogoSection = ({ catalogoId, receta, pvpCatalogo, onChange }: Props) => {
    const qc = useQueryClient();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<Receta | null>(receta);

    const { data: fichaCompleta } = useQuery({
        queryKey: recetaKeys.fichaCompleta(catalogoId),
        queryFn: () => recetaService.getFichaCompleta(catalogoId),
        staleTime: 30_000,
    });

    const updateMutation = useMutation({
        mutationFn: (newReceta: Receta) => recetaService.updateReceta(catalogoId, newReceta),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: recetaKeys.fichaCompleta(catalogoId) });
            onChange?.();
        },
    });

    const refreshMutation = useMutation({
        mutationFn: () => recetaService.refreshAlergenos(catalogoId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: recetaKeys.fichaCompleta(catalogoId) });
            onChange?.();
        },
    });

    if (!receta) {
        return (
            <section className="rounded-lg border border-secondary bg-primary p-4" data-testid="ficha-catalogo-section">
                <header className="mb-3">
                    <h3 className="text-sm font-semibold text-primary">
                        📋 Ficha Catálogo Completa (FASE 9)
                    </h3>
                    <p className="mt-1 text-xs text-tertiary">
                        Esta ficha aún no tiene receta unificada. Ejecuta la migración para crearla.
                    </p>
                </header>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => alert("Ejecuta desde SQL: SELECT migrate_recetas_to_v2();")}
                    data-testid="btn-migrar-receta"
                >
                    🔄 Migrar receta
                </Button>
            </section>
        );
    }

    const ingredientesNormalizados = fichaCompleta?.ingredientes_normalizados ?? [];
    const alergenosNormalizados = fichaCompleta?.alergenos ?? [];

    const onStartEdit = () => {
        setDraft(JSON.parse(JSON.stringify(receta)) as Receta);
        setEditing(true);
    };

    const onCancelEdit = () => {
        setDraft(null);
        setEditing(false);
    };

    const onSaveEdit = () => {
        if (!draft) return;
        updateMutation.mutate(draft, {
            onSuccess: () => {
                setEditing(false);
                setDraft(null);
            },
        });
    };

    const onRefreshAlergenos = () => {
        if (confirm("¿Recalcular alérgenos desde ingredientes?")) {
            refreshMutation.mutate();
        }
    };

    const r = editing && draft ? draft : receta;

    return (
        <section
            className="space-y-3 rounded-lg border border-secondary bg-primary p-4"
            data-testid="ficha-catalogo-section"
        >
            <header className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-primary">
                        📋 Ficha Catálogo Completa (FASE 9)
                    </h3>
                    <p className="mt-1 text-xs text-tertiary">
                        Receta unificada con 9 secciones. La ficha presentable (PNG) usa esta fuente.
                    </p>
                </div>
                <div className="flex gap-2">
                    {!editing ? (
                        <>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onRefreshAlergenos}
                                disabled={refreshMutation.isPending}
                                data-testid="btn-refresh-alergenos"
                            >
                                {refreshMutation.isPending ? "Recalculando…" : "🔄 Alérgenos"}
                            </Button>
                            <Button variant="primary" size="sm" onClick={onStartEdit} data-testid="btn-editar-ficha">
                                ✎ Editar ficha
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" size="sm" onClick={onCancelEdit}>
                                Cancelar
                            </Button>
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={onSaveEdit}
                                disabled={updateMutation.isPending}
                                data-testid="btn-guardar-ficha"
                            >
                                {updateMutation.isPending ? "Guardando…" : "Guardar"}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            {/* Resumen rápido */}
            <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                    Estado: <strong className="text-primary">{r.identidad.estado_receta}</strong>
                </span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                    v{r.identidad.version}
                </span>
                {typeof r.economia.coste_racion === "number" && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-tertiary">
                        Coste/ración: <strong className="text-primary">{fmtMoney(r.economia.coste_racion)}</strong>
                    </span>
                )}
                {typeof r.economia.food_cost_pct === "number" && (
                    <span className={cx(
                        "rounded-full px-2 py-0.5 font-medium",
                        r.economia.food_cost_pct > 35
                            ? "bg-red-100 text-red-700"
                            : r.economia.food_cost_pct > 25
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-green-100 text-green-700",
                    )}>
                        Food cost: {fmtPct(r.economia.food_cost_pct)}
                    </span>
                )}
                {alergenosNormalizados.length > 0 && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-700">
                        ⚠️ {alergenosNormalizados.length} alérgeno{alergenosNormalizados.length !== 1 ? "s" : ""}
                    </span>
                )}
            </div>

            {/* 9 secciones colapsables */}
            <div className="space-y-2">
                <CollapsibleSection id="identidad" title="1 · Identidad" defaultOpen>
                    <IdentidadView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection id="rendimiento" title="2 · Rendimiento">
                    <RendimientoView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection
                    id="ingredientes"
                    title="3 · Ingredientes"
                    badge={
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary">
                            {ingredientesNormalizados.length || r.ingredientes.length} líneas
                        </span>
                    }
                >
                    <IngredientesView
                        r={r}
                        editing={editing}
                        onChange={setDraft}
                        ingredientesNormalizados={ingredientesNormalizados}
                    />
                </CollapsibleSection>

                <CollapsibleSection id="elaboracion" title="4 · Elaboración">
                    <ElaboracionView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection id="parametros" title="5 · Parámetros">
                    <ParametrosView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection id="conservacion" title="6 · Conservación">
                    <ConservacionView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection id="servicio" title="7 · Servicio">
                    <ServicioView r={r} editing={editing} onChange={setDraft} />
                </CollapsibleSection>

                <CollapsibleSection
                    id="informacion"
                    title="8 · Información"
                    badge={
                        alergenosNormalizados.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                {alergenosNormalizados.map((a) => (
                                    <span
                                        key={a.alergeno_id}
                                        className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700"
                                        title={a.nombre}
                                    >
                                        {a.icono} {a.nombre}
                                    </span>
                                ))}
                            </div>
                        )
                    }
                >
                    <InformacionView
                        r={r}
                        editing={editing}
                        onChange={setDraft}
                        alergenosNormalizados={alergenosNormalizados}
                    />
                </CollapsibleSection>

                <CollapsibleSection id="economia" title="9 · Economía">
                    <EconomiaView r={r} editing={editing} onChange={setDraft} pvpCatalogo={pvpCatalogo} />
                </CollapsibleSection>
            </div>

            {/* Errores */}
            {(updateMutation.error || refreshMutation.error) && (
                <p className="text-xs text-error-primary" role="alert">
                    Error:{" "}
                    {(updateMutation.error as Error | null)?.message ||
                        (refreshMutation.error as Error | null)?.message}
                </p>
            )}
        </section>
    );
};

// === Vistas por sección ===

// 1. Identidad
function IdentidadView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Subcategoría" value={r.identidad.subcategoria} />
                <Field label="Versión" value={String(r.identidad.version)} />
                <Field label="Descripción" value={r.identidad.descripcion} wide />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["identidad"]>) =>
        onChange({ ...r, identidad: { ...r.identidad, ...patch } });
    return (
        <div className="space-y-2">
            <FieldEdit label="Subcategoría" value={r.identidad.subcategoria ?? ""} onChange={(v) => update({ subcategoria: v || null })} />
            <FieldEdit label="Descripción" value={r.identidad.descripcion ?? ""} onChange={(v) => update({ descripcion: v || null })} multiline />
            <div className="grid grid-cols-2 gap-2">
                <FieldEditSelect label="Estado" value={r.identidad.estado_receta} options={ESTADOS} onChange={(v) => update({ estado_receta: v as EstadoReceta })} />
                <FieldEdit label="Versión" value={String(r.identidad.version)} type="number" onChange={(v) => update({ version: Number(v) || 1 })} />
            </div>
        </div>
    );
}

// 2. Rendimiento
function RendimientoView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Rendimiento total" value={fmtQty(r.rendimiento.rendimiento_total, r.rendimiento.unidad_rendimiento)} />
                <Field label="Raciones" value={String(r.rendimiento.raciones)} />
                <Field label="Peso/ración" value={fmtQty(r.rendimiento.peso_por_racion_g, "g")} />
                <Field label="Volumen/ración" value={fmtQty(r.rendimiento.volumen_por_racion_ml, "ml")} />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["rendimiento"]>) =>
        onChange({ ...r, rendimiento: { ...r.rendimiento, ...patch } });
    return (
        <div className="grid grid-cols-2 gap-2">
            <FieldEdit label="Rendimiento total" value={r.rendimiento.rendimiento_total ?? ""} type="number" onChange={(v) => update({ rendimiento_total: v ? Number(v) : null })} />
            <FieldEditSelect label="Unidad" value={r.rendimiento.unidad_rendimiento ?? ""} options={UNIDADES} onChange={(v) => update({ unidad_rendimiento: (v as UnidadMedida) || null })} />
            <FieldEdit label="Raciones" value={String(r.rendimiento.raciones ?? 1)} type="number" onChange={(v) => update({ raciones: Number(v) || 1 })} />
            <FieldEdit label="Peso/ración (g)" value={r.rendimiento.peso_por_racion_g ?? ""} type="number" onChange={(v) => update({ peso_por_racion_g: v ? Number(v) : null })} />
            <FieldEdit label="Volumen/ración (ml)" value={r.rendimiento.volumen_por_racion_ml ?? ""} type="number" onChange={(v) => update({ volumen_por_racion_ml: v ? Number(v) : null })} />
        </div>
    );
}

// 3. Ingredientes
function IngredientesView({
    r, editing, onChange, ingredientesNormalizados,
}: {
    r: Receta;
    editing: boolean;
    onChange: (r: Receta) => void;
    ingredientesNormalizados: Array<{
        ingrediente_id: string;
        nombre: string;
        cantidad_bruta: number;
        unidad: string;
        merma_pct_override: number | null;
        coste_unitario: number | null;
        coste_linea: number | null;
        orden: number;
    }>;
}) {
    if (!editing) {
        return (
            <div>
                {ingredientesNormalizados.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead className="border-b border-secondary text-xs uppercase text-tertiary">
                            <tr>
                                <th className="py-1 text-left font-medium">Ingrediente</th>
                                <th className="py-1 text-right font-medium">Cantidad</th>
                                <th className="py-1 text-right font-medium">Merma</th>
                                <th className="py-1 text-right font-medium">€/kg</th>
                                <th className="py-1 text-right font-medium">Coste</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ingredientesNormalizados.map((ing) => (
                                <tr key={ing.ingrediente_id} className="border-t border-secondary">
                                    <td className="py-1 text-primary">{ing.nombre}</td>
                                    <td className="py-1 text-right text-tertiary">{fmtQty(ing.cantidad_bruta, ing.unidad)}</td>
                                    <td className="py-1 text-right text-tertiary">{fmtPct(ing.merma_pct_override ?? 0)}</td>
                                    <td className="py-1 text-right text-tertiary">{fmtMoney(ing.coste_unitario)}</td>
                                    <td className="py-1 text-right font-medium text-primary">{fmtMoney(ing.coste_linea)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-xs text-tertiary">
                        {r.ingredientes.length} ingredientes en JSON (sin normalizar). Ejecuta la migración para poblar la tabla normalizada.
                    </p>
                )}
            </div>
        );
    }
    return (
        <div>
            <p className="mb-2 text-xs text-tertiary">
                Edición inline del JSON. Para editar la lista normalizada usa la sección de Ingredientes en el catálogo.
            </p>
            <textarea
                value={JSON.stringify(r.ingredientes, null, 2)}
                onChange={(e) => {
                    try {
                        const parsed = JSON.parse(e.target.value);
                        onChange({ ...r, ingredientes: parsed });
                    } catch {/* ignore */}
                }}
                rows={8}
                className="w-full rounded-md border border-secondary bg-secondary px-2 py-1.5 font-mono text-xs"
            />
        </div>
    );
}

// 4. Elaboración
function ElaboracionView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <div className="space-y-3">
                {r.elaboracion.preparacion_previa && (
                    <div>
                        <h4 className="mb-1 text-xs font-semibold uppercase text-tertiary">Preparación previa</h4>
                        <p className="text-sm text-primary">{r.elaboracion.preparacion_previa}</p>
                    </div>
                )}
                <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-tertiary">Pasos ({r.elaboracion.pasos.length})</h4>
                    <ol className="space-y-1 text-sm">
                        {r.elaboracion.pasos.map((paso, i) => (
                            <li key={i} className="flex gap-2">
                                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-xs font-semibold text-brand-primary">
                                    {i + 1}
                                </span>
                                <span className="text-primary">{paso}</span>
                            </li>
                        ))}
                    </ol>
                </div>
                {r.elaboracion.puntos_criticos.length > 0 && (
                    <div>
                        <h4 className="mb-1 text-xs font-semibold uppercase text-tertiary">
                            ⚠️ Puntos críticos APPCC ({r.elaboracion.puntos_criticos.length})
                        </h4>
                        <ul className="space-y-1 text-sm">
                            {r.elaboracion.puntos_criticos.map((pc, i) => (
                                <li key={i} className="rounded-md border border-orange-200 bg-orange-50 p-2 text-primary">
                                    <strong>Paso {pc.paso}:</strong> {pc.motivo}
                                    {pc.accion && <span className="block text-xs text-tertiary">→ {pc.accion}</span>}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        );
    }
    const update = (patch: Partial<Receta["elaboracion"]>) =>
        onChange({ ...r, elaboracion: { ...r.elaboracion, ...patch } });
    return (
        <div className="space-y-2">
            <FieldEdit
                label="Preparación previa"
                value={r.elaboracion.preparacion_previa}
                onChange={(v) => update({ preparacion_previa: v })}
                multiline
            />
            <FieldEdit
                label={`Pasos (uno por línea) — actual: ${r.elaboracion.pasos.length}`}
                value={r.elaboracion.pasos.join("\n")}
                onChange={(v) => update({ pasos: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
                multiline
                rows={6}
            />
            <FieldEdit
                label="Puntos críticos (JSON array)"
                value={JSON.stringify(r.elaboracion.puntos_criticos, null, 2)}
                onChange={(v) => {
                    try {
                        update({ puntos_criticos: JSON.parse(v) });
                    } catch {/* ignore */}
                }}
                multiline
                rows={4}
            />
        </div>
    );
}

// 5. Parámetros
function ParametrosView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Tiempo prep." value={fmtQty(r.parametros.tiempo_preparacion_min, "min")} />
                <Field label="Tiempo cocción" value={fmtQty(r.parametros.tiempo_coccion_min, "min")} />
                <Field label="Temperatura" value={fmtQty(r.parametros.temperatura_c, "°C")} />
                <Field label="Técnica" value={r.parametros.tecnica} />
                <Field label="Equipamiento" value={r.parametros.equipamiento.join(", ")} wide />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["parametros"]>) =>
        onChange({ ...r, parametros: { ...r.parametros, ...patch } });
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
                <FieldEdit label="Prep (min)" value={r.parametros.tiempo_preparacion_min ?? ""} type="number" onChange={(v) => update({ tiempo_preparacion_min: v ? Number(v) : null })} />
                <FieldEdit label="Cocción (min)" value={r.parametros.tiempo_coccion_min ?? ""} type="number" onChange={(v) => update({ tiempo_coccion_min: v ? Number(v) : null })} />
                <FieldEdit label="Temperatura (°C)" value={r.parametros.temperatura_c ?? ""} type="number" onChange={(v) => update({ temperatura_c: v ? Number(v) : null })} />
            </div>
            <FieldEdit label="Técnica" value={r.parametros.tecnica} onChange={(v) => update({ tecnica: v })} />
            <FieldEdit
                label="Equipamiento (separado por comas)"
                value={r.parametros.equipamiento.join(", ")}
                onChange={(v) => update({ equipamiento: v.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
        </div>
    );
}

// 6. Conservación
function ConservacionView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Método" value={r.conservacion.metodo} />
                <Field label="Vida útil" value={fmtQty(r.conservacion.vida_util_h, "h")} />
                <Field label="Temperatura" value={r.conservacion.temperatura_c ? `${r.conservacion.temperatura_c.min}-${r.conservacion.temperatura_c.max} °C` : null} />
                <Field label="Envase" value={r.conservacion.envase} />
                <Field label="Etiquetado" value={r.conservacion.etiquetado} />
                <Field label="Regeneración" value={r.conservacion.regeneracion} />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["conservacion"]>) =>
        onChange({ ...r, conservacion: { ...r.conservacion, ...patch } });
    return (
        <div className="space-y-2">
            <FieldEdit label="Método" value={r.conservacion.metodo ?? ""} onChange={(v) => update({ metodo: v || null })} />
            <div className="grid grid-cols-3 gap-2">
                <FieldEdit label="Tª mín (°C)" value={r.conservacion.temperatura_c?.min ?? ""} type="number" onChange={(v) => update({ temperatura_c: { min: Number(v) || 0, max: r.conservacion.temperatura_c?.max ?? 0 } })} />
                <FieldEdit label="Tª máx (°C)" value={r.conservacion.temperatura_c?.max ?? ""} type="number" onChange={(v) => update({ temperatura_c: { min: r.conservacion.temperatura_c?.min ?? 0, max: Number(v) || 0 } })} />
                <FieldEdit label="Vida útil (h)" value={r.conservacion.vida_util_h ?? ""} type="number" onChange={(v) => update({ vida_util_h: v ? Number(v) : null })} />
            </div>
            <FieldEdit label="Envase" value={r.conservacion.envase ?? ""} onChange={(v) => update({ envase: v || null })} />
            <FieldEdit label="Etiquetado" value={r.conservacion.etiquetado ?? ""} onChange={(v) => update({ etiquetado: v || null })} />
            <FieldEdit label="Regeneración" value={r.conservacion.regeneracion ?? ""} onChange={(v) => update({ regeneracion: v || null })} />
        </div>
    );
}

// 7. Servicio
function ServicioView({
    r, editing, onChange,
}: { r: Receta; editing: boolean; onChange: (r: Receta) => void }) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Porción" value={fmtQty(r.servicio.porcion_g, "g")} />
                <Field label="Emplatado" value={r.servicio.emplatado} />
                <Field label="Guarnición" value={r.servicio.guarnicion} />
                <Field label="Salsa" value={r.servicio.salsa} />
                <Field label="Acabado" value={r.servicio.acabado} wide />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["servicio"]>) =>
        onChange({ ...r, servicio: { ...r.servicio, ...patch } });
    return (
        <div className="space-y-2">
            <FieldEdit label="Porción (g)" value={r.servicio.porcion_g ?? ""} type="number" onChange={(v) => update({ porcion_g: v ? Number(v) : null })} />
            <FieldEdit label="Emplatado" value={r.servicio.emplatado ?? ""} onChange={(v) => update({ emplatado: v || null })} />
            <FieldEdit label="Guarnición" value={r.servicio.guarnicion ?? ""} onChange={(v) => update({ guarnicion: v || null })} />
            <FieldEdit label="Salsa" value={r.servicio.salsa ?? ""} onChange={(v) => update({ salsa: v || null })} />
            <FieldEdit label="Acabado" value={r.servicio.acabado ?? ""} multiline onChange={(v) => update({ acabado: v || null })} />
        </div>
    );
}

// 8. Información
function InformacionView({
    r, editing, onChange, alergenosNormalizados,
}: {
    r: Receta;
    editing: boolean;
    onChange: (r: Receta) => void;
    alergenosNormalizados: Array<{ alergeno_id: string; codigo: string; nombre: string; icono: string; origen: string }>;
}) {
    if (!editing) {
        return (
            <div className="space-y-3">
                <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase text-tertiary">Alérgenos ({alergenosNormalizados.length})</h4>
                    {alergenosNormalizados.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {alergenosNormalizados.map((a) => (
                                <span
                                    key={a.alergeno_id}
                                    className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700"
                                    title={`${a.nombre} (${a.origen})`}
                                >
                                    {a.icono} {a.nombre}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-tertiary">Sin alérgenos detectados.</p>
                    )}
                </div>
                <Field label="Dietas válidas" value={r.informacion.dietas.join(", ")} wide />
                <Field label="Observaciones" value={r.informacion.observaciones} wide />
                <Field label="Advertencias" value={r.informacion.advertencias} wide />
            </div>
        );
    }
    const update = (patch: Partial<Receta["informacion"]>) =>
        onChange({ ...r, informacion: { ...r.informacion, ...patch } });
    return (
        <div className="space-y-2">
            <p className="rounded-md border border-secondary bg-secondary px-2 py-1 text-xs text-tertiary">
                ⚠️ Los alérgenos se calculan automáticamente desde los ingredientes.
                Para modificarlos, edita los alérgenos en cada ingrediente.
            </p>
            <FieldEdit
                label="Dietas (vegetariana, vegana, sin_gluten...)"
                value={r.informacion.dietas.join(", ")}
                onChange={(v) => update({ dietas: v.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
            <FieldEdit label="Observaciones" value={r.informacion.observaciones} multiline onChange={(v) => update({ observaciones: v })} />
            <FieldEdit label="Advertencias" value={r.informacion.advertencias} multiline onChange={(v) => update({ advertencias: v })} />
        </div>
    );
}

// 9. Economía
function EconomiaView({
    r, editing, onChange, pvpCatalogo,
}: {
    r: Receta;
    editing: boolean;
    onChange: (r: Receta) => void;
    pvpCatalogo?: number | null;
}) {
    if (!editing) {
        return (
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Coste total" value={fmtMoney(r.economia.coste_total)} />
                <Field label="Coste/ración" value={fmtMoney(r.economia.coste_racion)} />
                <Field label="PVP receta" value={fmtMoney(r.economia.pvp)} />
                <Field label="PVP (catálogo)" value={fmtMoney(pvpCatalogo)} />
                <Field label="Food cost %" value={fmtPct(r.economia.food_cost_pct)} highlight={r.economia.food_cost_pct} />
                <Field label="Margen bruto" value={fmtMoney(r.economia.margen_bruto)} />
                <Field label="Margen %" value={fmtPct(r.economia.margen_pct)} />
            </dl>
        );
    }
    const update = (patch: Partial<Receta["economia"]>) =>
        onChange({ ...r, economia: { ...r.economia, ...patch } });
    return (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <FieldEdit label="Coste total" value={r.economia.coste_total ?? ""} type="number" onChange={(v) => update({ coste_total: v ? Number(v) : null })} />
                <FieldEdit label="Coste/ración" value={r.economia.coste_racion ?? ""} type="number" onChange={(v) => update({ coste_racion: v ? Number(v) : null })} />
                <FieldEdit label="PVP receta" value={r.economia.pvp ?? ""} type="number" onChange={(v) => update({ pvp: v ? Number(v) : null })} />
                <FieldEdit label="Margen bruto" value={r.economia.margen_bruto ?? ""} type="number" onChange={(v) => update({ margen_bruto: v ? Number(v) : null })} />
                <FieldEdit label="Margen %" value={r.economia.margen_pct ?? ""} type="number" onChange={(v) => update({ margen_pct: v ? Number(v) : null })} />
            </div>
            <p className="rounded-md border border-secondary bg-secondary px-2 py-1 text-xs text-tertiary">
                💡 <strong>Food cost %</strong> se recalcula automáticamente al guardar (trigger SQL):
                <code className="ml-1 rounded bg-primary px-1.5 py-0.5">coste_total / pvp × 100</code>
            </p>
        </div>
    );
}

// === Sub-componentes auxiliares ===

function Field({
    label, value, wide, highlight,
}: { label: string; value: string | null; wide?: boolean; highlight?: number | null }) {
    const colorClass =
        typeof highlight === "number" && highlight > 35
            ? "text-red-700"
            : typeof highlight === "number" && highlight > 25
                ? "text-yellow-700"
                : "text-primary";
    return (
        <>
            <dt className="text-xs uppercase tracking-wide text-tertiary">{label}</dt>
            <dd className={cx("text-sm", colorClass, wide ? "sm:col-span-2" : "")}>
                {value || <span className="text-tertiary">—</span>}
            </dd>
        </>
    );
}

function FieldEdit({
    label, value, onChange, multiline, type = "text", rows = 3,
}: {
    label: string;
    value: string | number;
    onChange: (v: string) => void;
    multiline?: boolean;
    type?: string;
    rows?: number;
}) {
    const stringValue = typeof value === "number" ? String(value) : value;
    return (
        <div>
            <label className="mb-0.5 block text-xs font-medium text-tertiary">{label}</label>
            {multiline ? (
                <textarea
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    rows={rows}
                    className="w-full rounded-md border border-secondary bg-primary px-2 py-1.5 text-sm"
                />
            ) : (
                <input
                    type={type}
                    value={stringValue}
                    onChange={(e) => onChange(e.target.value)}
                    className="w-full rounded-md border border-secondary bg-primary px-2 py-1.5 text-sm"
                />
            )}
        </div>
    );
}

function FieldEditSelect({
    label, value, options, onChange,
}: {
    label: string;
    value: string | number;
    options: string[];
    onChange: (v: string) => void;
}) {
    const stringValue = typeof value === "number" ? String(value) : value;
    return (
        <div>
            <label className="mb-0.5 block text-xs font-medium text-tertiary">{label}</label>
            <select
                value={stringValue}
                onChange={(e) => onChange(e.target.value)}
                className="w-full rounded-md border border-secondary bg-primary px-2 py-1.5 text-sm"
            >
                <option value="">—</option>
                {options.map((o) => (
                    <option key={o} value={o}>{o}</option>
                ))}
            </select>
        </div>
    );
}