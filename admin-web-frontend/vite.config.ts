import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

// Proxy opcional a backend legacy (FastAPI) en dev, para endpoints no migrados
// (IA endpoints que dependen del agente Python). Solo se activa si
// VITE_LEGACY_BACKEND_URL está definido.
const LEGACY_BACKEND = process.env.VITE_LEGACY_BACKEND_URL;

export default defineConfig({
    // Base path para GitHub Pages (default: / para dev local, /restauranteia-live/ en prod)
    base: process.env.VITE_BASE_PATH || "./",
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
        },
    },
    server: {
        proxy: LEGACY_BACKEND
            ? {
                  "/api": {
                      target: LEGACY_BACKEND,
                      changeOrigin: true,
                  },
              }
            : undefined,
    },
    test: {
        environment: "jsdom",
        globals: true,
        setupFiles: ["./tests/setup/vitest.setup.ts"],
        css: false,
        include: ["tests/**/*.test.{ts,tsx}"],
    },
});
