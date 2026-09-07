import { useEffect, useState } from "preact/hooks";
import type { ConfigFileMeta, FrpcInstance } from "../../types";
import { Button, ConfirmDialog, Modal } from "@components/ui";
import { configApi, processApi } from "../../lib/tauri";
import InstanceTabs from "./InstanceTabs";
import LogWindow from "./LogWindow";

interface RunViewProps {
  instances: FrpcInstance[];
  frpcPath: string | null;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function RunView({ instances, frpcPath }: RunViewProps) {
  const [activeId, setActiveId] = useState<string | null>(instances[0]?.id ?? null);
  const [configs, setConfigs] = useState<ConfigFileMeta[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createConfig, setCreateConfig] = useState("");
  const [createName, setCreateName] = useState("");
  const [stopAllOpen, setStopAllOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<FrpcInstance | null>(null);

  const active = instances.find((i) => i.id === activeId) ?? null;
  const runningCount = instances.filter((i) => i.status === "running").length;
  const hasConfigs = configs.length > 0;
  const createNameTrimmed = createName.trim();

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => {
    setActiveId((prev) => {
      if (prev && instances.some((i) => i.id === prev)) return prev;
      return instances[0]?.id ?? null;
    });
  }, [instances]);

  useEffect(() => {
    let cancelled = false;
    configApi
      .list()
      .then((list) => {
        if (!cancelled) setConfigs(list);
      })
      .catch((e) => {
        if (!cancelled) flash(errText(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const openCreate = async () => {
    try {
      const list = await configApi.list();
      setConfigs(list);
      const first = list[0]?.name;
      if (!first) return;
      setCreateConfig(first);
      setCreateName(first);
      setCreateOpen(true);
    } catch (e) {
      flash(errText(e));
    }
  };

  const confirmCreate = async () => {
    if (!createNameTrimmed || !createConfig) return;
    setCreateOpen(false);
    try {
      await processApi.create(createNameTrimmed, createConfig);
    } catch (e) {
      flash(errText(e));
    }
  };

  const handleCloseTab = (id: string) => {
    const inst = instances.find((i) => i.id === id);
    if (!inst) return;
    if (inst.status === "running") {
      setRemoveTarget(inst);
      return;
    }
    processApi.remove(id).catch((e) => flash(errText(e)));
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    const id = removeTarget.id;
    setRemoveTarget(null);
    try {
      await processApi.remove(id);
    } catch (e) {
      flash(errText(e));
    }
  };

  const confirmStopAll = async () => {
    setStopAllOpen(false);
    try {
      await processApi.stopAll();
    } catch (e) {
      flash(errText(e));
    }
  };

  return (
    <div className="run-view">
      <header className="page-header">
        <span className="page-title">运行</span>
        <span className="page-meta">
          {instances.length} 个实例 / {runningCount} 个在运行
        </span>
        <span className="toolbar-spacer drag-region" data-tauri-drag-region />
      </header>
      {toast && <div className="config-toast">{toast}</div>}
      <InstanceTabs
        instances={instances}
        activeId={active?.id ?? null}
        onSelect={setActiveId}
        onClose={handleCloseTab}
        actions={
          <>
            <Button
              variant="primary"
              disabled={!hasConfigs}
              title={hasConfigs ? undefined : "请先创建配置"}
              onClick={openCreate}
            >
              新增实例
            </Button>
            <Button
              variant="danger"
              disabled={runningCount === 0}
              title={runningCount === 0 ? "当前没有运行中的实例" : undefined}
              onClick={() => setStopAllOpen(true)}
            >
              全部停止
            </Button>
          </>
        }
      />
      <LogWindow instance={active} frpcPath={frpcPath} />
      {createOpen && (
        <Modal
          title="新增实例"
          onClose={() => setCreateOpen(false)}
          footer={
            <>
              <Button onClick={() => setCreateOpen(false)}>取消</Button>
              <Button
                variant="primary"
                disabled={!createNameTrimmed || !createConfig}
                onClick={confirmCreate}
              >
                确定
              </Button>
            </>
          }
        >
          <label className="modal-field-label">配置文件</label>
          <select
            className="field-input field-select"
            value={createConfig}
            onChange={(e) => {
              const name = (e.target as HTMLSelectElement).value;
              setCreateConfig(name);
              setCreateName(name);
            }}
          >
            {configs.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="modal-field-label">实例名</label>
          <input
            className="field-input modal-input"
            value={createName}
            autoFocus
            onChange={(e) => setCreateName((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && createNameTrimmed && createConfig) confirmCreate();
            }}
          />
        </Modal>
      )}
      {stopAllOpen && (
        <ConfirmDialog
          title="全部停止"
          message="确定停止全部运行中的实例吗？"
          confirmText="全部停止"
          onConfirm={confirmStopAll}
          onCancel={() => setStopAllOpen(false)}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="停止并移除实例"
          message={`确定停止并移除实例「${removeTarget.name}」吗？`}
          confirmText="停止并移除"
          onConfirm={confirmRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
