use serde::Serialize;
use std::fs;
use std::io;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const DEFAULT_CONFIG_TEMPLATE: &str = r#"serverAddr = "127.0.0.1"
serverPort = 7000

[[proxies]]
name = "example_tcp"
type = "tcp"
localIP = "127.0.0.1"
localPort = 8080
remotePort = 6000
"#;

/// 配置文件元数据。name 不含扩展名。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigMeta {
    pub name: String,
    pub size: u64,
    pub modified_at: u64,
}

fn configs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("configs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn resolve_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains(['\\', '/', ':']) || name.contains("..") {
        return Err("配置文件名不合法".to_string());
    }
    Ok(configs_dir(app)?.join(format!("{name}.toml")))
}

/// 配置 toml 的绝对路径。`name` 为不含扩展名的文件名。
pub(crate) fn config_file_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    resolve_path(app, name)
}

fn path_meta(name: String, path: &PathBuf) -> io::Result<ConfigMeta> {
    let meta = fs::metadata(path)?;
    Ok(ConfigMeta {
        name,
        size: meta.len(),
        modified_at: meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0),
    })
}

#[tauri::command]
pub fn get_configs_dir(app: AppHandle) -> Result<String, String> {
    configs_dir(&app).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
pub fn list_config_files(app: AppHandle) -> Result<Vec<ConfigMeta>, String> {
    let dir = configs_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("toml") {
            continue;
        }
        let name = path
            .file_stem()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if let Ok(meta) = path_meta(name, &path) {
            out.push(meta);
        }
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn read_config_file(app: AppHandle, name: String) -> Result<String, String> {
    let path = resolve_path(&app, &name)?;
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_config_file(app: AppHandle, name: String, content: String) -> Result<(), String> {
    let path = resolve_path(&app, &name)?;
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_config_file(app: AppHandle, name: String) -> Result<(), String> {
    let path = resolve_path(&app, &name)?;
    if path.exists() {
        return Err("配置文件已存在".to_string());
    }
    fs::write(&path, DEFAULT_CONFIG_TEMPLATE.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_config_file(app: AppHandle, name: String) -> Result<(), String> {
    let path = resolve_path(&app, &name)?;
    if !path.exists() {
        return Err("配置文件不存在".to_string());
    }
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_config_file(
    app: AppHandle,
    old_name: String,
    new_name: String,
) -> Result<(), String> {
    let old_path = resolve_path(&app, &old_name)?;
    let new_path = resolve_path(&app, &new_name)?;
    if !old_path.exists() {
        return Err("源配置文件不存在".to_string());
    }
    if new_path.exists() {
        return Err("目标配置文件已存在".to_string());
    }
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}