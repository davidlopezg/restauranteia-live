import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/app/query-provider";
import { AppRouter } from "@/app/router";
import { AuthProvider } from "@/lib/auth";
import "@/styles/globals.css";

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