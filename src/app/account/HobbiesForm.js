"use client";

import { useState } from "react";
import {
  AlignLeft,
  Archive,
  Armchair,
  Bird,
  BookOpen,
  CakeSlice,
  Camera,
  Check,
  Cherry,
  CircleDashed,
  Clover,
  Cloud,
  CookingPot,
  Dices,
  Disc3,
  Dog,
  Dumbbell,
  Droplets,
  Eye,
  FileText,
  FishingHook,
  Flower2,
  Footprints,
  FolderOpen,
  Gift,
  Grid3x3,
  Hammer,
  HandHeart,
  Headphones,
  Heart,
  Home,
  Hourglass,
  Landmark,
  Layers,
  Leaf,
  LoaderPinwheel,
  Mountain,
  Music,
  Music2,
  Music3,
  Music4,
  NotebookPen,
  Palette,
  PenLine,
  PersonStanding,
  PieChart,
  Play,
  Plus,
  Puzzle,
  RefreshCcw,
  Save,
  Scissors,
  Search,
  ShoppingBag,
  Shirt,
  Sparkles,
  Sprout,
  SquareScissors,
  Store,
  Tag,
  ThumbsUp,
  Timer,
  TreePine,
  Trophy,
  Tv,
  UtensilsCrossed,
  Wine,
  X,
  Zap,
} from "lucide-react";
import { HOBBY_CATEGORIES } from "@/lib/server/profile";
import styles from "./account.module.css";

const HOBBY_ICONS = {
  cooking: CookingPot,
  baking: CakeSlice,
  sewing: Scissors,
  knitting: CircleDashed,
  crochet: FishingHook,
  dyeing: Droplets,
  spinning: LoaderPinwheel,
  macrame: Layers,
  tufting: Grid3x3,
  "cross stitch": Scissors,
  felting: Droplets,
  "diy t-shirt yarn": Scissors,
  quilting: PieChart,
  "diamond painting": Sparkles,
  "making my own yarn": LoaderPinwheel,
  "buying yarn": ShoppingBag,
  "organizing yarn": FolderOpen,
  "starting a wip": Play,
  upcycling: RefreshCcw,
  "charity crafting": Heart,

  gardening: Sprout,
  pottery: Flower2,
  painting: Palette,
  photography: Camera,
  scrapbooking: NotebookPen,
  upholstery: Armchair,
  woodworking: Hammer,
  decoupage: SquareScissors,
  organizing: FolderOpen,
  "color coding my life": Palette,
  "donating unused stuff": Gift,
  "collecting stationary supplies": PenLine,
  "redecorating my house": Home,
  journaling: FileText,
  fashion: Shirt,

  shopping: ShoppingBag,
  thrifting: Tag,
  antiquing: Hourglass,
  "card games": Clover,
  "board games": Dices,
  "jigsaw puzzles": Puzzle,
  sudoku: Grid3x3,
  "crossword puzzles": AlignLeft,
  "word search": Search,
  trivia: Trophy,

  "trying new recipes": UtensilsCrossed,
  "trying new high protein recipes": UtensilsCrossed,
  margaritas: Wine,
  wine: Wine,
  "cake decorating": CakeSlice,
  "jam making": Cherry,

  yoga: PersonStanding,
  "weight training": Dumbbell,
  pilates: PersonStanding,
  "tai chi": Zap,
  swimming: Mountain,
  walking: Footprints,
  hiking: Mountain,
  running: Zap,
  "line dancing": Music,

  reading: BookOpen,
  "audio books": Headphones,
  "hallmark movies": Tv,
  "true crime": Eye,
  museums: Landmark,

  "dog training": Dog,
  "bird watching": Bird,
  "flower pressing": Flower2,

  "craft fairs": Store,
  volunteering: HandHeart,

  "rap music": Music,
  "country music": Music2,
  "classical music": Music3,
  "classic rock": Music4,
  "jazz music": Music,
  "hip hop music": Disc3,
  "lo fi beats": Headphones,
  "ambient & new age music": Cloud,
  "motown & soul": Heart,
  "house music": Home,
  "indie chill music": Leaf,
  "folk music": TreePine,
  "classic r&b": Disc3,
};

