"use strict";

const assert = require("node:assert/strict");

process.env.DB_SCHEMA_PROFILE = "redesigned";

const state = {
  units: [
    {
      unit_id: 1,
      name: "Kilogram",
      abbreviation: "kg",
      system_key: "kilogram",
      base_unit_id: null,
      conversion_to_base: null,
      is_system: 1,
      is_active: 1,
    },
    {
      unit_id: 2,
      name: "Box",
      abbreviation: "box",
      system_key: null,
      base_unit_id: null,
      conversion_to_base: null,
      is_system: 0,
      is_active: 1,
    },
  ],
  began: 0,
  committed: 0,
  rolledBack: 0,
  released: 0,
  sql: [],
};

function unitById(id) {
  return state.units.find((unit) => Number(unit.unit_id) === Number(id));
}

function responseUnit(unit) {
  if (!unit) return undefined;
  return {
    ...unit,
    base_unit: unitById(unit.base_unit_id)?.name ?? null,
    created_at: null,
    updated_at: null,
  };
}

function applyUnitUpdate(sql, params) {
  const unit = unitById(params.at(-1));
  if (!unit) return 0;
  const assignments = sql.match(/SET (.+) WHERE unit_id = \?/i)?.[1] || "";
  let index = 0;
  for (const assignment of assignments.split(",")) {
    const column = assignment.trim().match(/^(\w+) =/i)?.[1];
    if (!column) continue;
    if (/FALSE/i.test(assignment)) unit[column] = 0;
    else unit[column] = params[index++];
  }
  return 1;
}

function createConnection() {
  let saved;
  return {
    async beginTransaction() {
      state.began += 1;
      saved = structuredClone(state.units);
    },
    async commit() {
      state.committed += 1;
      saved = null;
    },
    async rollback() {
      state.rolledBack += 1;
      if (saved) state.units = saved;
      saved = null;
    },
    release() {
      state.released += 1;
    },
    async query(sql, params = []) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      state.sql.push(normalized);
      assert.doesNotMatch(normalized, /\binventory_units\b|\bbase_unit\s*=/i);

      if (/^SELECT unit_id FROM units WHERE unit_id = \? FOR UPDATE$/i.test(normalized)) {
        const unit = unitById(params[0]);
        return [unit ? [{ unit_id: unit.unit_id }] : []];
      }
      if (/^SELECT unit_id FROM units WHERE LOWER\(name\) = LOWER\(\?\)/i.test(normalized)) {
        const unit = state.units.find(
          (candidate) => candidate.name.toLowerCase() === String(params[0]).toLowerCase(),
        );
        return [unit ? [{ unit_id: unit.unit_id }] : []];
      }
      if (/^SELECT unit_id FROM units WHERE LOWER\(name\).*OR LOWER\(abbreviation\)/i.test(normalized)) {
        const [name, abbreviation] = params;
        const duplicate = state.units.find(
          (unit) =>
            unit.name.toLowerCase() === String(name).toLowerCase() ||
            unit.abbreviation.toLowerCase() === String(abbreviation).toLowerCase(),
        );
        return [duplicate ? [{ unit_id: duplicate.unit_id }] : []];
      }
      if (/^SELECT unit_id FROM units WHERE unit_id <> \?/i.test(normalized)) {
        const [excludedId, name, abbreviation] = params;
        const duplicate = state.units.find(
          (unit) =>
            Number(unit.unit_id) !== Number(excludedId) &&
            (unit.name.toLowerCase() === String(name).toLowerCase() ||
              unit.abbreviation.toLowerCase() === String(abbreviation).toLowerCase()),
        );
        return [duplicate ? [{ unit_id: duplicate.unit_id }] : []];
      }
      if (/^INSERT INTO units \(/i.test(normalized)) {
        const unitId = Math.max(...state.units.map((unit) => unit.unit_id)) + 1;
        state.units.push({
          unit_id: unitId,
          name: String(params[0]),
          abbreviation: String(params[1]),
          system_key: null,
          base_unit_id: params[2] ?? null,
          conversion_to_base: params[3] ?? null,
          is_system: 0,
          is_active: 1,
        });
        return [{ insertId: unitId, affectedRows: 1 }];
      }
      if (/^SELECT u\.unit_id, u\.name, u\.abbreviation/i.test(normalized)) {
        const unit = unitById(params[0]);
        return [unit ? [responseUnit(unit)] : []];
      }
      if (/^SELECT unit_id, name, abbreviation, base_unit_id,/i.test(normalized)) {
        const unit = unitById(params[0]);
        return [unit ? [{ ...unit }] : []];
      }
      if (/^SELECT unit_id, name, is_system FROM units/i.test(normalized)) {
        const unit = unitById(params[0]);
        return [unit ? [{ unit_id: unit.unit_id, name: unit.name, is_system: unit.is_system }] : []];
      }
      if (/^UPDATE units SET/i.test(normalized)) {
        return [{ affectedRows: applyUnitUpdate(normalized, params) }];
      }
      throw new Error(`Unexpected redesigned unit SQL: ${normalized}`);
    },
  };
}

const dbMock = {
  async getConnection() {
    return createConnection();
  },
  async query(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim();
    state.sql.push(normalized);
    assert.match(normalized, /FROM units u LEFT JOIN units base/i);
    assert.doesNotMatch(normalized, /\binventory_units\b/);
    return [state.units.map(responseUnit)];
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
  assert.equal(listed.body[0].unit_id, 1);
  assert.equal(listed.body[0].base_unit_id, null);

  const missingAbbreviation = await invoke("/inventory-units", "post", {
    body: { name: "Bottle" },
  });
  assert.equal(missingAbbreviation.statusCode, 400);

  const created = await invoke("/inventory-units", "post", {
    body: { name: "Container", abbreviation: "ct" },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.body.name, "Container");

  const duplicate = await invoke("/inventory-units", "post", {
    body: { name: "container", abbreviation: "other" },
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.code, "UNIT_ALREADY_EXISTS");

  const updated = await invoke("/inventory-units/:id", "patch", {
    id: created.body.unit_id,
    body: {
      name: "Storage Container",
      abbreviation: "sc",
      base_unit_id: 1,
      conversion_to_base: 2,
    },
  });
  assert.equal(updated.statusCode, 200);
  assert.equal(updated.body.base_unit_id, 1);
  assert.equal(updated.body.base_unit, "Kilogram");

  const protectedUpdate = await invoke("/inventory-units/:id", "patch", {
    id: 1,
    body: { name: "Kilo" },
  });
  assert.equal(protectedUpdate.statusCode, 409);
  assert.equal(protectedUpdate.body.code, "SYSTEM_UNIT_PROTECTED");

  const disabled = await invoke("/inventory-units/:id", "delete", {
    id: created.body.unit_id,
  });
  assert.equal(disabled.statusCode, 200);
  assert.equal(unitById(created.body.unit_id).is_active, 0);

  const protectedDelete = await invoke("/inventory-units/:id", "delete", {
    id: 1,
  });
  assert.equal(protectedDelete.statusCode, 409);
  assert.equal(protectedDelete.body.code, "SYSTEM_UNIT_PROTECTED");

  assert.equal(state.began, state.committed + state.rolledBack);
  assert.equal(state.released, state.began);
  console.log("redesigned inventory unit compatibility tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
