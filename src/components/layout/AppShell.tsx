import { useEffect } from "preact/hooks";
import type { FrpcInstance, ThemeId, ViewId, CloseBehavior } from "../../types";
import SideBar from "./SideBar";
import WindowControls from "./WindowControls";
import RunView from "../run/RunView";
import ConfigView from "../config/ConfigView";

interface AppShellProps {
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

export default function AppShell({
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
}: AppShellProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
        return;
      }
      if (e.key === "1") {
        e.preventDefault();
        onNavigate("run");
      } else if (e.key === "2") {
        e.preventDefault();
        onNavigate("config");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNavigate]);

  return (
    <div className="app">
      <SideBar
        view={view}
        onNavigate={onNavigate}
        frpcPath={frpcPath}
        theme={theme}
        closeBehavior={closeBehavior}
        onSaveFrpcPath={onSaveFrpcPath}
        onSaveTheme={onSaveTheme}
        onSaveCloseBehavior={onSaveCloseBehavior}
        instances={instances}
        promptMissingFrpcPath={promptMissingFrpcPath}
      />
      <div className="app-main-wrap">
        <WindowControls closeBehavior={closeBehavior} />
        <main className="app-main">
          {view === "run" ? <RunView instances={instances} frpcPath={frpcPath} /> : <ConfigView />}
        </main>
      </div>
    </div>
  );
}
