import type { ReactNode } from "react";

export function Btn({
  onClick,
  variant,
  loading = false,
  disabled = false,
  children,
}: {
  onClick: () => void | Promise<void>;
  variant: "primary" | "danger";
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className={`w-full py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed ${variant === "primary" ? "bg-slate-900 text-white hover:bg-slate-700" : "bg-rose-500 text-white hover:bg-rose-600"}`}
    >
      {children}
    </button>
  );
}
