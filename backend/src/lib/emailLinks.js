// Enlaces en los emails que escribe el cliente en el CRM:
//   [Quiero la beta](https://ejemplo.com)  → enlace con ese texto
//   https://ejemplo.com                    → enlace a esa misma dirección
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g;

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// mapUrl: cambia cada enlace (por ejemplo, por su versión con seguimiento de clics).
export function emailBodyToHtml(text = "", { mapUrl = (u) => u } = {}) {
  const source = String(text || "");
  let html = "";
  let last = 0;
  for (const match of source.matchAll(LINK)) {
    const [whole, label, url, bare] = match;
    const href = url || bare;
    html += escape(source.slice(last, match.index));
    html += `<a href="${escape(mapUrl(href))}" style="color:#6d41f3;font-weight:600;">${escape(label || bare)}</a>`;
    last = match.index + whole.length;
  }
  html += escape(source.slice(last));
  return html.replace(/\r?\n/g, "<br />");
}

// Versión de texto plano: el enlace con nombre queda como "texto: https://…".
export function emailBodyToText(text = "") {
  return String(text || "").replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2");
}
