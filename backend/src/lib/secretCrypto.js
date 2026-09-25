import crypto from "crypto";

const PREFIX = "enc:v1:";

function getEncryptionKey() {
  const material = String(
    process.env.SECRETS_ENCRYPTION_KEY ||
      process.env.CRM_AUTH_SECRET ||
      process.env.INTEGRATIONS_SECRET ||
      process.env.CRM_INTEGRATIONS_SECRET ||
      ""
  ).trim();
  if (!material) {
    throw new Error("Falta SECRETS_ENCRYPTION_KEY para guardar credenciales de integraciones.");
  }
  return crypto.createHash("sha256").update(material).digest();
}

export function encryptSecret(value) {
  const plaintext = String(value || "");
  if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(value) {
  const stored = String(value || "");
  if (!stored || !stored.startsWith(PREFIX)) return stored;
  const [ivPart, tagPart, encryptedPart] = stored.slice(PREFIX.length).split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Credencial cifrada no valida.");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivPart, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function maskSecret(value) {
  return String(value || "").trim() ? "••••••••" : "";
}

const CONFIG_SECRET_PATHS = [
  "smtp_pass",
  "google_client_secret",
  "google_refresh_token",
  "google_access_token",
];

function transformConfigSecrets(config, transformer) {
  const clone = JSON.parse(JSON.stringify(config || {}));
  const email = clone?.integrations?.email;
  if (!email) return clone;
  for (const key of CONFIG_SECRET_PATHS) {
    if (email[key]) email[key] = transformer(email[key]);
  }
  return clone;
}

export function encryptConfigSecrets(config) {
  return transformConfigSecrets(config, encryptSecret);
}

export function decryptConfigSecrets(config) {
  return transformConfigSecrets(config, decryptSecret);
}
