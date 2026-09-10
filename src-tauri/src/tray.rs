use crate::settings::{read_settings, CloseBehavior};
use serde::Serialize;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

/// 自绘托盘菜单的窗口标签；capabilities 里必须放行同名窗口。
pub const MENU_WINDOW: &str = "tray-menu";
/// 菜单窗口的页面入口：与主窗口共用同一份前端产物，用 hash 分流。
const MENU_PAGE: &str = "index.html#tray";
/// 打开菜单时通知前端重新取数据并测量尺寸的事件名。
const OPEN_EVENT: &str = "tray-menu-open";

/// 关闭后短时间内忽略重开：点托盘图标关菜单时，系统先派发失焦再派发点击。
const REOPEN_GUARD: Duration = Duration::from_millis(250);
/// 菜单高度上限（逻辑像素）：超出后列表内部滚动。
const MENU_MAX_HEIGHT: f64 = 520.0;
/// 菜单高度下限（逻辑像素）：至少要放得下标题栏 + 底栏，否则底栏会被裁掉。
const MENU_MIN_HEIGHT: f64 = 160.0;

/// 任务栏所在边，决定菜单朝哪个方向展开。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum TaskbarEdge {
    Top,
    Bottom,
    Left,
    Right,
}

/// 打开菜单时的光标位置快照，定位与避让都基于它。
#[derive(Clone, Copy)]
struct Anchor {
    /// 光标的物理坐标。
    x: f64,
    y: f64,
    /// 光标所在显示器的缩放系数与物理区域。
    scale: f64,
    monitor: (f64, f64, f64, f64),
    edge: TaskbarEdge,
    /// 菜单可用高度（逻辑像素），由前端用来限制面板高度。
    max_height: f64,
}

impl Anchor {
    /// 把逻辑尺寸的菜单窗口摆到光标旁，返回窗口左上角的物理坐标。
    ///
    /// 摆放规则与原生 `TrackPopupMenu` 一致：菜单紧贴光标的那个角对齐
    /// （底任务栏是左下角、顶任务栏是左上角、右任务栏是右下角），
    /// 只有超出显示器时才夹回边界内避让。
    fn place(&self, width: f64, height: f64, inset: f64) -> (f64, f64) {
        let scale = self.scale;
        // 窗口比面板大一圈（四周留透明边距画阴影）
        let (win_w, win_h, pad) = (width * scale, height * scale, inset * scale);
        let (panel_w, panel_h) = (win_w - pad * 2.0, win_h - pad * 2.0);
        let (mx, my, mw, mh) = self.monitor;

        // 先按"某个角贴住光标"算出面板左上角，再夹进显示器避让
        let (panel_x, panel_y) = match self.edge {
            // 底任务栏：菜单朝左上展开，左下角贴光标
            TaskbarEdge::Bottom => (self.x, self.y - panel_h),
            // 顶任务栏：菜单朝左下展开，左上角贴光标
            TaskbarEdge::Top => (self.x, self.y),
            // 左任务栏：菜单朝右上展开，左下角贴光标
            TaskbarEdge::Left => (self.x, self.y - panel_h),
            // 右任务栏：菜单朝左上展开，右下角贴光标
            TaskbarEdge::Right => (self.x - panel_w, self.y - panel_h),
        };

        // 夹的是面板而不是窗口：阴影留白可以露到屏幕外，面板贴边不虚留空隙
        (
            clamp_axis(panel_x, mx, mx + mw - panel_w) - pad,
            clamp_axis(panel_y, my, my + mh - panel_h) - pad,
        )
    }
}

/// 夹到显示器范围内；菜单比可用空间还大时贴左上。
fn clamp_axis(value: f64, min: f64, max: f64) -> f64 {
    if max < min {
        min
    } else {
        value.clamp(min, max)
    }
}

#[derive(Default)]
struct MenuState {
    anchor: Option<Anchor>,
    last_hidden: Option<Instant>,
}

