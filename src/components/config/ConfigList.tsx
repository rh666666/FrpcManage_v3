import type { ConfigFileMeta } from "../../types";
import { Button, Icon } from "@components/ui";

interface ConfigListProps {
  configs: ConfigFileMeta[];
  selectedName: string | null;
  onSelect: (name: string) => void;
  onRename: (name: string) => void;
  onDelete: (name: string) => void;
  onCreate: () => void;
  onImport: () => void;
  loading: boolean;
}

export default function ConfigList({
  configs,
  selectedName,
  onSelect,
  onRename,
  onDelete,
  onCreate,
  onImport,
  loading,
}: ConfigListProps) {
  const toolbar = (
    <div className="config-list-toolbar">
      <Button variant="primary" onClick={onCreate}>
        新建配置
      </Button>
      <Button onClick={onImport} title="从文件或目录批量导入">
        <Icon name="import" size={12} /> 导入
      </Button>
    </div>
  );

  if (loading) {
    return (
      <aside className="config-list-panel">
        {toolbar}
        <div className="config-list is-empty">加载中…</div>
      </aside>
    );
  }

  if (configs.length === 0) {
    return (
      <aside className="config-list-panel">
        {toolbar}
        <div className="config-list is-empty">
          <span>暂无配置，创建第一份配置开始使用</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="config-list-panel">
      {toolbar}
      <div className="config-list">
        {configs.map((c) => (
          <div
            key={c.name}
            className={`config-item-wrap ${c.name === selectedName ? "is-active" : ""}`}
          >
            <button
              type="button"
              className="config-item"
              onClick={() => onSelect(c.name)}
              title={c.name}
            >
              <span className="config-item-name">{c.name}</span>
              <span className="config-item-meta">
                {(c.size / 1024).toFixed(1)} KB · {new Date(c.modifiedAt * 1000).toLocaleDateString("zh-CN")}
              </span>
            </button>
            <span className="config-item-actions">
              <button type="button" title="重命名" onClick={() => onRename(c.name)}>
                <Icon name="edit" />
              </button>
              <button type="button" title="删除" onClick={() => onDelete(c.name)}>
                <Icon name="trash" />
              </button>
            </span>
          </div>
        ))}
      </div>
    </aside>
  );
}
