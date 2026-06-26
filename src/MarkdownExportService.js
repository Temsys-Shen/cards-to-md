var __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon = (function () {
  const DEFAULT_OPTIONS = {
    includeImages: true,
    includeCardLinks: false,
    excerptStyle: "quote",
  };

  function arrayFromNSArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;

    const count = typeof value.count === "function" ? Number(value.count()) : Number(value.length || 0);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      if (typeof value.objectAtIndex === "function") {
        result.push(value.objectAtIndex(index));
      } else {
        result.push(value[index]);
      }
    }
    return result;
  }

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function escapeHeading(text) {
    return normalizeText(text).replace(/\n+/g, " ").replace(/^#+\s*/, "");
  }

  function sanitizeFilePart(value) {
    return normalizeText(value).replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-") || "unknown";
  }

  function normalizeOptions(options) {
    const source = options || {};
    return {
      includeImages: source.includeImages !== false,
      includeCardLinks: source.includeCardLinks === true,
      excerptStyle: source.excerptStyle === "plain" ? "plain" : DEFAULT_OPTIONS.excerptStyle,
    };
  }

  function quoteMarkdownBlock(text) {
    return normalizeText(text).split("\n").map(function (line) {
      return line.length > 0 ? `> ${line}` : ">";
    }).join("\n");
  }

  function buildPaintAsset(note, comment, commentIndex) {
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
      relativePath: `assets/${fileName}`,
    };
  }

  function appendTextComment(lines, comment) {
    const text = normalizeText(comment.text);
    if (!text) return;

    lines.push(text);
    lines.push("");
  }

  function appendPaintComment(lines, note, comment, commentIndex, assets) {
    const asset = buildPaintAsset(note, comment, commentIndex);
    assets.push(asset);
    lines.push(`![paint note](${asset.relativePath})`);
    lines.push("");
  }

  function appendCardLink(lines, note, options) {
    if (!options.includeCardLinks) return;
    lines.push(`[Open in MarginNote](marginnote4app://note/${note.noteId})`);
    lines.push("");
  }

  function appendExcerpt(lines, note, options) {
    const excerptText = normalizeText(note.excerptText);
    if (!excerptText) return;

    lines.push(options.excerptStyle === "quote" ? quoteMarkdownBlock(excerptText) : excerptText);
    lines.push("");
  }

  function renderNote(card, assets, options) {
    const note = card.note;
    const title = escapeHeading(note.noteTitle) || "Untitled Card";
    const lines = [`## ${title}`, ""];

    appendCardLink(lines, note, options);
    appendExcerpt(lines, note, options);

    arrayFromNSArray(note.comments).forEach(function (comment, commentIndex) {
      if (!comment || !comment.type) return;

      if (comment.type === "TextNote") {
        appendTextComment(lines, comment);
        return;
      }

      if (comment.type === "PaintNote" && options.includeImages) {
        appendPaintComment(lines, note, comment, commentIndex, assets);
      }
    });

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function buildMarkdown(cards, options) {
    const normalizedOptions = normalizeOptions(options);
    const assets = [];
    const sections = cards.map(function (card) {
      return renderNote(card, assets, normalizedOptions);
    }).filter(function (section) {
      return section.length > 0;
    });
    const firstCard = cards[0] && cards[0].note ? cards[0].note : null;
    const firstTitle = firstCard ? escapeHeading(firstCard.noteTitle) : "";

    return {
      markdown: `${sections.join("\n\n")}\n`,
      noteCount: cards.length,
      imageCount: assets.length,
      assets,
      fileBaseName: sanitizeFilePart(firstTitle || "cards-to-md"),
      options: normalizedOptions,
      warnings: [],
    };
  }

  return {
    buildMarkdown,
    normalizeOptions,
  };
})();
