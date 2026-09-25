/**
 * Wrapper para llamar a las RPCs de Supabase (PostgreSQL functions).
 *
 * Cuando una lectura no se puede resolver con PostgREST puro (joins
 * complejos, agregaciones, lógica de negocio), usamos un RPC.
 */

import { getSupabase } from "./supabase";

export interface RpcOptions {
    /** Si true, lanza error cuando la RPC devuelve null. Default true. */
    throwOnNull?: boolean;
}

export async function callRpc<T = unknown>(
    fnName: string,
    args: Record<string, unknown> = {},
    options: RpcOptions = {},
): Promise<T> {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase no configurado");
    const { data, error } = await supabase.rpc(fnName, args);
    if (error) throw new Error(`RPC ${fnName} failed: ${error.message}`);
    if (data === null && options.throwOnNull !== false) {
        throw new Error(`RPC ${fnName} devolvió null`);
    }
    return data as T;
}