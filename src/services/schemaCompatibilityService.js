"use strict";

const {
  createSchemaCompatibilityError,
  normalizeIdentifier,
} = require("./schemaAssertions");

const EXPECTED_TABLES = [
  "admin", "batches", "cashier", "categories", "cook", "customers",
  "daily_usage_report_items", "daily_usage_reports", "discount_types",
  "feedback", "inventory", "inventory_alert_reads", "inventory_alerts",
  "inventory_categories", "inventory_units",
  "kitchen", "kitchen_batches", "kitchen_usage_items",
  "kitchen_usage_reports", "menu", "menu_categories",
  "menu_item_ingredients", "order_daily_counters", "order_inventory_deductions", "order_item",
  "order_tracking", "orders", "payments", "pending_signups", "po_counter",
  "paymongo_checkout_intents", "paymongo_webhook_events",
  "products", "purchase_order_items", "purchase_orders", "receipt",
  "receipt_snapshot_items", "receipt_snapshots", "refund_requests", "reports",
  "role_permissions", "staff_notification_reads", "staff_notifications",
  "schema_migrations",
  "stock_status", "supplier_history", "suppliers",
  "system_settings", "users",
];

const EXPECTED_INDEXES = [
  "admin|primary|1|admin_id", "admin|email|1|email",
  "batches|primary|1|batch_id", "batches|idx_batches_product_id|0|product_id",
  "cashier|primary|1|cashier_id", "categories|primary|1|category_id",
  "cook|primary|1|cook_id", "customers|primary|1|customer_id",
  "daily_usage_report_items|primary|1|usage_item_id",
  "daily_usage_report_items|uniq_daily_usage_report_product|1|report_id,product_id",
  "paymongo_webhook_events|primary|1|event_id",
  "paymongo_webhook_events|idx_paymongo_webhook_checkout_session|0|checkout_session_id",
  "paymongo_checkout_intents|primary|1|intent_id",
  "paymongo_checkout_intents|uq_paymongo_intents_checkout_request|1|checkout_request_id",
  "paymongo_checkout_intents|uq_paymongo_intents_checkout_session|1|checkout_session_id",
  "paymongo_checkout_intents|idx_paymongo_intents_customer_status|0|customer_user_id,status",
  "paymongo_checkout_intents|idx_paymongo_intents_finalized_order|0|finalized_order_id",
  "daily_usage_reports|primary|1|report_id",
  "daily_usage_reports|uniq_daily_usage_report_date|1|report_date",
  "discount_types|primary|1|discount_id", "discount_types|name|1|name",
  "feedback|primary|1|feedback_id", "feedback|fk_feedback_product|0|product_id",
  "feedback|fk_feedback_customer|0|customer_user_id",
  "inventory|primary|1|inventory_id", "inventory|product_id|0|product_id",
  "inventory_alert_reads|primary|1|alert_id,user_id",
  "inventory_alert_reads|idx_inventory_alert_reads_user|0|user_id,read_at",
  "inventory_alerts|primary|1|alert_id",
  "inventory_alerts|uq_inventory_alerts_active|1|inventory_id,active_episode",
  "inventory_alerts|idx_inventory_alerts_history|0|inventory_id,created_at",
  "inventory_alerts|idx_inventory_alerts_resolved|0|resolved_at,created_at",
  "inventory_categories|primary|1|category_id", "inventory_categories|name|1|name",
  "inventory_units|primary|1|unit_id", "inventory_units|name|1|name",
  "kitchen|primary|1|kitchen_id", "kitchen|order_id|0|order_id",
  "kitchen|updatedby|0|updatedby", "kitchen_batches|primary|1|kitchen_batch_id",
  "kitchen_batches|idx_kitchen_batches_storage_batch_id|0|storage_batch_id",
  "kitchen_batches|idx_kitchen_batches_product_id|0|product_id",
  "kitchen_usage_items|primary|1|usage_item_id",
  "kitchen_usage_items|fk_kitchen_usage_items_report|0|report_id",
  "kitchen_usage_reports|primary|1|report_id",
  "kitchen_usage_reports|uniq_kitchen_usage_report_date|1|report_date",
  "menu|primary|1|product_id", "menu|category_id|0|category_id",
  "menu_categories|primary|1|category_id", "menu_categories|name|1|name",
  "menu_item_ingredients|primary|1|menu_ingredient_id",
  "menu_item_ingredients|uniq_menu_ingredient|1|menu_product_id,product_id",
  "menu_item_ingredients|fk_menu_item_ingredients_product|0|product_id",
  "order_daily_counters|primary|1|business_date,counter_scope",
  "order_inventory_deductions|primary|1|order_id,product_id",
  "order_item|primary|1|order_item_id", "order_item|order_id|0|order_id",
  "order_item|product_id|0|product_id", "order_tracking|primary|1|tracking_id",
  "order_tracking|order_id|0|order_id", "orders|primary|1|order_id",
  "orders|idx_orders_payment_reference|0|payment_reference",
  "orders|uq_orders_transaction_id|1|transaction_id",
  "orders|uq_orders_business_order_number|1|business_date,order_number",
  "orders|customer_id|0|customer_id", "orders|cashier_id|0|cashier_id",
  "payments|primary|1|payment_id", "payments|order_id|0|order_id",
  "payments|processby|0|processby", "pending_signups|primary|1|pending_signup_id",
  "pending_signups|email|1|email", "po_counter|primary|1|id",
  "products|primary|1|id", "purchase_order_items|primary|1|item_id",
  "purchase_order_items|po_id|0|po_id",
  "purchase_order_items|idx_purchase_order_items_product_id|0|product_id",
  "purchase_orders|primary|1|po_id", "receipt|primary|1|receipt_id",
  "receipt|receipt_number|1|receipt_number", "receipt|order_id|0|order_id",
  "receipt_snapshot_items|primary|1|receipt_item_id",
  "receipt_snapshot_items|idx_receipt_snapshot_items_order|0|order_id,sort_order",
  "receipt_snapshots|primary|1|order_id",
  "refund_requests|primary|1|refund_request_id",
  "refund_requests|uq_refund_requests_order|1|order_id",
  "refund_requests|idx_refund_requests_status_requested|0|status,requested_at",
  "reports|primary|1|report_id", "role_permissions|primary|1|id",
  "role_permissions|unique_role_permission|1|role,permission_key",
  "schema_migrations|primary|1|version",
  "staff_notification_reads|primary|1|notification_id,user_id",
  "staff_notification_reads|idx_staff_notification_reads_user|0|user_id,read_at",
  "staff_notifications|primary|1|notification_id",
  "staff_notifications|uq_staff_notifications_dedupe|1|dedupe_key",
  "staff_notifications|idx_staff_notifications_audience_created|0|audience,created_at",
  "staff_notifications|idx_staff_notifications_category_entity|0|category,entity_id",
  "stock_status|primary|1|status_id", "stock_status|product_id|0|product_id",
  "stock_status|recordedby|0|recordedby",
  "supplier_history|primary|1|history_id", "suppliers|primary|1|supplier_id",
  "suppliers|product_id|0|product_id", "system_settings|primary|1|setting_key",
  "users|primary|1|id", "users|username|1|username", "users|email|1|email",
];

