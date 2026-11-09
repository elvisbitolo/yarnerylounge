"use client";

import { useState } from "react";

const RULES = [
  { key: "length", test: (v) => v.length >= 6, label: "At least 6 characters" },
];

export default function PasswordInput({
  id = "password",
  label = "Password",
  value,
  onChange,
  required = true,
  autoComplete = "new-password",
  placeholder = "At least 6 characters",
  showRules = true,
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  const rules = RULES.map((r) => ({ ...r, passed: r.test(value || "") }));
  const allPassed = rules.every((r) => r.passed);

  return (
    <div>
      <div style={{ position: "relative" }}>
        <label
          htmlFor={id}
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 600,
            color: "#34344a",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
        <div style={{ position: "relative" }}>
          <input
            id={id}
            type={visible ? "text" : "password"}
            required={required}
            minLength={6}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{
              width: "100%",
              height: 46,
              padding: "0 44px 0 14px",
              fontSize: 15,
              border: "1px solid #d8d8e3",
              borderRadius: 10,
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            }}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9b9bab",
              borderRadius: 6,
              transition: "color 0.15s",
            }}
          >
            {visible ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {showRules && value && focused && (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          {rules.map((r) => (
            <div
              key={r.key}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12,
                color: r.passed ? "#16a34a" : "#9b9bab",
                transition: "color 0.15s",
              }}
            >
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: `1.5px solid ${r.passed ? "#16a34a" : "#d8d8e3"}`,
                  background: r.passed ? "#16a34a" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  transition: "all 0.15s",
                }}
              >
                {r.passed && (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </span>
              {r.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
