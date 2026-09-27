import type { EntityKind } from "@/types/entity";
import { ideasService, agendasService, catalogosService } from "@/services/entities";
import { ideasKeys, agendasKeys, catalogosKeys } from "@/services/entities";

// Helper: dado el nombre de entidad, devuelve el service y las keys de query.
// Evita repetir el switch en cada hook/feature.

type ServiceMap = {
    [K in EntityKind]: {
        list: typeof ideasService.list | typeof agendasService.list | typeof catalogosService.list;
        detail: typeof ideasService.detail | typeof agendasService.detail | typeof catalogosService.detail;
        create: typeof ideasService.create | typeof agendasService.create | typeof catalogosService.create;
        update: typeof ideasService.update | typeof agendasService.update | typeof catalogosService.update;
        delete: typeof ideasService.delete | typeof agendasService.delete | typeof catalogosService.delete;
        keys: typeof ideasKeys | typeof agendasKeys | typeof catalogosKeys;
    };
};

export const SERVICES: ServiceMap = {
    tests: {
        list: ideasService.list,
        detail: ideasService.detail,
        create: ideasService.create,
        update: ideasService.update,
        delete: ideasService.delete,
        keys: ideasKeys,
    }, // stub: tests no es entidad CRUD propia; se accede por agenda.
    ideas: {
        list: ideasService.list,
        detail: ideasService.detail,
        create: ideasService.create,
        update: ideasService.update,
        delete: ideasService.delete,
        keys: ideasKeys,
    },
    agendas: {
        list: agendasService.list,
        detail: agendasService.detail,
        create: agendasService.create,
        update: agendasService.update,
        delete: agendasService.delete,
        keys: agendasKeys,
    },
    catalogos: {
        list: catalogosService.list,
        detail: catalogosService.detail,
        create: catalogosService.create,
        update: catalogosService.update,
        delete: catalogosService.delete,
        keys: catalogosKeys,
    },
};

export const getService = (entidad: EntityKind) => SERVICES[entidad];

/** Etiqueta singular para UI. */
export const ENTITY_SINGULAR: Record<EntityKind, string> = {
    tests: "Prueba",
    ideas: "Idea",
    agendas: "Agenda",
    catalogos: "Catálogo",
};

/** Plural para listas. */
export const ENTITY_PLURAL: Record<EntityKind, string> = {
    tests: "Pruebas",
    ideas: "Ideas",
    agendas: "Pruebas",
    catalogos: "Catálogo",
};
