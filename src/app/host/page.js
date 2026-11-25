"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import styles from "../admin/rooms/admin.module.css";

function scopeHref(scope) {
  if (scope.scopeType === "room") return `/rooms/${scope.slug}`;
  if (scope.scopeType === "event") return `/events`;
  if (scope.scopeType === "course") return `/host/courses/${scope.scopeId}`;
  if (scope.scopeType === "group") return `/groups/${scope.slug}`;
  if (scope.scopeType === "space") return `/spaces/${scope.slug}`;
  return "#";
}

export default function HostPage() {
  const router = useRouter();
  const [scopes, setScopes] = useState([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/host/scopes");
    if (res.ok) setScopes((await res.json()).scopes || []);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load();
    });
    return unsub;
  }, [router, load]);

  return (
      <div className={styles.container}>
        <h1 className={styles.title}>Host tools</h1>
        <p className={styles.itemMeta}>
          Everything you host in one place. Open your lounges and create lounges in
          the spaces and groups you host.
        </p>

        {scopes.length === 0 ? (
          <p className={styles.empty}>
            You don&apos;t host anything yet. Ask an admin to assign you a lounge,
            space, or group.
          </p>
        ) : (
          <div className={styles.list}>
            {scopes.map((scope) => (
              <div key={`${scope.scopeType}-${scope.scopeId}`} className={styles.item}>
                <div>
                  <p className={styles.itemName}>
                    {scope.name}
                    <span style={{ fontSize: 12, color: "#9b9bab", fontWeight: 500 }}>
                      {" "}
                      · {scope.scopeType} · {scope.role}
                    </span>
                  </p>
                </div>
                <div className={styles.itemActions}>
                  <Link className={styles.toggle} href={scopeHref(scope)}>
                    Open
                  </Link>
                  {(scope.scopeType === "space" || scope.scopeType === "group") && (
                    <Link
                      className={styles.toggle}
                      href={`/host/rooms?scopeType=${scope.scopeType}&scopeId=${scope.scopeId}`}
                    >
                      Create lounge
                    </Link>
                  )}
                  {scope.scopeType === "space" && (
                    <>
                      <Link
                        className={styles.toggle}
                        href={`/host/courses?spaceId=${scope.scopeId}`}
                      >
                        Manage courses
                      </Link>
                      <Link
                        className={styles.toggle}
                        href={`/host/events?spaceId=${scope.scopeId}`}
                      >
                        Schedule events
                      </Link>
                    </>
                  )}
                  {scope.scopeType === "event" && (
                    <Link className={styles.toggle} href={`/host/events`}>
                      Manage event
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
  );
}
