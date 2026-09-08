import { useEffect, useState } from "preact/hooks";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CloseBehavior } from "../../types";
import { Icon } from "@components/ui";

interface WindowControlsProps {
  closeBehavior: CloseBehavior;
}

/** 融入式窗口控件：最小化 / 最大化 / 关闭，贴 app-main 顶右。 */
export default function WindowControls({ closeBehavior }: WindowControlsProps) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;

    void win.isMaximized().then((m) => {
      if (!disposed) setMaximized(m);
    });

    void win.onResized(async () => {
      if (!disposed) setMaximized(await win.isMaximized());
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const win = getCurrentWindow();

  return (
    <div className="window-controls">
      <button
        type="button"
        className="window-control-btn"
        title="最小化"
        onClick={() => void win.minimize()}
      >
        <Icon name="minimize" size={10} />
      </button>
      <button
        type="button"
        className="window-control-btn"
        title={maximized ? "还原" : "最大化"}
        onClick={() => void win.toggleMaximize()}
      >
        <Icon name={maximized ? "restore" : "maximize"} size={10} />
      </button>
      <button
        type="button"
        className="window-control-btn window-control-btn-close"
        title={closeBehavior === "tray" ? "最小化到托盘" : "关闭"}
        onClick={() => void win.close()}
      >
        <Icon name="close" size={10} />
      </button>
    </div>
  );
}
