"use strict";

const MENU_FOOD_SYSTEM_KEY = "menu_food";
const CHICKEN_FLAVORS_SYSTEM_KEY = "chicken_flavors";

function normalizeSystemKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isProtectedMenuCategorySystemKey(value) {
  return normalizeSystemKey(value) === CHICKEN_FLAVORS_SYSTEM_KEY;
}

module.exports = {
  CHICKEN_FLAVORS_SYSTEM_KEY,
  MENU_FOOD_SYSTEM_KEY,
  isProtectedMenuCategorySystemKey,
  normalizeSystemKey,
};
