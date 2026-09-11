import { useState } from "preact/hooks";
import { open } from "@tauri-apps/plugin-dialog";
import type { ImportOutcome, ImportPlanItem, ImportScannedItem } from "../../types";
import { configApi } from "../../lib/tauri";
import { Button, Icon, Modal } from "@components/ui";

interface ConfigImportDialogProps {
  /** configs 目录，作为文件选择器的起始位置。 */
  configsDir: string | null;
  onImported: (outcome: ImportOutcome) => void;
  onCancel: () => void;
}

/** 可勾选：格式有效且无重名冲突。 */
function selectable(item: ImportScannedItem): boolean {
  return item.valid && !item.conflict;
}

function statusText(item: ImportScannedItem): string {
  if (!item.valid) return item.error ?? "无效配置";
  if (item.conflict) return item.conflictReason ?? "已存在";
  return "可导入";
}

export default function ConfigImportDialog({
  configsDir,
  onImported,
  onCancel,
}: ConfigImportDialogProps) {
  const [items, setItems] = useState<ImportScannedItem[]>([]);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [dirPath, setDirPath] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pick" | "scan" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectableItems = items.filter(selectable);
  const selected = selectableItems.filter((i) => !excluded.has(i.sourcePath));
  const busyNow = busy !== null;

  /** 扫描来源（单个文件或目录），把结果并入当前清单。 */
  const acceptPaths = async (paths: string[], dir: string | null) => {
    setBusy("scan");
    setError(null);
    setItems([]);
    setExcluded(new Set());
    setDirPath(dir);
    const merged: ImportScannedItem[] = [];
    const seen = new Set<string>();
    const failures: string[] = [];
    let fileCount = 0;
    let dirCount = 0;
    let truncated = false;
    for (const path of paths) {
      try {
        const result = await configApi.scanImport(path);
        for (const item of result.items) {
          if (seen.has(item.sourcePath)) continue;
          seen.add(item.sourcePath);
          merged.push(item);
        }
        if (paths.length === 1) {
          fileCount = result.scannedFiles;
          dirCount = result.scannedDirs;
          truncated = result.truncated;
        }
      } catch (e) {
        failures.push(e instanceof Error ? e.message : String(e));
      }
    }
    const parts = [`扫描到 ${merged.length} 个配置文件`];
    if (dir) parts.push(`遍历 ${dirCount} 个目录 / ${fileCount} 个文件`);
    if (truncated) parts.push("已达扫描上限，结果可能不完整");
    if (failures.length > 0) parts.push(`${failures.length} 个来源失败：${failures[0]}`);
    setItems(merged);
    setSummary(parts.join(" · "));
    setError(failures.length > 0 && merged.length === 0 ? failures[0] : null);
    setBusy(null);
  };

  const pickFiles = async () => {
    setBusy("pick");
    setError(null);
    try {
      const result = await open({
        multiple: true,
        directory: false,
        title: "选择 frpc 配置文件",
        defaultPath: configsDir ?? undefined,
        filters: [{ name: "frpc 配置文件", extensions: ["toml"] }],
      });
      if (result === null) return;
      const paths = Array.isArray(result) ? result : [result];
      if (paths.length > 0) await acceptPaths(paths, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => (b === "pick" ? null : b));
    }
  };

  const pickDir = async () => {
    setBusy("pick");
    setError(null);
    try {
      const result = await open({
        directory: true,
        multiple: false,
        recursive: true,
        title: "选择包含 frpc 配置的目录",
        defaultPath: configsDir ?? undefined,
      });
      if (typeof result !== "string" || !result) return;
      await acceptPaths([result], result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy((b) => (b === "pick" ? null : b));
    }
  };

  const toggle = (item: ImportScannedItem) => {
    if (!selectable(item)) return;
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(item.sourcePath)) next.delete(item.sourcePath);
      else next.add(item.sourcePath);
      return next;
    });
  };

  const selectAll = (on: boolean) => {
    setExcluded(on ? new Set() : new Set(selectableItems.map((i) => i.sourcePath)));
  };

  const apply = async () => {
    if (selected.length === 0) return;
    setBusy("apply");
    setError(null);
    const plan: ImportPlanItem[] = selected.map((i) => ({
      sourcePath: i.sourcePath,
      name: i.name,
    }));
    try {
      const outcome = await configApi.applyImport(plan);
      onImported(outcome);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  const pickTitle = `导入选中项${selected.length > 0 ? `（${selected.length}）` : ""}`;

  return (
    <Modal
      title="导入配置"
      onClose={busyNow ? undefined : onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busyNow}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={busyNow || selected.length === 0}
            onClick={apply}
            title={selected.length === 0 ? "请先选择要导入的配置文件" : undefined}
          >
            {busy === "apply" ? "导入中…" : pickTitle}
          </Button>
        </>
      }
    >
      <div className="import-source">
        <span className="import-source-label">来源</span>
        <span className="import-source-path" title={dirPath ?? undefined}>
          {dirPath ?? (items.length > 0 ? `${items.length} 个文件` : "未选择")}
        </span>
        <span className="import-source-actions">
          <Button onClick={pickFiles} disabled={busyNow} title="选择单个或多个 .toml 文件">
            选择文件
          </Button>
          <Button onClick={pickDir} disabled={busyNow} title="递归扫描目录下所有 .toml 文件">
            选择目录
          </Button>
        </span>
      </div>

      {busy === "scan" ? (
        <div className="import-hint">扫描中…</div>
      ) : summary ? (
        <div className="import-hint">{summary}</div>
      ) : null}

      {items.length === 0 && !busyNow && !summary && (
        <div className="import-hint">
          选择文件或目录后开始导入；选择目录会递归扫描其下全部 .toml 文件。
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="import-policy">同名文件将跳过，不会覆盖已有配置</div>
          <div className="import-list-toolbar">
            <span className="import-count">
              已选 {selected.length} / {selectableItems.length} 项
            </span>
            <button
              type="button"
              className="import-link"
              onClick={() => selectAll(true)}
              disabled={busyNow || selected.length === selectableItems.length}
            >
              全选
            </button>
            <button
              type="button"
              className="import-link"
              onClick={() => selectAll(false)}
              disabled={busyNow || selected.length === 0}
            >
              取消全选
            </button>
          </div>
          <div className="import-list">
            {items.map((item) => {
              const canPick = selectable(item);
              const checked = canPick && !excluded.has(item.sourcePath);
              return (
                <label
                  key={item.sourcePath}
                  className={`import-item ${canPick ? "" : "is-locked"} ${checked ? "is-checked" : ""}`}
                  title={item.sourcePath}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canPick || busyNow}
                    onChange={() => toggle(item)}
                  />
                  <span className="import-item-main">
                    <span className="import-item-name">{item.name}</span>
                    <span className="import-item-src">{item.sourceDisplay}</span>
                  </span>
                  <span
                    className={`import-item-status ${
                      item.valid ? (item.conflict ? "is-warn" : "is-ok") : "is-err"
                    }`}
                  >
                    {statusText(item)}
                  </span>
                </label>
              );
            })}
          </div>
        </>
      )}

      <div className="import-footnote">
        <Icon name="import" size={12} /> 导入为复制，源文件保留原地
      </div>

      {error && <div className="modal-error">{error}</div>}
    </Modal>
  );
}
