# FrpcManager

Windows 桌面应用：在本地管理多份 [frpc](https://github.com/fatedier/frp) 配置，并控制多个客户端进程的启动、停止与日志。

当前版本 `3.0.1`。需自行准备 frpc 可执行文件（配置格式按 frp 0.52+ 的 TOML：`serverAddr`、`[[proxies]]`、`[[visitors]]`）。

## 能做什么

**配置管理**

- 新建、重命名、删除 `.toml` 配置
- 可视化编辑服务端公共字段、代理（tcp / udp / http / https / tcpmux / stcp / sudp / xtcp）与访问者（stcp / sudp / xtcp）
- 高级项可折叠；代理与访问者采用列表 + 下方 inspector
- `Ctrl+S` 保存当前配置

**运行监控**

- 按配置创建多个运行实例，各自独立启停、重启
- 实时日志（ANSI 着色），可清屏、自动滚动
- 全部停止；关闭应用时结束仍在运行的子进程
- 实例名册会持久化，下次打开仍可看到上次的实例（进程不会自动续跑）

**外观与设置**

- 无框窗口，标题栏融入页眉（最小化 / 最大化 / 关闭）
- 三套主题：深色、浅色、爱上雷神
- 在设置里指定 frpc 路径

快捷键：`Ctrl+1` 运行监控，`Ctrl+2` 配置管理（焦点在输入框时不生效）。

## 环境

- Windows 10 / 11
- [frpc](https://github.com/fatedier/frp/releases)（与配置格式匹配的版本）
- 开发还需要：Node.js、[pnpm](https://pnpm.io/)、Rust、[Tauri 2 前置依赖](https://v2.tauri.app/start/prerequisites/)

## 使用

1. 安装或解压 frpc，记下 `frpc.exe` 路径。
2. 打开 FrpcManager，侧栏 **设置** 中选择该可执行文件。
3. 到 **配置管理** 新建或编辑 TOML，保存。
4. 到 **运行监控** 新增实例、启动，在日志区查看输出。

配置与设置写在应用数据目录（Windows 一般为 `%APPDATA%\frpcManagerV3\`）：

| 路径 | 内容 |
|------|------|
| `configs/*.toml` | 各份 frpc 配置 |
| `settings.json` | frpc 路径、主题 |
| `instances.json` | 运行实例名册 |

不要把配置目录当 git 仓库提交；路径里不要放密钥以外的隐私文件到公开仓库。

## 开发

包管理器固定为 **pnpm**（`tauri.conf.json` 的 `beforeDevCommand` / `beforeBuildCommand` 已写死）。

```bash
pnpm install
pnpm tauri dev
```

前端开发服务器占用 `1420`，该端口必须空闲。只看界面可用 `pnpm dev`，窗口控件与进程 IPC 需要完整的 Tauri 会话。

```bash
pnpm build          # tsc + vite build
pnpm tauri build    # 打 Windows 安装包 / 可执行文件
```

没有独立的 lint / 测试脚本。Rust 由 Tauri CLI 编译，不要改 `src-tauri` 里 lib crate 名称 `frpcmanager_v3_lib`。

### 结构

```
src/                 Preact + TypeScript + SCSS
  components/        布局、运行页、配置页、UI 组件
  lib/               Tauri invoke、主题、TOML / 代理字段
src-tauri/src/       Rust：config / process / settings
```

前端通过 `@tauri-apps/api/core` 的 `invoke` 调后端命令；新命令必须写入 `src-tauri/capabilities/default.json`，否则运行时会被 ACL 拒绝。

## 技术栈

Tauri 2、Rust、Preact、TypeScript、Vite、SCSS。作者：adoleiiiiii。