/// 托盘菜单状态：锚点 + 最近一次关闭时间。
#[derive(Default)]
pub struct TrayMenuState(Mutex<MenuState>);

impl TrayMenuState {
    fn lock(&self) -> std::sync::MutexGuard<'_, MenuState> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn anchor(&self) -> Option<Anchor> {
        self.lock().anchor
    }

    fn set_anchor(&self, anchor: Anchor) {
        self.lock().anchor = Some(anchor);
    }

    fn note_hidden(&self) {
        self.lock().last_hidden = Some(Instant::now());
    }

    /// 刚刚才关掉（这次点击本意是"关闭菜单"，不该立刻重开）。
    fn just_hidden(&self) -> bool {
        matches!(self.lock().last_hidden, Some(t) if t.elapsed() < REOPEN_GUARD)
    }
}

/// `tray-menu-open` 事件载荷。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenPayload {
    /// 菜单可用高度（逻辑像素）。
    max_height: f64,
}

/// 显示并聚焦主窗口。
pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// 隐藏托盘菜单窗口，并记下关闭时间。
fn hide_menu(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(MENU_WINDOW) {
        window.hide().map_err(|e| e.to_string())?;
    }
    app.state::<TrayMenuState>().note_hidden();
    Ok(())
}

/// 预创建隐藏的菜单窗口：首次弹出不再等 webview 冷启动。
fn ensure_menu_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(MENU_WINDOW) {
        return Ok(window);
    }

    let window = WebviewWindowBuilder::new(app, MENU_WINDOW, WebviewUrl::App(MENU_PAGE.into()))
        .title("FrpcManager")
        .inner_size(284.0, 320.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        // 透明窗口自绘阴影，系统阴影会露出矩形边
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| format!("创建托盘菜单窗口失败：{e}"))?;

    let handle = window.clone();
    window.on_window_event(move |event| {
        // 点到菜单外面就关掉，和原生菜单一致
        if let WindowEvent::Focused(false) = event {
            let _ = handle.hide();
            handle.state::<TrayMenuState>().note_hidden();
        }
    });

    Ok(window)
}

/// 由光标位置推算锚点：就近边判定任务栏方向，并算出光标一侧的可用高度。
fn compute_anchor(app: &AppHandle, cursor: PhysicalPosition<f64>) -> Option<Anchor> {
    let monitor = app.monitor_from_point(cursor.x, cursor.y).ok().flatten()?;
    let scale = monitor.scale_factor();
    let (mx, my) = (monitor.position().x as f64, monitor.position().y as f64);
    let (mw, mh) = (monitor.size().width as f64, monitor.size().height as f64);
    let (x, y) = (cursor.x, cursor.y);
    let monitor = (mx, my, mw, mh);
    let edge = nearest_edge(x, y, monitor);

    // 顶任务栏菜单朝下展开，其余都是踩在光标上朝上展开
    let available = match edge {
        TaskbarEdge::Top => my + mh - y,
        _ => y - my,
    };
    let max_height = (available / scale).clamp(MENU_MIN_HEIGHT, MENU_MAX_HEIGHT);

    Some(Anchor {
        x,
        y,
        scale,
        monitor,
        edge,
        max_height,
    })
}

/// 就近边判定：托盘图标就在任务栏上，离哪条屏幕边最近，任务栏就在哪条边。
fn nearest_edge(x: f64, y: f64, monitor: (f64, f64, f64, f64)) -> TaskbarEdge {
    let (mx, my, mw, mh) = monitor;
    let (to_left, to_right) = (x - mx, mx + mw - x);
    let (to_top, to_bottom) = (y - my, my + mh - y);

    // 图标在任务栏上时该边距离为负，仍会是最小值
    if to_left <= to_right && to_left <= to_top && to_left <= to_bottom {
        TaskbarEdge::Left
    } else if to_right <= to_top && to_right <= to_bottom {
        TaskbarEdge::Right
    } else if to_top <= to_bottom {
        TaskbarEdge::Top
    } else {
        TaskbarEdge::Bottom
    }
}

