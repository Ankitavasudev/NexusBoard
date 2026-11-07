/**
 * NexusBoard — a canvas whiteboard in the browser.
 * All geometry, history and persistence helpers live in board-core.js.
 */

import {
  History,
  STORAGE_KEY,
  clamp,
  exportName,
  hitTest,
  humanCount,
  parseShapes,
  serialise,
} from "./board-core.js";

const $ = (id) => document.getElementById(id);
const canvas = $("board");
const ctx = canvas.getContext("2d");
const wrap = $("canvasWrap");
const ripples = $("ripples");
const badge = $("badge");
const emptyHint = $("emptyHint");
const shapeCount = $("shapeCount");
const cursorInfo = $("cursorInfo");
const widthInput = $("width");
const widthValue = $("widthValue");
const undoBtn = $("undo");
const redoBtn = $("redo");
const savedNote = $("savedNote");
const toastEl = $("toast");

const BG = "#070a12";
const DEFAULTS = { color: "#e9f0f7", width: 2.5 };
const TOOLS = ["pen", "line", "arrow", "rect", "ellipse", "text", "eraser"];

let shapes = [];
let draft = null;
let tool = "pen";
let color = DEFAULTS.color;
let width = DEFAULTS.width;
let hovered = null;
let drawing = false;
let erasing = false;
let dirty = false;

const history = new History();

/* ------------------------------------------------------------------- sound */
// Tiny synthesized sound effects via the Web Audio API — no audio files needed.
const Sound = (() => {
  let ctx = null;
  let muted = localStorage.getItem("nexus-sound") === "0";
  function ensure() {
    if (!ctx) {
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        ctx = null;
      }
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, duration, type = "sine", gain = 0.08, slide = 0) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + duration);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(g).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
  function noise(duration, gain = 0.05) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    const bufSize = Math.floor(c.sampleRate * duration);
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
    const src = c.createBufferSource();
    src.buffer = buf;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(g).connect(c.destination);
    src.start(now);
  }
  return {
    pen: () => tone(740, 0.035, "triangle", 0.05),
    shape: () => tone(523, 0.09, "sine", 0.09, 260),
    erase: () => noise(0.09, 0.06),
    undo: () => {
      tone(660, 0.07, "sine", 0.07);
      setTimeout(() => tone(440, 0.09, "sine", 0.07), 70);
    },
    redo: () => {
      tone(440, 0.07, "sine", 0.07);
      setTimeout(() => tone(660, 0.09, "sine", 0.07), 70);
    },
    export: () => {
      tone(523, 0.08, "sine", 0.08);
      setTimeout(() => tone(659, 0.08, "sine", 0.08), 90);
      setTimeout(() => tone(784, 0.12, "sine", 0.09), 180);
    },
    clear: () => tone(330, 0.16, "sawtooth", 0.07, -180),
    toggleMute: () => {
      muted = !muted;
      localStorage.setItem("nexus-sound", muted ? "0" : "1");
      if (!muted) tone(880, 0.06, "sine", 0.08);
      return muted;
    },
    isMuted: () => muted,
  };
})();

/* ------------------------------------------------------------------ canvas */

function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestRender();
}

let rendering = false;
function requestRender() {
  // Rendering is synchronous: the scene is small and a stale canvas is a bug,
  // not a performance win.
  if (rendering) return;
  rendering = true;
  try {
    render();
  } finally {
    rendering = false;
  }
}

/* ------------------------------------------------------------------ paint */

