/**
 * Fachada unificada plating/ware — Supabase / Legacy.
 */

import { env } from "@/config/env";
import {
    platingSupabase, wareSupabase,
    platingLegacy, wareLegacy,
    type PlatingProposal, type PlatingCreate, type PlatingUpdate,
    type Ware, type WareCreate, type WareUpdate,
    platingKeys, wareKeys,
} from "@/services/plating.supabase";

export type { PlatingProposal, PlatingCreate, PlatingUpdate, Ware, WareCreate, WareUpdate };
export { platingKeys, wareKeys };

export const platingService = {
    list: (catalogoId: string, estado?: string): Promise<PlatingProposal[]> =>
        env.isSupabaseConfigured
            ? platingSupabase.list(catalogoId, estado)
            : platingLegacy.list(catalogoId, estado),

    get: (platingId: string): Promise<PlatingProposal> =>
        env.isSupabaseConfigured
            ? platingSupabase.get(platingId)
            : Promise.reject(new Error("get no disponible en legacy")),

    create: (body: PlatingCreate): Promise<PlatingProposal> =>
        env.isSupabaseConfigured ? platingSupabase.create(body) : Promise.reject(new Error("create plating no disponible en legacy (IA)")),

    update: (platingId: string, body: PlatingUpdate): Promise<PlatingProposal> =>
        env.isSupabaseConfigured ? platingSupabase.update(platingId, body) : platingLegacy.update(platingId, body),

    delete: (platingId: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? platingSupabase.delete(platingId) : platingLegacy.delete(platingId),
};

export const wareService = {
    list: (tipo?: string, disponible?: boolean): Promise<Ware[]> =>
        env.isSupabaseConfigured ? wareSupabase.list(tipo, disponible) : wareLegacy.list(tipo, disponible),

    tipos: (): Promise<string[]> =>
        env.isSupabaseConfigured ? wareSupabase.tipos() : wareLegacy.tipos(),

    get: (wareId: string): Promise<Ware> =>
        env.isSupabaseConfigured ? wareSupabase.get(wareId) : wareLegacy.get(wareId),

    create: (body: WareCreate): Promise<Ware> =>
        env.isSupabaseConfigured ? wareSupabase.create(body) : wareLegacy.create(body),

    update: (wareId: string, body: WareUpdate): Promise<Ware> =>
        env.isSupabaseConfigured ? wareSupabase.update(wareId, body) : wareLegacy.update(wareId, body),

    delete: (wareId: string): Promise<{ deleted: boolean; id: string }> =>
        env.isSupabaseConfigured ? wareSupabase.delete(wareId) : wareLegacy.delete(wareId),
};