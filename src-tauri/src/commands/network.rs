use tauri::State;
use crate::AppState;
use crate::models::{Device, DiscoveredHost, InventoryItem, NetworkInfo, StockMovement};
use crate::network::discovery::discover_hosts_on_lan;

#[tauri::command]
pub fn get_network_info(state: State<'_, AppState>) -> Result<NetworkInfo, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let mode: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'network_mode'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "host".to_string());

    let shop_id: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_id'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "SHOP-AESCION-000001".to_string());

    let shop_name: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'shop_name'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "Fruit Shop".to_string());

    let conn_code: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'connection_code'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "AESCION-884920".to_string());

    let host_port: u16 = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'host_port'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| "4123".to_string())
    .parse()
    .unwrap_or(4123);

    let detected_ip = local_ip_address::local_ip()
        .map(|ip| ip.to_string())
        .unwrap_or_else(|_| "127.0.0.1".to_string());

    let host_ip = if mode == "client" {
        db.conn.query_row(
            "SELECT value FROM settings WHERE key = 'client_host_ip'",
            [],
            |r| r.get(0),
        ).unwrap_or_else(|_| detected_ip.clone())
    } else {
        detected_ip
    };

    let actual_host_port: u16 = if mode == "client" {
        db.conn.query_row(
            "SELECT value FROM settings WHERE key = 'client_host_port'",
            [],
            |r| r.get::<_, String>(0),
        ).unwrap_or_else(|_| host_port.to_string())
        .parse()
        .unwrap_or(host_port)
    } else {
        host_port
    };

    let client_count: usize = db.conn.query_row(
        "SELECT COUNT(*) FROM devices WHERE device_type = 'client' AND is_approved = 1",
        [],
        |r| r.get(0),
    ).unwrap_or(0);

    let device_name: String = db.conn.query_row(
        "SELECT value FROM settings WHERE key = 'device_name'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "MAIN-PC".to_string());

    Ok(NetworkInfo {
        mode,
        shop_id,
        shop_name,
        host_ip,
        host_port: actual_host_port,
        connection_code: conn_code,
        is_server_running: true,
        device_id: "DEV-HOST-000001".to_string(),
        device_name,
        is_approved: true,
        client_count,
    })
}

#[tauri::command]
pub fn set_network_mode(
    state: State<'_, AppState>,
    mode: String,
    host_ip: Option<String>,
    host_port: Option<u16>,
    connection_code: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('network_mode', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![mode],
    ).map_err(|e| format!("Failed to update mode: {}", e))?;

    if let Some(ip) = host_ip {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('client_host_ip', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![ip],
        );
    }

    if let Some(port) = host_port {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('client_host_port', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![port.to_string()],
        );
    }

    if let Some(code) = connection_code {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('connection_code', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![code],
        );
    }

    Ok(())
}

#[tauri::command]
pub fn discover_hosts() -> Result<Vec<DiscoveredHost>, String> {
    Ok(discover_hosts_on_lan(2))
}

#[tauri::command]
pub async fn test_host_connection(host_ip: String, host_port: u16) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("http://{}:{}/api/info", host_ip.trim(), host_port);
    let resp = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Could not reach Host: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Host returned HTTP error: {}", resp.status()));
    }

    let json = resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Invalid response from Host: {}", e))?;

    Ok(json)
}

#[tauri::command]
pub async fn connect_to_host(
    state: State<'_, AppState>,
    host_ip: String,
    host_port: u16,
    connection_code: String,
) -> Result<crate::models::RegisterDeviceResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let clean_ip = host_ip.trim();
    let url = format!("http://{}:{}/api/devices/register", clean_ip, host_port);

    let device_id = format!("DEV-CLIENT-{}", uuid::Uuid::new_v4().to_string()[..8].to_uppercase());
    let payload = crate::models::RegisterDeviceRequest {
        device_id: device_id.clone(),
        device_name: "Cashier Terminal".to_string(),
        app_version: "0.1.0".to_string(),
        connection_code: connection_code.trim().to_string(),
    };

    let resp = client.post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Cannot reach Host at {}:{}: {}", clean_ip, host_port, e))?;

    if !resp.status().is_success() {
        return Err(format!("Host returned error status: {}", resp.status()));
    }

    let reg_data: crate::models::RegisterDeviceResponse = resp.json()
        .await
        .map_err(|e| format!("Invalid response from Host: {}", e))?;

    if !reg_data.success {
        return Err(reg_data.message);
    }

    // Persist in local SQLite
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let _ = db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('network_mode', 'client')
         ON CONFLICT(key) DO UPDATE SET value = 'client'",
        [],
    );
    let _ = db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('client_host_ip', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![clean_ip],
    );
    let _ = db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('client_host_port', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![host_port.to_string()],
    );
    let _ = db.conn.execute(
        "INSERT INTO settings (key, value) VALUES ('connection_code', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![connection_code.trim()],
    );
    if !reg_data.shop_name.is_empty() {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('shop_name', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![reg_data.shop_name],
        );
    }
    if !reg_data.shop_id.is_empty() {
        let _ = db.conn.execute(
            "INSERT INTO settings (key, value) VALUES ('shop_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![reg_data.shop_id],
        );
    }

    Ok(reg_data)
}

