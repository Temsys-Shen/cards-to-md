import { useEffect, useRef, useState } from "react";
import MNBridge from "../lib/mnBridge";

const excerptStyleOptions = [
  { label: "引用块", value: "quote" },
  { label: "原文", value: "plain" },
];

const modeOptions = [
  { label: "flat", value: "flat" },
  { label: "tree", value: "tree" },
];

function normalizeBridgeError(error) {
  if (!error) return "Unknown bridge error";
  if (typeof error === "string") return error;
  return error.message || JSON.stringify(error);
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" className="tool-icon" focusable="false" viewBox="0 0 16 16">
      <path d="M2.75 3.25h10.5v9.5H2.75z" />
      <path d="m3.4 11.1 2.8-3.05 2.05 2.1 1.55-1.7 2.8 2.65" />
      <circle cx="10.9" cy="5.6" r="1" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" className="tool-icon" focusable="false" viewBox="0 0 16 16">
      <path d="M6.55 10.05 5.7 10.9a2.5 2.5 0 0 1-3.55-3.52l1.9-1.9a2.5 2.5 0 0 1 3.55 0" />
      <path d="m5.8 8.15 2.35-2.35" />
      <path d="m9.45 5.95.85-.85a2.5 2.5 0 0 1 3.55 3.52l-1.9 1.9a2.5 2.5 0 0 1-3.55 0" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" className="action-icon" focusable="false" viewBox="0 0 16 16">
      <path d="M12.75 6.15A5 5 0 1 0 13 8" />
      <path d="M12.85 2.95v3.2h-3.2" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden="true" className="action-icon" focusable="false" viewBox="0 0 16 16">
      <path d="M8 2.5v7" />
      <path d="m5.25 6.9 2.75 2.75 2.75-2.75" />
      <path d="M3.25 9.5v3.25h9.5V9.5" />
    </svg>
  );
}

