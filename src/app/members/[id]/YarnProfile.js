"use client";
import { useState } from "react";
import { QUIZ_QUESTIONS, QUIZ_LABELS, quizAnswerLabel } from "@/lib/profile/questions";
import { CRAFT_LABELS } from "@/lib/profile/crafts";
import styles from "./profile.module.css";

const INITIAL_ROW_COUNT = 3;

export default function YarnProfile({ member }) {
  const [expanded, setExpanded] = useState(false);
  const rows = [];

  if (member.favoriteColors?.length > 0) {
    rows.push(
      <div key="favoriteColors" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Favorite colors</span>
        <span className={styles.colorDots}>
          {member.favoriteColors.map((color, i) => (
            <span key={i} className={styles.colorDot} style={{ backgroundColor: color }} />
          ))}
        </span>
      </div>
    );
  }
  if (Array.isArray(member.crafts) && member.crafts.length > 0) {
    rows.push(
      <div key="crafts" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Crafts</span>
        <span className={styles.craftTags}>
          {member.crafts.map((craft) => (
            <span key={craft} className={styles.craftTag}>
              {CRAFT_LABELS[craft] || craft}
            </span>
          ))}
        </span>
      </div>
    );
  }
  if (member.goToYarn) {
    rows.push(
      <p key="goToYarn" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Go-to yarn</span>
        <span className={styles.yarnValue}>{member.goToYarn}</span>
      </p>
    );
  }
  if (member.favoriteHookSize) {
    rows.push(
      <p key="favoriteHookSize" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Favorite hook</span>
        <span className={styles.yarnValue}>{member.favoriteHookSize}</span>
      </p>
    );
  }
  if (member.yearsExperience) {
    rows.push(
      <p key="yearsExperience" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Crocheting for</span>
        <span className={styles.yarnValue}>{member.yearsExperience}</span>
      </p>
    );
  }
  if (member.favoriteYarnBrand) {
    rows.push(
      <p key="favoriteYarnBrand" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Favorite yarn brand</span>
        <span className={styles.yarnValue}>{member.favoriteYarnBrand}</span>
      </p>
    );
  }
  if (Array.isArray(member.crochetTechniques) && member.crochetTechniques.length > 0) {
    rows.push(
      <div key="crochetTechniques" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Techniques</span>
        <span className={styles.craftTags}>
          {member.crochetTechniques.map((technique) => (
            <span key={technique} className={styles.craftTag}>
              {technique.charAt(0).toUpperCase() + technique.slice(1)}
            </span>
          ))}
        </span>
      </div>
    );
  }
  if (Array.isArray(member.crochetMotivation) && member.crochetMotivation.length > 0) {
    rows.push(
      <div key="crochetMotivation" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Why I crochet</span>
        <span className={styles.craftTags}>
          {member.crochetMotivation.map((motive) => (
            <span key={motive} className={styles.craftTag}>
              {motive.charAt(0).toUpperCase() + motive.slice(1)}
            </span>
          ))}
        </span>
      </div>
    );
  }
  if (member.learningNext) {
    rows.push(
      <p key="learningNext" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Learning next</span>
        <span className={styles.yarnValue}>{member.learningNext}</span>
      </p>
    );
  }
  if (member.proudestProject) {
    rows.push(
      <p key="proudestProject" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Proudest project</span>
        <span className={styles.yarnValue}>{member.proudestProject}</span>
      </p>
    );
  }
  if (member.bestGiftProject) {
    rows.push(
      <p key="bestGiftProject" className={styles.yarnRow}>
        <span className={styles.yarnLabel}>Best for gifting</span>
        <span className={styles.yarnValue}>{member.bestGiftProject}</span>
      </p>
    );
  }
  for (const q of QUIZ_QUESTIONS) {
    const answer = quizAnswerLabel(q, member);
    if (answer) {
      rows.push(
        <p key={q.field} className={styles.yarnRow}>
          <span className={styles.yarnLabel}>{QUIZ_LABELS[q.field]}</span>
          <span className={styles.yarnValue}>{answer}</span>
        </p>
      );
    }
  }

  if (rows.length === 0) return null;
  const hasMore = rows.length > INITIAL_ROW_COUNT;
  const visibleRows = expanded ? rows : rows.slice(0, INITIAL_ROW_COUNT);

  return (
    <div className={styles.yarnProfile}>
      {visibleRows}
      {hasMore && (
        <button
          type="button"
          className={styles.yarnMoreBtn}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "See more"}
        </button>
      )}
    </div>
  );
}