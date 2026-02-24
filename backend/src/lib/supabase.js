import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carga explícita del .env de /backend/.env
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("SUPABASE_URL en supabase.js:", supabaseUrl ? "OK" : "FALTA");
console.log("SUPABASE_SERVICE_ROLE_KEY en supabase.js:", supabaseServiceRoleKey ? "OK" : "FALTA");

if (!supabaseUrl) {
  console.warn("⚠️ Falta SUPABASE_URL en variables de entorno");
}

if (!supabaseServiceRoleKey) {
  console.warn("⚠️ Falta SUPABASE_SERVICE_ROLE_KEY en variables de entorno");
}

export const supabase = createClient(
  supabaseUrl || "http://localhost:54321",
  supabaseServiceRoleKey || "missing-key"
);