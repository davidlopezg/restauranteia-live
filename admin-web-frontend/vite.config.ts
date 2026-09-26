import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    // Base path para GitHub Pages (default: / para dev local, /restauranteia-live/ en prod)
    base: process.env.VITE_BASE_PATH || "./",
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            "@": path.resolve(import.meta.dirname, "./src"),
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
