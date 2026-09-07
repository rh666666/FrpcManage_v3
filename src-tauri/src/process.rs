use crate::config;
use crate::settings;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Windows 启动约束：不弹出控制台窗口。
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const LOG_LIMIT: usize = 2000;
const ROSTER_FILE: &str = "instances.json";
const EVENT_CHANGED: &str = "instance-changed";
const EVENT_LOG: &str = "instance-log";

static ID_SEQ: AtomicU64 = AtomicU64::new(0);

/// 运行实例对外快照。pid / startedAt 为空时不序列化。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrpcInstance {
    pub id: String,
    pub name: String,
    pub config_name: String,
    pub status: InstanceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstanceStatus {
    Running,
    Stopped,
    Error,
}

/// `instance-log` 事件载荷。
#[derive(Clone, Serialize)]
pub struct InstanceLog {
    pub id: String,
    pub line: String,
}

/// 花名册条目：仅 id / name / configName 落盘。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RosterEntry {
    id: String,
    name: String,
    config_name: String,
}

struct ManagedInstance {
    id: String,
    name: String,
    config_name: String,
    status: InstanceStatus,
    pid: Option<u32>,
    started_at: Option<u64>,
    child: Option<Child>,
    logs: VecDeque<String>,
}

impl ManagedInstance {
    fn from_roster(entry: RosterEntry) -> Self {
        Self {
            id: entry.id,
            name: entry.name,
            config_name: entry.config_name,
            status: InstanceStatus::Stopped,
            pid: None,
            started_at: None,
            child: None,
            logs: VecDeque::new(),
        }
    }

    fn snapshot(&self) -> FrpcInstance {
        FrpcInstance {
            id: self.id.clone(),
            name: self.name.clone(),
            config_name: self.config_name.clone(),
            status: self.status,
            pid: self.pid,
            started_at: self.started_at,
        }
    }
}

struct Inner {
    order: Vec<String>,
    by_id: HashMap<String, ManagedInstance>,
}

impl Inner {
    fn snapshots(&self) -> Vec<FrpcInstance> {
        self.order
            .iter()
            .filter_map(|id| self.by_id.get(id).map(ManagedInstance::snapshot))
            .collect()
    }

    fn roster(&self) -> Vec<RosterEntry> {
        self.order
            .iter()
            .filter_map(|id| {
                self.by_id.get(id).map(|inst| RosterEntry {
                    id: inst.id.clone(),
                    name: inst.name.clone(),
                    config_name: inst.config_name.clone(),
                })
            })
            .collect()
    }
}

/// 实例运行时状态：花名册 + 子进程 + 日志环。日志与 PID 不落盘。
pub struct ProcessManager {
    inner: Mutex<Inner>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id() -> String {
    let seq = ID_SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{}-{seq}", now_ms())
}

fn roster_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(ROSTER_FILE))
}

fn emit_changed(app: &AppHandle, list: &[FrpcInstance]) {
    let _ = app.emit(EVENT_CHANGED, list);
}

fn persist(app: &AppHandle, inner: &Inner) -> Result<(), String> {
    let path = roster_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(&inner.roster()).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("保存实例列表失败：{e}"))
}