const EXPECTED_FOREIGN_KEYS = [
  "batches|fk_batches_product|product_id|products|id|restrict|restrict",
  "daily_usage_report_items|fk_daily_usage_items_report|report_id|daily_usage_reports|report_id|no action|cascade",
  "feedback|fk_feedback_customer|customer_user_id|users|id|no action|set null",
  "feedback|fk_feedback_product|product_id|menu|product_id|no action|no action",
  "inventory|inventory_ibfk_1|product_id|menu|product_id|no action|no action",
  "inventory_alert_reads|fk_inventory_alert_reads_alert|alert_id|inventory_alerts|alert_id|no action|cascade",
  "inventory_alert_reads|fk_inventory_alert_reads_user|user_id|users|id|no action|cascade",
  "kitchen|kitchen_ibfk_1|order_id|orders|order_id|no action|no action",
  "kitchen|kitchen_ibfk_2|updatedby|cook|cook_id|no action|no action",
  "kitchen_batches|fk_kitchen_batches_storage_batch|storage_batch_id|batches|batch_id|restrict|restrict",
  "kitchen_batches|fk_kitchen_batches_product|product_id|products|id|restrict|restrict",
  "kitchen_usage_items|fk_kitchen_usage_items_report|report_id|kitchen_usage_reports|report_id|no action|cascade",
  "menu|menu_ibfk_1|category_id|categories|category_id|no action|no action",
  "menu_item_ingredients|fk_menu_item_ingredients_menu|menu_product_id|menu|product_id|no action|cascade",
  "menu_item_ingredients|fk_menu_item_ingredients_product|product_id|menu|product_id|no action|cascade",
  "order_inventory_deductions|fk_order_inventory_deductions_order|order_id|orders|order_id|restrict|restrict",
  "order_item|order_item_ibfk_1|order_id|orders|order_id|no action|no action",
  "order_item|order_item_ibfk_2|product_id|menu|product_id|no action|no action",
  "order_tracking|order_tracking_ibfk_1|order_id|orders|order_id|no action|no action",
  "orders|orders_ibfk_1|customer_id|customers|customer_id|no action|no action",
  "orders|orders_ibfk_2|cashier_id|cashier|cashier_id|no action|no action",
  "payments|payments_ibfk_1|order_id|orders|order_id|no action|no action",
  "payments|payments_ibfk_2|processby|cashier|cashier_id|no action|no action",
  "purchase_order_items|purchase_order_items_ibfk_1|po_id|purchase_orders|po_id|no action|cascade",
  "receipt|receipt_ibfk_1|order_id|orders|order_id|no action|no action",
  "receipt_snapshot_items|fk_receipt_snapshot_items_snapshot|order_id|receipt_snapshots|order_id|no action|cascade",
  "receipt_snapshots|fk_receipt_snapshots_order|order_id|orders|order_id|no action|no action",
  "refund_requests|fk_refund_requests_order|order_id|orders|order_id|no action|no action",
  "staff_notification_reads|fk_staff_notification_reads_notification|notification_id|staff_notifications|notification_id|no action|cascade",
  "staff_notification_reads|fk_staff_notification_reads_user|user_id|users|id|no action|cascade",
  "stock_status|stock_status_ibfk_1|product_id|menu|product_id|no action|no action",
  "stock_status|stock_status_ibfk_2|recordedby|admin|admin_id|no action|no action",
  "suppliers|suppliers_ibfk_1|product_id|menu|product_id|no action|no action",
];

