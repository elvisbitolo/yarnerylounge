"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QUIZ_QUESTIONS } from "@/lib/profile/questions";
import { COUNTRIES, countryByCode } from "@/lib/profile/countries";
import {
  SOCIAL_PLATFORMS,
  platformInfo,
  buildSocialUrl,
  extractHandle,
} from "@/lib/profile/social";
import {
  CRAFT_OPTIONS,
  CROCHET_TECHNIQUES,
  CROCHET_MOTIVATIONS,
} from "@/lib/server/profile";
import styles from "./account.module.css";
import coverStyles from "./cover.module.css";
import { Image as ImageIcon } from "lucide-react";

const QUESTIONS_PER_PAGE = 3;
const QUIZ_PAGE_COUNT = Math.ceil(QUIZ_QUESTIONS.length / QUESTIONS_PER_PAGE);

const STEP_LABELS = [
  "Bio",
  "Colours & links",
  "Yarn story",
  "Your makes",
  "Love quiz",
];

function normalize(value) {
  return (value || "").trim();
}

const LIMITS = {
  name: 60,
  headline: 120,
  location: 80,
  country: 60,
  bio: 600,
  yarn: 80,
  hook: 40,
  yarnBrand: 80,
  learning: 160,
  project: 140,
};

const YEARS_OPTIONS = [
  "Less than a year",
  "1–2 years",
  "3–5 years",
  "6–10 years",
  "10+ years",
  "It's my whole personality",
];

const COVER_RATIO = 4 / 1;

const PALETTE_PRESETS = [
  { name: "Sunset Glow", colors: ["#ff6f61", "#ffb37b", "#ff8fab"] },
  { name: "Ocean Waves", colors: ["#14b8a6", "#06b6d4", "#0ea5e9"] },
  { name: "Earthy Vibes", colors: ["#708238", "#a3b18a", "#c67c5a"] },
  { name: "Pastel Dream", colors: ["#c4b5fd", "#a5f3fc", "#fde68a"] },
  { name: "Jewel Tones", colors: ["#059669", "#1d4ed8", "#be123c"] },
  { name: "Blush & Rose", colors: ["#ff7a9e", "#ff9a9e", "#fbc4c4"] },
];

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        if (img.naturalWidth <= MAX_DIM && img.naturalHeight <= MAX_DIM) {
          resolve({
            dataUrl: reader.result,
            width: img.naturalWidth,
            height: img.naturalHeight,
            element: img,
          });
          return;
        }
        const scale = Math.min(MAX_DIM / img.naturalWidth, MAX_DIM / img.naturalHeight, 1);
        const width = Math.round(img.naturalWidth * scale);
        const height = Math.round(img.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        const resized = new Image();
        resized.onload = () => {
          resolve({
            dataUrl,
            width: resized.naturalWidth,
            height: resized.naturalHeight,
            element: resized,
          });
        };
        resized.onerror = () => reject(new Error("Couldn't resize that image"));
        resized.src = dataUrl;
      };
      img.onerror = () => reject(new Error("Couldn't read that image"));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

function coverWindow(width, height, ratio = COVER_RATIO) {
  const winW = Math.min(width, height * ratio);
  const winH = Math.min(height, width / ratio);
  const offX = (width - winW) / 2;
  const offY = (height - winH) / 2;
  return { winW, winH, offX, offY };
}

