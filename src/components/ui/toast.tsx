"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "default" | "success" | "error" | "info";

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toast: (opts: Omit<ToastMessage, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { wrapper: string; icon: React.ReactNode }> = {
  default: {
    wrapper: "border-slate-200 bg-white text-slate-900",
    icon: <Info className="h-4 w-4 text-slate-500 shrink-0" />,
  },
  success: {
    wrapper: "border-green-200 bg-green-50 text-green-900",
    icon: <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />,
  },
  error: {
    wrapper: "border-red-200 bg-red-50 text-red-900",
    icon: <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />,
  },
  info: {
    wrapper: "border-blue-200 bg-blue-50 text-blue-900",
    icon: <Info className="h-4 w-4 text-blue-600 shrink-0" />,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((opts: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, ...opts }]);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => {
          const styles = VARIANT_STYLES[t.variant ?? "default"];
          return (
            <ToastPrimitive.Root
              key={t.id}
              duration={t.duration ?? 4000}
              onOpenChange={(open) => { if (!open) dismiss(t.id); }}
              className={cn(
                "group relative flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-panel",
                "data-[state=open]:animate-in data-[state=closed]:animate-out",
                "data-[state=closed]:fade-out-80 data-[state=open]:fade-in-0",
                "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full",
                "transition-all duration-150",
                styles.wrapper
              )}
            >
              {styles.icon}
              <div className="flex-1 min-w-0">
                <ToastPrimitive.Title className="text-sm font-semibold leading-tight">
                  {t.title}
                </ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 text-xs opacity-80 leading-relaxed">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport
          className="fixed bottom-4 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 p-0"
          aria-live="polite"
          aria-label="Notifications"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