const CRITICAL_COLUMNS = {
  products: {
    id: ["int", false], item_type: ["varchar(20)", false],
    quantity: ["decimal(14,4)", true], image: ["longtext", true],
  },
  menu: {
    product_id: ["int", false], stock: ["decimal(14,4)", true],
    manual_override: ["tinyint(1)", false], manual_status: ["varchar(20)", false],
  },
  inventory: {
    product_id: ["int", true], quantity: ["decimal(14,4)", false],
    stock: ["decimal(14,4)", true], unit: ["varchar(30)", false],
  },
  inventory_alerts: {
    alert_id: ["bigint unsigned", false], inventory_id: ["int", false],
    severity: ["enum('low','critical','out')", false],
    active_episode: ["tinyint(1)", true], created_at: ["timestamp", false],
    resolved_at: ["timestamp", true],
  },
  inventory_alert_reads: {
    alert_id: ["bigint unsigned", false], user_id: ["int", false],
    read_at: ["timestamp", false],
  },
  refund_requests: {
    refund_request_id: ["int", false], order_id: ["int", false],
    reason_snapshot: ["varchar(500)", false],
    status: ["enum('Pending','Ignored','Actioned')", false],
    requested_at: ["timestamp", false], reviewed_at: ["timestamp", true],
  },
  order_inventory_deductions: {
    order_id: ["int", false], product_id: ["int", false],
    quantity: ["decimal(14,4)", false], created_at: ["timestamp", false],
  },
  paymongo_webhook_events: {
    event_id: ["varchar(100)", false], event_type: ["varchar(100)", false],
    checkout_session_id: ["varchar(100)", false], customer_user_id: ["int", false],
    payment_reference: ["varchar(255)", false],
    expected_amount_centavos: ["bigint unsigned", false],
    paid_amount_centavos: ["bigint unsigned", false], currency: ["char(3)", false],
    livemode: ["tinyint(1)", false], provider_created_at: ["bigint unsigned", true],
    received_at: ["timestamp", false],
  },
  paymongo_checkout_intents: {
    intent_id: ["char(36)", false], checkout_request_id: ["char(36)", false],
    customer_user_id: ["int", false], items_json: ["json", false],
    subtotal: ["decimal(12,2)", false], tax_rate: ["decimal(9,4)", false],
    tax_amount: ["decimal(12,2)", false], service_charge_rate: ["decimal(9,4)", false],
    service_charge_amount: ["decimal(12,2)", false], total_amount: ["decimal(12,2)", false],
    amount_centavos: ["bigint unsigned", false], currency: ["char(3)", false],
    order_type: ["varchar(20)", false], customer_type: ["varchar(100)", true],
    order_note: ["text", true], payment_context_token: ["text", false],
    checkout_session_id: ["varchar(100)", true], checkout_url: ["varchar(2048)", true],
    payment_reference: ["varchar(255)", true], provider_status: ["varchar(50)", true],
    livemode: ["tinyint(1)", true], status: ["varchar(40)", false],
    verified_at: ["datetime", true], finalized_order_id: ["int", true],
    finalized_at: ["datetime", true], finalization_attempts: ["int unsigned", false],
    reconciliation_code: ["varchar(100)", true], reconciliation_message: ["varchar(500)", true],
    created_at: ["timestamp", false], updated_at: ["timestamp", false],
  },
  staff_notifications: {
    notification_id: ["bigint unsigned", false], dedupe_key: ["varchar(190)", false],
    category: ["enum('refund_request','purchase_order','inventory_change')", false],
    audience: ["enum('administrator','inventory_manager','administrator,inventory_manager')", false],
    actor_user_id: ["int", true], metadata_json: ["json", true],
    created_at: ["timestamp", false], resolved_at: ["timestamp", true],
  },
  staff_notification_reads: {
    notification_id: ["bigint unsigned", false], user_id: ["int", false],
    read_at: ["timestamp", false],
  },
  purchase_order_items: {
    item_id: ["int", false], po_id: ["varchar(12)", false],
    product_id: ["int", true], quantity: ["decimal(10,2)", false],
    received_quantity: ["decimal(10,2)", true],
    unit_cost: ["decimal(10,2)", false],
  },
  purchase_orders: {
    delivery_date: ["date", true],
  },
  batches: {
    batch_id: ["int", false], product_id: ["int", false],
    quantity: ["decimal(10,2)", false], remaining_qty: ["decimal(10,2)", false],
    unit: ["varchar(50)", true], shelf_life_months: ["int", true], shelf_life_days: ["int", true],
    shelf_life_hours: ["int", true], usable_until: ["datetime", true],
    status: ["varchar(20)", true],
  },
  kitchen_batches: {
    kitchen_batch_id: ["int", false], storage_batch_id: ["int", true],
    product_id: ["int", false], withdrawn_qty: ["decimal(10,2)", false],
    used_qty: ["decimal(10,2)", false], returned_qty: ["decimal(10,2)", false],
  },
  users: {
    password_reset_code: ["varchar(64)", true],
    password_reset_expires: ["datetime", true],
  },
  pending_signups: { pending_signup_id: ["int", false], email: ["varchar(150)", false] },
};

