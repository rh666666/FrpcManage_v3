import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import "../../styles/index.scss";
import type { FrpcInstance, InstanceStatus } from "../../types";
import { Icon, StatusDot, type StatusColor } from "@components/ui";
import { processApi, settingsApi, trayApi } from "../../lib/tauri";
import { applyTheme, normalizeTheme } from "../../lib/theme";

/** 面板四周留出的透明边距（CSS px），给 CSS 阴影用；Rust 侧据此换算锚点偏移。
 *  必须 ≥ _tray-menu.scss 里 .tray-panel 阴影的 blur + offset，否则阴影会被窗口边缘裁掉。 */
const INSET = 10;
/** Rust 未给出可用高度时的兜底值（CSS px）。 */
const FALLBACK_MAX_HEIGHT = 420;

const STATUS_TEXT: Record<InstanceStatus, string> = {
  running: "运行中",
  stopped: "已停止",
  error: "异常",
};

const STATUS_COLOR: Record<InstanceStatus, StatusColor> = {
  running: "ok",
  stopped: "muted",
  error: "err",
};

/** `tray-menu-open` 事件载荷。 */
interface OpenPayload {
  maxHeight: number;
}

/** 键盘与鼠标共用的动作序列：实例行 + 底部命令，顺序必须与渲染顺序一致。 */
interface MenuAction {
  disabled: boolean;
  run: () => void;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 托盘弹出的快捷菜单：同一份前端产物，按 #tray 分流渲染。 */
export default function TrayMenu() {
  const [instances, setInstances] = useState<FrpcInstance[]>([]);
  const [maxHeight, setMaxHeight] = useState(FALLBACK_MAX_HEIGHT);
  const [session, setSession] = useState(0);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<MenuAction[]>([]);

  const runningCount = instances.filter((i) => i.status === "running").length;

  const toggleInstance = async (inst: FrpcInstance) => {
    if (busyId === inst.id) return;
    setBusyId(inst.id);
    setError(null);
    try {
      const next =
        inst.status === "running"
          ? await processApi.stop(inst.id)
          : await processApi.start(inst.id);
      setInstances((prev) => prev.map((i) => (i.id === next.id ? next : i)));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  const stopAll = async () => {
    setError(null);
    try {
      setInstances(await processApi.stopAll());
    } catch (e) {
      setError(errText(e));
    }
  };

  // 打开菜单：重新取设置与实例（主题可能刚改过），再测量尺寸交给 Rust 摆位
  useEffect(() => {
    const unlisten = listen<OpenPayload>("tray-menu-open", (event) => {
      setError(null);
      setActiveIndex(-1);
      setBusyId(null);
      setShown(false);
      setMaxHeight(event.payload.maxHeight || FALLBACK_MAX_HEIGHT);
      Promise.all([settingsApi.get(), processApi.list()])
        .then(([settings, list]) => {
          applyTheme(normalizeTheme(settings.theme));
          setInstances(list);
        })
        .catch((e) => {
          setError(errText(e));
          setInstances([]);
        })
        .finally(() => setSession((n) => n + 1));
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // session 变化即一次新的弹出：测量后交给 Rust 显示窗口，再播放入场过渡
  useLayoutEffect(() => {
    if (session === 0) return;
    const el = rootRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let cancelled = false;

    trayApi
      .open({ height: Math.ceil(box.height), width: Math.ceil(box.width), inset: INSET })
      .then(() => {
        if (!cancelled) setShown(true);
      })
      .catch((e) => console.error("打开托盘菜单失败", e));

    return () => {
      cancelled = true;
    };
  }, [session, instances, maxHeight, error]);

  const actions: MenuAction[] = [
    ...instances.map((inst) => ({
      disabled: busyId === inst.id,
      run: () => void toggleInstance(inst),
    })),
    ...(runningCount > 0 ? [{ disabled: false, run: () => void stopAll() }] : []),
    { disabled: false, run: () => void trayApi.openMain() },
    { disabled: false, run: () => void trayApi.quit() },
  ];
  actionsRef.current = actions;

  const stopAllIndex = runningCount > 0 ? instances.length : -1;
  const openIndex = instances.length + (runningCount > 0 ? 1 : 0);
  const quitIndex = openIndex + 1;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const list = actionsRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        void trayApi.hide();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.length === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((prev) => {
          const from = prev < 0 ? (step > 0 ? -1 : 0) : prev;
          return (from + step + list.length) % list.length;
        });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const action = activeIndex >= 0 ? list[activeIndex] : list[0];
        if (action && !action.disabled) action.run();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex]);

  const rowProps = (index: number, action: MenuAction) => ({
    type: "button" as const,
    disabled: action.disabled,
    "data-active": activeIndex === index ? "true" : undefined,
    onMouseEnter: () => setActiveIndex(index),
    onClick: action.run,
  });

  return (
    <div className="tray-root" ref={rootRef} style={{ padding: `${INSET}px` }}>
      <div
        className={shown ? "tray-panel is-shown" : "tray-panel"}
        style={{ maxHeight: `${Math.max(maxHeight - INSET * 2, 60)}px` }}
      >
        <header className="tray-header">
          <span className="tray-title">FrpcManager</span>
          <span className="tray-meta">
            {instances.length === 0 ? "无实例" : `运行中 ${runningCount} / ${instances.length}`}
          </span>
        </header>

        {instances.length === 0 ? (
          <p className="tray-empty">还没有实例，先在主窗口新增一个</p>
        ) : (
          <ul className="tray-list">
            {instances.map((inst, index) => (
              <li key={inst.id}>
                <button
                  {...rowProps(index, actions[index])}
                  className="tray-row"
                  title={inst.status === "running" ? "停止" : "启动"}
                >
                  <StatusDot color={STATUS_COLOR[inst.status]} />
                  <span className="tray-row-name">{inst.name}</span>
                  <span className="tray-row-meta">{STATUS_TEXT[inst.status]}</span>
                  <span className="tray-row-action">
                    <Icon name={inst.status === "running" ? "square" : "play"} size={12} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="tray-error">{error}</p>}

        <div className="tray-footer">
          {stopAllIndex >= 0 && (
            <button
              {...rowProps(stopAllIndex, actions[stopAllIndex])}
              className="tray-row tray-row-danger"
            >
              <span className="tray-row-icon">
                <Icon name="square" size={12} />
              </span>
              <span className="tray-row-label">全部停止</span>
            </button>
          )}
          <button {...rowProps(openIndex, actions[openIndex])} className="tray-row">
            <span className="tray-row-icon">
              <Icon name="app-window" size={12} />
            </span>
            <span className="tray-row-label">打开主窗口</span>
          </button>
          <button {...rowProps(quitIndex, actions[quitIndex])} className="tray-row">
            <span className="tray-row-icon">
              <Icon name="power" size={12} />
            </span>
            <span className="tray-row-label">退出</span>
          </button>
        </div>
      </div>
    </div>
  );
}
