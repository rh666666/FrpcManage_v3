import { useEffect, useRef, useState } from "preact/hooks";
import type { ConfigFileMeta } from "../../types";
import { Button, Icon } from "@components/ui";
import { configApi } from "../../lib/tauri";
import { parseConfig, stringifyConfig, type AnyRecord } from "../../lib/toml";
import {
  CLIENT_FIELDS,
  PROXY_TYPES,
  VISITOR_TYPES,
  getProxySchema,
  getVisitorSchema,
  newProxy,
  newVisitor,
} from "../../lib/proxySchema";
import FieldSection from "./FieldSection";

interface ConfigEditorProps {
  config: ConfigFileMeta | null;
  onSaved: () => void;
}

type EditorMode = "form" | "toml";

interface ProxyDraft {
  id: string;
  data: AnyRecord;
}

interface VisitorDraft {
  id: string;
  data: AnyRecord;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function proxySummary(p: AnyRecord): string {
  const type = String(p["type"] ?? "");
  const local = p["localIP"] ? `${p["localIP"]}:${p["localPort"] ?? "?"}` : null;
  const remote = p["remotePort"] ? `公网:${p["remotePort"]}` : null;
  const domain = Array.isArray(p["customDomains"])
    ? p["customDomains"].join(", ")
    : p["subdomain"]
      ? `${p["subdomain"]}.域名`
      : null;
  const parts = [local, remote, domain].filter(Boolean);
  return parts.length > 0 ? parts.join(" → ") : type;
}

export default function ConfigEditor({ config, onSaved }: ConfigEditorProps) {
  const [mode, setMode] = useState<EditorMode>("form");
  const [source, setSource] = useState("");
  const [client, setClient] = useState<AnyRecord>({});
  const [proxies, setProxies] = useState<ProxyDraft[]>([]);
  const [visitors, setVisitors] = useState<VisitorDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);

  const name = config?.name ?? null;

