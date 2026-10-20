import test from "node:test";
import assert from "node:assert/strict";
import { describeTemplate, renderTemplate, validateTemplateParams } from "./whatsappTemplates.js";

const followUp = {
  name: "seguimiento_lead",
  language: "es",
  category: "UTILITY",
  components: [
    { type: "HEADER", format: "TEXT", text: "TMedia Global" },
    { type: "BODY", text: "Hola {{1}}, te escribo por tu consulta sobre {{2}}. ¿Seguimos?" },
    { type: "FOOTER", text: "Responde STOP para no recibir más mensajes" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sí" }] },
  ],
};

test("una plantilla de solo texto se puede enviar y cuenta sus variables", () => {
  const t = describeTemplate(followUp);
  assert.equal(t.sendable, true);
  assert.equal(t.params, 2);
  assert.equal(
    renderTemplate(t, ["Laura", "Google Ads"]),
    "TMedia Global\n\nHola Laura, te escribo por tu consulta sobre Google Ads. ¿Seguimos?\n\nResponde STOP para no recibir más mensajes"
  );
});

test("se descartan las plantillas que necesitan algo más que texto en el cuerpo", () => {
  const image = describeTemplate({ name: "promo", components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "Hola" }] });
  assert.equal(image.sendable, false);
  assert.match(image.reason, /cabecera con archivo/);
  const urlButton = describeTemplate({
    name: "cita",
    components: [{ type: "BODY", text: "Tu cita" }, { type: "BUTTONS", buttons: [{ type: "URL", url: "https://x.com/{{1}}" }] }],
  });
  assert.equal(urlButton.sendable, false);
});

test("cada variable del cuerpo es obligatoria y sin saltos de línea", () => {
  const t = describeTemplate(followUp);
  assert.match(validateTemplateParams(t, ["Laura"]), /\{\{2\}\}/);
  assert.match(validateTemplateParams(t, ["Laura", "SEO\nlocal"]), /saltos de línea/);
  assert.equal(validateTemplateParams(t, ["Laura", "SEO"]), "");
});
