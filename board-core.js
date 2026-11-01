/**
 * NexusBoard core — pure geometry, hit-testing, history and (de)serialisation.
 *
 * Nothing here touches the DOM, so all of it is covered by `node --test`.
 */

export const STORAGE_KEY = "nexusboard.drawing.v1";
export const SHAPE_TYPES = ["pen", "line", "arrow", "rect", "ellipse", "text"];

/* --------------------------------------------------------------- geometry */

export function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Shortest distance from `p` to the segment `a`-`b`. */
export function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Axis-aligned box from two arbitrary corners. */
export function normaliseBox(shape) {
  const x = Math.min(shape.x1, shape.x2);
  const y = Math.min(shape.y1, shape.y2);
  return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
}

function boxFor(shape) {
  if (shape.type === "pen") {
    const xs = shape.points.map((p) => p.x);
    const ys = shape.points.map((p) => p.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  if (shape.type === "text") {
    const size = shape.size ?? 20;
    const width = Math.max(size, String(shape.text ?? "").length * size * 0.56);
    return { x: shape.x, y: shape.y - size, w: width, h: size * 1.3 };
  }
  return normaliseBox(shape);
}

export function distanceToShape(shape, point) {
  if (shape.type === "pen") {
    let best = Infinity;
    for (let i = 1; i < shape.points.length; i++) {
      best = Math.min(best, distanceToSegment(point, shape.points[i - 1], shape.points[i]));
    }
    return shape.points.length === 1 ? distance(point, shape.points[0]) : best;
  }

  if (shape.type === "line" || shape.type === "arrow") {
    return distanceToSegment(point, { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 });
  }

  if (shape.type === "rect") {
    const { x, y, w, h } = normaliseBox(shape);
    const a = { x, y };
    const b = { x: x + w, y };
    const c = { x: x + w, y: y + h };
    const d = { x, y: y + h };
    return Math.min(
      distanceToSegment(point, a, b),
      distanceToSegment(point, b, c),
      distanceToSegment(point, c, d),
      distanceToSegment(point, d, a)
    );
  }

  if (shape.type === "ellipse") {
    const { x, y, w, h } = normaliseBox(shape);
    const rx = Math.max(w / 2, 0.5);
    const ry = Math.max(h / 2, 0.5);
    const nx = (point.x - (x + rx)) / rx;
    const ny = (point.y - (y + ry)) / ry;
    return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(rx, ry);
  }

  if (shape.type === "text") {
    const box = boxFor(shape);
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h));
    return Math.hypot(dx, dy);
  }

  return Infinity;
}

/** True when `point` is close enough to `shape` to count as a hit. */
export function hitTest(shape, point, tolerance = 8) {
  return distanceToShape(shape, point) <= tolerance + (shape.width ?? 0) / 2;
}

/** All shapes under the cursor, topmost first. */
export function hitTestAll(shapes, point, tolerance = 8) {
  const hits = [];
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTest(shapes[i], point, tolerance)) hits.push(shapes[i]);
  }
  return hits;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/* ---------------------------------------------------------------- history */

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Snapshot-based undo stack. Each `push` stores the full drawing, which is
 * cheap at this scale and makes undo/redo impossible to desynchronise.
 */
export class History {
  constructor(initial = [], limit = 80) {
    this.limit = limit;
    this.states = [clone(initial)];
    this.index = 0;
  }

  get current() {
    return this.states[this.index];
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.states.length - 1;
  }

  push(state) {
    const snapshot = clone(state);
    const atHead = this.index === this.states.length - 1;
    if (atHead && JSON.stringify(snapshot) === JSON.stringify(this.states[this.index])) {
      return this.current;
    }
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(snapshot);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    return this.current;
  }

  undo() {
    if (!this.canUndo) return null;
    this.index -= 1;
    return clone(this.states[this.index]);
  }

  redo() {
    if (!this.canRedo) return null;
    this.index += 1;
    return clone(this.states[this.index]);
  }

  reset(state = []) {
    this.states = [clone(state)];
    this.index = 0;
    return this.current;
  }
}

/* ---------------------------------------------------------- serialisation */

export function serialise(shapes) {
  return JSON.stringify({ app: "nexusboard", version: 1, shapes }, null, 2);
}

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

function validShape(shape) {
  if (!shape || typeof shape !== "object") return false;
  if (!SHAPE_TYPES.includes(shape.type)) return false;
  if (shape.type === "pen") {
    return Array.isArray(shape.points) && shape.points.length > 0 && shape.points.every((p) => p && isNumber(p.x) && isNumber(p.y));
  }
  if (shape.type === "text") return isNumber(shape.x) && isNumber(shape.y) && typeof shape.text === "string";
  return isNumber(shape.x1) && isNumber(shape.y1) && isNumber(shape.x2) && isNumber(shape.y2);
}

/** Parse stored or imported JSON, dropping anything malformed instead of throwing. */
export function parseShapes(raw) {
  let data;
  try {
    data = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return [];
  }
  if (!data || typeof data !== "object") return [];
  const list = Array.isArray(data) ? data : data.shapes;
  if (!Array.isArray(list)) return [];
  return list.filter(validShape).map((shape) => ({
    width: 2.5,
    color: "#e9f0f7",
    ...shape,
    ...(shape.type === "pen" ? { points: shape.points.map((p) => ({ x: p.x, y: p.y })) } : {}),
  }));
}

/* ----------------------------------------------------------------- naming */

export function exportName(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `nexusboard-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.png`;
}

export function humanCount(n, singular) {
  return `${n} ${singular}${n === 1 ? "" : "s"}`;
}
