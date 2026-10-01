// Cover geometry, shared by the upload path and the render slots.
//
// The banner follows the photo. A cover is stored whole — nothing is cropped on
// upload — and the render containers size themselves from the image's own
// aspect ratio, so the photo is always shown in full. That is the opposite of
// the 4:1 crop design, which was itself a fix for an earlier bug: fixed-height
// containers plus object-fit: contain letterboxed narrow photos, and a blurred
// copy of the image behind them showed through the gaps as bars down each side.
//
// The remaining concern is a portrait phone photo, whose natural height would
// turn a header into a wall. COVER_MAX_TALLNESS caps that; CSS applies it with
// max-height, and object-fit crops the overflow rather than squashing it. Every
// other photo is untouched.
export const COVER_RATIO = 4 / 1;

// Tallest a banner may get, as a multiple of its own width. 0.6 sits just past
// 16:9 (0.5625), so ordinary landscape photos render at their natural height and
// everything taller — 4:3, square, any portrait phone shot — is capped so the
// header cannot become a wall. Note this is height/width, so it is a small
// number; naming it after the visual impression rather than the arithmetic is
// how the first value here ended up 5x too permissive.
export const COVER_MAX_TALLNESS = 0.6;

export function cropRatioFor(kind) {
  return kind === "avatar" ? 1 : COVER_RATIO;
}

// The largest ratio-correct rectangle centered in a source image, in source
// pixels. Used by the avatar/legacy crop UI.
export function coverWindow(width, height, ratio = COVER_RATIO) {
  const winW = Math.min(width, height * ratio);
  const winH = Math.min(height, width / ratio);
  const offX = (width - winW) / 2;
  const offY = (height - winH) / 2;
  return { winW, winH, offX, offY };
}

// True when a photo of this size would be capped rather than shown whole. A
// cover at or above COVER_MAX_TALLNESS tallness renders its natural height.
export function exceedsMaxTallness(width, height) {
  if (!width || !height) return false;
  return height / width > COVER_MAX_TALLNESS;
}

// Height a banner of this width may occupy: the image's own height, clamped.
export function coverHeightFor(width, imageHeight) {
  if (!width || !imageHeight) return width / COVER_RATIO;
  return Math.min(imageHeight, width * COVER_MAX_TALLNESS);
}