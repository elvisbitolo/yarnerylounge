"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

export default function LanguageSwitcher() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function switchLang(code) {
    // eslint-disable-next-line react-hooks/immutability -- assigning document.cookie is the documented browser API
    document.cookie = `NEXT_LOCALE=${code}; path=/; max-age=31536000`;
    setOpen(false);
    window.location.reload();
  }

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        onClick={() => setOpen(!open)}
        aria-label="Switch language"
        style={{
          background: "none",
          border: "none",
          color: "#8a7c6f",
          fontSize: 18,
          cursor: "pointer",
          padding: 4,
          display: "flex",
          alignItems: "center",
        }}
      >
        🌐
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#ffffff",
            border: "1px solid #eadfd2",
            borderRadius: 10,
            padding: 6,
            minWidth: 150,
            boxShadow: "0 8px 24px rgba(9,12,38,0.14)",
            zIndex: 1000,
          }}
        >
          {LANGUAGES.map((lang) => {
            const current = document.cookie
              .split("; ")
              .find((c) => c.startsWith("NEXT_LOCALE="))
              ?.split("=")[1];
            const isActive = (current || "en") === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => switchLang(lang.code)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 12px",
                  border: "none",
                  background: isActive ? "rgba(244,46,121,0.12)" : "transparent",
                  color: isActive ? "#d81f66" : "#34344a",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span style={{ fontSize: 16 }}>{lang.flag}</span>
                {lang.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