function paintShape(context, shape, options = {}) {
  const { glow = false, override = null } = options;
  const stroke = override ?? shape.color ?? DEFAULTS.color;
  const lineWidth = shape.width ?? DEFAULTS.width;

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.fillStyle = stroke;

  if (glow) {
    context.shadowColor = stroke;
    context.shadowBlur = 14 * 2;
    context.lineWidth = lineWidth + 2;
    context.globalAlpha = 0.95;
  }

  if (shape.type === "pen") {
    const points = shape.points ?? [];
    if (points.length === 0) {
      context.restore();
      return;
    }
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, Math.max(lineWidth / 2, 0.8), 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      // Quadratic smoothing through midpoints keeps freehand lines clean.
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      context.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
    context.stroke();
    context.restore();
    return;
  }

  if (shape.type === "line" || shape.type === "arrow") {
    const { x1, y1, x2, y2 } = shape;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();

    if (shape.type === "arrow") {
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = clamp(lineWidth * 2.6 + 6, 8, 26);
      context.beginPath();
      context.moveTo(
        x2 - head * Math.cos(angle - Math.PI / 7),
        y2 - head * Math.sin(angle - Math.PI / 7)
      );
      context.lineTo(x2, y2);
      context.lineTo(
        x2 - head * Math.cos(angle + Math.PI / 7),
        y2 - head * Math.sin(angle + Math.PI / 7)
      );
      context.stroke();
    }
    context.restore();
    return;
  }

  if (shape.type === "rect") {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    const w = Math.abs(shape.x2 - shape.x1);
    const h = Math.abs(shape.y2 - shape.y1);
    context.beginPath();
    context.roundRect(x, y, w, h, Math.min(10, w / 2, h / 2));
    context.stroke();
    context.restore();
    return;
  }

  if (shape.type === "ellipse") {
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    context.beginPath();
    context.ellipse(
      cx,
      cy,
      Math.abs(shape.x2 - shape.x1) / 2,
      Math.abs(shape.y2 - shape.y1) / 2,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    context.restore();
    return;
  }

  if (shape.type === "text") {
    const size = shape.size ?? 22;
    context.font = `500 ${size}px Inter, system-ui, sans-serif`;
    context.textBaseline = "alphabetic";
    context.fillText(shape.text ?? "", shape.x, shape.y);
    context.restore();
    return;
  }

  context.restore();
}

function render() {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  for (const shape of shapes) paintShape(ctx, shape);

  if (hovered && !drawing) {
    paintShape(ctx, hovered, { glow: true, override: "#8b7dff" });
  }

  if (draft) paintShape(ctx, draft);

  const empty = shapes.length === 0 && !draft;
  emptyHint.hidden = !empty;
  shapeCount.textContent = humanCount(shapes.length, "shape");
}

/* --------------------------------------------------------------- pointer */

function pointFrom(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
}

function spawnRipple(event) {
  const rect = wrap.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.className = "ripple";
  dot.style.left = `${event.clientX - rect.left}px`;
  dot.style.top = `${event.clientY - rect.top}px`;
  ripples.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove());
  setTimeout(() => dot.remove(), 800);
}

function startShape(point) {
  if (tool === "pen") {
    draft = { type: "pen", points: [point], color, width };
  } else if (tool === "text") {
    draft = null;
  } else {
    draft = { type: tool, x1: point.x, y1: point.y, x2: point.x, y2: point.y, color, width };
  }
}

canvas.addEventListener("pointermove", (event) => {
  const point = pointFrom(event);
  cursorInfo.textContent = `x ${Math.round(point.x)} · y ${Math.round(point.y)}`;

  if (erasing) {
    eraseAt(point);
    return;
  }

  if (draft) {
    if (draft.type === "pen") {
      const last = draft.points[draft.points.length - 1];
      if (Math.hypot(point.x - last.x, point.y - last.y) > 1.6) draft.points.push(point);
    } else {
      draft.x2 = point.x;
      draft.y2 = point.y;
    }
    requestRender();
    return;
  }

  if (tool === "eraser") {
    hovered = hitTestStack(point);
  } else {
    hovered = null;
  }
  canvas.dataset.hover = String(Boolean(hovered) && tool === "pen");
  requestRender();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const point = pointFrom(event);
  event.preventDefault();
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* synthetic or already-released pointer */
  }
  spawnRipple(event);

  if (tool === "eraser") {
    erasing = true;
    eraseAt(point);
    requestRender();
    return;
  }

  if (tool === "text") {
    openTextEditor(point);
    return;
  }

  drawing = true;
  hovered = null;
  startShape(point);
  requestRender();
});

