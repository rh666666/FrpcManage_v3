import type { AnyRecord } from "./toml";

export type FieldType =
  | "text"
  | "number"
  | "port"
  | "boolean"
  | "select"
  | "textarea"
  | "stringArray"
  | "kv";

export interface FieldDef {
  key: string;
  label: string;
  hint?: string;
  type: FieldType;
  group: "common" | "advanced";
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface ProxyTypeMeta {
  value: string;
  label: string;
  desc: string;
}

export const PROXY_TYPES: ProxyTypeMeta[] = [
  { value: "tcp", label: "TCP 端口穿透", desc: "把一个内网服务端口直接暴露到公网的某个端口上，最常见的用法。" },
  { value: "udp", label: "UDP 端口穿透", desc: "转发 UDP 流量（如游戏、DNS、语音），内网与公网指定端口互转。" },
  { value: "http", label: "HTTP 网站", desc: "内网 Web 服务通过访问外网域名的方式对外提供。" },
  { value: "https", label: "HTTPS 网站", desc: "与 HTTP 类似，但以 HTTPS 加密域名访问内网 Web 服务。" },
  { value: "tcpmux", label: "域名 / 端口复用", desc: "多个服务复用同一个公网端口，通过连接时用的域名区分。" },
  { value: "stcp", label: "安全点对点访问", desc: "仅允许持密钥的授权访问者访问，不直接占用公网端口，更安全。" },
  { value: "sudp", label: "安全 UDP 访问", desc: "stcp 的 UDP 版本，安全转发 UDP 流量给授权访问者。" },
  { value: "xtcp", label: "P2P 打洞直连", desc: "点对点直连，流量不经过服务器中转，速度更快但依赖打洞成功。" },
];

export const VISITOR_TYPES: { value: string; label: string; desc: string }[] = [
  { value: "stcp", label: "STCP 访问者", desc: "作为访客访问 STCP 代理暴露的内网服务。" },
  { value: "sudp", label: "SUDP 访问者", desc: "作为访客访问 SUDP 代理暴露的 UDP 服务。" },
  { value: "xtcp", label: "XTCP 访问者", desc: "作为访客访问 XTCP 代理，尝试点对点直连。" },
];

const TRANSPORT_FIELDS: FieldDef[] = [
  {
    key: "transport",
    label: "传输设置",
    hint: "一行一个，如：useEncryption = true、useCompression = true、bandwidthLimit = 1MB",
    type: "kv",
    group: "advanced",
    placeholder: "useEncryption = true",
  },
];

const HEALTHCHECK_FIELDS: FieldDef[] = [
  {
    key: "healthCheck",
    label: "健康检查",
    hint: "定期检查本地服务。如：type = \"tcp\"、intervalSeconds = 10",
    type: "kv",
    group: "advanced",
    placeholder: 'type = "tcp"',
  },
];

const LOADBALANCER_FIELDS: FieldDef[] = [
  {
    key: "loadBalancer",
    label: "负载均衡分组",
    hint: "多个同分组代理轮流承接请求。如：group = \"web\"、groupKey = \"key\"",
    type: "kv",
    group: "advanced",
    placeholder: 'group = "web"',
  },
];

const COMMON_PROXY_FIELDS: FieldDef[] = [
  {
    key: "name",
    label: "代理名称",
    hint: "给这个代理起个名字，用于识别。",
    type: "text",
    group: "common",
    required: true,
    placeholder: "如 ssh、web、minecraft",
  },
  {
    key: "enabled",
    label: "启用该代理",
    type: "boolean",
    group: "common",
  },
  {
    key: "localIP",
    label: "内网服务地址",
    hint: "被穿透服务的 IP，一般填 127.0.0.1。",
    type: "text",
    group: "common",
    required: true,
    placeholder: "127.0.0.1",
  },
  {
    key: "localPort",
    label: "内网服务端口",
    hint: "本地服务的端口号，例如 SSH 是 22。",
    type: "port",
    group: "common",
    required: true,
  },
  {
    key: "remotePort",
    label: "公网端口",
    hint: "公网访问时使用的端口号。",
    type: "port",
    group: "common",
    required: true,
  },
];

const DOMAIN_FIELDS: FieldDef[] = [
  {
    key: "customDomains",
    label: "自定义域名",
    hint: "访问这个域名即可到达你的内网服务（可多个，一行一个）。",
    type: "stringArray",
    group: "common",
    placeholder: "如 web.example.com",
  },
  {
    key: "subdomain",
    label: "子域名",
    hint: "和服务器配置的二级域名自动拼接，如填写 www。",
    type: "text",
    group: "common",
    placeholder: "如 web",
  },
];

const HTTP_FIELDS: FieldDef[] = [
  { key: "locations", label: "URL 路由", hint: "仅匹配这些路径的请求才转发，一行一个。", type: "stringArray", group: "advanced", placeholder: "如 /app" },
  { key: "httpUser", label: "访问用户名", hint: "为网站开启账号密码访问。", type: "text", group: "advanced" },
  { key: "httpPassword", label: "访问密码", type: "text", group: "advanced" },
  { key: "hostHeaderRewrite", label: "改写请求域名", type: "text", group: "advanced" },
  {
    key: "requestHeaders",
    label: "要写入请求头的内容",
    hint: "每行一个：名 = 值。",
    type: "kv",
    group: "advanced",
  },
  {
    key: "responseHeaders",
    label: "要写入响应头的内容",
    hint: "每行一个：名 = 值。",
    type: "kv",
    group: "advanced",
  },
];

const P2P_FIELDS: FieldDef[] = [
  { key: "secretKey", label: "共享密钥", hint: "访问端必须有相同的密钥才能访问。", type: "text", group: "common", required: true },
  {
    key: "allowUsers",
    label: "允许访问的用户",
    hint: "允许哪些访客访问，* 表示任何人。",
    type: "stringArray",
    group: "advanced",
    placeholder: "*",
  },
];

interface ProxySchema {
  type: string;
  common: FieldDef[];
  advanced: FieldDef[];
}

const PROXY_SCHEMAS: Record<string, ProxySchema> = {
  tcp: {
    type: "tcp",
    common: COMMON_PROXY_FIELDS,
    advanced: [...TRANSPORT_FIELDS, ...HEALTHCHECK_FIELDS, ...LOADBALANCER_FIELDS],
  },
  udp: {
    type: "udp",
    common: COMMON_PROXY_FIELDS,
    advanced: [...TRANSPORT_FIELDS, ...HEALTHCHECK_FIELDS],
  },
  http: {
    type: "http",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...DOMAIN_FIELDS],
    advanced: [...TRANSPORT_FIELDS, ...HEALTHCHECK_FIELDS, ...HTTP_FIELDS],
  },
  https: {
    type: "https",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...DOMAIN_FIELDS],
    advanced: [...TRANSPORT_FIELDS, ...HEALTHCHECK_FIELDS],
  },
  tcpmux: {
    type: "tcpmux",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...DOMAIN_FIELDS],
    advanced: [
      ...TRANSPORT_FIELDS,
      ...HEALTHCHECK_FIELDS,
      { key: "httpUser", label: "访问用户名", type: "text", group: "advanced" },
      { key: "httpPassword", label: "访问密码", type: "text", group: "advanced" },
      { key: "multiplexer", label: "复用器类型", type: "select", group: "advanced", options: ["httpconnect"] },
    ],
  },
  stcp: {
    type: "stcp",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...P2P_FIELDS.slice(0, 1)],
    advanced: [...TRANSPORT_FIELDS, ...HEALTHCHECK_FIELDS, ...P2P_FIELDS.slice(1)],
  },
  sudp: {
    type: "sudp",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...P2P_FIELDS.slice(0, 1)],
    advanced: [...TRANSPORT_FIELDS, ...P2P_FIELDS.slice(1)],
  },
  xtcp: {
    type: "xtcp",
    common: [...COMMON_PROXY_FIELDS.filter((f) => f.key !== "remotePort"), ...P2P_FIELDS.slice(0, 1)],
    advanced: [...TRANSPORT_FIELDS, ...P2P_FIELDS.slice(1)],
  },
};

