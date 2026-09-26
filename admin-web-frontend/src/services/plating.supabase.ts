/**
 * Servicios de plating_proposals y ware desde Supabase.
 *
 * Plating:
 *   - list: PostgREST WHERE catalogo_id [+ estado]
 *   - get: PostgREST
 *   - create: RPC (auto-fill orden)
 *   - update: PostgREST
 *   - delete: PostgREST
 *
 * Ware (vajilla):
 *   - Todo PostgREST (sin logica especial)
 */

import { getDbClient } from "@/lib/supabase";
import { callRpc } from "@/lib/rpc";
import { httpClient } from "@/services/http-client";

export interface PlatingProposal {
    id: string;
    catalogo_id: string;
    orden: number;
    nombre: string | null;
    descripcion: string | null;
    vajilla_sugerida: string | null;
    razonamiento: string | null;
    contexto_usado: string | null;
    modelo_usado: string | null;
    estado: string;
    created_at?: string;
    updated_at?: string;
}

export interface PlatingCreate {
    catalogo_id: string;
    nombre?: string;
    descripcion?: string;
    vajilla_sugerida?: string;
    razonamiento?: string;
    contexto_usado?: string;
    modelo_usado?: string;
    estado?: string;
}

export type PlatingUpdate = Partial<Omit<PlatingCreate, "catalogo_id">>;

export interface Ware {
    id: string;
    nombre: string;
    tipo: string | null;
    marca: string | null;
    modelo: string | null;
    material: string | null;
    color: string | null;
    forma: string | null;
    tamano: string | null;
    descripcion: string | null;
    disponibilidad: boolean;
    created_at?: string;
    updated_at?: string;
}

export interface WareCreate {
    nombre: string;
    tipo?: string;
    marca?: string;
    modelo?: string;
    material?: string;
    color?: string;
    forma?: string;
    tamano?: string;
    descripcion?: string;
    disponibilidad?: boolean;
}

export type WareUpdate = Partial<WareCreate>;

// === PLATING ===

export const platingKeys = {
    forCatalogo: (catalogoId: string, estado?: string) => ["plating", catalogoId, estado ?? "all"] as const,
};

export const platingSupabase = {
    async list(catalogoId: string, estado?: string): Promise<PlatingProposal[]> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        let q = supabase.from("plating_proposals").select("*").eq("catalogo_id", catalogoId);
        if (estado) q = q.eq("estado", estado);
        q = q.order("orden", { ascending: true });
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []) as PlatingProposal[];
    },

    async get(platingId: string): Promise<PlatingProposal> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("plating_proposals")
            .select("*")
            .eq("id", platingId)
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Plating no encontrado");
        return data as PlatingProposal;
    },

    async create(body: PlatingCreate): Promise<PlatingProposal> {
        // RPC para auto-fill de orden
        return callRpc<PlatingProposal>("create_plating_proposal", { p_payload: body });
    },

    async update(platingId: string, body: PlatingUpdate): Promise<PlatingProposal> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("plating_proposals")
            .update(body)
            .eq("id", platingId)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Plating no encontrado");
        return data as PlatingProposal;
    },

    async delete(platingId: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("plating_proposals").delete().eq("id", platingId);
        if (error) throw new Error(error.message);
        return { deleted: true, id: platingId };
    },
};

// === WARE ===

export const wareKeys = {
    list: (params: object) => ["ware", params] as const,
    tipos: () => ["ware", "tipos"] as const,
};

export const wareSupabase = {
    async list(tipo?: string, disponible?: boolean): Promise<Ware[]> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        let q = supabase.from("ware").select("*");
        if (tipo) q = q.eq("tipo", tipo);
        if (disponible !== undefined) q = q.eq("disponibilidad", disponible);
        q = q.order("tipo", { ascending: true }).order("nombre", { ascending: true });
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []) as Ware[];
    },

    async tipos(): Promise<string[]> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase.from("ware").select("tipo").not("tipo", "is", null);
        if (error) throw new Error(error.message);
        const set = new Set<string>();
        for (const row of ((data ?? []) as unknown as Array<{ tipo: string | null }>)) {
            if (row.tipo) set.add(row.tipo);
        }
        return Array.from(set).sort();
    },

    async get(wareId: string): Promise<Ware> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase.from("ware").select("*").eq("id", wareId).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Pieza no encontrada");
        return data as Ware;
    },

    async create(body: WareCreate): Promise<Ware> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase.from("ware").insert(body).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return data as Ware;
    },

    async update(wareId: string, body: WareUpdate): Promise<Ware> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { data, error } = await supabase
            .from("ware")
            .update(body)
            .eq("id", wareId)
            .select("*")
            .maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) throw new Error("Pieza no encontrada");
        return data as Ware;
    },

    async delete(wareId: string): Promise<{ deleted: boolean; id: string }> {
        const supabase = getDbClient();
        if (!supabase) throw new Error("Supabase no configurado");
        const { error } = await supabase.from("ware").delete().eq("id", wareId);
        if (error) throw new Error(error.message);
        return { deleted: true, id: wareId };
    },
};

// === Legacy fallback ===

export const platingLegacy = {
    list: (catalogoId: string, estado?: string) => {
        const qs = estado ? `?estado=${encodeURIComponent(estado)}` : "";
        return httpClient.get<PlatingProposal[]>(`/api/catalogos/${catalogoId}/plating${qs}`);
    },
    update: (platingId: string, body: PlatingUpdate) =>
        httpClient.patch<PlatingProposal>(`/api/plating/${platingId}`, body),
    delete: (platingId: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/plating/${platingId}`),
};

export const wareLegacy = {
    list: (tipo?: string, disponible?: boolean) => {
        const params = new URLSearchParams();
        if (tipo) params.set("tipo", tipo);
        if (disponible !== undefined) params.set("disponible", String(disponible));
        const qs = params.toString();
        return httpClient.get<Ware[]>(`/api/ware${qs ? `?${qs}` : ""}`);
    },
    tipos: () => httpClient.get<{ tipos: string[] }>("/api/ware/tipos").then((r) => r.tipos),
    get: (wareId: string) => httpClient.get<Ware>(`/api/ware/${wareId}`),
    create: (body: WareCreate) => httpClient.post<Ware>("/api/ware", body),
    update: (wareId: string, body: WareUpdate) => httpClient.patch<Ware>(`/api/ware/${wareId}`, body),
    delete: (wareId: string) =>
        httpClient.delete<{ deleted: boolean; id: string }>(`/api/ware/${wareId}`),
};