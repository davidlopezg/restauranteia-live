import { useState, type FormEvent } from "react";
import type { EntityKind } from "@/types/entity";

// EditForm genérico. Muestra los campos editables por entidad con sus tipos.
// Submit hace PATCH al backend vía useEntityMutations (pasado como prop).

// Definición declarativa de campos editables por entidad.
// Coincide con admin-web/backend/models.py.
interface FieldDef {
    name: string;
    label: string;
    type: "text" | "textarea" | "number" | "date" | "datetime-local";
    /** Aplica a text/textarea: array separado por comas → string[] */
    array?: boolean;
}

const FIELDS: Record<EntityKind, FieldDef[]> = {
    ideas: [
        { name: "titulo", label: "Título", type: "text" },
        { name: "descripcion", label: "Descripción", type: "textarea" },
        { name: "categorias", label: "Categorías (coma)", type: "text", array: true },
        { name: "puntuacion", label: "Puntuación", type: "text" },
        { name: "estado_idea", label: "Estado", type: "text" },
        { name: "fecha_creacion", label: "Fecha creación", type: "datetime-local" },
    ],
    agendas: [
        { name: "titulo", label: "Título", type: "text" },
        { name: "fecha_creacion", label: "Fecha creación", type: "date" },
        { name: "fecha", label: "Fecha", type: "date" },
        { name: "etiquetas", label: "Etiquetas (coma)", type: "text", array: true },
    ],
    catalogos: [
        { name: "titulo", label: "Título", type: "text" },
        { name: "orden", label: "Orden", type: "number" },
        { name: "precio", label: "Precio (€)", type: "number" },
        { name: "anio", label: "Año", type: "text" },
        { name: "estado", label: "Estado", type: "text" },
        { name: "categorias", label: "Categorías (coma)", type: "text", array: true },
        { name: "ingredientes", label: "Ingredientes", type: "textarea" },
    ],
};

interface EntityEditFormProps {
    entidad: EntityKind;
    /** Item a editar (para edición) o {} (para creación). Solo se leen las keys conocidas. */
    item: Record<string, unknown>;
    onSubmit: (body: Record<string, unknown>) => void;
    onCancel: () => void;
    isSubmitting?: boolean;
}

export const EntityEditForm = ({ entidad, item, onSubmit, onCancel, isSubmitting }: EntityEditFormProps) => {
    const fields = FIELDS[entidad];
    const [values, setValues] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        for (const f of fields) {
            const v = item[f.name];
            if (Array.isArray(v)) init[f.name] = (v as unknown[]).join(", ");
            else if (v != null) init[f.name] = String(v);
            else init[f.name] = "";
        }
        return init;
    });

    const handleSubmit = (ev: FormEvent) => {
        ev.preventDefault();
        const body: Record<string, unknown> = {};
        for (const f of fields) {
            const raw = values[f.name] ?? "";
            if (raw === "" && f.name !== "titulo") continue; // no enviar vacíos
            if (f.array) {
                const arr = raw.split(",").map(s => s.trim()).filter(Boolean);
                if (arr.length > 0) body[f.name] = arr;
            } else if (f.type === "number") {
                const n = Number(raw);
                if (!Number.isNaN(n)) body[f.name] = n;
            } else if (f.type === "datetime-local" && raw) {
                body[f.name] = new Date(raw).toISOString();
            } else if (f.type === "date" && raw) {
                body[f.name] = raw;
            } else {
                body[f.name] = raw;
            }
        }
        onSubmit(body);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-3" data-testid={`edit-form-${entidad}`}>
            {fields.map(f => (
                <div key={f.name} className="grid grid-cols-1 gap-1">
                    <label htmlFor={`f-${f.name}`} className="text-xs font-medium text-tertiary">
                        {f.label}
                    </label>
                    {f.type === "textarea" ? (
                        <textarea
                            id={`f-${f.name}`}
                            name={f.name}
                            value={values[f.name] ?? ""}
                            onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                            rows={3}
                            className="rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        />
                    ) : (
                        <input
                            id={`f-${f.name}`}
                            name={f.name}
                            type={f.type}
                            value={values[f.name] ?? ""}
                            onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}
                            step={f.type === "number" ? "0.01" : undefined}
                            className="rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        />
                    )}
                </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50"
                >
                    {isSubmitting ? "Guardando…" : "Guardar"}
                </button>
            </div>
        </form>
    );
};
