import { describe, expect, it } from "vitest";
import { flattenLeaves, isGroup, NAV_ITEMS, SECTION_TITLES } from "@/features/layout/nav-config";

describe("nav-config", () => {
    it("expone items raíz", () => {
        expect(NAV_ITEMS.length).toBeGreaterThan(0);
        expect(NAV_ITEMS.some(i => i.id === "ideas")).toBe(true);
        expect(NAV_ITEMS.some(i => i.id === "catalogo")).toBe(true);
    });

    it("isGroup discrimina grupos de hojas", () => {
        const grupo = NAV_ITEMS.find(i => i.id === "pruebas")!;
        const hoja = NAV_ITEMS.find(i => i.id === "ideas")!;
        expect(isGroup(grupo)).toBe(true);
        expect(isGroup(hoja)).toBe(false);
    });

    it("flattenLeaves devuelve solo hojas con href", () => {
        const leaves = flattenLeaves();
        expect(leaves.length).toBeGreaterThan(0);
        for (const leaf of leaves) {
            expect(leaf.href).toMatch(/^\//);
        }
        // Debe incluir todas las secciones de primer nivel que tienen href propio.
        const ids = leaves.map(l => l.id);
        expect(ids).toEqual(expect.arrayContaining(["dashboard", "ideas", "catalogo"]));
        // Y las hijas de los grupos también.
        expect(ids).toEqual(expect.arrayContaining(["agendas", "pipeline", "pendientes"]));
    });

    it("SECTION_TITLES cubre todas las secciones de primer nivel", () => {
        for (const item of NAV_ITEMS) {
            if (!isGroup(item)) {
                expect(SECTION_TITLES[item.href]).toBeDefined();
            }
        }
    });
});
