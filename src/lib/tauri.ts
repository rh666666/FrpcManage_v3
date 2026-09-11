import { invoke } from "@tauri-apps/api/core";
import type {
  ConfigFileMeta,
  FrpcInstance,
  ImportOutcome,
  ImportPlanItem,
  ImportScanResult,
  Settings,
  ThemeId,
  CloseBehavior,
} from "../types";

export const configApi = {
  getConfigsDir: () => invoke<string>("get_configs_dir"),
  list: () => invoke<ConfigFileMeta[]>("list_config_files"),
  read: (name: string) => invoke<string>("read_config_file", { name }),
  write: (name: string, content: string) =>
    invoke<void>("write_config_file", { name, content }),
  create: (name: string) => invoke<void>("create_config_file", { name }),
  remove: (name: string) => invoke<void>("delete_config_file", { name }),
  rename: (oldName: string, newName: string) =>
    invoke<void>("rename_config_file", { oldName, newName }),
  scanImport: (path: string) =>
    invoke<ImportScanResult>("scan_import_source", { source: { path } }),
  applyImport: (items: ImportPlanItem[]) =>
    invoke<ImportOutcome>("apply_config_import", { items }),
};

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  setFrpcPath: (path: string) =>
    invoke<Settings>("set_frpc_path", { path }),
  clearFrpcPath: () => invoke<Settings>("clear_frpc_path"),
  setTheme: (theme: ThemeId) => invoke<Settings>("set_theme", { theme }),
  setCloseBehavior: (closeBehavior: CloseBehavior) =>
    invoke<Settings>("set_close_behavior", { closeBehavior }),
};

/** 托盘菜单窗口的尺寸（CSS px）由前端测量后回传，Rust 侧据锚点摆位。 */
export interface TrayMenuSize {
  height: number;
  width: number;
  inset: number;
}

export const trayApi = {
  open: (size: TrayMenuSize) => invoke<void>("open_tray_menu", { ...size }),
  hide: () => invoke<void>("hide_tray_menu"),
  openMain: () => invoke<void>("open_main_window"),
  quit: () => invoke<void>("quit_app"),
};

export const processApi = {
  list: () => invoke<FrpcInstance[]>("list_instances"),
  create: (name: string, configName: string) =>
    invoke<FrpcInstance>("create_instance", { name, configName }),
  remove: (id: string) => invoke<void>("remove_instance", { id }),
  start: (id: string) => invoke<FrpcInstance>("start_instance", { id }),
  stop: (id: string) => invoke<FrpcInstance>("stop_instance", { id }),
  restart: (id: string) => invoke<FrpcInstance>("restart_instance", { id }),
  stopAll: () => invoke<FrpcInstance[]>("stop_all_instances"),
  logs: (id: string) => invoke<string[]>("get_instance_logs", { id }),
  clearLogs: (id: string) => invoke<void>("clear_instance_logs", { id }),
};