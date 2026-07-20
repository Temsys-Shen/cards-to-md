const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { createInkArchive } = require("./helpers/inkFixture");

const rootDir = path.resolve(__dirname, "..");

function loadSource(context, relativePath) {
  vm.runInContext(fs.readFileSync(path.join(rootDir, relativePath), "utf8"), context, { filename: relativePath });
}

function createRuntime(mediaById = {}, sketchByKey = {}) {
  let mediaReads = 0;
  const context = vm.createContext({
    console,
    Uint8Array,
    DataView,
    ArrayBuffer,
    Database: {
      sharedInstance() {
        return {
          getMediaByHash(mediaId) {
            mediaReads += 1;
            if (!Object.prototype.hasOwnProperty.call(mediaById, mediaId)) return undefined;
            return { base64Encoding: () => mediaById[mediaId] };
          },
          getNoteById(noteId) {
            return noteId === "target" ? { noteTitle: "目标卡片" } : null;
          },
          getSketchNoteForMindMapFocusNoteId(notebookId, noteId) {
            return sketchByKey[`${notebookId}:${noteId}`] || null;
          },
        };
      },
    },
    __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon: {
      arrayFromNSArray(value) { return Array.isArray(value) ? value : []; },
    },
    __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon: {
      validateAttachmentFolderName(value) { return value; },
    },
  });
  loadSource(context, "src/InkDrawingService.js");
  loadSource(context, "src/CardContentService.js");
  loadSource(context, "src/MarkdownExportService.js");
  return {
    context,
    getMediaReads() { return mediaReads; },
  };
}

function selectionFor(note) {
  const card = { note, noteId: note.noteId, depth: 0 };
  return { flatCards: [card], treeCards: [card] };
}

test("exports ordered rich content and external attachments", () => {
  const runtime = createRuntime({ excerpt: "ZXhjZXJwdA==", inline: "aW5saW5l", linked: "bGluaw==", paint: "cGFpbnQ=" });
  const note = {
    noteId: "n1",
    noteTitle: "标题",
    excerptPic: { paint: "excerpt" },
    comments: [
      { type: "TextNote", text: "前文 ![内嵌](marginnote4app://markdownimg/jpeg/inline) 后文", markdown: true },
      { type: "HtmlNote", html: "<p><strong>富文本</strong></p>" },
      { type: "LinkNote", q_hpic: { paint: "linked" } },
      { type: "PaintNote", paint: "paint" },
    ],
  };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), { attachmentFolderName: "assets" });
  assert.equal(result.imageCount, 4);
  assert.match(result.markdown, /!\[excerpt\]\(assets\/n1-excerptPic-excerpt-0-excerpt\.png\)/);
  assert.match(result.markdown, /前文/);
  assert.match(result.markdown, /n1-textComment-0-0-inline\.jpeg/);
  assert.match(result.markdown, /<p><strong>富文本<\/strong><\/p>/);
  assert.match(result.markdown, /n1-linkNote-2-0-linked\.png/);
  assert.match(result.markdown, /n1-paintNote-3-0-paint\.png/);
  assert.equal(result.assets.length, 4);
});

test("uses text excerpt when textFirst is enabled and never reads image media when disabled", () => {
  const runtime = createRuntime();
  const note = {
    noteId: "n2",
    noteTitle: "标题",
    notebookId: "book",
    textFirst: true,
    excerptPic: { paint: "missing-excerpt" },
    excerptText: "摘录正文",
    comments: [
      { type: "TextNote", text: "![图](marginnote4app://markdownimg/png/missing-inline)" },
      { type: "PaintNote", paint: "missing-paint" },
    ],
  };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), { includeImages: false, attachmentFolderName: "assets" });
  assert.match(result.markdown, /> 摘录正文/);
  assert.equal(result.imageCount, 0);
  assert.equal(runtime.getMediaReads(), 0);
});

test("keeps note links and rejects HtmlNote without HTML", () => {
  const runtime = createRuntime();
  const linked = { noteId: "n3", noteTitle: "标题", comments: [{ type: "TextNote", text: "marginnote4app://note/target" }] };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(linked), {});
  assert.match(result.markdown, /\[目标卡片\]\(marginnote4app:\/\/note\/target\)/);
  const invalid = { noteId: "n4", noteTitle: "标题", comments: [{ type: "HtmlNote", text: "fallback is forbidden" }] };
  assert.throws(() => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(invalid), {}), /HtmlNote缺少html/);
});

test("fails with source context when an enabled image media is missing", () => {
  const runtime = createRuntime();
  const note = { noteId: "n-missing", noteTitle: "标题", comments: [{ type: "PaintNote", paint: "missing" }] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {}),
    /图片媒体未找到: noteId=n-missing, source=paintNote, commentIndex=0, mediaId=missing/,
  );
});

test("renders independent mindmap handwriting as an SVG asset", () => {
  const drawing = createInkArchive();
  const runtime = createRuntime({ drawing }, { "book:n5": { comments: [{ drawing: "drawing" }] } });
  const note = { noteId: "n5", noteTitle: "标题", notebookId: "book", comments: [] };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), { attachmentFolderName: "assets" });
  assert.equal(result.imageCount, 1);
  assert.equal(result.assets[0].kind, "svg");
  assert.match(result.assets[0].svg, /M 11\.00 22\.00 L 13\.00 24\.00/);
  assert.match(result.markdown, /n5-sketchDrawing-excerpt-0-drawing\.svg/);
});

test("rejects malformed handwriting archives with the parser error", () => {
  const runtime = createRuntime({ drawing: "%%%" }, { "book:n6": { comments: [{ drawing: "drawing" }] } });
  const note = { noteId: "n6", noteTitle: "标题", notebookId: "book", comments: [] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {}),
    /脑图手写解析失败: noteId=n6, mediaId=drawing, error=Error: invalid-base64/,
  );
});
