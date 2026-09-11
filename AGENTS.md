# AGENTS.md

Tauri 2 desktop app **FrpcManager V3** (`3.0.1`): keeps multiple frpc TOML configs and manages the lifecycle of their client processes. Frontend Preact + TypeScript + Vite + SCSS (`src/`), backend Rust (`src-tauri/src/`), Windows host. Implemented end to end: config CRUD + visual editor, per-instance start/stop/restart with live ANSI logs, tray icon with a self-drawn menu, settings + themes.

## Never
- **pnpm only.** `beforeDevCommand`/`beforeBuildCommand` in `src-tauri/tauri.conf.json` hardcode it; no npm/yarn.
- **`preact/hooks`, never react.** `jsxImportSource` is `preact`; take `useState`/`useEffect` from `preact/hooks`.
- **No emoji or decorative unicode.** Every glyph goes through the shared SVG `Icon` (`@components/ui`): add a `PATHS` entry in `src/components/ui/Icon.tsx`. Plain text inside string logic (`parts.join(" → ")`) stays text.
- **New IPC:** register the command in `lib.rs` and wrap it in `src/lib/tauri.ts` — components never call `invoke` themselves. App commands are allowed by default, but **core/plugin APIs** (window controls, `data-tauri-drag-region`, dialog, `listen`) need a permission in `src-tauri/capabilities/default.json`, and every new window must be added to its `windows`, or those calls fail at runtime.
- **Components use `var(--*)` only**, resolved from `src/styles/_variables.scss`; no raw colors or palettes in component code. A new theme is a `[data-theme="…"]` block there plus `ThemeId` in `src-tauri/src/settings.rs`, `src/types.ts`, and `THEME_OPTIONS` in `src/lib/theme.ts`.
- **UI copy is Chinese**; there is no i18n framework.

## Commands
- `pnpm tauri dev` — the app; frontend port `1420` is fixed with `strictPort`, so it must be free. `pnpm dev` — frontend only, but window controls and IPC need a real Tauri session.
- `pnpm build` — `tsc && vite build`; `tsc` is strict and is the only typecheck (unused locals/params fail it). `pnpm tauri build` — release bundle.
- Rust is compiled by the Tauri CLI; no cargo script is wired into the web workflow. No lint and no web tests — the only tests are the pure-geometry menu-placement ones in `src-tauri/src/tray.rs` (`cargo test`).

## Architecture
- `src/components/` splits into `layout` (shell, sidebar, window controls), `run` (instance tabs, log window), `config` (list, editor, field sections), `tray` (the menu), `ui` (primitives). `src/lib/` holds the invoke wrappers (`tauri.ts`), TOML read/write (`toml.ts`), the proxy/visitor field schema (`proxySchema.ts`), ANSI parsing, and theme helpers.
- Styles are SCSS split by concern; `src/styles/index.scss` is the entry and the authoritative partial list — `@use "variables"` for tokens, import `index.scss` from each window root (`App.tsx`, `TrayMenu.tsx`).
- UI primitives live in `src/components/ui/` (Button, Switch, StatusDot, Icon, Modal, PromptDialog, ConfirmDialog, SettingsDialog — see `index.ts`) and are imported via the `@components/ui` alias, declared in both `vite.config.ts` and `tsconfig.json`. Prefer them to ad-hoc JSX.
- One frontend bundle serves two windows: `main` and the tray menu, which loads `index.html#tray` and is routed in `src/main.tsx`. Both names must stay in `capabilities/default.json` → `windows`.
- Rust: `config.rs` (TOML CRUD under `configs/`), `process.rs` (`ProcessManager`: roster, child processes spawned with `CREATE_NO_WINDOW`, 2000-line log ring, emits `instance-changed` / `instance-log`), `settings.rs` (`settings.json`, `ThemeId`, `CloseBehavior`), `tray.rs` (tray icon, menu anchoring, emits `tray-menu-open`). Backend→frontend is Tauri events consumed with `listen()`.
- All state is in the app data dir: `configs/*.toml`, `settings.json`, `instances.json`. The instance roster survives a restart; the processes do not.
- Rust lib crate is `frpcmanager_v3_lib` (unique name required on Windows) and `main.rs` calls `run()` — don't rename. `vite.config.ts` ignores `src-tauri/**` in watch — keep it that way.

## UI
**Language.** Linear / Raycast / TablePlus: little chrome, type weight and 4px spacing (`--space-1..5`) carry hierarchy, color only for status. Do not copy Clash-style traffic dashboards or generic AI UIs (gradient logo tiles, rainbow nav dots, stacked title bars, nested rounded cards, Inter/Geist, glass, drop-shadow cards). Selection — nav item, list row, tab — is `--bg-hover` + body text, plus a 2px left accent bar in lists; never an `--accent*` fill. `--accent` is primary buttons and `:focus-visible` only; `--ok/--warn/--err` are StatusDot, validation and danger actions only; Switch on-state is `--accent`, not green.

**Shell.** Frameless window (`decorations: false`), title `FrpcManager`, `productName` stays `frpcmanager_v3`. Integrated caption controls (`WindowControls`) sit top-right of `.app-main` on a 52px row — no second title row; `.page-header` reserves `--window-controls-width` (138px) on the right for them. Drag regions are `.sidebar-brand` and `.toolbar-spacer` only; close-button hover uses `--err`. One sidebar (brand, icon nav, settings, version) + `main`, nothing above `.page-header`, and `.app-main` has no padding — panes meet on a 1px `--border`. Page-level actions live in the pane's own bar (`新增实例` / `全部停止` on `.instance-tabs-bar`, `新建配置` on `.config-list-toolbar`), never in `.page-header`; the running count appears only on the run page.

**Panes and lists.** Flush panes, no card-in-card. A row is title + secondary meta; row actions (rename, delete, tab close) appear on hover, and may stay visible on the selected row. Empty copy is a product sentence plus one action — never scaffolding or developer notes.

**Config editor.** Server common fields render with no collapsible header (`FieldSection` without `title`); advanced groups collapse by default, their header being type + chevron on a transparent background. Proxies and visitors are flat lists whose inspector renders **below that group** — not an in-row accordion, not a per-field modal. The type picker is a flat list with native `title` hints, not CSS `::after` tooltips. Saving is document-level: `Ctrl+S` and the footer, secondary (刷新) then primary (保存), right-aligned.

**Controls.** Buttons are 28px: primary solid muted accent, ghost transparent, danger outline that strengthens on hover. Unwired actions stay `disabled` with a `title` reason — never a clickable no-op. Modals keep the hairline border + short shadow, dismiss on Esc and overlay click, and right-align a cancel-first footer. The tray menu reuses one action list for mouse and keyboard, so its render order and keyboard indices must stay in sync; its panel shadow drives `INSET` in `TrayMenu.tsx`, which must stay ≥ the shadow blur + offset in `_tray-menu.scss` because Rust places the window from it.

**Keyboard.** `Ctrl+1` / `Ctrl+2` switch views, ignored while focus is in input/textarea/select/contenteditable; `Ctrl+S` saves the open config. Shortcuts are documented in `title`; do not add a Kbd primitive.

**Definition of done.** `pnpm build` clean · no emoji or CSS-drawn glyphs · every color via `var(--*)` · new IPC registered and wrapped in `lib/tauri.ts`, core/plugin calls permitted · Chinese copy · unavailable actions `disabled` with a reason.
