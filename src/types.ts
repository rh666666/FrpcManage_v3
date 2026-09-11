export type ViewId = "run" | "config";

export type InstanceStatus = "running" | "stopped" | "error";

/** 运行实例对外快照。pid / startedAt 未运行时缺省。 */
export interface FrpcInstance {
  id: string;
  name: string;
  configName: string;
  status: InstanceStatus;
  pid?: number;
  startedAt?: number;
}

/** 后端 instance-log 事件载荷 */
export interface InstanceLogEvent {
  id: string;
  line: string;
}

/** 配置文件元数据。name 不含扩展名。 */
export interface ConfigFileMeta {
  name: string;
  size: number;
  modifiedAt: number;
}

export interface ConfigFileDetail {
  meta: ConfigFileMeta;
  content: string;
}

/** 导入扫描出的候选文件。invalid 条目带 error，conflict 条目带 conflictReason。 */
export interface ImportScannedItem {
  sourcePath: string;
  sourceDisplay: string;
  name: string;
  conflict: boolean;
  conflictReason?: string | null;
  valid: boolean;
  error?: string | null;
}

/** 扫描结果。scannedFiles 含被跳过的非 toml 文件。 */
export interface ImportScanResult {
  items: ImportScannedItem[];
  scannedFiles: number;
  scannedDirs: number;
  truncated: boolean;
}

/** 导入计划条目，回传给后端执行复制。 */
export interface ImportPlanItem {
  sourcePath: string;
  name: string;
}

export interface ImportFailure {
  sourceDisplay: string;
  reason: string;
}

export interface ImportOutcome {
  imported: string[];
  skipped: string[];
  failed: ImportFailure[];
}

export type ThemeId = "dark" | "light" | "isolation" | "lieyang";

/** 关闭主窗口时的行为。 */
export type CloseBehavior = "quit" | "tray";

export interface Settings {
  frpcPath?: string | null;
  theme?: ThemeId;
  closeBehavior?: CloseBehavior;
}