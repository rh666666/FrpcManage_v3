import type { ThemeId } from "../types";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  desc: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "dark", label: "深色", desc: "默认柔和深灰" },
  { id: "light", label: "浅色", desc: "浅色背景" },
  { id: "aishenleishen", label: "爱上雷神", desc: "黄紫配色" },
];

const DEFAULT_THEME: ThemeId = "dark";

/** 将主题应用到 document，并设置 color-scheme */
export function applyTheme(theme: ThemeId | undefined): void {
  const id = theme ?? DEFAULT_THEME;
  document.documentElement.dataset.theme = id;
  document.documentElement.style.colorScheme = id === "light" ? "light" : "dark";
}

export function normalizeTheme(theme: string | undefined | null): ThemeId {
  if (theme === "light" || theme === "aishenleishen") return theme;
  return DEFAULT_THEME;
}
