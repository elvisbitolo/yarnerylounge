"use client";

import { useState } from "react";
import Link from "next/link";
import { buildSocialUrl, platformInfo } from "@/lib/profile/social";
import { CRAFT_LABELS } from "@/lib/profile/crafts";
import styles from "./account.module.css";

function initials(name) {
  return (name || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function ProfilePreview({
  memberId,
  name,
  username,
  headline,
  location,
  country,
  bio,
  favoriteColors,
  crafts,
  goToYarn,
  favoriteHookSize,
  yearsExperience,
  favoriteYarnBrand,
  crochetTechniques,
  crochetMotivation,
  learningNext,
  proudestProject,
  bestGiftProject,
  socialLinks,
  photoURL,
  coverPhotoURL,
}) {
  const [open, setOpen] = useState(false);
  const colors = (favoriteColors || []).filter(Boolean).slice(0, 3);
  const links = (socialLinks || [])
    .map((link) => ({
      ...link,
      url: buildSocialUrl(link.platform, link.handle),
      label: platformInfo(link.platform)?.label || link.platform,
    }))
    .filter((link) => link.url && link.handle);

  const details = [
    ["Go-to yarn", goToYarn],
    ["Favorite hook", favoriteHookSize],
    ["Crocheting for", yearsExperience],
    ["Favorite yarn brand", favoriteYarnBrand],
    ["Learning next", learningNext],
    ["Proudest project", proudestProject],
    ["Best for gifting", bestGiftProject],
  ].filter(([, value]) => String(value || "").trim());

  return (
    <section className={styles.profilePreviewSection} aria-label="Member profile preview">
      <div className={styles.profilePreviewToolbar}>
        <div>
          <h2 className={styles.cardTitle}>Member profile preview</h2>
          <p className={styles.profilePreviewIntro}>
            Preview your current edits before saving. This updates as you type.
          </p>
        </div>
        <button
          type="button"
          className={styles.profilePreviewToggle}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide preview" : "Preview profile"}
        </button>
      </div>

      {open && (
        <div className={styles.profilePreviewCard}>
          <div
            className={styles.profilePreviewCover}
            style={coverPhotoURL ? { backgroundImage: `url("${coverPhotoURL}")` } : undefined}
          >
            {!coverPhotoURL && <span>Profile cover</span>}
          </div>
          <div className={styles.profilePreviewHeader}>
            <div className={styles.profilePreviewAvatar}>
              {photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoURL} alt="" />
              ) : (
                initials(name)
              )}
            </div>
            <div className={styles.profilePreviewIdentity}>
              <h3>{name.trim() || "Your name"}</h3>
              {username && <p className={styles.profilePreviewUsername}>@{username}</p>}
              {headline && <p className={styles.profilePreviewHeadline}>{headline}</p>}
              {(location || country) && (
                <p className={styles.profilePreviewLocation}>
                  {[location, country].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>

          <div className={styles.profilePreviewBody}>
            {bio.trim() ? (
              <p className={styles.profilePreviewBio}>{bio}</p>
            ) : (
              <p className={styles.profilePreviewEmpty}>Your bio will appear here when you add one.</p>
            )}

            {links.length > 0 && (
              <div className={styles.profilePreviewLinks}>
                {links.map((link, index) => (
                  <span key={`${link.platform}-${index}`}>{link.label}</span>
                ))}
              </div>
            )}

            {colors.length > 0 && (
              <div className={styles.profilePreviewSectionBlock}>
                <span className={styles.profilePreviewLabel}>Favorite colors</span>
                <div className={styles.profilePreviewColors}>
                  {colors.map((color, index) => (
                    <span
                      key={`${color}-${index}`}
                      className={styles.profilePreviewColor}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(crafts) && crafts.length > 0 && (
              <div className={styles.profilePreviewSectionBlock}>
                <span className={styles.profilePreviewLabel}>Crafts</span>
                <div className={styles.profilePreviewTags}>
                  {crafts.map((craft) => (
                    <span key={craft}>{CRAFT_LABELS[craft] || craft}</span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(crochetTechniques) && crochetTechniques.length > 0 && (
              <div className={styles.profilePreviewSectionBlock}>
                <span className={styles.profilePreviewLabel}>Techniques</span>
                <div className={styles.profilePreviewTags}>
                  {crochetTechniques.map((technique) => (
                    <span key={technique}>{technique.charAt(0).toUpperCase() + technique.slice(1)}</span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(crochetMotivation) && crochetMotivation.length > 0 && (
              <div className={styles.profilePreviewSectionBlock}>
                <span className={styles.profilePreviewLabel}>Why I crochet</span>
                <div className={styles.profilePreviewTags}>
                  {crochetMotivation.map((motive) => (
                    <span key={motive}>{motive.charAt(0).toUpperCase() + motive.slice(1)}</span>
                  ))}
                </div>
              </div>
            )}

            {details.length > 0 && (
              <dl className={styles.profilePreviewDetails}>
                {details.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          {memberId && (
            <div className={styles.profilePreviewFooter}>
              <span>Live draft preview · Full public page uses your saved profile.</span>
              <Link href={`/members/${memberId}`}>View saved profile</Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