export function getProxySchema(type: string): ProxySchema {
  return (
    PROXY_SCHEMAS[type] ?? {
      type,
      common: [{ key: "name", label: "代理名称", type: "text", group: "common", required: true }],
      advanced: [],
    }
  );
}

export interface ClientFieldGroup {
  common: FieldDef[];
  advanced: FieldDef[];
}

export const CLIENT_FIELDS: ClientFieldGroup = {
  common: [
    { key: "serverAddr", label: "服务器地址", hint: "frps 服务端的 IP 或域名。", type: "text", group: "common", required: true, placeholder: "如 frp.example.com" },
    { key: "serverPort", label: "服务器端口", hint: "frps 服务端的监听端口，默认 7000。", type: "port", group: "common", required: true },
    {
      key: "auth",
      label: "验证令牌",
      hint: "与服务端一致的 token，用于身份认证。",
      type: "kv",
      group: "common",
    },
    { key: "user", label: "用户名", hint: "设置后代理名称会自动加上该前缀，用于区分用户。", type: "text", group: "advanced" },
    {
      key: "transport.protocol",
      label: "通信协议",
      hint: "与 frps 之间的通信协议，默认 tcp。",
      type: "select",
      group: "advanced",
      options: ["tcp", "kcp", "quic", "websocket", "wss"],
    },
    { key: "log", label: "日志设置", type: "kv", group: "advanced" },
    {
      key: "webServer",
      label: "监控面板（Web UI）",
      hint: "启用后可在浏览器查看运行信息。",
      type: "kv",
      group: "advanced",
    },
  ],
  advanced: [
    { key: "dnsServer", label: "自定义 DNS 服务器", type: "text", group: "advanced" },
    { key: "loginFailExit", label: "首次登录失败退出", type: "boolean", group: "advanced" },
    { key: "start", label: "只启动这些代理", hint: "一行一个代理名，不填则全部启动。", type: "stringArray", group: "advanced" },
    { key: "includes", label: "附加配置目录", hint: "加载其他配置文件目录中的代理。", type: "stringArray", group: "advanced" },
    { key: "udpPacketSize", label: "UDP 最大包长度", type: "number", group: "advanced" },
    { key: "metadatas", label: "附加元数据", type: "kv", group: "advanced" },
    { key: "natHoleStunServer", label: "打洞 STUN 服务器", type: "text", group: "advanced" },
  ],
};

