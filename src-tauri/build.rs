fn main() {
    println!("cargo:rerun-if-env-changed=DEMO_DATA");
    tauri_build::build()
}
