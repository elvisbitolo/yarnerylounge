"use client";

import { useMemo, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { QUIZ_QUESTIONS } from "@/lib/profile/questions";
import {
  CRAFT_OPTIONS,
  CROCHET_TECHNIQUES,
  CROCHET_MOTIVATIONS,
} from "@/lib/server/profile";
import styles from "./members.module.css";

const COLOR_WATCHES = [
  "#1E2A38",
  "#5B3A29",
  "#3E4C3B",
  "#7A1E1E",
  "#2E5E4E",
  "#6B3A5E",
  "#C26B3A",
  "#D4A33C",
  "#8A9A5B",
  "#4A6FA5",
  "#A5B0C4",
  "#6B7280",
  "#D47A7A",
  "#E5B8B8",
  "#F2D3A8",
  "#A8C8E8",
  "#D9E2F3",
  "#F5EFE0",
];

const YEARS_OPTIONS = [
  "Just started",
  "1 - 2 years",
  "3 - 5 years",
  "6 - 10 years",
  "10+ years",
];

const SKILL_OPTIONS = ["Beginner", "Intermediate", "Advanced"];

function titleCase(value) {
  if (!value) return "";
  return value
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function presetCounts(values, counts, key) {
  const out = {};
  for (const value of values) {
    out[value] = counts[key]?.[value] || 0;
  }
  return out;
}

function inUseOptions(counts, key) {
  return Object.entries(counts[key] || {})
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value);
}

function countOf(base, key, value) {
  return base[key]?.[value] || 0;
}

function countActive(filters, keys) {
  let n = 0;
  for (const key of keys) {
    const value = filters[key];
    if (Array.isArray(value)) n += value.length;
    else if (typeof value === "string" && value) n += 1;
  }
  return n;
}

function defaultQuiz() {
  return QUIZ_QUESTIONS.reduce((acc, q) => {
    acc[q.field] = q.multiple ? [] : "";
    return acc;
  }, {});
}

function FieldLabel({ children }) {
  return <span className={styles.fieldLabelSmall}>{children}</span>;
}

function Group({ title, children }) {
  return (
    <div className={styles.filterGroup}>
      <div className={styles.groupHeader}>
        <span className={styles.groupTitle}>{title}</span>
        <ChevronDown size={14} className={styles.groupChevron} />
      </div>
      <div className={styles.groupBody}>{children}</div>
    </div>
  );
}

function Chip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      className={active ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
      onClick={onClick}
    >
      {label}
      <span className={styles.optCount}>{count}</span>
    </button>
  );
}

