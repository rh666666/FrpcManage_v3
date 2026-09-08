# AGENTS.md

Tauri 2 desktop app "FrpcManager V3" (frpc multi-config & lifecycle manager). Frontend: Preact + TypeScript + Vite + SCSS. Backend: Rust (Tauri 2). Windows host.

**Status:** frpc config CRUD + visual editor implemented (backend `src-tauri/src/config.rs`, frontend `src/lib/*`, `src/components/config/*`). Process lifecycle & log view still to be implemented; the run-view is placeholder.

## Commands
- Package manager is **pnpm** (hardcoded in `src-tauri/tauri.conf.json` `beforeDevCommand`/`beforeBuildCommand`). Don't use npm/yarn.
- `pnpm tauri dev` — run the desktop app (frontend served on fixed port `1420`, strict mode: that port must be free).
- `pnpm dev` — frontend-only Vite dev server.
- `pnpm build` — typecheck (`tsc`) then `vite build`. `tsc` is the only typecheck; there is **no lint or test setup** (no scripts, no config).
- `pnpm tauri build` — release bundle.
- Rust is compiled by the tauri CLI; there is no separate cargo script wired into the web workflow.

## Architecture
- Frontend `src/` (Preact, `.tsx`). JSX resolves to **preact/hooks**, so `jsxImportSource` is `preact` and `tsconfig.json` sets `"jsx": "react-jsx"`. Use `preact/hooks` (`useState`/`useEffect`), not react.
- Backend `src-tauri/src/` (Rust). Expose `#[tauri::command]` fns and register them in `lib.rs` `invoke_handler`; `tsConfig`/capabilities live in `src-tauri/tauri.conf.json` + `src-tauri/capabilities/default.json`. Backend is called from Preact via `invoke()` from `@tauri-apps/api/core`.
- Rust lib crate is named `frpcmanager_v3_lib` (required unique name on Windows, see Cargo.toml comment); `main.rs` calls `frpcmanager_v3_lib::run()`. Don't rename it.
- `vite.config.ts` intentionally ignores `src-tauri/` from Vite watch.
- Styles are **SCSS**, split by concern under `src/styles/` with `index.scss` as entry (`_variables`/`_base`/`_ui`/`_layout`/`_run`/`_config`). Use `@use "variables"` for SCSS token variables; import `src/styles/index.scss` once (in `App.tsx`).
- Reusable UI primitives live in `src/components/ui/` (Button, StatusDot, Switch, Icon), re-exported + typed through `src/components/ui/index.ts`. Import them via the `@components/ui` alias (configured in both `vite.config.ts` and `tsconfig.json` paths). Prefer this to ad-hoc JSX.

## Conventions / gotchas
- tsconfig is strict with `noUnusedLocals`/`noUnusedParameters` — unused imports/args fail `pnpm build`.
- Tauri ACL/capabilities gate IPC: any new `#[tauri::command]` or plugin call must be permitted in `src-tauri/capabilities/default.json`, or the frontend call will be denied at runtime.
- New Rust dependencies go in `src-tauri/Cargo.toml`; UI deps in the root `package.json`.
- Keep frontend in Chinese UI text consistent with the product; there is no i18n framework yet.
- **No emoji or decorative unicode symbols** (▾▸ ✎ 🗑 📁 ＋ were removed). Use the shared SVG `Icon` component (`@components/ui`) for any UI glyph: `name` prop is a union in `src/components/ui/Icon.tsx` — add a new `PATHS` entry there rather than hardcoding a symbol. Text separators inside string logic (e.g. `parts.join(" → ")`) are kept as plain text, not icons.

## UI
Density and hierarchy follow Linear / Raycast / TablePlus: little chrome, type weight and 4px spacing (`--space-1..5`) for structure, color only for status. Do not copy Clash-style traffic dashboards or generic AI UIs (gradient logo tiles, rainbow nav dots, stacked title bars, nested rounded cards, Inter/Geist, glass, drop-shadow cards). Windows host: frameless window (`decorations: false`); integrated caption controls in `WindowControls` at top-right of `app-main` (52px, no extra title row). Window `title` is `FrpcManager` (`tauri.conf.json` `app.windows[0].title` and `index.html`); do not rename `productName` (`frpcmanager_v3`). Drag regions: `.sidebar-brand` and `.toolbar-spacer` only (`data-tauri-drag-region`); close button hover uses `--err`.

**Tokens.** All color/space/radius come from `src/styles/_variables.scss`. Theme palettes live in `[data-theme="dark|light|isolation|lieyang"]` blocks; add themes only there plus `ThemeId` in Rust/TS — components use `var(--*)` only, no hardcoded palettes (especially log/terminal blues). `--accent` is primary buttons and `:focus-visible` only. `--ok/--warn/--err` are StatusDot, validation, and danger actions only. Switch on-state uses `--accent`, not green.

**Shell.** One sidebar (brand, icon nav, settings entry, version) + `main`; no extra top bar beyond integrated window controls. Nav selected state is `--bg-hover` + body text — never `background: var(--accent-dim)`. Running count lives only on the run page header. Page chrome is `.page-header` (title + meta + drag spacer only; no page action buttons); `.app-main` has no padding — panes meet on a 1px `--border`. `.page-header` reserves `--window-controls-width` (138px) on the right for caption buttons. Run page actions (`新增实例`, `全部停止`) live on `.instance-tabs-bar`; config create lives on `.config-list-toolbar`.

**Panes and lists.** Flush panes (no card-in-card). List row = title + secondary meta; selected = `--bg-hover` + 2px left accent bar. Row actions (rename/delete) appear on hover; selected rows may keep delete visible. Empty copy is a product sentence plus one action — not scaffolding or developer notes.

**Config editor.** Server common fields render without a collapsible header (`FieldSection` with no `title`). Advanced groups stay collapsible; header is type + chevron, transparent background. Proxies/visitors: flat list, inspector **below that group** (not in-row accordion, not a field Modal). Save is document-level (`Ctrl+S` / footer). Footer actions are `justify-content: flex-end`; secondary then primary (刷新, 保存). Type picker is a flat list with native `title` hints, not CSS `::after` tooltips.

**Controls.** Button height 28px; primary solid muted accent; ghost transparent; danger outline, stronger on hover. Unwired actions stay `disabled` with a `title` reason — never clickable no-ops. Modal: hairline + short shadow, Esc / overlay dismiss unchanged. Footer: 取消 then confirm, right-aligned.

**Keyboard.** `Ctrl+1` / `Ctrl+2` switch views; ignore when focus is input/textarea/select/contenteditable. Config editor `Ctrl+S` saves. Put the shortcut in `title`; do not add a Kbd primitive.