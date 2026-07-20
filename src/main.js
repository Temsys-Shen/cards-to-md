JSB.require("WebDevServerConfig");
JSB.require("AddonPreferencesService");
JSB.require("CardSelectionService");
JSB.require("FreehandStrokeService");
JSB.require("InkDrawingService");
JSB.require("HtmlCompatibilityService");
JSB.require("CardContentService");
JSB.require("MarkdownExportService");
JSB.require("ExportFileService");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCardsToMDAddon");

JSB.newAddon = function (mainPath) {
  return createMNCardsToMDAddon(mainPath);
};