function SelectFilter({ label, value, onChange, options, allLabel }) {
  return (
    <label className={styles.filterField}>
      {label && <span className={styles.filterLabel}>{label}</span>}
      <select
        className={styles.locationSelect}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function MultiChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      className={active ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
      onClick={onClick}
    >
      {label}
      <span className={styles.optCount}>{count}</span>
    </button>
  );
}

export default function MemberFilters({ filters, onChange, members }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const counts = useMemo(() => {
    const base = {};
    const add = (key, value) => {
      if (!value) return;
      base[key] = base[key] || {};
      base[key][value] = (base[key][value] || 0) + 1;
    };
    for (const m of members) {
      add("country", m.country);
      add("timezone", m.timezone);
      add("skillLevel", m.skillLevel);
      add("yearsExperience", m.yearsExperience);
      add("favoriteYarnBrand", m.favoriteYarnBrand);
      add("goToYarn", m.goToYarn);
      add("favoriteHookSize", m.favoriteHookSize);
      add("learningNext", m.learningNext);
      for (const v of m.crafts || []) add("craft", v);
      for (const v of m.hobbies || []) add("hobby", v);
      for (const v of m.crochetTechniques || []) add("techniques", v);
      for (const v of m.crochetMotivation || []) add("motivations", v);
      for (const v of m.favoriteColors || []) add("colors", v);
      for (const q of QUIZ_QUESTIONS) {
        const val = m.quiz?.[q.field];
        if (Array.isArray(val)) {
          for (const v of val) add(`quiz-${q.field}`, v);
        } else if (val) {
          add(`quiz-${q.field}`, val);
        }
      }
    }
    return base;
  }, [members]);

  const countryValues = inUseOptions(counts, "country").sort((a, b) =>
    a.localeCompare(b)
  );
  const inUseHobbies = inUseOptions(counts, "hobby");
  const timezoneValues = inUseOptions(counts, "timezone");
  const yarnOptions = inUseOptions(counts, "favoriteYarnBrand");
  const goToOptions = inUseOptions(counts, "goToYarn");
  const learningNextOptions = inUseOptions(counts, "learningNext");
  const hookSizeOptions = inUseOptions(counts, "favoriteHookSize");

  const craftCounts = presetCounts(CRAFT_OPTIONS, counts, "craft");
  const techniqueCounts = presetCounts(CROCHET_TECHNIQUES, counts, "techniques");
  const motivationCounts = presetCounts(CROCHET_MOTIVATIONS, counts, "motivations");

  const advancedCount = countActive(filters, [
    "skillLevel",
    "yearsExperience",
    "crochetTechniques",
    "crochetMotivation",
  ]);

  function toggleArray(key, value) {
    const current = Array.isArray(filters[key]) ? filters[key] : [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ [key]: next });
  }

  function patchQuiz(field, value) {
    onChange({ quiz: { ...filters.quiz, [field]: value } });
  }

  function clearAll() {
    onChange({
      skillLevel: "",
      yearsExperience: "",
      favoriteYarnBrand: "",
      goToYarn: "",
      favoriteHookSize: "",
      learningNext: "",
      crochetTechniques: [],
      crochetMotivation: [],
      favoriteColors: [],
      quiz: defaultQuiz(),
    });
  }

  const quizTotal = QUIZ_QUESTIONS.reduce(
    (n, q) =>
      n +
      (Array.isArray(filters.quiz[q.field])
        ? filters.quiz[q.field].length
        : filters.quiz[q.field]
          ? 1
          : 0),
    0
  );

  return (
    <div className={styles.advancedFilters}>
      <div className={styles.coreFilters}>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Location</span>
          <select
            className={styles.locationSelect}
            value={filters.country}
            onChange={(e) => onChange({ country: e.target.value })}
            aria-label="Filter by location"
          >
            <option value="">All countries</option>
            {countryValues.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Hobbies</span>
          <select
            className={styles.locationSelect}
            value={filters.hobby}
            onChange={(e) => onChange({ hobby: e.target.value })}
            aria-label="Filter by hobby"
          >
            <option value="">All hobbies</option>
            {inUseHobbies.map((h) => (
              <option key={h} value={h}>
                {titleCase(h)}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Timezone</span>
          <select
            className={styles.locationSelect}
            value={filters.timezone}
            onChange={(e) => onChange({ timezone: e.target.value })}
            aria-label="Filter by timezone"
          >
            <option value="">All timezones</option>
            {timezoneValues.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.craftRow}>
          <span className={styles.craftLabel}>Crafts</span>
          <button
            type="button"
            className={!filters.craft ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
            onClick={() => onChange({ craft: "" })}
          >
            All
          </button>
          {CRAFT_OPTIONS.map((c) => (
            <button
              type="button"
              key={c}
              className={filters.craft === c ? `${styles.craftChip} ${styles.craftActive}` : styles.craftChip}
              onClick={() => onChange({ craft: filters.craft === c ? "" : c })}
            >
              {titleCase(c)}
              <span className={styles.optCount}>{craftCounts[c] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.filterBar}>
        <button
          type="button"
          className={advancedOpen ? `${styles.filtersToggle} ${styles.filtersToggleActive}` : styles.filtersToggle}
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
        >
          <span className={styles.filtersToggleIcon} aria-hidden="true">
            <SlidersHorizontal size={14} />
          </span>
          More filters
          {advancedCount > 0 && <span className={styles.filtersBadge}>{advancedCount}</span>}
        </button>
      </div>

      {advancedOpen && (
        <>
          <Group title="Yarn story">
            <div className={styles.fieldGroup}>
              <FieldLabel>Skill level</FieldLabel>
              <div className={styles.chipRow}>
                <Chip
                  label="Any"
                  count={members.length}
                  active={!filters.skillLevel}
                  onClick={() => onChange({ skillLevel: "" })}
                />
                {SKILL_OPTIONS.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    count={countOf(counts, "skillLevel", s)}
                    active={filters.skillLevel === s}
                    onClick={() => onChange({ skillLevel: filters.skillLevel === s ? "" : s })}
                  />
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <FieldLabel>Years of experience</FieldLabel>
              <div className={styles.chipRow}>
                <Chip
                  label="Any"
                  count={members.length}
                  active={!filters.yearsExperience}
                  onClick={() => onChange({ yearsExperience: "" })}
                />
                {YEARS_OPTIONS.map((y) => (
                  <Chip
                    key={y}
                    label={y}
                    count={countOf(counts, "yearsExperience", y)}
                    active={filters.yearsExperience === y}
                    onClick={() => onChange({ yearsExperience: filters.yearsExperience === y ? "" : y })}
                  />
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <FieldLabel>Techniques</FieldLabel>
              <div className={styles.chipRow}>
                {CROCHET_TECHNIQUES.map((t) => (
                  <MultiChip
                    key={t}
                    label={titleCase(t)}
                    count={techniqueCounts[t] || 0}
                    active={(filters.crochetTechniques || []).includes(t)}
                    onClick={() => toggleArray("crochetTechniques", t)}
                  />
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <FieldLabel>Motivations</FieldLabel>
              <div className={styles.chipRow}>
                {CROCHET_MOTIVATIONS.map((m) => (
                  <MultiChip
                    key={m}
                    label={titleCase(m)}
                    count={motivationCounts[m] || 0}
                    active={(filters.crochetMotivation || []).includes(m)}
                    onClick={() => toggleArray("crochetMotivation", m)}
                  />
                ))}
              </div>
            </div>
            <div className={styles.fieldGroup}>
              <FieldLabel>Details</FieldLabel>
              <SelectFilter
                label=""
                value={filters.favoriteYarnBrand}
                onChange={(value) => onChange({ favoriteYarnBrand: value })}
                options={yarnOptions.map((v) => [v, v])}
                allLabel="Any go-to yarn brand"
              />
              <SelectFilter
                label=""
                value={filters.goToYarn}
                onChange={(value) => onChange({ goToYarn: value })}
                options={goToOptions.map((v) => [v, v])}
                allLabel="Any go-to yarn weight"
              />
              <SelectFilter
                label=""
                value={filters.favoriteHookSize}
                onChange={(value) => onChange({ favoriteHookSize: value })}
                options={hookSizeOptions.map((v) => [v, v])}
                allLabel="Any hook size"
              />
            </div>
          </Group>

          <Group title="Your makes">
            <div className={styles.fieldGroup}>
              <FieldLabel>Learning next</FieldLabel>
              <SelectFilter
                label=""
                value={filters.learningNext}
                onChange={(value) => onChange({ learningNext: value })}
                options={learningNextOptions.map((v) => [v, v])}
                allLabel="Anything"
              />
            </div>
            <div className={styles.fieldGroup}>
              <FieldLabel>Signature colour palette</FieldLabel>
              <div className={styles.chipRow}>
                {COLOR_WATCHES.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={
                      (filters.favoriteColors || []).includes(c)
                        ? `${styles.colorSwatch} ${styles.colorSwatchOn}`
                        : styles.colorSwatch
                    }
                    style={{ backgroundColor: c }}
                    aria-label={`Toggle palette colour ${c}`}
                    onClick={() => toggleArray("favoriteColors", c)}
                  />
                ))}
              </div>
              <span className={styles.colorHint}>
                {(() => {
                  const picked = filters.favoriteColors || [];
                  if (picked.length === 0) return "Tap up to three colours.";
                  return picked.join(" · ");
                })()}
              </span>
            </div>
          </Group>

          <Group title={`Crochet love quiz${quizTotal > 0 ? ` · ${quizTotal}` : ""}`}>
            <div className={styles.quizScroll}>
              {QUIZ_QUESTIONS.map((q) => (
                <div className={styles.fieldGroup} key={q.field}>
                  <FieldLabel>{q.question}</FieldLabel>
                  <div className={styles.chipRow}>
                    {q.options.map((option) => (
                      <MultiChip
                        key={option}
                        label={option}
                        count={countOf(counts, `quiz-${q.field}`, option)}
                        active={
                          q.multiple
                            ? (filters.quiz[q.field] || []).includes(option)
                            : filters.quiz[q.field] === option
                        }
                        onClick={() => {
                          if (q.multiple) {
                            const current = filters.quiz[q.field] || [];
                            const next = current.includes(option)
                              ? current.filter((v) => v !== option)
                              : [...current, option];
                            patchQuiz(q.field, next);
                          } else {
                            patchQuiz(q.field, filters.quiz[q.field] === option ? "" : option);
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Group>
        </>
      )}

      <button type="button" className={styles.resetChips} onClick={clearAll}>
        <X size={13} />
        Clear all filters
      </button>
    </div>
  );
}