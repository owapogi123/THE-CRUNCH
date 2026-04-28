require("dotenv").config();
const mysql = require("mysql2/promise");

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "pos_system";
const DB_PORT = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

async function ensureColumn(connection, tableName, columnName, definitionSql) {
  const [rows] = await connection.query(
    `SHOW COLUMNS FROM \`${tableName}\` LIKE ?`,
    [columnName],
  );
  if (rows.length === 0) {
    await connection.query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN ${definitionSql}`,
    );
    console.log(`Added column ${columnName} to ${tableName}`);
  }
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    "SHOW TABLES LIKE ?",
    [tableName],
  );
  return rows.length > 0;
}

async function setup(options = {}) {
  const {
    shouldReset = process.argv.includes("--reset"),
    exitOnError = false,
    log = console,
  } = options;
  let connection;
  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: DB_PORT,
      multipleStatements: true,
    });

    log.log(
      `Connected to MySQL server ${DB_HOST}:${DB_PORT} as ${DB_USER}`,
    );

    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    log.log(`Database checked/created: ${DB_NAME}`);

    // Use the database
    await connection.query(`USE \`${DB_NAME}\``);

    // Drop tables if they exist (order chosen to satisfy foreign keys)
    const dropStatements = [
      "DROP TABLE IF EXISTS purchase_order_items;",
      "DROP TABLE IF EXISTS purchase_orders;",
      "DROP TABLE IF EXISTS po_counter;",
      "DROP TABLE IF EXISTS feedback;",
      "DROP TABLE IF EXISTS Order_Tracking;",
      "DROP TABLE IF EXISTS Kitchen;",
      "DROP TABLE IF EXISTS Receipt;",
      "DROP TABLE IF EXISTS payments;",
      "DROP TABLE IF EXISTS Payments;",
      "DROP TABLE IF EXISTS order_item;",
      "DROP TABLE IF EXISTS Order_Item;",
      "DROP TABLE IF EXISTS orders;",
      "DROP TABLE IF EXISTS Orders;",
      "DROP TABLE IF EXISTS Stock_Status;",
      "DROP TABLE IF EXISTS Suppliers;",
      "DROP TABLE IF EXISTS Inventory;",
      "DROP TABLE IF EXISTS batches;",
      "DROP TABLE IF EXISTS Batches;",
      "DROP TABLE IF EXISTS Menu;",
      "DROP TABLE IF EXISTS Categories;",
      "DROP TABLE IF EXISTS supplier_history;",
      "DROP TABLE IF EXISTS Reports;",
      "DROP TABLE IF EXISTS Customers;",
      "DROP TABLE IF EXISTS Cook;",
      "DROP TABLE IF EXISTS Cashier;",
      "DROP TABLE IF EXISTS Admin;",
    ].join("\n");

    if (shouldReset) {
      await connection.query(dropStatements);
      log.log("Existing tables dropped (reset mode).");
    } else {
      log.log(
        "Safe setup mode: existing tables/data kept. Use --reset to drop tables.",
      );
    }

    // Create tables
    const createStatements = `
CREATE TABLE IF NOT EXISTS Admin (
    Admin_ID INT AUTO_INCREMENT PRIMARY KEY,
    UserName VARCHAR(100) NOT NULL,
    Email VARCHAR(150) UNIQUE NOT NULL,
    Password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS Cashier (
    Cashier_ID INT AUTO_INCREMENT PRIMARY KEY,
    UserName VARCHAR(100) NOT NULL,
    Password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS Cook (
    Cook_ID INT AUTO_INCREMENT PRIMARY KEY,
    Orders TEXT
);

CREATE TABLE IF NOT EXISTS Customers (
    Customer_ID INT AUTO_INCREMENT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('administrator','cashier','cook','inventory_manager','customer') NOT NULL DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Categories (
    Category_ID INT AUTO_INCREMENT PRIMARY KEY,
    Product_Name VARCHAR(150) NOT NULL
);

CREATE TABLE IF NOT EXISTS Menu (
    Product_ID INT AUTO_INCREMENT PRIMARY KEY,
    Category_ID INT,
    Category_Name VARCHAR(150),
    Product_Name VARCHAR(150) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    Availability BOOLEAN DEFAULT TRUE,
    Promo VARCHAR(100),
    Stock INT DEFAULT 0,
    FOREIGN KEY (Category_ID) REFERENCES Categories(Category_ID)
);

  CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    quantity INT DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE IF NOT EXISTS Inventory (
    Inventory_ID INT AUTO_INCREMENT PRIMARY KEY,
    Product_ID INT,
    Quantity INT NOT NULL,
    Stock INT,
    Reorder_Point DECIMAL(10,2) DEFAULT 20,
    Critical_Point DECIMAL(10,2) DEFAULT 5,
    Item_Purchased VARCHAR(150),
    Last_Update DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (Product_ID) REFERENCES Menu(Product_ID)
);

CREATE TABLE IF NOT EXISTS batches (
    batch_id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT,
    delivery_batch_id VARCHAR(50),
    quantity DECIMAL(10,2) NOT NULL,
    remaining_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(50),
    received_date DATE NOT NULL,
    expiry_date DATE NULL,
    shelf_life_days INT DEFAULT NULL,
    shelf_life_hours INT DEFAULT NULL,
    usable_until DATETIME DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active',
    returned_qty DECIMAL(10,2) DEFAULT 0,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES Menu(Product_ID)
);

CREATE TABLE IF NOT EXISTS kitchen_batches (
    kitchen_batch_id INT PRIMARY KEY AUTO_INCREMENT,
    storage_batch_id INT NULL,
    product_id INT NOT NULL,
    withdrawn_qty DECIMAL(10,2) NOT NULL,
    used_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    returned_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'kg',
    expiry_date DATE NULL,
    withdrawn_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('active','reconciled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Suppliers (
    Supplier_ID INT AUTO_INCREMENT PRIMARY KEY,
    SupplierName VARCHAR(150) NOT NULL,
    Contact_Number VARCHAR(50),
    Delivery_Schedule VARCHAR(100),
    Email VARCHAR(255),
    Products_Supplied TEXT,
    Product_ID INT,
    FOREIGN KEY (Product_ID) REFERENCES Menu(Product_ID)
);

CREATE TABLE IF NOT EXISTS Stock_Status (
    Status_ID INT AUTO_INCREMENT PRIMARY KEY,
    Product_ID INT,
    Type VARCHAR(50),
    Quantity INT,
    Status_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    RecordedBy INT,
    FOREIGN KEY (Product_ID) REFERENCES Menu(Product_ID),
    FOREIGN KEY (RecordedBy) REFERENCES Admin(Admin_ID)
);

CREATE TABLE IF NOT EXISTS orders (
    Order_ID INT AUTO_INCREMENT PRIMARY KEY,
    Customer_ID INT,
    Cashier_ID INT,
    Order_Type VARCHAR(50),
    Status VARCHAR(50),
    Total_Amount DECIMAL(10,2),
    Order_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Customer_ID) REFERENCES Customers(Customer_ID),
    FOREIGN KEY (Cashier_ID) REFERENCES Cashier(Cashier_ID)
);

CREATE TABLE IF NOT EXISTS order_item (
    Order_Item_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Product_ID INT,
    Quantity INT NOT NULL,
    Subtotal DECIMAL(10,2),
    FOREIGN KEY (Order_ID) REFERENCES orders(Order_ID),
    FOREIGN KEY (Product_ID) REFERENCES Menu(Product_ID)
);

CREATE TABLE IF NOT EXISTS payments (
    Payment_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Payment_Type VARCHAR(50),
    Payment_Status VARCHAR(50),
    Payment_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    ProcessBy INT,
    FOREIGN KEY (Order_ID) REFERENCES orders(Order_ID),
    FOREIGN KEY (ProcessBy) REFERENCES Cashier(Cashier_ID)
);

CREATE TABLE IF NOT EXISTS Receipt (
    Receipt_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Receipt_Number VARCHAR(100) UNIQUE,
    Date_Issued DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Order_ID) REFERENCES orders(Order_ID)
);

CREATE TABLE IF NOT EXISTS Kitchen (
    Kitchen_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Status VARCHAR(50),
    Time_Update DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UpdatedBy INT,
    FOREIGN KEY (Order_ID) REFERENCES orders(Order_ID),
    FOREIGN KEY (UpdatedBy) REFERENCES Cook(Cook_ID)
);

CREATE TABLE IF NOT EXISTS Order_Tracking (
    Tracking_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    PickupBy VARCHAR(150),
    Pickup_TIME DATETIME,
    FOREIGN KEY (Order_ID) REFERENCES orders(Order_ID)
);

CREATE TABLE IF NOT EXISTS Reports (
    Report_ID INT AUTO_INCREMENT PRIMARY KEY,
    Report_Type VARCHAR(100),
    Total_Sales DECIMAL(15,2),
    Total_Transaction INT,
    GeneratedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS supplier_history (
  history_id INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL DEFAULT 0,
  supplier_name VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  performed_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS po_counter (
    id INT PRIMARY KEY DEFAULT 1,
    value INT NOT NULL DEFAULT 0,
    CHECK (id = 1)
);

INSERT IGNORE INTO po_counter (id, value) VALUES (1, 0);

CREATE TABLE IF NOT EXISTS purchase_orders (
    po_id VARCHAR(12) NOT NULL PRIMARY KEY,
    supplier VARCHAR(255) NOT NULL,
    contact VARCHAR(100) DEFAULT '',
    order_date DATE NOT NULL,
    delivery_date DATE NOT NULL,
    status ENUM('Draft','Ordered','Received','Cancelled') NOT NULL DEFAULT 'Draft',
    notes TEXT DEFAULT NULL,
    receipt_no VARCHAR(255) DEFAULT NULL,
    received_by VARCHAR(255) DEFAULT NULL,
    received_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
    item_id INT PRIMARY KEY AUTO_INCREMENT,
    po_id VARCHAR(12) NOT NULL,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT '',
    unit VARCHAR(50) DEFAULT '',
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
    expected_expiry_date DATE DEFAULT NULL,
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS kitchen_usage_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    report_date DATE NOT NULL,
    status ENUM('draft','submitted','finalized') NOT NULL DEFAULT 'draft',
    prepared_by INT NULL,
    finalized_by INT NULL,
    finalized_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_kitchen_usage_report_date (report_date)
);

CREATE TABLE IF NOT EXISTS kitchen_usage_items (
    usage_item_id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    product_id INT NULL,
    product_name VARCHAR(255) NOT NULL,
    category VARCHAR(120) DEFAULT '',
    unit VARCHAR(50) DEFAULT 'unit',
    withdrawn_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    used_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    spoilage_qty DECIMAL(10,2) NOT NULL DEFAULT 0,
    note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_kitchen_usage_items_report
      FOREIGN KEY (report_id) REFERENCES kitchen_usage_reports(report_id)
      ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback (
    feedback_id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    customer_user_id INT NULL,
    rating INT NULL,
    comment TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_feedback_product
      FOREIGN KEY (product_id) REFERENCES Menu(Product_ID),
    CONSTRAINT fk_feedback_customer
      FOREIGN KEY (customer_user_id) REFERENCES users(id)
      ON DELETE SET NULL
);
`;

    await connection.query(createStatements);
    log.log("Tables created.");

    if (!(await tableExists(connection, "orders")) && (await tableExists(connection, "Orders"))) {
      await connection.query("RENAME TABLE `Orders` TO `orders`");
      log.log("Renamed Orders to orders");
    }
    if (!(await tableExists(connection, "order_item")) && (await tableExists(connection, "Order_Item"))) {
      await connection.query("RENAME TABLE `Order_Item` TO `order_item`");
      log.log("Renamed Order_Item to order_item");
    }
    if (!(await tableExists(connection, "payments")) && (await tableExists(connection, "Payments"))) {
      await connection.query("RENAME TABLE `Payments` TO `payments`");
      log.log("Renamed Payments to payments");
    }
    if (!(await tableExists(connection, "batches")) && (await tableExists(connection, "Batches"))) {
      await connection.query("RENAME TABLE `Batches` TO `batches`");
      log.log("Renamed Batches to batches");
    }

    // Keep DB triggers aligned with actual Suppliers/products and Batches schemas.
    await connection.query(`DROP TRIGGER IF EXISTS trg_batch_received`);
    await connection.query(`DROP TRIGGER IF EXISTS trg_batch_status_change`);

    const [batchColumns] = await connection.query(`SHOW COLUMNS FROM batches`);
    const batchFieldSet = new Set(
      batchColumns.map((c) => String(c.Field).toLowerCase()),
    );

    const batchProductCol = batchFieldSet.has("product_id")
      ? "product_id"
      : "productId";
    const batchExpiryCol = batchFieldSet.has("expiry_date")
      ? "expiry_date"
      : "expiresAt";
    const batchIdCol = batchFieldSet.has("batch_id") ? "batch_id" : "id";
    const batchRemainingCol = batchFieldSet.has("remaining_qty")
      ? "remaining_qty"
      : "quantity";
    const hasStatusColumn = batchFieldSet.has("status");

    await connection.query(`
CREATE TRIGGER trg_batch_received
AFTER INSERT ON batches
FOR EACH ROW
BEGIN
  INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
  SELECT
    COALESCE(s.Supplier_ID, 0),
    COALESCE(s.SupplierName, 'Unknown Supplier'),
    'Batch Received',
    CONCAT(
      'Product: ', COALESCE(p.name, CONCAT('ID ', NEW.${batchProductCol})),
      ' | Qty: ', NEW.quantity, ' ', NEW.unit,
      IF(NEW.${batchExpiryCol} IS NOT NULL, CONCAT(' | Expires: ', DATE_FORMAT(NEW.${batchExpiryCol}, '%b %d, %Y')), '')
    ),
    NULL
  FROM products p
  LEFT JOIN Suppliers s ON s.Product_ID = p.id
  WHERE p.id = NEW.${batchProductCol}
  LIMIT 1;
END
`);

    if (hasStatusColumn) {
      await connection.query(`
CREATE TRIGGER trg_batch_status_change
AFTER UPDATE ON batches
FOR EACH ROW
BEGIN
  IF OLD.status != NEW.status THEN
    INSERT INTO supplier_history (supplier_id, supplier_name, action, details, performed_by)
    SELECT
      COALESCE(s.Supplier_ID, 0),
      COALESCE(s.SupplierName, 'Unknown Supplier'),
      CASE NEW.status
        WHEN 'withdrawn' THEN 'Stock Withdrawn'
        WHEN 'returned' THEN 'Stock Returned'
        WHEN 'expired' THEN 'Batch Expired'
        ELSE CONCAT('Status Changed to ', NEW.status)
      END,
      CONCAT(
        'Product: ', COALESCE(p.name, CONCAT('ID ', NEW.${batchProductCol})),
        ' | Batch #', NEW.${batchIdCol},
        ' | Remaining: ', NEW.${batchRemainingCol}, ' ', NEW.unit
      ),
      NULL
    FROM products p
    LEFT JOIN Suppliers s ON s.Product_ID = p.id
    WHERE p.id = NEW.${batchProductCol}
    LIMIT 1;
  END IF;
END
`);
    }

    // Ensure Inventory has stock movement summary columns.
    await ensureColumn(
      connection,
      "Inventory",
      "Daily_Withdrawn",
      "`Daily_Withdrawn` DECIMAL(10,2) DEFAULT 0",
    );
    await ensureColumn(
      connection,
      "Inventory",
      "Returned",
      "`Returned` DECIMAL(10,2) DEFAULT 0",
    );
    await ensureColumn(
      connection,
      "Inventory",
      "Wasted",
      "`Wasted` DECIMAL(10,2) DEFAULT 0",
    );

    await ensureColumn(
      connection,
      "products",
      "image",
      "`image` LONGTEXT NULL",
    );
    await ensureColumn(
      connection,
      "products",
      "menu_code",
      "`menu_code` VARCHAR(20) NULL",
    );
    await ensureColumn(
      connection,
      "products",
      "availability_status",
      "`availability_status` VARCHAR(20) DEFAULT 'Available'",
    );
    await ensureColumn(
      connection,
      "products",
      "is_promotional",
      "`is_promotional` TINYINT(1) DEFAULT 0",
    );
    await ensureColumn(
      connection,
      "products",
      "promo_price",
      "`promo_price` DECIMAL(10,2) NULL",
    );
    await ensureColumn(
      connection,
      "products",
      "promo_label",
      "`promo_label` VARCHAR(100) NULL",
    );

    await ensureColumn(
      connection,
      "orders",
      "startedAt",
      "`startedAt` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "customer_user_id",
      "`customer_user_id` INT NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "payment_reference",
      "`payment_reference` VARCHAR(255) NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "payment_status",
      "`payment_status` VARCHAR(50) NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "payment_method",
      "`payment_method` VARCHAR(50) NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "proof_image_url",
      "`proof_image_url` VARCHAR(500) NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "verified_by",
      "`verified_by` INT NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "verified_at",
      "`verified_at` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "stock_deducted",
      "`stock_deducted` TINYINT(1) NOT NULL DEFAULT 0",
    );
    await ensureColumn(
      connection,
      "orders",
      "handoverTimestamp",
      "`handoverTimestamp` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "riderName",
      "`riderName` VARCHAR(255) NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "queuedAt",
      "`queuedAt` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "prepStartedAt",
      "`prepStartedAt` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "readyAt",
      "`readyAt` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "dueAt",
      "`dueAt` DATETIME NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "estimatedPrepMinutes",
      "`estimatedPrepMinutes` INT NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "timerUpdatedBy",
      "`timerUpdatedBy` INT NULL",
    );
    await ensureColumn(
      connection,
      "orders",
      "timerUpdatedAt",
      "`timerUpdatedAt` DATETIME NULL",
    );

    await ensureColumn(
      connection,
      "purchase_orders",
      "receipt_no",
      "`receipt_no` VARCHAR(255) DEFAULT NULL",
    );
    await ensureColumn(
      connection,
      "purchase_order_items",
      "expected_expiry_date",
      "`expected_expiry_date` DATE DEFAULT NULL",
    );

    await ensureColumn(
      connection,
      "kitchen_usage_reports",
      "prepared_by",
      "`prepared_by` INT NULL",
    );
    await ensureColumn(
      connection,
      "kitchen_usage_reports",
      "finalized_by",
      "`finalized_by` INT NULL",
    );
    await ensureColumn(
      connection,
      "kitchen_usage_reports",
      "finalized_at",
      "`finalized_at` DATETIME NULL",
    );

    if (await tableExists(connection, "feedback")) {
      await ensureColumn(
        connection,
        "feedback",
        "product_id",
        "`product_id` INT NOT NULL",
      );
      await ensureColumn(
        connection,
        "feedback",
        "customer_user_id",
        "`customer_user_id` INT NULL",
      );
      await ensureColumn(
        connection,
        "feedback",
        "rating",
        "`rating` INT NULL",
      );
      await ensureColumn(
        connection,
        "feedback",
        "comment",
        "`comment` TEXT NOT NULL",
      );
      await ensureColumn(
        connection,
        "feedback",
        "created_at",
        "`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
      );
    }

    log.log("Database setup completed successfully.");
    return true;
  } catch (err) {
    log.error("Database setup failed:", err);
    if (exitOnError) {
      process.exitCode = 1;
    }
    throw err;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = {
  setup,
};

if (require.main === module) {
  setup({ exitOnError: true }).catch(() => undefined);
}
