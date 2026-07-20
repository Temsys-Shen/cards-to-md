const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../src/WebBridgeCommands.js"), "utf8");

function createCommands() {
  let scopeReads = 0;
  let saveCalls = 0;
  const context = vm.createContext({
    Date,
    __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon: {
      normalizeScope(scope) { return scope || "selection"; },
      getScopeSelection(_context, scope) {
        scopeReads += 1;
        const normalized = scope || "selection";
        return {
          scope: normalized,
          title: normalized === "mindmap" ? "当前脑图" : "所选卡片",
          selection: { flatCards: [{ noteId: "card" }], treeCards: [{ noteId: "card" }] },
        };
      },
    },
    __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon: {
      normalizeOptions(payload) {
        return {
          includeImages: payload && payload.includeImages !== false,
          includeCardLinks: Boolean(payload && payload.includeCardLinks),
          excerptStyle: payload && payload.excerptStyle || "quote",
          mode: payload && payload.mode || "flat",
          attachmentFolderName: payload && payload.attachmentFolderName || "assets",
        };
      },
      buildMarkdown(_selection, payload) {
        return {
          markdown: "# Card",
          noteCount: 1,
          imageCount: 0,
          fileBaseName: "Card",
          mode: payload.mode || "flat",
          options: { attachmentFolderName: payload.attachmentFolderName },
          warnings: [],
          assets: [],
        };
      },
    },
    __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon: {
      getAttachmentFolderName() { return "assets"; },
      setAttachmentFolderName(value) { return value || "assets"; },
    },
    __MN_EXPORT_FILE_SERVICE_MNCardsToMDAddon: {
      saveExport() {
        saveCalls += 1;
        return { markdownPath: "/Card.md", assetDir: null, zipPath: "/Card.zip", noteCount: 1, imageCount: 0 };
      },
    },
  });
  vm.runInContext(source, context, { filename: "src/WebBridgeCommands.js" });
  return {
    commands: context.__MN_WEB_BRIDGE_COMMANDS_MNCardsToMDAddon.commands,
    getScopeReads() { return scopeReads; },
    getSaveCalls() { return saveCalls; },
  };
}

function options(scope) {
  return {
    scope,
    includeImages: true,
    includeCardLinks: false,
    excerptStyle: "quote",
    mode: "flat",
    attachmentFolderName: "assets",
  };
}

test("preview returns scope metadata and reads the scope once", () => {
  const runtime = createCommands();
  const context = { addon: {} };
  const result = runtime.commands.previewSelectedCardsMarkdown(context, options("mindmap"));
  assert.equal(result.scope, "mindmap");
  assert.equal(result.scopeTitle, "当前脑图");
  assert.equal(runtime.getScopeReads(), 1);
});

test("changing scope invalidates the preview snapshot before saving", () => {
  const runtime = createCommands();
  const context = { addon: {} };
  runtime.commands.previewSelectedCardsMarkdown(context, options("selection"));
  assert.throws(
    () => runtime.commands.saveMarkdownExport(context, options("mindmap")),
    /导出选项已改变，请重新刷新预览/,
  );
  assert.equal(runtime.getSaveCalls(), 0);
});
