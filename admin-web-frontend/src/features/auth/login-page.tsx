import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";

// Pantalla de login. Se monta fuera del Shell (sin sidebar/topbar).
// - Si Supabase no está configurado (faltan env vars en build), muestra
//   un error claro en vez de fallar silenciosamente.
// - Si el usuario ya tiene sesión, redirige a "/".
// - Sign-up opcional (mismo form, switch email/password).

export const LoginPage = () => {
    const { user, loading, signIn, signUp, isConfigured } = useAuth();
    const navigate = useNavigate();
    const [mode, setMode] = useState<"signin" | "signup">("signin");
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    if (!loading && user) {
        navigate("/", { replace: true });
    }

    const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
        ev.preventDefault();
        setErr(null);
        setSubmitting(true);
        const fd = new FormData(ev.currentTarget);
        const email = String(fd.get("email") ?? "").trim();
        const password = String(fd.get("password") ?? "");
        const { error } = mode === "signin" ? await signIn(email, password) : await signUp(email, password);
        setSubmitting(false);
        if (error) {
            setErr(error);
            return;
        }
        if (mode === "signup" && !error) {
            setErr("Cuenta creada. Revisá tu email para confirmar y luego iniciá sesión.");
            setMode("signin");
            return;
        }
        navigate("/", { replace: true });
    };

    return (
        <div className="flex min-h-dvh items-center justify-center bg-primary p-4">
            <form
                onSubmit={handleSubmit}
                className="w-full max-w-sm space-y-3 rounded-lg border border-secondary bg-primary p-6 shadow-sm"
                data-testid="login-form"
            >
                <h1 className="text-lg font-semibold text-primary">Sol de Nit — Admin</h1>
                <p className="text-xs text-tertiary">
                    {mode === "signin" ? "Iniciá sesión para continuar." : "Crear cuenta nueva."}
                </p>

                {!isConfigured && (
                    <p className="rounded-md bg-error-secondary px-3 py-2 text-xs text-error-primary" data-testid="login-not-configured">
                        Supabase no está configurado. Definí <code>VITE_SUPABASE_URL</code> y{" "}
                        <code>VITE_SUPABASE_ANON_KEY</code> en el build.
                    </p>
                )}

                {err && (
                    <p className="rounded-md bg-error-secondary px-3 py-2 text-xs text-error-primary" data-testid="login-error">
                        {err}
                    </p>
                )}

                <div>
                    <label className="block text-xs text-tertiary">Email</label>
                    <input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        className="block w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-xs text-tertiary">Contraseña</label>
                    <input
                        name="password"
                        type="password"
                        required
                        minLength={6}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        className="block w-full rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitting || !isConfigured}
                    style={{ backgroundColor: '#7F56D9' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#6941C6')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#7F56D9')}
                    className="w-full rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    data-testid="login-submit"
                >
                    {submitting ? "…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
                </button>

                <button
                    type="button"
                    onClick={() => {
                        setMode(m => (m === "signin" ? "signup" : "signin"));
                        setErr(null);
                    }}
                    className="w-full text-xs text-tertiary underline hover:text-primary"
                >
                    {mode === "signin" ? "¿No tenés cuenta? Crear una" : "¿Ya tenés cuenta? Iniciar sesión"}
                </button>
            </form>
        </div>
    );
};
