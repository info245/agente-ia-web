import "dotenv/config";
import express from "express";
import cors from "cors";

import { extractLeadDataFromText } from "./lib/leadExtractor.js";
import {
  createConversation,
  saveMessage,
  upsertLeadFromConversation,
  getConversationMessages,
  getLeadByConversationId,
  mergeLeadData
} from "./lib/chatStore.js";

import { openai } from "./lib/openaiClient.js";
import { getAgentSystemPrompt } from "./lib/agentPrompt.js";

import { retrieveWebsiteContext } from "./lib/kbRetriever.js";
import { getServiceFacts } from "./lib/websiteFacts.js";

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BUILD_TAG = "rag-intelligent-chat-v1";

function norm(v){
  return String(v || "").trim();
}

function hasName(lead){
  return norm(lead?.name).length > 1;
}

function hasService(lead){
  return norm(lead?.interest_service).length > 1;
}

function hasBudget(lead){
  return norm(lead?.budget_range).length > 1;
}

function hasContact(lead){
  return norm(lead?.email).length > 2 || norm(lead?.phone).length > 5;
}

function normalizeBudget(text){

  const match = text.match(/(\d{2,6})/);

  if(match){

    const value = Number(match[1]);

    if(value > 20){

      return value + " €";

    }

  }

  return null;

}

function buildOpenAIInput(systemPrompt, history){

  const input = [
    { role:"system", content: systemPrompt }
  ];

  history.forEach(msg => {

    if(msg.role === "user" || msg.role === "assistant"){

      input.push({
        role: msg.role,
        content: msg.content
      });

    }

  });

  return input;

}

app.get("/health",(req,res)=>{

  res.json({
    ok:true,
    build:BUILD_TAG,
    time:new Date().toISOString()
  });

});

app.post("/messages", async (req,res)=>{

try{

const { text, conversation_id } = req.body;

let currentConversationId = conversation_id;

if(!currentConversationId){

const conversation = await createConversation({});

currentConversationId = conversation.id;

}

await saveMessage({
conversation_id:currentConversationId,
role:"user",
content:text
});

const history = await getConversationMessages(currentConversationId,15);

const leadBefore = await getLeadByConversationId(currentConversationId);

const extracted = extractLeadDataFromText(text);

const incoming = {

conversation_id:currentConversationId,
name: extracted?.name ?? null,
email: extracted?.email ?? null,
phone: extracted?.phone ?? null,
interest_service: extracted?.interest_service ?? null,
urgency: extracted?.urgency ?? null,
budget_range: extracted?.budget_range ?? null,
summary: text,
lead_score: extracted?.lead_score ?? null

};

if(!incoming.budget_range){

const detectedBudget = normalizeBudget(text);

if(detectedBudget){

incoming.budget_range = detectedBudget;

}

}

const merged = mergeLeadData(leadBefore,incoming);

await upsertLeadFromConversation(merged);

const leadAfter = await getLeadByConversationId(currentConversationId);

let reply = null;

let contactCTA = null;

if(!hasName(leadAfter)){

reply = "Perfecto. Antes de seguir, ¿cómo te llamas?";

}

else if(!hasService(leadAfter)){

reply = "¿Qué servicio te interesa? SEO, Google Ads, Redes Sociales, Diseño Web o Consultoría Digital.";

}

else if(!hasBudget(leadAfter)){

reply = `Gracias ${leadAfter.name}. ¿Qué presupuesto aproximado mensual tienes para ${leadAfter.interest_service}?`;

}

else{

if(!hasContact(leadAfter)){

contactCTA = `

Si quieres puedo enviarte una propuesta orientativa para ${leadAfter.interest_service}.

¿Me dejas tu email o teléfono?`;

}

const serviceFacts = getServiceFacts(leadAfter.interest_service);

let factsBlock = "";

if(serviceFacts){

factsBlock = `
INFORMACIÓN VERIFICADA DE LA WEB

Servicio: ${leadAfter.interest_service}

Precio mínimo: ${serviceFacts.min_monthly_fee || serviceFacts.min_project_fee}

Página oficial:
${serviceFacts.url}

Notas:
${serviceFacts.notes}
`;

}

const query = `
Servicio: ${leadAfter.interest_service}

Pregunta usuario:
${text}

Presupuesto:
${leadAfter.budget_range}
`;

let ragContext = "";

try{

const docs = await retrieveWebsiteContext(query,{topK:5,threshold:0.70});

ragContext = docs.map(d=>`

Fuente: ${d.url}

${d.chunk}

`).join("\n");

}catch(e){

console.log("RAG error",e.message);

}

const systemPrompt = `
${getAgentSystemPrompt()}

REGLAS IMPORTANTES

1 RESPONDE SIEMPRE LA PREGUNTA DEL USUARIO
2 USA INFORMACIÓN DE LA WEB SI ESTÁ DISPONIBLE
3 LOS PRECIOS SIEMPRE DEBEN INCLUIR "+ IVA"
4 NO INVENTES PRECIOS
5 SI NO HAY DATO, INDICA QUE DEPENDE DEL PROYECTO

${factsBlock}

CONTEXTO WEB

${ragContext}
`;

const openaiInput = buildOpenAIInput(systemPrompt,history);

const ai = await openai.responses.create({

model:"gpt-4.1-mini",
input:openaiInput

});

reply = ai.output_text?.trim();

if(!reply){

reply = "Cuéntame un poco más sobre tu proyecto para poder orientarte mejor.";

}

if(contactCTA){

reply += contactCTA;

}

}

await saveMessage({

conversation_id:currentConversationId,
role:"assistant",
content:reply

});

res.json({

ok:true,
conversation_id:currentConversationId,
reply

});

}catch(error){

console.log("error",error);

res.status(500).json({

ok:false,
error:error.message

});

}

});

app.listen(PORT,()=>{

console.log("Server running on port",PORT);

});