async function hasColumn(db, tableName, columnName) {
  const [rows] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [
    columnName,
  ]);
  return rows.length > 0;
}

async function ensureInventoryUnitColumn(db) {
  if (!(await hasColumn(db, "Inventory", "unit"))) {
    await db.query(
      "ALTER TABLE Inventory ADD COLUMN unit VARCHAR(30) NOT NULL DEFAULT 'piece'",
    );
  }
}

module.exports = {
  ensureInventoryUnitColumn,
  hasColumn,
};
