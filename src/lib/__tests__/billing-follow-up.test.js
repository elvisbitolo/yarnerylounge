import { test } from "node:test";
import assert from "node:assert/strict";
import {
  billingFollowUpRows,
  isPendingBillingRequest,
  selectPendingBillingRequests,
} from "../billing-follow-up.js";

const pending = {
  id: "a1",
  action: "membership.plan_changed",
  actorName: "Ada",
  targetId: "uid-1",
  createdAt: "2026-11-26T10:00:00.000Z",
  metadata: {
    billingStatus: "pending_client_action",
    requestedAction: "downgrade_subscription",
    plan: "hooking-up",
    previousTier: "moving-in",
    shopifyOrderId: "order-1",
    shopifyCustomerId: "customer-1",
    email: "ada@example.com",
  },
};

test("selectPendingBillingRequests keeps only exact pending billing metadata", () => {
  assert.deepEqual(
    selectPendingBillingRequests([
      { id: "none", metadata: null },
      { id: "array", metadata: [] },
      { id: "other", metadata: { billingStatus: "completed" } },
      { id: "nested", metadata: { extra: { billingStatus: "pending_client_action" } } },
      pending,
    ]),
    [pending],
  );
  assert.deepEqual(selectPendingBillingRequests(null), []);
  assert.equal(isPendingBillingRequest(pending), true);
  assert.equal(isPendingBillingRequest({ metadata: { billingStatus: "pending_client_Action" } }), false);
});

test("billingFollowUpRows exposes the follow-up fields for downgrades and cancellations", () => {
  assert.deepEqual(billingFollowUpRows([pending]), [
    {
      id: "a1",
      action: "membership.plan_changed",
      member: "Ada",
      memberId: "uid-1",
      requestedAction: "downgrade_subscription",
      plan: "hooking-up",
      previousTier: "moving-in",
      shopifyOrderId: "order-1",
      shopifyCustomerId: "customer-1",
      email: "ada@example.com",
      createdAt: "2026-11-26T10:00:00.000Z",
    },
  ]);

  const canceled = billingFollowUpRows([
    {
      id: "a2",
      action: "membership.cancelled",
      targetId: "uid-2",
      metadata: {
        billingStatus: "pending_client_action",
        requestedAction: "cancel_subscription",
        previousTier: "moving-in",
        email: "grace@example.com",
      },
    },
  ])[0];
  assert.equal(canceled.member, "uid-2");
  assert.equal(canceled.plan, "moving-in");
  assert.equal(canceled.previousTier, "");
  assert.equal(canceled.requestedAction, "cancel_subscription");
  assert.equal(canceled.email, "grace@example.com");
});
