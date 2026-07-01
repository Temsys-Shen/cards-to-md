var __MN_ADDON_PREFERENCES_SERVICE_MNCardsToMDAddon = (function () {
  const ATTACHMENT_FOLDER_NAME_KEY = "mn_web_template_mncardstomdaddon_attachment_folder_name";
  const DEFAULT_ATTACHMENT_FOLDER_NAME = "assets";

  function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  }

  function getDefaults() {
    return NSUserDefaults.standardUserDefaults();
  }

  function validateAttachmentFolderName(value) {
    const text = normalizeText(value).replace(/\\/g, "/");
    if (!text) {
      throw new Error("附件目录不能为空");
    }
    if (text.indexOf(":") >= 0) {
      throw new Error("附件目录不能包含冒号");
    }

    const segments = text.split("/");
    if (segments.some(function (segment) {
      return segment.length === 0;
    })) {
      throw new Error("附件目录不能包含连续的 /");
    }
    if (segments.some(function (segment) {
      return segment === "." || segment === "..";
    })) {
      throw new Error("附件目录不能包含 . 或 ..");
    }

    return segments.join("/");
  }

  function getAttachmentFolderName() {
    const stored = getDefaults().objectForKey(ATTACHMENT_FOLDER_NAME_KEY);
    if (stored === undefined || stored === null || String(stored).trim().length === 0) {
      return DEFAULT_ATTACHMENT_FOLDER_NAME;
    }
    return validateAttachmentFolderName(stored);
  }

  function setAttachmentFolderName(value) {
    const normalized = validateAttachmentFolderName(value);
    getDefaults().setObjectForKey(normalized, ATTACHMENT_FOLDER_NAME_KEY);
    return normalized;
  }

  return {
    DEFAULT_ATTACHMENT_FOLDER_NAME,
    getAttachmentFolderName,
    setAttachmentFolderName,
    validateAttachmentFolderName,
  };
})();