canvas.addEventListener("pointerup", (event) => {
  if (erasing) {
    erasing = false;
    commit();
    Sound.erase();
    return;
  }
  if (!drawing) return;
  drawing = false;

  const point = pointFrom(event);
  if (draft) {
    if (draft.type === "pen") {
      draft.points.push(point);
    } else {
      draft.x2 = point.x;
      draft.y2 = point.y;
    }
    // Ignore accidental taps that produce a zero-length shape.
    const tooSmall =
      draft.type !== "pen"
        ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 3
        : draft.points.length < 2;
    if (!tooSmall) {
      shapes.push(draft);
      commit();
      if (draft.type === "pen") Sound.pen();
      else Sound.shape();
    }
  }
  draft = null;
  requestRender();
});

canvas.addEventListener("pointercancel", () => {
  drawing = false;
  erasing = false;
  draft = null;
  requestRender();
});

canvas.addEventListener("pointerleave", () => {
  hovered = null;
  cursorInfo.textContent = "—";
  requestRender();
});

/* ----------------------------------------------------------------- eraser */

function hitTestStack(point) {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], point, 10)) return shapes[i];
  }
  return null;
}

function eraseAt(point) {
  const before = shapes.length;
  shapes = shapes.filter((shape) => !hitTest(shape, point, 10));
  if (shapes.length !== before) {
    hovered = null;
    requestRender();
  }
}

/* ------------------------------------------------------------------- text */

let editor = null;

function openTextEditor(point) {
  closeTextEditor(false);
  const size = Math.round(16 + width * 2.4);
  const area = document.createElement("textarea");
  area.className = "text-editor";
  area.rows = 1;
  area.style.left = `${point.x}px`;
  area.style.top = `${point.y - size}px`;
  area.style.font = `500 ${size}px Inter, system-ui, sans-serif`;
  area.style.color = color;
  area.style.caretColor = color;
  wrap.appendChild(area);
  area.focus();

  editor = { area, point, size };

  area.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTextEditor(false);
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      closeTextEditor(true);
    }
  });
  area.addEventListener("blur", () => closeTextEditor(true));
}

function closeTextEditor(save) {
  if (!editor) return;
  const { area, point, size } = editor;
  const text = area.value.trim();
  editor = null;
  area.remove();

  if (save && text) {
    shapes.push({ type: "text", x: point.x, y: point.y, text, color, width, size });
    commit();
    requestRender();
  }
}

/* ---------------------------------------------------------------- history */

function commit() {
  history.push(shapes);
  syncHistoryButtons();
  persist();
  requestRender();
}

function syncHistoryButtons() {
  undoBtn.disabled = !history.canUndo;
  redoBtn.disabled = !history.canRedo;
}

undoBtn.addEventListener("click", () => {
  const state = history.undo();
  if (!state) return;
  shapes = state;
  hovered = null;
  syncHistoryButtons();
  persist();
  requestRender();
  Sound.undo();
});

redoBtn.addEventListener("click", () => {
  const state = history.redo();
  if (!state) return;
  shapes = state;
  hovered = null;
  syncHistoryButtons();
  persist();
  requestRender();
  Sound.redo();
});

/* -------------------------------------------------------------- persistence */

let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  savedNote.textContent = "Saving…";
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, serialise(shapes));
      savedNote.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      savedNote.textContent = "Storage unavailable";
    }
  }, 250);
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseShapes(raw) : [];
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ export */

