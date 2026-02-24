import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// AGENT_CONTRACT.md está en la raíz del proyecto
const contractPath = path.resolve(__dirname, "../../../AGENT_CONTRACT.md");

export function getAgentSystemPrompt() {
  try {
    if (fs.existsSync(contractPath)) {
      const contract = fs.readFileSync(contractPath, "utf8");
      return `Eres un agente de IA comercial y de atención al cliente. Sigue este contrato del agente de forma estricta:\n\n${contract}`;
    }
  } catch (error) {
    console.warn("⚠️ No se pudo leer AGENT_CONTRACT.md:", error.message);
  }

  // Fallback si no encuentra el contrato
  return `Eres un agente de IA comercial y de atención al cliente.
Responde en español de forma clara, profesional y útil.
Ayuda al usuario, detecta oportunidades comerciales y haz preguntas breves si falta contexto.`;
}