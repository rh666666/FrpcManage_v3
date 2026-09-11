use crate::config;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::AppHandle;

/// 单次导入的扫描上限，防止误选盘符根目录时卡死。
const MAX_FILES: usize = 2000;
const MAX_DIRS: usize = 500;
/// 递归深度上限，防御性约束。
const MAX_DEPTH: usize = 32;
/// 目标名称上限，过长的名字在 Windows 上不可写。
const MAX_NAME_LEN: usize = 100;

/// 扫描来源：单个文件或一个目录。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSource {
    pub path: String,
}

/// 扫描出的候选文件（含不可用条目，由前端展示原因）。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScannedItem {
    pub source_path: String,
    /// 单文件导入为文件名；目录导入为相对所选目录的路径。
    pub source_display: String,
    pub name: String,
    pub conflict: bool,
    pub conflict_reason: Option<String>,
    pub valid: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub items: Vec<ScannedItem>,
    /// 目录模式下检查过的文件总数（含被跳过的非 toml）。
    pub scanned_files: usize,
    pub scanned_dirs: usize,
    /// 命中上限而提前结束。
    pub truncated: bool,
}

/// 导入计划条目：前端只回传源路径与目标名称。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPlanItem {
    pub source_path: String,
    pub name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub source_display: String,
    pub reason: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub imported: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<ImportFailure>,
}

/// 目标配置名允许的字符：中英文数字、下划线、连字符、点、空格。
fn name_pattern() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[\w\-.\u{4e00}-\u{9fff} ]+$").expect("导入名称正则无效"))
}

/// 是否为隐藏目录/文件：以 . 或 $ 开头，Windows 上再叠加隐藏属性。
fn is_hidden(path: &Path, name: &str) -> bool {
    if name.starts_with('.') || name.starts_with('$') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        if let Ok(meta) = fs::metadata(path) {
            return meta.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0;
        }
    }
    let _ = path;
    false
}

/// 候选文件名是否可用：名称合法且长度可写。
fn validate_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("文件名为空".to_string());
    }
    if name.chars().count() > MAX_NAME_LEN {
        return Err(format!("名称过长（超过 {MAX_NAME_LEN} 字符）"));
    }
    if !name_pattern().is_match(name) {
        return Err("名称含不支持的字符".to_string());
    }
    Ok(())
}

/// 校验 TOML：非 UTF-8 或语法错误都视为不可导入。
fn validate_content(path: &Path) -> Result<(), String> {
    let text = fs::read_to_string(path).map_err(|_| "不是 UTF-8 文本，无法解析".to_string())?;
    toml::from_str::<toml::Value>(&text)
        .map(|_| ())
        .map_err(|e| format!("TOML 解析失败：{e}"))
}

fn entry_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_string()
}

/// DFS 收集目录下的候选文件。返回 (路径, 相对所选目录的展示路径)。
fn walk(root: &Path) -> (Vec<(PathBuf, String)>, usize, usize, bool) {
    let mut found: Vec<(PathBuf, String)> = Vec::new();
    let mut scanned_files = 0usize;
    let mut scanned_dirs = 0usize;
    let mut truncated = false;
    // 显式栈代替递归。目录先序深入；同一层内文件按名称升序收集，
    // 子目录逆序压栈，因此弹出顺序仍是名称升序（DFS）。
    let mut stack: Vec<(PathBuf, usize)> = vec![(root.to_path_buf(), 0)];

    while let Some((dir, depth)) = stack.pop() {
        // 深度守卫：超过 MAX_DEPTH 的分支不再下探（正常目录树远达不到）。
        if depth > MAX_DEPTH {
            continue;
        }
        if scanned_dirs >= MAX_DIRS {
            truncated = true;
            break;
        }
        let Ok(read) = fs::read_dir(&dir) else {
            continue;
        };
        scanned_dirs += 1;

        let mut children: Vec<PathBuf> = read.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        children.sort();

        let mut subdirs: Vec<PathBuf> = Vec::new();
        for path in children {
            let name = entry_name(&path);
            if name.is_empty() || is_hidden(&path, &name) {
                continue;
            }
            let Ok(meta) = fs::symlink_metadata(&path) else {
                continue;
            };
            if meta.file_type().is_symlink() {
                // 目录链接可能成环，直接跳过；文件链接按普通文件处理。
                if fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false) {
                    continue;
                }
            }
            if fs::metadata(&path).map(|m| m.is_dir()).unwrap_or(false) {
                subdirs.push(path);
                continue;
            }
            scanned_files += 1;
            if found.len() >= MAX_FILES {
                truncated = true;
                break;
            }
            if !config::is_config_file(&path) {
                continue;
            }
            let display = path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .to_string();
            found.push((path, display));
        }
        if truncated {
            break;
        }
        for path in subdirs.into_iter().rev() {
            stack.push((path, depth + 1));
        }
    }

    (found, scanned_files, scanned_dirs, truncated)
}

