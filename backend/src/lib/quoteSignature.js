// Aceptación firmada de propuestas: el enlace «Aceptar» abre esta página y la propuesta solo se
// acepta al firmar y confirmar (un POST). Así un antivirus o un programa de correo que «abre» los
// enlaces de un email ya no puede aceptarla por su cuenta.

const escape = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const money = (n, currency = "EUR") => {
  try {
    return Number(n || 0).toLocaleString("es-ES", { style: "currency", currency });
  } catch {
    return `${Number(n || 0).toFixed(2)} ${currency}`;
  }
};
const BILLING = { monthly: " / mes", one_time: "", custom: "" };

export function validateAcceptance({ name, nif, accepted, signature } = {}) {
  const errors = [];
  const cleanName = String(name || "").trim().replace(/\s+/g, " ");
  const cleanNif = String(nif || "").trim().toUpperCase().replace(/[\s.-]/g, "");
  if (cleanName.length < 3) errors.push("Escribe tu nombre y apellidos.");
  if (cleanNif && !/^[A-Z0-9]{8,10}$/.test(cleanNif)) errors.push("El NIF/CIF no parece válido.");
  if (!(accepted === true || accepted === "on" || accepted === "true")) errors.push("Marca la casilla de aceptación.");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]{200,}$/.test(String(signature || "")) || String(signature).length > 400_000) {
    errors.push("Firma en el recuadro antes de aceptar.");
  }
  return { ok: errors.length === 0, errors, name: cleanName.slice(0, 160), nif: cleanNif || null };
}

