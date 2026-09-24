import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ideasService } from "@/services/entities";
import { iaKeys, iaService } from "@/services/ia";
import type { IaIdea } from "@/types/ia";

// Vista /ideas-creativas: generar 10 ideas → seleccionar → aplicar método → guardar.

export const IdeasCreativasPage = () => {
    const navigate = useNavigate();
    const [peticion, setPeticion] = useState("");
    const [ideas, setIdeas] = useState<IaIdea[]>([]);
    const [seleccionada, setSeleccionada] = useState<IaIdea | null>(null);
    const [metodo, setMetodo] = useState("");
    const [resultado, setResultado] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const { data: status } = useQuery({ queryKey: iaKeys.status(), queryFn: () => iaService.status() });
    const { data: metodosData } = useQuery({ queryKey: iaKeys.metodos(), queryFn: () => iaService.metodos() });
    const metodos = metodosData?.metodos ?? [];

    const generar = useMutation({
        mutationFn: () => iaService.generarIdeas({ peticion, n: 10 }),
        onSuccess: data => {
            setIdeas(data.ideas);
            setError(null);
            setSeleccionada(null);
            setResultado(null);
        },
        onError: (e: Error) => setError(e.message),
    });

    const aplicar = useMutation({
        mutationFn: () => iaService.aplicarMetodo({ idea: seleccionada!, metodo, peticion_original: peticion }),
        onSuccess: data => setResultado(data.resultado),
        onError: (e: Error) => setError(e.message),
    });

    const guardar = useMutation({
        mutationFn: () => ideasService.create({ titulo: seleccionada!.titulo, descripcion: resultado ?? seleccionada!.titulo }),
        onSuccess: data => navigate(`/ideas/${data.id}`),
        onError: (e: Error) => setError(e.message),
    });

    if (!status?.configured) {
        return (
            <div className="mx-auto max-w-2xl rounded-lg border border-warning-primary bg-warning-secondary p-6">
                <h2 className="text-base font-semibold text-primary">⚠️ IA no configurada</h2>
                <p className="mt-2 text-sm text-secondary">
                    Ve a <a href="#/settings" className="text-brand-primary underline">Configuración → MiniMax</a> y añade tu API key.
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <header>
                <h1 className="text-lg font-semibold text-primary">💡 Ideas Creativas</h1>
                <p className="text-sm text-tertiary">El Chef Creativo genera 10 ideas con métodos elBulli.</p>
            </header>

            <section className="rounded-lg border border-secondary bg-primary p-4">
                <h2 className="text-sm font-semibold text-primary">1. Generar 10 ideas</h2>
                <form
                    onSubmit={ev => {
                        ev.preventDefault();
                        if (peticion.trim()) generar.mutate();
                    }}
                    className="mt-2 flex gap-2"
                >
                    <input
                        type="text"
                        value={peticion}
                        onChange={e => setPeticion(e.target.value)}
                        placeholder='ej: "pizzas de otoño con calabaza"'
                        className="flex-1 rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        required
                    />
                    <button type="submit" disabled={generar.isPending} className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50">
                        {generar.isPending ? "Generando…" : "✨ Generar 10 ideas"}
                    </button>
                </form>
                {metodos.length > 0 && (
                    <p className="mt-2 text-xs text-tertiary">Métodos: {metodos.slice(0, 8).join(", ")}{metodos.length > 8 ? "…" : ""}</p>
                )}
                {error && <p className="mt-2 text-xs text-error-primary">{error}</p>}
            </section>

            {ideas.length > 0 && (
                <section className="rounded-lg border border-secondary bg-primary p-4">
                    <h2 className="text-sm font-semibold text-primary">2. Selecciona una idea</h2>
                    <ul className="mt-2 space-y-1">
                        {ideas.map((idea, idx) => (
                            <li
                                key={idx}
                                onClick={() => { setSeleccionada(idea); setResultado(null); }}
                                className={`cursor-pointer rounded-md border p-2 text-sm ${seleccionada === idea ? "border-brand-primary bg-brand-secondary" : "border-secondary hover:bg-secondary"}`}
                            >
                                <strong>{idea.titulo}</strong>
                                {idea.tipo && <span className="ml-2 text-xs text-tertiary">({idea.tipo})</span>}
                                {idea.razon && <div className="text-xs text-secondary">{idea.razon}</div>}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {seleccionada && (
                <section className="rounded-lg border border-secondary bg-primary p-4">
                    <h2 className="text-sm font-semibold text-primary">3. Aplicar método</h2>
                    <div className="mt-2 flex gap-2">
                        <select
                            value={metodo}
                            onChange={e => setMetodo(e.target.value)}
                            className="flex-1 rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm"
                        >
                            <option value="">— elige método —</option>
                            {metodos.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <button type="button" onClick={() => aplicar.mutate()} disabled={!metodo || aplicar.isPending} className="rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50">
                            {aplicar.isPending ? "Aplicando…" : "Aplicar"}
                        </button>
                    </div>
                    {resultado && (
                        <div className="mt-3">
                            <h3 className="text-xs font-semibold uppercase text-tertiary">Resultado</h3>
                            <pre className="mt-1 whitespace-pre-wrap rounded-md bg-secondary p-3 text-xs text-primary">
                                {resultado}
                            </pre>
                            <button type="button" onClick={() => guardar.mutate()} disabled={guardar.isPending} className="mt-3 rounded-md bg-brand-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-primary_hover disabled:opacity-50">
                                {guardar.isPending ? "Guardando…" : "💾 Guardar como Idea"}
                            </button>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};