export interface VisitorSettings {
  input: FieldDef[];
  advanced: FieldDef[];
}

const VISITOR_BASE_COMMON: FieldDef[] = [
  { key: "name", label: "访问者名称", type: "text", group: "common", required: true, placeholder: "如 my_visitor" },
  { key: "serverName", label: "要访问的代理名称", hint: "想连接哪个.代理，填它的名字。", type: "text", group: "common", required: true },
  { key: "secretKey", label: "共享密钥", hint: "与对应代理填写的密钥一致。", type: "text", group: "common" },
  { key: "bindPort", label: "本地监听端口", hint: "在本地监听哪个端口来作为访问入口，-1 表示不占端口。", type: "port", group: "common", required: true },
  { key: "bindAddr", label: "本地监听地址", type: "text", group: "advanced" },
  { key: "serverUser", label: "所属用户名", type: "text", group: "advanced" },
];

const VISITOR_ADVANCED: FieldDef[] = [
  {
    key: "transport",
    label: "传输设置",
    hint: "一行一个，如：useEncryption = true",
    type: "kv",
    group: "advanced",
    placeholder: "useEncryption = true",
  },
];

export function getVisitorSchema(type: string): VisitorSettings {
  const common = [...VISITOR_BASE_COMMON];
  const advanced = [...VISITOR_ADVANCED];
  if (type === "xtcp") {
    advanced.push(
      { key: "protocol", label: "隧道协议", type: "select", group: "advanced", options: ["quic", "kcp"] },
      { key: "keepTunnelOpen", label: "保持隧道打开", type: "boolean", group: "advanced" },
      { key: "maxRetriesAnHour", label: "每小时重试次数", type: "number", group: "advanced" },
      { key: "minRetryInterval", label: "重试最小间隔（秒）", type: "number", group: "advanced" },
      { key: "fallbackTo", label: "回退访问者", type: "text", group: "advanced" },
      { key: "fallbackTimeoutMs", label: "回退超时（毫秒）", type: "number", group: "advanced" },
    );
  }
  return { input: common, advanced };
}

export function newProxy(type: string): AnyRecord {
  const rec: AnyRecord = { name: `proxy_${Date.now().toString(36)}`, type };
  const schema = getProxySchema(type);
  for (const f of schema.common) {
    if (f.type === "boolean") rec[f.key] = true;
  }
  return rec;
}

export function newVisitor(type: string): AnyRecord {
  const rec: AnyRecord = { name: "visitor", type, bindPort: 0 };
  return rec;
}

export function newConfigFromClient(client: AnyRecord): AnyRecord[] {
  void client;
  return [];
}