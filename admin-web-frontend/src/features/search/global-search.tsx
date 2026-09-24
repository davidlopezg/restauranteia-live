import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { SearchLg, X } from "@untitledui/icons";
import { ideasService, agendasService, catalogosService } from "@/services/entities";

// Overlay de búsqueda global: Cmd+K (Mac) o Ctrl+K (otros).
// Busca en ideas, agendas y catálogos en paralelo.

interface SearchHit {
    id: string;
    titulo: string;
    precio?: number | null;
}

export const GlobalSearch = () => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<{ ideas: SearchHit[]; agendas: SearchHit[]; catalogos: SearchHit[] }>({ ideas: [], agendas: [], catalogos: [] });
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState(0);
    const navigate = useNavigate();

    // Toggle con Cmd+K / Ctrl+K
    useEffect(() => {
        const handler = (ev: KeyboardEvent) => {
            if ((ev.metaKey || ev.ctrlKey) && ev.key === "k") {
                ev.preventDefault();
                setOpen(o => !o);
            } else if (ev.key === "Escape" && open) {
                setOpen(false);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open]);

    // Debounced search
    useEffect(() => {
        if (query.trim().length < 2) {
            setResults({ ideas: [], agendas: [], catalogos: [] });
            return;
        }
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const [i, a, c] = await Promise.all([
                    ideasService.list({ search: query, limit: 5 }),
                    agendasService.list({ search: query, limit: 5 }),
                    catalogosService.list({ search: query, limit: 5 }),
                ]);
                setResults({
                    ideas: i.items as SearchHit[],
                    agendas: a.items as SearchHit[],
                    catalogos: c.items as SearchHit[],
                });
                setSelected(0);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => clearTimeout(t);
    }, [query]);

    const flatResults: Array<{ hit: SearchHit; href: string; group: string }> = [
        ...results.ideas.map(h => ({ hit: h, href: `/ideas/${h.id}`, group: "Ideas" })),
        ...results.agendas.map(h => ({ hit: h, href: `/agendas/${h.id}`, group: "Agenda" })),
        ...results.catalogos.map(h => ({ hit: h, href: `/catalogos/${h.id}`, group: "Catálogo" })),
    ];

    const openResult = (idx: number) => {
        const r = flatResults[idx];
        if (!r) return;
        setOpen(false);
        setQuery("");
        navigate(r.href);
    };

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-2 rounded-md border border-secondary bg-primary px-3 py-1.5 text-sm text-tertiary hover:bg-secondary"
                aria-label="Buscar (Cmd+K)"
                data-testid="global-search-trigger"
            >
                <SearchLg className="size-4" />
                <span className="hidden sm:inline">Buscar</span>
                <kbd className="ml-2 hidden rounded bg-secondary px-1.5 py-0.5 text-xs text-tertiary md:inline">⌘K</kbd>
            </button>
        );
    }

    return (
        <div
            className="fixed inset-0 z-50 flex justify-center bg-overlay p-4 pt-24"
            onClick={() => setOpen(false)}
            role="dialog"
        >
            <div onClick={e => e.stopPropagation()} className="w-full max-w-xl rounded-lg bg-primary shadow-xl">
                <div className="flex items-center gap-2 border-b border-secondary px-3 py-2">
                    <SearchLg className="size-5 text-tertiary" />
                    <input
                        autoFocus
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={ev => {
                            if (ev.key === "ArrowDown") setSelected(s => Math.min(s + 1, flatResults.length - 1));
                            if (ev.key === "ArrowUp") setSelected(s => Math.max(s - 1, 0));
                            if (ev.key === "Enter") openResult(selected);
                        }}
                        placeholder="Buscar en ideas, agenda, catálogo…"
                        className="flex-1 bg-transparent text-sm outline-none placeholder:text-tertiary"
                    />
                    <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 hover:bg-secondary">
                        <X className="size-4" />
                    </button>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                    {loading && <p className="p-3 text-xs text-tertiary">Buscando…</p>}
                    {!loading && query.trim().length < 2 && (
                        <p className="p-3 text-xs text-tertiary">Escribe al menos 2 caracteres.</p>
                    )}
                    {!loading && flatResults.length === 0 && query.trim().length >= 2 && (
                        <p className="p-3 text-xs text-tertiary">Sin resultados para "{query}".</p>
                    )}
                    {!loading && flatResults.length > 0 && (
                        <ul>
                            {flatResults.map((r, idx) => (
                                <li
                                    key={`${r.group}-${r.hit.id}`}
                                    onClick={() => openResult(idx)}
                                    onMouseEnter={() => setSelected(idx)}
                                    className={`flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm ${idx === selected ? "bg-brand-secondary text-brand-primary" : "text-primary hover:bg-secondary"}`}
                                    data-testid={`search-result-${idx}`}
                                >
                                    <div>
                                        <span className="font-medium">{r.hit.titulo ?? "(sin título)"}</span>
                                        <span className="ml-2 text-xs text-tertiary">{r.group}</span>
                                    </div>
                                    {r.hit.precio != null && <span className="text-xs text-tertiary">{r.hit.precio}€</span>}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="border-t border-secondary px-3 py-1 text-xs text-tertiary">
                    ↑↓ navegar · Enter abrir · Esc cerrar
                </div>
            </div>
        </div>
    );
};