const EXPECTED_TRIGGERS = {
  trg_batch_received: {
    table: "batches", timing: "after", event: "insert",
    action: `BEGIN
      INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
      SELECT COALESCE(s.Supplier_ID, 0), COALESCE(s.SupplierName, 'Unknown Supplier'),
        'Batch Received', CONCAT('Product: ', COALESCE(p.name, CONCAT('ID ', NEW.product_id)),
        ' | Qty: ', NEW.quantity, ' ', NEW.unit,
        IF(NEW.expiry_date IS NOT NULL, CONCAT(' | Expires: ', DATE_FORMAT(NEW.expiry_date, '%b %d, %Y')), '')), NULL
      FROM products p LEFT JOIN Suppliers s ON s.Product_ID = p.id
      WHERE p.id = NEW.product_id LIMIT 1;
    END`,
  },
  trg_batch_status_change: {
    table: "batches", timing: "after", event: "update",
    action: `BEGIN
      IF OLD.status != NEW.status THEN
        INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
        SELECT COALESCE(s.Supplier_ID, 0), COALESCE(s.SupplierName, 'Unknown Supplier'),
          CASE NEW.status WHEN 'withdrawn' THEN 'Stock Withdrawn'
          WHEN 'returned' THEN 'Stock Returned' WHEN 'expired' THEN 'Batch Expired'
          ELSE CONCAT('Status Changed to ', NEW.status) END,
          CONCAT('Product: ', COALESCE(p.name, CONCAT('ID ', NEW.product_id)),
          ' | Batch #', NEW.batch_id, ' | Remaining: ', NEW.remaining_qty, ' ', NEW.unit), NULL
        FROM products p LEFT JOIN Suppliers s ON s.Product_ID = p.id
        WHERE p.id = NEW.product_id LIMIT 1;
      END IF;
    END`,
  },
};

