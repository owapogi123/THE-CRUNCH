"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "legacy";

const state = {
  units: [
    {
      unit_id: 1,
      name: "Kilogram",
      abbreviation: "kg",
      base_unit: null,
      conversion_to_base: null,
      is_active: 1,
    },
  ],
  sql: [],
};

function unitById(id) {
  return state.units.find((unit) => Number(unit.unit_id) === Number(id));
}

function responseUnit(unit) {
  return unit ? { ...unit, created_at: null, updated_at: null } : undefined;
}

function updateUnit(sql, params) {
  const unit = unitById(params.at(-1));
  if (!unit) return 0;
  if (/SET is_active = FALSE/i.test(sql)) {
    unit.is_active = 0;
    return 1;
  }
  const assignments = sql.match(/SET (.+) WHERE unit_id = \?/i)?.[1] || "";
  let index = 0;
  for (const assignment of assignments.split(",")) {
    const column = assignment.trim().match(/^(\w+) =/i)?.[1];
    if (column) unit[column] = params[index++];
  }
  return 1;
}

const dbMock = {
  async getConnection() {
    throw new Error("Legacy inventory unit routes must retain direct-query behavior");
  },
  async query(sql, params = []) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    state.sql.push(normalized);
    assert.match(normalized, /\binventory_units\b/);

    if (/^SELECT unit_id FROM inventory_units/i.test(normalized)) {
      const [name, excludedId] = params;
      const duplicate = state.units.find(
        (unit) =>
          unit.name.toLowerCase() === String(name).toLowerCase() &&
          (excludedId === undefined || Number(unit.unit_id) !== Number(excludedId)),
      );
      return [duplicate ? [{ unit_id: duplicate.unit_id }] : []];
    }
    if (/^INSERT INTO inventory_units/i.test(normalized)) {
      const unitId = Math.max(...state.units.map((unit) => unit.unit_id)) + 1;
      state.units.push({
        unit_id: unitId,
        name: String(params[0]),
        abbreviation: params[1],
        base_unit: params[2],
        conversion_to_base: params[3],
        is_active: 1,
      });
      return [{ insertId: unitId, affectedRows: 1 }];
    }
    if (/^SELECT unit_id, name, abbreviation, base_unit,/i.test(normalized)) {
      if (/WHERE unit_id = \?/i.test(normalized)) {
        const unit = unitById(params[0]);
        return [unit ? [responseUnit(unit)] : []];
      }
      const activeOnly = /WHERE is_active = TRUE/i.test(normalized);
      return [state.units
        .filter((unit) => !activeOnly || unit.is_active === 1)
        .map(responseUnit)];
    }
    if (/^UPDATE inventory_units SET/i.test(normalized)) {
      return [{ affectedRows: updateUnit(normalized, params) }];
    }
    throw new Error(`Unexpected legacy inventory unit SQL: ${normalized}`);
  },
};

const dbId = require.resolve("../config/db");
require.cache[dbId] = {
  id: dbId,
  filename: dbId,
  loaded: true,
  exports: dbMock,
};
const router = require("./settingsRoutes");

function route(path, method) {
  const layer = router.stack.find(
    (entry) => entry.route?.path === path && entry.route.methods?.[method],
  );
  assert.ok(layer, `${method.toUpperCase()} ${path} route missing`);
  if (method !== "get") {
    assert.ok(layer.route.stack.length >= 2, "administrator middleware must remain attached");
  }
  return layer.route.stack.at(-1).handle;
}

async function invoke(path, method, { id = 0, body = {}, query = {} } = {}) {
  const result = { statusCode: 200, body: null };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(value) {
      result.body = value;
      return this;
    },
  };
  await route(path, method)({ params: { id: String(id) }, body, query }, res);
  return result;
}

(async () => {
  const listed = await invoke("/inventory-units", "get");
  assert.equal(listed.statusCode, 200);
  assert.equal(listed.body[0].name, "Kilogram");

  const created = await invoke("/inventory-units", "post", {
    body: {
      name: "Gram",
      abbreviation: "g",
      base_unit: "Kilogram",
      conversion_to_base: 0.001,
    },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.base_unit, "Kilogram");

  const updated = await invoke("/inventory-units/:id", "patch", {
    id: created.body.unit_id,
    body: { name: "Grams", abbreviation: "gm", is_active: false },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.name, "Grams");
  assert.equal(updated.body.is_active, 0);

  const disabled = await invoke("/inventory-units/:id", "delete", {
    id: created.body.unit_id,
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(unitById(created.body.unit_id).is_active, 0);

  assert.equal(
    state.sql.every((sql) => /\binventory_units\b/.test(sql)),
    true,
  );
  console.log("legacy inventory unit regression tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
