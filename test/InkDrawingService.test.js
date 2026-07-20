const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createInkArchive } = require("./helpers/inkFixture");

const rootDir = path.resolve(__dirname, "..");

function loadService() {
  const context = vm.createContext({ Uint8Array, DataView, ArrayBuffer, console });
  ["src/FreehandStrokeService.js", "src/InkDrawingService.js"].forEach((relativePath) => {
    vm.runInContext(fs.readFileSync(path.join(rootDir, relativePath), "utf8"), context, { filename: relativePath });
  });
  return context.__MN_INK_DRAWING_SERVICE_MNCardsToMDAddon;
}

test("renders ink colors, marker transparency, and erased field 11 fragments", () => {
  const archive = createInkArchive({
    inks: [
      { type: "com.apple.ink.pen", width: 3, color: { r: 1, g: 0, b: 0, a: 1 } },
      { type: "com.apple.ink.marker", width: 5, color: { r: 0, g: 0, b: 1, a: 1 } },
    ],
    strokes: [
      {
        inkIndex: 0,
        points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
        transform: {},
        fragments: [
          { points: [{ x: 0, y: -2 }, { x: 20, y: -2 }, { x: 20, y: 2 }, { x: 0, y: 2 }] },
          { points: [{ x: 80, y: -2 }, { x: 100, y: -2 }, { x: 100, y: 2 }, { x: 80, y: 2 }] },
        ],
      },
      { inkIndex: 1, points: [{ x: 0, y: 20 }, { x: 30, y: 20 }], transform: {} },
    ],
  });
  const result = loadService().renderDrawingSvg(archive);

  assert.equal(result.strokeCount, 2);
  assert.equal((result.svg.match(/<path /g) || []).length, 3);
  assert.match(result.svg, /fill="rgba\(255,0,0,1\)"/);
  assert.match(result.svg, /fill="rgba\(0,0,255,0\.4\)"/);
  assert.match(result.svg, /M 0\.00 -2\.00 L 20\.00 -2\.00/);
  assert.doesNotMatch(result.svg, /M 0\.00 0\.00/);
});

test("supports verified point strides and rejects invalid ink indexes", () => {
  const service = loadService();
  [8, 12, 14, 16, 18, 20, 22, 30, 48].forEach((pointStride) => {
    assert.equal(service.renderDrawingSvg(createInkArchive({ pointStride })).strokeCount, 1);
  });
  assert.throws(() => service.renderDrawingSvg(createInkArchive({ strokes: [{ inkIndex: 2 }] })), /invalid-ink-index-0-2/);
  assert.throws(() => service.renderDrawingSvg(createInkArchive({ pointStride: 7, points: [{ x: 1, y: 2 }] })), /invalid-point-stride/);
});
