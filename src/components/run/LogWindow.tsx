import { Fragment } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { listen } from "@tauri-apps/api/event";
import type { FrpcInstance, InstanceLogEvent } from "../../types";
import { Button, Icon } from "@components/ui";
import { parseAnsiLines } from "../../lib/ansi";
import { processApi } from "../../lib/tauri";

/** 当前实例的日志与启停控制 */
interface LogWindowProps {
  instance: FrpcInstance | null;
  frpcPath: string | null;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function startTitle(instance: FrpcInstance | null, frpcPath: string | null): string | undefined {
  if (!instance) return "请先新增实例";
  if (!frpcPath) return "尚未设置 frpc 路径";
  return undefined;
}

export default function LogWindow({ instance, frpcPath }: LogWindowProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    if (!instance) {
      setLines([]);
      return;
    }
    const id = instance.id;
    let cancelled = false;
    processApi
      .logs(id)
      .then((hist) => {
        if (!cancelled) setLines(hist);
      })
      .catch((e) => {
        if (!cancelled) {
          setLines([]);
          flash(errText(e));
        }
      });

    const unlistenPromise = listen<InstanceLogEvent>("instance-log", (event) => {
      if (event.payload.id !== id) return;
      setLines((prev) => [...prev, event.payload.line]);
    });

    return () => {
      cancelled = true;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [instance?.id]);

  useEffect(() => {
    if (!autoScroll) return;
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, autoScroll]);

  const parsedLines = useMemo(() => parseAnsiLines(lines), [lines]);

  const startDisabled = startTitle(instance, frpcPath);
  const isRunning = instance?.status === "running";
  const hasInstance = instance != null;

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      flash(errText(e));
    }
  };

  const handleClear = async () => {
    if (!instance) return;
    try {
      await processApi.clearLogs(instance.id);
      setLines([]);
    } catch (e) {
      flash(errText(e));
    }
  };

  return (
    <section className="log-window">
      {toast && <div className="config-toast">{toast}</div>}
      <header className="log-toolbar">
        <div className="log-toolbar-lifecycle">
          {isRunning ? (
            <>
              <Button
                variant="ghost"
                title="重启"
                onClick={() => instance && run(() => processApi.restart(instance.id))}
              >
                <Icon name="rotate-cw" size={15} />
              </Button>
              <Button
                variant="ghost"
                title="停止"
                onClick={() => instance && run(() => processApi.stop(instance.id))}
              >
                <Icon name="square" size={15} />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              disabled={!!startDisabled}
              title={startDisabled ?? "启动"}
              onClick={() => instance && run(() => processApi.start(instance.id))}
            >
              <Icon name="play" size={15} />
            </Button>
          )}
        </div>
        <span className="toolbar-spacer" />
        <Button
          variant="ghost"
          disabled={!hasInstance}
          title={hasInstance ? undefined : "请先新增实例"}
          onClick={handleClear}
        >
          清屏
        </Button>
        <button
          type="button"
          className={`btn btn-ghost${autoScroll ? " is-pressed" : ""}`}
          disabled={!hasInstance}
          title={hasInstance ? undefined : "请先新增实例"}
          aria-pressed={autoScroll}
          onClick={() => setAutoScroll((v) => !v)}
        >
          自动滚动
        </button>
      </header>
      <div className="log-body" ref={bodyRef}>
        {!instance ? (
          <div className="log-empty">还没有实例。选择一份配置并新增，即可启动 frpc。</div>
        ) : lines.length === 0 ? (
          <div className="log-placeholder">尚无日志，点击启动</div>
        ) : (
          parsedLines.map((segments, i) => (
            <div key={i} className="log-line">
              {segments.map((seg, j) => (
                <Fragment key={j}>
                  {seg.className ? (
                    <span className={seg.className}>{seg.text}</span>
                  ) : (
                    seg.text
                  )}
                </Fragment>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
