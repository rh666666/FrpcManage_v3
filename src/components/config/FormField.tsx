import { useEffect, useState } from "preact/hooks";
import type { AnyRecord, KvEntry } from "../../lib/toml";
import {
  getBool,
  getNum,
  getStr,
  readKvEntries,
  readStringArray,
  setBool,
  setKvEntries,
  setNum,
  setStr,
  setStringArray,
} from "../../lib/toml";
import type { FieldDef } from "../../lib/proxySchema";
import { Button, Icon, Switch } from "@components/ui";

interface FormFieldProps {
  field: FieldDef;
  target: AnyRecord;
  onChange: () => void;
}

function KvFieldEditor({
  field,
  target,
  onChange,
}: {
  field: FieldDef;
  target: AnyRecord;
  onChange: () => void;
}) {
  const [entries, setEntries] = useState<KvEntry[]>(() => readKvEntries(target, field.key));

  useEffect(() => {
    setEntries(readKvEntries(target, field.key));
  }, [field.key, target]);

  const commit = (next: KvEntry[]) => {
    setEntries(next);
    setKvEntries(target, field.key, next);
    onChange();
  };

  const updateRow = (index: number, patch: Partial<KvEntry>) => {
    commit(entries.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    commit(entries.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setEntries([...entries, { name: "", value: "" }]);
  };

  return (
    <div className="field-kv">
      {entries.length === 0 && <div className="field-kv-empty">暂无条目</div>}
      {entries.map((row, index) => (
        <div className="field-kv-row" key={index}>
          <input
            className="field-input field-kv-name"
            type="text"
            placeholder="名称"
            value={row.name}
            onChange={(e) => updateRow(index, { name: (e.target as HTMLInputElement).value })}
          />
          <input
            className="field-input field-kv-value"
            type="text"
            placeholder="值"
            value={row.value}
            onChange={(e) => updateRow(index, { value: (e.target as HTMLInputElement).value })}
          />
          <button
            type="button"
            className="field-kv-del"
            onClick={() => removeRow(index)}
            title="删除"
          >
            <Icon name="trash" />
          </button>
        </div>
      ))}
      <Button variant="ghost" onClick={addRow}>
        <Icon name="plus" /> 添加
      </Button>
    </div>
  );
}

export default function FormField({ field, target, onChange }: FormFieldProps) {
  const readValue = () => {
    switch (field.type) {
      case "boolean":
        return String(getBool(target, field.key) ?? false);
      case "port":
      case "number":
        return getNum(target, field.key) == null ? "" : String(getNum(target, field.key));
      case "stringArray":
        return readStringArray(target, field.key);
      default:
        return getStr(target, field.key);
    }
  };

  const value = readValue();

  const handleChange = (v: string) => {
    switch (field.type) {
      case "boolean":
        setBool(target, field.key, v === "true" ? true : v === "false" ? false : null);
        break;
      case "port":
      case "number":
        setNum(target, field.key, v);
        break;
      case "stringArray":
        setStringArray(target, field.key, v);
        break;
      default:
        setStr(target, field.key, v);
    }
    onChange();
  };

  const input =
    field.type === "kv" ? (
      <KvFieldEditor field={field} target={target} onChange={onChange} />
    ) : field.type === "boolean" ? (
      <Switch
        checked={getBool(target, field.key) === true}
        onChange={(c) => handleChange(c ? "true" : "false")}
      />
    ) : field.type === "select" ? (
      <select
        className="field-input field-select"
        value={getStr(target, field.key)}
        onChange={(e) => handleChange((e.target as HTMLSelectElement).value)}
      >
        <option value="">（不设置）</option>
        {(field.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : field.type === "text" || field.type === "port" || field.type === "number" ? (
      <input
        className="field-input"
        type="text"
        inputMode={field.type === "port" || field.type === "number" ? "numeric" : undefined}
        placeholder={field.placeholder}
        value={value}
        onChange={(e) => handleChange((e.target as HTMLInputElement).value)}
      />
    ) : (
      <textarea
        className="field-input field-textarea"
        placeholder={field.placeholder}
        rows={3}
        value={value}
        onChange={(e) => handleChange((e.target as HTMLTextAreaElement).value)}
      />
    );

  return (
    <div className="form-field">
      <label className="field-label">
        {field.label}
        {field.required && <span className="field-required">*</span>}
      </label>
      {input}
      {field.hint && <div className="field-hint">{field.hint}</div>}
    </div>
  );
}
