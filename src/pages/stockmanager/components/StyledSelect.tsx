import type { ReactNode } from "react";

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200";

export function StyledSelect({
  value,
  onChange,
  children,
  disabled = false,
}: {
  value: number | string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </select>
  );
}
