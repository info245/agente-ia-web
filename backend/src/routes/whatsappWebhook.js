// src/routes/whatsappWebhook.js
import express from "express";
import { handleWhatsAppWebhook } from "../lib/whatsappInbound.js";

const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// Verificación inicial del webhook
router.get("/whatsapp", (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("[whatsappWebhook][GET] verify request", {
      mode,
      tokenReceived: !!token,
      challengeReceived: !!challenge,
      verifyTokenConfigured: !!VERIFY_TOKEN,
    });

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[whatsappWebhook][GET] webhook verified OK");
      return res.status(200).send(challenge);
    }

    console.warn("[whatsappWebhook][GET] webhook verification failed", {
      mode,
      tokenMatches: token === VERIFY_TOKEN,
    });

    return res.sendStatus(403);
  } catch (error) {
    console.error("[whatsappWebhook][GET] verification error:", error);
    return res.sendStatus(500);
  }
});

// Recepción de eventos
router.post("/whatsapp", async (req, res) => {
  try {
    console.log(
      "[whatsappWebhook][POST] raw payload:",
      JSON.stringify(req.body, null, 2)
    );

    // Responde rápido a Meta para evitar reintentos
    res.sendStatus(200);

    if (!req.body || req.body.object !== "whatsapp_business_account") {
      console.warn("[whatsappWebhook][POST] payload ignorado: object no válido", {
        object: req.body?.object || null,
      });
      return;
    }

    const entries = req.body.entry || [];
    console.log("[whatsappWebhook][POST] entries count:", entries.length);

    await handleWhatsAppWebhook(req.body);

    console.log("[whatsappWebhook][POST] payload procesado correctamente");
  } catch (error) {
    console.error("[whatsappWebhook][POST] error:", error);
    // Ya hemos respondido 200 arriba a propósito
  }
});

export default router;