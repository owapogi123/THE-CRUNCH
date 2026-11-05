"use strict";

const assert = require("node:assert/strict");
const {
  TARGET_LENGTH,
  VERSION,
  up,
} = require("./2026-11-05_password-reset-digest-width");

function fakeConnection(initialColumn) {
  const state = {
    column: initialColumn,
    alters: [],
  };
  return {
    state,
    async query(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim();
      if (/FROM information_schema\.COLUMNS/i.test(normalized)) {
        return [state.column ? [state.column] : []];
      }
      if (/^ALTER TABLE `users` ADD COLUMN/i.test(normalized)) {
        state.alters.push(normalized);
        state.column = {
          DATA_TYPE: "varchar",
          CHARACTER_MAXIMUM_LENGTH: TARGET_LENGTH,
          IS_NULLABLE: "YES",
        };
        return [{ affectedRows: 0 }];
      }
      if (/^ALTER TABLE `users` MODIFY COLUMN/i.test(normalized)) {
        state.alters.push(normalized);
        state.column = {
          DATA_TYPE: "varchar",
          CHARACTER_MAXIMUM_LENGTH: TARGET_LENGTH,
          IS_NULLABLE: "YES",
        };
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected SQL: ${normalized}`);
    },
  };
}

(async () => {
  assert.equal(VERSION, "2026-11-05_password-reset-digest-width");
  assert.equal(TARGET_LENGTH, 64);

  const legacy = fakeConnection({
    DATA_TYPE: "varchar",
    CHARACTER_MAXIMUM_LENGTH: 10,
    IS_NULLABLE: "YES",
  });
  await up(legacy, { log: { log() {} } });
  assert.equal(legacy.state.alters.length, 1);
  assert.match(legacy.state.alters[0], /VARCHAR\(64\) NULL/i);
  await up(legacy, { log: { log() {} } });
  assert.equal(legacy.state.alters.length, 1, "migration must be idempotent");

  const missing = fakeConnection(null);
  await up(missing, { log: { log() {} } });
  assert.equal(missing.state.alters.length, 1);
  assert.match(missing.state.alters[0], /ADD COLUMN.*VARCHAR\(64\) NULL/i);

  const incompatible = fakeConnection({
    DATA_TYPE: "text",
    CHARACTER_MAXIMUM_LENGTH: null,
    IS_NULLABLE: "YES",
  });
  await assert.rejects(
    () => up(incompatible, { log: { log() {} } }),
    (error) => error?.code === "DB_MIGRATION_REVIEW_REQUIRED",
  );

  console.log("Password-reset digest width migration tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
