import crypto from "crypto";
import { supabase } from "./supabase.js";

let crmUsersTableAvailable = null;

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function hasCrmUsersTable() {
  if (crmUsersTableAvailable !== null) return crmUsersTableAvailable;

  const { error } = await supabase.from("crm_users").select("id").limit(1);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (
      message.includes("crm_users") ||
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("schema cache")
    ) {
      crmUsersTableAvailable = false;
      return false;
    }
    throw error;
  }

  crmUsersTableAvailable = true;
  return true;
}

function normalizeUser(raw = {}) {
  return {
    id: clean(raw.id),
    email: clean(raw.email).toLowerCase(),
    role: clean(raw.role) || "client_admin",
    account_id: clean(raw.account_id) || null,
    display_name: clean(raw.display_name) || "",
    status: clean(raw.status) || "active",
  };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const digest = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function verifyPassword(password, storedHash) {
  const [salt, digest] = String(storedHash || "").split(":");
  if (!salt || !digest) return false;
  const candidate = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(candidate, "hex"));
  } catch (_error) {
    return false;
  }
}

export async function countCrmUsers() {
  const available = await hasCrmUsersTable();
  if (!available) return 0;

  const { count, error } = await supabase
    .from("crm_users")
    .select("id", { count: "exact", head: true });
  if (error) throw error;
  return Number(count || 0);
}

export async function createCrmUser(input = {}) {
  const available = await hasCrmUsersTable();
  if (!available) {
    throw new Error(
      "Falta la tabla crm_users en Supabase. Ejecuta sql/007_crm_auth.sql antes de crear usuarios."
    );
  }

  const email = clean(input.email).toLowerCase();
  const password = String(input.password || "");
  const requirePassword = input.require_password !== false;
  const role = clean(input.role) || "client_admin";
  const accountId = clean(input.account_id) || null;

  if (!email) throw new Error("El email es obligatorio.");
  if (requirePassword && (!password || password.length < 8)) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  if (!["super_admin", "client_admin"].includes(role)) {
    throw new Error("Rol no valido.");
  }
  if (role === "client_admin" && !accountId) {
    throw new Error("El client_admin debe estar asociado a una cuenta.");
  }

  const payload = {
    email,
    password_hash: hashPassword(password || crypto.randomBytes(32).toString("hex")),
    role,
    account_id: role === "super_admin" ? null : accountId,
    display_name: clean(input.display_name) || email,
    status: clean(input.status) || (requirePassword ? "active" : "invited"),
  };

  const { data, error } = await supabase
    .from("crm_users")
    .insert(payload)
    .select("id, email, role, account_id, display_name, status")
    .single();

  if (error) throw error;
  return normalizeUser(data);
}

export async function createPasswordSetupToken(userId, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const available = await hasCrmUsersTable();
  if (!available) {
    throw new Error(
      "Falta la tabla crm_users en Supabase. Ejecuta sql/007_crm_auth.sql antes de invitar usuarios."
    );
  }

  const safeUserId = clean(userId);
  if (!safeUserId) throw new Error("Usuario no valido.");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await supabase
    .from("crm_users")
    .update({
      password_setup_token_hash: hashToken(token),
      password_setup_expires_at: expiresAt,
    })
    .eq("id", safeUserId);

  if (error) throw error;

  return {
    token,
    expires_at: expiresAt,
  };
}

export async function setCrmUserPasswordFromToken(token, password) {
  const available = await hasCrmUsersTable();
  if (!available) {
    throw new Error(
      "Falta la tabla crm_users en Supabase. Ejecuta sql/007_crm_auth.sql antes de establecer contraseÃ±as."
    );
  }

  const safeToken = clean(token);
  const nextPassword = String(password || "");
  if (!safeToken) throw new Error("El enlace no es valido.");
  if (!nextPassword || nextPassword.length < 8) {
    throw new Error("La contraseÃ±a debe tener al menos 8 caracteres.");
  }

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, email, role, account_id, display_name, status, password_setup_expires_at")
    .eq("password_setup_token_hash", hashToken(safeToken))
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("El enlace no es valido o ya se ha usado.");

  const expiresAt = data.password_setup_expires_at
    ? new Date(data.password_setup_expires_at).getTime()
    : 0;
  if (!expiresAt || Date.now() > expiresAt) {
    throw new Error("El enlace ha caducado. Pide una nueva invitacion.");
  }

  const { data: updated, error: updateError } = await supabase
    .from("crm_users")
    .update({
      password_hash: hashPassword(nextPassword),
      password_setup_token_hash: null,
      password_setup_expires_at: null,
      status: "active",
    })
    .eq("id", data.id)
    .select("id, email, role, account_id, display_name, status")
    .single();

  if (updateError) throw updateError;
  return normalizeUser(updated);
}

export async function getCrmUserById(userId) {
  const available = await hasCrmUsersTable();
  if (!available) return null;

  const safeUserId = clean(userId);
  if (!safeUserId) return null;

  const { data, error } = await supabase
    .from("crm_users")
    .select("id, email, role, account_id, display_name, status")
    .eq("id", safeUserId)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeUser(data) : null;
}

export async function verifyCrmUserCredentials(email, password) {
  const available = await hasCrmUsersTable();
  if (!available) {
    throw new Error(
      "Falta la tabla crm_users en Supabase. Ejecuta sql/007_crm_auth.sql antes de iniciar sesion."
    );
  }

  const safeEmail = clean(email).toLowerCase();
  const { data, error } = await supabase
    .from("crm_users")
    .select("id, email, role, account_id, display_name, status, password_hash")
    .eq("email", safeEmail)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (clean(data.status) && clean(data.status) !== "active") return null;
  if (!verifyPassword(password, data.password_hash)) return null;

  return normalizeUser(data);
}
