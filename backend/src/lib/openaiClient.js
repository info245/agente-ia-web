import "dotenv/config";
import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("Falta OPENAI_API_KEY en .env");
}

console.log("✅ OPENAI_API_KEY cargada en openaiClient.js");

export const openai = new OpenAI({
  apiKey,
});