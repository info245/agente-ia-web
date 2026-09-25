import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeAppConfig } from "./appConfig.js";

test("keeps structured pricing plans when an agent configuration is saved", () => {
  const config = sanitizeAppConfig(
    {
      offers: {
        SEO: {
          min_monthly_fee: "300 €",
          pricing_plans: [
            {
              plan: "SEO Starter",
              monthly_price: "300 €",
              audience: "negocios que empiezan",
              notes: "Auditoria y 4 contenidos al mes",
            },
          ],
        },
      },
    },
    { useBlankDefaults: true }
  );

  assert.equal(config.offers.SEO.pricing_plans.length, 1);
  assert.deepEqual(config.offers.SEO.pricing_plans[0], {
    plan: "SEO Starter",
    badge: "",
    monthly_price: "300 €",
    annual_price: "",
    setup: "",
    audience: "negocios que empiezan",
    modules: "",
    users: "",
    workspaces: "",
    trial_days: "",
    notes: "Auditoria y 4 contenidos al mes",
  });
});
