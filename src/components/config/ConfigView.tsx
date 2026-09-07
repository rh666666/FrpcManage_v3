import { useEffect, useState } from "preact/hooks";
import type { ConfigFileMeta } from "../../types";
import { ConfirmDialog, Icon, PromptDialog } from "@components/ui";
import { configApi } from "../../lib/tauri";
import ConfigList from "./ConfigList";
import ConfigEditor from "./ConfigEditor";

interface PromptState {
  mode: "create" | "rename";
  initial?: string;
}

export default function ConfigView() {
  const [configs, setConfigs] = useState<ConfigFileMeta[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dir, setDir] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<PromptState | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const list = await configApi.list();
      setConfigs(list);
      setSelectedName((prev) => (prev && list.some((c) => c.name === prev) ? prev : (list[0]?.name ?? null)));
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    (async () => {
      try {
        setDir(await configApi.getConfigsDir());
        await refresh();
      } catch (e) {
        setToast(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  const handleCreate = () => setPrompt({ mode: "create" });

  const confirmPrompt = async (value: string) => {
    if (!prompt) return;
    const origin = prompt.mode === "rename" ? renameTarget : null;
    setPrompt(null);
    if (prompt.mode === "create") {
      try {
        await configApi.create(value);
        await refresh();
        setSelectedName(value);
        flash(`已创建配置 ${value}`);
      } catch (e) {
        flash(e instanceof Error ? e.message : String(e));
      }
    } else if (origin) {
      try {
        await configApi.rename(origin, value);
        await refresh();
        setSelectedName(value);
        flash(`已重命名为 ${value}`);
      } catch (e) {
        flash(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const startRename = (name: string) => {
    setRenameTarget(name);
    setPrompt({ mode: "rename", initial: name });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget;
    setDeleteTarget(null);
    try {
      await configApi.remove(name);
      await refresh();
      flash(`已删除 ${name}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e));
    }
  };

  const selected = configs.find((c) => c.name === selectedName) ?? null;

  return (
    <div className="config-view">
      <header className="page-header">
        <span className="page-title">配置</span>
        <span className="page-meta">{configs.length} 个</span>
        <span className="toolbar-spacer drag-region" data-tauri-drag-region />
        {dir && (
          <span className="page-meta-mono" title={dir}>
            <Icon name="folder" size={12} /> {dir}
          </span>
        )}
      </header>
      {toast && <div className="config-toast">{toast}</div>}
      <div className="config-split">
        <ConfigList
          configs={configs}
          selectedName={selected?.name ?? null}
          onSelect={setSelectedName}
          onRename={startRename}
          onDelete={setDeleteTarget}
          onCreate={handleCreate}
          loading={loading}
        />
        {selected ? (
          <ConfigEditor config={selected} onSaved={refresh} />
        ) : (
          <section className="config-editor">
            <div className="editor-empty">
              {loading ? "加载中…" : "从左侧选择配置，或点击「新建配置」"}
            </div>
          </section>
        )}
      </div>
      {prompt && (
        <PromptDialog
          title={prompt.mode === "create" ? "新建配置" : "重命名配置"}
          label={prompt.mode === "create" ? "请输入配置文件名（不需要 .toml 后缀）" : "输入新名称（不需要 .toml 后缀）"}
          initialValue={prompt.initial ?? ""}
          confirmText="确定"
          onConfirm={confirmPrompt}
          onCancel={() => setPrompt(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="删除配置"
          message={`确定删除配置「${deleteTarget}」吗？此操作不可恢复。`}
          confirmText="删除"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
