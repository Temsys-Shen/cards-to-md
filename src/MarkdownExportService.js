var __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon = (function () {
  const DEFAULT_OPTIONS = {
    includeImages: true,
    includeCardLinks: false,
    excerptStyle: "quote",
    mode: "flat",
    attachmentFolderName: "assets",
  };
  const INTERNAL_NOTE_LINK_PREFIX = "marginnote4app://note/";

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function sanitizeFilePart(value) {
    return normalizeText(value).replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  }

  function normalizeOptions(options) {
    const source = options || {};
    return {
      includeImages: source.includeImages !== false,
      includeCardLinks: source.includeCardLinks === true,
      excerptStyle: source.excerptStyle === "plain" ? "plain" : DEFAULT_OPTIONS.excerptStyle,
      mode: source.mode === "tree" ? "tree" : DEFAULT_OPTIONS.mode,
      attachmentFolderName: __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon.validateAttachmentFolderName(
        source.attachmentFolderName || DEFAULT_OPTIONS.attachmentFolderName,
      ),
    };
  }

  function quoteMarkdownBlock(text) {
    return normalizeText(text).split("\n").map(function (line) {
      return line.length > 0 ? `> ${line}` : ">";
    }).join("\n");
  }

  function createWarningBag() {
    return { items: [], keys: {} };
  }

  function addWarning(warnings, key, message) {
    if (warnings.keys[key]) return;
    warnings.keys[key] = true;
    warnings.items.push(message);
  }

  function headingPrefix(level, warnings) {
    if (level <= 6) return "#".repeat(level);
    addWarning(warnings, `heading-clamped-${level}`, "存在超过6级的标题层级，已截断到Markdown的6级标题上限");
    return "######";
  }

  function mapMarkdownHeadings(text, baseHeadingLevel, warnings) {
    const normalized = normalizeText(text);
    if (!normalized) return "";
    return normalized.split("\n").map(function (line) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!match) return line;
      return `${headingPrefix(baseHeadingLevel + match[1].length, warnings)} ${match[2]}`;
    }).join("\n");
  }

  function resolveNoteLink(text) {
    const normalized = normalizeText(text);
    if (!normalized.startsWith(INTERNAL_NOTE_LINK_PREFIX)) return null;
    const noteId = normalized.slice(INTERNAL_NOTE_LINK_PREFIX.length);
    if (!noteId) return null;
    const targetNote = Database.sharedInstance().getNoteById(noteId);
    const targetTitle = targetNote ? normalizeText(targetNote.noteTitle) : "";
    return { label: targetTitle || noteId, url: `${INTERNAL_NOTE_LINK_PREFIX}${noteId}` };
  }

  function appendBlock(lines, text) {
    const normalized = normalizeText(text);
    if (!normalized) return;
    lines.push(normalized);
    lines.push("");
  }

  function buildAsset(item, noteId, assetIndex, attachmentFolderName) {
    const source = sanitizeFilePart(item.source);
    const commentIndex = item.commentIndex < 0 ? "excerpt" : item.commentIndex;
    const identity = sanitizeFilePart(item.mediaId || `asset-${assetIndex}`);
    const fileName = `${sanitizeFilePart(noteId)}-${source}-${commentIndex}-${item.sequence}-${identity}.${item.extension}`;
    return {
      kind: item.svg ? "svg" : "media",
      noteId,
      source: item.source,
      commentIndex: item.commentIndex,
      mediaId: item.mediaId,
      extension: item.extension,
      svg: item.svg,
      fileName,
      relativePath: `${attachmentFolderName}/${fileName}`,
    };
  }

  function appendTextItem(lines, item, baseHeadingLevel, options, warnings) {
    if (item.format === "html") {
      appendBlock(lines, item.text);
      return;
    }
    if (item.format === "markdown") {
      appendBlock(lines, mapMarkdownHeadings(item.text, baseHeadingLevel, warnings));
      return;
    }
    const resolvedLink = resolveNoteLink(item.text);
    if (resolvedLink) {
      lines.push(`[${resolvedLink.label}](${resolvedLink.url})`);
      lines.push("");
      return;
    }
    appendBlock(lines, item.excerpt && options.excerptStyle === "quote" ? quoteMarkdownBlock(item.text) : item.text);
  }

  function appendCardLink(lines, note, options) {
    if (!options.includeCardLinks) return;
    lines.push(`[Open in MarginNote](marginnote4app://note/${note.noteId})`);
    lines.push("");
  }

  function renderNote(card, assets, options, warnings) {
    const note = card.note;
    const content = __MN_CARD_CONTENT_SERVICE_MNCardsToMDAddon.parseNote(note, options);
    const headingLevel = options.mode === "tree" ? card.depth + 1 : 1;
    const contentHeadingBase = headingLevel;
    const lines = [`${headingPrefix(headingLevel, warnings)} ${normalizeText(note.noteTitle) || "Untitled Card"}`, ""];
    appendCardLink(lines, note, options);
    content.items.forEach(function (item) {
      if (item.type === "text") {
        appendTextItem(lines, item, contentHeadingBase, options, warnings);
        return;
      }
      const asset = buildAsset(item, content.noteId, assets.length, options.attachmentFolderName);
      assets.push(asset);
      lines.push(`![${item.alt || ""}](${asset.relativePath})`);
      lines.push("");
    });
    content.unsupportedTypes.forEach(function (type) {
      addWarning(warnings, `unsupported-comment-${type}`, `存在未支持的评论类型${type}，已跳过导出`);
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function getCardsByMode(selectionResult, mode) {
    return mode === "tree" ? selectionResult.treeCards : selectionResult.flatCards;
  }

  function buildMarkdown(selectionResult, options) {
    const normalizedOptions = normalizeOptions(options);
    const assets = [];
    const warnings = createWarningBag();
    const cards = getCardsByMode(selectionResult, normalizedOptions.mode);
    const sections = cards.map(function (card) {
      return renderNote(card, assets, normalizedOptions, warnings);
    }).filter(Boolean);
    const firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    return {
      markdown: `${sections.join("\n\n")}\n`,
      noteCount: cards.length,
      imageCount: assets.length,
      assets,
      fileBaseName: sanitizeFilePart(firstCard ? normalizeText(firstCard.noteTitle) || "cards-to-md" : "cards-to-md"),
      options: normalizedOptions,
      mode: normalizedOptions.mode,
      warnings: warnings.items,
    };
  }

  return { buildMarkdown, normalizeOptions };
})();