/// 打开菜单：记下光标锚点，让前端取最新数据并测量高度。
fn toggle_menu(app: &AppHandle, cursor: PhysicalPosition<f64>) {
    let Some(window) = app.get_webview_window(MENU_WINDOW) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = hide_menu(app);
        return;
    }
    // 刚因为失焦关掉：这次点击是"关闭"，不再重开
    if app.state::<TrayMenuState>().just_hidden() {
        return;
    }
    let Some(anchor) = compute_anchor(app, cursor) else {
        return;
    };
    app.state::<TrayMenuState>().set_anchor(anchor);
    let _ = app.emit_to(
        MENU_WINDOW,
        OPEN_EVENT,
        OpenPayload {
            max_height: anchor.max_height,
        },
    );
}

/// 注册系统托盘图标与菜单。
pub fn register(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(TrayMenuState::default());

    let icon = app
        .default_window_icon()
        .ok_or("缺少窗口图标，无法创建托盘")?
        .clone();

    let handle = app.handle().clone();
    ensure_menu_window(&handle)?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("FrpcManager")
        .on_tray_icon_event(|tray, event| {
            let app = tray.app_handle();
            match event {
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } => {
                    let _ = hide_menu(app);
                    show_main_window(app);
                }
                TrayIconEvent::Click {
                    button: MouseButton::Right,
                    button_state: MouseButtonState::Up,
                    position,
                    ..
                } => toggle_menu(app, position),
                _ => {}
            }
        })
        .build(app)?;

    Ok(())
}

