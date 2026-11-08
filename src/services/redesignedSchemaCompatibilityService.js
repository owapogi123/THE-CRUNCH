"use strict";

const {
  createSchemaCompatibilityError,
  normalizeIdentifier,
} = require("./schemaAssertions");

const REDESIGNED_EXPECTED_TABLES = Object.freeze([
  "business_counters",
  "discount_types",
  "feedback",
  "inventory_alert_reads",
  "inventory_alerts",
  "inventory_balances",
  "inventory_batches",
  "inventory_categories",
  "menu_categories",
  "order_inventory_deductions",
  "order_items",
  "orders",
  "paymongo_checkout_intents",
  "paymongo_webhook_events",
  "payments",
  "pending_signups",
  "product_recipes",
  "products",
  "purchase_order_items",
  "purchase_orders",
  "receipt_snapshot_items",
  "receipt_snapshots",
  "refund_requests",
  "role_permissions",
  "schema_migrations",
  "staff_notification_reads",
  "staff_notifications",
  "stock_movements",
  "supplier_events",
  "supplier_products",
  "suppliers",
  "system_settings",
  "units",
  "users",
]);

const REDESIGNED_CRITICAL_COLUMNS = Object.freeze({
  schema_migrations: {
    version: ["varchar(100)", false],
    checksum: ["char(64)", true],
  },
  users: {
    id: ["int", false],
    password_hash: ["varchar(255)", false],
    role: ["enum('administrator','cashier','inventory_manager','customer')", false],
  },
  products: {
    product_id: ["int", false],
    product_type: ["enum('menu_item','stock_item','selection_option')", false],
    menu_category_id: ["int", true],
    inventory_category_id: ["int", true],
    unit_id: ["int", true],
    selling_price: ["decimal(12,2)", true],
    tracking_method: ["enum('none','expiry','shelf_life')", false],
    shelf_life_days: ["int unsigned", true],
  },
  inventory_balances: {
    product_id: ["int", false],
    on_hand: ["decimal(14,4)", false],
    version: ["int unsigned", false],
  },
  inventory_batches: {
    batch_id: ["bigint", false],
    product_id: ["int", false],
    remaining_quantity: ["decimal(14,4)", false],
    received_at: ["datetime", false],
  },
  stock_movements: {
    stock_movement_id: ["bigint", false],
    product_id: ["int", false],
    signed_quantity: ["decimal(14,4)", false],
    idempotency_key: ["varchar(190)", true],
  },
  orders: {
    order_id: ["bigint", false],
    transaction_id: ["char(12)", false],
    business_date: ["date", false],
    order_number: ["int unsigned", false],
    stock_deducted: ["tinyint(1)", false],
  },
  order_items: {
    order_item_id: ["bigint", false],
    order_id: ["bigint", false],
    product_id: ["int", true],
    selected_option_product_id: ["int", true],
  },
  payments: {
    payment_id: ["bigint", false],
    order_id: ["bigint", false],
    amount: ["decimal(12,2)", false],
  },
  paymongo_checkout_intents: {
    intent_id: ["char(36)", false],
    checkout_request_id: ["char(36)", false],
    items_json: ["json", false],
  },
  paymongo_webhook_events: {
    event_id: ["varchar(100)", false],
    checkout_session_id: ["varchar(100)", false],
  },
});

const REDESIGNED_PRIMARY_KEYS = Object.freeze({
  business_counters: "counter_type,scope_date",
  discount_types: "discount_id",
  feedback: "feedback_id",
  inventory_alert_reads: "alert_id,user_id",
  inventory_alerts: "alert_id",
  inventory_balances: "product_id",
  inventory_batches: "batch_id",
  inventory_categories: "category_id",
  menu_categories: "category_id",
  order_inventory_deductions: "order_id,product_id",
  order_items: "order_item_id",
  orders: "order_id",
  paymongo_checkout_intents: "intent_id",
  paymongo_webhook_events: "event_id",
  payments: "payment_id",
  pending_signups: "pending_signup_id",
  product_recipes: "recipe_item_id",
  products: "product_id",
  purchase_order_items: "purchase_order_item_id",
  purchase_orders: "purchase_order_id",
  receipt_snapshot_items: "receipt_item_id",
  receipt_snapshots: "order_id",
  refund_requests: "refund_request_id",
  role_permissions: "id",
  schema_migrations: "version",
  staff_notification_reads: "notification_id,user_id",
  staff_notifications: "notification_id",
  stock_movements: "stock_movement_id",
  supplier_events: "supplier_event_id",
  supplier_products: "supplier_id,product_id",
  suppliers: "supplier_id",
  system_settings: "setting_key",
  units: "unit_id",
  users: "id",
});

