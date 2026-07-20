var __MN_CARD_CONTENT_SERVICE_MNCardsToMDAddon = (function () {
  var MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(marginnote4app:\/\/markdownimg\/(png|jpeg)\/([^\s)]+)\)/g;

  function arrayFromNSArray(value) {
    return __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon.arrayFromNSArray(value);
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function isMarkdown(value) {
    return value === true || Number(value) === 1;
  }

  function assertMediaAvailable(noteId, source, commentIndex, mediaId) {
    if (!mediaId) throw new Error("图片媒体缺失: noteId=" + noteId + ", source=" + source + ", commentIndex=" + commentIndex);
    var data = Database.sharedInstance().getMediaByHash(mediaId);
    if (!data) throw new Error("图片媒体未找到: noteId=" + noteId + ", source=" + source + ", commentIndex=" + commentIndex + ", mediaId=" + mediaId);
    return data;
  }

  function createImageItem(noteId, source, commentIndex, sequence, mediaId, extension, alt) {
    assertMediaAvailable(noteId, source, commentIndex, mediaId);
    return { type: "image", source: source, commentIndex: commentIndex, sequence: sequence, mediaId: mediaId, extension: extension, alt: alt || "" };
  }

  function parseTextItems(noteId, text, markdown, source, commentIndex, excerpt, includeImages) {
    var normalized = normalizeText(text);
    if (!normalized) return [];
    var images = [];
    var placeholderPrefix = "\u0000CARDS_TO_MD_IMAGE_";
    var encoded = normalized.replace(MARKDOWN_IMAGE_PATTERN, function (_, alt, format, mediaId) {
      var sequence = images.length;
      images.push({ alt: alt, extension: format === "jpeg" ? "jpeg" : "png", mediaId: mediaId });
      return placeholderPrefix + sequence + "\u0000";
    });
    var tokenPattern = /\u0000CARDS_TO_MD_IMAGE_(\d+)\u0000/g;
    var items = [];
    var cursor = 0;
    var match;
    while ((match = tokenPattern.exec(encoded)) !== null) {
      var before = normalizeText(encoded.slice(cursor, match.index));
      if (before) items.push({ type: "text", format: markdown ? "markdown" : "plain", text: before, source: source, commentIndex: commentIndex, excerpt: excerpt === true });
      if (includeImages) {
        var image = images[Number(match[1])];
        items.push(createImageItem(noteId, source, commentIndex, Number(match[1]), image.mediaId, image.extension, image.alt));
      }
      cursor = match.index + match[0].length;
    }
    var after = normalizeText(encoded.slice(cursor));
    if (after) items.push({ type: "text", format: markdown ? "markdown" : "plain", text: after, source: source, commentIndex: commentIndex, excerpt: excerpt === true });
    return items;
  }

  function parseSketchItem(note, noteId) {
    var notebookId = normalizeText(note.notebookId);
    if (!notebookId || !noteId) return null;
    var sketchNote;
    try {
      sketchNote = Database.sharedInstance().getSketchNoteForMindMapFocusNoteId(notebookId, noteId);
    } catch (error) {
      throw new Error("脑图手写查询失败: noteId=" + noteId + ", notebookId=" + notebookId + ", error=" + String(error));
    }
    if (!sketchNote) return null;
    var sketchComment = arrayFromNSArray(sketchNote.comments).filter(function (comment) {
      return comment && normalizeText(comment.drawing);
    })[0];
    if (!sketchComment) return null;
    var drawingId = normalizeText(sketchComment.drawing);
    var drawingData = assertMediaAvailable(noteId, "sketchDrawing", -1, drawingId);
    var drawingBase64 = drawingData.base64Encoding();
    if (!drawingBase64 || typeof drawingBase64 !== "string") throw new Error("脑图手写媒体无效: noteId=" + noteId + ", mediaId=" + drawingId);
    try {
      var rendered = __MN_INK_DRAWING_SERVICE_MNCardsToMDAddon.renderDrawingSvg(drawingBase64);
      return { type: "image", source: "sketchDrawing", commentIndex: -1, sequence: 0, mediaId: drawingId, extension: "svg", alt: "handwriting", svg: rendered.svg };
    } catch (error) {
      throw new Error("脑图手写解析失败: noteId=" + noteId + ", mediaId=" + drawingId + ", error=" + String(error));
    }
  }

  function parseNote(note, options) {
    if (!note || !note.noteId) throw new Error("缺少MN卡片对象或noteId");
    var includeImages = !options || options.includeImages !== false;
    var noteId = String(note.noteId);
    var items = [];
    var unsupportedTypes = [];
    var hasExcerptPic = Boolean(note.excerptPic);
    var textFirst = note.textFirst === true || Number(note.textFirst) === 1;

    if (hasExcerptPic && !textFirst && includeImages) {
      var excerptMediaId = normalizeText(note.excerptPic.paint);
      items.push(createImageItem(noteId, "excerptPic", -1, 0, excerptMediaId, "png", "excerpt"));
    }
    if (!hasExcerptPic || textFirst) {
      items = items.concat(parseTextItems(noteId, note.excerptText, isMarkdown(note.excerptTextMarkdown), "excerptText", -1, true, includeImages));
    }

    arrayFromNSArray(note.comments).forEach(function (comment, commentIndex) {
      var type = comment ? String(comment.type || "") : "";
      if (!type) return;
      if (type === "TextNote") {
        items = items.concat(parseTextItems(noteId, comment.text, isMarkdown(comment.markdown), "textComment", commentIndex, false, includeImages));
        return;
      }
      if (type === "HtmlNote") {
        var html = normalizeText(comment.html);
        if (!html) throw new Error("HtmlNote缺少html: noteId=" + noteId + ", commentIndex=" + commentIndex);
        items.push({ type: "text", format: "html", text: html, source: "htmlComment", commentIndex: commentIndex, excerpt: false });
        return;
      }
      if (type === "LinkNote") {
        var linkImage = comment.q_hpic;
        var linkTextFirst = comment.textFirst === true || Number(comment.textFirst) === 1;
        if (linkImage && !linkTextFirst) {
          if (includeImages) items.push(createImageItem(noteId, "linkNote", commentIndex, 0, normalizeText(linkImage.paint), "png", "linked excerpt"));
          return;
        }
        items = items.concat(parseTextItems(noteId, comment.q_htext, isMarkdown(comment.markdown), "linkNote", commentIndex, false, includeImages));
        return;
      }
      if (type === "PaintNote") {
        if (includeImages) items.push(createImageItem(noteId, "paintNote", commentIndex, 0, normalizeText(comment.paint), "png", "paint note"));
        return;
      }
      unsupportedTypes.push(type);
    });

    if (includeImages) {
      var sketchItem = parseSketchItem(note, noteId);
      if (sketchItem) items.push(sketchItem);
    }
    return { noteId: noteId, items: items, unsupportedTypes: unsupportedTypes };
  }

  return { parseNote: parseNote };
})();
