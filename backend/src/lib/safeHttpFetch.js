import dns from "node:dns/promises";
import net from "node:net";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;

function isBlockedIpv4(address) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 88) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

export function isPrivateOrReservedIp(address) {
  const ipVersion = net.isIP(address);
  if (!ipVersion) return true;
  if (ipVersion === 4) return isBlockedIpv4(address);

  const value = String(address).toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) return isBlockedIpv4(mapped);
    const groups = mapped.split(":");
    if (groups.length === 2 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
      const high = Number.parseInt(groups[0], 16);
      const low = Number.parseInt(groups[1], 16);
      return isBlockedIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return true;
  }

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    value.startsWith("fe8") ||
    value.startsWith("fe9") ||
    value.startsWith("fea") ||
    value.startsWith("feb") ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8:")
  );
}

export async function assertPublicHttpUrl(rawUrl, { lookup = dns.lookup } = {}) {
  let url;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl.toString()) : new URL(String(rawUrl || "").trim());
  } catch (_error) {
    throw new Error("La URL no es válida.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Solo se permiten URLs HTTP o HTTPS.");
  }
  if (url.username || url.password) throw new Error("La URL no puede incluir credenciales.");

  const hostname = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("La URL apunta a una red privada.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error("La URL apunta a una red privada.");
    return url;
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (_error) {
    throw new Error("La URL no se puede resolver.");
  }

  if (!Array.isArray(addresses) || !addresses.length) {
    throw new Error("La URL no se puede resolver.");
  }
  if (addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error("La URL apunta a una red privada o reservada.");
  }

  return url;
}

export async function readResponseTextLimited(response, maxBytes = DEFAULT_MAX_BYTES) {
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error("La página supera el tamaño permitido.");
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new Error("La página supera el tamaño permitido.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new Error("La página supera el tamaño permitido.");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

export async function fetchPublicHttpText(
  rawUrl,
  {
    fetchImpl = globalThis.fetch,
    lookup = dns.lookup,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    headers = {},
  } = {}
) {
  if (typeof fetchImpl !== "function") throw new Error("El cliente HTTP no está disponible.");

  const controller = new AbortController();
  let rejectTimeout;
  const timeoutPromise = new Promise((_resolve, reject) => {
    rejectTimeout = reject;
  });
  const timer = setTimeout(() => {
    controller.abort();
    rejectTimeout(new Error("La página tardó demasiado en responder."));
  }, timeoutMs);
  timer.unref?.();

  try {
    const performFetch = async () => {
      let currentUrl = await assertPublicHttpUrl(rawUrl, { lookup });
      for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        const response = await fetchImpl(currentUrl, {
          redirect: "manual",
          signal: controller.signal,
          headers,
        });

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) throw new Error("La redirección no incluye destino.");
          if (redirectCount >= maxRedirects) throw new Error("La página supera el límite de redirecciones.");
          await response.body?.cancel?.().catch(() => {});
          currentUrl = await assertPublicHttpUrl(new URL(location, currentUrl), { lookup });
          continue;
        }

        if (!response.ok) throw new Error(`La fuente respondió HTTP ${response.status}.`);
        const text = await readResponseTextLimited(response, maxBytes);
        return { response, text, url: currentUrl.toString() };
      }

      throw new Error("La página supera el límite de redirecciones.");
    };

    return await Promise.race([performFetch(), timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted && error?.name === "AbortError") {
      throw new Error("La página tardó demasiado en responder.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