const REDESIGNED_REQUIRED_UNIQUE_INDEXES = Object.freeze([
  "discount_types|name",
  "inventory_alerts|product_id,active_episode",
  "inventory_categories|name",
  "inventory_categories|system_key",
  "menu_categories|name",
  "menu_categories|system_key",
  "orders|business_date,order_number",
  "orders|transaction_id",
  "paymongo_checkout_intents|checkout_request_id",
  "paymongo_checkout_intents|checkout_session_id",
  "payments|external_reference",
  "pending_signups|email",
  "product_recipes|parent_product_id,ingredient_product_id",
  "products|sku",
  "purchase_order_items|purchase_order_id,product_id",
  "purchase_orders|po_number",
  "refund_requests|order_id",
  "role_permissions|role,permission_key",
  "staff_notifications|dedupe_key",
  "stock_movements|idempotency_key",
  "suppliers|name",
  "units|abbreviation",
  "units|name",
  "units|system_key",
  "users|email",
  "users|username",
]);

const REDESIGNED_REQUIRED_FOREIGN_KEYS = Object.freeze([
  "feedback|customer_user_id|users|id|set null",
  "feedback|product_id|products|product_id|restrict",
  "inventory_alert_reads|alert_id|inventory_alerts|alert_id|cascade",
  "inventory_alert_reads|user_id|users|id|cascade",
  "inventory_alerts|product_id|products|product_id|restrict",
  "inventory_balances|product_id|products|product_id|restrict",
  "inventory_batches|product_id|products|product_id|restrict",
  "inventory_batches|purchase_order_item_id|purchase_order_items|purchase_order_item_id|restrict",
  "inventory_batches|unit_id|units|unit_id|restrict",
  "order_inventory_deductions|order_id|orders|order_id|restrict",
  "order_inventory_deductions|product_id|products|product_id|restrict",
  "order_items|order_id|orders|order_id|restrict",
  "order_items|product_id|products|product_id|set null",
  "order_items|selected_option_product_id|products|product_id|set null",
  "orders|cashier_user_id|users|id|set null",
  "orders|customer_user_id|users|id|set null",
  "orders|timer_updated_by_user_id|users|id|set null",
  "orders|verified_by_user_id|users|id|set null",
  "payments|order_id|orders|order_id|restrict",
  "payments|processed_by_user_id|users|id|set null",
  "paymongo_checkout_intents|customer_user_id|users|id|restrict",
  "paymongo_checkout_intents|finalized_order_id|orders|order_id|set null",
  "paymongo_webhook_events|customer_user_id|users|id|restrict",
  "product_recipes|ingredient_product_id|products|product_id|restrict",
  "product_recipes|parent_product_id|products|product_id|restrict",
  "product_recipes|unit_id|units|unit_id|restrict",
  "products|inventory_category_id|inventory_categories|category_id|restrict",
  "products|menu_category_id|menu_categories|category_id|restrict",
  "products|unit_id|units|unit_id|restrict",
  "purchase_order_items|product_id|products|product_id|restrict",
  "purchase_order_items|purchase_order_id|purchase_orders|purchase_order_id|cascade",
  "purchase_order_items|unit_id|units|unit_id|restrict",
  "purchase_orders|created_by_user_id|users|id|set null",
  "purchase_orders|received_by_user_id|users|id|set null",
  "purchase_orders|supplier_id|suppliers|supplier_id|restrict",
  "receipt_snapshot_items|order_id|receipt_snapshots|order_id|cascade",
  "receipt_snapshot_items|original_product_id|products|product_id|set null",
  "receipt_snapshot_items|selected_option_product_id|products|product_id|set null",
  "receipt_snapshots|order_id|orders|order_id|restrict",
  "refund_requests|order_id|orders|order_id|restrict",
  "refund_requests|requester_user_id|users|id|restrict",
  "refund_requests|reviewed_by_user_id|users|id|set null",
  "staff_notification_reads|notification_id|staff_notifications|notification_id|cascade",
  "staff_notification_reads|user_id|users|id|cascade",
  "staff_notifications|actor_user_id|users|id|set null",
  "stock_movements|actor_user_id|users|id|set null",
  "stock_movements|batch_id|inventory_batches|batch_id|restrict",
  "stock_movements|product_id|products|product_id|restrict",
  "stock_movements|unit_id|units|unit_id|restrict",
  "supplier_events|actor_user_id|users|id|set null",
  "supplier_events|supplier_id|suppliers|supplier_id|set null",
  "supplier_products|product_id|products|product_id|restrict",
  "supplier_products|supplier_id|suppliers|supplier_id|restrict",
  "system_settings|updated_by_user_id|users|id|set null",
  "units|base_unit_id|units|unit_id|restrict",
]);

function compareExact(label, expectedValues, actualValues) {
  const expected = new Set(expectedValues);
  const actual = new Set(actualValues);
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  if (missing.length || unexpected.length) {
    throw createSchemaCompatibilityError(
      label + " do not match the redesigned schema contract.",
      { missing, unexpected },
    );
  }
}