/// 扫描导入来源：单文件只产出 1 条；目录按 DFS 递归。
#[tauri::command]
pub fn scan_import_source(app: AppHandle, source: ImportSource) -> Result<ScanResult, String> {
    let raw = source.path.trim();
    if raw.is_empty() {
        return Err("未选择路径".to_string());
    }
    let root = PathBuf::from(raw);
    if !root.exists() {
        return Err(format!("路径不存在：{raw}"));
    }

    let existing = config::existing_names(&app)?;
    let (found, scanned_files, scanned_dirs, truncated) = if root.is_file() {
        let display = entry_name(&root);
        (vec![(root.clone(), display)], 1usize, 0usize, false)
    } else if root.is_dir() {
        walk(&root)
    } else {
        return Err(format!("路径不是文件或目录：{raw}"));
    };

    let mut taken: HashSet<String> = HashSet::new();
    let mut items = Vec::with_capacity(found.len());
    for (path, display) in found {
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();

        let mut valid = true;
        let mut error: Option<String> = None;
        if let Err(e) = validate_name(&name) {
            valid = false;
            error = Some(e);
        }
        if valid && !config::is_config_file(&path) {
            valid = false;
            error = Some(format!("不是 .{} 配置文件", config::CONFIG_EXT));
        }
        if valid {
            if let Err(e) = validate_content(&path) {
                valid = false;
                error = Some(e);
            }
        }

        let mut conflict = false;
        let mut conflict_reason: Option<String> = None;
        if existing.contains(&name) {
            conflict = true;
            conflict_reason = Some("已存在同名配置".to_string());
        } else if taken.contains(&name) {
            conflict = true;
            conflict_reason = Some("与本批次其他文件重名".to_string());
        }
        taken.insert(name.clone());

        items.push(ScannedItem {
            source_path: path.to_string_lossy().to_string(),
            source_display: display,
            name,
            conflict,
            conflict_reason,
            valid,
            error,
        });
    }

    Ok(ScanResult {
        items,
        scanned_files,
        scanned_dirs,
        truncated,
    })
}

/// 逐条复制到 configs 目录；单条失败不影响其余条目。
#[tauri::command]
pub fn apply_config_import(
    app: AppHandle,
    items: Vec<ImportPlanItem>,
) -> Result<ImportOutcome, String> {
    if items.is_empty() {
        return Err("未选择要导入的文件".to_string());
    }

    let mut outcome = ImportOutcome {
        imported: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };
    let mut seen: HashSet<String> = HashSet::new();

    for item in items {
        let source = PathBuf::from(item.source_path.trim());
        let display = entry_name(&source);
        let fail = |outcome: &mut ImportOutcome, reason: String| {
            outcome.failed.push(ImportFailure {
                source_display: display.clone(),
                reason,
            });
        };

        let name = item.name.trim().to_string();
        if let Err(e) = validate_name(&name) {
            fail(&mut outcome, e);
            continue;
        }
        if !seen.insert(name.clone()) {
            fail(&mut outcome, "目标名称重复".to_string());
            continue;
        }
        if !source.is_file() {
            fail(&mut outcome, "源文件不存在".to_string());
            continue;
        }
        let dest = match config::config_file_path(&app, &name) {
            Ok(p) => p,
            Err(e) => {
                fail(&mut outcome, e);
                continue;
            }
        };
        // 同名文件一律跳过，绝不覆盖已存在的配置。
        if dest.exists() {
            outcome.skipped.push(name);
            continue;
        }
        match fs::copy(&source, &dest) {
            Ok(_) => outcome.imported.push(name),
            Err(e) => fail(&mut outcome, format!("写入失败：{e}")),
        }
    }

    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_pattern_accepts_chinese_and_ascii() {
        assert!(name_pattern().is_match("frpc-上海_1.2"));
        assert!(name_pattern().is_match("office tcp"));
        assert!(!name_pattern().is_match("bad/name"));
        assert!(!name_pattern().is_match("bad:name"));
        assert!(!name_pattern().is_match("bad*name"));
        assert!(!name_pattern().is_match(""));
    }

    #[test]
    fn validate_name_rejects_long_and_empty() {
        assert!(validate_name("").is_err());
        assert!(validate_name(&"a".repeat(MAX_NAME_LEN + 1)).is_err());
        assert!(validate_name("ok_name").is_ok());
    }

    /// 建一棵真实目录树，验证 DFS 顺序、子目录递归与隐藏项跳过。
    #[test]
    fn walk_follows_dfs_and_skips_hidden() {
        let root = std::env::temp_dir().join(format!("frpc_import_walk_{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        // 一个非 toml 文件，用于验证「只计数、不产出条目」。
        let mk = |rel: &str, body: &str| {
            let path = root.join(rel);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).unwrap();
            }
            fs::write(&path, body).unwrap();
            path
        };
        mk("zulu.toml", "serverAddr = \"127.0.0.1\"\n");
        mk("alpha.toml", "serverAddr = \"127.0.0.1\"\n");
        mk("notes.txt", "not a config\n");
        mk("sub/inner.toml", "serverAddr = \"127.0.0.1\"\n");
        mk("sub/deep/leaf.toml", "serverAddr = \"127.0.0.1\"\n");
        mk("zeta/server.toml", "serverAddr = \"127.0.0.1\"\n");
        mk(".git/ignored.toml", "serverAddr = \"127.0.0.1\"\n");

        let (found, files, dirs, truncated) = walk(&root);
        let names: Vec<String> = found.iter().map(|(p, _)| entry_name(p)).collect();
        // 本层文件按名称升序在前；随后按名称升序依次深入子目录（sub 的分支整棵走完再到 zeta）。
        assert_eq!(
            names,
            vec![
                "alpha.toml",
                "zulu.toml",
                "inner.toml",
                "leaf.toml",
                "server.toml"
            ]
        );
        // 非 toml 只计入已检查文件数，不产出条目。
        assert_eq!(files, 6);
        // 隐藏目录 .git 下的配置必须被跳过。
        assert!(!names.iter().any(|n| n == "ignored.toml"));
        // root / sub / sub/deep / zeta。被跳过的 .git 自身仍计入遍历过的目录，只是内容不入结果。
        assert_eq!(dirs, 4);
        assert!(!truncated);

        fs::remove_dir_all(&root).unwrap();
    }
}
