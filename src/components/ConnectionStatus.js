"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, RefreshCw, X } from "lucide-react";
import styles from "./ConnectionStatus.module.css";

export default function ConnectionStatus() {
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState("");
  const [showRecovered, setShowRecovered] = useState(false);
  const timerRef = useRef(null);

  const showNetworkError = useCallback(() => {
    setMessage("That action couldn't reach Secret Yarnery. Check your internet connection and try again.");
    setShowRecovered(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMessage(""), 7000);
  }, []);

  const verifyConnection = useCallback(async () => {
    if (!navigator.onLine) {
      setOffline(true);
      setShowRecovered(false);
      return false;
    }

    try {
      const response = await fetch("/favicon.ico?connection-check=" + Date.now(), {
        method: "HEAD",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error("Connection check failed");
      setOffline(false);
      setShowRecovered(true);
      setMessage("You're back online. You can continue using Secret Yarnery.");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setMessage("");
        setShowRecovered(false);
      }, 4500);
      return true;
    } catch {
      setOffline(true);
      setShowRecovered(false);
      return false;
    }
  }, []);

  useEffect(() => {
    setOffline(!navigator.onLine);

    const onOffline = () => {
      setOffline(true);
      setShowRecovered(false);
      setMessage("Your internet connection is unavailable. Some features may not work until you're connected again.");
    };
    const onOnline = () => {
      verifyConnection();
    };
    const onRequestError = () => showNetworkError();

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("yarnery:network-error", onRequestError);

    // A lightweight heartbeat catches connections that appear online to the
    // browser but cannot actually reach the site.
    const heartbeat = window.setInterval(() => {
      if (navigator.onLine) verifyConnection();
      else setOffline(true);
    }, 45000);

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      try {
        return await originalFetch.apply(window, args);
      } catch (error) {
        if (error?.name !== "AbortError") {
          window.dispatchEvent(new Event("yarnery:network-error"));
        }
        throw error;
      }
    };

    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("yarnery:network-error", onRequestError);
      window.clearInterval(heartbeat);
      window.fetch = originalFetch;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [showNetworkError, verifyConnection]);

  if (!offline && !message) return null;

  return (
    <div className={styles.wrapper} role="status" aria-live="polite">
      <div className={offline ? styles.bannerOffline : showRecovered ? styles.bannerOnline : styles.toast}>
        <span className={styles.icon}>
          {offline ? <WifiOff size={19} /> : showRecovered ? <Wifi size={19} /> : <WifiOff size={19} />}
        </span>
        <span className={styles.copy}>
          <strong>{offline ? "You're offline" : showRecovered ? "Connection restored" : "Connection problem"}</strong>
          <span>{message || "Connect to the internet to continue using all features."}</span>
        </span>
        {offline && (
          <button className={styles.retry} onClick={verifyConnection} type="button">
            <RefreshCw size={15} /> Retry
          </button>
        )}
        {!offline && (
          <button className={styles.close} onClick={() => { setMessage(""); setShowRecovered(false); }} type="button" aria-label="Dismiss">
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
