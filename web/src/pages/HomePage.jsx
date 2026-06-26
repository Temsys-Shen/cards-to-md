import { useState } from "react";
import MNBridge from "../lib/mnBridge";

function normalizeBridgeError(error) {
  if (!error) return "Unknown bridge error";
  if (typeof error === "string") return error;
  return error.message || JSON.stringify(error);
}

function HomePage() {
  const [markdown, setMarkdown] = useState("");
  const [noteCount, setNoteCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [status, setStatus] = useState("在脑图中选中卡片后刷新预览。");
  const [loading, setLoading] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeCardLinks, setIncludeCardLinks] = useState(false);
  const [excerptStyle, setExcerptStyle] = useState("quote");
  const [previewReady, setPreviewReady] = useState(false);

  const buildOptions = () => ({
    includeImages,
    includeCardLinks,
    excerptStyle,
  });

  const markPreviewStale = (update) => (value) => {
    update(value);
    setPreviewReady(false);
    setStatus("选项已改变，请刷新预览。");
  };

  const preview = async () => {
    try {
      setLoading(true);
      setStatus("正在读取选中卡片...");
      const result = await MNBridge.send("previewSelectedCardsMarkdown", buildOptions());
      setMarkdown(result.markdown || "");
      setNoteCount(result.noteCount || 0);
      setImageCount(result.imageCount || 0);
      setPreviewReady(true);
      setStatus("当前预览已更新。");
    } catch (error) {
      setPreviewReady(false);
      setStatus(normalizeBridgeError(error));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    try {
      setLoading(true);
      setStatus("正在保存ZIP...");
      const result = await MNBridge.send("saveMarkdownExport", buildOptions());
      setNoteCount(result.noteCount || 0);
      setImageCount(result.imageCount || 0);
      setStatus(`已保存：${result.zipPath}`);
    } catch (error) {
      setStatus(normalizeBridgeError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="export-panel">
      <div className="toolbar">
        <div className="stats" aria-live="polite">
          <span>{noteCount}张卡片</span>
          <span>{imageCount}张图片</span>
        </div>
        <div className="actions">
          <button disabled={loading} onClick={preview} type="button">
            刷新预览
          </button>
          <button disabled={loading || !previewReady || markdown.length === 0} onClick={save} type="button">
            保存ZIP
          </button>
        </div>
      </div>
      <div className="options">
        <label>
          <input
            checked={includeImages}
            onChange={(event) => markPreviewStale(setIncludeImages)(event.target.checked)}
            type="checkbox"
          />
          图片
        </label>
        <label>
          <input
            checked={includeCardLinks}
            onChange={(event) => markPreviewStale(setIncludeCardLinks)(event.target.checked)}
            type="checkbox"
          />
          卡片链接
        </label>
        <label>
          摘录
          <select value={excerptStyle} onChange={(event) => markPreviewStale(setExcerptStyle)(event.target.value)}>
            <option value="quote">引用块</option>
            <option value="plain">原文</option>
          </select>
        </label>
      </div>
      <textarea
        aria-label="Markdown preview"
        className="markdown-preview"
        readOnly
        spellCheck={false}
        value={markdown}
      />
      <div className="status" title={status}>
        {status}
      </div>
    </section>
  );
}

export default HomePage;
