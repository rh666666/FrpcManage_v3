export type StatusColor = "ok" | "warn" | "err" | "muted";

export interface StatusDotProps {
  color: StatusColor;
  className?: string;
}

export default function StatusDot({ color, className }: StatusDotProps) {
  const cls = className ? `status-dot status-dot-${color} ${className}` : `status-dot status-dot-${color}`;
  return <span className={cls} aria-hidden="true" />;
}
