import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL ||= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-key";
const { anonymizeLead, applyRetention, collectLeadData, eraseLead, leadDataToCsv, PERSONAL_DATA_TABLES } = await import("./privacy.js");

// Base de datos en memoria con lo justo del query builder de supabase-js que usa privacy.js.
function fakeDb(tables) {
  const read = (row, key) => {
    const [col, json] = key.split("->>");
    return json ? row[col]?.[json] ?? null : row[col];
  };
  return {
    tables,
    from(name) {
      const filters = [];
      let op = "select";
      let patch = null;
      let limit = Infinity;
      const q = {
        select: () => q,
        insert: (row) => { op = "insert"; patch = row; return q; },
        update: (row) => { op = "update"; patch = row; return q; },
        delete: () => { op = "delete"; return q; },
        eq: (k, v) => { filters.push((r) => read(r, k) === v); return q; },
        lt: (k, v) => { filters.push((r) => read(r, k) < v); return q; },
        gte: (k, v) => { filters.push((r) => read(r, k) >= v); return q; },
        is: (k, v) => { filters.push((r) => read(r, k) === v); return q; },
        like: (k, v) => { filters.push((r) => String(read(r, k) || "").startsWith(v.replace(/%$/, ""))); return q; },
        order: () => q,
        limit: (n) => { limit = n; return q; },
        maybeSingle: () => exec().then(({ data, error }) => ({ data: data?.[0] || null, error })),
        then: (resolve, reject) => exec().then(resolve, reject),
      };
      const exec = async () => {
        if (!(name in tables)) return { data: null, error: { message: `relation "${name}" does not exist` } };
        const all = tables[name];
        const match = (r) => filters.every((f) => f(r));
        if (op === "insert") { all.push({ id: `${name}-${all.length + 1}`, ...patch }); return { data: null, error: null }; }
        if (op === "delete") { tables[name] = all.filter((r) => !match(r)); return { data: null, error: null }; }
        if (op === "update") { all.filter(match).forEach((r) => Object.assign(r, patch)); return { data: null, error: null }; }
        return { data: all.filter(match).slice(0, limit), error: null };
      };
      return q;
    },
  };
}

function seed() {
  const conv = "c1";
  const lead = { id: "l1", account_id: "acc", conversation_id: conv, name: "Ana", email: "ana@x.es", phone: "600", crm_status: "nuevo", interest_service: "SEO", custom_fields: {}, updated_at: "2020-01-01T00:00:00.000Z" };
  const tables = {
    leads: [lead, { id: "l2", account_id: "acc", conversation_id: "c2", name: "Otro", custom_fields: {}, updated_at: "2020-01-01T00:00:00.000Z" }],
    conversations: [{ id: conv, account_id: "acc" }, { id: "c2", account_id: "acc" }],
    automation_jobs: [{ id: "j1", dedupe_key: `automation:${conv}:intro:0:x` }, { id: "j2", dedupe_key: "automation:c2:intro:0:x" }],
  };
  for (const { table, keys } of PERSONAL_DATA_TABLES) {
    tables[table] = keys.map((key, i) => ({ id: `${table}-${i}`, [key]: key === "lead_id" ? "l1" : conv }));
    tables[table].push({ id: `${table}-other`, lead_id: "l2", conversation_id: "c2" });
  }
  tables.conversation_events.push({ id: "consent-1", conversation_id: conv, event_type: "consent", payload: { text: "Acepto" } });
  return fakeDb(tables);
}