/// 按前端测量出的尺寸摆好菜单窗口；首次调用会显示并聚焦。
#[tauri::command]
pub fn open_tray_menu(app: AppHandle, height: f64, width: f64, inset: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(MENU_WINDOW)
        .ok_or("托盘菜单窗口不存在")?;
    let anchor = app
        .state::<TrayMenuState>()
        .anchor()
        .ok_or("托盘菜单锚点已失效")?;

    let (width, height, inset) = (width.max(1.0), height.max(1.0), inset.max(0.0));
    let (x, y) = anchor.place(width, height, inset);

    // 位置与尺寸都按目标显示器的物理像素计算，跨缩放的多屏才不会偏
    window
        .set_size(PhysicalSize::new(
            (width * anchor.scale).round() as u32,
            (height * anchor.scale).round() as u32,
        ))
        .map_err(|e| e.to_string())?;
    window
        .set_position(PhysicalPosition::new(x.round() as i32, y.round() as i32))
        .map_err(|e| e.to_string())?;

    if !window.is_visible().unwrap_or(false) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 关闭托盘菜单（Esc、执行完打开主窗口等）。
#[tauri::command]
pub fn hide_tray_menu(app: AppHandle) -> Result<(), String> {
    hide_menu(&app)
}

/// 从菜单打开主窗口。
#[tauri::command]
pub fn open_main_window(app: AppHandle) {
    let _ = hide_menu(&app);
    show_main_window(&app);
}

/// 从菜单退出应用。
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// 按设置拦截主窗口关闭：最小化到托盘时阻止销毁并隐藏。
pub fn attach_close_handler(window: &WebviewWindow) {
    let app = window.app_handle().clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let behavior = read_settings(&app)
                .map(|s| s.close_behavior)
                .unwrap_or(CloseBehavior::Quit);
            if behavior == CloseBehavior::Tray {
                api.prevent_close();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
        }
        // 主窗口被激活时收起菜单；菜单失焦本来也会自己收，这里兜底
        if let WindowEvent::Focused(true) = event {
            let _ = hide_menu(&app);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const W: f64 = 284.0;
    const H: f64 = 300.0;
    const INSET: f64 = 10.0;

    /// 光标落在 1920x1080 @1x 的显示器上。
    fn anchor(x: f64, y: f64, edge: TaskbarEdge) -> Anchor {
        Anchor {
            x,
            y,
            scale: 1.0,
            monitor: (0.0, 0.0, 1920.0, 1080.0),
            edge,
            max_height: 480.0,
        }
    }

    /// 面板矩形（左, 上, 右, 下）：窗口位置去掉四周阴影留白，按显示器缩放换算。
    fn panel(a: &Anchor, height: f64) -> (f64, f64, f64, f64) {
        let (scale, pad) = (a.scale, INSET * a.scale);
        let (x, y) = a.place(W, height, INSET);
        (
            x + pad,
            y + pad,
            x + W * scale - pad,
            y + height * scale - pad,
        )
    }

    #[test]
    fn corner_sits_on_cursor() {
        // 就近角贴住光标：底=左下、顶=左上、左=左下、右=右下
        let (l, _, _, b) = panel(&anchor(900.0, 800.0, TaskbarEdge::Bottom), H);
        assert_eq!((l, b), (900.0, 800.0));

        let (l, t, _, _) = panel(&anchor(900.0, 200.0, TaskbarEdge::Top), H);
        assert_eq!((l, t), (900.0, 200.0));

        let (l, _, _, b) = panel(&anchor(300.0, 500.0, TaskbarEdge::Left), H);
        assert_eq!((l, b), (300.0, 500.0));

        let (_, _, r, b) = panel(&anchor(1500.0, 500.0, TaskbarEdge::Right), H);
        assert_eq!((r, b), (1500.0, 500.0));
    }

    #[test]
    fn in_place_when_it_fits() {
        // 600x700 处有足够空间：面板 264x280，左下角就落在光标上（窗口再外扩阴影留白）
        let (x, y) = anchor(600.0, 700.0, TaskbarEdge::Bottom).place(W, H, INSET);
        assert_eq!((x, y), (590.0, 410.0));
    }

    #[test]
    fn overflowing_menu_is_pushed_back_inside() {
        // 右下角：水平方向顶到屏幕右边，垂直方向仍踩在光标上
        let (l, t, r, b) = panel(&anchor(1800.0, 1058.0, TaskbarEdge::Bottom), H);
        assert_eq!((l, t, r, b), (1656.0, 778.0, 1920.0, 1058.0));

        // 顶部空间不够时向下翻，面板顶边贴到屏幕顶
        let (_, t, _, _) = panel(&anchor(900.0, 100.0, TaskbarEdge::Bottom), H);
        assert_eq!(t, 0.0);
    }

    #[test]
    fn clamps_into_offset_monitor() {
        // 副屏起点在 x=1920、缩放 2：面板 264x280，夹取范围必须带上显示器偏移
        let mut a = anchor(2000.0, 700.0, TaskbarEdge::Left);
        a.scale = 2.0;
        a.monitor = (1920.0, 0.0, 2560.0, 1440.0);
        let (l, t, _, b) = panel(&a, H);
        assert_eq!((l, t, b), (2000.0, 140.0, 700.0));
    }

    #[test]
    fn taller_than_screen_sticks_to_top() {
        let a = anchor(1800.0, 1058.0, TaskbarEdge::Bottom);
        let (_, t, _, _) = panel(&a, 2000.0);
        assert_eq!(t, 0.0);
    }

    #[test]
    fn nearest_edge_follows_taskbar() {
        let monitor = (0.0, 0.0, 1920.0, 1080.0);
        // 底部任务栏的图标落在屏幕外，距离为负，仍应判为 Bottom
        assert_eq!(nearest_edge(1800.0, 1088.0, monitor), TaskbarEdge::Bottom);
        assert_eq!(nearest_edge(1800.0, 4.0, monitor), TaskbarEdge::Top);
        assert_eq!(nearest_edge(4.0, 500.0, monitor), TaskbarEdge::Left);
        assert_eq!(nearest_edge(1916.0, 500.0, monitor), TaskbarEdge::Right);
    }
}