function title(value) {
  return value
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function HobbiesForm({ initial, username }) {
  const [selected, setSelected] = useState(() =>
    Array.isArray(initial)
      ? [...new Set(initial.map((h) => String(h || "").trim().toLowerCase()).filter(Boolean))]
      : []
  );
  const [custom, setCustom] = useState([]);
  const [otherValue, setOtherValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const allHobbies = [...new Set([...selected, ...custom])];

  function togglePreset(value) {
    setSaved(false);
    setNotice("");
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function addCustom() {
    const value = otherValue.trim().toLowerCase();
    setError("");
    if (!value) return;
    if (HOBBY_CATEGORIES.some((c) => c.hobbies.includes(value))) {
      setOtherValue("");
      if (!selected.includes(value)) setSelected((prev) => [...prev, value]);
      return;
    }
    if (allHobbies.includes(value)) return;
    setCustom((prev) => [...prev, value]);
    setOtherValue("");
  }

  function removeCustom(value) {
    setCustom((prev) => prev.filter((v) => v !== value));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setNotice("");
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hobbies: allHobbies }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save hobbies");
      }
      setSaved(true);
      setNotice(allHobbies.length ? "Your hobbies are saved." : "You haven't picked any hobbies yet.");
    } catch (err) {
      setError(err.message || "Failed to save hobbies");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.card} onSubmit={handleSave}>
      <h2 className={styles.cardTitle}>Share your hobbies</h2>
      {username ? (
        <p className={styles.hobbiesIntro}>
          Tell the community a little about what you love to do beyond the yarn. Pick as many as you like
          — members with similar hobbies can find you more easily.
        </p>
      ) : (
        <p className={styles.hobbiesIntro}>
          Tell the community a little about what you love to do beyond the yarn. Pick as many as you like.
        </p>
      )}

      {error && <p className={styles.formError}>{error}</p>}
      {saved && <p className={styles.formSaved}>Saved!</p>}
      {notice && <p className={styles.formNotice}>{notice}</p>}

      {HOBBY_CATEGORIES.map((cat) => (
        <div key={cat.label} className={styles.hobbyCategory}>
          <h3 className={styles.hobbyCategoryTitle}>{cat.label}</h3>
          <div className={styles.hobbiesGrid}>
            {cat.hobbies.map((value) => {
              const Icon = HOBBY_ICONS[value];
              const on = selected.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  className={on ? `${styles.hobbyChip} ${styles.hobbyChipOn}` : styles.hobbyChip}
                  onClick={() => togglePreset(value)}
                  aria-pressed={on}
                >
                  <span className={styles.hobbyIcon}>
                    {Icon ? <Icon size={18} strokeWidth={2} aria-hidden="true" /> : <ThumbsUp size={18} strokeWidth={2} aria-hidden="true" />}
                  </span>
                  <span className={styles.hobbyLabel}>{title(value)}</span>
                  <span className={styles.hobbyCheck} aria-hidden="true">
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className={styles.otherField}>
        <label className={styles.fieldLabel} htmlFor="hobbies-other">
          Something else?
        </label>
        <div className={styles.otherRow}>
          <input
            id="hobbies-other"
            className={styles.input}
            type="text"
            maxLength={60}
            placeholder="e.g. calligraphy, surfing, beekeeping…"
            value={otherValue}
            onChange={(e) => setOtherValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
          />
          <button type="button" className={styles.otherAdd} onClick={addCustom}>
            <Plus size={18} strokeWidth={2} aria-hidden="true" />
            Add
          </button>
        </div>
        <p className={styles.fieldHint}>Type a hobby and press Add — enter as many as you like.</p>
      </div>

      {custom.length > 0 && (
        <div className={styles.customList}>
          {custom.map((value) => (
            <span key={value} className={styles.customChip}>
              <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
              {title(value)}
              <button
                type="button"
                className={styles.customRemove}
                onClick={() => removeCustom(value)}
                aria-label={`Remove ${value}`}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.hobbiesFooter}>
        <span className={styles.hobbiesCount}>
          {allHobbies.length} {allHobbies.length === 1 ? "hobby" : "hobbies"} selected
        </span>
        <button className={styles.manage} type="submit" disabled={busy}>
          <Save size={18} strokeWidth={2} aria-hidden="true" />
          {busy ? "Saving…" : "Save hobbies"}
        </button>
      </div>
    </form>
  );
}
