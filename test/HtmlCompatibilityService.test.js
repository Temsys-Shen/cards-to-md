const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");

const COCOA_HTML = `<!DOCTYPE html><html><head><meta name="Generator" content="Cocoa HTML Writer"><style>
p.p1 {margin: 0.0px; font: 12.3px 'LiHei Pro'; color: #000000}
span.s1 {font-family: 'Helvetica'; font-size: 12.32px}
span.s2 {font-family: 'LiHei Pro'; font-size: 12.32px; text-decoration: underline; background-color: #df00ff}
</style></head><body><p class="p1"><span class="s1">阿爸</span><span class="s2">阿爸</span></p></body></html>`;

function loadService() {
  const context = vm.createContext({ console });
  const filePath = path.join(rootDir, "src/HtmlCompatibilityService.js");
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
  return context.__MN_HTML_COMPATIBILITY_SERVICE_MNCardsToMDAddon;
}

test("inlines Cocoa HTML styles for Markdown export", () => {
  const result = loadService().convertHtml(COCOA_HTML, { noteId: "note", commentIndex: 0 });
  assert.match(result, /font:12\.3px 'LiHei Pro'/);
  assert.match(result, /font-family:'Helvetica';font-size:12\.32px/);
  assert.match(result, /text-decoration:underline;background-color:#df00ff/);
  assert.doesNotMatch(result, /<!DOCTYPE|<html|<head|<style|class=/i);
});

test("keeps ordinary fragments and rejects unknown classes", () => {
  const service = loadService();
  const fragment = '<p><strong>富文本</strong></p>';
  assert.equal(service.convertHtml(fragment, { noteId: "fragment", commentIndex: 0 }), fragment);
  assert.throws(
    () => service.convertHtml('<html><head><style>.known{color:red}</style></head><body><span class="missing">text</span></body></html>', { noteId: "class", commentIndex: 0 }),
    /HTML样式类未匹配/,
  );
});
