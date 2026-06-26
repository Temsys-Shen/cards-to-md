JSB.require("WebDevServerConfig");
JSB.require("CardSelectionService");
JSB.require("MarkdownExportService");
JSB.require("ExportFileService");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCardsToMDAddon");

JSB.newAddon = function (mainPath) {
  return createMNCardsToMDAddon(mainPath);
};
