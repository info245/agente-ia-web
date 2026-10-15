// Guarda la política del agente v2 de una cuenta (config/agent-policies/<slug>.json) en su borrador.
// Uso: node scripts/apply-agent-policy.js config/agent-policies/sancho.json [--publish]
// --publish publica el borrador completo: revisa antes que no haya otros cambios pendientes.
import "dotenv/config";
import fs from "node:fs";

import { listAccounts } from "../src/lib/accountStore.js";
import { saveAppConfig } from "../src/lib/appConfigStore.js";
import { publishConfigVersion } from "../src/lib/configVersionStore.js";

const [file] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!file) throw new Error("Uso: node scripts/apply-agent-policy.js <fichero.json> [--publish]");

const policy = JSON.parse(fs.readFileSync(file, "utf8"));
const account = (await listAccounts({ force: true })).find((item) => item.slug === policy.account_slug);
if (!account) throw new Error(`No existe la cuenta ${policy.account_slug}`);

const config = await saveAppConfig({ agent: policy.agent }, { accountId: account.id });
console.log(`Política guardada en el borrador de ${account.slug} (agent_engine=${config.agent_engine}).`);

if (process.argv.includes("--publish")) {
  const version = await publishConfigVersion({
    accountId: account.id,
    config,
    changeSummary: "Política del agente v2",
  });
  console.log(`Publicada versión ${version?.version}.`);
}
