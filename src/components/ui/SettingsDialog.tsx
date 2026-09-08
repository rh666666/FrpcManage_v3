import { useState } from "preact/hooks";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeId } from "../../types";
import { THEME_OPTIONS } from "../../lib/theme";
import { Icon } from "@components/ui";
import Button from "./Button";
import Modal from "./Modal";

interface SettingsDialogProps {
  frpcPath: string | null;
  theme: ThemeId;
  onSaveFrpcPath: (path: string) => Promise<void>;
  onClearFrpcPath: () => Promise<void>;
  onThemeChange: (theme: ThemeId) => Promise<void>;
  onCancel: () => void;
}

export default function SettingsDialog({
  frpcPath,
  theme,
  onSaveFrpcPath,
  onClearFrpcPath,
  onThemeChange,
  onCancel,
}: SettingsDialogProps) {
  const [path, setPath] = useState(frpcPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const trimmed = path.trim();

  const browse = async () => {
    try {
      setPicking(true);
      setError(null);
      const result = await open({
        directory: false,
        multiple: false,
        title: "选择 frpc 可执行文件",
        filters:
          navigator.platform.toLowerCase().includes("win")
            ? [{ name: "frpc 可执行文件", extensions: ["exe"] }]
            : undefined,
      });
      if (typeof result === "string" && result) {
        setPath(result);
      }
    } catch {
      setError("打开文件选择器失败");
    } finally {
      setPicking(false);
    }
  };

  const submitPath = async () => {
    if (!trimmed) {
      setError("请输入 frpc 路径");
      return;
    }
    try {
      await onSaveFrpcPath(trimmed);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const selectTheme = async (id: ThemeId) => {
    if (id === theme || themeBusy) return;
    setThemeBusy(true);
    try {
      await onThemeChange(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setThemeBusy(false);
    }
  };

  return (
    <Modal
      title="设置"
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>关闭</Button>
          {frpcPath && (
            <Button
              variant="danger"
              onClick={() => {
                onClearFrpcPath().catch((e) => setError(e instanceof Error ? e.message : String(e)));
              }}
            >
              清除路径
            </Button>
          )}
          <Button variant="primary" disabled={!trimmed} onClick={submitPath}>
            保存路径
          </Button>
        </>
      }
    >
      <div className="settings-section">
        <div className="settings-section-title">frpc 路径</div>
        <div className="frpc-path-row">
          <input
            className="field-input modal-input"
            value={path}
            placeholder="例如：C:\tools\frp\frpc.exe"
            onChange={(e) => {
              setPath((e.target as HTMLInputElement).value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed) void submitPath();
            }}
          />
          <Button onClick={browse} disabled={picking}>
            {picking ? "选择中…" : "浏览"}
          </Button>
        </div>
      </div>
      <div className="settings-section">
        <button
          type="button"
          className="settings-section-toggle"
          onClick={() => setAppearanceOpen(!appearanceOpen)}
        >
          <span className="settings-section-caret">
            <Icon name={appearanceOpen ? "chevron-up" : "chevron-down"} />
          </span>
          <span className="settings-section-title">外观</span>
        </button>
        {appearanceOpen && (
          <div className="theme-list">
            {THEME_OPTIONS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-item ${theme === t.id ? "is-active" : ""}`}
                disabled={themeBusy}
                onClick={() => selectTheme(t.id)}
              >
                <span className="theme-item-label">{t.label}</span>
                <span className="theme-item-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}
