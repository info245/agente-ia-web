// Roles y permisos dentro de cada cuenta cliente. Un único sitio decide qué puede hacer cada rol
// en /api/crm/*: el middleware de abajo se monta una vez para todo el prefijo.

export const ROLE_LABELS = {
  owner: "Propietario",
  manager: "Gestor",
  sales: "Comercial",
  viewer: "Solo lectura",
};
export const ACCOUNT_ROLES = Object.keys(ROLE_LABELS);

const SALES = ["home", "inbox", "contacts", "agenda", "proposals"];
const MANAGER = [...SALES, "settings", "delete"];
const ROLE_PERMISSIONS = {
  owner: [...MANAGER, "team", "billing"],
  manager: MANAGER,
  sales: SALES,
  viewer: SALES,
};
const ALL_PERMISSIONS = ROLE_PERMISSIONS.owner;

// client_admin es el rol antiguo (un usuario por cuenta): equivale a Propietario.
export function normalizeRole(role) {
  const safe = String(role || "").trim();
  if (safe === "client_admin") return "owner";
  return safe === "super_admin" || ACCOUNT_ROLES.includes(safe) ? safe : "viewer";
}

export function permissionsFor(role) {
  const safe = normalizeRole(role);
  const list = safe === "super_admin" ? ALL_PERMISSIONS : ROLE_PERMISSIONS[safe];
  return safe === "viewer" ? [...list] : [...list, "write"];
}

export function can(user, permission) {
  return Boolean(user) && permissionsFor(user.role).includes(permission);
}

const isRead = (method) => method === "GET" || method === "HEAD";

// Permiso que pide una ruta relativa a /api/crm. Lo que no aparece aquí es configuración (Gestor o más).
export function crmPermissionFor(method, path) {
  const p = String(path || "").replace(/\/+$/, "") || "/";
  if (p.startsWith("/push/")) return "self";
  if (p === "/accounts" || p === "/analytics") return "home";
  if (p === "/config" && isRead(method)) return "home";
  // Resultados: lo ve quien ve Inicio; apuntar la inversión (PUT) queda en "settings".
  if (p.startsWith("/reports/") && isRead(method)) return "home";
  if (p === "/team/members" && isRead(method)) return "contacts";
  if (/^\/team(\/|$)/.test(p)) return "team";
  if (/^\/billing(\/|$)/.test(p)) return "billing";
  // Exportar todos los datos de un contacto (RGPD) es tan sensible como borrarlo.
  if (p === "/leads/bulk-delete" || (method === "DELETE" && /^\/leads\/[^/]+$/.test(p)) || /^\/leads\/[^/]+\/export$/.test(p)) return "delete";
  if (/^\/leads\/[^/]+\/(quote|analysis)(\/|$)/.test(p) || p.startsWith("/service-facts/") || p === "/quotes" || /^\/quote-templates(\/|$)/.test(p)) return "proposals";
  if (p === "/leads" || p.startsWith("/leads/")) return "contacts";
  // agent/try: "Sugerir respuesta" en Conversaciones (prueba el asistente sin enviar nada).
  if (p === "/inbox" || p.startsWith("/conversations/") || p === "/agent/try" || (p === "/whatsapp/templates" && isRead(method))) return "inbox";
  if (/^\/(bookings|calendar)(\/|$)/.test(p)) return "agenda";
  return "settings";
}

// Recurso concreto de la ruta, para comprobar que es un contacto asignado al comercial.
export function ownedResourceOf(path) {
  const match = String(path || "").match(/^\/(leads|conversations|bookings)\/([^/]+)/);
  if (!match || match[2] === "bulk-delete") return null;
  return { type: match[1], id: match[2] };
}

// Cuenta que se usa en la petición: la del usuario cliente siempre; la agencia elige con account_id/account_slug.
export function requestAccountInput(user, query = {}, body = {}) {
  if (!user || normalizeRole(user.role) !== "super_admin") {
    const own = String(user?.account_id || "").trim();
    if (!own) throw Object.assign(new Error("Tu usuario no tiene una cuenta asignada."), { status: 403 });
    return own;
  }
  return query?.account_id || query?.account_slug || body?.account_id || body?.account_slug || null;
}

// getTeamSettings(accountId) -> { sales_own_leads_only }
// getLeadOwner(accountId, { type, id }) -> assigned_to del contacto, o undefined si no existe en esa cuenta.
export function createCrmPermissionMiddleware({ getTeamSettings, getLeadOwner }) {
  return async function crmPermissionMiddleware(req, res, next) {
    const user = req.crmUser;
    if (!user) return res.status(401).json({ ok: false, error: "Auth required" });
    try {
      requestAccountInput(user);
    } catch (error) {
      return res.status(403).json({ ok: false, error: error.message });
    }

    const permission = crmPermissionFor(req.method, req.path);
    if (permission !== "self") {
      if (!can(user, permission)) {
        return res.status(403).json({ ok: false, error: "Tu rol no tiene acceso a esta sección." });
      }
      if (!isRead(req.method) && !can(user, "write")) {
        return res.status(403).json({ ok: false, error: "Tu usuario es de solo lectura." });
      }
    }

    req.crmLeadOwner = null;
    if (normalizeRole(user.role) !== "sales") return next();
    try {
      const settings = await getTeamSettings(user.account_id);
      if (!settings?.sales_own_leads_only) return next();
      // La bandeja antigua lista conversaciones sin pasar por contactos: el comercial restringido usa Contactos.
      if (req.path.replace(/\/+$/, "") === "/inbox") {
        return res.status(403).json({ ok: false, error: "Solo puedes ver tus contactos asignados." });
      }
      const resource = ownedResourceOf(req.path);
      if (resource && (await getLeadOwner(user.account_id, resource)) !== user.id) {
        return res.status(404).json({ ok: false, error: "No encontrado." });
      }
      req.crmLeadOwner = user.id;
      return next();
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  };
}
