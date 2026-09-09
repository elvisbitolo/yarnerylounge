import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isOpenAccess,
  openAccessPlan,
  OPEN_ACCESS_PLAN,
} from "../access-policy.js";

test("isOpenAccess: defaults to open when env is unset", () => {
  const prev = process.env.SHOPIFY_OPEN_ACCESS;
  delete process.env.SHOPIFY_OPEN_ACCESS;
  assert.equal(isOpenAccess(), true);
  if (prev !== undefined) process.env.SHOPIFY_OPEN_ACCESS = prev;
});

test("isOpenAccess: true/1/yes enable open access", () => {
  const prev = process.env.SHOPIFY_OPEN_ACCESS;
  process.env.SHOPIFY_OPEN_ACCESS = "true";
  assert.equal(isOpenAccess(), true);
  process.env.SHOPIFY_OPEN_ACCESS = "1";
  assert.equal(isOpenAccess(), true);
  process.env.SHOPIFY_OPEN_ACCESS = "yes";
  assert.equal(isOpenAccess(), true);
  if (prev !== undefined) process.env.SHOPIFY_OPEN_ACCESS = prev;
  else delete process.env.SHOPIFY_OPEN_ACCESS;
});

test("isOpenAccess: explicit false restores the strict gate", () => {
  const prev = process.env.SHOPIFY_OPEN_ACCESS;
  process.env.SHOPIFY_OPEN_ACCESS = "false";
  assert.equal(isOpenAccess(), false);
  process.env.SHOPIFY_OPEN_ACCESS = "0";
  assert.equal(isOpenAccess(), false);
  if (prev !== undefined) process.env.SHOPIFY_OPEN_ACCESS = prev;
  else delete process.env.SHOPIFY_OPEN_ACCESS;
});

test("openAccessPlan returns the configured open tier", () => {
  assert.equal(openAccessPlan(), OPEN_ACCESS_PLAN);
  assert.equal(OPEN_ACCESS_PLAN, "moving-in");
});