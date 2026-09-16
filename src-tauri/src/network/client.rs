use rusqlite::Connection;

/// Returns Some((host_ip, host_port)) if this instance is configured in client mode
pub fn get_client_mode_host(conn: &Connection) -> Option<(String, u16)> {
    let mode: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'network_mode'",
        [],
        |r| r.get(0),
    ).unwrap_or_else(|_| "host".to_string());

    if mode != "client" {
        return None;
    }

    let ip: String = conn.query_row(
        "SELECT value FROM settings WHERE key = 'client_host_ip'",
        [],
        |r| r.get(0),
    ).ok()?;

    if ip.trim().is_empty() {
        return None;
    }

    let port: u16 = conn.query_row(
        "SELECT value FROM settings WHERE key = 'client_host_port'",
        [],
        |r| r.get::<_, String>(0),
    ).unwrap_or_else(|_| "4123".to_string())
    .parse()
    .unwrap_or(4123);

    Some((ip.trim().to_string(), port))
}

/// Returns Some("http://host_ip:host_port") if in client mode
pub fn get_client_http_base(conn: &Connection) -> Option<String> {
    get_client_mode_host(conn).map(|(ip, port)| format!("http://{}:{}", ip, port))
}