function cropImageToBanner(img, rect) {
  const targetRatio = COVER_RATIO;
  const scale = Math.min(1, 1200 / rect.w);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(rect.w * scale);
  canvas.height = Math.round(rect.w * scale / targetRatio);
  canvas.getContext("2d").drawImage(
    img,
    rect.x,
    rect.y,
    rect.w,
    rect.w / targetRatio,
    0,
    0,
    canvas.width,
    canvas.height
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

function cropImageToAvatar(img, rect) {
  const target = 512;
  const canvas = document.createElement("canvas");
  canvas.width = target;
  canvas.height = target;
  canvas.getContext("2d").drawImage(
    img,
    rect.x,
    rect.y,
    rect.w,
    rect.h,
    0,
    0,
    target,
    target
  );
  return canvas.toDataURL("image/jpeg", 0.85);
}

function cropRatioFor(kind) {
  return kind === "avatar" ? 1 : COVER_RATIO;
}

function toHandledLinks(links) {  if (!Array.isArray(links) || links.length === 0) return [];
  return links
    .map((l) => {
      const platform = l.platform || "other";
      const handle =
        typeof l.handle === "string"
          ? l.handle
          : extractHandle(platform, typeof l.url === "string" ? l.url : "");
      return { platform, handle };
    })
    .filter((l) => l.handle);
}

export default function ProfileEditor({ initial }) {
  const [name, setName] = useState(initial.name || "");
  const [headline, setHeadline] = useState(initial.headline || "");
  const [location, setLocation] = useState(initial.location || "");
  const [country, setCountry] = useState(initial.country || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [favoriteColors, setFavoriteColors] = useState(
    Array.isArray(initial.favoriteColors) && initial.favoriteColors.length
      ? initial.favoriteColors
      : ["#2563eb", "#7c3aed", "#06b6d4"]
  );
  const [goToYarn, setGoToYarn] = useState(initial.goToYarn || "");
  const [favoriteHookSize, setFavoriteHookSize] = useState(initial.favoriteHookSize || "");
  const [crafts, setCrafts] = useState(Array.isArray(initial.crafts) ? initial.crafts : []);
  const [yearsExperience, setYearsExperience] = useState(initial.yearsExperience || "");
  const [favoriteYarnBrand, setFavoriteYarnBrand] = useState(initial.favoriteYarnBrand || "");
  const [crochetTechniques, setCrochetTechniques] = useState(
    Array.isArray(initial.crochetTechniques) ? initial.crochetTechniques : []
  );
  const [crochetMotivation, setCrochetMotivation] = useState(
    Array.isArray(initial.crochetMotivation) ? initial.crochetMotivation : []
  );
  const [learningNext, setLearningNext] = useState(initial.learningNext || "");
  const [proudestProject, setProudestProject] = useState(initial.proudestProject || "");
  const [bestGiftProject, setBestGiftProject] = useState(initial.bestGiftProject || "");
  const [quiz, setQuiz] = useState(() => {
    const init = {};
    for (const q of QUIZ_QUESTIONS) {
      const raw = initial[q.field];
      init[q.field] = q.multiple
        ? Array.isArray(raw)
          ? raw.filter(Boolean)
          : raw
            ? [raw]
            : []
        : String(raw || "").trim();
    }
    return init;
  });
  const [socialLinks, setSocialLinks] = useState(() => {
    const handled = toHandledLinks(initial.socialLinks);
    return handled.length > 0 ? handled : [{ platform: "website", handle: "" }];
  });
  const [photoURL, setPhotoURL] = useState(initial.photoURL || "");
  const [coverPhotoURL, setCoverPhotoURL] = useState(initial.coverPhotoURL || "");
  const [quizPage, setQuizPage] = useState(0);
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImage, setCropImage] = useState(null);
  const [cropRect, setCropRect] = useState(null);
  const [cropStage, setCropStage] = useState("adjust");
  const [cropKind, setCropKind] = useState("cover");
  const previewCover = useMemo(() => {
    if (cropStage !== "confirm" && cropStage !== "save") return "";
    if (!cropImage?.element || !cropRect) return "";
    if (cropKind === "avatar") {
      return cropImageToAvatar(cropImage.element, cropRect);
    }
    return cropImageToBanner(cropImage.element, cropRect);
  }, [cropStage, cropImage, cropRect, cropKind]);
  const fileRef = useRef(null);
  const coverRef = useRef(null);
  const cropImgRef = useRef(null);
  const cropDragRef = useRef(null);

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, etc.).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Image must be 8 MB or smaller.");
      return;
    }
    setError("");
    setCropKind("avatar");
    const img = await loadImage(file);
    setCropImage(img);
    setCropRect(initialCropRectAvatar(img.width, img.height));
    setCropStage("adjust");
    setCropOpen(true);
  }

  async function handleRemovePhoto() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoURL: "" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove photo");
      }
      setPhotoURL("");
      setNotice("Profile photo removed.");
    } catch (err) {
      setError(err.message || "Failed to remove photo");
    } finally {
      setBusy(false);
    }
  }

  async function handleCoverPhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPG, PNG, etc.).");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Cover photo must be 8 MB or smaller.");
      return;
    }
    setError("");
    setCropKind("cover");
    const img = await loadImage(file);
    setCropImage(img);
    setCropRect(initialCropRect(img.width, img.height));
    setCropStage("adjust");
    setCropOpen(true);
  }

  function initialCropRect(width, height) {
    const { winW, winH, offX, offY } = coverWindow(width, height, COVER_RATIO);
    const w = winW * 0.96;
    const h = w / COVER_RATIO;
    return { x: offX + (winW - w) / 2, y: offY + (winH - h) / 2, w, h };
  }

  function initialCropRectAvatar(width, height) {
    const { winW, winH, offX, offY } = coverWindow(width, height, 1);
    const side = Math.min(winW, winH) * 0.94;
    return { x: offX + (winW - side) / 2, y: offY + (winH - side) / 2, w: side, h: side };
  }

  function getResizeMode(x, y, rect, img, tolerance) {
    const t = tolerance;
    const nearLeft = x <= rect.x + t;
    const nearRight = x >= rect.x + rect.w - t;
    const nearTop = y <= rect.y + t;
    const nearBottom = y >= rect.y + rect.h - t;
    if (nearLeft && nearTop) return "nw";
    if (nearRight && nearTop) return "ne";
    if (nearLeft && nearBottom) return "sw";
    if (nearRight && nearBottom) return "se";
    if (nearLeft) return "w";
    if (nearRight) return "e";
    if (nearTop) return "n";
    if (nearBottom) return "s";
    return null;
  }

  function pointerToImage(e) {
    const img = cropImgRef.current;
    if (!img) return null;
    const imgRect = img.getBoundingClientRect();
    const { winW, winH, offX, offY } = coverWindow(
      img.naturalWidth,
      img.naturalHeight,
      cropRatioFor(cropKind)
    );
    const sx = winW / imgRect.width;
    const sy = winH / imgRect.height;
    const x = Math.max(offX, Math.min(offX + winW, offX + (e.clientX - imgRect.left) * sx));
    const y = Math.max(offY, Math.min(offY + winH, offY + (e.clientY - imgRect.top) * sy));
    return { x, y, scale: (sx + sy) / 2 };
  }

  function handleCropPointerDown(e) {
    e.preventDefault();
    const img = cropImgRef.current;
    if (!img) return;
    const pos = pointerToImage(e);
    if (!pos) return;
    const rect = cropRect;
    const tolerance = Math.max(24 * pos.scale, 24);
    if (
      pos.x < rect.x - tolerance ||
      pos.x > rect.x + rect.w + tolerance ||
      pos.y < rect.y - tolerance ||
      pos.y > rect.y + rect.h + tolerance
    ) {
      return;
    }
    const mode = getResizeMode(pos.x, pos.y, rect, img, tolerance);
    cropDragRef.current = {
      mode: mode || "move",
      startX: pos.x,
      startY: pos.y,
      startRect: rect,
      scale: pos.scale,
    };
    if (e.currentTarget.setPointerCapture) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* older browsers */
      }
    }
  }

  function handleCropPointerMove(e) {
    e.preventDefault();
    const drag = cropDragRef.current;
    if (!drag) return;
    const img = cropImgRef.current;
    if (!img) return;
    const pos = pointerToImage(e);
    if (!pos) return;
    const { winW, winH, offX, offY } = coverWindow(
      img.naturalWidth,
      img.naturalHeight,
      cropRatioFor(cropKind)
    );
    const ratio = cropRatioFor(cropKind);
    const { mode, startRect } = drag;
    const right = startRect.x + startRect.w;
    const bottom = startRect.y + startRect.h;

    if (mode === "move") {
      let nx = startRect.x + (pos.x - drag.startX);
      let ny = startRect.y + (pos.y - drag.startY);
      nx = Math.max(offX, Math.min(offX + winW - startRect.w, nx));
      ny = Math.max(offY, Math.min(offY + winH - startRect.h, ny));
      setCropRect({ ...startRect, x: nx, y: ny });
      return;
    }

    const usesLeft = mode === "w" || mode === "nw" || mode === "sw";
    const usesRight = mode === "e" || mode === "ne" || mode === "se";
    const usesTop = mode === "n" || mode === "nw" || mode === "ne";
    const usesBottom = mode === "s" || mode === "sw" || mode === "se";

    const minW = Math.max(120 * drag.scale, 120 * pos.scale);
    const anchorX = usesRight
      ? startRect.x
      : usesLeft
      ? right
      : startRect.x + startRect.w / 2;
    const anchorY = usesBottom
      ? startRect.y
      : usesTop
      ? bottom
      : startRect.y + startRect.h / 2;

    let finalW = startRect.w;
    if (usesLeft || usesRight) {
      const dist = Math.abs(pos.x - anchorX) * 2;
      finalW = Math.max(startRect.w / 2, dist);
    } else if (usesTop || usesBottom) {
      const dist = Math.abs(pos.y - anchorY);
      finalW = Math.max(startRect.w / 2, dist * ratio);
    }
    finalW = Math.max(minW, Math.min(winW, finalW));

    let nx = usesRight
      ? anchorX
      : usesLeft
      ? anchorX - finalW
      : anchorX - finalW / 2;
    let finalH = finalW / ratio;
    let ny = usesBottom
      ? anchorY
      : usesTop
      ? anchorY - finalH
      : anchorY - finalH / 2;

    const maxWByH = winH * ratio;
    if (finalW > maxWByH) {
      finalW = maxWByH;
      finalH = winH;
      nx = usesLeft
        ? right - finalW
        : usesRight
        ? startRect.x
        : anchorX - finalW / 2;
      ny = usesTop
        ? bottom - finalH
        : usesBottom
        ? startRect.y
        : anchorY - finalH / 2;
    }

    if (nx < offX) {
      finalW = Math.max(minW, finalW + (nx - offX));
      finalH = finalW / ratio;
      nx = offX;
      if (usesTop) ny = bottom - finalH;
      else if (usesBottom) ny = startRect.y;
      else ny = anchorY - finalH / 2;
    }
    if (ny < offY) {
      finalH = Math.max(minW / ratio, finalH + (ny - offY));
      finalW = finalH * ratio;
      ny = offY;
      if (usesLeft) nx = right - finalW;
      else if (usesRight) nx = startRect.x;
      else nx = anchorX - finalW / 2;
    }
    if (nx + finalW > offX + winW) {
      nx = usesLeft ? right - finalW : Math.max(offX, offX + winW - finalW);
    }
    if (ny + finalH > offY + winH) {
      ny = usesTop ? bottom - finalH : Math.max(offY, offY + winH - finalH);
    }
    if (nx < offX) nx = offX;
    if (ny < offY) ny = offY;

    setCropRect({ x: nx, y: ny, w: finalW, h: finalH });
  }

  function handleCropPointerUp(e) {
    cropDragRef.current = null;
    if (e?.currentTarget?.releasePointerCapture) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    }
  }

  function goToCropConfirm() {
    setCropStage("confirm");
  }

  function backToCropAdjust() {
    setCropStage("adjust");
  }

  async function applyCoverCrop() {
    setCropStage("save");
    if (cropKind === "avatar") {
      await applyAvatarCropSave();
    } else {
      await applyCoverCropSave();
    }
  }

  async function applyCoverCropSave() {
    const img = cropImage?.element;
    if (!img || !cropRect) return;
    setUploadingCover(true);
    try {
      const dataUrl = previewCover || cropImageToBanner(img, cropRect);
      const fd = new FormData();
      const blob = await (await fetch(dataUrl)).blob();
      fd.append("file", blob, "cover.jpg");
      const up = await fetch("/api/upload?kind=cover", {
        method: "POST",
        body: fd,
      });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || (!upData.url && !upData.dataUrl)) {
        throw new Error(upData.error || "Failed to upload cover photo");
      }
      const coverPhotoURL = upData.url || upData.dataUrl;
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhotoURL }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save cover photo");
      }
      setCoverPhotoURL(coverPhotoURL);
      setSaved(true);
      setNotice("Cover photo saved.");
      setCropOpen(false);
      setCropImage(null);
      setCropRect(null);
      setCropStage("adjust");
    } catch (err) {
      setError(err.message || "Failed to upload cover photo");
      setCropStage("confirm");
    } finally {
      setUploadingCover(false);
    }
  }

  async function applyAvatarCropSave() {
    const img = cropImage?.element;
    if (!img || !cropRect) return;
    setUploading(true);
    try {
      const dataUrl = cropImageToAvatar(img, cropRect);
      const fd = new FormData();
      const blob = await (await fetch(dataUrl)).blob();
      fd.append("file", blob, "avatar.jpg");
      const up = await fetch("/api/upload?kind=avatar", {
        method: "POST",
        body: fd,
      });
      const upData = await up.json().catch(() => ({}));
      if (!up.ok || (!upData.url && !upData.dataUrl)) {
        throw new Error(upData.error || "Failed to upload photo");
      }
      const photoURL = upData.url || upData.dataUrl;
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoURL }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save photo");
      }
      setPhotoURL(photoURL);
      setSaved(true);
      setNotice("Profile photo saved.");
      setCropOpen(false);
      setCropImage(null);
      setCropRect(null);
      setCropStage("adjust");
    } catch (err) {
      setError(err.message || "Failed to save photo");
      setCropStage("confirm");
    } finally {
      setUploading(false);
    }
  }

  function cancelCoverCrop() {
    setCropOpen(false);
    setCropImage(null);
    setCropRect(null);
    setCropStage("adjust");
  }

  async function handleRemoveCover() {
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverPhotoURL: "" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove cover photo");
      }
      setCoverPhotoURL("");
      setNotice("Cover photo removed.");
    } catch (err) {
      setError(err.message || "Failed to remove cover photo");
    } finally {
      setBusy(false);
    }
  }

  async function detectLocation() {
    setError("");
    setNotice("");
    setLocating(true);
    try {
      if (!navigator.geolocation) {
        throw new Error("Location isn't available on this device.");
      }
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      const { latitude, longitude } = pos.coords;
      const res = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
      );
      if (!res.ok) throw new Error("Couldn't look up your location.");
      const data = await res.json();
      const match = countryByCode(data.countryCode);
      const detectedCountry = match ? match.name : normalize(country);
      const city = normalize(data.city || data.locality || data.principalSubdivision || "");
      const detectedLocation = city || normalize(location);

      if (detectedCountry) setCountry(detectedCountry);
      if (detectedLocation) setLocation(detectedLocation);

      // Persist right away so the member's location always belongs to them,
      // even if they leave the editor before pressing Save.
      const patch = {};
      if (detectedCountry && detectedCountry !== normalize(initial.country)) {
        patch.country = detectedCountry;
      }
      if (detectedLocation && detectedLocation !== normalize(initial.location)) {
        patch.location = detectedLocation;
      }
      const saveRes = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (Object.keys(patch).length && !saveRes.ok) {
        throw new Error((await saveRes.json()).error || "Failed to save your location");
      }

      if (detectedCountry || detectedLocation) {
        setNotice("Location detected and saved — update it any time.");
      } else {
        setNotice("We couldn't work out your exact country — pick it from the list instead.");
      }
    } catch (err) {
      setError(err.message || "Couldn't detect your location.");
    } finally {
      setLocating(false);
    }
  }

  function toggleChoice(list, value, setter) {
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setNotice("");

    const cleanName = normalize(name);
    if (!cleanName) {
      setError("Name is required.");
      return;
    }
    if (cleanName.length > LIMITS.name) {
      setError(`Name must be ${LIMITS.name} characters or fewer.`);
      return;
    }
    if (normalize(headline).length > LIMITS.headline) {
      setError(`Headline must be ${LIMITS.headline} characters or fewer.`);
      return;
    }
    if (normalize(location).length > LIMITS.location) {
      setError(`City / area must be ${LIMITS.location} characters or fewer.`);
      return;
    }
    if (normalize(bio).length > LIMITS.bio) {
      setError(`Bio must be ${LIMITS.bio} characters or fewer.`);
      return;
    }
    if (normalize(goToYarn).length > LIMITS.yarn) {
      setError(`Go-to yarn must be ${LIMITS.yarn} characters or fewer.`);
      return;
    }
    if (normalize(favoriteHookSize).length > LIMITS.hook) {
      setError(`Favorite hook size must be ${LIMITS.hook} characters or fewer.`);
      return;
    }
    if (normalize(favoriteYarnBrand).length > LIMITS.yarnBrand) {
      setError(`Favorite yarn brand must be ${LIMITS.yarnBrand} characters or fewer.`);
      return;
    }
    if (normalize(learningNext).length > LIMITS.learning) {
      setError(`What you want to learn must be ${LIMITS.learning} characters or fewer.`);
      return;
    }
    if (normalize(proudestProject).length > LIMITS.project) {
      setError(`Proudest project must be ${LIMITS.project} characters or fewer.`);
      return;
    }
    if (normalize(bestGiftProject).length > LIMITS.project) {
      setError(`Best gifting project must be ${LIMITS.project} characters or fewer.`);
      return;
    }

    const patch = {};
    if (cleanName !== normalize(initial.name)) patch.name = cleanName;
    const cleanHeadline = normalize(headline);
    if (cleanHeadline !== normalize(initial.headline)) patch.headline = cleanHeadline;
    const cleanLocation = normalize(location);
    if (cleanLocation !== normalize(initial.location)) patch.location = cleanLocation;
    const cleanCountry = normalize(country);
    if (cleanCountry !== normalize(initial.country)) patch.country = cleanCountry;
    const cleanBio = normalize(bio);
    if (cleanBio !== normalize(initial.bio)) patch.bio = cleanBio;

    const cleanColors = favoriteColors.slice(0, 3);
    if (JSON.stringify(cleanColors) !== JSON.stringify(initial.favoriteColors || [])) {
      patch.favoriteColors = cleanColors;
    }
    const cleanYarn = normalize(goToYarn);
    if (cleanYarn !== normalize(initial.goToYarn)) patch.goToYarn = cleanYarn;
    const cleanHook = normalize(favoriteHookSize);
    if (cleanHook !== normalize(initial.favoriteHookSize)) patch.favoriteHookSize = cleanHook;
    if (JSON.stringify(crafts) !== JSON.stringify(initial.crafts || [])) patch.crafts = crafts;

    const cleanYears = normalize(yearsExperience);
    if (cleanYears !== normalize(initial.yearsExperience)) patch.yearsExperience = cleanYears;
    const cleanBrand = normalize(favoriteYarnBrand);
    if (cleanBrand !== normalize(initial.favoriteYarnBrand)) patch.favoriteYarnBrand = cleanBrand;
    if (JSON.stringify(crochetTechniques) !== JSON.stringify(initial.crochetTechniques || [])) {
      patch.crochetTechniques = crochetTechniques;
    }
    if (JSON.stringify(crochetMotivation) !== JSON.stringify(initial.crochetMotivation || [])) {
      patch.crochetMotivation = crochetMotivation;
    }
    const cleanLearning = normalize(learningNext);
    if (cleanLearning !== normalize(initial.learningNext)) patch.learningNext = cleanLearning;

    const cleanProud = normalize(proudestProject);
    if (cleanProud !== normalize(initial.proudestProject)) patch.proudestProject = cleanProud;
    const cleanGift = normalize(bestGiftProject);
    if (cleanGift !== normalize(initial.bestGiftProject)) patch.bestGiftProject = cleanGift;

    for (const q of QUIZ_QUESTIONS) {
      const current = quiz[q.field];
      const prev = initial[q.field];
      const normCur = q.multiple
        ? Array.isArray(current)
          ? current
          : current
            ? [current]
            : []
        : String(current || "").trim();
      const normPrev = q.multiple
        ? Array.isArray(prev)
          ? prev
          : prev
            ? [prev]
            : []
        : String(prev || "").trim();
      if (JSON.stringify(normCur) !== JSON.stringify(normPrev)) patch[q.field] = normCur;
    }

    const cleanSocial = socialLinks
      .filter((l) => normalize(l.handle))
      .map((l) => ({ platform: normalize(l.platform) || "other", handle: normalize(l.handle) }));
    if (JSON.stringify(cleanSocial) !== JSON.stringify(toHandledLinks(initial.socialLinks))) {
      patch.socialLinks = cleanSocial;
    }

    if (Object.keys(patch).length === 0) {
      setNotice("No changes to save.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save profile");
      }
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save profile");
    } finally {
      setBusy(false);
    }
  }

  function setColor(index, value) {
    setFavoriteColors((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function colorGradient(colors) {
    const list = Array.isArray(colors)
      ? colors.filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c))
      : [];
    if (list.length === 0) return "#e8e8ef";
    if (list.length === 1) return list[0];
    const segments = list.map(
      (c, i) => `${c} ${(i / list.length) * 100}% ${((i + 1) / list.length) * 100}%`
    );
    return `conic-gradient(${segments.join(", ")})`;
  }

  return (
    <>
      <form className={styles.card} id="profile" onSubmit={handleSave}>
      <h2 className={styles.cardTitle}>Edit profile</h2>
      <div className={styles.identityLine}>
        <p className={styles.usernamePill}>
          {initial.username ? `@${initial.username}` : "You don't have a username yet"}
        </p>
        <Link className={styles.identityLink} href="/account/settings">
          {initial.username ? "Change" : "Choose one"}
        </Link>
      </div>
      {error && <p className={styles.formError}>{error}</p>}
      {saved && <p className={styles.formSaved}>Profile saved.</p>}
      {notice && <p className={styles.formNotice}>{notice}</p>}

      <nav className={styles.stepTabs} aria-label="Profile sections">
        {STEP_LABELS.map((label, i) => (
          <button
            key={label}
            type="button"
            className={i === step ? `${styles.stepTab} ${styles.stepTabActive}` : styles.stepTab}
            onClick={() => setStep(i)}
          >
            <span className={styles.stepTabNum}>{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {step === 0 && (
      <div className={styles.stepPane}>
      <div className={coverStyles.coverRow}>
        {coverPhotoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={coverStyles.coverImg} src={coverPhotoURL} alt="Cover" />
        ) : (
          <span className={coverStyles.coverPlaceholder}>
            <span className={coverStyles.coverPlaceholderIcon}><ImageIcon size={20} /></span>
            Add a cover photo
          </span>
        )}
        <div className={coverStyles.coverControls}>
          <div className={styles.avatarButtons}>
            <button
              type="button"
              className={styles.avatarButton}
              disabled={uploadingCover}
              onClick={() => coverRef.current?.click()}
            >
              {uploadingCover ? "Uploading…" : "Upload cover"}
            </button>
            {coverPhotoURL && (
              <button
                type="button"
                className={`${styles.avatarButton} ${styles.avatarRemove}`}
                disabled={busy}
                onClick={handleRemoveCover}
              >
                Remove cover
              </button>
            )}
          </div>
          <p className={styles.avatarHint}>
            Add a photo that shows the personality of your profile. It appears at the top of your profile page.
          </p>
          <input
            ref={coverRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              handleCoverPhoto(e);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      <div className={styles.avatarRow}>
        {photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.avatarImg} src={photoURL} alt="Profile" />
        ) : (
          <span className={styles.avatarImg}>{initials(name || initial.name)}</span>
        )}
        <div className={styles.avatarControls}>
          <div className={styles.avatarButtons}>
            <button
              type="button"
              className={styles.avatarButton}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {photoURL && (
              <button
                type="button"
                className={`${styles.avatarButton} ${styles.avatarRemove}`}
                disabled={busy}
                onClick={handleRemovePhoto}
              >
                Remove photo
              </button>
            )}
          </div>
          <p className={styles.avatarHint}>
            {initial.photoURL
              ? "This photo came from your Google/Gmail account. Upload a new one to replace it."
              : "Your Google/Gmail profile photo is used automatically. You can upload your own image."}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={(e) => {
              handlePhoto(e);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-name">Name</label>
        <input
          id="profile-name"
          className={styles.input}
          type="text"
          required
          maxLength={LIMITS.name}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-headline">Headline</label>
        <input
          id="profile-headline"
          className={styles.input}
          type="text"
          maxLength={LIMITS.headline}
          placeholder="e.g. Yoga teacher · mom of two"
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-location">City / area</label>
        <input
          id="profile-location"
          className={styles.input}
          type="text"
          maxLength={LIMITS.location}
          placeholder="e.g. Austin"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-country">Country</label>
        <div className={styles.countryRow}>
          <select
            id="profile-country"
            className={`${styles.input} ${styles.selectInput}`}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Select your country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>{c.name}</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.locationButton}
            disabled={locating}
            onClick={detectLocation}
          >
            {locating ? "Locating…" : "Use my location"}
          </button>
        </div>
        <p className={styles.fieldHint}>
          We use your country so members can find community near you.
        </p>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-bio">Bio</label>
        <textarea
          id="profile-bio"
          className={styles.textarea}
          rows={3}
          maxLength={LIMITS.bio}
          placeholder="Tell the community a little about yourself…"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </div>
      </div>
      )}

      {step === 1 && (
      <div className={styles.stepPane}>
      <h3 className={styles.sectionTitle}>Signature colours</h3>
      <p className={styles.fieldHint} style={{ marginTop: -6, marginBottom: 12 }}>
        Pick a 2026 trend palette or mix your own — your colours show beside your name across the lounge.
      </p>
      <div className={styles.palettePresets}>
        {PALETTE_PRESETS.map((p) => {
          const active = JSON.stringify(favoriteColors) === JSON.stringify(p.colors);
          return (
            <button
              key={p.name}
              type="button"
              className={
                active ? `${styles.paletteBtn} ${styles.paletteBtnActive}` : styles.paletteBtn
              }
              onClick={() => setFavoriteColors(p.colors)}
            >
              <span className={styles.paletteDots}>
                {p.colors.map((c) => (
                  <span key={c} className={styles.paletteDot} style={{ background: c }} />
                ))}
              </span>
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.colorRow}>
        {favoriteColors.slice(0, 3).map((color, i) => (
          <div key={i} className={styles.colorWheel}>
            <div
              className={styles.wheelRing}
              style={{
                background: `conic-gradient(${color}, #ffffff 25%, ${color} 50%, #ffffff 75%, ${color})`,
              }}
            >
              <div className={styles.wheelFace} />
              <input
                type="color"
                value={color}
                aria-label={`Colour ${i + 1}`}
                onChange={(e) => setColor(i, e.target.value)}
              />
            </div>
            <span className={styles.wheelLabel}>Colour {i + 1}</span>
          </div>
        ))}
        <div className={styles.colorWheel}>
          <div className={styles.palettePreview} style={{ background: colorGradient(favoriteColors) }} />
          <span className={styles.wheelLabel}>Preview</span>
        </div>
      </div>

      <h3 className={styles.sectionTitle}>Social links</h3>
      <p className={styles.fieldHint} style={{ marginTop: -8, marginBottom: 12 }}>
        Add your other social profiles so members can connect with you — just your username is enough.
      </p>
      {socialLinks.map((link, i) => {
        const info = platformInfo(link.platform);
        const preview = normalize(link.handle)
          ? buildSocialUrl(link.platform, link.handle)
          : "";
        return (
          <div key={i} className={styles.socialBlock}>
            <div className={styles.socialRow}>
              <select
                className={styles.socialSelect}
                value={link.platform}
                onChange={(e) => {
                  const platform = e.target.value;
                  setSocialLinks((prev) =>
                    prev.map((l, idx) => (idx === i ? { platform, handle: l.handle } : l))
                  );
                }}
              >
                {SOCIAL_PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <input
                className={styles.socialInput}
                type="text"
                placeholder={info.placeholder}
                maxLength={120}
                value={link.handle}
                onChange={(e) => {
                  setSocialLinks((prev) =>
                    prev.map((l, idx) => (idx === i ? { ...l, handle: e.target.value } : l))
                  );
                }}
              />
              {socialLinks.length > 1 && (
                <button
                  type="button"
                  className={styles.socialRemove}
                  onClick={() => setSocialLinks((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove link"
                >
                  ×
                </button>
              )}
            </div>
            <p className={styles.socialPreview}>
              {preview ? `→ ${preview}` : info.hint}
            </p>
          </div>
        );
      })}
      {socialLinks.length < 8 && (
        <button
          type="button"
          className={styles.socialAdd}
          onClick={() => setSocialLinks((prev) => [...prev, { platform: "website", handle: "" }])}
        >
          + Add another link
        </button>
      )}
      </div>
      )}

      {step === 2 && (
      <div className={styles.stepPane}>
      <h3 className={styles.sectionTitle}>Your yarn story</h3>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Crafts you practice</div>
        <div className={styles.quizOptions}>
          {CRAFT_OPTIONS.map((value) => {
            const label = value.charAt(0).toUpperCase() + value.slice(1);
            const selected = crafts.includes(value);
            return (
              <label
                key={value}
                className={selected ? `${styles.quizOption} ${styles.quizOptionOn}` : styles.quizOption}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleChoice(crafts, value, setCrafts)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
        <p className={styles.fieldHint}>Pick the crafts you love so members can find you.</p>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Crocheting for</div>
        <div className={styles.quizOptions}>
          {YEARS_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={
                yearsExperience === option
                  ? `${styles.quizOption} ${styles.quizOptionOn}`
                  : styles.quizOption
              }
              onClick={() => setYearsExperience((prev) => (prev === option ? "" : option))}
            >
              <span className={styles.quizRadio}>{yearsExperience === option ? "●" : "○"}</span>
              <span>{option}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-brand">Favorite yarn brand</label>
        <input
          id="profile-brand"
          className={styles.input}
          type="text"
          maxLength={LIMITS.yarnBrand}
          placeholder="e.g. Lion Brand, Malabrigo…"
          value={favoriteYarnBrand}
          onChange={(e) => setFavoriteYarnBrand(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Crochet techniques you love</div>
        <div className={styles.quizOptions}>
          {CROCHET_TECHNIQUES.map((value) => {
            const selected = crochetTechniques.includes(value);
            return (
              <label
                key={value}
                className={selected ? `${styles.quizOption} ${styles.quizOptionOn}` : styles.quizOption}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleChoice(crochetTechniques, value, setCrochetTechniques)}
                />
                <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div className={styles.field}>
        <div className={styles.fieldLabel}>Why you crochet</div>
        <div className={styles.quizOptions}>
          {CROCHET_MOTIVATIONS.map((value) => {
            const selected = crochetMotivation.includes(value);
            return (
              <label
                key={value}
                className={selected ? `${styles.quizOption} ${styles.quizOptionOn}` : styles.quizOption}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleChoice(crochetMotivation, value, setCrochetMotivation)}
                />
                <span>{value.charAt(0).toUpperCase() + value.slice(1)}</span>
              </label>
            );
          })}
        </div>
      </div>
      </div>
      )}

      {step === 3 && (
      <div className={styles.stepPane}>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-yarn">Go-to yarn choice</label>
        <input
          id="profile-yarn"
          className={styles.input}
          type="text"
          maxLength={LIMITS.yarn}
          placeholder="e.g. Cascade 220, merino worsted…"
          value={goToYarn}
          onChange={(e) => setGoToYarn(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-hook">Favorite hook size</label>
        <input
          id="profile-hook"
          className={styles.input}
          type="text"
          maxLength={LIMITS.hook}
          placeholder="e.g. 5.0mm (H)"
          value={favoriteHookSize}
          onChange={(e) => setFavoriteHookSize(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-learning">
          What do you want to learn next?
        </label>
        <input
          id="profile-learning"
          className={styles.input}
          type="text"
          maxLength={LIMITS.learning}
          placeholder="e.g. Tunisian crochet, mosaic patterns, granny square sweaters…"
          value={learningNext}
          onChange={(e) => setLearningNext(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-proud">Project you&apos;re most proud of</label>
        <input
          id="profile-proud"
          className={styles.input}
          type="text"
          maxLength={LIMITS.project}
          placeholder="e.g. A fair-isle sweater I made for my mum"
          value={proudestProject}
          onChange={(e) => setProudestProject(e.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="profile-gift">Best project for gifting</label>
        <input
          id="profile-gift"
          className={styles.input}
          type="text"
          maxLength={LIMITS.project}
          placeholder="e.g. Baby blankets — always a hit"
          value={bestGiftProject}
          onChange={(e) => setBestGiftProject(e.target.value)}
        />
      </div>
      </div>
      )}

      {step === 4 && (
      <div className={styles.stepPane}>
      <h3 className={styles.sectionTitle}>Crochet love quiz</h3>
      <p className={styles.fieldHint} style={{ marginTop: -8, marginBottom: 4 }}>
        Fun questions so other members can get to know your yarn heart. Tick the ones that fit.
      </p>

      {QUIZ_QUESTIONS.slice(quizPage * QUESTIONS_PER_PAGE, quizPage * QUESTIONS_PER_PAGE + QUESTIONS_PER_PAGE).map((q) => (
        <fieldset key={q.field} className={styles.field}>
          <legend className={styles.fieldLabel}>
            {q.question}
            {q.multiple && <span className={styles.quizMulti}> (select all that apply)</span>}
          </legend>
          <div className={styles.quizOptions}>
            {q.options.map((option) =>
              q.multiple ? (
                <label
                  key={option}
                  className={
                    quiz[q.field].includes(option)
                      ? `${styles.quizOption} ${styles.quizOptionOn}`
                      : styles.quizOption
                  }
                >
                  <input
                    type="checkbox"
                    checked={quiz[q.field].includes(option)}
                    onChange={() =>
                      setQuiz((prev) => {
                        const current = Array.isArray(prev[q.field]) ? prev[q.field] : [];
                        const next = quiz[q.field].includes(option)
                          ? current.filter((x) => x !== option)
                          : [...current, option];
                        return { ...prev, [q.field]: next };
                      })
                    }
                  />
                  <span>{option}</span>
                </label>
              ) : (
                <button
                  key={option}
                  type="button"
                  className={
                    quiz[q.field] === option
                      ? `${styles.quizOption} ${styles.quizOptionOn}`
                      : styles.quizOption
                  }
                  onClick={() =>
                    setQuiz((prev) => ({ ...prev, [q.field]: quiz[q.field] === option ? "" : option }))
                  }
                >
                  <span className={styles.quizRadio}>{quiz[q.field] === option ? "●" : "○"}</span>
                  <span>{option}</span>
                </button>
              )
            )}
          </div>
        </fieldset>
      ))}

      <nav className={styles.quizNav} aria-label="Quiz pages">
        <button
          type="button"
          className={styles.quizNavBtn}
          disabled={quizPage === 0}
          onClick={() => setQuizPage((p) => Math.max(0, p - 1))}
        >
          ‹ Back
        </button>
        <span className={styles.quizCounter}>
          {quizPage + 1} of {QUIZ_PAGE_COUNT}
        </span>
        <button
          type="button"
          className={styles.quizNavBtn}
          disabled={quizPage === QUIZ_PAGE_COUNT - 1}
          onClick={() => setQuizPage((p) => Math.min(QUIZ_PAGE_COUNT - 1, p + 1))}
        >
          Next ›
        </button>
      </nav>
      </div>
      )}

      <nav className={styles.quizNav} aria-label="Profile navigation">
        <button
          type="button"
          className={styles.quizNavBtn}
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          ‹ Back
        </button>
        <span className={styles.quizCounter}>
          {step + 1} of {STEP_LABELS.length}
        </span>
        <div className={styles.navActions}>
          {step < STEP_LABELS.length - 1 && (
            <button
              type="button"
              className={styles.quizNavBtn}
              onClick={() => setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1))}
            >
              Next ›
            </button>
          )}
          <button className={styles.manage} type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </nav>
    </form>

    {(() => {
      const coverWin = cropImage
        ? coverWindow(cropImage.width, cropImage.height, cropRatioFor(cropKind))
        : { winW: 1, winH: 1, offX: 0, offY: 0 };
      return (
    cropOpen && (
      <div
        className={coverStyles.cropOverlay}
        onClick={cancelCoverCrop}
        role="dialog"
        aria-modal="true"
        aria-label="Crop cover photo"
      >
        <div
          className={coverStyles.cropModal}
          onClick={(e) => e.stopPropagation()}
        >
          {cropStage === "adjust" ? (
            <>
              <h3 className={coverStyles.cropTitle}>
                {cropKind === "avatar"
                  ? "Crop your profile photo"
                  : "Crop your cover photo"}
              </h3>
              <p className={coverStyles.cropHint}>
                {cropKind === "avatar"
                  ? "Keep your face centered near the middle so it stays visible when the photo is shown as a small circle. Drag to move, drag a corner or edge to resize, then press Next."
                  : "This banner shows full-width on desktop but gets cropped on mobile, and your profile photo overlaps the bottom-left corner. Keep important content near the middle and out of the bottom-left and far-right edges."}
              </p>
              <div
                className={
                  cropKind === "avatar"
                    ? `${coverStyles.cropWrap} ${coverStyles.cropWrapAvatar}`
                    : coverStyles.cropWrap
                }
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={cropImgRef}
                  className={coverStyles.cropImage}
                  src={cropImage?.dataUrl}
                  alt={
                    cropKind === "avatar"
                      ? "Profile photo preview"
                      : "Cover preview"
                  }
                  draggable={false}
                />
                {cropKind === "avatar" && (
                  <span className={coverStyles.cropCircleMask} />
                )}
                {cropKind === "cover" && (
                  <>
                    <span className={coverStyles.safeZoneNote}>
                      <span className={coverStyles.safeZoneAvatar} />
                      profile photo covers this corner
                    </span>
                    <span className={coverStyles.safeZoneSkirt} />
                  </>
                )}
                {cropRect && (
                  <span
                    className={
                      cropKind === "avatar"
                        ? `${coverStyles.cropRect} ${coverStyles.cropRectAvatar}`
                        : coverStyles.cropRect
                    }
                    style={{
                      left: `${((cropRect.x - coverWin.offX) / coverWin.winW) * 100}%`,
                      top: `${((cropRect.y - coverWin.offY) / coverWin.winH) * 100}%`,
                      width: `${(cropRect.w / coverWin.winW) * 100}%`,
                      height: `${(cropRect.h / coverWin.winH) * 100}%`,
                    }}
                  >
                    {cropKind === "avatar" && (
                      <svg
                        className={coverStyles.safeRings}
                        viewBox="0 0 100 100"
                        aria-hidden="true"
                      >
                        <circle cx="50" cy="50" r="46" />
                        <circle cx="50" cy="50" r="30" />
                      </svg>
                    )}
                    <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleNw}`} />
                    <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleNe}`} />
                    <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleSw}`} />
                    <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleSe}`} />
                    {cropKind === "cover" && (
                      <>
                        <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleN}`} />
                        <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleS}`} />
                        <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleW}`} />
                        <span className={`${coverStyles.cropHandle} ${coverStyles.cropHandleE}`} />
                      </>
                    )}
                  </span>
                )}
              </div>
              <div className={coverStyles.cropActions}>
                <button
                  type="button"
                  className={coverStyles.coverButton}
                  onClick={cancelCoverCrop}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={coverStyles.cropApply}
                  onClick={goToCropConfirm}
                >
                  Next
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 className={coverStyles.cropTitle}>
                {cropKind === "avatar"
                  ? "Preview your profile photo"
                  : "Preview your cover"}
              </h3>
              <p className={coverStyles.cropHint}>
                {cropKind === "avatar"
                  ? "Your photo is shown as a circle. When you&apos;re happy, select &quot;Done&quot; to save it."
                  : "Keep the bottom-left corner clear so it isn&apos;t hidden by your profile photo. When you&apos;re happy, select &quot;Done&quot; to save it."}
              </p>
              {cropKind === "avatar" ? (
                <div className={coverStyles.previewAvatar}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewCover}
                    alt="Profile photo preview"
                    draggable={false}
                  />
                </div>
              ) : (
                <div className={coverStyles.previewBanner}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewCover}
                    alt="Cover photo preview"
                    draggable={false}
                  />
                  <span className={coverStyles.previewOverlayAvatar}>
                    {initials(name || initial.name)}
                  </span>
                </div>
              )}
              <div className={coverStyles.cropActions}>
                <button
                  type="button"
                  className={coverStyles.coverButton}
                  onClick={backToCropAdjust}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={coverStyles.cropApply}
                  disabled={
                    (cropKind === "cover" && (uploadingCover || cropStage === "save")) ||
                    (cropKind === "avatar" && (uploading || cropStage === "save"))
                  }
                  onClick={applyCoverCrop}
                >
                  {cropStage === "save" || (cropKind === "cover" && uploadingCover) || (cropKind === "avatar" && uploading)
                    ? "Saving…"
                    : "Done"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  );
      })()}
    </>
  );
}
