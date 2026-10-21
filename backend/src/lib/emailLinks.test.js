import test from "node:test";
import assert from "node:assert/strict";
import { emailBodyToHtml, emailBodyToText } from "./emailLinks.js";

test("los enlaces con nombre y las URL sueltas se vuelven clicables, el resto se escapa", () => {
  const html = emailBodyToHtml("👉 [Quiero la beta](https://sancho.ai/beta?x=1&y=2)\nMás en https://sancho.ai. <b>hola</b>");
  assert.match(html, /<a href="https:\/\/sancho\.ai\/beta\?x=1&amp;y=2"[^>]*>Quiero la beta<\/a>/);
  assert.match(html, /<a href="https:\/\/sancho\.ai"[^>]*>https:\/\/sancho\.ai<\/a>\. &lt;b&gt;hola&lt;\/b&gt;/);
  assert.match(html, /<br \/>/);
  assert.doesNotMatch(emailBodyToHtml("[x](javascript:alert(1))"), /<a /);
  assert.equal(emailBodyToText("[Quiero la beta](https://sancho.ai/beta)"), "Quiero la beta: https://sancho.ai/beta");
});
