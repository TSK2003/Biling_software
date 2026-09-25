use std::net::{SocketAddr, UdpSocket};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use crate::models::DiscoveredHost;

const DISCOVERY_PORT: u16 = 4124;
const DISCOVERY_MAGIC_REQ: &str = "BILLING_DISCOVER_HOST_REQ";

#[derive(Debug, Serialize, Deserialize)]
pub struct HostBeacon {
    pub magic: String,
    pub shop_id: String,
    pub shop_name: String,
    pub host_ip: String,
    pub host_port: u16,
    pub app_version: String,
}

/// Run UDP discovery beacon responder in the background on the Host PC
pub fn start_discovery_responder(
    shop_id: String,
    shop_name: String,
    host_ip: String,
    host_port: u16,
    app_version: String,
) {
    std::thread::spawn(move || {
        let bind_addr = format!("0.0.0.0:{}", DISCOVERY_PORT);
        let socket = match UdpSocket::bind(&bind_addr) {
            Ok(s) => s,
            Err(e) => {
                log::warn!("Could not bind UDP discovery socket on {}: {}", bind_addr, e);
                return;
            }
        };
        
        let _ = socket.set_broadcast(true);
        let mut buf = [0u8; 1024];
        
        log::info!("Discovery beacon listening on {}", bind_addr);
        
        loop {
            match socket.recv_from(&mut buf) {
                Ok((len, src)) => {
                    let msg = String::from_utf8_lossy(&buf[..len]);
                    if msg.contains(DISCOVERY_MAGIC_REQ) || msg.contains("AESCION_DISCOVER_HOST_REQ") {
                        let beacon = HostBeacon {
                            magic: "BILLING_HOST_RESP".to_string(),
                            shop_id: shop_id.clone(),
                            shop_name: shop_name.clone(),
                            host_ip: host_ip.clone(),
                            host_port,
                            app_version: app_version.clone(),
                        };
                        
                        if let Ok(resp_json) = serde_json::to_string(&beacon) {
                            let _ = socket.send_to(resp_json.as_bytes(), src);
                        }
                    }
                }
                Err(e) => {
                    log::debug!("Discovery recv error: {}", e);
                    std::thread::sleep(Duration::from_millis(500));
                }
            }
        }
    });
}

/// Client LAN sweep to discover active Host computers
pub fn discover_hosts_on_lan(timeout_secs: u64) -> Vec<DiscoveredHost> {
    let mut discovered = Vec::new();
    
    let socket = match UdpSocket::bind("0.0.0.0:0") {
        Ok(s) => s,
        Err(_) => return discovered,
    };
    
    let _ = socket.set_broadcast(true);
    let _ = socket.set_read_timeout(Some(Duration::from_millis(250)));
    
    let broadcast_addr = SocketAddr::from(([255, 255, 255, 255], DISCOVERY_PORT));
    let query_msg = format!("{}:{}", DISCOVERY_MAGIC_REQ, "0.1.0");
    
    // Broadcast discovery probe to 255.255.255.255
    let _ = socket.send_to(query_msg.as_bytes(), broadcast_addr);

    // Also broadcast to specific subnet broadcast addresses (e.g. 192.168.x.255)
    if let Ok(interfaces) = local_ip_address::list_afinet_netifas() {
        for (_name, ip) in interfaces {
            if let std::net::IpAddr::V4(ipv4) = ip {
                let o = ipv4.octets();
                if !ipv4.is_loopback() && !(o[0] == 169 && o[1] == 254) && o[0] != 0 && o[0] != 255 {
                    let subnet_bcast = SocketAddr::from(([o[0], o[1], o[2], 255], DISCOVERY_PORT));
                    let _ = socket.send_to(query_msg.as_bytes(), subnet_bcast);
                }
            }
        }
    }
    
    let mut buf = [0u8; 2048];
    let start = std::time::Instant::now();
    let max_duration = Duration::from_secs(timeout_secs.min(10));
    
    while start.elapsed() < max_duration {
        match socket.recv_from(&mut buf) {
            Ok((len, _)) => {
                if let Ok(beacon) = serde_json::from_slice::<HostBeacon>(&buf[..len]) {
                    if beacon.magic == "BILLING_HOST_RESP" || beacon.magic == "AESCION_HOST_RESP" {
                        let host = DiscoveredHost {
                            shop_id: beacon.shop_id,
                            shop_name: beacon.shop_name,
                            host_ip: beacon.host_ip,
                            host_port: beacon.host_port,
                            app_version: beacon.app_version,
                        };
                        
                        if !discovered.iter().any(|h: &DiscoveredHost| h.host_ip == host.host_ip && h.host_port == host.host_port) {
                            discovered.push(host);
                        }
                    }
                }
            }
            Err(_) => {
                // Timeout or no packets, continue polling until max_duration
                std::thread::sleep(Duration::from_millis(50));
            }
        }
    }
    
    discovered
}
