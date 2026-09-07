import type { ComponentChildren } from "preact";
import type { FrpcInstance } from "../../types";
import { Icon, StatusDot } from "@components/ui";

interface InstanceTabsProps {
  instances: FrpcInstance[];
  activeId: string | null;
  onSelect: (id: string) => void;
  /** 关闭页签；running 时是否先确认由父级处理 */
  onClose: (id: string) => void;
  actions?: ComponentChildren;
}

function statusColor(status: FrpcInstance["status"]) {
  if (status === "running") return "ok";
  if (status === "error") return "err";
  return "muted";
}

export default function InstanceTabs({
  instances,
  activeId,
  onSelect,
  onClose,
  actions,
}: InstanceTabsProps) {
  return (
    <div className="instance-tabs-bar">
      {instances.length === 0 ? (
        <div className="instance-tabs is-empty">暂无运行实例</div>
      ) : (
        <div className="instance-tabs" role="tablist">
          {instances.map((inst) => (
            <div
              key={inst.id}
              className={`instance-tab ${inst.id === activeId ? "is-active" : ""}`}
              onClick={() => onSelect(inst.id)}
            >
              <button
                type="button"
                role="tab"
                aria-selected={inst.id === activeId}
                className="instance-tab-hit"
                onClick={() => onSelect(inst.id)}
              >
                <StatusDot color={statusColor(inst.status)} />
                <span className="instance-tab-name">{inst.name}</span>
              </button>
              <button
                type="button"
                className="instance-tab-close"
                title="移除实例"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(inst.id);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
        </div>
      )}
      {actions && <div className="instance-tabs-actions">{actions}</div>}
    </div>
  );
}
