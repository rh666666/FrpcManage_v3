import { useState } from "preact/hooks";
import Button from "./Button";
import Modal, { type PromptDialogProps } from "./Modal";

export default function PromptDialog({
  title,
  label,
  placeholder,
  initialValue = "",
  confirmText = "确定",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button onClick={onCancel}>取消</Button>
          <Button
            variant="primary"
            disabled={!trimmed}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      {label && <label className="modal-field-label">{label}</label>}
      <input
        className="field-input modal-input"
        value={value}
        placeholder={placeholder}
        autoFocus
        onChange={(e) => setValue((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && trimmed) onConfirm(trimmed);
        }}
      />
    </Modal>
  );
}