fn spawn_frpc(frpc_path: &PathBuf, config_path: &PathBuf) -> Result<Child, String> {
    let mut cmd = Command::new(frpc_path);
    cmd.arg("-c")
        .arg(config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn().map_err(|e| format!("启动 frpc 失败：{e}"))
}

fn spawn_pipe_reader(app: AppHandle, id: String, pipe: impl Read + Send + 'static) {
    thread::spawn(move || {
        let mut reader = BufReader::new(pipe);
        let mut raw = Vec::new();
        loop {
            raw.clear();
            match reader.read_until(b'\n', &mut raw) {
                Ok(0) => break,
                Ok(_) => {
                    if raw.ends_with(&[b'\n']) {
                        raw.pop();
                    }
                    if raw.ends_with(&[b'\r']) {
                        raw.pop();
                    }
                    let line = String::from_utf8_lossy(&raw).into_owned();
                    let mgr = app.state::<ProcessManager>();
                    if mgr.push_log(&id, &line) {
                        let _ = app.emit(
                            EVENT_LOG,
                            InstanceLog {
                                id: id.clone(),
                                line,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_waiter(app: AppHandle, id: String) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(80));
        let mgr = app.state::<ProcessManager>();
        let outcome = {
            let mut inner = match mgr.lock() {
                Ok(g) => g,
                Err(_) => return,
            };
            let Some(inst) = inner.by_id.get_mut(&id) else {
                return;
            };
            let Some(child) = inst.child.as_mut() else {
                return;
            };
            match child.try_wait() {
                Ok(None) => None,
                Ok(Some(status)) => {
                    inst.child = None;
                    inst.pid = None;
                    inst.started_at = None;
                    inst.status = if status.success() {
                        InstanceStatus::Stopped
                    } else {
                        InstanceStatus::Error
                    };
                    Some(inner.snapshots())
                }
                Err(_) => {
                    inst.child = None;
                    inst.pid = None;
                    inst.started_at = None;
                    inst.status = InstanceStatus::Error;
                    Some(inner.snapshots())
                }
            }
        };
        if let Some(list) = outcome {
            emit_changed(&app, &list);
            return;
        }
    });
}

impl ProcessManager {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(Inner {
                order: Vec::new(),
                by_id: HashMap::new(),
            }),
        }
    }

    fn lock(&self) -> Result<MutexGuard<'_, Inner>, String> {
        self.inner
            .lock()
            .map_err(|_| "内部状态锁已损坏".to_string())
    }

    /// 从花名册加载；启动后全部为 stopped。
    pub fn hydrate(&self, app: &AppHandle) -> Result<(), String> {
        let path = roster_path(app)?;
        if !path.exists() {
            return Ok(());
        }
        let raw = fs::read_to_string(&path).map_err(|e| format!("读取实例列表失败：{e}"))?;
        let entries: Vec<RosterEntry> =
            serde_json::from_str(&raw).map_err(|e| format!("实例列表解析失败：{e}"))?;
        let mut inner = self.lock()?;
        inner.order.clear();
        inner.by_id.clear();
        for entry in entries {
            if entry.id.is_empty() || inner.by_id.contains_key(&entry.id) {
                continue;
            }
            inner.order.push(entry.id.clone());
            inner
                .by_id
                .insert(entry.id.clone(), ManagedInstance::from_roster(entry));
        }
        Ok(())
    }

    fn list(&self) -> Result<Vec<FrpcInstance>, String> {
        Ok(self.lock()?.snapshots())
    }

    fn push_log(&self, id: &str, line: &str) -> bool {
        let Ok(mut inner) = self.inner.lock() else {
            return false;
        };
        let Some(inst) = inner.by_id.get_mut(id) else {
            return false;
        };
        if inst.logs.len() >= LOG_LIMIT {
            inst.logs.pop_front();
        }
        inst.logs.push_back(line.to_string());
        true
    }

    fn create(
        &self,
        app: &AppHandle,
        name: String,
        config_name: String,
    ) -> Result<FrpcInstance, String> {
        let config_name = config_name.trim().to_string();
        let path = config::config_file_path(app, &config_name)?;
        if !path.is_file() {
            return Err("配置文件不存在".to_string());
        }
        let name = {
            let trimmed = name.trim();
            if trimmed.is_empty() {
                config_name.clone()
            } else {
                trimmed.to_string()
            }
        };
        let mut inner = self.lock()?;
        let mut id = new_id();
        while inner.by_id.contains_key(&id) {
            id = new_id();
        }
        let inst = ManagedInstance {
            id: id.clone(),
            name,
            config_name,
            status: InstanceStatus::Stopped,
            pid: None,
            started_at: None,
            child: None,
            logs: VecDeque::new(),
        };
        let snap = inst.snapshot();
        inner.order.push(id.clone());
        inner.by_id.insert(id, inst);
        persist(app, &inner)?;
        let list = inner.snapshots();
        drop(inner);
        emit_changed(app, &list);
        Ok(snap)
    }

    /// 若仍在跑则先停再删。
    fn remove(&self, app: &AppHandle, id: &str) -> Result<(), String> {
        {
            let inner = self.lock()?;
            if !inner.by_id.contains_key(id) {
                return Err("实例不存在".to_string());
            }
        }
        self.reap_child(id)?;
        let mut inner = self.lock()?;
        inner.by_id.remove(id);
        inner.order.retain(|x| x != id);
        persist(app, &inner)?;
        let list = inner.snapshots();
        drop(inner);
        emit_changed(app, &list);
        Ok(())
    }

    fn start(&self, app: &AppHandle, id: &str) -> Result<FrpcInstance, String> {
        let config_name = {
            let inner = self.lock()?;
            let inst = inner
                .by_id
                .get(id)
                .ok_or_else(|| "实例不存在".to_string())?;
            if inst.child.is_some() {
                return Err("实例已在运行".to_string());
            }
            inst.config_name.clone()
        };

        let settings = settings::read_settings(app)?;
        let frpc = settings
            .frpc_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "尚未设置 frpc 路径".to_string())?;
        let frpc_path = PathBuf::from(frpc);
        if !frpc_path.is_file() {
            return Err(format!("路径不存在：{frpc}"));
        }
        let config_path = config::config_file_path(app, &config_name)?;
        if !config_path.is_file() {
            return Err("配置文件不存在".to_string());
        }

        let mut child = spawn_frpc(&frpc_path, &config_path)?;
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let pid = child.id();

        let snap = {
            let mut inner = match self.lock() {
                Ok(g) => g,
                Err(e) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(e);
                }
            };
            let Some(inst) = inner.by_id.get_mut(id) else {
                let _ = child.kill();
                let _ = child.wait();
                return Err("实例不存在".to_string());
            };
            if inst.child.is_some() {
                let _ = child.kill();
                let _ = child.wait();
                return Err("实例已在运行".to_string());
            }
            inst.child = Some(child);
            inst.status = InstanceStatus::Running;
            inst.pid = Some(pid);
            inst.started_at = Some(now_ms());
            let snap = inst.snapshot();
            let list = inner.snapshots();
            drop(inner);
            emit_changed(app, &list);
            snap
        };

        if let Some(out) = stdout {
            spawn_pipe_reader(app.clone(), id.to_string(), out);
        }
        if let Some(err) = stderr {
            spawn_pipe_reader(app.clone(), id.to_string(), err);
        }
        spawn_waiter(app.clone(), id.to_string());
        Ok(snap)
    }

    fn reap_child(&self, id: &str) -> Result<FrpcInstance, String> {
        let child_taken = {
            let mut inner = self.lock()?;
            let inst = inner
                .by_id
                .get_mut(id)
                .ok_or_else(|| "实例不存在".to_string())?;
            inst.child.take()
        };
        if let Some(mut child) = child_taken {
            let _ = child.kill();
            let _ = child.wait();
            let mut inner = self.lock()?;
            let inst = inner
                .by_id
                .get_mut(id)
                .ok_or_else(|| "实例不存在".to_string())?;
            inst.status = InstanceStatus::Stopped;
            inst.pid = None;
            inst.started_at = None;
            Ok(inst.snapshot())
        } else {
            let inner = self.lock()?;
            let inst = inner
                .by_id
                .get(id)
                .ok_or_else(|| "实例不存在".to_string())?;
            Ok(inst.snapshot())
        }
    }

    fn stop(&self, app: &AppHandle, id: &str) -> Result<FrpcInstance, String> {
        let before_running = {
            let inner = self.lock()?;
            let inst = inner
                .by_id
                .get(id)
                .ok_or_else(|| "实例不存在".to_string())?;
            inst.child.is_some()
        };
        let snap = self.reap_child(id)?;
        if before_running {
            emit_changed(app, &self.list()?);
        }
        Ok(snap)
    }

    fn restart(&self, app: &AppHandle, id: &str) -> Result<FrpcInstance, String> {
        self.stop(app, id)?;
        self.start(app, id)
    }

    fn stop_all(&self, app: &AppHandle) -> Result<Vec<FrpcInstance>, String> {
        let ids: Vec<String> = {
            let inner = self.lock()?;
            inner
                .order
                .iter()
                .filter(|id| {
                    inner
                        .by_id
                        .get(*id)
                        .map(|inst| inst.child.is_some())
                        .unwrap_or(false)
                })
                .cloned()
                .collect()
        };
        for id in &ids {
            let _ = self.reap_child(id);
        }
        let list = self.list()?;
        if !ids.is_empty() {
            emit_changed(app, &list);
        }
        Ok(list)
    }

    fn logs(&self, id: &str) -> Result<Vec<String>, String> {
        let inner = self.lock()?;
        let inst = inner
            .by_id
            .get(id)
            .ok_or_else(|| "实例不存在".to_string())?;
        Ok(inst.logs.iter().cloned().collect())
    }

    fn clear_logs(&self, id: &str) -> Result<(), String> {
        let mut inner = self.lock()?;
        let inst = inner
            .by_id
            .get_mut(id)
            .ok_or_else(|| "实例不存在".to_string())?;
        inst.logs.clear();
        Ok(())
    }

    /// 同步杀掉全部仍在跑的 frpc。退出路径使用，不发事件。
    pub fn kill_all(&self) {
        let mut inner = match self.inner.lock() {
            Ok(g) => g,
            Err(p) => p.into_inner(),
        };
        for inst in inner.by_id.values_mut() {
            if let Some(mut child) = inst.child.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
            inst.status = InstanceStatus::Stopped;
            inst.pid = None;
            inst.started_at = None;
        }
    }
}

#[tauri::command]
pub fn list_instances(manager: State<ProcessManager>) -> Result<Vec<FrpcInstance>, String> {
    manager.list()
}

#[tauri::command]
pub fn create_instance(
    app: AppHandle,
    manager: State<ProcessManager>,
    name: String,
    config_name: String,
) -> Result<FrpcInstance, String> {
    manager.create(&app, name, config_name)
}

#[tauri::command]
pub fn remove_instance(
    app: AppHandle,
    manager: State<ProcessManager>,
    id: String,
) -> Result<(), String> {
    manager.remove(&app, &id)
}

#[tauri::command]
pub fn start_instance(
    app: AppHandle,
    manager: State<ProcessManager>,
    id: String,
) -> Result<FrpcInstance, String> {
    manager.start(&app, &id)
}

#[tauri::command]
pub fn stop_instance(
    app: AppHandle,
    manager: State<ProcessManager>,
    id: String,
) -> Result<FrpcInstance, String> {
    manager.stop(&app, &id)
}

#[tauri::command]
pub fn restart_instance(
    app: AppHandle,
    manager: State<ProcessManager>,
    id: String,
) -> Result<FrpcInstance, String> {
    manager.restart(&app, &id)
}

#[tauri::command]
pub fn stop_all_instances(
    app: AppHandle,
    manager: State<ProcessManager>,
) -> Result<Vec<FrpcInstance>, String> {
    manager.stop_all(&app)
}

#[tauri::command]
pub fn get_instance_logs(
    manager: State<ProcessManager>,
    id: String,
) -> Result<Vec<String>, String> {
    manager.logs(&id)
}

#[tauri::command]
pub fn clear_instance_logs(manager: State<ProcessManager>, id: String) -> Result<(), String> {
    manager.clear_logs(&id)
}
