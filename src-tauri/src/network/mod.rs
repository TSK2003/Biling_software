pub mod client;
pub mod discovery;
pub mod server;

use std::sync::{Arc, Mutex};
use tokio::sync::broadcast;
use crate::db::connection::Database;
use server::ServerState;

/// Start the Host API and Discovery background services
pub fn start_host_services(
    db: Arc<Mutex<Database>>,
    port: u16,
    shop_id: String,
    shop_name: String,
    host_ip: String,
    app_version: String,
) {
    let (tx, _rx) = broadcast::channel(100);
    let server_state = ServerState {
        db: db.clone(),
        tx: tx.clone(),
    };

    // 1. Start HTTP & WebSocket server inside a dedicated background Tokio runtime
    let app = server::create_router(server_state);
    let bind_addr = format!("0.0.0.0:{}", port);

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
        {
            Ok(r) => r,
            Err(e) => {
                log::error!("Failed to initialize Tokio runtime for Host server: {}", e);
                return;
            }
        };

        rt.block_on(async move {
            let listener = match tokio::net::TcpListener::bind(&bind_addr).await {
                Ok(l) => l,
                Err(e) => {
                    log::error!("Failed to bind Axum HTTP server on {}: {}", bind_addr, e);
                    return;
                }
            };
            log::info!("Billing Software Host Local Network Service active on {}", bind_addr);
            let _ = axum::serve(listener, app).await;
        });
    });

    // 2. Start UDP LAN discovery responder
    discovery::start_discovery_responder(
        shop_id,
        shop_name,
        host_ip,
        port,
        app_version,
    );
}
