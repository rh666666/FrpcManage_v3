import type { AnyRecord } from "../../lib/toml";
import {
  getBool,
  getNum,
  getStr,
  readKv,
  readStringArray,
  setBool,
  setKv,
  setNum,
  setStr,
  setStringArray,
} from "../../lib/toml";
import type { FieldDef } from "../../lib/proxySchema";
import { Switch } from "@components/ui";

interface FormFieldProps {
  field: FieldDef;
  target: AnyRecord;
  onChange: () => void;
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
      case "kv":
        return readKv(target, field.key);
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
        setNum(target, field.key, v === "" ? 0 : v);
        break;
      case "stringArray":
        setStringArray(target, field.key, v);
        break;
      case "kv":
        setKv(target, field.key, v);
        break;
      default:
        setStr(target, field.key, v);
    }
    onChange();
  };

  const input =
    field.type === "boolean" ? (
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
        rows={field.type === "kv" ? 4 : 3}
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