function requireValues(label, expectedValues, actualValues) {
  const actual = new Set(actualValues);
  const missing = expectedValues.filter((value) => !actual.has(value)).sort();
  if (missing.length > 0) {
    throw createSchemaCompatibilityError(
      label + " are incomplete for the redesigned schema.",
      { missing },
    );
  }
}

async function verifyRedesignedSchemaCompatibility(db, expectedDatabaseName) {
  const expectedDatabase = String(expectedDatabaseName || "").trim();
  const [[identity]] = await db.query(
    "SELECT DATABASE() AS database_name, @@version AS server_version",
  );
  if (!expectedDatabase || identity?.database_name !== expectedDatabase) {
    throw createSchemaCompatibilityError(
      "Connected database identity is not the explicitly configured database.",
      { expectedDatabase, actualDatabase: identity?.database_name || null },
    );
  }

  const [objects] = await db.query(
    "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE()",
  );
  const tables = objects
    .filter((row) => String(row.TABLE_TYPE).toUpperCase() === "BASE TABLE")
    .map((row) => normalizeIdentifier(row.TABLE_NAME));
  const views = objects
    .filter((row) => String(row.TABLE_TYPE).toUpperCase() === "VIEW")
    .map((row) => normalizeIdentifier(row.TABLE_NAME));
  compareExact("Database tables", REDESIGNED_EXPECTED_TABLES, tables);
  if (views.length > 0) {
    throw createSchemaCompatibilityError(
      "Unexpected views are present in the redesigned database.",
      { unexpected: views.sort() },
    );
  }

  const [routineRows] = await db.query(
    "SELECT ROUTINE_NAME FROM information_schema.ROUTINES " +
      "WHERE ROUTINE_SCHEMA = DATABASE()",
  );
  const [eventRows] = await db.query(
    "SELECT EVENT_NAME FROM information_schema.EVENTS " +
      "WHERE EVENT_SCHEMA = DATABASE()",
  );
  const [triggerRows] = await db.query(
    "SELECT TRIGGER_NAME FROM information_schema.TRIGGERS " +
      "WHERE TRIGGER_SCHEMA = DATABASE()",
  );
  if (routineRows.length || eventRows.length || triggerRows.length) {
    throw createSchemaCompatibilityError(
      "Unexpected routines, events, or triggers are present in the redesigned database.",
      {
        unexpected: [
          ...routineRows.map((row) => normalizeIdentifier(row.ROUTINE_NAME)),
          ...eventRows.map((row) => normalizeIdentifier(row.EVENT_NAME)),
          ...triggerRows.map((row) => normalizeIdentifier(row.TRIGGER_NAME)),
        ].sort(),
      },
    );
  }

  const [columnRows] = await db.query(
    "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE " +
      "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()",
  );
  const columnMap = new Map(
    columnRows.map((row) => [
      normalizeIdentifier(row.TABLE_NAME) + "." +
        normalizeIdentifier(row.COLUMN_NAME),
      row,
    ]),
  );
  const columnMismatches = [];
  for (const [table, columns] of Object.entries(REDESIGNED_CRITICAL_COLUMNS)) {
    for (const [column, [type, nullable]] of Object.entries(columns)) {
      const actual = columnMap.get(table + "." + column);
      if (
        !actual ||
        normalizeIdentifier(actual.COLUMN_TYPE) !== normalizeIdentifier(type) ||
        (String(actual.IS_NULLABLE).toUpperCase() === "YES") !== nullable
      ) {
        columnMismatches.push(table + "." + column);
      }
    }
  }
  if (columnMismatches.length > 0) {
    throw createSchemaCompatibilityError(
      "Critical columns do not match the redesigned schema contract.",
      { columns: columnMismatches.sort() },
    );
  }

  const [indexRows] = await db.query(
    "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME " +
      "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() " +
      "ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
  );
  const indexGroups = new Map();
  for (const row of indexRows) {
    const key =
      normalizeIdentifier(row.TABLE_NAME) + "|" +
      normalizeIdentifier(row.INDEX_NAME);
    if (!indexGroups.has(key)) indexGroups.set(key, []);
    indexGroups.get(key).push(row);
  }
  const primaryKeys = [];
  const uniqueIndexes = [];
  for (const [key, rows] of indexGroups) {
    const ordered = rows.sort(
      (a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX),
    );
    const table = key.split("|")[0];
    const index = key.split("|")[1];
    const columns = ordered
      .map((row) => normalizeIdentifier(row.COLUMN_NAME))
      .join(",");
    if (index === "primary") primaryKeys.push(table + "|" + columns);
    if (Number(ordered[0].NON_UNIQUE) === 0 && index !== "primary") {
      uniqueIndexes.push(table + "|" + columns);
    }
  }
  requireValues(
    "Primary keys",
    Object.entries(REDESIGNED_PRIMARY_KEYS).map(
      ([table, columns]) => table + "|" + columns,
    ),
    primaryKeys,
  );
  requireValues(
    "Unique indexes",
    REDESIGNED_REQUIRED_UNIQUE_INDEXES,
    uniqueIndexes,
  );

  const [foreignKeyRows] = await db.query(
    "SELECT kcu.TABLE_NAME, kcu.COLUMN_NAME, kcu.REFERENCED_TABLE_NAME, " +
      "kcu.REFERENCED_COLUMN_NAME, rc.DELETE_RULE " +
      "FROM information_schema.KEY_COLUMN_USAGE kcu " +
      "JOIN information_schema.REFERENTIAL_CONSTRAINTS rc " +
      "ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA " +
      "AND rc.TABLE_NAME = kcu.TABLE_NAME " +
      "AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME " +
      "WHERE kcu.CONSTRAINT_SCHEMA = DATABASE() " +
      "AND kcu.REFERENCED_TABLE_NAME IS NOT NULL",
  );
  const foreignKeys = foreignKeyRows.map((row) =>
    [
      normalizeIdentifier(row.TABLE_NAME),
      normalizeIdentifier(row.COLUMN_NAME),
      normalizeIdentifier(row.REFERENCED_TABLE_NAME),
      normalizeIdentifier(row.REFERENCED_COLUMN_NAME),
      normalizeIdentifier(row.DELETE_RULE),
    ].join("|"),
  );
  compareExact(
    "Foreign keys",
    REDESIGNED_REQUIRED_FOREIGN_KEYS,
    foreignKeys,
  );

  const [[defaults]] = await db.query(
    "SELECT " +
      "(SELECT COUNT(*) FROM menu_categories " +
      " WHERE system_key IN ('menu_food','chicken_flavors') " +
      " AND is_system = 1 AND is_active = 1) AS protected_menu_categories, " +
      "(SELECT COUNT(*) FROM inventory_categories " +
      " WHERE system_key = 'raw_materials' AND is_system = 1 AND is_active = 1) " +
      " AS protected_inventory_categories, " +
      "(SELECT COUNT(*) FROM units WHERE is_system = 1 AND is_active = 1) " +
      " AS system_units, " +
      "(SELECT COUNT(*) FROM system_settings " +
      " WHERE setting_key IN ('restaurant_settings','role_permission_locks')) " +
      " AS required_settings, " +
      "(SELECT COUNT(*) FROM role_permissions " +
      " WHERE role IN ('administrator','cashier','inventory_manager') " +
      " AND permission_key IN ('overview','orders','menuManagement','menus'," +
      "'stockManager','userAccounts','salesReports','settings')) " +
      " AS required_permissions, " +
      "(SELECT COUNT(*) FROM discount_types " +
      " WHERE name IN ('Regular customer','PWD','Senior Citizen') " +
      " AND is_active = 1) AS required_discounts, " +
      "(SELECT COUNT(*) FROM users " +
      " WHERE role = 'administrator' AND is_active = 1) AS administrators",
  );
  const defaultMismatches = [];
  if (Number(defaults.protected_menu_categories) !== 2) {
    defaultMismatches.push("protected menu categories");
  }
  if (Number(defaults.protected_inventory_categories) !== 1) {
    defaultMismatches.push("Raw Materials inventory category");
  }
  if (Number(defaults.system_units) < 8) {
    defaultMismatches.push("system units");
  }
  if (Number(defaults.required_settings) !== 2) {
    defaultMismatches.push("required system settings");
  }
  if (Number(defaults.required_permissions) !== 24) {
    defaultMismatches.push("required role permissions");
  }
  if (Number(defaults.required_discounts) !== 3) {
    defaultMismatches.push("required discounts");
  }
  if (Number(defaults.administrators) < 1) {
    defaultMismatches.push("administrator account");
  }
  if (defaultMismatches.length > 0) {
    throw createSchemaCompatibilityError(
      "Required redesigned system metadata is incomplete.",
      { missing: defaultMismatches },
    );
  }

  return {
    database: expectedDatabase,
    serverVersion: identity.server_version,
    tableCount: tables.length,
    indexCount: indexGroups.size,
    foreignKeyCount: foreignKeys.length,
    triggerCount: 0,
    routineCount: 0,
    eventCount: 0,
    orphanCount: 0,
    warnings: [],
  };
}

module.exports = {
  REDESIGNED_CRITICAL_COLUMNS,
  REDESIGNED_EXPECTED_TABLES,
  REDESIGNED_PRIMARY_KEYS,
  REDESIGNED_REQUIRED_FOREIGN_KEYS,
  REDESIGNED_REQUIRED_UNIQUE_INDEXES,
  verifyRedesignedSchemaCompatibility,
};
