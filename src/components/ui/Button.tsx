import type { ComponentChildren } from "preact";

export type ButtonVariant = "primary" | "ghost" | "danger";

export interface ButtonProps {
  variant?: ButtonVariant;
  disabled?: boolean;
  onClick?: (e: MouseEvent) => void;
  children?: ComponentChildren;
  title?: string;
}

export default function Button({
  variant = "ghost",
  disabled,
  onClick,
  children,
  title,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}
