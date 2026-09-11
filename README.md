# FrpcManager

Windows 桌面应用：在本地管理多份 [frpc](https://github.com/fatedier/frp) 配置，并控制多个客户端进程的启动、停止与日志。

当前版本 `3.0.1`。需自行准备 frpc 可执行文件（配置格式按 frp 0.52+ 的 TOML：`serverAddr`、`[[proxies]]`、`[[visitors]]`）。

## 能做什么

**配置管理**

- 新建、重命名、删除 `.toml` 配置
- 可视化编辑服务端公共字段、代理（tcp / udp / http / https / tcpmux / stcp / sudp / xtcp）与访问者（stcp / sudp / xtcp）
- 高级项可折叠；代理与访问者采用列表 + 下方 inspector
- 「可视化编辑」与「TOML 源码」两种模式随时切换，源码模式保存前会校验格式
- `Ctrl+S` 保存当前配置

**运行监控**

- 按配置创建多个运行实例，各自独立启停、重启
- 实时日志（ANSI 着色），可清屏、自动滚动
- 全部停止；关闭应用时结束仍在运行的子进程
- 实例名册会持久化，下次打开仍可看到上次的实例（进程不会自动续跑）

**外观与设置**

- 无框窗口，标题栏融入页眉（最小化 / 最大化 / 关闭）
- 四套主题：深色、浅色、黄紫配色、黄紫配色2
- 在设置里指定 frpc 路径
- 关闭窗口时可选「退出应用」或「最小化到托盘」（托盘模式下 frpc 继续运行）
- 托盘图标：左键唤出主窗口，右键弹出快捷菜单（逐个启停 / 全部停止 / 打开主窗口 / 退出）

快捷键：`Ctrl+1` 运行监控，`Ctrl+2` 配置管理（焦点在输入框时不生效），`Ctrl+S` 保存当前配置。

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
| `settings.json` | frpc 路径、主题、关闭窗口行为 |
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

没有独立的 lint / 测试脚本。Rust 由 Tauri CLI 编译，不要改 `src-tauri` 里 lib crate 名称 `frpcmanager_v3_lib`。Rust 侧只有托盘菜单摆位的纯几何单测，在 `src-tauri` 下 `cargo test` 运行。

### 结构

```
src/                 Preact + TypeScript + SCSS
  components/        布局、运行页、配置页、托盘菜单、UI 组件
  lib/               Tauri invoke、主题、TOML / 代理字段、ANSI
src-tauri/src/       Rust：config / process / settings / tray
```

前端通过 `@tauri-apps/api/core` 的 `invoke` 调后端命令（应用自己的命令在 `lib.rs` 的 `invoke_handler` 注册即可）；调用 core / 插件 API（窗口控件、`data-tauri-drag-region`、对话框、事件监听）则必须在 `src-tauri/capabilities/default.json` 里放行，新增窗口也要写进该文件的 `windows`，否则运行时会被 ACL 拒绝。

## 技术栈

Tauri 2、Rust、Preact、TypeScript、Vite、SCSS。


## 传送门：月神代理

[MoonProxy](https://github.com/MoonProxyHQ/moonproxy-desktop) — 跨平台 FRP 桌面客户端（Tauri v2 + Rust），可视化代理规则、实时流量监控、系统托盘常驻。面向 macOS 用户 + 非技术用户的一站式体验。