#[tauri::command]
pub fn get_registered_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let mut stmt = db.conn.prepare(
        "SELECT id, device_id, device_name, device_type, ip_address, is_approved, is_active,
                api_token, last_seen_at, app_version, created_at, updated_at
         FROM devices ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;

    let devices = stmt.query_map([], |r| {
        Ok(Device {
            id: r.get(0)?,
            device_id: r.get(1)?,
            device_name: r.get(2)?,
            device_type: r.get(3)?,
            ip_address: r.get(4)?,
            is_approved: r.get::<_, i32>(5)? == 1,
            is_active: r.get::<_, i32>(6)? == 1,
            api_token: r.get(7)?,
            last_seen_at: r.get(8)?,
            app_version: r.get(9)?,
            created_at: r.get(10)?,
            updated_at: r.get(11)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(devices)
}

#[tauri::command]
pub fn approve_device(state: State<'_, AppState>, device_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    db.conn.execute(
        "UPDATE devices SET is_approved = 1, updated_at = datetime('now') WHERE device_id = ?1",
        rusqlite::params![device_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn revoke_device(state: State<'_, AppState>, device_id: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    db.conn.execute(
        "UPDATE devices SET is_approved = 0, updated_at = datetime('now') WHERE device_id = ?1",
        rusqlite::params![device_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn rename_device(state: State<'_, AppState>, device_id: String, new_name: String) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    db.conn.execute(
        "UPDATE devices SET device_name = ?1, updated_at = datetime('now') WHERE device_id = ?2",
        rusqlite::params![new_name.trim(), device_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ========== INVENTORY & STOCK COMMANDS ==========

#[tauri::command]
pub fn get_inventory(state: State<'_, AppState>) -> Result<Vec<InventoryItem>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let mut stmt = db.conn.prepare(
        "SELECT p.id, p.product_code, p.name, c.name, COALESCE(i.current_stock, 0),
                COALESCE(i.low_stock_threshold, 10), COALESCE(i.updated_at, p.created_at)
         FROM products p
         LEFT JOIN categories c ON p.category_id = c.id
         LEFT JOIN inventory i ON p.id = i.product_id
         WHERE p.is_active = 1
         ORDER BY p.name ASC"
    ).map_err(|e| e.to_string())?;

    let items = stmt.query_map([], |r| {
        Ok(InventoryItem {
            product_id: r.get(0)?,
            product_code: r.get(1)?,
            product_name: r.get(2)?,
            category_name: r.get(3)?,
            current_stock: r.get(4)?,
            low_stock_threshold: r.get(5)?,
            updated_at: r.get(6)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(items)
}

#[tauri::command]
pub fn adjust_stock(
    state: State<'_, AppState>,
    product_id: i64,
    quantity_change: i32,
    movement_type: String,
    user_id: i64,
    notes: Option<String>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;

    let _ = db.conn.execute(
        "INSERT INTO stock_movements (product_id, quantity_change, movement_type, user_id, notes)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![product_id, quantity_change, movement_type, user_id, notes],
    );

    db.conn.execute(
        "INSERT INTO inventory (product_id, current_stock, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(product_id) DO UPDATE SET current_stock = current_stock + ?3, updated_at = datetime('now')",
        rusqlite::params![product_id, quantity_change, quantity_change],
    ).map_err(|e| format!("Failed to update inventory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_stock_movements(state: State<'_, AppState>, product_id: Option<i64>) -> Result<Vec<StockMovement>, String> {
    let db = state.db.lock().map_err(|_| "Database lock failed".to_string())?;
    let sql = if let Some(pid) = product_id {
        format!("SELECT sm.id, sm.product_id, p.name, sm.quantity_change, sm.movement_type, sm.reference_id, sm.user_id, u.display_name, sm.device_id, sm.notes, sm.created_at
                 FROM stock_movements sm
                 LEFT JOIN products p ON sm.product_id = p.id
                 LEFT JOIN users u ON sm.user_id = u.id
                 WHERE sm.product_id = {} ORDER BY sm.id DESC LIMIT 100", pid)
    } else {
        "SELECT sm.id, sm.product_id, p.name, sm.quantity_change, sm.movement_type, sm.reference_id, sm.user_id, u.display_name, sm.device_id, sm.notes, sm.created_at
         FROM stock_movements sm
         LEFT JOIN products p ON sm.product_id = p.id
         LEFT JOIN users u ON sm.user_id = u.id
         ORDER BY sm.id DESC LIMIT 100".to_string()
    };

    let mut stmt = db.conn.prepare(&sql).map_err(|e| e.to_string())?;
    let movements = stmt.query_map([], |r| {
        Ok(StockMovement {
            id: r.get(0)?,
            product_id: r.get(1)?,
            product_name: r.get(2)?,
            quantity_change: r.get(3)?,
            movement_type: r.get(4)?,
            reference_id: r.get(5)?,
            user_id: r.get(6)?,
            user_name: r.get(7)?,
            device_id: r.get(8)?,
            notes: r.get(9)?,
            created_at: r.get(10)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(movements)
}
