function createMNCardsToMDAddon(mainPath) {
  return JSB.defineClass("MNCardsToMDAddon : JSExtension", {
    sceneWillConnect: function () {
      self.mainPath = mainPath;
      self.webController = __MN_WEB_API_MNCardsToMDAddon.createController(
        mainPath,
        self,
      );

      self.layoutViewController = function () {
        __MN_WEB_API_MNCardsToMDAddon.ensureLayout(self.webController);
      };

      console.log("[Cards To MD] initialized");
    },

    sceneDidDisconnect: function () {
      if (
        self.webController &&
        self.webController.view &&
        self.webController.view.superview
      ) {
        self.webController.view.removeFromSuperview();
      }
      self.webController = null;
      console.log("[Cards To MD] disconnected");
    },

    notebookWillOpen: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      self.webController.addon = self;
      self.webController.addonWindow = self.window;

      if (__MN_WEB_API_MNCardsToMDAddon.shouldRestorePanel()) {
        __MN_WEB_API_MNCardsToMDAddon.showPanel(self.webController);
        self.layoutViewController();
      }
    },

    controllerWillLayoutSubviews: function (controller) {
      if (
        controller === Application.sharedInstance().studyController(self.window)
      ) {
        self.layoutViewController();
      }
    },

    queryAddonCommandStatus: function () {
      const checked =
        self.webController &&
        self.webController.view &&
        self.webController.view.window
          ? true
          : false;

      return {
        image: "icon.png",
        object: self,
        selector: "toggleWebPanel:",
        checked,
      };
    },

    toggleWebPanel: function () {
      if (!self.webController) {
        throw new Error("webController not initialized");
      }

      if (self.webController.view && self.webController.view.window) {
        __MN_WEB_API_MNCardsToMDAddon.hidePanel(self.webController);
      } else {
        __MN_WEB_API_MNCardsToMDAddon.showPanel(self.webController);
        self.layoutViewController();
      }

      Application.sharedInstance()
        .studyController(self.window)
        .refreshAddonCommands();
    },
  });
}
