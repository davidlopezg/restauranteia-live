import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IaStatusGate } from "@/features/ia/components/ia-status-gate";
import { EdgeFunctionError } from "@/services/edge-functions";

/**
 * La puerta de las pantallas de IA NO debe mentir:
 * "falta la API key" y "las funciones no están desplegadas" son dos problemas
 * distintos y necesitan dos mensajes distintos.
 */
describe("IaStatusGate", () => {
    it("muestra 'cargando' mientras se consulta el estado", () => {
        render(
            <IaStatusGate status={undefined} isLoading={true} error={null}>
                <div>contenido</div>
            </IaStatusGate>,
        );
        expect(screen.getByText(/Comprobando/i)).toBeInTheDocument();
        expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    });

    it("pide la API key cuando no hay key guardada", () => {
        render(
            <IaStatusGate
                status={{ configured: false, model: null, base_url: "", key_source: "ninguna" }}
                isLoading={false}
                error={null}
            >
                <div>contenido</div>
            </IaStatusGate>,
        );
        expect(screen.getByText(/Falta la API key/i)).toBeInTheDocument();
        expect(screen.queryByText("contenido")).not.toBeInTheDocument();
    });

    it("dice que las funciones no están desplegadas (no que falta la key)", () => {
        render(
            <IaStatusGate
                status={undefined}
                isLoading={false}
                error={new EdgeFunctionError("ia-status", "no-desplegada", 404)}
            >
                <div>contenido</div>
            </IaStatusGate>,
        );
        expect(screen.getByText(/No se pudo comprobar la IA/i)).toBeInTheDocument();
        expect(screen.getByText(/no están desplegadas/i)).toBeInTheDocument();
        expect(screen.queryByText(/Falta la API key/i)).not.toBeInTheDocument();
    });

    it("muestra el contenido cuando todo está bien", () => {
        render(
            <IaStatusGate
                status={{ configured: true, model: "MiniMax-M3", base_url: "", key_source: "bd" }}
                isLoading={false}
                error={null}
            >
                <div>contenido</div>
            </IaStatusGate>,
        );
        expect(screen.getByText("contenido")).toBeInTheDocument();
    });
});
