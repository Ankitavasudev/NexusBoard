import { test } from "node:test";
import assert from "node:assert/strict";

import {
  History,
  clamp,
  distance,
  distanceToSegment,
  distanceToShape,
  exportName,
  hitTest,
  hitTestAll,
  humanCount,
  normaliseBox,
  parseShapes,
  serialise,
} from "../board-core.js";

const P = (x, y) => ({ x, y });

/* --------------------------------------------------------------- geometry */

test("distance is euclidean", () => {
  assert.equal(distance(P(0, 0), P(3, 4)), 5);
  assert.equal(distance(P(2, 2), P(2, 2)), 0);
});

test("distanceToSegment handles the perpendicular case", () => {
  assert.equal(distanceToSegment(P(5, 5), P(0, 0), P(10, 0)), 5);
});

test("distanceToSegment clamps past both ends", () => {
  assert.equal(distanceToSegment(P(-5, 0), P(0, 0), P(10, 0)), 5);
  assert.equal(distanceToSegment(P(20, 0), P(0, 0), P(10, 0)), 10);
});

test("distanceToSegment handles a zero-length segment", () => {
  assert.equal(distanceToSegment(P(3, 4), P(0, 0), P(0, 0)), 5);
});

test("normaliseBox works regardless of drag direction", () => {
  assert.deepEqual(normaliseBox({ x1: 10, y1: 20, x2: 4, y2: 8 }), { x: 4, y: 8, w: 6, h: 12 });
  assert.deepEqual(normaliseBox({ x1: 1, y1: 2, x2: 5, y2: 9 }), { x: 1, y: 2, w: 4, h: 7 });
});

test("pen distance uses the polyline, not the bounding box", () => {
  const pen = { type: "pen", points: [P(0, 0), P(10, 0), P(10, 10)], width: 2 };
  assert.equal(distanceToShape(pen, P(5, 0)), 0);
  assert.equal(distanceToShape(pen, P(10, 5)), 0);
  // The diagonal "shortcut" through the bend is far from the line itself.
  assert.ok(distanceToShape(pen, P(5, 5)) > 3);
});

test("a single-point pen is still hittable", () => {
  const dot = { type: "pen", points: [P(4, 4)], width: 2 };
  assert.equal(distanceToShape(dot, P(4, 4)), 0);
  assert.equal(distanceToShape(dot, P(4, 7)), 3);
});

test("line and arrow measure to the segment", () => {
  const line = { type: "line", x1: 0, y1: 0, x2: 100, y2: 0 };
  assert.equal(distanceToShape(line, P(50, 4)), 4);
  const arrow = { ...line, type: "arrow" };
  assert.equal(distanceToShape(arrow, P(50, 4)), 4);
});

test("rect distance is measured to the border only", () => {
  const rect = { type: "rect", x1: 0, y1: 0, x2: 100, y2: 50 };
  assert.equal(distanceToShape(rect, P(50, 0)), 0);
  assert.equal(distanceToShape(rect, P(50, 5)), 5);
  // Dead centre is 25 away from the nearest edge, so it is not a hit.
  assert.equal(distanceToShape(rect, P(50, 25)), 25);
});

test("ellipse hit test follows the curve", () => {
  const ellipse = { type: "ellipse", x1: 0, y1: 0, x2: 100, y2: 100 };
  assert.ok(distanceToShape(ellipse, P(50, 0)) < 0.001);
  assert.ok(distanceToShape(ellipse, P(0, 50)) < 0.001);
  assert.ok(distanceToShape(ellipse, P(50, 50)) > 40);
});

test("text hit test uses a rendered-width box", () => {
  const text = { type: "text", x: 10, y: 40, text: "hello", size: 20 };
  assert.equal(distanceToShape(text, P(20, 35)), 0);
  assert.ok(distanceToShape(text, P(20, 200)) > 100);
});

test("hitTest widens with stroke width", () => {
  const line = { type: "line", x1: 0, y1: 0, x2: 100, y2: 0, width: 20 };
  assert.equal(hitTest(line, P(50, 12)), true);
  assert.equal(hitTest({ ...line, width: 2 }, P(50, 12)), false);
});

test("hitTestAll returns topmost shapes first", () => {
  const a = { type: "line", x1: 0, y1: 0, x2: 10, y2: 0, width: 4 };
  const b = { type: "line", x1: 0, y1: 0, x2: 10, y2: 0, width: 4 };
  assert.deepEqual(hitTestAll([a, b], P(5, 1)), [b, a]);
  assert.deepEqual(hitTestAll([a, b], P(500, 500)), []);
});

test("clamp bounds values", () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(50, 0, 10), 10);
  assert.equal(clamp(5, 0, 10), 5);
});

