import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.warn("⚠️ Falta OPENAI_API_KEY en variables de entorno");
} else {
  console.log("✅ OPENAI_API_KEY cargada en openaiClient.js");
}

export const openai = new OpenAI({
  apiKey
});