import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  can,
  createCrmPermissionMiddleware,
  crmPermissionFor,
  normalizeRole,
  requestAccountInput,
} from "./permissions.js";

const user = (role, extra = {}) => ({ id: `u-${role}`, role, account_id: "acc-a", ...extra });

// Ruta de ejemplo de cada sección → qué roles entran (lectura).
const MATRIX = {
  "GET /leads": ["owner", "manager", "sales", "viewer"],
  "GET /conversations/c1/messages": ["owner", "manager", "sales", "viewer"],
  "GET /bookings": ["owner", "manager", "sales", "viewer"],
  "GET /leads/l1/quote": ["owner", "manager", "sales", "viewer"],
  "GET /config": ["owner", "manager", "sales", "viewer"],
  "GET /integrations/whatsapp/channel": ["owner", "manager"],
  "GET /knowledge/sources": ["owner", "manager"],
  "POST /assistant": ["owner", "manager"],
  "DELETE /leads/l1": ["owner", "manager"],
  "POST /leads/bulk-delete": ["owner", "manager"],
  "GET /team": ["owner"],
  "PATCH /team/u2": ["owner"],
  "GET /billing/status": ["owner"],
  "GET /team/members": ["owner", "manager", "sales", "viewer"],
};

function run(middleware, { method = "GET", path, crmUser, query = {} }) {
  const req = { method, path, crmUser, query, body: {} };
  return new Promise((resolve) => {
    const res = {
      status(code) {
        return { json: (body) => resolve({ status: code, body, req }) };
      },
    };
    middleware(req, res, () => resolve({ status: "next", req }));
  });
}

const open = createCrmPermissionMiddleware({
  getTeamSettings: async () => ({ sales_own_leads_only: false }),
  getLeadOwner: async () => undefined,
});

test("matriz de permisos por rol", async () => {
  for (const [route, allowed] of Object.entries(MATRIX)) {
    const [method, path] = route.split(" ");
    for (const role of ["owner", "manager", "sales", "viewer", "super_admin"]) {
      const { status } = await run(open, { method, path, crmUser: user(role) });
      const writeByViewer = role === "viewer" && method !== "GET";
      const expected = role === "super_admin" || (allowed.includes(role) && !writeByViewer);
      assert.equal(status === "next", expected, `${role} ${route} → ${status}`);
    }
  }
});

test("el rol antiguo client_admin es Propietario", () => {
  assert.equal(normalizeRole("client_admin"), "owner");
  assert.equal(can(user("client_admin"), "team"), true);
  assert.equal(can(user("client_admin"), "billing"), true);
  assert.equal(normalizeRole("inventado"), "viewer");
});

test("solo lectura no escribe, salvo sus propios avisos del móvil", async () => {
  const viewer = user("viewer");
  assert.equal((await run(open, { method: "PATCH", path: "/leads/l1", crmUser: viewer })).status, 403);
  assert.equal((await run(open, { method: "POST", path: "/conversations/c1/reply", crmUser: viewer })).status, 403);
  assert.equal((await run(open, { method: "POST", path: "/push/subscribe", crmUser: viewer })).status, "next");
  assert.equal((await run(open, { method: "PATCH", path: "/leads/l1", crmUser: user("sales") })).status, "next");
});

test("todas las rutas /api/crm del servidor tienen permiso y las de configuración quedan para Gestor", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  const routes = [...server.matchAll(/app\.(get|post|put|patch|delete)\("\/api\/crm(\/[^"]*)"/g)].map((m) => [m[1].toUpperCase(), m[2]]);
  assert.ok(routes.length > 40);
  const known = new Set(["self", "home", "inbox", "contacts", "agenda", "proposals", "settings", "delete", "team", "billing"]);
  for (const [method, path] of routes) {
    const permission = crmPermissionFor(method, path.replace(/:[A-Za-z]+/g, "x"));
    assert.ok(known.has(permission), `${method} ${path}`);
    if (/^\/(config\/|integrations|knowledge|assets|channels|assistant)/.test(path)) {
      assert.equal(permission, "settings", `${method} ${path}`);
    }
  }
  assert.equal(crmPermissionFor("GET", "/ruta-nueva-sin-mapear"), "settings");
});

test("un usuario cliente nunca elige otra cuenta", () => {
  const client = user("owner");
  assert.equal(requestAccountInput(client, { account_id: "acc-b" }, { account_slug: "otra" }), "acc-a");
  assert.equal(requestAccountInput(user("sales"), { account_slug: "acc-b" }), "acc-a");
  assert.equal(requestAccountInput(user("super_admin", { account_id: null }), { account_id: "acc-b" }), "acc-b");
  assert.throws(() => requestAccountInput(user("owner", { account_id: null }), { account_id: "acc-b" }), /no tiene una cuenta/);
  assert.throws(() => requestAccountInput(null, { account_id: "acc-b" }));
});

test("un usuario cliente sin cuenta no entra en /api/crm (no cae en la cuenta por defecto)", async () => {
  const orphan = user("owner", { account_id: null });
  const { status } = await run(open, { path: "/leads", crmUser: orphan, query: { account_id: "acc-b" } });
  assert.equal(status, 403);
  assert.equal((await run(open, { path: "/leads", crmUser: null })).status, 401);
});

test("comercial restringido: solo sus contactos y siempre dentro de su cuenta", async () => {
  const seen = [];
  const owners = { l1: "u-sales", l2: "otro", c1: "u-sales", b1: "otro" };
  const restricted = createCrmPermissionMiddleware({
    getTeamSettings: async (accountId) => ({ sales_own_leads_only: accountId === "acc-a" }),
    getLeadOwner: async (accountId, { id }) => {
      seen.push(accountId);
      return owners[id];
    },
  });
  const sales = user("sales");

  const list = await run(restricted, { path: "/leads", crmUser: sales, query: { account_id: "acc-b" } });
  assert.equal(list.status, "next");
  assert.equal(list.req.crmLeadOwner, "u-sales");

  assert.equal((await run(restricted, { method: "PATCH", path: "/leads/l1", crmUser: sales })).status, "next");
  assert.equal((await run(restricted, { method: "PATCH", path: "/leads/l2", crmUser: sales })).status, 404);
  assert.equal((await run(restricted, { path: "/leads/no-existe/quote", crmUser: sales })).status, 404);
  assert.equal((await run(restricted, { path: "/conversations/c1/messages", crmUser: sales })).status, "next");
  assert.equal((await run(restricted, { method: "POST", path: "/bookings/b1/cancel", crmUser: sales })).status, 404);
  assert.equal((await run(restricted, { path: "/inbox", crmUser: sales })).status, 403);
  // Aunque pida otra cuenta, el dueño del contacto se busca en la suya.
  await run(restricted, { path: "/leads/l2", crmUser: sales, query: { account_id: "acc-b" } });
  assert.ok(seen.every((accountId) => accountId === "acc-a"));

  // Sin la opción activada, o para un Gestor, no hay restricción.
  const manager = await run(restricted, { method: "PATCH", path: "/leads/l2", crmUser: user("manager") });
  assert.equal(manager.status, "next");
  assert.equal(manager.req.crmLeadOwner, null);
  const otherAccount = await run(restricted, { method: "PATCH", path: "/leads/l2", crmUser: user("sales", { account_id: "acc-c" }) });
  assert.equal(otherAccount.status, "next");
});
