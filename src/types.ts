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

export type ThemeId = "dark" | "light" | "aishenleishen";

export interface Settings {
  frpcPath?: string | null;
  theme?: ThemeId;
}