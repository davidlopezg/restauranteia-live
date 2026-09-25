/**
 * Auth context para Supabase.
 *
 * Reemplaza al actual auth.py del backend (que ya tiene AUTH_ENABLED=false).
 * Usa @supabase/supabase-js directamente desde el cliente.
 *
 * API expuesta:
 *   - user: User | null
 *   - session: Session | null
 *   - loading: boolean (true mientras carga sesión inicial)
 *   - signIn(email, password)
 *   - signUp(email, password)  (si querés auto-registro)
 *   - signOut()
 *
 * Estrategia: el componente raíz envuelve la app con <AuthProvider> y
 * cualquier feature puede llamar useAuth() para acceder al usuario.
 */

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

interface AuthContextValue {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string) => Promise<{ error: string | null }>;
    signOut: () => Promise<void>;
    isConfigured: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const supabase = getSupabase();
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setLoading(false);
            return;
        }

        // Sesión inicial
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session);
            setUser(data.session?.user ?? null);
            setLoading(false);
        });

        // Cambios en tiempo real
        const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
            setSession(newSession);
            setUser(newSession?.user ?? null);
        });

        return () => {
            sub.subscription.unsubscribe();
        };
    }, [supabase]);

    const signIn = async (email: string, password: string) => {
        if (!supabase) return { error: "Supabase no configurado" };
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return { error: error?.message ?? null };
    };

    const signUp = async (email: string, password: string) => {
        if (!supabase) return { error: "Supabase no configurado" };
        const { error } = await supabase.auth.signUp({ email, password });
        return { error: error?.message ?? null };
    };

    const signOut = async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
    };

    const value: AuthContextValue = {
        user,
        session,
        loading,
        signIn,
        signUp,
        signOut,
        isConfigured: Boolean(supabase),
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
    return ctx;
}