test("exportar reúne el contacto, su conversación y cada tabla con datos personales", async () => {
  const db = seed();
  const bundle = await collectLeadData("l1", { accountId: "acc", db });
  assert.equal(bundle.lead.email, "ana@x.es");
  assert.equal(bundle.conversation.id, "c1");
  for (const { table, keys } of PERSONAL_DATA_TABLES) {
    assert.equal(bundle[table].length, keys.length + (table === "conversation_events" ? 1 : 0), table);
    assert.ok(bundle[table].every((r) => r.lead_id !== "l2"), `${table} no debe traer datos de otro contacto`);
  }
  assert.equal(bundle.consent.length, 1);

  const csv = leadDataToCsv(bundle);
  assert.ok(csv.startsWith("﻿tabla,id,campo,valor"));
  assert.ok(csv.includes("leads,l1,email,ana@x.es"));
  assert.ok(csv.includes('conversation_events,consent-1,payload,"{""text"":""Acepto""}"'));
});

test("exportar no sirve contactos de otra cuenta", async () => {
  await assert.rejects(collectLeadData("l1", { accountId: "otra", db: seed() }), /no encontrado/);
});

test("borrar elimina el contacto y todo lo suyo, sin tocar a otros contactos", async () => {
  const db = seed();
  await eraseLead("l1", { accountId: "acc", db });
  assert.deepEqual(db.tables.leads.map((r) => r.id), ["l2"]);
  assert.deepEqual(db.tables.conversations.map((r) => r.id), ["c2"]);
  assert.deepEqual(db.tables.automation_jobs.map((r) => r.id), ["j2"]);
  for (const { table } of PERSONAL_DATA_TABLES) {
    assert.deepEqual(db.tables[table].map((r) => r.id), [`${table}-other`], table);
  }
});

test("borrar no se lleva una conversación que comparte otro contacto", async () => {
  const db = seed();
  db.tables.leads.push({ id: "l3", account_id: "acc", conversation_id: "c1" });
  await eraseLead("l1", { accountId: "acc", db });
  assert.ok(db.tables.conversations.some((r) => r.id === "c1"));
  assert.ok(db.tables.messages.some((r) => r.conversation_id === "c1"));
  assert.ok(!db.tables.quotes.some((r) => r.lead_id === "l1"));
});

test("una tabla aún sin migrar no impide borrar", async () => {
  const db = seed();
  delete db.tables.bookings;
  await eraseLead("l1", { accountId: "acc", db });
  assert.deepEqual(db.tables.leads.map((r) => r.id), ["l2"]);
});

test("anonimizar deja la fila sin datos personales y borra la conversación", async () => {
  const db = seed();
  await anonymizeLead("l1", { accountId: "acc", db });
  const lead = db.tables.leads.find((r) => r.id === "l1");
  assert.equal(lead.name, null);
  assert.equal(lead.email, null);
  assert.equal(lead.phone, null);
  assert.equal(lead.conversation_id, null);
  assert.equal(lead.interest_service, "SEO");
  assert.ok(lead.custom_fields._anonymized_at);
  assert.ok(!db.tables.conversations.some((r) => r.id === "c1"));
  assert.ok(!db.tables.messages.some((r) => r.conversation_id === "c1"));
});

test("el plazo de conservación respeta la actividad reciente y no repite anonimizados", async () => {
  const db = seed();
  db.tables.data_access_log = [];
  db.tables.messages.push({ id: "m-new", conversation_id: "c2", created_at: "2026-10-01T00:00:00.000Z" });
  const now = new Date("2026-10-22T00:00:00.000Z");
  const off = await applyRetention({ accountId: "acc", privacy: { retention_months: 0 }, now, db });
  assert.equal(off.skipped, true);

  const first = await applyRetention({ accountId: "acc", privacy: { retention_months: 12 }, now, db });
  assert.equal(first.processed, 1, "l2 tiene un mensaje reciente");
  assert.equal(db.tables.leads.find((r) => r.id === "l1").email, null);
  assert.equal(db.tables.data_access_log[0].action, "anonymize");

  const later = new Date("2030-01-01T00:00:00.000Z");
  const again = await applyRetention({ accountId: "acc", privacy: { retention_months: 12, retention_action: "anonymize" }, now: later, db });
  assert.equal(again.processed, 1, "solo l2: l1 ya está anonimizado");
});