function download(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportPng() {
  const scale = 2;
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  const out = document.createElement("canvas");
  out.width = Math.round(w * scale);
  out.height = Math.round(h * scale);
  const target = out.getContext("2d");

  target.fillStyle = BG;
  target.fillRect(0, 0, out.width, out.height);

  target.save();
  target.scale(scale, scale);
  target.strokeStyle = "rgba(255,255,255,0.035)";
  target.lineWidth = 1;
  for (let x = 0; x <= w; x += 28) {
    target.beginPath();
    target.moveTo(x, 0);
    target.lineTo(x, h);
    target.stroke();
  }
  for (let y = 0; y <= h; y += 28) {
    target.beginPath();
    target.moveTo(0, y);
    target.lineTo(w, y);
    target.stroke();
  }
  target.restore();

  for (const shape of shapes) paintShape(target, shape);

  out.toBlob((blob) => {
    if (!blob) return toast("Export failed");
    download(exportName(), blob);
    toast("PNG exported");
    Sound.export();
  }, "image/png");
}

function exportJson() {
  download(
    exportName().replace(/\.png$/, ".json"),
    new Blob([serialise(shapes)], { type: "application/json" })
  );
  toast("Board saved");
}

$("exportPng").addEventListener("click", exportPng);
$("exportJson").addEventListener("click", exportJson);

$("importBtn").addEventListener("click", () => $("fileInput").click());
$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  const loaded = parseShapes(text);
  if (!loaded.length) {
    toast("That file has no drawable shapes");
  } else {
    shapes = loaded;
    hovered = null;
    commit();
    toast(`Loaded ${humanCount(shapes.length, "shape")}`);
  }
  event.target.value = "";
});

$("muteBtn").addEventListener("click", () => {
  const muted = Sound.toggleMute();
  $("muteBtn").setAttribute("aria-pressed", String(!muted));
  toast(muted ? "Sound off" : "Sound on");
});
  if (!shapes.length) return;
  if (!confirm(`Clear all ${shapes.length} shapes? This cannot be undone.`)) return;
  shapes = [];
  hovered = null;
  commit();
  toast("Board cleared");
  Sound.clear();
});

/* -------------------------------------------------------------------- tools */

function setTool(next) {
  tool = TOOLS.includes(next) ? next : "pen";
  closeTextEditor(true);
  hovered = null;
  for (const button of document.querySelectorAll(".tool")) {
    button.setAttribute("aria-pressed", String(button.dataset.tool === tool));
  }
  canvas.dataset.tool = tool;
  updateBadge();
  requestRender();
}

function updateBadge() {
  badge.textContent = `${tool} · ${width.toFixed(width % 1 === 0 ? 0 : 1)}px`;
}

for (const button of document.querySelectorAll(".tool")) {
  button.addEventListener("click", () => setTool(button.dataset.tool));
}

for (const swatch of document.querySelectorAll(".swatch")) {
  swatch.addEventListener("click", () => {
    color = swatch.dataset.color;
    for (const other of document.querySelectorAll(".swatch")) {
      other.setAttribute("aria-pressed", String(other === swatch));
    }
  });
}

widthInput.addEventListener("input", () => {
  width = Number(widthInput.value);
  widthValue.textContent = width.toFixed(width % 1 === 0 ? 0 : 1);
  updateBadge();
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

  const mod = event.ctrlKey || event.metaKey;
  if (mod && event.key.toLowerCase() === "z") {
    event.preventDefault();
    (event.shiftKey ? redoBtn : undoBtn).click();
    return;
  }
  if (mod && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoBtn.click();
    return;
  }
  if (mod || event.altKey) return;

  const map = { p: "pen", l: "line", a: "arrow", r: "rect", o: "ellipse", t: "text", e: "eraser" };
  const next = map[event.key.toLowerCase()];
  if (next) {
    event.preventDefault();
    setTool(next);
  }
});

/* -------------------------------------------------------------------- toast */

let toastTimer = 0;
function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2000);
}

/* --------------------------------------------------------------------- init */

shapes = restore();
history.reset(shapes);
syncHistoryButtons();
setTool("pen");
$("muteBtn").setAttribute("aria-pressed", String(!Sound.isMuted()));
fit();
new ResizeObserver(fit).observe(wrap);
savedNote.textContent = shapes.length ? "Restored from this browser" : "Saved locally";
if (shapes.length) toast(`Restored ${humanCount(shapes.length, "shape")}`);

// Exposed for smoke tests in a real browser.
window.__nexus = {
  shapes: () => shapes.map((s) => s.type),
  count: () => shapes.length,
  tool: () => tool,
  setTool,
  history: () => ({ undo: history.canUndo, redo: history.canRedo }),
  fill: (list) => {
    shapes = list;
    commit();
  },
  bounds: () => ({ w: wrap.clientWidth, h: wrap.clientHeight }),
};
