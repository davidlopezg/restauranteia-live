import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

// Ponytail: proxy solo para /api. El resto sale tal cual (rutas SPA).
// Cambiar VITE_API_TARGET en .env si el backend está en otro host/puerto.
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:8765";

export default defineConfig({
    // Rutas relativas en el index.html generado para que el bundle funcione
    // tanto desde http://localhost:5173 (Vite dev) como desde http://127.0.0.1:8765
    // (FastAPI sirviendo dist/).
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    server: {
        proxy: {
            "/api": {
                target: API_TARGET,
                changeOrigin: true,
            },
        },
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup/vitest.setup.ts"],
        css: false,
        include: ["tests/**/*.test.{ts,tsx}"],
    },
});
