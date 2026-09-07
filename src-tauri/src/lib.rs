mod config;
mod process;
mod settings;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(process::ProcessManager::new())
        .setup(|app| {
            let handle = app.handle().clone();
            app.state::<process::ProcessManager>()
                .hydrate(&handle)
                .map_err(|e| Box::<dyn std::error::Error>::from(e))?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_configs_dir,
            config::list_config_files,
            config::read_config_file,
            config::write_config_file,
            config::create_config_file,
            config::delete_config_file,
            config::rename_config_file,
            settings::get_settings,
            settings::set_frpc_path,
            settings::clear_frpc_path,
            settings::set_theme,
            process::list_instances,
            process::create_instance,
            process::remove_instance,
            process::start_instance,
            process::stop_instance,
            process::restart_instance,
            process::stop_all_instances,
            process::get_instance_logs,
            process::clear_instance_logs,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                app.state::<process::ProcessManager>().kill_all();
            }
        });
}
