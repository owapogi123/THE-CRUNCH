import type { KeyboardEvent } from "react";

const MATERIAL_NAME_MAX_LENGTH = 100;

export function sanitizeNumberInput(
  value: string,
  {
    allowDecimal = true,
    maxDigits,
  }: { allowDecimal?: boolean; maxDigits?: number } = {},
) {
  if (value === "") return "";

  let cleaned = value.replace(/[^\d.]/g, "");
  if (!allowDecimal) {
    cleaned = cleaned.replace(/\./g, "");
    return maxDigits ? cleaned.slice(0, maxDigits) : cleaned;
  }

  const firstDot = cleaned.indexOf(".");
  if (firstDot >= 0) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }

  if (maxDigits) {
    const digitsOnly = cleaned.replace(/\D/g, "").slice(0, maxDigits);
    if (!cleaned.includes(".")) return digitsOnly;
    const [integerPart, decimalPart = ""] = cleaned.split(".");
    const integerDigits = integerPart.replace(/\D/g, "");
    const integerLength = Math.min(integerDigits.length, digitsOnly.length);
    const normalizedInteger = digitsOnly.slice(0, integerLength);
    const normalizedDecimal = digitsOnly.slice(integerLength);
    cleaned =
      decimalPart.length > 0 || cleaned.endsWith(".")
        ? `${normalizedInteger}.${normalizedDecimal}`
        : normalizedInteger;
  }

  return cleaned;
}

export function sanitizeMaterialNameInput(value: string) {
  return value
    .replace(/[^A-Za-z0-9' -]/g, "")
    .slice(0, MATERIAL_NAME_MAX_LENGTH);
}

export function sanitizeShortTextInput(value: string, maxLength: number) {
  return value.slice(0, maxLength);
}

export function blockInvalidNumberKeys(
  event: KeyboardEvent<HTMLInputElement>,
  { allowDecimal = true }: { allowDecimal?: boolean } = {},
) {
  if (
    event.key === "-" ||
    event.key === "+" ||
    event.key === "e" ||
    event.key === "E" ||
    (!allowDecimal && event.key === ".")
  ) {
    event.preventDefault();
  }
}
