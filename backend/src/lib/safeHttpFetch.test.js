import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPublicHttpUrl,
  fetchPublicHttpText,
  isPrivateOrReservedIp,
} from "./safeHttpFetch.js";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

test("bloquea direcciones privadas, loopback e IPv4 mapeada en IPv6", () => {
  assert.equal(isPrivateOrReservedIp("127.0.0.1"), true);
  assert.equal(isPrivateOrReservedIp("10.0.0.1"), true);
  assert.equal(isPrivateOrReservedIp("::1"), true);
  assert.equal(isPrivateOrReservedIp("::ffff:7f00:1"), true);
  assert.equal(isPrivateOrReservedIp("93.184.216.34"), false);
});

test("rechaza hosts locales antes de ejecutar la petición", async () => {
  await assert.rejects(() => assertPublicHttpUrl("http://localhost/admin"), /red privada/i);
  await assert.rejects(() => assertPublicHttpUrl("http://127.0.0.1/admin"), /red privada/i);
});

test("valida de nuevo cada redirección y bloquea destinos privados", async () => {
  let requests = 0;
  const fetchImpl = async () => {
    requests += 1;
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  };

  await assert.rejects(
    () => fetchPublicHttpText("https://example.com", { fetchImpl, lookup: publicLookup }),
    /red privada/i
  );
  assert.equal(requests, 1);
});

test("corta cuerpos que superan el máximo aunque no declaren content-length", async () => {
  const fetchImpl = async () => new Response("demasiado largo");
  await assert.rejects(
    () => fetchPublicHttpText("https://example.com", { fetchImpl, lookup: publicLookup, maxBytes: 4 }),
    /tamaño permitido/i
  );
});

test("aplica el timeout también cuando la resolución DNS queda colgada", async () => {
  const lookup = async () => new Promise(() => {});
  const startedAt = Date.now();
  await assert.rejects(
    () => fetchPublicHttpText("https://example.com", { lookup, timeoutMs: 20 }),
    /tardó demasiado/i
  );
  assert.ok(Date.now() - startedAt < 500);
});