  useEffect(() => {
    if (!name) {
      setSource("");
      setClient({});
      setProxies([]);
      setVisitors([]);
      setEditingId(null);
      setError(null);
      return;
    }
    let cancelled = false;
    configApi
      .read(name)
      .then((text) => {
        if (cancelled) return;
        setSource(text);
        setSourceError(null);
        try {
          const cfg = parseConfig(text);
          setClient(cfg.client);
          setProxies(cfg.proxies.map((d) => ({ id: uid(), data: d })));
          setVisitors(cfg.visitors.map((d) => ({ id: uid(), data: d })));
          setEditingId(null);
          setError(null);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
          setProxies([]);
          setVisitors([]);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const markChanged = () => {
    setSavedAt(null);
    setError(null);
    if (mode === "toml") return;
    try {
      const text = stringifyConfig({ client, proxies: proxies.map((p) => p.data), visitors: visitors.map((v) => v.data) });
      setSource(text);
      setSourceError(null);
    } catch {
      // source 保持原样，仅在保存时校验
    }
  };

  const toggleMode = (m: EditorMode) => {
    if (m === mode) return;
    if (m === "toml") {
      setSource(
        stringifyConfig({ client, proxies: proxies.map((p) => p.data), visitors: visitors.map((v) => v.data) }),
      );
    } else {
      try {
        const cfg = parseConfig(source);
        setClient(cfg.client);
        setProxies(cfg.proxies.map((d) => ({ id: uid(), data: d })));
        setVisitors(cfg.visitors.map((d) => ({ id: uid(), data: d })));
        setSourceError(null);
      } catch (e) {
        setSourceError(e instanceof Error ? e.message : String(e));
      }
    }
    setMode(m);
  };

  const save = async () => {
    if (!name) return;
    let content = source;
    if (mode === "form") {
      content = stringifyConfig({ client, proxies: proxies.map((p) => p.data), visitors: visitors.map((v) => v.data) });
    } else {
      try {
        parseConfig(source);
        setSourceError(null);
      } catch (e) {
        setSourceError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    try {
      await configApi.write(name, content);
      setSavedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      void saveRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const addProxyFromType = (type: string) => {
    const draft: ProxyDraft = { id: uid(), data: newProxy(type) };
    setProxies((prev) => [...prev, draft]);
    setEditingId(draft.id);
    setShowTypePicker(false);
  };

  const addVisitor = (type: string) => {
    const draft: VisitorDraft = { id: uid(), data: newVisitor(type) };
    setVisitors((prev) => [...prev, draft]);
    setEditingId(`v:${draft.id}`);
  };

  const removeProxy = (id: string) => {
    setProxies((prev) => prev.filter((p) => p.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const removeVisitor = (id: string) => {
    setVisitors((prev) => prev.filter((v) => v.id !== id));
    if (editingId === `v:${id}`) setEditingId(null);
  };

  const editingProxy =
    editingId && !editingId.startsWith("v:")
      ? proxies.find((p) => p.id === editingId) ?? null
      : null;

  const editingVisitor = editingId?.startsWith("v:")
    ? visitors.find((v) => v.id === editingId.slice(2)) ?? null
    : null;

  if (!name) {
    return (
      <section className="config-editor">
        <div className="editor-empty">从左侧选择配置，或点击「新建配置」</div>
      </section>
    );
  }

  return (
    <section className="config-editor">
      <header className="editor-toolbar">
        <span className="editor-title">{name}</span>
        <span className="toolbar-spacer" />
        {savedAt && <span className="save-status">已保存 {savedAt}</span>}
        <div className="mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "form"}
            className={`mode-btn ${mode === "form" ? "is-active" : ""}`}
            onClick={() => toggleMode("form")}
          >
            可视化编辑
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "toml"}
            className={`mode-btn ${mode === "toml" ? "is-active" : ""}`}
            onClick={() => toggleMode("toml")}
          >
            TOML 源码
          </button>
        </div>
      </header>

      {error && <div className="editor-error">{error}</div>}
      {sourceError && <div className="editor-error">TOML 格式错误：{sourceError}</div>}

      {mode === "toml" ? (
        <div className="editor-body editor-body-source">
          <textarea
            className="editor-source"
            spellcheck={false}
            value={source}
            onChange={(e) => setSource((e.target as HTMLTextAreaElement).value)}
          />
        </div>
      ) : (
        <div className="editor-body">
          <div className="editor-form">
            <div className="form-group">
              <div className="form-group-title">服务器连接</div>
              <FieldSection
                fields={CLIENT_FIELDS.common}
                target={client}
                onChange={markChanged}
              />
              <FieldSection
                title="高级选项"
                fields={CLIENT_FIELDS.advanced}
                target={client}
                onChange={markChanged}
                defaultOpen={false}
              />
            </div>

            <div className="form-group">
              <div className="form-group-title">代理列表</div>
              {proxies.length === 0 && (
                <div className="editor-empty-inline">还没有代理，点击下方按钮添加。</div>
              )}
              <div className="item-list">
                {proxies.map((p) => {
                  const type = String(p.data["type"] ?? "tcp");
                  const enabled = p.data["enabled"] !== false;
                  const isActive = editingId === p.id;
                  return (
                    <div key={p.id} className="proxy-row">
                      <button
                        type="button"
                        className={`proxy-row-main ${isActive ? "is-active" : ""}`}
                        onClick={() => setEditingId(isActive ? null : p.id)}
                      >
                        <span className={`proxy-row-status ${enabled ? "is-on" : "is-off"}`} />
                        <span className="proxy-row-name">{String(p.data["name"] ?? "(未命名)")}</span>
                        <span className="proxy-row-type">{type}</span>
                        <span className="proxy-row-summary">{proxySummary(p.data)}</span>
                      </button>
                      <button type="button" className="proxy-row-del" onClick={() => removeProxy(p.id)} title="删除">
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="proxy-actions">
                <Button variant="primary" onClick={() => setShowTypePicker(!showTypePicker)}>
                  <Icon name="plus" /> 新增代理
                </Button>
              </div>

              {showTypePicker && (
                <div className="type-picker">
                  <div className="type-picker-title">选择代理类型</div>
                  <div className="type-picker-list">
                    {PROXY_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        className="type-item"
                        onClick={() => addProxyFromType(t.value)}
                        title={t.desc}
                      >
                        <span className="type-item-label">{t.label}</span>
                        <span className="type-item-value">{t.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {editingProxy && (() => {
                const schema = getProxySchema(String(editingProxy.data["type"] ?? "tcp"));
                return (
                  <div className="item-inspector">
                    <FieldSection
                      title="常用设置"
                      fields={schema.common}
                      target={editingProxy.data}
                      onChange={markChanged}
                    />
                    <FieldSection
                      title="高级选项"
                      fields={schema.advanced}
                      target={editingProxy.data}
                      onChange={markChanged}
                      defaultOpen={false}
                    />
                  </div>
                );
              })()}
            </div>

            <div className="form-group">
              <div className="form-group-title">访问者列表</div>
              {visitors.length === 0 && (
                <div className="editor-empty-inline">暂无访问者，访问者用于访问 stcp / sudp / xtcp 服务。</div>
              )}
              <div className="item-list">
                {visitors.map((v) => {
                  const type = String(v.data["type"] ?? "stcp");
                  const isActive = editingId === `v:${v.id}`;
                  return (
                    <div key={v.id} className="proxy-row">
                      <button
                        type="button"
                        className={`proxy-row-main ${isActive ? "is-active" : ""}`}
                        onClick={() => setEditingId(isActive ? null : `v:${v.id}`)}
                      >
                        <span className="proxy-row-name">{String(v.data["name"] ?? "(未命名)")}</span>
                        <span className="proxy-row-type">{type}</span>
                        <span className="proxy-row-summary">
                          → {String(v.data["serverName"] ?? "?")} 监听 {String(v.data["bindPort"] ?? "-1")}
                        </span>
                      </button>
                      <button type="button" className="proxy-row-del" onClick={() => removeVisitor(v.id)} title="删除">
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="proxy-actions">
                {VISITOR_TYPES.map((t) => (
                  <Button key={t.value} onClick={() => addVisitor(t.value)} title={t.desc}>
                    <Icon name="plus" /> {t.label}
                  </Button>
                ))}
              </div>
              {editingVisitor && (() => {
                const schema = getVisitorSchema(String(editingVisitor.data["type"] ?? "stcp"));
                return (
                  <div className="item-inspector">
                    <FieldSection
                      title="常用设置"
                      fields={schema.input}
                      target={editingVisitor.data}
                      onChange={markChanged}
                    />
                    <FieldSection
                      title="高级选项"
                      fields={schema.advanced}
                      target={editingVisitor.data}
                      onChange={markChanged}
                      defaultOpen={false}
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <footer className="editor-footer">
        <Button variant="ghost" onClick={onSaved}>
          刷新
        </Button>
        <Button variant="primary" onClick={save} title="Ctrl+S">
          保存
        </Button>
      </footer>
    </section>
  );
}