function page(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title>
<style>
body{margin:0;background:#f3f2f8;font-family:Arial,Helvetica,sans-serif;color:#1d1b26}
.wrap{max-width:560px;margin:0 auto;padding:28px 16px}
.card{background:#fff;border-radius:14px;padding:24px;box-shadow:0 8px 24px rgba(20,18,30,.07)}
h1{font-size:22px;margin:0 0 6px}.muted{color:#6b6878;font-size:14px}
.sum{display:flex;justify-content:space-between;gap:12px;background:#f7f5fd;border-radius:10px;padding:12px 14px;margin:16px 0}
label{display:block;font-size:13px;font-weight:700;margin:14px 0 6px}
input[type=text],textarea{width:100%;box-sizing:border-box;border:1px solid #dcd8e8;border-radius:8px;padding:10px;font-size:15px;font-family:inherit}
canvas{width:100%;height:170px;border:1px dashed #b9b0dc;border-radius:10px;background:#fff;touch-action:none;display:block}
.row{display:flex;justify-content:space-between;align-items:center}
.check{display:flex;gap:8px;align-items:flex-start;font-size:14px;margin-top:14px}
.btn{display:block;width:100%;border:0;border-radius:10px;padding:14px;font-size:16px;font-weight:700;color:#fff;background:#1faa59;margin-top:18px;cursor:pointer}
.btn.no{background:#e4572e}.link{background:none;border:0;color:#6d41f3;cursor:pointer;font-size:13px;padding:0}
.err{background:#fde8e6;color:#b42318;border-radius:8px;padding:10px 12px;font-size:14px;margin-bottom:12px}
</style></head><body><div class="wrap"><div class="card">${body}</div></div></body></html>`;
}

export function renderQuoteSignHtml({ action, lead = {}, quote = {}, brandName = "", postUrl, token, errors = [], values = {} }) {
  const content = quote.content_json || {};
  const summary = `<div class="sum"><div><b>${escape(quote.title || "Propuesta")}</b><div class="muted">${escape(brandName)} · versión ${Number(quote.version) || 1}</div></div><div><b>${escape(money(quote.total, quote.currency))}${BILLING[content.billing_type] || ""}</b><div class="muted">IVA incluido</div></div></div>`;
  const err = errors.length ? `<div class="err">${errors.map(escape).join("<br>")}</div>` : "";
  if (action === "reject") {
    return page("Responder a la propuesta", `<h1>¿No te encaja ahora?</h1><p class="muted">Nos ayuda saber por qué (opcional).</p>${summary}
<form method="post" action="${escape(postUrl)}"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="action" value="reject">
<label for="reason">Motivo</label><textarea id="reason" name="reason" rows="3" maxlength="1000" placeholder="Precio, plazos, ahora no es el momento…"></textarea>
<button class="btn no" type="submit">Confirmar que no me encaja</button></form>`);
  }
  return page("Aceptar la propuesta", `<h1>Aceptar la propuesta</h1><p class="muted">Hola ${escape(String(lead.name || "").split(/\s+/)[0] || "")}, revisa los datos y firma para confirmar.</p>${summary}${err}
<form method="post" action="${escape(postUrl)}" id="f"><input type="hidden" name="token" value="${escape(token)}"><input type="hidden" name="action" value="accept"><input type="hidden" name="signature" id="sig">
<label for="name">Nombre y apellidos</label><input type="text" id="name" name="name" required minlength="3" value="${escape(values.name ?? lead.name ?? "")}" autocomplete="name">
<label for="nif">NIF / CIF <span class="muted">(opcional, para la factura)</span></label><input type="text" id="nif" name="nif" value="${escape(values.nif || "")}">
<div class="row"><label for="pad">Firma</label><button type="button" class="link" id="clear">Borrar firma</button></div>
<canvas id="pad" aria-label="Firma con el dedo o el ratón"></canvas>
<label class="check"><input type="checkbox" name="accepted" required> <span>He leído la propuesta y acepto sus condiciones y el importe indicado.</span></label>
<button class="btn" type="submit">Firmar y aceptar</button></form>
<script>
(function(){var c=document.getElementById("pad"),x=c.getContext("2d"),d=false,used=false;
function size(){var r=c.getBoundingClientRect(),s=window.devicePixelRatio||1;c.width=r.width*s;c.height=r.height*s;x.scale(s,s);x.lineWidth=2.2;x.lineCap="round";x.strokeStyle="#1d1b26";}
size();function p(e){var r=c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
c.addEventListener("pointerdown",function(e){d=true;used=true;var q=p(e);x.beginPath();x.moveTo(q.x,q.y);c.setPointerCapture(e.pointerId);});
c.addEventListener("pointermove",function(e){if(!d)return;var q=p(e);x.lineTo(q.x,q.y);x.stroke();});
c.addEventListener("pointerup",function(){d=false;});
document.getElementById("clear").onclick=function(){x.clearRect(0,0,c.width,c.height);used=false;};
document.getElementById("f").addEventListener("submit",function(e){if(!used){e.preventDefault();alert("Firma en el recuadro antes de aceptar.");return;}document.getElementById("sig").value=c.toDataURL("image/png");});
})();
</script>`);
}

// Bloque de la aceptación dentro de la propuesta (y de su PDF).
export function acceptanceHtml(acceptance) {
  if (!acceptance?.name) return "";
  const when = acceptance.at ? new Date(acceptance.at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "";
  return `<div style="margin-top:14px;border:1px solid #cfe9da;background:#f3fbf6;border-radius:12px;padding:14px 16px;font-size:14px;color:#1d1b26">
<b>Aceptada y firmada</b> por ${escape(acceptance.name)}${acceptance.nif ? ` (NIF/CIF ${escape(acceptance.nif)})` : ""} el ${escape(when)}.
${acceptance.signature ? `<div style="margin-top:8px"><img src="${escape(acceptance.signature)}" alt="Firma" style="max-width:260px;max-height:110px;border-bottom:1px solid #9fd3b4"></div>` : ""}
<div style="color:#6b6878;font-size:12px;margin-top:6px">Firma electrónica simple · versión ${escape(acceptance.version || 1)} · importe ${escape(money(acceptance.total, acceptance.currency || "EUR"))} · IP ${escape(acceptance.ip || "—")}</div></div>`;
}