function sqlTokens(sql) {
  return String(sql || "").match(
    /'(?:''|\\.|[^'])*'|`[^`]*`|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?|<>|!=|<=|>=|:=|[(),;.=+*/<>-]/g,
  ) || [];
}

function normalizeTriggerSql(sql) {
  return sqlTokens(sql)
    .map((token) => {
      if (token.startsWith("'")) return token;
      if (token.startsWith("`")) return token.slice(1, -1).toLowerCase();
      return token.toLowerCase();
    })
    .join(" ");
}

function compareSets(label, expectedValues, actualValues) {
  const expected = new Set(expectedValues);
  const actual = new Set(actualValues);
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  if (missing.length || unexpected.length) {
    throw createSchemaCompatibilityError(`${label} do not match the Phase 3 contract.`, {
      missing,
      unexpected,
    });
  }
}

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, "``")}\``;
}

function groupForeignKeyRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${normalizeIdentifier(row.TABLE_NAME)}|${normalizeIdentifier(row.CONSTRAINT_NAME)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        table: row.TABLE_NAME,
        constraint: row.CONSTRAINT_NAME,
        parentTable: row.REFERENCED_TABLE_NAME,
        updateRule: normalizeIdentifier(row.UPDATE_RULE),
        deleteRule: normalizeIdentifier(row.DELETE_RULE),
        columns: [],
      });
    }
    groups.get(key).columns.push({
      position: Number(row.ORDINAL_POSITION),
      child: row.COLUMN_NAME,
      parent: row.REFERENCED_COLUMN_NAME,
    });
  }
  for (const group of groups.values()) {
    group.columns.sort((a, b) => a.position - b.position);
  }
  return [...groups.values()];
}

function foreignKeySignature(group) {
  return [
    normalizeIdentifier(group.table), normalizeIdentifier(group.constraint),
    group.columns.map((column) => normalizeIdentifier(column.child)).join(","),
    normalizeIdentifier(group.parentTable),
    group.columns.map((column) => normalizeIdentifier(column.parent)).join(","),
    group.updateRule, group.deleteRule,
  ].join("|");
}

function foreignKeyShapeSignature(group) {
  return [
    normalizeIdentifier(group.table),
    group.columns.map((column) => normalizeIdentifier(column.child)).join(","),
    normalizeIdentifier(group.parentTable),
    group.columns.map((column) => normalizeIdentifier(column.parent)).join(","),
    group.updateRule,
    group.deleteRule,
  ].join("|");
}

function expectedForeignKeyShape(signature) {
  const [table, _constraint, children, parentTable, parents, updateRule, deleteRule] =
    signature.split("|");
  return [table, children, parentTable, parents, updateRule, deleteRule].join("|");
}

function indexShape(signature) {
  const [table, _indexName, unique, columns] = signature.split("|");
  return [table, unique, columns].join("|");
}

