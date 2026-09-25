# 🛒 Billing Software — Offline Desktop Billing & Inventory System

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-blue.svg)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-2021_Edition-orange.svg)](https://www.rust-lang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57.svg)](https://sqlite.org/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)]()

**Billing Software** is a high-performance, offline-first desktop Point of Sale (POS) and inventory management system engineered specifically for retail stores, supermarkets, fruit shops, restaurants, and wholesale counters. Built with **Tauri 2, Rust, React 19, TypeScript, and SQLite**, it provides sub-millisecond checkout speeds, hardware-bound licensing, real-time multi-computer local network synchronization, and automated Google Drive cloud backup.

---

## 🌟 Key Features

### 1. ⚡ High-Speed Billing Terminal (POS)
- **Instant Product Search & Barcode Scanning**: Scan physical barcodes or search by product code (`PRD-000001`), name, or category.
- **Dynamic Multi-Split Payments**: Accept **Cash**, **UPI / QR Code**, **Card**, or split payments (e.g. ₹200 Cash + ₹100 UPI) in a single bill transaction.
- **Cart Hold & Multi-Draft Checkout**: Hold customer carts with `Ctrl+N` and resume later without losing in-progress sales.
- **Fast Cashier Hotkeys**: Complete checkout, toggle discounts, and print receipts without touching the mouse.

### 2. 🧾 Billing History & Thermal Receipt Printing
- **Real-Time History**: Search and filter past bills by bill number, date range, staff cashier, or payment method.
- **Instant Reprinting & Voiding**: Reprint 80mm thermal receipts or 2-inch mini receipts on demand. Void bills with supervisor authorization and mandatory reason audit logging.

### 3. 📦 Products & Category Catalog Management
- **Visual Grid & Table Views**: Add products with image thumbnails, barcode numbers, selling prices, and GST tax percentages.
- **Auto Code Sequencing**: Automatic generation of unique formatted product codes (`PRD-000001`, `PRD-000002`, ...).
- **Inventory Tracking & Low Stock Alerts**: Automatic real-time stock deductions upon bill completion and stock movement history.

### 4. 📑 Real Excel & PDF Reporting Engine
- **Native Excel Spreadsheets**: Generates itemized `.xlsx` workbooks using `rust_xlsxwriter` with financial KPI summary cards, tax breakdown, and item sales breakdown.
- **Standard Storage Hierarchy**: Organizes reports automatically in `<app_data>/reports/<year>/<month>/DD-MM-YYYY.xlsx`.
- **Date-Range Analytics**: Export custom date-range sales reports for any financial period.

### 5. 💾 Standalone `.zip` Backups & Excel Re-Import
- **Portable Zip Archives**: Generates self-contained `Shop_Billing_Backup_YYYYMMDD_HHMMSS.zip` containing the SQLite database, manifest checksums (SHA-256), product images, and reports.
- **Safe Restore with Hardware License Protection**: Pre-restore snapshot protection and local hardware license retention.
- **Excel Bulk Product Import**: Import inventory from Excel sheets (`.xlsx` / `.xls`) with automatic schema validation and duplicate detection via `calamine`.

### 6. 👥 Staff & User Permissions with Admin Password View
- **Granular Screen Checkpoints**: Checkbox access control for all 9 application modules:
  - `Billing (POS)`, `Billing History`, `Dashboard`, `Products`, `Categories`, `Reports`, `Backup & Import`, `Staff & Users`, `Settings`
- **Role Presets**: 1-click presets for **Administrator**, **Store Manager**, **Inventory Staff**, **Cashier**, or custom tailored access.
- **Admin Password Reveal**: Administrators can toggle-view and copy cashier passwords directly inside the Staff management panel.

### 7. 🎨 Custom Shop Branding
- **Customer Shop Logo Upload**: Upload custom business logos (PNG, JPG, SVG, WebP) with live preview.
- **Automatic White-Label UI**: Displays customer shop branding on the Sidebar, Login screen, and printed receipts with zero third-party software provider watermarks.

### 8. 🌐 Multi-Computer Local Network Architecture (Host & Cashier Terminals)
- **Host / Client Mode**: One primary computer runs as **Shop Host** with local Axum REST & WebSocket server (`port 4123`).
- **Auto LAN Discovery**: Secondary computers discover the Host automatically over UDP LAN (`port 4124`) without manual IP configuration.
- **Device Security**: Host administrator approves/revokes client cashier terminals with instant PIN authorization.

---

## 🌐 Complete Multi-Computer & Device Connection Guide

Billing Software supports connecting multiple billing terminals, cashier counters, and manager computers over your shop's local Wi-Fi or Ethernet LAN.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MAIN SERVER PC (Shop Host / Admin)                    │
│   • Runs Master SQLite Database                                             │
│   • Axum REST & WebSocket Server (Port 4123)                                │
│   • UDP Discovery Responder (Port 4124)                                     │
│   • Full Admin Dashboard, Reports, Backups & Staff Management               │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                         LOCAL WI-FI / ETHERNET LAN
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  CASHIER PC 1    │          │  CASHIER PC 2    │          │  MANAGER PC      │
│ (Client Terminal)│          │ (Client Terminal)│          │ (Client Terminal)│
│ • Fast Billing   │          │ • Fast Billing   │          │ • Inventory View │
│ • Receipt Print  │          │ • Receipt Print  │          │ • Sales History  │
│ • Live Sync      │          │ • Live Sync      │          │ • Live Sync      │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

---

### 💻 Step 1: Main Server Setup (Admin PC)
1. Install and launch **Billing Software** on your primary shop computer.
2. Insert your authorized **Security Pen Drive** and click **Activate This Device**.
3. Login using default Admin credentials:
   - **Username**: `admin`
   - **Password**: `admin123`
4. The Main PC automatically operates as the **Shop Host**:
   - Axum REST & WebSocket Server starts on `0.0.0.0:4123`.
   - UDP LAN Discovery Responder starts on `0.0.0.0:4124`.

---


---

## 📦 Build & Installer Commands

| Command | Purpose | Output Location |
| :--- | :--- | :--- |
| `npm run build:installer:demo` | **Builds Windows Installer with 100+ Demo Products pre-loaded** | `src-tauri/target/release/bundle/nsis/` |
| `npm run build:installer:clean` | **Builds Clean Windows Installer without any demo data** | `src-tauri/target/release/bundle/nsis/` |
| `npm run build:installer` | Default production installer build (same as clean) | `src-tauri/target/release/bundle/nsis/` |
| `npm run seed:demo` | Instantly seeds 112+ demo products & 8 categories into local DB (for instant test) | Local AppData DB |
| `npm run clear:demo` | Instantly wipes demo products & categories from local DB | Local AppData DB |
| `npm start` | Launches development server with hot-reload | `localhost:1420` |
| `npm run build:exe` | Compiles standalone production `.exe` binary without packaging | `src-tauri/target/release/billing-software.exe` |

---

### 👥 Step 2: Create Cashier & Staff Accounts
From the Main Admin PC:
1. Navigate to **Staff & Users** in the sidebar.
2. Click **+ Add New User**.
3. Enter details:
   - **Full Name**: `Cashier Counter 1`
   - **Username**: `cashier1`
   - **Password**: `pass123` *(Admin can view/reveal passwords at any time)*
   - **Role**: Select **Cashier** (automatically selects `Billing` & `History` screens).
   - **Max Discount %**: Set allowed cashier discount limit (e.g. `5%`).
4. Click **Save User**.

---

### 🔑 Step 3: Find Host IP & Connection PIN Code
From the Main Admin PC:
1. Go to **Settings ➔ Network & Connected Terminals**.
2. Note down:
   - **Host IP Address**: e.g., `192.168.1.15`
   - **Host Port**: `4123`
   - **Connection Code (PIN)**: e.g., `BILLING-884920` (6-character security PIN)

---

### 🖥️ Step 4: Connect Secondary Computers (Cashier Terminals)
On any additional computer connected to the same Wi-Fi / LAN:
1. Install and open **Billing Software**.
2. On the first screen, click **"Connect to Main Host PC (Cashier Terminal)"**.
3. **Connection Method A (Automatic LAN Scan - Recommended)**:
   - The app scans your local network and displays discovered Host PCs (e.g., `Fruit Shop - 192.168.1.15`).
   - Click **Connect** and enter the **Connection Code** (`BILLING-884920`).
4. **Connection Method B (Manual IP Entry)**:
   - If Wi-Fi router blocks UDP broadcast, enter:
     - **Host IP**: `192.168.1.15`
     - **Port**: `4123`
     - **Connection Code**: `BILLING-884920`
   - Click **Test Connection** ➔ **Connect Terminal**.
5. Once connected, the login screen will open. Cashiers can log in with their created username and password (e.g., `cashier1` / `pass123`).

---

### 🛡️ Step 5: Approving & Managing Connected Devices
From the Main Admin PC:
1. Go to **Settings ➔ Network & Connected Terminals**.
2. Under **Registered Terminal Devices**, you will see all connected cashier PCs.
3. You can:
   - **Approve / Authorize** new cashier terminals.
   - **Revoke Access** instantly if a device is decommissioned or unauthorized.
   - **Rename Terminals** (e.g. `Billing Counter 1 - Front Gate`).

---

### ⚡ Step 6: Live Billing & Synchronization
- Every bill completed on a Cashier PC immediately:
  1. Deducts product stock in the central SQLite database on the Main PC.
  2. Creates atomic financial audit logs and stock movement history.
  3. Updates the Admin Dashboard metrics and live bill counts in real time via WebSockets.
- Cashiers can reprint receipts locally on their counter thermal printers.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Desktop Core** | [Tauri v2](https://tauri.app/) (Rust 2021) |
| **Frontend Framework** | [React 19](https://react.dev/), [TypeScript 5.8](https://www.typescriptlang.org/), [Vite 7](https://vitejs.dev/) |
| **Styling & UI** | [TailwindCSS 3](https://tailwindcss.com/), [Lucide Icons](https://lucide.dev/) |
| **Database** | [SQLite](https://sqlite.org/) via `rusqlite` (WAL Mode enabled) |
| **Excel Engines** | `rust_xlsxwriter` (Export), `calamine` (Import) |
| **LAN Networking** | [Axum 0.7](https://github.com/tokio-rs/axum) (HTTP + WebSockets), Tokio (UDP Broadcast) |
| **Cryptography** | Argon2id (Password Hashing), SHA-256 (Backup Integrity), Ed25519 (Licensing) |

---

## 📋 System Requirements

### For Running the Application:
- **Operating System**: Windows 10 / Windows 11 (64-bit)
- **RAM**: Minimum 2 GB RAM (4 GB recommended)
- **Disk Space**: 150 MB free disk space
- **Network**: Local Wi-Fi or Ethernet LAN router (for multi-computer setups)
- **Runtime**: Microsoft Edge WebView2 (pre-installed on Windows 10/11)

### For Development & Building from Source:
- **Node.js**: v18.0 or later (v20+ recommended)
- **Rust & Cargo**: Rust 1.77+ with MSVC toolchain (`rustup default stable-x86_64-pc-windows-msvc`)
- **C++ Build Tools**: Visual Studio 2022 Build Tools (with "Desktop development with C++")

---

## 🚀 Getting Started (Development)

### 1. Clone & Install Dependencies
```powershell
git clone https://github.com/your-username/billing-software.git
cd billing-software

# Install frontend packages
npm install
```

### 2. Run Application in Development Mode
```powershell
npm start
```
*Note: `npm start` automatically handles Cargo environment PATH setup and frees ports before starting Vite and Tauri.*

---

## 📦 Building Production Standalone `.exe` & Installer

### Option A: Build Standalone Single `.exe` (Fastest)
Compiles an optimized, standalone Windows binary for direct execution:

```powershell
npm run build:exe
```
*(or via CLI: `$env:Path += ";$env:USERPROFILE\.cargo\bin"; npx tauri build --no-bundle`)*

📍 **Output Location**:
```
src-tauri/target/release/billing-software.exe
```

---

### Option B: Build Full Windows Installer (`.msi` / `.exe` Setup Wizard)
Compiles a production Windows setup installer with desktop shortcuts and uninstaller for customer PCs:

```powershell
npm run build:installer
```
*(or via CLI: `$env:Path += ";$env:USERPROFILE\.cargo\bin"; npx tauri build`)*

📍 **Output Location**:
```
src-tauri/target/release/bundle/nsis/Billing Software_0.1.0_x64-setup.exe
```

---

## 🔑 Default Credentials & First Login

| Username | Default Password | Role | Default Permissions |
| :--- | :--- | :--- | :--- |
| **`admin`** | **`admin123`** | Administrator | Full Access (All 9 Screens) |

> 🔒 *Security Note: Change the default administrator password immediately upon first production deployment via **Staff & Users** or **Settings**.*

---

## ⌨️ Cashier Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`F2`** / **`Ctrl + B`** | **Go to POS** | Switch immediately to the Billing Register screen |
| **`F4`** / **`Ctrl + P`** | **Complete & Pay** | Open payment modal and finish transaction |
| **`Ctrl + F`** | **Search Products** | Focus the product search input bar |
| **`Ctrl + N`** | **Hold / New Cart** | Save active cart as draft and open fresh cart |
| **`+`** / **`-`** | **Adjust Quantity** | Increment or decrement quantity of selected item |
| **`Esc`** | **Close / Clear** | Close open modals or clear current search |

---

## 📁 Project Architecture

```
Billing_Software/
├── index.html                 # Main HTML entry point & favicon
├── package.json               # Node packages & lifecycle scripts
├── vite.config.ts             # Vite configuration with Tauri bindings
├── tailwind.config.js         # Design tokens & color palette
├── tools/
│   ├── predev.js              # Port collision killer (1420 & 4123)
│   └── run-dev.js             # Cross-platform development launcher
│
├── src/                       # Frontend React Application
│   ├── components/            # Reusable UI (Sidebar, Header, Modal, ConfirmModal)
│   ├── contexts/              # Global state (Auth, Cart, Settings, License, Network)
│   ├── features/              # Feature pages:
│   │   ├── auth/              # Customer-branded Login Page
│   │   ├── billing/           # Fast POS Billing Terminal
│   │   ├── bills/             # History, Thermal Receipt & Voiding
│   │   ├── products/          # Product Catalog & Low Stock Alert
│   │   ├── categories/        # Categories Management
│   │   ├── reports/           # Excel & PDF Sales Reports
│   │   ├── backup/            # Full Zip Backup & Excel Re-Import
│   │   ├── users/             # Staff Screen Checkpoints & Password View
│   │   ├── settings/          # Shop Profile, Logo Upload & LAN Config
│   │   ├── licensing/         # Hardware USB Activation Gate
│   │   └── network/           # Host / Client Pairing & Discovery Screens
│   ├── hooks/                 # Keyboard shortcuts & utilities
│   ├── lib/                   # Tauri IPC & Client-Mode HTTP Bridge (`ipc.ts`)
│   └── types/                 # TypeScript data contracts & models
│
└── src-tauri/                 # Backend Rust Application
    ├── Cargo.toml             # Rust dependencies (rusqlite, axum, tokio, etc.)
    ├── tauri.conf.json        # Tauri window, security CSP & bundle config
    ├── icons/                 # Multi-resolution application icons
    ├── src/
    │   ├── commands/          # Tauri IPC command handlers (auth, billing, products...)
    │   ├── db/                # SQLite connection pool & migrations (v1 - v5)
    │   ├── models/            # Rust data structures & serialization
    │   ├── network/           # Axum REST/WebSocket server & UDP LAN discovery
    │   ├── services/          # Business logic engines:
    │   │   ├── report_service.rs  # Native Excel report generation
    │   │   ├── import_service.rs  # Excel parser & schema validator
    │   │   ├── backup_service.rs  # Portable Zip backup & restore
    │   │   ├── licensing_service.rs # Hardware binding & cryptographic verify
    │   │   └── gdrive_service.rs  # Cloud sync background worker
    │   ├── lib.rs             # Application initialization & thread spawns
    │   └── main.rs            # Desktop executable entry point
```

---

## 📄 License & Distribution

Copyright © 2026 Billing Software. All rights reserved.  
This software is licensed on a per-shop basis and protected by hardware-bound licensing.
