import test from "node:test";
import assert from "node:assert/strict";

import { __notificationAgentTestables } from "./notificationAgent.js";

const sentEvent = (type) => ({
  payload: {
    signature: "lead-1",
    notification_type: type,
    sent_internal: true,
  },
});

test("a handoff notification bypasses an earlier ordinary lead notification", () => {
  assert.equal(
    __notificationAgentTestables.isDuplicateNotification([sentEvent("new")], {
      signature: "lead-1",
      notificationType: "handoff",
      forceNotification: true,
    }),
    false
  );
});

test("repeated handoff notifications with the same lead signature are deduplicated", () => {
  assert.equal(
    __notificationAgentTestables.isDuplicateNotification([sentEvent("handoff")], {
      signature: "lead-1",
      notificationType: "handoff",
      forceNotification: true,
    }),
    true
  );
});
