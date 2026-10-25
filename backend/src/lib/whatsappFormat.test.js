import test from "node:test";
import assert from "node:assert/strict";
import { toWhatsAppFormat } from "./whatsappFormat.js";

test("markdown del modelo pasa a formato de WhatsApp", () => {
  assert.equal(toWhatsAppFormat("Te recomiendo **SEO Avanzado**"), "Te recomiendo *SEO Avanzado*");
  assert.equal(toWhatsAppFormat("## Planes\n- *Starter*: 300 €\n* Pro: 800 €"), "*Planes*\n• *Starter*: 300 €\n• Pro: 800 €");
  assert.equal(toWhatsAppFormat("Mira [la web](https://t-mediaglobal.com)"), "Mira la web: https://t-mediaglobal.com");
  assert.equal(toWhatsAppFormat("[https://a.com](https://a.com)"), "https://a.com");
  assert.equal(toWhatsAppFormat("Hola\n\n\n\nadiós"), "Hola\n\nadiós");
  assert.equal(toWhatsAppFormat("*ya bien* • listo"), "*ya bien* • listo", "lo que ya está en formato WhatsApp no cambia");
});
