import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/app/query-provider";
import { AppRouter } from "@/app/router";
import { AuthProvider } from "@/lib/auth";
import "@/styles/globals.css";

console.log("%c[Sol de Nit Admin] Build version: 2024-12-colors-fixed-v3", "background: #7F56D9; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;");

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

createRoot(rootEl).render(
    <StrictMode>
        <ThemeProvider>
            <QueryProvider>
                <AuthProvider>
                    <AppRouter />
                </AuthProvider>
            </QueryProvider>
        </ThemeProvider>
    </StrictMode>,
);