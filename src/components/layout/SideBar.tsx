import { useEffect, useState } from "preact/hooks";
import type { FrpcInstance, ThemeId, ViewId, CloseBehavior } from "../../types";
import { Icon, SettingsDialog, StatusDot } from "@components/ui";

interface SideBarProps {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  frpcPath: string | null;
  theme: ThemeId;
  closeBehavior: CloseBehavior;
  onSaveFrpcPath: (path: string | null) => Promise<void>;
  onSaveTheme: (theme: ThemeId) => Promise<void>;
  onSaveCloseBehavior: (closeBehavior: CloseBehavior) => Promise<void>;
  instances: FrpcInstance[];
  promptMissingFrpcPath: boolean;
}

const NAV_ITEMS: { id: ViewId; label: string; icon: "activity" | "file" }[] = [
  { id: "run", label: "运行监控", icon: "activity" },
  { id: "config", label: "配置管理", icon: "file" },
];

export default function SideBar({
  view,
  onNavigate,
  frpcPath,
  theme,
  closeBehavior,
  onSaveFrpcPath,
  onSaveTheme,
  onSaveCloseBehavior,
  instances,
  promptMissingFrpcPath,
}: SideBarProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const hasRunning = instances.some((i) => i.status === "running");

  useEffect(() => {
    if (promptMissingFrpcPath) {
      setDialogOpen(true);
    }
  }, [promptMissingFrpcPath]);

  const handleSavePath = async (path: string) => {
    await onSaveFrpcPath(path);
  };

  const handleClearPath = async () => {
    await onSaveFrpcPath(null);
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-brand drag-region" data-tauri-drag-region>
        <span className="sidebar-brand-title">FrpcManager</span>
        <span className="sidebar-brand-tag">v3</span>
      </div>
      <div className="sidebar-group">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${view === item.id ? "is-active" : ""}`}
            onClick={() => onNavigate(item.id)}
            title={item.id === "run" ? "Ctrl+1" : "Ctrl+2"}
          >
            <span className="nav-item-icon">
              <Icon name={item.icon} />
            </span>
            {item.label}
            {item.id === "run" && hasRunning && (
              <StatusDot color="ok" className="nav-status" />
            )}
          </button>
        ))}
      </div>
      <div className="sidebar-footer">
        <div className="sidebar-version">v3.0.2-dev.1</div>
        <button
          type="button"
          className="sidebar-settings"
          onClick={() => setDialogOpen(true)}
          title="设置"
        >
          <Icon name="settings" size={14} />
        </button>
      </div>
      {dialogOpen && (
        <SettingsDialog
          frpcPath={frpcPath}
          theme={theme}
          closeBehavior={closeBehavior}
          onSaveFrpcPath={handleSavePath}
          onClearFrpcPath={handleClearPath}
          onThemeChange={onSaveTheme}
          onCloseBehaviorChange={onSaveCloseBehavior}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </nav>
  );
}
