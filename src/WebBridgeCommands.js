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

  function getExportPreferences() {
    return {
      attachmentFolderName: __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon.getAttachmentFolderName(),
    };
  }

  function setExportPreferences(context, payload) {
    if (!payload || typeof payload !== "object") {
      throw new Error("偏好设置参数缺失");
    }

    return {
      attachmentFolderName: __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon.setAttachmentFolderName(
        payload.attachmentFolderName,
      ),
    };
  }

  function buildSelectedCardsMarkdown(context, payload) {
    const selection = __MN_CARD_SELECTION_SERVICE_MNCardsToMDAddon.getSelectedCards(context);
    return __MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.buildMarkdown(selection, payload);
  }

  function optionsKey(payload) {
    return JSON.stringify(__MN_MARKDOWN_EXPORT_SERVICE_MNCardsToMDAddon.normalizeOptions(payload));
  }

  function previewSelectedCardsMarkdown(context, payload) {
    const normalizedPayload = payload || {};
    const savedAttachmentFolderName = __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon.setAttachmentFolderName(
      normalizedPayload.attachmentFolderName,
    );
    const finalPayload = {
      includeImages: normalizedPayload.includeImages,
      includeCardLinks: normalizedPayload.includeCardLinks,
      excerptStyle: normalizedPayload.excerptStyle,
      mode: normalizedPayload.mode,
      attachmentFolderName: savedAttachmentFolderName,
    };
    const result = buildSelectedCardsMarkdown(context, finalPayload);
    if (context.addon) {
      context.addon._cardsToMDPreviewSnapshot = {
        optionsKey: optionsKey(finalPayload),
        result,
      };
    }
    return {
      markdown: result.markdown,
      noteCount: result.noteCount,
      imageCount: result.imageCount,
      fileBaseName: result.fileBaseName,
      mode: result.mode,
      attachmentFolderName: result.options.attachmentFolderName,
      warnings: result.warnings,
    };
  }

  function saveMarkdownExport(context, payload) {
    const normalizedPayload = payload || {};
    const currentOptionsKey = optionsKey(normalizedPayload);
    const snapshot = context.addon ? context.addon._cardsToMDPreviewSnapshot : null;
    if (!snapshot) {
      throw new Error("请先刷新预览");
    }
    if (snapshot.optionsKey !== currentOptionsKey) {
      throw new Error("导出选项已改变，请重新刷新预览");
    }

    const result = __MN_EXPORT_FILE_SERVICE_MNCardsToMDAddon.saveExport(snapshot.result);
    return {
      markdownPath: result.markdownPath,
      assetDir: result.assetDir,
      zipPath: result.zipPath,
      noteCount: result.noteCount,
      imageCount: result.imageCount,
      closePanelAfterResponse: true,
    };
  }

  const commands = {
    ping,
    echo,
    closePanel,
    getExportPreferences,
    setExportPreferences,
    previewSelectedCardsMarkdown,
    saveMarkdownExport,
  };

  return {
    commands,
  };
})();
