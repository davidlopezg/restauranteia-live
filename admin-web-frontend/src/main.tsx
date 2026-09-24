import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/providers/theme-provider";
import { QueryProvider } from "@/app/query-provider";
import { AppRouter } from "@/app/router";
import "@/styles/globals.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root");

createRoot(rootEl).render(
    <StrictMode>
        <ThemeProvider>
            <QueryProvider>
                <AppRouter />
            </QueryProvider>
        </ThemeProvider>
    </StrictMode>,
);
