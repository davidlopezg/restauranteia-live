import { useEffect, useState } from "react";

// Ponytail: el starter ya tiene use-breakpoint, pero aquí solo necesito saber
// si estamos en móvil para mostrar/ocultar el drawer. Lo hago con
// window.matchMedia directamente — menos código que importar el hook del starter.

const MOBILE_QUERY = "(max-width: 767px)";

export const useIsMobile = (): boolean => {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window === "undefined" ? false : window.matchMedia(MOBILE_QUERY).matches,
    );

    useEffect(() => {
        const mq = window.matchMedia(MOBILE_QUERY);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    return isMobile;
};
