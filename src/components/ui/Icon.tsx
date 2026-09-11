export type IconName =
  | "plus"
  | "edit"
  | "trash"
  | "folder"
  | "chevron-up"
  | "chevron-down"
  | "activity"
  | "file"
  | "settings"
  | "close"
  | "minimize"
  | "maximize"
  | "restore"
  | "play"
  | "rotate-cw"
  | "square"
  | "power"
  | "import"
  | "app-window";

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

const PATHS: Record<IconName, string> = {
  plus: "M12 5v14M5 12h14",
  edit: "M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z",
  trash: "M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2Z",
  "chevron-up": "m18 15-6-6-6 6",
  "chevron-down": "m6 9 6 6 6-6",
  activity: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2",
  file: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z M14 2v4a2 2 0 0 0 2 2h4",
  settings:
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  close: "M18 6 6 18M6 6l12 12",
  minimize: "M5 12h14",
  maximize: "M5 5h14v14H5z",
  restore: "M8 8h10v10H8z M6 6h10v10",
  play: "M7 5v14l11-7Z",
  "rotate-cw": "M19 12a7 7 0 1 1-7-7c1.96 0 3.84.77 5.24 2.12L19 10 M19 5.5v3.5h-3.5",
  square: "M5 5h14v14H5z",
  power: "M12 3v9 M18.36 6.64a9 9 0 1 1-12.73 0",
  import: "M12 3v12 M7 10l5 5 5-5 M4 19h16",
  "app-window": "M3 5h18v14H3z M3 9h18",
};

export default function Icon({ name, size = 14, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
