import { invoke } from "@tauri-apps/api/core";
import type { ConfigFileMeta, FrpcInstance, Settings, ThemeId } from "../types";

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
};

export const settingsApi = {
  get: () => invoke<Settings>("get_settings"),
  setFrpcPath: (path: string) =>
    invoke<Settings>("set_frpc_path", { path }),
  clearFrpcPath: () => invoke<Settings>("clear_frpc_path"),
  setTheme: (theme: ThemeId) => invoke<Settings>("set_theme", { theme }),
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