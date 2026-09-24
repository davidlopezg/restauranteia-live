import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import type { EntityKind } from "@/types/entity";
import { ideasService } from "@/services/entities";
import { getService } from "@/features/entities/get-service";

// Hooks de mutación CRUD. Cada mutación invalida las queries de la entidad
// para que la UI se reconcilie con el backend.
//
// Ponytail: los servicios específicos (ideas/agendas/catalogos) tienen tipos
// distintos en create/update. Aquí los tratamos como `unknown` porque el
// caller (DetailPage/NewPage) construye el body correcto para cada entidad.

export const useEntityMutations = (entidad: EntityKind) => {
    const service = getService(entidad);
    const qc = useQueryClient();
    const navigate = useNavigate();

    const invalidate = () => qc.invalidateQueries({ queryKey: [service.keys.all[0]] });

    const create = useMutation<{ id: string }, Error, unknown>({
        mutationFn: body => (service.create as (b: unknown) => Promise<{ id: string }>)(body),
        onSuccess: data => {
            invalidate();
            navigate(`/${entidad}/${data.id}`);
        },
    });

    const update = useMutation<unknown, Error, { id: string; body: unknown }>({
        mutationFn: ({ id, body }) =>
            (service.update as (id: string, b: unknown) => Promise<unknown>)(id, body),
        onSuccess: (_data, vars) => {
            invalidate();
            qc.invalidateQueries({ queryKey: [service.keys.all[0], "detail", vars.id] });
        },
    });

    const remove = useMutation<{ deleted: boolean; id: string }, Error, string>({
        mutationFn: id => (service.delete as (id: string) => Promise<{ deleted: boolean; id: string }>)(id),
        onSuccess: () => {
            invalidate();
            navigate(`/${entidad}`);
        },
    });

    return { create, update, remove };
};

interface ConvertirResponse {
    already_exists: boolean;
    agenda_id: string;
    agenda_titulo: string;
}

/** Hook específico: convertir idea → agenda. Solo aplica a EntityKind = 'ideas'. */
export const useConvertirIdea = () => {
    const qc = useQueryClient();
    const navigate = useNavigate();

    return useMutation<ConvertirResponse, Error, string>({
        mutationFn: id => ideasService.convertir(id) as Promise<ConvertirResponse>,
        onSuccess: data => {
            qc.invalidateQueries({ queryKey: [getService("ideas").keys.all[0]] });
            qc.invalidateQueries({ queryKey: [getService("agendas").keys.all[0]] });
            navigate(`/agendas/${data.agenda_id}`);
        },
    });
};
