const MAX_ORDER_ITEM_QUANTITY = 999;

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

function normalizeOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw createOrderItemError("Order items are required");
  }

  const quantitiesByProduct = new Map();
  for (const item of items) {
    const productId = parsePositiveInteger(
      item?.product_id ?? item?.productId ?? item?.id,
      "Product ID",
    );
    const quantity = parsePositiveInteger(
      item?.qty ?? item?.quantity,
      `Quantity for product ${productId}`,
    );
    const combinedQuantity =
      Number(quantitiesByProduct.get(productId) || 0) + quantity;
    if (combinedQuantity > MAX_ORDER_ITEM_QUANTITY) {
      throw createOrderItemError(
        `Quantity for product ${productId} must not exceed ${MAX_ORDER_ITEM_QUANTITY}`,
      );
    }
    quantitiesByProduct.set(productId, combinedQuantity);
  }

  return Array.from(quantitiesByProduct.entries()).map(
    ([productId, quantity]) => ({
      product_id: productId,
      qty: quantity,
    }),
  );
}

async function loadAuthoritativeOrderItems(connection, items) {
  const normalizedItems = normalizeOrderItems(items);
  const productIds = normalizedItems.map((item) => item.product_id);
  const placeholders = productIds.map(() => "?").join(", ");
  const [rows] = await connection.query(
    `SELECT
       p.id AS productId,
       COALESCE(NULLIF(TRIM(m.Product_Name), ''), p.name) AS productName,
       COALESCE(m.Price, p.price, 0) AS currentPrice
     FROM products p
     LEFT JOIN Menu m ON m.Product_ID = p.id
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
    };
  });
}

module.exports = {
  MAX_ORDER_ITEM_QUANTITY,
  loadAuthoritativeOrderItems,
  normalizeOrderItems,
};
