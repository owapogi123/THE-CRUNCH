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

async function setup() {
  let connection;
  const shouldReset = process.argv.includes("--reset");
  try {
    connection = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: DB_PORT,
      multipleStatements: true,
    });

    console.log(
      `Connected to MySQL server ${DB_HOST}:${DB_PORT} as ${DB_USER}`,
    );

    // Create database if it doesn't exist
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    console.log(`Database checked/created: ${DB_NAME}`);

    // Use the database
    await connection.query(`USE \`${DB_NAME}\``);

    // Drop tables if they exist (order chosen to satisfy foreign keys)
    const dropStatements = [
      "DROP TABLE IF EXISTS purchase_order_items;",
      "DROP TABLE IF EXISTS purchase_orders;",
      "DROP TABLE IF EXISTS po_counter;",
      "DROP TABLE IF EXISTS Order_Tracking;",
      "DROP TABLE IF EXISTS Kitchen;",
      "DROP TABLE IF EXISTS Receipt;",
      "DROP TABLE IF EXISTS Payments;",
      "DROP TABLE IF EXISTS Order_Item;",
      "DROP TABLE IF EXISTS Orders;",
      "DROP TABLE IF EXISTS Stock_Status;",
      "DROP TABLE IF EXISTS Suppliers;",
      "DROP TABLE IF EXISTS Inventory;",
      "DROP TABLE IF EXISTS Batches;",
      "DROP TABLE IF EXISTS Menu;",
      "DROP TABLE IF EXISTS Categories;",
      "DROP TABLE IF EXISTS Reports;",
      "DROP TABLE IF EXISTS Customers;",
      "DROP TABLE IF EXISTS Cook;",
      "DROP TABLE IF EXISTS Cashier;",
      "DROP TABLE IF EXISTS Admin;",
    ].join("\n");

    if (shouldReset) {
      await connection.query(dropStatements);
      console.log("Existing tables dropped (reset mode).");
    } else {
      console.log(
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

CREATE TABLE IF NOT EXISTS Batches (
    id VARCHAR(36) PRIMARY KEY,
    productId INT,
    delivery_batch_id VARCHAR(50),
    quantity INT NOT NULL,
    unit VARCHAR(50),
    receivedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    expiresAt DATETIME NULL,
    status VARCHAR(20) DEFAULT 'active',
    FOREIGN KEY (productId) REFERENCES Menu(Product_ID)
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

CREATE TABLE IF NOT EXISTS Orders (
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

CREATE TABLE IF NOT EXISTS Order_Item (
    Order_Item_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Product_ID INT,
    Quantity INT NOT NULL,
    Subtotal DECIMAL(10,2),
    FOREIGN KEY (Order_ID) REFERENCES Orders(Order_ID),
    FOREIGN KEY (Product_ID) REFERENCES Menu(Product_ID)
);

CREATE TABLE IF NOT EXISTS Payments (
    Payment_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Payment_Type VARCHAR(50),
    Payment_Status VARCHAR(50),
    Payment_Date DATETIME DEFAULT CURRENT_TIMESTAMP,
    ProcessBy INT,
    FOREIGN KEY (Order_ID) REFERENCES Orders(Order_ID),
    FOREIGN KEY (ProcessBy) REFERENCES Cashier(Cashier_ID)
);

CREATE TABLE IF NOT EXISTS Receipt (
    Receipt_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Receipt_Number VARCHAR(100) UNIQUE,
    Date_Issued DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Order_ID) REFERENCES Orders(Order_ID)
);

CREATE TABLE IF NOT EXISTS Kitchen (
    Kitchen_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    Status VARCHAR(50),
    Time_Update DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UpdatedBy INT,
    FOREIGN KEY (Order_ID) REFERENCES Orders(Order_ID),
    FOREIGN KEY (UpdatedBy) REFERENCES Cook(Cook_ID)
);

CREATE TABLE IF NOT EXISTS Order_Tracking (
    Tracking_ID INT AUTO_INCREMENT PRIMARY KEY,
    Order_ID INT,
    PickupBy VARCHAR(150),
    Pickup_TIME DATETIME,
    FOREIGN KEY (Order_ID) REFERENCES Orders(Order_ID)
);

CREATE TABLE IF NOT EXISTS Reports (
    Report_ID INT AUTO_INCREMENT PRIMARY KEY,
    Report_Type VARCHAR(100),
    Total_Sales DECIMAL(15,2),
    Total_Transaction INT,
    GeneratedAt DATETIME DEFAULT CURRENT_TIMESTAMP
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
    FOREIGN KEY (po_id) REFERENCES purchase_orders(po_id) ON DELETE CASCADE
);
`;

    await connection.query(createStatements);
    console.log("Tables created.");

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

    console.log("Database setup completed successfully.");
  } catch (err) {
    console.error("Database setup failed:", err);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.end();
  }
}

setup();
