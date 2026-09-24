import { useState, type ReactNode } from "react";
import { Button as AriaButton, Dialog as AriaDialog, DialogTrigger as AriaDialogTrigger, Modal as AriaModal, ModalOverlay as AriaModalOverlay } from "react-aria-components";
import { cx } from "@/utils/cx";

// Modal de confirmación genérico. Lo único que necesita el proyecto hoy:
// borrar entidades. Si crece, se parametriza.

interface ConfirmDialogProps {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    /** Trigger element (button). */
    children: ReactNode;
}

export const ConfirmDialog = ({
    title,
    message,
    confirmLabel = "Confirmar",
    cancelLabel = "Cancelar",
    danger = true,
    onConfirm,
    children,
}: ConfirmDialogProps) => {
    const [open, setOpen] = useState(false);

    return (
        <AriaDialogTrigger>
            {children}
            {open && (
                <AriaModalOverlay
                    isOpen
                    onOpenChange={setOpen}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
                >
                    <AriaModal>
                        <AriaDialog className="w-full max-w-md rounded-lg bg-primary p-6 shadow-xl">
                            <h3 className="text-base font-semibold text-primary">{title}</h3>
                            <div className="mt-2 text-sm text-secondary">{message}</div>
                            <div className="mt-4 flex justify-end gap-2">
                                <AriaButton
                                    onPress={() => setOpen(false)}
                                    className="rounded-md px-3 py-1.5 text-sm text-secondary hover:bg-secondary"
                                >
                                    {cancelLabel}
                                </AriaButton>
                                <AriaButton
                                    onPress={() => {
                                        onConfirm();
                                        setOpen(false);
                                    }}
                                    className={cx(
                                        "rounded-md px-3 py-1.5 text-sm font-medium text-white",
                                        danger ? "bg-error-primary hover:bg-error-primary_hover" : "bg-brand-primary hover:bg-brand-primary_hover",
                                    )}
                                >
                                    {confirmLabel}
                                </AriaButton>
                            </div>
                        </AriaDialog>
                    </AriaModal>
                </AriaModalOverlay>
            )}
        </AriaDialogTrigger>
    );
};
