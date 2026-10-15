import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../sql");
// 013 activa RLS en todas las tablas existentes; las migraciones posteriores deben hacerlo por su cuenta.
const RLS_BASELINE = 13;

test("cada tabla creada después de 013 activa RLS", () => {
  const files = fs.readdirSync(sqlDir).filter((f) => /^\d+_.*\.sql$/.test(f));
  assert.ok(files.some((f) => parseInt(f, 10) === RLS_BASELINE), "falta la migración 013");

  const missing = [];
  for (const file of files.filter((f) => parseInt(f, 10) > RLS_BASELINE)) {
    const sql = fs.readFileSync(path.join(sqlDir, file), "utf8").toLowerCase();
    const tables = [...sql.matchAll(/create table (?:if not exists )?(?:public\.)?"?([a-z0-9_]+)/g)].map((m) => m[1]);
    for (const table of tables) {
      const enabled = new RegExp(`alter table (?:if exists )?(?:public\\.)?"?${table}"? enable row level security`).test(sql);
      if (!enabled) missing.push(`${file}: ${table}`);
    }
  }
  assert.deepEqual(missing, []);
});
