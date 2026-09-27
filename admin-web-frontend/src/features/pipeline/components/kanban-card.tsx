import { useDraggable } from "@dnd-kit/react";
import { useCallback } from "react";
import { useNavigate } from "react-router";
import { cx } from "@/utils/cx";
import { ESTADO_LABELS, type AgendaPipeline, type EstadoDesarrollo } from "@/types/pipeline";
import { fmtDate } from "@/utils/date";
import { EstadoSelector } from "@/features/pipeline/components/estado-selector";

interface KanbanCardProps {
    card: AgendaPipeline;
    onSelectEstado: (destino: EstadoDesarrollo) => void;
    disabled?: boolean;
}

// Card arrastrable de una agenda en el Kanban.
// useDraggable expone `ref` (la adjuntamos al div), `handleRef` (zona que inicia el
// drag) e `isDragging` (true durante el drag).
//
// IMPORTANTE: el cuerpo principal de la card es un <button> (para abrir el detalle).
// El PointerSensor descarta la activación si el pointerdown cae sobre un elemento
// interactivo que no sea el propio elemento/handle del draggable. Al declarar TODO
// el div como handle (ref + handleRef sobre el mismo nodo), el sensor permite
// arrastrar desde cualquier punto interior, incluido el botón. Sin esto el drag
// sólo funciona en el borde de la card: ese es el bug real.
//
// touch-manipulation + select-none: permite el scroll de la página con el dedo y
// evita seleccionar texto durante el long-press. NO usamos touch-action: none
// (eso es para PointerSensor sin delay: mataría el scroll sobre la card).

export const KanbanCard = ({ card, onSelectEstado, disabled }: KanbanCardProps) => {
    const navigate = useNavigate();
    const { ref, handleRef, isDragging } = useDraggable({
        id: `card-${card.id}`,
        type: "pipeline-card",
        data: { agendaId: card.id, estadoActual: card.estado_desarrollo },
    });

    // `ref` (elemento arrastrado) y `handleRef` (zona que inicia el drag) apuntan
    // al mismo nodo: la card entera es su propio handle.
    const setRefs = useCallback(
        (el: HTMLDivElement | null) => {
            ref(el);
            handleRef(el);
        },
        [ref, handleRef],
    );

    return (
        <div
            ref={setRefs}
            data-agenda-id={card.id}
            data-testid={`card-${card.id}`}
            className={cx(
                "touch-manipulation select-none rounded-md border border-secondary bg-primary p-3 shadow-sm transition-shadow",
                "hover:shadow-md",
                isDragging && "cursor-grabbing opacity-40 shadow-lg",
                !isDragging && "cursor-grab",
            )}
        >
            <button
                type="button"
                onClick={() => navigate(`/agendas/${card.id}`)}
                className="block w-full text-left"
                data-testid={`card-link-${card.id}`}
            >
                <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-primary line-clamp-2">
                        {card.titulo || "(sin título)"}
                    </h3>
                    {card.estado_desarrollo && (
                        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs text-tertiary">
                            {ESTADO_LABELS[card.estado_desarrollo] ?? card.estado_desarrollo}
                        </span>
                    )}
                </div>

                {card.objetivo && (
                    <p className="mt-1 text-xs text-tertiary line-clamp-2">{card.objetivo}</p>
                )}

                <div className="mt-2 flex items-center gap-3 text-xs text-tertiary">
                    {card.fecha && <span>{fmtDate(card.fecha)}</span>}
                    {Boolean(card.receta_final) && (
                        <span className="rounded-full bg-success-secondary px-1.5 py-0.5 text-success-primary">
                            ✓ receta
                        </span>
                    )}
                </div>
            </button>

            <div
                className="mt-2 border-t border-secondary pt-2"
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
            >
                <EstadoSelector
                    estadoActual={card.estado_desarrollo}
                    onChange={onSelectEstado}
                    disabled={disabled}
                />
            </div>
        </div>
    );
};
