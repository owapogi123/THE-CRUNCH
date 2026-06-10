import { blockInvalidNumberKeys, sanitizeNumberInput } from "../utils/inputUtils";

const inputCls =
  "w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-transparent placeholder-slate-300 transition-all duration-200";

export function StyledInput({
  type,
  value,
  onChange,
  placeholder,
  min,
  step,
  maxLength,
}: {
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  min?: number | string;
  step?: number | string;
  maxLength?: number;
}) {
  const isNumber = type === "number";
  const allowDecimal = !(step === 1 || step === "1");
  return (
    <input
      type={type}
      min={min}
      step={step}
      maxLength={maxLength}
      inputMode={isNumber ? (allowDecimal ? "decimal" : "numeric") : undefined}
      value={value}
      placeholder={placeholder}
      onChange={(e) =>
        onChange(
          isNumber
            ? sanitizeNumberInput(e.target.value, { allowDecimal })
            : e.target.value,
        )
      }
      onKeyDown={(e) => {
        if (isNumber) {
          blockInvalidNumberKeys(e, { allowDecimal });
        }
      }}
      className={inputCls}
    />
  );
}
