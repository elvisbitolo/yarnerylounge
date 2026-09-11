"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { auth, onAuthStateChanged } from "@/lib/auth-client";
import Nav from "@/components/Nav";
import ForYou from "./ForYou";
import styles from "./discovery.module.css";
import { Heart, MessageCircle } from "lucide-react";

function money(cents) {
  return cents > 0 ? `$${(cents / 100).toFixed(2)}` : "";
}

function initials(name) {
  return (name || "M")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DiscoveryPage() {
  const router = useRouter();
  const [role, setRole] = useState("member");
  const [discovery, setDiscovery] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/discovery");
    if (res.ok) setDiscovery((await res.json()).discovery);
    else setError("Could not load discovery");
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

  useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setRole(data.role));
  }, []);

  return (
    <Nav role={role}>
      <div className={styles.container}>
        <h1 className={styles.title}>Discovery</h1>
        <p className={styles.subtitle}>
          A snapshot of what&apos;s happening across the community.
        </p>
        {error && <p className={styles.error}>{error}</p>}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>For you</h2>
          <ForYou />
        </section>

        {discovery && (
          <>
            {discovery.featured.length === 0 &&
              discovery.upcomingEvents.length === 0 &&
              discovery.topPosts.length === 0 &&
              discovery.topSpaces.length === 0 &&
              discovery.topMembers.length === 0 && (
                <p className={styles.empty}>
                  Nothing to show yet. Post in the feed or check back soon.
                </p>
              )}

            {discovery.featured.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Featured</h2>
                <div className={styles.grid}>
                  {discovery.featured.map((post) => (
                    <Link
                      key={post.id}
                      href={"/feed"}
                      className={styles.card}
                    >
                      <p className={styles.cardText}>{post.text || "(no text)"}</p>
                      <p className={styles.cardMeta}>
                        {post.authorName} · {post.likeCount} likes ·{" "}
                        {post.commentCount} comments
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {discovery.upcomingEvents.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Upcoming events</h2>
                <div className={styles.list}>
                  {discovery.upcomingEvents.map((event) => (
                    <Link key={event.id} href="/events" className={styles.listRow}>
                      <span className={styles.listMain}>
                        {event.title}
                        {money(event.purchasePriceCents) && (
                          <span className={styles.tag}>Paid {money(event.purchasePriceCents)}</span>
                        )}
                      </span>
                      <span className={styles.listMeta}>
                        {new Date(event.startTime).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {discovery.topPosts.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Top posts</h2>
                <div className={styles.list}>
                  {discovery.topPosts.map((post) => (
                    <Link key={post.id} href={"/feed"} className={styles.listRow}>
                      <span className={styles.listMain}>
                        {post.text || "(no text)"}
                      </span>
                      <span className={styles.listMeta}>
                        {post.likeCount} <Heart size={13} /> · {post.commentCount} <MessageCircle size={13} />
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {discovery.topSpaces.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Top spaces</h2>
                <div className={styles.grid}>
                  {discovery.topSpaces.map((space) => (
                    <Link
                      key={space.id}
                      href={`/spaces/${space.slug}`}
                      className={styles.card}
                    >
                      <p className={styles.cardText}>{space.name}</p>
                      <p className={styles.cardMeta}>
                        {space.memberCount} member{space.memberCount === 1 ? "" : "s"}
                        {money(space.purchasePriceCents) && ` · ${money(space.purchasePriceCents)}`}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {discovery.topMembers.length > 0 && (
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Top members</h2>
                <div className={styles.grid}>
                  {discovery.topMembers.map((member) => (
                    <Link
                      key={member.userId}
                      href={`/members/${member.userId}`}
                      className={styles.card}
                    >
                      <span className={styles.avatar}>{initials(member.name)}</span>
                      <p className={styles.cardText}>{member.name}</p>
                      <p className={styles.cardMeta}>
                        {member.points} pts · {member.badgeCount} badges · #{member.rank}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </Nav>
  );
}
