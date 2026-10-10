"use client";

import { Toast } from "@base-ui/react/toast";
import { Check, CircleAlert, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

import styles from "./AdminToast.module.css";

export type CmsToastKind = "success" | "error" | "info";

export function useCmsToast() {
  const { add } = Toast.useToastManager();

  return useCallback((kind: CmsToastKind, message: string) => {
    add({
      title: message,
      type: kind,
      priority: kind === "error" ? "high" : "low",
      timeout: kind === "error" ? 6500 : 4000,
    });
  }, [add]);
}

export function useCmsActionToast(state: { message: string | null } & ({ success: boolean } | { status: "idle" | "success" | "error" })) {
  const notify = useCmsToast();
  const lastState = useRef(state);

  useEffect(() => {
    if (state === lastState.current) return;
    lastState.current = state;
    if (state.message) {
      const success = "success" in state ? state.success : state.status === "success";
      notify(success ? "success" : "error", state.message);
    }
  }, [notify, state]);
}

function CmsToastList() {
  const { toasts } = Toast.useToastManager();

  return toasts.map((toast) => (
    <Toast.Root className={styles.toast} key={toast.id} toast={toast}>
      <Toast.Content className={styles.content}>
        <span aria-hidden="true" className={styles.icon}>
          {toast.type === "error" ? <CircleAlert size={17} /> : toast.type === "info" ? <Info size={17} /> : <Check size={17} />}
        </span>
        <Toast.Title className={styles.title} />
        <Toast.Close aria-label="Dismiss notification" className={styles.close} type="button">
          <X aria-hidden="true" size={16} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}

export default function CmsToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider limit={3} timeout={4000}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className={styles.viewport}>
          <CmsToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}