async function validateOrphans(db, foreignKeys) {
  const results = [];
  for (const fk of foreignKeys) {
    const child = quoteIdentifier(fk.table);
    const parent = quoteIdentifier(fk.parentTable);
    const joins = fk.columns.map((column) =>
      `p.${quoteIdentifier(column.parent)} = c.${quoteIdentifier(column.child)}`,
    ).join(" AND ");
    const childIsPresent = fk.columns.map((column) =>
      `c.${quoteIdentifier(column.child)} IS NOT NULL`,
    ).join(" AND ");
    const parentIsMissing = `p.${quoteIdentifier(fk.columns[0].parent)} IS NULL`;
    const [rows] = await db.query(
      `SELECT COUNT(*) AS orphan_count
         FROM ${child} c
         LEFT JOIN ${parent} p ON ${joins}
        WHERE ${childIsPresent}
          AND ${parentIsMissing}`,
    );
    const count = Number(rows?.[0]?.orphan_count);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw createSchemaCompatibilityError(
        `Orphan validation returned an invalid count for ${fk.constraint}.`,
      );
    }
    results.push({
      table: normalizeIdentifier(fk.table),
      constraint: normalizeIdentifier(fk.constraint),
      count,
    });
  }

  const orphans = results.filter((result) => result.count !== 0);
  if (orphans.length > 0) {
    throw createSchemaCompatibilityError(
      "Foreign-key orphans are not permitted by the fresh-database schema contract.",
      { orphans },
    );
  }
  return results;
}

