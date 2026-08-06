import test from "node:test";
import assert from "node:assert/strict";

import {
  getMissingLeadRequirements,
  hasConfiguredLeadRequirements,
  hasRequiredLeadData,
} from "./leadRequirements.js";

const contactConfig = {
  lead_capture: {
    fields: { main_goal: true, email: true, phone: true },
    custom_fields: [],
  },
};

test("email or phone satisfies a combined contact requirement", () => {
  assert.deepEqual(
    getMissingLeadRequirements({ main_goal: "Captar leads", email: "a@example.com" }, contactConfig),
    []
  );
  assert.deepEqual(
    getMissingLeadRequirements({ main_goal: "Captar leads", phone: "34600000000" }, contactConfig),
    []
  );
  assert.deepEqual(
    getMissingLeadRequirements({ main_goal: "Captar leads" }, contactConfig),
    ["contact"]
  );
});

test("required custom fields remain mandatory", () => {
  const config = {
    lead_capture: {
      fields: { main_goal: true },
      custom_fields: [{ key: "odoo_edition", required: true }],
    },
  };
  assert.equal(hasRequiredLeadData({ main_goal: "Automatizar campañas" }, config), false);
  assert.equal(
    hasRequiredLeadData(
      { main_goal: "Automatizar campañas", custom_fields: { odoo_edition: "Odoo.sh" } },
      config
    ),
    true
  );
});

test("an account without configured requirements never auto-completes a chat", () => {
  assert.equal(hasConfiguredLeadRequirements({}), false);
  assert.equal(
    hasConfiguredLeadRequirements({ lead_capture: { fields: { main_goal: true } } }),
    true
  );
});

test("qualification follows one stable account-wide order", () => {
  const config = {
    lead_capture: {
      fields: {
        main_goal: true,
        business_type: true,
        business_activity: true,
        interest_service: true,
        urgency: true,
        budget_range: true,
        company_name: true,
        name: true,
        preferred_contact_channel: true,
        email: true,
        phone: true,
      },
    },
  };

  assert.deepEqual(getMissingLeadRequirements({}, config), [
    "main_goal",
    "business_type",
    "business_activity",
    "interest_service",
    "urgency",
    "budget_range",
    "company_name",
    "name",
    "preferred_contact_channel",
    "contact",
  ]);
});
