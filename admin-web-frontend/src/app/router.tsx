import { RouterProvider as AriaRouterProvider } from "react-aria-components";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router";
import type { NavigateOptions } from "react-router";
import { Shell } from "@/app/shell";
import { HomePage } from "@/features/home/home-page";
import { PipelinePage } from "@/features/pipeline/pipeline-page";
import { ListPage } from "@/features/entities/list-page";
import { DetailPage } from "@/features/entities/detail-page";
import { NewPage } from "@/features/entities/new-page";
import { CadenciaPage } from "@/features/dashboard/cadencia-page";
import { PendientesPage } from "@/features/dashboard/pendientes-page";
import { SettingsPage } from "@/features/settings/settings-page";
import { IdeasCreativasPage } from "@/features/ia/ideas-creativas-page";
import { IdeasCientificasPage } from "@/features/ia/ideas-cientificas-page";
import { DocumentationPage } from "@/features/documentation/documentation-page";
import { PlaceholderPage } from "@/features/layout/placeholder-page";

declare module "react-aria-components" {
    interface RouterConfig {
        routerOptions: NavigateOptions;
    }
}

const RouterBridge = () => {
    const navigate = useNavigate();
    return (
        <AriaRouterProvider navigate={navigate}>
            <Routes>
                <Route path="/" element={<Shell />}>
                    <Route index element={<HomePage />} />
                    {/* Pipeline */}
                    <Route path="desarrollo" element={<PipelinePage />} />
                    {/* Entidades CRUD */}
                    <Route path="ideas" element={<ListPage entidad="ideas" />} />
                    <Route path="ideas/new" element={<NewPage entidad="ideas" />} />
                    <Route path="ideas/:id" element={<DetailPage entidad="ideas" />} />
                    <Route path="agendas" element={<ListPage entidad="agendas" />} />
                    <Route path="agendas/new" element={<NewPage entidad="agendas" />} />
                    <Route path="agendas/:id" element={<DetailPage entidad="agendas" />} />
                    <Route path="catalogos" element={<ListPage entidad="catalogos" />} />
                    <Route path="catalogos/new" element={<NewPage entidad="catalogos" />} />
                    <Route path="catalogos/:id" element={<DetailPage entidad="catalogos" />} />
                    {/* Dashboard */}
                    <Route path="cadencia" element={<CadenciaPage />} />
                    <Route path="pendientes" element={<PendientesPage />} />
                    {/* Análisis (placeholders honestos, llegan en próxima iteración) */}
                    <Route path="evaluaciones" element={<EvaluacionesPlaceholder />} />
                    <Route path="emplatado" element={<EmplatadoPlaceholder />} />
                    <Route path="vajilla" element={<VajillaPlaceholder />} />
                    {/* IA */}
                    <Route path="ideas-creativas" element={<IdeasCreativasPage />} />
                    <Route path="ideas-cientificas" element={<IdeasCientificasPage />} />
                    {/* Documentación + Settings */}
                    <Route path="documentacion" element={<DocumentationPage />} />
                    <Route path="settings" element={<SettingsPage />} />
                    <Route path="*" element={<PlaceholderPage title="404" phase="Página no encontrada." />} />
                </Route>
            </Routes>
        </AriaRouterProvider>
    );
};

const EvaluacionesPlaceholder = () => (
    <PlaceholderPage
        title="Evaluaciones de mesa"
        phase="La vista de evaluations agregada se hace en una iteración siguiente (los datos ya vienen del backend via /api/feedback)."
    />
);
const EmplatadoPlaceholder = () => (
    <PlaceholderPage
        title="Emplatado IA"
        phase="Vista de plating_proposals. Endpoint /api/catalogos/{id}/plating/generar disponible."
    />
);
const VajillaPlaceholder = () => (
    <PlaceholderPage
        title="Inventario de vajilla"
        phase="CRUD de ware. Endpoints /api/ware disponibles."
    />
);

export const AppRouter = () => (
    <BrowserRouter>
        <RouterBridge />
    </BrowserRouter>
);
