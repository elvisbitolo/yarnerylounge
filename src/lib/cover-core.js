// The cover slot is a 4:1 banner. Uploads are cropped to this ratio on the
// client and the render containers are sized from it, so a stored cover always
// fills its slot exactly. Keeping the number here is what stops the two sides
// drifting apart: when they disagree the image letterboxes and the blurred
// backdrop shows through, which is the bug this module exists to prevent.
export const COVER_RATIO = 4 / 1;

export function cropRatioFor(kind) {
  return kind === "avatar" ? 1 : COVER_RATIO;
}

// The largest ratio-correct rectangle centered in a source image, in source
// pixels. A portrait phone photo comes back as a full-width horizontal band.
export function coverWindow(width, height, ratio = COVER_RATIO) {
  const winW = Math.min(width, height * ratio);
  const winH = Math.min(height, width / ratio);
  const offX = (width - winW) / 2;
  const offY = (height - winH) / 2;
  return { winW, winH, offX, offY };
}

export function initialCoverRect(width, height, ratio = COVER_RATIO) {
  const { winW, winH, offX, offY } = coverWindow(width, height, ratio);
  return { x: offX, y: offY, w: winW, h: winH };
}

// The starting crop is the whole ratio-correct window: the least destructive
// default, since it only discards what no ratio-correct crop could keep.
export function defaultCoverCrop(width, height) {
  return initialCoverRect(width, height, COVER_RATIO);
}

// Height a container must take to show a cover at COVER_RATIO. The CSS modules
// use aspect-ratio directly; this exists so tests can assert the containers
// agree with the stored ratio instead of trusting a hand-written number.
export function coverHeightFor(width, ratio = COVER_RATIO) {
  return width / ratio;
}