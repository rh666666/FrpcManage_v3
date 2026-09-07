import { useState } from "preact/hooks";
import FormField from "./FormField";
import type { FieldDef } from "../../lib/proxySchema";
import type { AnyRecord } from "../../lib/toml";
import { Icon } from "@components/ui";

interface FieldSectionProps {
  title?: string;
  fields: FieldDef[];
  target: AnyRecord;
  onChange: () => void;
  defaultOpen?: boolean;
}

export default function FieldSection({
  title,
  fields,
  target,
  onChange,
  defaultOpen = true,
}: FieldSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  if (!title) {
    return (
      <div className="field-section">
        <div className="field-section-body">
          {fields.map((f) => (
            <FormField key={f.key} field={f} target={target} onChange={onChange} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="field-section">
      <button type="button" className="field-section-header" onClick={() => setOpen(!open)}>
        <span className="field-section-caret">
          <Icon name={open ? "chevron-up" : "chevron-down"} />
        </span>
        <span className="field-section-title">{title}</span>
      </button>
      {open && (
        <div className="field-section-body">
          {fields.map((f) => (
            <FormField key={f.key} field={f} target={target} onChange={onChange} />
          ))}
        </div>
      )}
    </div>
  );
}
