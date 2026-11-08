"use strict";

const LEGACY_SCHEMA_PROFILE = "legacy";
const REDESIGNED_SCHEMA_PROFILE = "redesigned";
const SUPPORTED_SCHEMA_PROFILES = new Set([
  LEGACY_SCHEMA_PROFILE,
  REDESIGNED_SCHEMA_PROFILE,
]);

function getSchemaProfile(env = process.env) {
  const value = String(env.DB_SCHEMA_PROFILE || LEGACY_SCHEMA_PROFILE)
    .trim()
    .toLowerCase();

  if (!SUPPORTED_SCHEMA_PROFILES.has(value)) {
    const error = new Error(
      "DB_SCHEMA_PROFILE must be \"" + LEGACY_SCHEMA_PROFILE +
        "\" or \"" + REDESIGNED_SCHEMA_PROFILE + "\".",
    );
    error.code = "DB_CONFIG_ERROR";
    throw error;
  }

  return value;
}

module.exports = {
  LEGACY_SCHEMA_PROFILE,
  REDESIGNED_SCHEMA_PROFILE,
  SUPPORTED_SCHEMA_PROFILES,
  getSchemaProfile,
};
