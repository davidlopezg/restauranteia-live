import { useState } from "react";
import { Outlet } from "react-router";
import { AppSidebar, SidebarToggle } from "@/features/layout/app-sidebar";
import { AppTopbar } from "@/features/layout/app-topbar";
import { useIsMobile } from "@/features/layout/use-responsive-sidebar";

// Shell de la app: sidebar + topbar + outlet.
//
// En móvil (< md) el sidebar es un drawer: oculto por defecto, se abre con el
// hamburger del topbar y se cierra con el backdrop o la X del sidebar.
// En ≥ md el sidebar es siempre visible.

export const Shell = () => {
    const isMobile = useIsMobile();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const openSearch = () => {
        // Placeholder. El overlay Cmd+K real llega en Fase 6.
        window.alert("Búsqueda global: pendiente de Fase 6.");
    };

    return (
        <div className="flex min-h-dvh bg-primary">
            <AppSidebar
                open={!isMobile || sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex h-14 items-center border-b border-secondary bg-primary px-4 md:hidden">
                    <SidebarToggle onClick={() => setSidebarOpen(true)} />
                </div>
                <AppTopbar onOpenSearch={openSearch} />
                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
