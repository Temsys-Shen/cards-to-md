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
  loadSource(context, "src/FreehandStrokeService.js");
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

function selectionForCards(cards) {
  return { flatCards: cards, treeCards: cards };
}

test("exports ordered rich content and external attachments", () => {
  const linkedDrawing = createInkArchive();
  const runtime = createRuntime({ excerpt: "ZXhjZXJwdA==", inline: "aW5saW5l", linked: "bGluaw==", linkedDrawing, paint: "cGFpbnQ=" });
  const note = {
    noteId: "n1",
    noteTitle: "标题",
    excerptPic: { paint: "excerpt" },
    comments: [
      { type: "TextNote", text: "前文 ![内嵌](marginnote4app://markdownimg/jpeg/inline) 后文", markdown: true },
      { type: "HtmlNote", html: "<p><strong>富文本</strong></p>" },
      { type: "LinkNote", q_hpic: { paint: "linked", drawing: "linkedDrawing" } },
      { type: "PaintNote", paint: "paint" },
    ],
  };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), { attachmentFolderName: "assets" });
  assert.equal(result.imageCount, 5);
  assert.match(result.markdown, /!\[excerpt\]\(assets\/n1-excerptPic-excerpt-0-excerpt\.png\)/);
  assert.match(result.markdown, /前文/);
  assert.match(result.markdown, /n1-textComment-0-0-inline\.jpeg/);
  assert.match(result.markdown, /<p><strong>富文本<\/strong><\/p>/);
  assert.match(result.markdown, /n1-linkNote-2-0-linked\.png/);
  assert.match(result.markdown, /n1-linkNoteDrawing-2-1-linkedDrawing\.svg/);
  assert.match(result.markdown, /n1-paintNote-3-0-paint\.png/);
  assert.equal(result.assets.length, 5);
  assert.equal(result.assets[3].source, "linkNoteDrawing");
  assert.equal(result.assets[3].kind, "svg");
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
      { type: "LinkNote", q_hpic: { paint: "missing-link-paint", drawing: "missing-link-drawing" }, textFirst: false },
      { type: "PaintNote", paint: "missing-paint", drawing: "missing-drawing" },
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

  const missingDrawing = { noteId: "drawing-missing", noteTitle: "标题", comments: [{ type: "PaintNote", drawing: "missing" }] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(missingDrawing), {}),
    /图片媒体未找到: noteId=drawing-missing, source=paintNoteDrawing, commentIndex=0, mediaId=missing/,
  );

  const missingFields = { noteId: "fields-missing", noteTitle: "标题", comments: [{ type: "PaintNote" }] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(missingFields), {}),
    /PaintNote缺少paint和drawing: noteId=fields-missing, commentIndex=0/,
  );

  const missingLinkFields = {
    noteId: "link-fields-missing",
    noteTitle: "标题",
    comments: [{ type: "LinkNote", q_hpic: {}, textFirst: false }],
  };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(missingLinkFields), {}),
    /LinkNote.q_hpic缺少paint和drawing: noteId=link-fields-missing, commentIndex=0/,
  );

  const missingLinkDrawing = {
    noteId: "link-drawing-missing",
    noteTitle: "标题",
    comments: [{ type: "LinkNote", q_hpic: { drawing: "missing" }, textFirst: false }],
  };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(missingLinkDrawing), {}),
    /图片媒体未找到: noteId=link-drawing-missing, source=linkNoteDrawing, commentIndex=0, mediaId=missing/,
  );
});

test("renders drawing-only LinkNote pictures as SVG assets", () => {
  const drawing = createInkArchive();
  const runtime = createRuntime({ drawing });
  const note = {
    noteId: "link-drawing-only",
    noteTitle: "标题",
    comments: [{
      type: "LinkNote",
      q_hpic: { drawing: "drawing" },
      q_htext: "不应导出的OCR文字",
      textFirst: false,
    }],
  };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {});

  assert.equal(result.imageCount, 1);
  assert.equal(result.assets[0].source, "linkNoteDrawing");
  assert.equal(result.assets[0].kind, "svg");
  assert.match(result.assets[0].fileName, /link-drawing-only-linkNoteDrawing-0-0-drawing\.svg/);
  assert.doesNotMatch(result.markdown, /不应导出的OCR文字/);
});

test("renders drawing PaintNote comments as ordered SVG assets", () => {
  const drawing = createInkArchive();
  const runtime = createRuntime(
    { paint: "cGFpbnQ=", drawing, sketch: drawing },
    { "book:paint-drawing": { comments: [{ drawing: "sketch" }] } },
  );
  const note = {
    noteId: "paint-drawing",
    noteTitle: "标题",
    notebookId: "book",
    comments: [
      { type: "TextNote", text: "前文" },
      { type: "PaintNote", paint: "paint", drawing: "drawing" },
      { type: "TextNote", text: "后文" },
    ],
  };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(
    selectionFor(note),
    { attachmentFolderName: "assets" },
  );

  assert.equal(result.imageCount, 3);
  assert.equal(result.assets.map(asset => asset.source).join(","), "paintNote,paintNoteDrawing,sketchDrawing");
  assert.match(result.assets[1].svg, /fill="rgba\(0,0,0,1\)"/);
  assert.match(result.markdown, /paint-drawing-paintNote-1-0-paint\.png/);
  assert.match(result.markdown, /paint-drawing-paintNoteDrawing-1-1-drawing\.svg/);
  assert.ok(
    result.markdown.indexOf("paint-drawing-paintNote-1-0-paint.png") <
      result.markdown.indexOf("paint-drawing-paintNoteDrawing-1-1-drawing.svg"),
  );

  const drawingOnly = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor({
    noteId: "drawing-only",
    noteTitle: "标题",
    comments: [{ type: "PaintNote", drawing: "drawing" }],
  }), {});
  assert.equal(drawingOnly.imageCount, 1);
  assert.equal(drawingOnly.assets[0].source, "paintNoteDrawing");
  assert.equal(drawingOnly.assets[0].kind, "svg");
  assert.match(drawingOnly.assets[0].fileName, /drawing-only-paintNoteDrawing-0-0-drawing\.svg/);
});

