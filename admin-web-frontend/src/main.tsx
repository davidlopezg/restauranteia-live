import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/app/query-provider";
import { AppRouter } from "@/app/router";
import { AuthProvider } from "@/lib/auth";
import "@/styles/globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

const BUILD_SHA = (import.meta.env.VITE_GIT_SHA as string | undefined) ?? "local";

// Banner rojo de diagnóstico en la parte SUPERIOR de la app.
// Si lo ves, el deploy está sincronizado. Si NO lo ves, tu navegador
// tiene caché viejo y hay que vaciarla.
const BuildBanner = ({ sha }: { sha: string }) => (
    <div
        style={{
            background: "#dc2626",
            color: "white",
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: 600,
            textAlign: "center",
            fontFamily: "monospace",
            position: "sticky",
            top: 0,
            zIndex: 9999,
        }}
        data-testid="build-banner"
    >
        🟥 BUILD: {sha.slice(0, 7)} — si ves este banner, tu navegador tiene la versión nueva
    </div>
);

createRoot(rootEl).render(
    <StrictMode>
        <BuildBanner sha={BUILD_SHA} />
        <ThemeProvider>
            <QueryProvider>
                <AuthProvider>
                    <AppRouter />
                </AuthProvider>
            </QueryProvider>
        </ThemeProvider>
    </StrictMode>,
);