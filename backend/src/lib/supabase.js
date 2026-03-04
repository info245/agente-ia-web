import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Falta SUPABASE_URL en .env");
}

if (!supabaseServiceRoleKey) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env");
}

// Logs útiles (sin imprimir claves)
console.log("SUPABASE_URL en supabase.js: OK");
console.log("SUPABASE_SERVICE_ROLE_KEY en supabase.js: OK");

export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});