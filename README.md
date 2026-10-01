# Billing Software — Offline Desktop Billing & Inventory System

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-blue.svg)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-2021_Edition-orange.svg)](https://www.rust-lang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57.svg)](https://sqlite.org/)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)]()

**Billing Software** is a high-performance, offline-first desktop Point of Sale (POS) and inventory management system engineered for retail stores, supermarkets, supermarkets, restaurants, and wholesale counters. Built with **Tauri 2, Rust, React 19, TypeScript, and SQLite**, it provides sub-millisecond checkout speeds, hardware-bound licensing, real-time multi-computer local network synchronization, and consolidated backup management.

---

## Key Features

### 1. High-Speed Billing Terminal (POS)
- **Instant Product Search & Barcode Scanning**: Scan physical barcodes or search by product code (`PRD-000001`), name, or category.
- **Dynamic Multi-Split Payments**: Accept **Cash**, **UPI**, **Card**, or split payments (e.g. Cash + UPI) in a single bill transaction.
- **Cart Hold & Multi-Draft Checkout**: Hold customer carts with `Ctrl+N` and resume later without losing in-progress sales.
- **Fast Cashier Hotkeys**: Complete checkout, toggle discounts, and print receipts without touching the mouse.

### 2. Billing History & Thermal Receipt Printing
- **Real-Time History**: Search and filter past bills by bill number, date range, staff cashier, or payment method.
- **Instant Reprinting & Returns**: Reprint 80mm thermal receipts or 2-inch mini receipts on demand. Process itemized returns with custom quantity tracking and audit logging.

### 3. Products & Category Catalog Management
- **Visual Table & Catalog**: Manage products with code sequencing, barcode numbers, selling prices, and GST tax percentages.
- **Auto Code Sequencing**: Automatic generation of unique formatted product codes (`PRD-000001`, `PRD-000002`, ...).
- **Inventory Tracking & Low Stock Alerts**: Automatic real-time stock deductions upon bill completion and stock movement history.

### 4. Excel & PDF Reporting Engine
- **Native Excel Spreadsheets**: Generates itemized `.xlsx` workbooks using `rust_xlsxwriter` with financial KPI summary cards, tax breakdown, and item sales breakdown.
- **Standard Storage Hierarchy**: Organizes reports automatically in `<app_data>/reports/<year>/<month>/DD-MM-YYYY.xlsx`.
- **Date-Range Analytics**: Export custom date-range sales reports for any financial period.

### 5. Consolidated Backups & Excel Re-Import
- **Custom Backup Directory**: Select and configure any drive or folder path for database archives and monthly Excel ledgers.
- **Safe Restore with Hardware License Protection**: Pre-restore snapshot protection and local hardware license retention.
- **Excel Bulk Product Import**: Import inventory from Excel sheets (`.xlsx` / `.xls`) with automatic schema validation.

### 6. Staff & User Permissions
- **Granular Screen Checkpoints**: Access control for application modules:
  - `Billing (POS)`, `Billing History`, `Dashboard`, `Products`, `Categories`, `Reports`, `Backup & Import`, `Staff & Users`, `Settings`
- **Role Presets**: 1-click presets for **Administrator**, **Store Manager**, **Inventory Staff**, **Cashier**, or custom tailored access.

### 7. Custom Shop Branding
- **Customer Shop Logo Upload**: Upload custom business logos (PNG, JPG, SVG, WebP) with live preview.
- **White-Label UI**: Displays customer shop branding on the Sidebar, Login screen, and printed receipts.

### 8. Multi-Computer Local Network Architecture (Host & Cashier Terminals)
- **Host / Client Mode**: One primary computer runs as **Shop Host** with local Axum REST & WebSocket server (`port 4123`).
- **Auto LAN Discovery**: Secondary computers discover the Host automatically over UDP LAN (`port 4124`) without manual IP configuration.
- **Device Security**: Host administrator approves/revokes client cashier terminals with instant PIN authorization.

---

## Multi-Computer & Device Connection Guide

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

### Step 1: Main Server Setup (Admin PC)
1. Install and launch **Billing Software** on your primary shop computer.
2. Insert your authorized **Security Pen Drive** and click **Activate This Device**.
3. Login using default Admin credentials:
   - **Username**: `admin`
   - **Password**: `admin123`
4. The Main PC automatically operates as the **Shop Host**:
   - Axum REST & WebSocket Server starts on `0.0.0.0:4123`.
   - UDP LAN Discovery Responder starts on `0.0.0.0:4124`.

---

## Build & Installer Commands

| Command | Purpose | Output Location |
| :--- | :--- | :--- |
| `npm run build:installer:demo` | **Builds Windows Installer with 100+ Demo Products pre-loaded** | `src-tauri/target/release/bundle/nsis/` |
| `npm run build:installer:clean` | **Builds Clean Windows Installer without any demo data** | `src-tauri/target/release/bundle/nsis/` |
| `npm run build:installer` | Default production installer build (same as clean) | `src-tauri/target/release/bundle/nsis/` |
| `npm run seed:demo` | Instantly seeds demo products & categories into local DB | Local AppData DB |
| `npm run clear:demo` | Clears demo products & categories from local DB | Local AppData DB |
| `npm start` | Launches development server with hot-reload | `localhost:1420` |
| `npm run build:exe` | Compiles standalone production `.exe` binary without packaging | `src-tauri/target/release/billing-software.exe` |

---

### Step 2: Create Cashier & Staff Accounts
From the Main Admin PC:
1. Navigate to **Staff & Users** in the sidebar.
2. Click **+ Add New User**.
3. Enter details:
   - **Full Name**: `Cashier Counter 1`
   - **Username**: `cashier1`
   - **Password**: `pass123`
   - **Role**: Select **Cashier** (automatically selects `Billing` & `History` screens).
   - **Max Discount %**: Set allowed cashier discount limit (e.g. `5%`).
4. Click **Save User**.

---

### Step 3: Find Host IP & Connection PIN Code
From the Main Admin PC:
1. Go to **Settings -> Network & Connected Terminals**.
2. Note down:
   - **Host IP Address**: e.g., `192.168.1.15`
   - **Host Port**: `4123`
   - **Connection Code (PIN)**: e.g., `BILLING-884920` (6-character security PIN)

---

### Step 4: Connect Secondary Computers (Cashier Terminals)
On any additional computer connected to the same Wi-Fi / LAN:
1. Install and open **Billing Software**.
2. On the first screen, click **"Connect to Main Host PC (Cashier Terminal)"**.
3. **Connection Method A (Automatic LAN Scan - Recommended)**:
   - The app scans your local network and displays discovered Host PCs.
   - Click **Connect** and enter the **Connection Code** (`BILLING-884920`).
4. **Connection Method B (Manual IP Entry)**:
   - Enter Host IP (`192.168.1.15`), Port (`4123`), and Connection Code (`BILLING-884920`).
   - Click **Test Connection** -> **Connect Terminal**.
5. Once connected, cashiers can log in with their created username and password.

---

### Step 5: Approving & Managing Connected Devices
From the Main Admin PC:
1. Go to **Settings -> Network & Connected Terminals**.
2. Under **Registered Terminal Devices**, you will see all connected cashier PCs.
3. Manage authorization:
   - **Approve / Authorize** new cashier terminals.
   - **Revoke Access** if a device is decommissioned or unauthorized.

---

### Step 6: Live Billing & Synchronization
- Every bill completed on a Cashier PC immediately:
  1. Deducts product stock in the central SQLite database on the Main PC.
  2. Creates atomic financial audit logs and stock movement history.
  3. Updates Dashboard metrics and live bill counts in real time via WebSockets.
- Cashiers can reprint receipts locally on their counter thermal printers.

---

## Technology Stack

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

## System Requirements

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

## Getting Started (Development)

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

---

## Building Production Standalone .exe & Installer

### Option A: Build Standalone Single .exe
Compiles an optimized, standalone Windows binary for direct execution:

```powershell
npm run build:exe
```

Output Location: `src-tauri/target/release/billing-software.exe`

---

### Option B: Build Full Windows Installer
Compiles a production Windows setup installer with desktop shortcuts and uninstaller:

```powershell
npm run build:installer
```

Output Location: `src-tauri/target/release/bundle/nsis/Billing Software_0.1.0_x64-setup.exe`

---

## Default Credentials & First Login

| Username | Default Password | Role | Default Permissions |
| :--- | :--- | :--- | :--- |
| **`admin`** | **`admin123`** | Administrator | Full Access (All 9 Screens) |

---

## Cashier Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **`F2`** / **`Ctrl + B`** | **Go to POS** | Switch immediately to the Billing Register screen |
| **`F4`** / **`Ctrl + P`** | **Complete & Pay** | Open payment modal and finish transaction |
| **`Ctrl + F`** | **Search Products** | Focus the product search input bar |
| **`Ctrl + N`** | **Hold / New Cart** | Save active cart as draft and open fresh cart |
| **`+`** / **`-`** | **Adjust Quantity** | Increment or decrement quantity of selected item |
| **`Esc`** | **Close / Clear** | Close open modals or clear current search |

---

## License & Distribution

Copyright (c) 2026 Billing Software. All rights reserved.  
This software is licensed on a per-shop basis and protected by hardware-bound licensing.
