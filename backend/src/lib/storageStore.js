import { supabase } from "./supabase.js";

const BRAND_ASSETS_BUCKET = "crm-brand-assets";

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function slugify(value, fallback = "asset") {
  const normalized = clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function getFileExtension(fileName = "", contentType = "") {
  const explicit = clean(fileName).split(".").pop();
  if (explicit && explicit !== clean(fileName)) {
    return explicit.toLowerCase();
  }

  const byMime = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
  };

  return byMime[clean(contentType).toLowerCase()] || "png";
}

export async function uploadBrandLogo({
  accountId,
  brandName,
  fileName,
  contentType,
  dataBase64,
}) {
  const safeAccountId = clean(accountId) || "default";
  const safeBrandName = clean(brandName) || "brand";
  const safeContentType = clean(contentType).toLowerCase();
  const safeBase64 = clean(dataBase64);

  if (!safeBase64) {
    throw new Error("Falta la imagen codificada para subir el logo.");
  }

  if (!safeContentType.startsWith("image/")) {
    throw new Error("El logo debe ser una imagen valida.");
  }

  const extension = getFileExtension(fileName, safeContentType);
  const filePath = [
    "accounts",
    slugify(safeAccountId, "default"),
    "brand",
    `${Date.now()}-${slugify(safeBrandName, "logo")}.${extension}`,
  ].join("/");

  const buffer = Buffer.from(safeBase64, "base64");
  const { error: uploadError } = await supabase.storage
    .from(BRAND_ASSETS_BUCKET)
    .upload(filePath, buffer, {
      contentType: safeContentType,
      upsert: true,
      cacheControl: "3600",
    });

  if (uploadError) {
    const message = String(uploadError.message || "").toLowerCase();
    if (message.includes("bucket") || message.includes("not found")) {
      throw new Error(
        "Falta el bucket de Storage para logos. Ejecuta sql/006_brand_assets_storage.sql en Supabase."
      );
    }
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BRAND_ASSETS_BUCKET).getPublicUrl(filePath);

  return {
    bucket: BRAND_ASSETS_BUCKET,
    path: filePath,
    publicUrl,
  };
}
