use tauri::State;
use crate::AppState;
use crate::models::ImportPreview;
use crate::services::import_service::ImportService;

#[tauri::command]
pub fn validate_excel_import(state: State<'_, AppState>, file_path: String) -> Result<ImportPreview, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    ImportService::validate_excel_file(&db, &file_path)
}

#[tauri::command]
pub fn execute_excel_import(state: State<'_, AppState>, file_path: String) -> Result<String, String> {
    let mut db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    ImportService::execute_excel_import(&mut db, &file_path)
}
