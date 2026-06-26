var __MN_EXPORT_FILE_SERVICE_MNCardsToMDAddon = (function () {
  const EXPORT_ROOT_NAME = "CardsToMD";
  const ZIP_UTI = "public.zip-archive";

  function pad(value) {
    const text = String(value);
    return text.length >= 2 ? text : `0${text}`;
  }

  function buildTimestamp() {
    const date = new Date();
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
    ].join("") + "-" + [
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join("");
  }

  function sanitizeFileBaseName(value) {
    const text = value === undefined || value === null ? "" : String(value);
    return text.replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "cards-to-md";
  }

  function detectImageExtension(data) {
    return "png";
  }

  function ensureDirectory(path) {
    const fileManager = NSFileManager.defaultManager();
    if (fileManager.fileExistsAtPath(path)) return;

    const created = fileManager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(path, true, null);
    if (!created) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }

  function writeTextFile(path, text) {
    const data = NSData.dataWithStringEncoding(text, 4);
    const written = data.writeToFileAtomically(path, true);
    if (!written) {
      throw new Error(`Failed to write markdown file: ${path}`);
    }
  }

  function writeAsset(asset, assetDir) {
    const data = Database.sharedInstance().getMediaByHash(asset.paintHash);
    if (!data) {
      throw new Error(
        `PaintNote media not found: noteId=${asset.noteId}, commentIndex=${asset.commentIndex}, paintHash=${asset.paintHash}`,
      );
    }

    const extension = detectImageExtension(data);
    const assetPath = `${assetDir}/${asset.fileName}`;
    if (!assetPath.endsWith(`.${extension}`)) {
      throw new Error(
        `PaintNote asset extension mismatch: noteId=${asset.noteId}, commentIndex=${asset.commentIndex}, paintHash=${asset.paintHash}, extension=${extension}, path=${assetPath}`,
      );
    }
    const written = data.writeToFileAtomically(assetPath, true);
    if (!written) {
      throw new Error(
        `Failed to write PaintNote media: noteId=${asset.noteId}, commentIndex=${asset.commentIndex}, paintHash=${asset.paintHash}, path=${assetPath}`,
      );
    }
  }

  function createZipFile(zipPath, sourceDir) {
    const created = ZipArchive.createZipFileAtPathWithContentsOfDirectory(zipPath, sourceDir);
    if (!created) {
      throw new Error(`Failed to create zip export: zipPath=${zipPath}, sourceDir=${sourceDir}`);
    }
  }

  function createExport(markdownResult) {
    const app = Application.sharedInstance();
    const timestamp = buildTimestamp();
    const exportDir = `${app.documentPath}/${EXPORT_ROOT_NAME}/exports/${timestamp}`;
    const assetDir = `${exportDir}/assets`;
    const markdownPath = `${exportDir}/${sanitizeFileBaseName(markdownResult.fileBaseName)}-${timestamp}.md`;
    const zipPath = `${app.documentPath}/${EXPORT_ROOT_NAME}/exports/${sanitizeFileBaseName(markdownResult.fileBaseName)}-${timestamp}.zip`;

    ensureDirectory(assetDir);
    markdownResult.assets.forEach(function (asset) {
      writeAsset(asset, assetDir);
    });
    writeTextFile(markdownPath, markdownResult.markdown);
    createZipFile(zipPath, exportDir);

    return {
      markdownPath,
      assetDir,
      zipPath,
      noteCount: markdownResult.noteCount,
      imageCount: markdownResult.imageCount,
    };
  }

  function saveExport(markdownResult) {
    const result = createExport(markdownResult);
    Application.sharedInstance().saveFileWithUti(result.zipPath, ZIP_UTI);
    return result;
  }

  return {
    saveExport,
  };
})();
