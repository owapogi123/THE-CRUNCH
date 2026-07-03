import { api } from "./api";

export interface GeneralRestaurantSettings {
  restaurantName: string;
  tagline: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  timezone: string;
  openTime: string;
  closeTime: string;
}

export const GENERAL_SETTINGS_DEFAULTS: GeneralRestaurantSettings = {
  restaurantName: "The Crunch",
  tagline: "",
  email: "",
  phone: "",
  address: "",
  currency: "PHP",
  timezone: "Asia/Manila",
  openTime: "08:00",
  closeTime: "22:00",
};

const GENERAL_SETTINGS_STORAGE_KEY = "the-crunch-general-settings";
export const GENERAL_SETTINGS_EVENT = "generalSettingsChange";

function readString(value: unknown, fallback = ""): string {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

export function normalizeGeneralSettings(
  source: Record<string, unknown> | null | undefined,
): GeneralRestaurantSettings {
  return {
    restaurantName: readString(
      source?.restaurantName,
      GENERAL_SETTINGS_DEFAULTS.restaurantName,
    ),
    tagline: readString(source?.tagline),
    email: readString(source?.email),
    phone: readString(source?.phone),
    address: readString(source?.address),
    currency: readString(source?.currency, GENERAL_SETTINGS_DEFAULTS.currency),
    timezone: readString(source?.timezone, GENERAL_SETTINGS_DEFAULTS.timezone),
    openTime: readString(source?.openTime, GENERAL_SETTINGS_DEFAULTS.openTime),
    closeTime: readString(
      source?.closeTime,
      GENERAL_SETTINGS_DEFAULTS.closeTime,
    ),
  };
}

export function readCachedGeneralSettings(): GeneralRestaurantSettings {
  if (typeof window === "undefined") {
    return { ...GENERAL_SETTINGS_DEFAULTS };
  }

  const cached = window.localStorage.getItem(GENERAL_SETTINGS_STORAGE_KEY);
  if (!cached) return { ...GENERAL_SETTINGS_DEFAULTS };

  try {
    return normalizeGeneralSettings(JSON.parse(cached));
  } catch {
    return { ...GENERAL_SETTINGS_DEFAULTS };
  }
}

function persistGeneralSettings(
  settings: GeneralRestaurantSettings,
): GeneralRestaurantSettings {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      GENERAL_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  }
  return settings;
}

export function syncGeneralSettings(
  source: Record<string, unknown> | GeneralRestaurantSettings,
): GeneralRestaurantSettings {
  const normalized = persistGeneralSettings(
    normalizeGeneralSettings(source as Record<string, unknown>),
  );

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(GENERAL_SETTINGS_EVENT, {
        detail: normalized,
      }),
    );
  }

  return normalized;
}

export async function fetchGeneralSettings(): Promise<GeneralRestaurantSettings> {
  try {
    const data = await api.get<Record<string, unknown>>("/settings");
    return syncGeneralSettings(data);
  } catch {
    return readCachedGeneralSettings();
  }
}

export async function saveGeneralSettings(
  payload: Record<string, unknown>,
): Promise<GeneralRestaurantSettings> {
  const data = await api.post<Record<string, unknown>>("/settings", payload);
  return syncGeneralSettings(data);
}

function resolveSettingsArg(
  settingsOrValue?: GeneralRestaurantSettings | string,
): {
  currency: string;
  timezone: string;
} {
  if (typeof settingsOrValue === "string") {
    const cached = readCachedGeneralSettings();
    return {
      currency: settingsOrValue || cached.currency,
      timezone: cached.timezone,
    };
  }

  if (settingsOrValue) {
    return {
      currency: settingsOrValue.currency || GENERAL_SETTINGS_DEFAULTS.currency,
      timezone: settingsOrValue.timezone || GENERAL_SETTINGS_DEFAULTS.timezone,
    };
  }

  const cached = readCachedGeneralSettings();
  return {
    currency: cached.currency || GENERAL_SETTINGS_DEFAULTS.currency,
    timezone: cached.timezone || GENERAL_SETTINGS_DEFAULTS.timezone,
  };
}

export function getCurrencySymbol(
  settingsOrCurrency?: GeneralRestaurantSettings | string,
): string {
  const { currency } = resolveSettingsArg(settingsOrCurrency);

  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return (
      parts.find((part) => part.type === "currency")?.value ||
      `${currency} `
    );
  } catch {
    return `${currency} `;
  }
}

export function formatCurrencyAmount(
  value: number,
  settingsOrCurrency?: GeneralRestaurantSettings | string,
  options?: Intl.NumberFormatOptions,
): string {
  const { currency } = resolveSettingsArg(settingsOrCurrency);

  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toFixed(2)}`;
  }
}

export function formatInSettingsTimezone(
  value: Date | string | number,
  settingsOrTimezone?: GeneralRestaurantSettings | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const { timezone } = resolveSettingsArg(settingsOrTimezone);
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat("en-PH", {
      timeZone: timezone,
      ...options,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-PH", options).format(date);
  }
}
