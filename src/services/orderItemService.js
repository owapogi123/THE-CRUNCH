const MAX_ORDER_ITEM_QUANTITY = 999;
const {
  getSchemaProfile,
  REDESIGNED_SCHEMA_PROFILE,
} = require("../db/schemaProfile");
const {
  CHICKEN_FLAVORS_SYSTEM_KEY,
  MENU_FOOD_SYSTEM_KEY,
  normalizeSystemKey,
} = require("./systemMenuCategoryService");

function createOrderItemError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parsePositiveInteger(value, fieldLabel) {
  const isNumber = typeof value === "number";
  const isNumericString =
    typeof value === "string" && /^\d+$/.test(value.trim());
  if (!isNumber && !isNumericString) {
    throw createOrderItemError(`${fieldLabel} must be a whole number`);
  }

  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    throw createOrderItemError(`${fieldLabel} must be a whole number of at least 1`);
  }
  return numeric;
}

function parseOptionalPositiveInteger(value, fieldLabel) {
  if (value === null || value === undefined || value === "") return null;
  return parsePositiveInteger(value, fieldLabel);
}

function getOrderItemIdentity(productId, selectedFlavorProductId = null) {
  return `${Number(productId)}:${selectedFlavorProductId == null ? "" : Number(selectedFlavorProductId)}`;
}

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createOrderItemError("Order items are required");
  }

  const quantitiesBySelection = new Map();
  for (const item of items) {
    const productId = parsePositiveInteger(
      item?.product_id ?? item?.productId ?? item?.id,
      "Product ID",
    );
    const quantity = parsePositiveInteger(
      item?.qty ?? item?.quantity,
      `Quantity for product ${productId}`,
    );
    const selectedFlavorProductId = parseOptionalPositiveInteger(
      item?.selected_flavor_product_id ??
        item?.selectedFlavorProductId ??
        item?.flavor_product_id,
      `Selected flavor product ID for product ${productId}`,
    );
    if (selectedFlavorProductId === productId) {
      throw createOrderItemError(
        `Product ${productId} cannot select itself as a chicken flavor`,
      );
    }
    const identity = getOrderItemIdentity(productId, selectedFlavorProductId);
    const combinedQuantity =
      Number(quantitiesBySelection.get(identity)?.qty || 0) + quantity;
    if (combinedQuantity > MAX_ORDER_ITEM_QUANTITY) {
      throw createOrderItemError(
        `Quantity for product ${productId} must not exceed ${MAX_ORDER_ITEM_QUANTITY}`,
      );
    }
    quantitiesBySelection.set(identity, {
      product_id: productId,
      qty: combinedQuantity,
      ...(selectedFlavorProductId == null
        ? {}
        : { selected_flavor_product_id: selectedFlavorProductId }),
    });
  }

  return Array.from(quantitiesBySelection.values());
}

async function loadAuthoritativeOrderItems(connection, items) {
  const normalizedItems = normalizeOrderItems(items);
  const redesigned = getSchemaProfile() === REDESIGNED_SCHEMA_PROFILE;
  const productIds = [
    ...new Set(
      normalizedItems.flatMap((item) => [
        item.product_id,
        ...(item.selected_flavor_product_id
          ? [item.selected_flavor_product_id]
          : []),
      ]),
    ),
  ];
  const placeholders = productIds.map(() => "?").join(", ");
  const [rows] = await connection.query(
    redesigned
      ? `SELECT
           p.product_id AS productId,
           p.name AS productName,
           p.selling_price AS currentPrice,
           p.product_type AS productType,
           p.lifecycle_status AS lifecycleStatus,
           p.availability_override AS availabilityOverride,
           category.system_key AS categorySystemKey
         FROM products p
         LEFT JOIN menu_categories category
           ON category.category_id = p.menu_category_id
         WHERE p.product_id IN (${placeholders})`
      : `SELECT
           p.id AS productId,
           COALESCE(NULLIF(TRIM(m.Product_Name), ''), p.name) AS productName,
           COALESCE(m.Price, p.price, 0) AS currentPrice,
           p.availability_status AS availabilityStatus,
           p.item_type AS productType,
           category.system_key AS categorySystemKey
         FROM products p
         LEFT JOIN Menu m ON m.Product_ID = p.id
         LEFT JOIN menu_categories category
           ON LOWER(TRIM(category.name)) = LOWER(TRIM(m.Category_Name))
         WHERE p.id IN (${placeholders})`,
    productIds,
  );
  const productsById = new Map(
    rows.map((row) => [Number(row.productId), row]),
  );

  return normalizedItems.map((item) => {
    const product = productsById.get(item.product_id);
    if (!product) {
      throw createOrderItemError(`Unknown product_id ${item.product_id}`);
    }
    const archived = redesigned
      ? String(product.lifecycleStatus).toLowerCase() !== "active"
      : String(product.availabilityStatus || "").trim().toLowerCase() === "hidden";
    if (archived) {
      throw createOrderItemError(
        `Product ${item.product_id} is archived and cannot be ordered`,
        409,
      );
    }
    if (
      redesigned &&
      String(product.productType).toLowerCase() !== "menu_item"
    ) {
      throw createOrderItemError(
        `Order item ${item.product_id} must be menu_item`,
        400,
      );
    }
    if (
      redesigned &&
      String(product.availabilityOverride).toLowerCase() === "unavailable"
    ) {
      throw createOrderItemError(
        `Product ${item.product_id} is unavailable`,
        409,
      );
    }
    const categorySystemKey = normalizeSystemKey(product.categorySystemKey);
    let flavor = null;
    if (item.selected_flavor_product_id) {
      flavor = productsById.get(item.selected_flavor_product_id);
      const flavorType = String(flavor?.productType || "").toLowerCase();
      if (
        !flavor ||
        normalizeSystemKey(flavor.categorySystemKey) !==
          CHICKEN_FLAVORS_SYSTEM_KEY ||
        (redesigned && flavorType !== "selection_option") ||
        (redesigned && String(flavor.lifecycleStatus).toLowerCase() !== "active")
      ) {
        throw createOrderItemError(
          `Product ${item.selected_flavor_product_id} is not an eligible chicken flavor`,
          409,
        );
      }
    } else if (categorySystemKey === MENU_FOOD_SYSTEM_KEY) {
      throw createOrderItemError(
        `Choose one chicken flavor for "${product.productName}" before checkout.`,
        400,
      );
    }
    const price = Number(product.currentPrice);
    if (!Number.isFinite(price) || price < 0) {
      throw createOrderItemError(
        `Product ${item.product_id} does not have a valid price`,
      );
    }
    return {
      product_id: item.product_id,
      qty: item.qty,
      name: String(product.productName || `Product #${item.product_id}`),
      price,
      subtotal: price * item.qty,
      ...(flavor
        ? {
            selected_flavor_product_id: Number(flavor.productId),
            selected_flavor_name: String(flavor.productName),
          }
        : {}),
    };
  });
}

module.exports = {
  MAX_ORDER_ITEM_QUANTITY,
  getOrderItemIdentity,
  loadAuthoritativeOrderItems,
  normalizeOrderItems,
};
