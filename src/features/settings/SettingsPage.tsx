import React, { useState, useRef } from 'react';
import {
  Store,
  Receipt,
  Printer,
  Shield,
  Save,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  ExternalLink,
  HelpCircle,
  Link as LinkIcon,
  Wifi,
  Server,
  Monitor,
  Copy,
  RefreshCw,
  Upload,
  Trash2,
  Usb,
  Key,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { Header } from '../../components/Header';
import { useSettings } from '../../contexts/SettingsContext';
import { useLicense } from '../../contexts/LicenseContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { SetupModeModal } from '../network/SetupModeModal';
import toast from 'react-hot-toast';

export const SettingsPage: React.FC = () => {
  const { settings, updateSetting, reloadSettings } = useSettings();
  const { status, deactivate } = useLicense();
  const {
    networkInfo,
    devices,
    loadDevices,
    approveDevice,
    revokeDevice,
  } = useNetwork();

  const [activeTab, setActiveTab] = useState<
    'shop' | 'gst' | 'printer' | 'gdrive' | 'network' | 'license'
  >('shop');
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);

  // Form states
  const [shopName, setShopName] = useState(settings['shop_name'] || 'My Shop');
  const [shopPhone, setShopPhone] = useState(settings['shop_phone'] || '');
  const [shopAddress, setShopAddress] = useState(settings['shop_address'] || '');
  const [currencySymbol, setCurrencySymbol] = useState(settings['currency_symbol'] || '₹');
  const [shopLogo, setShopLogo] = useState(settings['shop_logo'] || '');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [gstEnabled, setGstEnabled] = useState(settings['gst_enabled'] === 'true');
  const [gstNumber, setGstNumber] = useState(settings['gst_number'] || '');
  const [gstDefaultPct, setGstDefaultPct] = useState(settings['gst_default_percentage'] || '500');

  const [printerPaper, setPrinterPaper] = useState(settings['printer_paper_size'] || 'A4');
  const [printerCopies, setPrinterCopies] = useState(settings['printer_copies'] || '1');
  const [defaultPayment, setDefaultPayment] = useState(settings['default_payment_method'] || 'cash');

  // Google Drive State
  const [driveFolderId, setDriveFolderId] = useState(settings['gdrive_folder_id'] || '');
  const [autoDriveSync, setAutoDriveSync] = useState(settings['gdrive_auto_sync'] === 'true');

  const [usbDriveLetter, setUsbDriveLetter] = useState('E:');
  const [usbShopName, setUsbShopName] = useState(settings['shop_name'] || 'Authorized Shop');
  const [isWritingUsb, setIsWritingUsb] = useState(false);

  const [isSaving, setIsSaving] = useState(false);

  const handleCreateSecurityUsb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usbDriveLetter.trim() || !usbShopName.trim()) {
      toast.error('Drive letter and Shop Name are required');
      return;
    }
    setIsWritingUsb(true);
    try {
      const msg = await api.createSecurityUsbKey(usbDriveLetter.trim(), usbShopName.trim(), 'perpetual');
      toast.success(msg || 'Security Pen Drive created successfully!');
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to create Security USB key');
    } finally {
      setIsWritingUsb(false);
    }
  };

  const handleDeactivateDevice = async () => {
    if (window.confirm('Are you sure you want to deactivate this device? It will strictly require the Security Pen Drive to re-activate.')) {
      await deactivate();
    }
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo image must be smaller than 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setShopLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setShopLogo('');
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleSaveShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSetting('shop_name', shopName.trim());
      await updateSetting('shop_phone', shopPhone.trim());
      await updateSetting('shop_address', shopAddress.trim());
      await updateSetting('currency_symbol', currencySymbol.trim());
      await updateSetting('default_payment_method', defaultPayment);
      await updateSetting('shop_logo', shopLogo);
      await reloadSettings();
      toast.success('Shop settings and logo updated successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveGst = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSetting('gst_enabled', gstEnabled ? 'true' : 'false');
      await updateSetting('gst_number', gstNumber.trim());
      await updateSetting('gst_default_percentage', gstDefaultPct);
      await reloadSettings();
      toast.success('GST tax configuration saved');
    } catch {
      toast.error('Failed to save GST settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePrinter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSetting('printer_paper_size', printerPaper);
      await updateSetting('printer_copies', printerCopies);
      await reloadSettings();
      toast.success('Printer preferences saved');
    } catch {
      toast.error('Failed to save printer settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveDrive = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let cleanedId = driveFolderId.trim();
      if (cleanedId.includes('folders/')) {
        const match = cleanedId.match(/folders\/([a-zA-Z0-9-_]+)/);
        if (match && match[1]) {
          cleanedId = match[1];
          setDriveFolderId(cleanedId);
        }
      }
      await updateSetting('gdrive_folder_id', cleanedId);
      await updateSetting('gdrive_auto_sync', autoDriveSync ? 'true' : 'false');
      await reloadSettings();
      toast.success('Google Drive Cloud Backup configured');
    } catch {
      toast.error('Failed to save Google Drive settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Application Settings"
        subtitle="Configure shop identity, GST taxes, printing, Google Drive cloud sync, and security keys"
      />

      <div className="p-6 overflow-y-auto flex-1 w-full space-y-5">
        {/* Settings Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-surface-200 pb-2">
          <button
            onClick={() => setActiveTab('shop')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'shop'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Shop Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('gst')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'gst'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>GST & Tax Config</span>
          </button>

          <button
            onClick={() => setActiveTab('printer')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'printer'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Bill Printing</span>
          </button>

          <button
            onClick={() => setActiveTab('gdrive')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'gdrive'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>Google Drive Sync</span>
          </button>

          <button
            onClick={() => setActiveTab('network')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'network'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Network & Devices</span>
          </button>

          <button
            onClick={() => setActiveTab('license')}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              activeTab === 'license'
                ? 'bg-primary-600 text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>License & Security</span>
          </button>
        </div>

        {/* Tab 1: Shop Profile */}
        {activeTab === 'shop' && (
          <form onSubmit={handleSaveShop} className="card p-5 space-y-4 bg-white">
            <h3 className="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2">
              Shop Information & Receipt Header
            </h3>

            {/* Shop Logo Upload */}
            <div className="flex items-center gap-5 p-4 rounded-xl border border-dashed border-surface-300 bg-surface-50/60">
              <div className="w-16 h-16 rounded-xl bg-white border border-surface-200 flex items-center justify-center overflow-hidden shadow-sm flex-shrink-0">
                {shopLogo ? (
                  <img src={shopLogo} alt="Shop Logo" className="w-full h-full object-contain p-1" />
                ) : (
                  <Store className="w-8 h-8 text-surface-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-surface-800">Shop / Business Logo</div>
                <div className="text-2xs text-surface-500 mt-0.5">
                  Appears on login page, sidebar, and printed bill receipts. PNG, JPG or SVG (Max 2MB).
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="btn-secondary py-1 px-2.5 text-xs flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{shopLogo ? 'Change Logo' : 'Upload Logo'}</span>
                  </button>
                  {shopLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="text-xs text-red-600 hover:text-red-700 py-1 px-2 hover:bg-red-50 rounded flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remove</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Shop Name *</label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="form-input"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contact Phone</label>
                <input
                  type="text"
                  value={shopPhone}
                  onChange={(e) => setShopPhone(e.target.value)}
                  placeholder="e.g. +91 XXXXXXXXXX"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Shop Address</label>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Shop address displayed on print receipts"
                rows={2}
                className="form-input resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Currency Symbol</label>
                <input
                  type="text"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="form-input font-mono"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Default Payment Method</label>
                <select
                  value={defaultPayment}
                  onChange={(e) => setDefaultPayment(e.target.value)}
                  className="form-select"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / QR Code</option>
                  <option value="card">Card</option>
                  <option value="upi_cash">UPI + Cash</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-surface-100 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Shop Profile'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 2: GST Config */}
        {activeTab === 'gst' && (
          <form onSubmit={handleSaveGst} className="card p-5 space-y-4 bg-white">
            <h3 className="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2">
              GST Tax Configuration (Optional)
            </h3>

            <div className="p-3 rounded bg-surface-50 border border-surface-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-surface-800">
                  Enable GST Calculation on POS Bills
                </div>
                <div className="text-2xs text-surface-500">
                  When enabled, tax rates and amounts will be computed and printed on bills.
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={gstEnabled}
                  onChange={(e) => setGstEnabled(e.target.checked)}
                  className="form-checkbox"
                />
                <span className="text-xs font-bold text-surface-800">
                  {gstEnabled ? 'GST ON' : 'GST OFF'}
                </span>
              </label>
            </div>

            {gstEnabled && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="form-group">
                  <label className="form-label">Shop GSTIN (GST Number)</label>
                  <input
                    type="text"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    placeholder="e.g. XXAAAA0000A1ZX"
                    className="form-input font-mono uppercase"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Default GST Rate (%)</label>
                  <select
                    value={gstDefaultPct}
                    onChange={(e) => setGstDefaultPct(e.target.value)}
                    className="form-select font-mono"
                  >
                    <option value="0">0%</option>
                    <option value="500">5%</option>
                    <option value="1200">12%</option>
                    <option value="1800">18%</option>
                    <option value="2800">28%</option>
                  </select>
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-surface-100 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save GST Settings'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 3: Printer Preferences */}
        {activeTab === 'printer' && (
          <form onSubmit={handleSavePrinter} className="card p-5 space-y-4 bg-white">
            <h3 className="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2">
              Receipt & Printer Format
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Paper Format</label>
                <select
                  value={printerPaper}
                  onChange={(e) => setPrinterPaper(e.target.value)}
                  className="form-select"
                >
                  <option value="A4">Standard A4 Sheet</option>
                  <option value="Thermal80">Thermal Receipt (80mm)</option>
                  <option value="Thermal58">Thermal Receipt (58mm)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Copies per Print</label>
                <select
                  value={printerCopies}
                  onChange={(e) => setPrinterCopies(e.target.value)}
                  className="form-select"
                >
                  <option value="1">1 Copy (Customer)</option>
                  <option value="2">2 Copies (Customer + Shop)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-surface-100 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Printer Preferences'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 4: Google Drive Sync */}
        {activeTab === 'gdrive' && (
          <form onSubmit={handleSaveDrive} className="card p-5 space-y-4 bg-white">
            <div className="flex items-center justify-between border-b border-surface-100 pb-2">
              <h3 className="text-sm font-bold text-surface-900 flex items-center gap-2">
                <Cloud className="w-4 h-4 text-blue-600" />
                <span>Google Drive Cloud Backup Settings</span>
              </h3>
              {driveFolderId && (
                <a
                  href={
                    driveFolderId.startsWith('http')
                      ? driveFolderId
                      : `https://drive.google.com/drive/folders/${driveFolderId}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-2xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <span>Open Folder</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Google Drive Folder Link / ID *</label>
                <div className="relative">
                  <LinkIcon className="w-4 h-4 text-surface-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={driveFolderId}
                    onChange={(e) => setDriveFolderId(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/... or Folder ID"
                    className="form-input pl-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="form-group flex flex-col justify-between">
                <label className="form-label">Auto-Sync Schedule</label>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-50 border border-surface-200">
                  <span className="text-xs text-surface-700">Auto-upload daily backup snapshots</span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoDriveSync}
                      onChange={(e) => setAutoDriveSync(e.target.checked)}
                      className="form-checkbox"
                    />
                    <span className="text-xs font-bold text-surface-800">
                      {autoDriveSync ? 'ON' : 'OFF'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* How to use guide */}
            <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs space-y-1.5">
              <div className="font-bold text-blue-900 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-blue-700" />
                <span>Google Drive Cloud Configuration Guide:</span>
              </div>
              <p className="text-2xs text-blue-800 leading-relaxed">
                1. Go to <b>drive.google.com</b> and create a new folder (e.g. <i>Billing_Backups</i>).<br/>
                2. Right-click the folder and copy its shareable link.<br/>
                3. Paste the link into the box above and click <b>Save Settings</b>.<br/>
                4. Go to <b>Backup & Import</b> to trigger instant cloud uploads anytime!
              </p>
            </div>

            <div className="pt-2 border-t border-surface-100 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="btn-primary text-xs flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Google Drive Config'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Tab 5: Multi-Computer Network & Devices */}
        {activeTab === 'network' && (
          <div className="space-y-5">
            {/* Host Server Details Card */}
            <div className="card p-5 space-y-4 bg-white border border-surface-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-surface-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-primary-100 text-primary-700 flex items-center justify-center">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-surface-900">
                      Local Network Host Service
                    </h3>
                    <p className="text-2xs text-surface-500">
                      {networkInfo?.mode === 'host'
                        ? 'This computer is running as the Main Central Host'
                        : 'This computer is operating in Cashier Client mode'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="badge badge-success text-2xs flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>● Service Active</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsSetupModalOpen(true)}
                    className="btn-secondary btn-sm text-xs font-semibold"
                  >
                    Change Setup Type
                  </button>
                </div>
              </div>

              {/* Network Parameters Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-surface-50 border border-surface-200">
                  <div className="text-2xs text-surface-500 font-medium">Host LAN Address</div>
                  <div className="font-mono text-xs font-bold text-surface-900 mt-0.5">
                    {networkInfo?.host_ip || '127.0.0.1'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-50 border border-surface-200">
                  <div className="text-2xs text-surface-500 font-medium">Service Port</div>
                  <div className="font-mono text-xs font-bold text-surface-900 mt-0.5">
                    {networkInfo?.host_port || 4123}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-surface-50 border border-surface-200">
                  <div className="text-2xs text-surface-500 font-medium">Shop Identifier</div>
                  <div className="font-mono text-xs font-bold text-primary-700 mt-0.5 truncate">
                    {networkInfo?.shop_id || 'SHOP-BILLING-000001'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-primary-50/50 border border-primary-200 flex items-center justify-between">
                  <div>
                    <div className="text-2xs text-primary-700 font-semibold">Connection Code</div>
                    <div className="font-mono text-xs font-extrabold text-primary-900 tracking-wider mt-0.5">
                      {networkInfo?.connection_code || 'BILLING-884920'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(networkInfo?.connection_code || '');
                      toast.success('Connection code copied to clipboard!');
                    }}
                    className="p-1.5 rounded hover:bg-primary-100 text-primary-700 transition-colors"
                    title="Copy connection code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Registered Devices Table */}
            <div className="card overflow-hidden bg-white border border-surface-200 shadow-sm">
              <div className="p-4 border-b border-surface-100 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-surface-900">
                    Registered Shop Devices ({devices.length})
                  </h4>
                  <p className="text-2xs text-surface-500 mt-0.5">
                    Authorize or revoke Cashier computers connected to your shop database.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => loadDevices()}
                  className="btn-secondary btn-sm text-2xs flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Device Name</th>
                      <th>Device Type</th>
                      <th>IP Address</th>
                      <th>Last Connected</th>
                      <th>Status</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-xs text-surface-400">
                          No devices registered yet.
                        </td>
                      </tr>
                    ) : (
                      devices.map((d) => (
                        <tr key={d.id}>
                          <td className="font-semibold text-surface-900 flex items-center gap-2">
                            {d.device_type === 'host' ? (
                              <Server className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Monitor className="w-4 h-4 text-blue-600" />
                            )}
                            <span>{d.device_name}</span>
                          </td>
                          <td>
                            <span className="badge badge-neutral uppercase text-2xs font-mono">
                              {d.device_type}
                            </span>
                          </td>
                          <td className="font-mono text-xs text-surface-600">
                            {d.ip_address || 'Localhost'}
                          </td>
                          <td className="text-xs text-surface-500 font-mono">
                            {d.last_seen_at}
                          </td>
                          <td>
                            {d.is_approved ? (
                              <span className="badge badge-success text-2xs">Authorized</span>
                            ) : (
                              <span className="badge badge-danger text-2xs">Pending Approval</span>
                            )}
                          </td>
                          <td className="text-right">
                            {d.device_type !== 'host' ? (
                              <div className="flex items-center justify-end gap-1.5">
                                {!d.is_approved ? (
                                  <button
                                    type="button"
                                    onClick={() => approveDevice(d.device_id)}
                                    className="btn-primary btn-sm text-2xs py-1 px-2.5"
                                  >
                                    Approve
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => revokeDevice(d.device_id)}
                                    className="btn-secondary btn-sm text-2xs py-1 px-2 text-red-600 hover:bg-red-50"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </div>
                            ) : (
                              <span className="text-2xs text-surface-400 font-medium px-2 py-0.5 bg-surface-100 rounded">
                                Primary Host
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Tab 6: Offline Activation Status */}
        {activeTab === 'license' && (
          <div className="card p-5 space-y-4 bg-white">
            <h3 className="text-sm font-bold text-surface-900 border-b border-surface-100 pb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary-600" />
              <span>Security Key & Device License</span>
            </h3>

            <div className="p-4 rounded-lg bg-surface-50 border border-surface-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-500">License Status:</span>
                <span className="badge badge-success flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{status?.state || 'ACTIVE'}</span>
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-500">Licensed Shop:</span>
                <span className="font-bold text-surface-900">{status?.shop_name || 'Authorized Shop'}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-500">License Type:</span>
                <span className="font-semibold capitalize text-accent-700">{status?.license_type || 'Lifetime'}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-500">Hardware Binding:</span>
                <span className="font-mono text-2xs bg-surface-200 px-1.5 py-0.5 rounded text-surface-800">
                  Bound to this PC (Cryptographically Sealed)
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-surface-500">Application Version:</span>
                <span className="font-mono text-surface-700">v0.1.0 (Production Desktop)</span>
              </div>
            </div>

            {/* Admin Tool: Create Security Pen Drive for Customer */}
            <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Usb className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-blue-950">Security Pen Drive Creator</h4>
                  <p className="text-3xs text-blue-700">Write cryptographic offline license key to any connected USB drive</p>
                </div>
              </div>

              <form onSubmit={handleCreateSecurityUsb} className="space-y-2.5 pt-1">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="form-group">
                    <label className="form-label text-2xs font-semibold text-blue-900">USB Drive Letter</label>
                    <input
                      type="text"
                      value={usbDriveLetter}
                      onChange={(e) => setUsbDriveLetter(e.target.value.toUpperCase())}
                      placeholder="e.g. E: or F:"
                      className="form-input font-mono uppercase text-xs h-8 bg-white"
                      required
                    />
                  </div>
                  <div className="col-span-2 form-group">
                    <label className="form-label text-2xs font-semibold text-blue-900">Customer Shop Name</label>
                    <input
                      type="text"
                      value={usbShopName}
                      onChange={(e) => setUsbShopName(e.target.value)}
                      placeholder="e.g. Your Shop Name"
                      className="form-input text-xs h-8 bg-white"
                      required
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isWritingUsb}
                    className="btn-primary text-xs h-8 flex items-center gap-1.5"
                  >
                    {isWritingUsb ? (
                      <>
                        <div className="spinner w-3.5 h-3.5 border-white" />
                        <span>Signing & Writing Key...</span>
                      </>
                    ) : (
                      <>
                        <Key className="w-3.5 h-3.5" />
                        <span>Format & Create Security Pen Drive</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <b>Device Transfer Policy:</b> Deactivating this computer releases the local hardware binding.
                To transfer this license to another computer, simply insert your Security Pen Drive into the new machine.
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={handleDeactivateDevice}
                className="btn-danger text-xs h-8 px-3"
              >
                Deactivate This Device
              </button>
            </div>
          </div>
        )}
      </div>

      <SetupModeModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />
    </div>
  );
};
