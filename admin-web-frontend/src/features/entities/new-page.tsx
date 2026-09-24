import { useNavigate } from "react-router";
import type { EntityKind } from "@/types/entity";
import { useEntityMutations } from "@/features/entities/hooks/use-entity-mutations";
import { EntityEditForm } from "@/features/entities/components/entity-edit-form";
import { ENTITY_SINGULAR } from "@/features/entities/get-service";

// NewPage: usa EntityEditForm con un item vacío inicial.
// Solo permite crear con `titulo`; el backend acepta el resto opcional.

interface NewPageProps {
    entidad: EntityKind;
}

export const NewPage = ({ entidad }: NewPageProps) => {
    const navigate = useNavigate();
    const mutations = useEntityMutations(entidad);

    // Item vacío con solo el id (fake) y titulo (vacío).
    const emptyItem: Record<string, unknown> = {
        id: "",
        titulo: "",
    };

    return (
        <div className="mx-auto max-w-2xl space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">
                    Nuevo {ENTITY_SINGULAR[entidad].toLowerCase()}
                </h1>
                <p className="text-sm text-tertiary">
                    El título es obligatorio. El resto se puede completar después.
                </p>
            </header>

            <EntityEditForm
                entidad={entidad}
                item={emptyItem}
                onSubmit={body => {
                    mutations.create.mutate(body, {
                        onError: () => {
                            /* el error se muestra abajo */
                        },
                    });
                }}
                onCancel={() => navigate(`/${entidad}`)}
                isSubmitting={mutations.create.isPending}
            />

            {mutations.create.isError && (
                <p className="text-sm text-error-primary">
                    Error: {(mutations.create.error as Error).message}
                </p>
            )}
        </div>
    );
};
