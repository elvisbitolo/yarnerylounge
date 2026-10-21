"use client";

import { useMemo, useRef, useState } from "react";
import styles from "./account.module.css";

const DEFAULT_COLORS = ["#2563EB", "#7C3AED", "#06B6D4"];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const number = Number.parseInt(full, 16);
  return { r: (number >> 16) & 255, g: (number >> 8) & 255, b: number & 255 };
}

function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return "#" + rgb.map((n) => Math.round((n + m) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function validHex(value) {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

export default function SignatureColorPicker({ colors, onColorsChange, presets }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hexDraft, setHexDraft] = useState("");
  const [editingHex, setEditingHex] = useState(false);
  const squareRef = useRef(null);
  const dragRef = useRef(false);
  const currentColors = [0, 1, 2].map((i) => colors?.[i] || DEFAULT_COLORS[i]);
  const activeColor = currentColors[activeIndex];
  const hsv = useMemo(() => rgbToHsv(hexToRgb(activeColor)), [activeColor]);
  const huePoint = { x: 50 + Math.sin((hsv.h * Math.PI) / 180) * 42, y: 50 - Math.cos((hsv.h * Math.PI) / 180) * 42 };

  function setColor(index, value) {
    const next = [...currentColors];
    next[index] = value.toUpperCase();
    onColorsChange(next);
  }

  function updateFromSquare(event) {
    const rect = squareRef.current?.getBoundingClientRect();
    if (!rect) return;
    const saturation = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const brightness = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    setColor(activeIndex, hsvToHex(hsv.h, saturation, brightness));
  }

  function handleSquarePointerDown(event) {
    event.preventDefault();
    dragRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    updateFromSquare(event);
  }

  function handleHexChange(value) {
    setHexDraft(value);
    setEditingHex(true);
    if (validHex(value)) setColor(activeIndex, value.length === 4
      ? "#" + value.slice(1).split("").map((c) => c + c).join("").toUpperCase()
      : value.toUpperCase());
  }

  function finishHexEdit() {
    if (validHex(hexDraft)) {
      setColor(activeIndex, hexDraft.length === 4
        ? "#" + hexDraft.slice(1).split("").map((c) => c + c).join("").toUpperCase()
        : hexDraft.toUpperCase());
    }
    setHexDraft("");
    setEditingHex(false);
  }

  return (
    <div>
      <div className={styles.palettePresets}>
        {presets.map((preset) => {
          const active = JSON.stringify(currentColors) === JSON.stringify(preset.colors);
          return (
            <button key={preset.name} type="button"
              className={active ? `${styles.paletteBtn} ${styles.paletteBtnActive}` : styles.paletteBtn}
              onClick={() => { onColorsChange([...preset.colors]); setActiveIndex(0); setEditingHex(false); }}>
              <span className={styles.paletteDots}>
                {preset.colors.map((color) => <span key={color} className={styles.paletteDot} style={{ background: color }} />)}
              </span>
              <span>{preset.name}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.signaturePicker}>
        <div className={styles.signaturePickerMain}>
          <p className={styles.signaturePickerEyebrow}>Customize your colours</p>
          <div className={styles.signatureTabs} role="tablist" aria-label="Choose colour to edit">
            {currentColors.map((color, index) => (
              <button key={index} type="button" role="tab" aria-selected={activeIndex === index}
                className={activeIndex === index ? `${styles.signatureTab} ${styles.signatureTabActive}` : styles.signatureTab}
                onClick={() => { setActiveIndex(index); setEditingHex(false); setHexDraft(""); }}>
                <span className={styles.signatureTabSwatch} style={{ background: color }} />
                Colour {index + 1}
              </button>
            ))}
          </div>
          <div className={styles.signaturePickerControls}>
            <div className={styles.signatureHueWheel} aria-label="Hue selector"
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = event.clientX - rect.left - rect.width / 2;
                const y = event.clientY - rect.top - rect.height / 2;
                const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
                setColor(activeIndex, hsvToHex(angle, hsv.s || 1, hsv.v || 1));
              }}>
              <div className={styles.signatureWheelCenter}>
                <div ref={squareRef} className={styles.signatureSatSquare}
                  style={{ "--picker-hue": hsv.h }}
                  onPointerDown={(event) => { event.stopPropagation(); handleSquarePointerDown(event); }}
                  onPointerMove={(event) => { if (dragRef.current) updateFromSquare(event); }}
                  onPointerUp={() => { dragRef.current = false; }}
                  onPointerCancel={() => { dragRef.current = false; }}
                  role="slider" aria-label="Saturation and brightness" aria-valuetext={`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.1 : 0.03;
                    if (event.key === "ArrowRight") setColor(activeIndex, hsvToHex(hsv.h, clamp(hsv.s + step, 0, 1), hsv.v));
                    else if (event.key === "ArrowLeft") setColor(activeIndex, clamp(hsv.s - step, 0, 1) === hsv.s ? activeColor : hsvToHex(hsv.h, clamp(hsv.s - step, 0, 1), hsv.v));
                    else if (event.key === "ArrowUp") setColor(activeIndex, hsvToHex(hsv.h, hsv.s, clamp(hsv.v + step, 0, 1)));
                    else if (event.key === "ArrowDown") setColor(activeIndex, hsvToHex(hsv.h, hsv.s, clamp(hsv.v - step, 0, 1)));
                  }}>
                  <span className={styles.signatureSatMarker}
                    style={{ left: `${hsv.s * 100}%`, bottom: `${hsv.v * 100}%` }} />
                </div>
              </div>
              <span className={styles.signatureHueDot}
                style={{ left: `${huePoint.x}%`, top: `${huePoint.y}%`, background: `hsl(${hsv.h} 100% 50%)` }} />
            </div>
          </div>
        </div>

        <div className={styles.signatureColorField}>
          <p className={styles.signaturePickerEyebrow}>Selected colour</p>
          <div className={styles.signatureHexRow}>
            <span className={styles.signatureSelectedSwatch} style={{ background: activeColor }} />
            <input className={styles.signatureHexInput} aria-label={`HEX value for Colour ${activeIndex + 1}`}
              value={editingHex ? hexDraft : activeColor}
              onFocus={() => { setEditingHex(true); setHexDraft(activeColor); }}
              onChange={(event) => handleHexChange(event.target.value)}
              onBlur={finishHexEdit}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              maxLength={7} spellCheck={false} autoCapitalize="characters" />
          </div>
          <button type="button" className={styles.signatureReset}
            onClick={() => { setColor(activeIndex, DEFAULT_COLORS[activeIndex]); setEditingHex(false); setHexDraft(""); }}>
            Reset colour
          </button>
          <p className={styles.signaturePickerHint}>Choose a hue on the outer wheel, then drag inside to adjust saturation and brightness. You can also enter an exact HEX value.</p>
        </div>
      </div>

      <div className={styles.signaturePalettePreview}>
        <p className={styles.signaturePaletteLabel}>Your palette · Preview updates live</p>
        <div className={styles.signaturePaletteBlocks}>
          {currentColors.map((color, index) => (
            <div key={index} className={styles.signaturePaletteBlock}>
              <div className={styles.signaturePaletteColor} style={{ background: color }} />
              <div className={styles.signaturePaletteMeta}>
                <span className={styles.signaturePaletteName}>Colour {index + 1}</span>
                <span className={styles.signaturePaletteHex}>{color}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
