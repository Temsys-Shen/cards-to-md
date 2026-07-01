var __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon = (function () {
  const DEFAULT_OPTIONS = {
    includeImages: true,
    includeCardLinks: false,
    excerptStyle: "quote",
    mode: "flat",
    attachmentFolderName: "assets",
  };
  const INTERNAL_NOTE_LINK_PREFIX = "marginnote4app://note/";

  function arrayFromNSArray(value) {
    return __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon.arrayFromNSArray(value);
  }

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

  function buildPaintAsset(note, comment, commentIndex, attachmentFolderName) {
    const paintHash = comment.paint;
    if (!paintHash) {
      throw new Error(`PaintNote missing paint hash: noteId=${note.noteId}, commentIndex=${commentIndex}`);
    }

    const fileName = `${sanitizeFilePart(note.noteId)}-${commentIndex}-${sanitizeFilePart(paintHash)}.png`;
    return {
      noteId: note.noteId,
      commentIndex,
      paintHash,
      fileName,
      relativePath: `${attachmentFolderName}/${fileName}`,
    };
  }

  function createWarningBag() {
    return {
      items: [],
      keys: {},
    };
  }

  function addWarning(warnings, key, message) {
    if (warnings.keys[key]) return;
    warnings.keys[key] = true;
    warnings.items.push(message);
  }

  function headingPrefix(level, warnings) {
    if (level <= 6) {
      return "#".repeat(level);
    }
    addWarning(
      warnings,
      `heading-clamped-${level}`,
      `存在超过6级的标题层级，已截断到Markdown的6级标题上限`,
    );
    return "######";
  }

  function mapMarkdownHeadings(text, baseHeadingLevel, warnings) {
    const normalized = normalizeText(text);
    if (!normalized) return "";

    return normalized.split("\n").map(function (line) {
      const match = /^(#{1,6})\s+(.*)$/.exec(line);
      if (!match) {
        return line;
      }

      const nestedLevel = baseHeadingLevel + match[1].length;
      return `${headingPrefix(nestedLevel, warnings)} ${match[2]}`;
    }).join("\n");
  }

  function resolveNoteLink(commentText) {
    const text = normalizeText(commentText);
    if (!text.startsWith(INTERNAL_NOTE_LINK_PREFIX)) return null;

    const noteId = text.slice(INTERNAL_NOTE_LINK_PREFIX.length);
    if (!noteId) return null;

    const targetNote = Database.sharedInstance().getNoteById(noteId);
    const targetTitle = targetNote ? normalizeText(targetNote.noteTitle) : "";
    return {
      noteId,
      label: targetTitle || noteId,
      url: `${INTERNAL_NOTE_LINK_PREFIX}${noteId}`,
    };
  }

  function appendBlock(lines, text) {
    const normalized = normalizeText(text);
    if (!normalized) return;
    lines.push(normalized);
    lines.push("");
  }

  function appendTextComment(lines, comment, baseHeadingLevel, warnings) {
    const text = normalizeText(comment.text);
    if (!text) return;

    const resolvedLink = resolveNoteLink(text);
    if (resolvedLink) {
      lines.push(`[${resolvedLink.label}](${resolvedLink.url})`);
      lines.push("");
      return;
    }

    if (comment.markdown === true) {
      appendBlock(lines, mapMarkdownHeadings(text, baseHeadingLevel, warnings));
      return;
    }

    appendBlock(lines, text);
  }

  function appendPaintComment(lines, note, comment, commentIndex, assets, options) {
    const asset = buildPaintAsset(note, comment, commentIndex, options.attachmentFolderName);
    assets.push(asset);
    lines.push(`![paint note](${asset.relativePath})`);
    lines.push("");
  }

  function appendCardLink(lines, note, options) {
    if (!options.includeCardLinks) return;
    lines.push(`[Open in MarginNote](marginnote4app://note/${note.noteId})`);
    lines.push("");
  }

  function appendExcerpt(lines, note, options, baseHeadingLevel, warnings) {
    const excerptText = normalizeText(note.excerptText);
    if (!excerptText) return;

    if (Number(note.excerptTextMarkdown) === 1) {
      appendBlock(lines, mapMarkdownHeadings(excerptText, baseHeadingLevel, warnings));
      return;
    }

    lines.push(options.excerptStyle === "quote" ? quoteMarkdownBlock(excerptText) : excerptText);
    lines.push("");
  }

  function renderNote(card, assets, options, warnings) {
    const note = card.note;
    const titleText = normalizeText(note.noteTitle) || "Untitled Card";
    const headingLevel = options.mode === "tree" ? card.depth + 1 : 2;
    const contentHeadingBase = options.mode === "tree" ? headingLevel : 2;
    const lines = [`${headingPrefix(headingLevel, warnings)} ${titleText}`, ""];

    appendCardLink(lines, note, options);
    appendExcerpt(lines, note, options, contentHeadingBase, warnings);

    arrayFromNSArray(note.comments).forEach(function (comment, commentIndex) {
      if (!comment || !comment.type) return;

      if (comment.type === "TextNote") {
        appendTextComment(lines, comment, contentHeadingBase, warnings);
        return;
      }

      if (comment.type === "PaintNote") {
        if (options.includeImages) {
          appendPaintComment(lines, note, comment, commentIndex, assets, options);
        }
        return;
      }

      addWarning(
        warnings,
        `unsupported-comment-${comment.type}`,
        `存在未支持的评论类型${comment.type}，已跳过导出`,
      );
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function getCardsByMode(selectionResult, mode) {
    if (mode === "tree") {
      return selectionResult.treeCards;
    }
    return selectionResult.flatCards;
  }

  function buildMarkdown(selectionResult, options) {
    const normalizedOptions = normalizeOptions(options);
    const assets = [];
    const warnings = createWarningBag();
    const cards = getCardsByMode(selectionResult, normalizedOptions.mode);
    const sections = cards.map(function (card) {
      return renderNote(card, assets, normalizedOptions, warnings);
    }).filter(function (section) {
      return section.length > 0;
    });
    const firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    const firstTitle = firstCard ? normalizeText(firstCard.noteTitle) : "";

    return {
      markdown: `${sections.join("\n\n")}\n`,
      noteCount: cards.length,
      imageCount: assets.length,
      assets,
      fileBaseName: sanitizeFilePart(firstTitle || "cards-to-md"),
      options: normalizedOptions,
      mode: normalizedOptions.mode,
      warnings: warnings.items,
    };
  }

  return {
    buildMarkdown,
    normalizeOptions,
  };
})();