/* ---------------------------------------------------------------- history */

test("history starts empty and cannot undo", () => {
  const h = new History();
  assert.deepEqual(h.current, []);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), null);
});

test("history undo and redo walk the snapshots", () => {
  const h = new History();
  h.push([{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }]);
  h.push([{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }, { type: "line", x1: 0, y1: 0, x2: 2, y2: 2 }]);
  assert.equal(h.current.length, 2);
  assert.equal(h.undo().length, 1);
  assert.equal(h.undo().length, 0);
  assert.equal(h.canUndo, false);
  assert.equal(h.redo().length, 1);
  assert.equal(h.redo().length, 2);
  assert.equal(h.canRedo, false);
});

test("history drops the redo branch after a new edit", () => {
  const h = new History();
  h.push(["a"]);
  h.push(["a", "b"]);
  h.undo();
  assert.equal(h.canRedo, true);
  h.push(["c"]);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.current, ["c"]);
});

test("history ignores no-op pushes", () => {
  const h = new History([{ type: "text", x: 1, y: 2, text: "hi" }]);
  h.push([{ type: "text", x: 1, y: 2, text: "hi" }]);
  assert.equal(h.canUndo, false);
});

test("history snapshots are isolated from later mutation", () => {
  const h = new History();
  const shapes = [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }];
  h.push(shapes);
  shapes.push({ type: "line", x1: 0, y1: 0, x2: 5, y2: 5 });
  assert.equal(h.current.length, 1);
});

test("history respects its limit", () => {
  const h = new History([], 3);
  h.push([1]);
  h.push([2]);
  h.push([3]);
  h.push([4]);
  assert.equal(h.states.length, 3);
  assert.deepEqual(h.current, [4]);
});

test("history reset clears both directions", () => {
  const h = new History();
  h.push(["a"]);
  h.reset([]);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.current, []);
});

/* ---------------------------------------------------------- serialisation */

test("serialise round-trips through parseShapes", () => {
  const shapes = [
    { type: "pen", points: [P(1, 2), P(3, 4)], color: "#fff", width: 3 },
    { type: "rect", x1: 0, y1: 0, x2: 10, y2: 10, color: "#f00", width: 1 },
    { type: "text", x: 5, y: 5, text: "hi", color: "#0f0", width: 2, size: 24 },
  ];
  assert.deepEqual(parseShapes(serialise(shapes)), shapes);
});

test("parseShapes rejects broken JSON without throwing", () => {
  assert.deepEqual(parseShapes("{not json"), []);
  assert.deepEqual(parseShapes(null), []);
  assert.deepEqual(parseShapes(42), []);
  assert.deepEqual(parseShapes({ shapes: "nope" }), []);
});

test("parseShapes drops invalid shapes but keeps valid ones", () => {
  const raw = JSON.stringify({
    shapes: [
      { type: "line", x1: 0, y1: 0, x2: 5, y2: 5 },
      { type: "hexagon", x1: 0, y1: 0, x2: 5, y2: 5 },
      { type: "rect", x1: "nope", y1: 0, x2: 5, y2: 5 },
      { type: "pen", points: [] },
      { type: "text", x: 1, y: 1, text: "ok" },
    ],
  });
  assert.deepEqual(parseShapes(raw).map((s) => s.type), ["line", "text"]);
});

test("parseShapes applies default styling", () => {
  const [shape] = parseShapes(JSON.stringify({ shapes: [{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }] }));
  assert.equal(shape.color, "#e9f0f7");
  assert.equal(shape.width, 2.5);
});

test("parseShapes accepts a bare array too", () => {
  const bare = JSON.stringify([{ type: "line", x1: 0, y1: 0, x2: 1, y2: 1 }]);
  assert.equal(parseShapes(bare).length, 1);
});

test("parseShapes copies pen points instead of aliasing them", () => {
  const input = { shapes: [{ type: "pen", points: [P(1, 1)] }] };
  const [shape] = parseShapes(input);
  shape.points[0].x = 99;
  assert.equal(input.shapes[0].points[0].x, 1);
});

/* ----------------------------------------------------------------- naming */

test("exportName is filesystem safe and time stamped", () => {
  const name = exportName(new Date(2026, 10, 1, 5, 7));
  assert.equal(name, "nexusboard-2026-11-01-0507.png");
  assert.doesNotMatch(name, /[\\/:*?"<>|]/);
});

test("humanCount pluralises", () => {
  assert.equal(humanCount(1, "shape"), "1 shape");
  assert.equal(humanCount(0, "shape"), "0 shapes");
  assert.equal(humanCount(12, "shape"), "12 shapes");
});
