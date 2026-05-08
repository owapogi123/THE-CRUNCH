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

export async function fetchGeneralSettings(): Promise<GeneralRestaurantSettings> {
  try {
    const data = await api.get<Record<string, unknown>>("/settings");
    return normalizeGeneralSettings(data);
  } catch {
    return { ...GENERAL_SETTINGS_DEFAULTS };
  }
}
