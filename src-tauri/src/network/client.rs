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

use std::sync::LazyLock;
use std::time::Duration;
use reqwest::blocking::Client;

/// Reusable HTTP client with keep-alive connection pooling, TCP nodelay, and fast connect timeout
pub static HTTP_CLIENT: LazyLock<Client> = LazyLock::new(|| {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .connect_timeout(Duration::from_secs(3))
        .tcp_nodelay(true)
        .pool_idle_timeout(Duration::from_secs(90))
        .pool_max_idle_per_host(10)
        .build()
        .unwrap_or_else(|_| Client::new())
});

/// Get static reference to pooled HTTP client
pub fn get_http_client() -> &'static Client {
    &HTTP_CLIENT
}
