import { useState } from "preact/hooks";
import { open } from "@tauri-apps/plugin-dialog";
import type { ThemeId, CloseBehavior } from "../../types";
import { THEME_OPTIONS } from "../../lib/theme";
import Button from "./Button";
import Modal from "./Modal";

interface SettingsDialogProps {
  frpcPath: string | null;
  theme: ThemeId;
  closeBehavior: CloseBehavior;
  onSaveFrpcPath: (path: string) => Promise<void>;
  onClearFrpcPath: () => Promise<void>;
  onThemeChange: (theme: ThemeId) => Promise<void>;
  onCloseBehaviorChange: (closeBehavior: CloseBehavior) => Promise<void>;
  onCancel: () => void;
}

const CLOSE_BEHAVIOR_OPTIONS: { id: CloseBehavior; label: string; desc: string }[] = [
  { id: "quit", label: "退出应用", desc: "结束 frpc 并退出" },
  { id: "tray", label: "最小化到托盘", desc: "隐藏窗口，frpc 继续运行" },
];

export default function SettingsDialog({
  frpcPath,
  theme,
  closeBehavior,
  onSaveFrpcPath,
  onClearFrpcPath,
  onThemeChange,
  onCloseBehaviorChange,
  onCancel,
}: SettingsDialogProps) {
  const [path, setPath] = useState(frpcPath ?? "");
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const [closeBehaviorBusy, setCloseBehaviorBusy] = useState(false);

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

  const selectCloseBehavior = async (id: CloseBehavior) => {
    if (id === closeBehavior || closeBehaviorBusy) return;
    setCloseBehaviorBusy(true);
    try {
      await onCloseBehaviorChange(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCloseBehaviorBusy(false);
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
        <div className="settings-section-title">外观</div>
        <select
          className="field-input field-select"
          value={theme}
          disabled={themeBusy}
          title={THEME_OPTIONS.find((t) => t.id === theme)?.desc}
          onChange={(e) => {
            const next = THEME_OPTIONS.find((t) => t.id === (e.target as HTMLSelectElement).value);
            if (next) void selectTheme(next.id);
          }}
        >
          {THEME_OPTIONS.map((t) => (
            <option key={t.id} value={t.id} title={t.desc}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="settings-section">
        <div className="settings-section-title">关闭窗口时</div>
        <select
          className="field-input field-select"
          value={closeBehavior}
          disabled={closeBehaviorBusy}
          title={CLOSE_BEHAVIOR_OPTIONS.find((opt) => opt.id === closeBehavior)?.desc}
          onChange={(e) => {
            const next = CLOSE_BEHAVIOR_OPTIONS.find(
              (opt) => opt.id === (e.target as HTMLSelectElement).value,
            );
            if (next) void selectCloseBehavior(next.id);
          }}
        >
          {CLOSE_BEHAVIOR_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id} title={opt.desc}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}