test("reports invalid PaintNote drawing media and archives with source context", () => {
  const invalidMediaRuntime = createRuntime({ empty: "" });
  const invalidMedia = { noteId: "drawing-empty", noteTitle: "标题", comments: [{ type: "PaintNote", drawing: "empty" }] };
  assert.throws(
    () => invalidMediaRuntime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(invalidMedia), {}),
    /手写媒体无效: noteId=drawing-empty, source=paintNoteDrawing, commentIndex=0, mediaId=empty/,
  );

  const invalidArchiveRuntime = createRuntime({ invalid: "%%%" });
  const invalidArchive = { noteId: "drawing-invalid", noteTitle: "标题", comments: [{ type: "PaintNote", drawing: "invalid" }] };
  assert.throws(
    () => invalidArchiveRuntime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(invalidArchive), {}),
    /手写解析失败: noteId=drawing-invalid, source=paintNoteDrawing, commentIndex=0, mediaId=invalid, error=Error: invalid-base64/,
  );
});

test("renders independent mindmap handwriting as an SVG asset", () => {
  const drawing = createInkArchive();
  const runtime = createRuntime({ drawing }, { "book:n5": { comments: [{ drawing: "drawing" }] } });
  const note = { noteId: "n5", noteTitle: "标题", notebookId: "book", comments: [] };
  const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), { attachmentFolderName: "assets" });
  assert.equal(result.imageCount, 1);
  assert.equal(result.assets[0].kind, "svg");
  assert.match(result.assets[0].svg, /fill="rgba\(0,0,0,1\)"/);
  assert.match(result.markdown, /n5-sketchDrawing-excerpt-0-drawing\.svg/);
});

test("renders 8-byte single-point handwriting and extended point records", () => {
  const singlePoint = createInkArchive({ pointStride: 8, points: [{ x: 5, y: 6 }] });
  const singleRuntime = createRuntime({ singlePoint }, { "book:n-single": { comments: [{ drawing: "singlePoint" }] } });
  const singleNote = { noteId: "n-single", noteTitle: "单点", notebookId: "book", comments: [] };
  const singleResult = singleRuntime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(singleNote), {});
  assert.match(singleResult.assets[0].svg, /<circle cx="15\.00" cy="26\.00"/);

  [12, 14, 48].forEach((pointStride) => {
    const drawing = createInkArchive({ pointStride });
    const runtime = createRuntime({ drawing }, { [`book:n-${pointStride}`]: { comments: [{ drawing: "drawing" }] } });
    const note = { noteId: `n-${pointStride}`, noteTitle: "扩展点", notebookId: "book", comments: [] };
    const result = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {});
    assert.match(result.assets[0].svg, /fill="rgba\(0,0,0,1\)"/);
  });
});

test("rejects point records shorter than 8 bytes", () => {
  const drawing = createInkArchive({ pointStride: 7, points: [{ x: 1, y: 2 }] });
  const runtime = createRuntime({ drawing }, { "book:n-short": { comments: [{ drawing: "drawing" }] } });
  const note = { noteId: "n-short", noteTitle: "无效点", notebookId: "book", comments: [] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {}),
    /脑图手写解析失败: noteId=n-short, mediaId=drawing, error=Error: invalid-point-stride/,
  );
});

test("uses level-one card headings in flat mode and preserves tree depth", () => {
  const runtime = createRuntime();
  const first = { noteId: "first", noteTitle: "第一张", comments: [{ type: "TextNote", text: "# 内部标题", markdown: true }] };
  const second = { noteId: "second", noteTitle: "第二张", comments: [] };
  const flatCards = [
    { note: first, noteId: first.noteId, depth: 0 },
    { note: second, noteId: second.noteId, depth: 0 },
  ];
  const flatResult = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionForCards(flatCards), { mode: "flat" });
  assert.match(flatResult.markdown, /^# 第一张$/m);
  assert.match(flatResult.markdown, /^## 内部标题$/m);
  assert.match(flatResult.markdown, /^# 第二张$/m);
  assert.doesNotMatch(flatResult.markdown, /^## 第二张$/m);

  const treeCards = [
    { note: first, noteId: first.noteId, depth: 0 },
    { note: second, noteId: second.noteId, depth: 1 },
  ];
  const treeResult = runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionForCards(treeCards), { mode: "tree" });
  assert.match(treeResult.markdown, /^# 第一张$/m);
  assert.match(treeResult.markdown, /^## 内部标题$/m);
  assert.match(treeResult.markdown, /^## 第二张$/m);
});

test("rejects malformed handwriting archives with the parser error", () => {
  const runtime = createRuntime({ drawing: "%%%" }, { "book:n6": { comments: [{ drawing: "drawing" }] } });
  const note = { noteId: "n6", noteTitle: "标题", notebookId: "book", comments: [] };
  assert.throws(
    () => runtime.context.__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selectionFor(note), {}),
    /脑图手写解析失败: noteId=n6, mediaId=drawing, error=Error: invalid-base64/,
  );
});
