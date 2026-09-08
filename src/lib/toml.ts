import { parse, stringify } from "smol-toml";

export type AnyRecord = Record<string, unknown>;

/** 解析后的 frpc 配置。client 为根表中除 proxies / visitors 外的字段。 */
export interface FrpConfig {
  client: AnyRecord;
  proxies: AnyRecord[];
  visitors: AnyRecord[];
}

/** map[string]string 条目，用于 metadatas、HeaderOperations.set 等。 */
export interface KvEntry {
  name: string;
  value: string;
}

function isRecord(v: unknown): v is AnyRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toRecordArray(v: unknown): AnyRecord[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isRecord);
}

export function parseConfig(text: string): FrpConfig {
  const root = parse(text);
  if (!isRecord(root)) {
    throw parseError("文件内容不是有效的 TOML 对象");
  }
  const proxies = toRecordArray(root["proxies"]);
  const visitors = toRecordArray(root["visitors"]);
  const client: AnyRecord = {};
  for (const [k, v] of Object.entries(root)) {
    if (k !== "proxies" && k !== "visitors") {
      client[k] = v;
    }
  }
  return { client, proxies, visitors };
}

export function stringifyConfig(cfg: FrpConfig): string {
  const root: AnyRecord = { ...cfg.client };
  if (cfg.proxies.length > 0) root["proxies"] = cfg.proxies;
  if (cfg.visitors.length > 0) root["visitors"] = cfg.visitors;
  return stringify(root) + "\n";
}

export function newEmptyConfig(): FrpConfig {
  return {
    client: {
      serverAddr: "127.0.0.1",
      serverPort: 7000,
    },
    proxies: [],
    visitors: [],
  };
}

/** 按点分路径读取嵌套表中的值。 */
function getNestedValue(rec: AnyRecord, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = rec;
  for (const part of parts) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** 清空叶子键后，自下而上删除已无字段的祖先表。 */
function pruneEmptyAncestors(rec: AnyRecord, path: string[]): void {
  const ancestors: { parent: AnyRecord; key: string; child: AnyRecord }[] = [];
  let current: AnyRecord = rec;
  for (const part of path) {
    const child = current[part];
    if (!isRecord(child)) return;
    ancestors.push({ parent: current, key: part, child });
    current = child;
  }
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const { parent, key, child } = ancestors[i];
    if (Object.keys(child).length === 0) delete parent[key];
    else break;
  }
}

function splitKey(key: string): { parentPath: string[]; leafKey: string } {
  const parts = key.split(".");
  return { parentPath: parts.slice(0, -1), leafKey: parts[parts.length - 1] };
}

/** 定位嵌套表的父节点；create 为 true 时自动创建中间表。 */
function resolveParent(
  rec: AnyRecord,
  key: string,
  create: boolean,
): { parent: AnyRecord; leafKey: string; parentPath: string[] } | null {
  const { parentPath, leafKey } = splitKey(key);
  let current: AnyRecord = rec;
  for (const part of parentPath) {
    const next = current[part];
    if (!isRecord(next)) {
      if (!create) return null;
      const created: AnyRecord = {};
      current[part] = created;
      current = created;
      continue;
    }
    current = next;
  }
  return { parent: current, leafKey, parentPath };
}

/** 删除点分路径上的叶子键并剪除空祖先表。 */
function deleteNestedLeaf(rec: AnyRecord, key: string): void {
  const resolved = resolveParent(rec, key, false);
  if (!resolved) return;
  const { parent, leafKey, parentPath } = resolved;
  delete parent[leafKey];
  pruneEmptyAncestors(rec, parentPath);
}

/** 写入点分路径上的叶子值。 */
function setNestedLeaf(rec: AnyRecord, key: string, value: unknown): void {
  const resolved = resolveParent(rec, key, true);
  if (!resolved) return;
  const { parent, leafKey } = resolved;
  parent[leafKey] = value;
}

/** 按点分路径写入嵌套表中的字符串值；清空时删除叶子键并剪除空祖先表。 */
function setNestedStr(rec: AnyRecord, key: string, value: string): void {
  if (value.trim() === "") {
    deleteNestedLeaf(rec, key);
  } else {
    setNestedLeaf(rec, key, value.trim());
  }
}

export function getStr(rec: AnyRecord, key: string): string {
  const v = key.includes(".") ? getNestedValue(rec, key) : rec[key];
  return v == null ? "" : String(v);
}

export function getNum(rec: AnyRecord, key: string): number | null {
  const v = key.includes(".") ? getNestedValue(rec, key) : rec[key];
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function getBool(rec: AnyRecord, key: string): boolean | null {
  const v = key.includes(".") ? getNestedValue(rec, key) : rec[key];
  if (typeof v === "boolean") return v;
  return null;
}

export function setStr(rec: AnyRecord, key: string, value: string): void {
  if (key.includes(".")) {
    setNestedStr(rec, key, value);
    return;
  }
  if (value.trim() === "") delete rec[key];
  else rec[key] = value.trim();
}

export function setNum(rec: AnyRecord, key: string, value: unknown): void {
  const s = String(value).trim();
  if (s === "") {
    if (key.includes(".")) deleteNestedLeaf(rec, key);
    else delete rec[key];
    return;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) {
    if (key.includes(".")) deleteNestedLeaf(rec, key);
    else delete rec[key];
    return;
  }
  if (key.includes(".")) setNestedLeaf(rec, key, n);
  else rec[key] = n;
}

export function setBool(rec: AnyRecord, key: string, value: boolean | null): void {
  if (value == null) {
    if (key.includes(".")) deleteNestedLeaf(rec, key);
    else delete rec[key];
    return;
  }
  if (key.includes(".")) setNestedLeaf(rec, key, value);
  else rec[key] = value;
}

export function setStringArray(rec: AnyRecord, key: string, value: string): void {
  const items = value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) {
    if (key.includes(".")) deleteNestedLeaf(rec, key);
    else delete rec[key];
  } else if (key.includes(".")) {
    setNestedLeaf(rec, key, items);
  } else {
    rec[key] = items;
  }
}

export function readStringArray(rec: AnyRecord, key: string): string {
  const v = key.includes(".") ? getNestedValue(rec, key) : rec[key];
  if (Array.isArray(v)) return v.map(String).join("\n");
  return "";
}

/** 读取 map[string]string 条目。 */
export function readKvEntries(rec: AnyRecord, key: string): KvEntry[] {
  const v = key.includes(".") ? getNestedValue(rec, key) : rec[key];
  if (!isRecord(v)) return [];
  return Object.entries(v).map(([name, val]) => ({
    name,
    value: val == null ? "" : String(val),
  }));
}

/** 写入 map[string]string；空 map 时删除该键并剪除空祖先表。 */
export function setKvEntries(rec: AnyRecord, key: string, entries: KvEntry[]): void {
  const out: AnyRecord = {};
  for (const { name, value } of entries) {
    const k = name.trim();
    if (!k) continue;
    out[k] = value.trim();
  }
  if (Object.keys(out).length === 0) {
    if (key.includes(".")) deleteNestedLeaf(rec, key);
    else delete rec[key];
    return;
  }
  if (key.includes(".")) setNestedLeaf(rec, key, out);
  else rec[key] = out;
}

export function parseError(msg: string): Error {
  return new Error(msg);
}