function SegmentControl({ label, options, value, onChange }) {
  return (
    <div className="control-group" role="radiogroup" aria-label={label}>
      <div className="segment-control">
        {options.map((option) => (
          <button
            aria-checked={value === option.value}
            className="segment-button"
            key={option.value}
            onClick={() => {
              if (value !== option.value) {
                onChange(option.value);
              }
            }}
            role="radio"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolToggle({ icon, label, pressed, onClick }) {
  return (
    <button aria-pressed={pressed} className="tool-toggle" onClick={onClick} type="button">
      {icon}
      <span>{label}</span>
      <span className="tool-dot" />
    </button>
  );
}

function StatusActionButton({ children, disabled, icon, onClick, primary }) {
  return (
    <button
      className={primary ? "status-action status-action-primary" : "status-action"}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span>{children}</span>
    </button>
  );
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
  const [mode, setMode] = useState("flat");
  const [attachmentFolderName, setAttachmentFolderName] = useState("assets");
  const [previewReady, setPreviewReady] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [statusOpen, setStatusOpen] = useState(false);
  const attachmentPreviewTimerRef = useRef(null);
  const previewRequestIdRef = useRef(0);

  useEffect(() => {
    let alive = true;

    async function loadPreferences() {
      try {
        const result = await MNBridge.send("getExportPreferences");
        if (!alive || !result) return;
        if (typeof result.attachmentFolderName === "string" && result.attachmentFolderName.length > 0) {
          setAttachmentFolderName(result.attachmentFolderName);
        }
      } catch (error) {
        if (!alive) return;
        setStatus(normalizeBridgeError(error));
      }
    }

    loadPreferences();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (attachmentPreviewTimerRef.current) {
        clearTimeout(attachmentPreviewTimerRef.current);
      }
      previewRequestIdRef.current += 1;
    },
    [],
  );

  const buildOptions = (overrides = {}) => ({
    includeImages,
    includeCardLinks,
    excerptStyle,
    mode,
    attachmentFolderName,
    ...overrides,
  });

  const clearAttachmentPreviewTimer = () => {
    if (attachmentPreviewTimerRef.current) {
      clearTimeout(attachmentPreviewTimerRef.current);
      attachmentPreviewTimerRef.current = null;
    }
  };

  const previewWithOptions = async (nextOptions) => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;

    try {
      setLoading(true);
      setPreviewReady(false);
      setStatus("正在读取选中卡片...");
      const result = await MNBridge.send("previewSelectedCardsMarkdown", nextOptions);
      if (requestId !== previewRequestIdRef.current) return;
      setMarkdown(result.markdown || "");
      setNoteCount(result.noteCount || 0);
      setImageCount(result.imageCount || 0);
      setWarnings(Array.isArray(result.warnings) ? result.warnings : []);
      setPreviewReady(true);
      if (typeof result.attachmentFolderName === "string" && result.attachmentFolderName.length > 0) {
        setAttachmentFolderName(result.attachmentFolderName);
      }
      setStatus(
        `当前预览已更新。模式:${result.mode || nextOptions.mode}，附件目录:${result.attachmentFolderName || nextOptions.attachmentFolderName}`,
      );
    } catch (error) {
      if (requestId !== previewRequestIdRef.current) return;
      setPreviewReady(false);
      setWarnings([]);
      setStatusOpen(true);
      setStatus(normalizeBridgeError(error));
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const preview = () => {
    clearAttachmentPreviewTimer();
    previewWithOptions(buildOptions());
  };

  const applyOptions = (nextOptions) => {
    setIncludeImages(nextOptions.includeImages);
    setIncludeCardLinks(nextOptions.includeCardLinks);
    setExcerptStyle(nextOptions.excerptStyle);
    setMode(nextOptions.mode);
    setAttachmentFolderName(nextOptions.attachmentFolderName);
  };

  const updateOptionsAndPreview = (overrides) => {
    clearAttachmentPreviewTimer();
    const nextOptions = buildOptions(overrides);
    applyOptions(nextOptions);
    previewWithOptions(nextOptions);
  };

  const updateAttachmentFolderName = (nextAttachmentFolderName) => {
    const nextOptions = buildOptions({
      attachmentFolderName: nextAttachmentFolderName,
    });
    setAttachmentFolderName(nextAttachmentFolderName);
    setPreviewReady(false);
    setStatus("正在更新预览...");
    clearAttachmentPreviewTimer();
    attachmentPreviewTimerRef.current = setTimeout(() => {
      attachmentPreviewTimerRef.current = null;
      previewWithOptions(nextOptions);
    }, 500);
  };

  const save = async () => {
    try {
      setLoading(true);
      setStatus("正在保存ZIP...");
      const result = await MNBridge.send("saveMarkdownExport", buildOptions());
      setNoteCount(result.noteCount || 0);
      setImageCount(result.imageCount || 0);
      setPreviewReady(false);
      setWarnings([]);
      setStatus(`已保存：${result.zipPath}`);
      if (result && result.closePanelAfterResponse) {
        MNBridge.send("closePanel").catch(() => {});
      }
    } catch (error) {
      setPreviewReady(false);
      setWarnings([]);
      setStatusOpen(true);
      setStatus(normalizeBridgeError(error));
    } finally {
      setLoading(false);
    }
  };

  const persistAttachmentFolderName = async (nextAttachmentFolderName) => {
    const hadPendingPreview = Boolean(attachmentPreviewTimerRef.current);
    clearAttachmentPreviewTimer();
    try {
      const result = await MNBridge.send("setExportPreferences", {
        attachmentFolderName: nextAttachmentFolderName,
      });
      if (result && typeof result.attachmentFolderName === "string" && result.attachmentFolderName.length > 0) {
        const normalizedAttachmentFolderName = result.attachmentFolderName;
        setAttachmentFolderName(normalizedAttachmentFolderName);
        if (hadPendingPreview || normalizedAttachmentFolderName !== nextAttachmentFolderName) {
          previewWithOptions(
            buildOptions({
              attachmentFolderName: normalizedAttachmentFolderName,
            }),
          );
        }
      }
    } catch (error) {
      setPreviewReady(false);
      setStatusOpen(true);
      setStatus(normalizeBridgeError(error));
    }
  };

  const toggleStatusOpen = () => {
    setStatusOpen((current) => !current);
  };

  return (
    <section className="export-panel">
      <div className="top-rail">
        <ToolToggle
          icon={<ImageIcon />}
          label="图片"
          onClick={() =>
            updateOptionsAndPreview({
              includeImages: !includeImages,
            })
          }
          pressed={includeImages}
        />
        <ToolToggle
          icon={<LinkIcon />}
          label="链接"
          onClick={() =>
            updateOptionsAndPreview({
              includeCardLinks: !includeCardLinks,
            })
          }
          pressed={includeCardLinks}
        />
        <SegmentControl
          label="摘录"
          onChange={(nextExcerptStyle) =>
            updateOptionsAndPreview({
              excerptStyle: nextExcerptStyle,
            })
          }
          options={excerptStyleOptions}
          value={excerptStyle}
        />
        <SegmentControl
          label="结构"
          onChange={(nextMode) =>
            updateOptionsAndPreview({
              mode: nextMode,
            })
          }
          options={modeOptions}
          value={mode}
        />
        <label className="attachment-folder-field">
          <input
            aria-label="附件目录"
            className="text-input"
            onBlur={(event) => persistAttachmentFolderName(event.target.value)}
            onChange={(event) => updateAttachmentFolderName(event.target.value)}
            placeholder="附件目录"
            type="text"
            value={attachmentFolderName}
          />
        </label>
      </div>
      <div className="preview-stage">
        <textarea
          aria-label="Markdown preview"
          className="markdown-preview"
          readOnly
          spellCheck={false}
          value={markdown}
        />
        {statusOpen ? (
          <div className="status-drawer" id="export-status-panel" role="status">
            <div className="status-line">{status}</div>
            {warnings.map((warning) => (
              <div className="status-warning" key={warning}>
                {warning}
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="bottom-status-bar">
        <button
          aria-controls="export-status-panel"
          aria-expanded={statusOpen}
          className="status-summary-button"
          data-has-warnings={warnings.length > 0 ? "true" : "false"}
          onClick={toggleStatusOpen}
          title={status}
          type="button"
        >
          {noteCount}卡/{imageCount}图/{mode}/警告{warnings.length}
        </button>
        <div className="status-message" title={status}>
          {status}
        </div>
        <div className="status-actions">
          <StatusActionButton disabled={loading} icon={<RefreshIcon />} onClick={preview}>
            刷新
          </StatusActionButton>
          <StatusActionButton
            disabled={loading || !previewReady || markdown.length === 0}
            icon={<ExportIcon />}
            onClick={save}
            primary
          >
            导出
          </StatusActionButton>
        </div>
      </div>
    </section>
  );
}

export default HomePage;
