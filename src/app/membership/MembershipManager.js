"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ShopifyBillingLink from "@/components/ShopifyBillingLink";
import styles from "./membership.module.css";

const CANCEL_REASONS = [
  { value: "too_expensive", label: "The plan is too expensive" },
  { value: "not_using", label: "I am not using the membership enough" },
  { value: "missing_features", label: "It does not have what I need" },
  { value: "technical_issues", label: "I experienced technical issues" },
  { value: "taking_a_break", label: "I am taking a break" },
  { value: "other", label: "Other" },
];

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "The membership update failed.");
  return data;
}

export default function MembershipManager({ currentTier, canManage, isStaff = false, tiers }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const currentLabel = tiers.find((tier) => tier.tier === currentTier)?.label || "Flirting";
  const upgrades = tiers.filter((tier) => tier.action === "upgrade");
  const downgrades = tiers.filter((tier) => tier.action === "downgrade");
  const canCancel = tiers.some((tier) => tier.action === "cancel");

  async function runAction(key, url, payload, confirmation, onSuccess) {
    if (busy) return;
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(key);
    setError("");
    setSuccess("");
    try {
      const data = await postJson(url, payload);
      setSuccess(data.message || "Your membership has been updated.");
      if (onSuccess) onSuccess(data);
      router.refresh();
    } catch (err) {
      setError(err.message || "We could not update your membership. Please try again.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className={styles.manager} aria-labelledby="membership-manager-title">
      <div className={styles.managerHeader}>
        <div>
          <h2 className={styles.managerTitle} id="membership-manager-title">Manage your membership</h2>
          <p className={styles.managerCurrent}>
            {isStaff ? "Saved billing plan" : "Saved plan"}: <strong>{currentLabel}</strong>
          </p>
        </div>
        <Link className={styles.managerAccountLink} href="/account/membership">
          View account and payment history →
        </Link>
      </div>

      {!canManage ? (
        <p className={styles.managerNote}>
          {isStaff
            ? "Your owner/moderator role grants staff access independently of paid membership. This saved billing plan is retained for payment-history accuracy; it does not control your staff privileges."
            : "Staff membership access is controlled by your role, so it cannot be changed here."}
        </p>
      ) : (
        <>
          {error ? <p className={styles.managerError} role="alert">{error}</p> : null}
          {success ? <p className={styles.managerSuccess} role="status">{success}</p> : null}

          <div className={styles.managerGrid}>
            <div className={styles.managerBlock}>
              <h3 className={styles.managerBlockTitle}>Upgrade</h3>
              {upgrades.length ? (
                upgrades.map((tier) => (
                  <div className={styles.managerTierRow} key={tier.tier}>
                    <p className={styles.managerCopy}>
                      Move to <strong>{tier.label}</strong> through secure storefront checkout.
                    </p>
                    <div className={styles.managerLinks}>
                      <a
                        className={styles.managerLink}
                        href={tier.monthly}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {tier.monthlyLabel}
                      </a>
                      {tier.annual ? (
                        <a
                          className={styles.managerLink}
                          href={tier.annual}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tier.annualLabel}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.managerCopy}>You are already on the highest tier.</p>
              )}
            </div>

            <div className={styles.managerBlock}>
              <h3 className={styles.managerBlockTitle}>Downgrade</h3>
              {downgrades.length ? (
                downgrades.map((tier) => (
                  <div className={styles.managerTierRow} key={tier.tier}>
                    <p className={styles.managerCopy}>
                      Switch to <strong>{tier.label}</strong> and keep your remaining paid benefits.
                    </p>
                    <button
                      type="button"
                      className={`${styles.managerButton} ${styles.managerButtonSecondary}`}
                      disabled={Boolean(busy)}
                      onClick={() => runAction(
                        `downgrade-${tier.tier}`,
                        "/api/membership/plan",
                        { plan: tier.tier },
                        `Switch from ${currentLabel} to ${tier.label} now? Lower-tier access starts immediately and a billing-change request is recorded for the store team.`,
                      )}
                    >
                      {busy === `downgrade-${tier.tier}` ? "Switching…" : `Switch to ${tier.label}`}
                    </button>
                  </div>
                ))
              ) : (
                <p className={styles.managerCopy}>There is no lower paid tier.</p>
              )}
            </div>

            <div className={styles.managerBlock}>
              <h3 className={styles.managerBlockTitle}>Cancel</h3>
              {canCancel ? (
                <>
                  <label className={styles.managerField} htmlFor="membership-cancel-reason">
                    Reason, optional
                  </label>
                  <select
                    className={styles.managerInput}
                    id="membership-cancel-reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  >
                    <option value="">Choose a reason</option>
                    {CANCEL_REASONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <label className={styles.managerField} htmlFor="membership-cancel-note">
                    Note, optional
                  </label>
                  <textarea
                    className={styles.managerTextarea}
                    id="membership-cancel-note"
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Share anything that could help us improve."
                  />
                  <ShopifyBillingLink
                    className={styles.managerLink}
                    wrapperClassName={styles.managerCopy}
                    message="Link your Shopify billing once so cancellation ends recurring billing here."
                  />
                  <button
                    type="button"
                    className={`${styles.managerButton} ${styles.managerButtonDanger}`}
                    disabled={Boolean(busy)}
                    onClick={() => runAction(
                      "cancel",
                      "/api/membership/cancel",
                      { reason, note },
                      `Cancel your ${currentLabel} plan now? Paid access and recurring billing end immediately.`,
                    )}
                  >
                    {busy === "cancel" ? "Canceling…" : "Cancel paid plan"}
                  </button>
                </>
              ) : (
                <p className={styles.managerCopy}>
                  You are on the free Flirting tier, so there is no paid plan to cancel.
                </p>
              )}
            </div>
          </div>

          <p className={styles.managerNote}>
            Upgrades open the secure storefront checkout. Downgrades change access here immediately.
            Once Shopify billing is linked, cancellations end access and recurring billing here without
            a separate Shopify visit.
          </p>
        </>
      )}
    </section>
  );
}
