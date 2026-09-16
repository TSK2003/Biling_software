use tauri::State;
use crate::AppState;
use crate::services::report_service::ReportService;

#[tauri::command]
pub fn generate_daily_report(state: State<'_, AppState>, date: String) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    ReportService::generate_daily_report(&db, &date)
}

#[tauri::command]
pub fn generate_date_range_report(
    state: State<'_, AppState>,
    date_from: String,
    date_to: String,
) -> Result<String, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    ReportService::generate_date_range_report(&db, &date_from, &date_to)
}

#[tauri::command]
pub fn get_report_list(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    ReportService::get_report_list(&db)
}
