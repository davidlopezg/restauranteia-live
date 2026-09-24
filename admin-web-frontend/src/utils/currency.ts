// Utilidades de moneda. Coincide con admin-web/frontend/js/ui.js:fmtPrice.

export function fmtPrice(n: number | null | undefined): string {
    if (n == null) return "—";
    return Number(n).toLocaleString("es-ES", {
        style: "currency",
        currency: "EUR",
    });
}
