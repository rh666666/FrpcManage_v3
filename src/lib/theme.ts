import type { ThemeId } from "../types";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  desc: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "dark", label: "深色", desc: "默认柔和深灰" },
  { id: "light", label: "浅色", desc: "浅色背景" },
  { id: "isolation", label: "黄紫配色", desc: "爱上雷神" },
  { id: "lieyang", label: "黄紫配色2", desc: "终将升起的烈阳！" },
];

const DEFAULT_THEME: ThemeId = "dark";

/** 将主题应用到 document，并设置 color-scheme */
export function applyTheme(theme: ThemeId | undefined): void {
  const id = theme ?? DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.documentElement.style.colorScheme = id === "light" || id === "lieyang" ? "light" : "dark";
}

export function normalizeTheme(theme: string | undefined | null): ThemeId {
  if (theme === "light" || theme === "lieyang") return theme;
  if (theme === "isolation" || theme === "aishenleishen") return "isolation";
  return DEFAULT_THEME;
}
