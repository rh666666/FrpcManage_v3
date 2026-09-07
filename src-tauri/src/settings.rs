use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const SETTINGS_FILE: &str = "settings.json";

/// 持久化主题标识；未知值拒绝写入。
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ThemeId {
    #[default]
    Dark,
    Light,
    #[serde(rename = "aishenleishen")]
    AishenLeishen,
}

impl ThemeId {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "dark" => Ok(Self::Dark),
            "light" => Ok(Self::Light),
            "aishenleishen" => Ok(Self::AishenLeishen),
            _ => Err(format!("未知主题：{value}")),
        }
    }
}

/// 落盘到 settings.json 的应用设置。
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub frpc_path: Option<String>,
    #[serde(default)]
    pub theme: ThemeId,
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(SETTINGS_FILE))
}

pub(crate) fn read_settings(app: &AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("读取设置失败：{e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("设置文件解析失败：{e}"))
}

fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| format!("保存设置失败：{e}"))
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<Settings, String> {
    read_settings(&app)
}

#[tauri::command]
pub fn set_frpc_path(app: AppHandle, path: String) -> Result<Settings, String> {
    let trimmed = path.trim().to_string();
    if trimmed.is_empty() {
        return Err("frpc 路径不能为空".to_string());
    }
    let p = PathBuf::from(&trimmed);
    if !p.exists() {
        return Err(format!("路径不存在：{trimmed}"));
    }
    let mut settings = read_settings(&app)?;
    settings.frpc_path = Some(trimmed);
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn clear_frpc_path(app: AppHandle) -> Result<Settings, String> {
    let mut settings = read_settings(&app)?;
    settings.frpc_path = None;
    write_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub fn set_theme(app: AppHandle, theme: String) -> Result<Settings, String> {
    let theme_id = ThemeId::parse(theme.trim())?;
    let mut settings = read_settings(&app)?;
    settings.theme = theme_id;
    write_settings(&app, &settings)?;
    Ok(settings)
}