async function verifySchemaCompatibility(db, expectedDatabaseName) {
  const warnings = [];
  const expectedDatabase = String(expectedDatabaseName || "").trim();
  const [[identity]] = await db.query(
    "SELECT DATABASE() AS database_name, @@version AS server_version",
  );
  if (!expectedDatabase || identity?.database_name !== expectedDatabase) {
    throw createSchemaCompatibilityError("Connected database identity is not the explicitly configured database.", {
      expectedDatabase,
      actualDatabase: identity?.database_name || null,
    });
  }

  const [objects] = await db.query(
    `SELECT TABLE_NAME, TABLE_TYPE
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tables = objects
    .filter((row) => String(row.TABLE_TYPE).toUpperCase() === "BASE TABLE")
    .map((row) => normalizeIdentifier(row.TABLE_NAME));
  const views = objects
    .filter((row) => String(row.TABLE_TYPE).toUpperCase() === "VIEW")
    .map((row) => normalizeIdentifier(row.TABLE_NAME));
  compareSets("Database tables", EXPECTED_TABLES, tables);
  if (views.length > 0) {
    throw createSchemaCompatibilityError("Unexpected views are present.", { views: views.sort() });
  }

  const [routineRows] = await db.query(
    `SELECT ROUTINE_NAME, ROUTINE_TYPE
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = DATABASE()`,
  );
  const [eventRows] = await db.query(
    `SELECT EVENT_NAME
       FROM information_schema.EVENTS
      WHERE EVENT_SCHEMA = DATABASE()`,
  );
  if (routineRows.length > 0 || eventRows.length > 0) {
    throw createSchemaCompatibilityError(
      "Unexpected routines or events are present.",
      {
        routines: routineRows.map((row) => normalizeIdentifier(row.ROUTINE_NAME)),
        events: eventRows.map((row) => normalizeIdentifier(row.EVENT_NAME)),
      },
    );
  }

  const [columnRows] = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const columnMap = new Map(columnRows.map((row) => [
    `${normalizeIdentifier(row.TABLE_NAME)}.${normalizeIdentifier(row.COLUMN_NAME)}`,
    row,
  ]));
  const columnMismatches = [];
  for (const [table, columns] of Object.entries(CRITICAL_COLUMNS)) {
    for (const [column, [type, nullable]] of Object.entries(columns)) {
      const actual = columnMap.get(`${table}.${column}`);
      if (!actual || normalizeIdentifier(actual.COLUMN_TYPE) !== normalizeIdentifier(type) ||
          (String(actual.IS_NULLABLE).toUpperCase() === "YES") !== nullable) {
        columnMismatches.push(`${table}.${column}`);
      }
    }
  }
  if (columnMismatches.length > 0) {
    throw createSchemaCompatibilityError("Critical column definitions do not match the Phase 3 contract.", {
      columns: columnMismatches,
    });
  }

  const [indexRows] = await db.query(
    `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
  );
  const indexGroups = new Map();
  for (const row of indexRows) {
    const key = `${normalizeIdentifier(row.TABLE_NAME)}|${normalizeIdentifier(row.INDEX_NAME)}`;
    if (!indexGroups.has(key)) indexGroups.set(key, []);
    indexGroups.get(key).push(row);
  }
  const indexSignatures = [...indexGroups.entries()].map(([key, rows]) => {
    const unique = Number(rows[0].NON_UNIQUE) === 0 ? 1 : 0;
    const columns = rows
      .sort((a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX))
      .map((row) => normalizeIdentifier(row.COLUMN_NAME)).join(",");
    return `${key}|${unique}|${columns}`;
  });
  const expectedIndexShapes = new Set(EXPECTED_INDEXES.map(indexShape));
  const actualIndexShapes = new Set(indexSignatures.map(indexShape));
  let missingIndexShapes = [...expectedIndexShapes]
    .filter((signature) => !actualIndexShapes.has(signature))
    .sort();
  const expectedReusablePaymentReferenceIndex = "orders|0|payment_reference";
  const legacyUniquePaymentReferenceIndex = "orders|1|payment_reference";
  if (
    missingIndexShapes.includes(expectedReusablePaymentReferenceIndex) &&
    actualIndexShapes.has(legacyUniquePaymentReferenceIndex)
  ) {
    missingIndexShapes = missingIndexShapes.filter(
      (signature) => signature !== expectedReusablePaymentReferenceIndex,
    );
    warnings.push(
      "orders.payment_reference remains globally unique; run the third-party reference reuse migration after deploying the application-level duplicate-payment guard.",
    );
  }
  if (missingIndexShapes.length > 0) {
    throw createSchemaCompatibilityError(
      "Database indexes do not satisfy the canonical schema contract.",
      { missing: missingIndexShapes },
    );
  }

  const [foreignKeyRows] = await db.query(
    `SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME,
            kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
            kcu.ORDINAL_POSITION, rc.UPDATE_RULE, rc.DELETE_RULE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
         ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.TABLE_NAME = kcu.TABLE_NAME
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
      WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
  );
  const foreignKeys = groupForeignKeyRows(foreignKeyRows);
  compareSets(
    "Foreign-key definitions",
    EXPECTED_FOREIGN_KEYS.map(expectedForeignKeyShape),
    foreignKeys.map(foreignKeyShapeSignature),
  );

  const [triggerRows] = await db.query(
    `SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_TIMING,
            EVENT_MANIPULATION, ACTION_STATEMENT
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()`,
  );
  const actualTriggerNames = triggerRows.map((row) => normalizeIdentifier(row.TRIGGER_NAME));
  compareSets("Database triggers", Object.keys(EXPECTED_TRIGGERS), actualTriggerNames);
  const triggerMismatches = [];
  for (const row of triggerRows) {
    const name = normalizeIdentifier(row.TRIGGER_NAME);
    const expected = EXPECTED_TRIGGERS[name];
    if (!expected || normalizeIdentifier(row.EVENT_OBJECT_TABLE) !== expected.table ||
        normalizeIdentifier(row.ACTION_TIMING) !== expected.timing ||
        normalizeIdentifier(row.EVENT_MANIPULATION) !== expected.event ||
        normalizeTriggerSql(row.ACTION_STATEMENT) !== normalizeTriggerSql(expected.action)) {
      triggerMismatches.push(name);
    }
  }
  if (triggerMismatches.length > 0) {
    throw createSchemaCompatibilityError("Trigger definitions do not match the verified recovery baseline.", {
      triggers: triggerMismatches,
    });
  }

  const orphanResults = await validateOrphans(db, foreignKeys);
  return {
    database: expectedDatabase,
    serverVersion: identity.server_version,
    tableCount: tables.length,
    indexCount: indexSignatures.length,
    foreignKeyCount: foreignKeys.length,
    triggerCount: triggerRows.length,
    routineCount: 0,
    eventCount: 0,
    orphanCount: 0,
    warnings,
    orphanResults,
  };
}

module.exports = {
  CRITICAL_COLUMNS,
  EXPECTED_FOREIGN_KEYS,
  EXPECTED_INDEXES,
  EXPECTED_TABLES,
  EXPECTED_TRIGGERS,
  compareSets,
  foreignKeySignature,
  foreignKeyShapeSignature,
  groupForeignKeyRows,
  normalizeTriggerSql,
  verifySchemaCompatibility,
};
