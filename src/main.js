JSB.require("WebDevServerConfig");
JSB.require("WebBridgeCommands");
JSB.require("WebPanelController");
JSB.require("MNCardsToMDAddon");

JSB.newAddon = function (mainPath) {
  return createMNCardsToMDAddon(mainPath);
};
