var __MN_WEB_BRIDGE_COMMANDS_MNCardsToMDAddon = (function () {
  function toBridgePayload(value) {
    return value === undefined ? null : value;
  }

  function ping(context, payload) {
    return {
      now: new Date().toISOString(),
      source: "mn-addon",
      payload: toBridgePayload(payload),
      addon: context.addon && context.addon.window ? "available" : "unavailable",
    };
  }

  function echo(context, payload) {
    return {
      echoed: toBridgePayload(payload),
    };
  }

  function closePanel(context, payload) {
    context.closePanel(context.controller);
    return {
      closed: true,
      payload: toBridgePayload(payload),
    };
  }

  function buildSelectedCardsMarkdown(context) {
    const cards = __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon.getSelectedCards(context);
    return __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(cards, context.payload);
  }

  function optionsKey(payload) {
    return JSON.stringify(__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.normalizeOptions(payload));
  }

  function previewSelectedCardsMarkdown(context, payload) {
    context.payload = payload || {};
    const result = buildSelectedCardsMarkdown(context);
    if (context.addon) {
      context.addon._cardsToMDPreviewSnapshot = {
        optionsKey: optionsKey(payload),
        result,
      };
    }
    return {
      markdown: result.markdown,
      noteCount: result.noteCount,
      imageCount: result.imageCount,
      fileBaseName: result.fileBaseName,
      warnings: result.warnings,
    };
  }

  function saveMarkdownExport(context, payload) {
    const currentOptionsKey = optionsKey(payload);
    const snapshot = context.addon ? context.addon._cardsToMDPreviewSnapshot : null;
    if (!snapshot) {
      throw new Error("请先刷新预览");
    }
    if (snapshot.optionsKey !== currentOptionsKey) {
      throw new Error("导出选项已改变，请重新刷新预览");
    }

    return __MN_EXPORT_FILE_SERVICE_MNCardsToMDAddon.saveExport(snapshot.result);
  }

  const commands = {
    ping,
    echo,
    closePanel,
    previewSelectedCardsMarkdown,
    saveMarkdownExport,
  };

  return {
    commands,
  };
})();
