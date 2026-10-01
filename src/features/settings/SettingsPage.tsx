import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Store,
  Receipt,
  Printer,
  Shield,
  Save,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Server,
  Monitor,
  Copy,
  RefreshCw,
  Upload,
  Trash2,
  ShieldCheck,
  HardDrive,
  FileText,
  Layers,
  Loader2,
  Play,
  KeyRound,
  Usb,
} from 'lucide-react';
import type { PrinterInfo, DriveInfo } from '../../types';
import { api } from '../../lib/ipc';
import { Header } from '../../components/Header';
import { CustomSelect } from '../../components/CustomSelect';
import { useSettings } from '../../contexts/SettingsContext';
import { useLicense } from '../../contexts/LicenseContext';
import { useNetwork } from '../../contexts/NetworkContext';
import { SetupModeModal } from '../network/SetupModeModal';
import { BackupPage } from '../backup/BackupPage';
import { setGlobalCurrencySymbol } from '../../lib/format';
import toast from 'react-hot-toast';

export const CURRENCY_OPTIONS = [
  { value: '₹', code: 'INR', label: '₹ — INR (Indian Rupee)' },
  { value: '$', code: 'USD', label: '$ — USD (US Dollar)' },
  { value: '€', code: 'EUR', label: '€ — EUR (Euro)' },
  { value: '£', code: 'GBP', label: '£ — GBP (British Pound)' },
  { value: 'AED ', code: 'AED', label: 'AED — UAE Dirham' },
  { value: 'SAR ', code: 'SAR', label: 'SAR — Saudi Riyal' },
  { value: 'S$', code: 'SGD', label: 'S$ — Singapore Dollar' },
  { value: 'RM ', code: 'MYR', label: 'RM — Malaysian Ringgit' },
  { value: 'A$', code: 'AUD', label: 'A$ — Australian Dollar' },
  { value: 'C$', code: 'CAD', label: 'C$ — Canadian Dollar' },
  { value: '¥', code: 'JPY', label: '¥ — Japanese Yen' },
  { value: 'CUSTOM', code: 'CUSTOM', label: 'Other / Custom Symbol...' },
];

export const getCurrencyCodeForSymbol = (sym: string): string => {
  if (!sym) return 'INR';
  const clean = sym.trim();
  const match = CURRENCY_OPTIONS.find((o) => o.value.trim() === clean && o.code !== 'CUSTOM');
  return match ? match.code : 'CUSTOM';
};

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

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    'shop' | 'gst' | 'printer' | 'network' | 'backup' | 'license' | 'danger'
  >(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab && ['shop', 'gst', 'printer', 'network', 'backup', 'license', 'danger'].includes(tab)) {
      return tab as any;
    }
    return 'shop';
  });

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['shop', 'gst', 'printer', 'network', 'backup', 'license', 'danger'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, [searchParams]);

  const isSetupModalOpenState = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = isSetupModalOpenState;

  // Form states
  const [shopName, setShopName] = useState(settings['shop_name'] || 'My Shop');
  const [shopPhone, setShopPhone] = useState(settings['shop_phone'] || '');
  const [shopAddress, setShopAddress] = useState(settings['shop_address'] || '');
  const [shopEmail, setShopEmail] = useState(settings['shop_email'] || '');
  const [fssaiNumber, setFssaiNumber] = useState(settings['fssai_number'] || '');
  const [receiptFooter, setReceiptFooter] = useState(settings['receipt_footer_note'] || 'Thank you for shopping with us! Please visit again.');
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(() => {
    return getCurrencyCodeForSymbol(settings['currency_symbol'] || '₹');
  });
  const [customCurrencySymbol, setCustomCurrencySymbol] = useState<string>(() => {
    const cur = settings['currency_symbol'] || '₹';
    const code = getCurrencyCodeForSymbol(cur);
    return code === 'CUSTOM' ? cur : '';
  });
  const [shopLogo, setShopLogo] = useState(settings['shop_logo'] || '');
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [gstEnabled, setGstEnabled] = useState(settings['gst_enabled'] === 'true');
  const [gstNumber, setGstNumber] = useState(settings['gst_number'] || '');
  const [gstDefaultPct, setGstDefaultPct] = useState(settings['gst_default_percentage'] || '500');

  const [printerPaper, setPrinterPaper] = useState<string>(() => {
    return settings['printer_paper_size'] || localStorage.getItem('pos_saved_paper_size') || 'Thermal80';
  });
  const [printerCopies, setPrinterCopies] = useState<string>(() => {
    return settings['printer_copies'] || localStorage.getItem('pos_saved_printer_copies') || '1';
  });
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => {
    return settings['printer_name'] || localStorage.getItem('pos_saved_printer_name') || '';
  });
  const [installedPrinters, setInstalledPrinters] = useState<PrinterInfo[]>([]);
  const [systemDefaultPrinter, setSystemDefaultPrinter] = useState<string | null>(null);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const [defaultPayment, setDefaultPayment] = useState(settings['default_payment_method'] || 'cash');

  // Factory Reset State
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // USB Security Key Burning State
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [selectedDriveForBurn, setSelectedDriveForBurn] = useState<string>('');
  const [isBurningKey, setIsBurningKey] = useState<boolean>(false);
  const [isLoadingDrives, setIsLoadingDrives] = useState<boolean>(false);

  const loadDrives = async () => {
    setIsLoadingDrives(true);
    try {
      const list = await api.getAllDrives();
      setDrives(list);
      if (list.length > 0 && !selectedDriveForBurn) {
        // Prefer removable drives if present, else first drive
        const rem = list.find((d) => d.is_removable || d.letter !== 'C:');
        setSelectedDriveForBurn(rem ? rem.letter : list[0].letter);
      }
    } catch {
      setDrives([]);
    } finally {
      setIsLoadingDrives(false);
    }
  };

  const handleBurnUsbKey = async () => {
    if (!selectedDriveForBurn) {
      toast.error('Please select an inserted USB pen drive');
      return;
    }
    setIsBurningKey(true);
    const toastId = toast.loading(`Writing single-use security key to drive ${selectedDriveForBurn}...`);
    try {
      const msg = await api.createUsbSecurityKey(selectedDriveForBurn, shopName);
      toast.success(msg || 'Security key successfully written to pen drive!', { id: toastId, duration: 6000 });
      await loadDrives();
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Failed to burn security key');
      toast.error(errMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsBurningKey(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);

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
      const finalCurrency = selectedCurrencyCode === 'CUSTOM'
        ? (customCurrencySymbol.trim() || '₹')
        : (CURRENCY_OPTIONS.find((o) => o.code === selectedCurrencyCode)?.value || '₹');

      await updateSetting('shop_name', shopName.trim());
      await updateSetting('shop_phone', shopPhone.trim());
      await updateSetting('shop_address', shopAddress.trim());
      await updateSetting('shop_email', shopEmail.trim());
      await updateSetting('fssai_number', fssaiNumber.trim());
      await updateSetting('receipt_footer_note', receiptFooter.trim());
      await updateSetting('currency_symbol', finalCurrency);
      await updateSetting('default_payment_method', defaultPayment);
      await updateSetting('shop_logo', shopLogo);
      setGlobalCurrencySymbol(finalCurrency);
      await reloadSettings();
      toast.success('Shop profile & receipt details updated successfully');
    } catch {
      toast.error('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleFactoryReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      toast.error('Please type "RESET" to confirm data wipe');
      return;
    }
    setIsResetting(true);
    try {
      await api.clearAllBusinessData();
      toast.success('All bills, products, and old business data wiped successfully!');
      setIsResetConfirmOpen(false);
      setResetConfirmText('');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Reset failed');
    } finally {
      setIsResetting(false);
    }
  };

  const handleSaveGst = async (e: React.FormEvent) => {
    e.preventDefault();
    if (gstEnabled && gstNumber.trim() && gstNumber.trim().length !== 13) {
      toast.error('GST number must be fixed at exactly 13 characters');
      return;
    }
    setIsSaving(true);
    try {
      await updateSetting('gst_enabled', gstEnabled ? 'true' : 'false');
      await updateSetting('gst_number', gstNumber.trim().toUpperCase());
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
      await updateSetting('printer_name', selectedPrinter);
      await updateSetting('printer_paper_size', printerPaper);
      await updateSetting('printer_copies', printerCopies);

      localStorage.setItem('pos_saved_printer_name', selectedPrinter);
      localStorage.setItem('pos_saved_paper_size', printerPaper);
      localStorage.setItem('pos_saved_printer_copies', printerCopies);

      await reloadSettings();
      toast.success('Printer preferences saved permanently');
    } catch {
      toast.error('Failed to save printer settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPrint = async () => {
    if (isTestingPrinter) return;
    setIsTestingPrinter(true);
    try {
      const res = await api.testPrint(selectedPrinter || undefined, printerPaper);
      toast.success(res || 'Test page sent to printer successfully!');
    } catch (err: any) {
      console.error('Test print failed:', err);
      const msg = typeof err === 'string' ? err : err?.message || 'Unable to print test ticket. Please verify printer connection.';
      toast.error(msg);
    } finally {
      setIsTestingPrinter(false);
    }
  };

  const hasLoadedPrintersRef = useRef(false);

  const loadInstalledPrinters = async (force = false) => {
    if (isLoadingPrinters) return;
    if (!force && hasLoadedPrintersRef.current && installedPrinters.length > 0) return;
    setIsLoadingPrinters(true);
    try {
      const [printers, defPrinter] = await Promise.all([
        api.getPrinters().catch(() => [] as PrinterInfo[]),
        api.getDefaultPrinter().catch(() => null),
      ]);
      setInstalledPrinters(printers);
      setSystemDefaultPrinter(defPrinter);
      hasLoadedPrintersRef.current = true;
    } catch (err) {
      console.error('Failed to load installed printers:', err);
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'printer') {
      loadInstalledPrinters(false);
    } else if (activeTab === 'license') {
      loadDrives();
    }
  }, [activeTab]);

  useEffect(() => {
    if (settings['shop_name']) setShopName(settings['shop_name']);
    if (settings['shop_phone']) setShopPhone(settings['shop_phone']);
    if (settings['shop_address']) setShopAddress(settings['shop_address']);
    if (settings['shop_email']) setShopEmail(settings['shop_email']);
    if (settings['fssai_number']) setFssaiNumber(settings['fssai_number']);
    if (settings['receipt_footer_note']) setReceiptFooter(settings['receipt_footer_note']);
    if (settings['shop_logo']) setShopLogo(settings['shop_logo']);
    if (settings['default_payment_method']) setDefaultPayment(settings['default_payment_method']);
    if (settings['printer_paper_size']) {
      setPrinterPaper(settings['printer_paper_size']);
      localStorage.setItem('pos_saved_paper_size', settings['printer_paper_size']);
    }
    if (settings['printer_copies']) {
      setPrinterCopies(settings['printer_copies']);
      localStorage.setItem('pos_saved_printer_copies', settings['printer_copies']);
    }
    if (settings['printer_name'] !== undefined) {
      setSelectedPrinter(settings['printer_name']);
      localStorage.setItem('pos_saved_printer_name', settings['printer_name']);
    }
    if (settings['currency_symbol']) {
      const cur = settings['currency_symbol'];
      const code = getCurrencyCodeForSymbol(cur);
      setSelectedCurrencyCode(code);
      if (code === 'CUSTOM') {
        setCustomCurrencySymbol(cur);
      }
    }
  }, [settings]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      <Header
        title="Application Settings"
        subtitle="Configure shop identity, GST taxes, bill printing, network devices, and license security"
      />

      <div className="p-6 overflow-y-auto flex-1 w-full space-y-5">
        {/* Settings Navigation Tabs */}
        <div className="bg-white p-1 rounded-lg border border-surface-200 shadow-xs flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setActiveTab('shop');
              setSearchParams({ tab: 'shop' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'shop'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            <span>Shop Profile</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('gst');
              setSearchParams({ tab: 'gst' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'gst'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>GST & Tax Config</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('printer');
              setSearchParams({ tab: 'printer' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'printer'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Bill Printing</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('network');
              setSearchParams({ tab: 'network' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'network'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Network & Devices</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('backup');
              setSearchParams({ tab: 'backup' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'backup'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Backup & Restore</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('license');
              setSearchParams({ tab: 'license' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeTab === 'license'
                ? 'bg-primary-600 text-white shadow-xs'
                : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100/80'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>License & Security</span>
          </button>

          <div className="h-5 w-px bg-surface-200 mx-1 hidden sm:block" />

          <button
            type="button"
            onClick={() => {
              setActiveTab('danger');
              setSearchParams({ tab: 'danger' });
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ml-auto ${
              activeTab === 'danger'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-600 hover:bg-red-50 hover:text-red-700'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Data</span>
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
                  placeholder="Contact Phone Number"
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Shop Address</label>
              <textarea
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
                placeholder="Enter complete shop address (Street, Area, City, Pincode)"
                rows={3}
                className="w-full min-h-[90px] p-3 text-sm text-surface-900 bg-white border border-surface-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 placeholder:text-surface-400 transition-all resize-y shadow-xs font-sans leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">Shop Email (Optional)</label>
                <input
                  type="email"
                  value={shopEmail}
                  onChange={(e) => setShopEmail(e.target.value)}
                  placeholder="contact@myshop.com"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">FSSAI / License Number</label>
                <input
                  type="text"
                  value={fssaiNumber}
                  onChange={(e) => setFssaiNumber(e.target.value)}
                  placeholder="FSSAI License / Registration No"
                  className="form-input font-mono"
                />
                <p className="text-2xs text-surface-500 mt-1">
                  Printed permanently on all bill receipts whenever details are provided.
                </p>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Receipt Footer Message</label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Thank you for shopping with us! Please visit again."
                className="form-input"
              />
              <p className="text-2xs text-surface-500 mt-0.5">
                Printed at the bottom of all customer thermal and paper receipts.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="form-group">
                <label className="form-label flex items-center justify-between">
                  <span>Currency Type</span>
                  <span className="text-2xs font-normal text-surface-400">Select currency</span>
                </label>
                <CustomSelect
                  value={selectedCurrencyCode}
                  onChange={(val) => {
                    setSelectedCurrencyCode(val);
                    if (val !== 'CUSTOM') {
                      const sym = CURRENCY_OPTIONS.find((c) => c.code === val)?.value || '₹';
                      setGlobalCurrencySymbol(sym);
                    }
                  }}
                  options={CURRENCY_OPTIONS.map((c) => ({
                    value: c.code,
                    label: c.label,
                  }))}
                  size="lg"
                  buttonClassName="w-full h-10 text-sm font-medium rounded-lg"
                />
                {selectedCurrencyCode === 'CUSTOM' && (
                  <div className="pt-2">
                    <label className="text-2xs font-medium text-surface-600 mb-1 block">
                      Custom Currency Symbol (e.g. ৳, ฿, ₱)
                    </label>
                    <input
                      type="text"
                      value={customCurrencySymbol}
                      onChange={(e) => setCustomCurrencySymbol(e.target.value)}
                      placeholder="e.g. ৳"
                      className="form-input h-10 text-sm font-mono"
                      required
                    />
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label flex items-center justify-between">
                  <span>Default Payment Method</span>
                  <span className="text-2xs font-normal text-surface-400">POS checkout default</span>
                </label>
                <CustomSelect
                  value={defaultPayment}
                  onChange={setDefaultPayment}
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'upi', label: 'UPI / QR Code' },
                    { value: 'card', label: 'Card' },
                    { value: 'upi_cash', label: 'UPI + Cash' },
                  ]}
                  size="lg"
                  buttonClassName="w-full h-10 text-sm font-medium rounded-lg"
                />
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
                  <div className="flex items-center justify-between">
                    <label className="form-label">Shop GSTIN (GST Number)</label>
                    <span className="text-2xs font-mono text-surface-500 font-semibold">
                      {gstNumber.length}/13
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={13}
                    value={gstNumber}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 13);
                      setGstNumber(val);
                    }}
                    placeholder="Fixed 13 chars (e.g. 22AAAAA0000A1)"
                    className="form-input font-mono uppercase"
                  />
                  <p className="text-2xs text-surface-500 mt-1">
                    GST number is strictly fixed at 13 alphanumeric characters.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Default GST Rate (%)</label>
                  <CustomSelect
                    value={gstDefaultPct}
                    onChange={setGstDefaultPct}
                    options={[
                      { value: '0', label: '0%' },
                      { value: '500', label: '5%' },
                      { value: '1200', label: '12%' },
                      { value: '1800', label: '18%' },
                      { value: '2800', label: '28%' },
                    ]}
                    className="w-full"
                    size="md"
                  />
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
          <form onSubmit={handleSavePrinter} className="space-y-5">
            <div className="card p-6 space-y-6 bg-white border border-surface-200 shadow-sm">
              <div className="flex items-center justify-between border-b border-surface-200/80 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-surface-900">
                      Receipt & Hardware Printer Settings
                    </h3>
                    <p className="text-xs text-surface-500 mt-0.5">
                      Select your target hardware printer once, configure paper roll/sheet dimensions, and lock preferences permanently.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => loadInstalledPrinters(true)}
                  disabled={isLoadingPrinters}
                  className="btn-secondary h-9 px-3 text-xs font-semibold flex items-center gap-1.5"
                  title="Rescan connected USB and network printers"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPrinters ? 'animate-spin text-primary-600' : ''}`} />
                  <span>{isLoadingPrinters ? 'Detecting...' : 'Rescan Printers'}</span>
                </button>
              </div>

              {/* Grid with Printer Device, Paper Size, and Copies */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* 1. Target Printer Selection */}
                <div className="flex flex-col space-y-2">
                  <div className="h-6 flex items-center justify-between">
                    <label className="text-xs font-bold text-surface-800">
                      Target Hardware Printer
                    </label>
                    <span className="badge badge-primary text-3xs font-extrabold uppercase tracking-wider">
                      Auto-detected
                    </span>
                  </div>
                  <CustomSelect
                    value={selectedPrinter}
                    onChange={(val) => {
                      setSelectedPrinter(val);
                      localStorage.setItem('pos_saved_printer_name', val);
                      // Auto-switch to 80mm thermal if a thermal printer (like TVSE RP3200 Lite) is selected
                      const isThermalModel = /thermal|rp3200|pos|receipt|tm-|tvs|star|xp-|mpt|zj-|bluetooth/i.test(val);
                      if (isThermalModel && (!printerPaper || printerPaper === 'A4' || printerPaper === 'Letter' || printerPaper === 'B5')) {
                        setPrinterPaper('Thermal80');
                        localStorage.setItem('pos_saved_paper_size', 'Thermal80');
                      }
                    }}
                    options={[
                      {
                        value: '',
                        label: systemDefaultPrinter
                          ? `Default System Printer (${systemDefaultPrinter})`
                          : 'Default Windows System Printer (Auto)',
                        icon: <Printer className="w-4 h-4 text-primary-600 flex-shrink-0" />,
                      },
                      ...installedPrinters.map((p) => ({
                        value: p.name,
                        label: `${p.name}${p.is_default ? ' [Default]' : ''}${p.is_online ? ' (Online)' : ''}`,
                        icon: (
                          <Printer
                            className={`w-4 h-4 flex-shrink-0 ${
                              p.is_online ? 'text-emerald-600' : 'text-surface-400'
                            }`}
                          />
                        ),
                      })),
                      ...(selectedPrinter &&
                      !installedPrinters.some((p) => p.name === selectedPrinter)
                        ? [
                            {
                              value: selectedPrinter,
                              label: `${selectedPrinter} (Saved Printer)`,
                              icon: <Printer className="w-4 h-4 text-primary-600 flex-shrink-0" />,
                            },
                          ]
                        : []),
                    ]}
                    className="w-full block"
                    buttonClassName="w-full h-11 text-xs font-semibold rounded-xl justify-between shadow-2xs"
                    dropdownClassName="w-full max-w-none shadow-xl max-h-72"
                  />
                  <p className="min-h-[2.5rem] flex items-start text-3xs text-surface-500 leading-relaxed">
                    Select a connected thermal receipt printer or office laser printer. Your choice will remain locked permanently for all future bills.
                  </p>
                </div>

                {/* 2. Paper Format Dropdown (All Sizes) */}
                <div className="flex flex-col space-y-2">
                  <div className="h-6 flex items-center justify-between">
                    <label className="text-xs font-bold text-surface-800">
                      Paper Format & Size
                    </label>
                    <span className="badge badge-neutral text-3xs font-mono font-bold">
                      {printerPaper}
                    </span>
                  </div>
                  <CustomSelect
                    value={printerPaper}
                    onChange={(val) => {
                      setPrinterPaper(val);
                      localStorage.setItem('pos_saved_paper_size', val);
                    }}
                    options={[
                      {
                        value: 'Thermal80',
                        label: 'Thermal Receipt (80mm / 3 inch) — Standard POS (Recommended)',
                        icon: <Receipt className="w-4 h-4 text-primary-600 flex-shrink-0" />,
                      },
                      {
                        value: 'Thermal58',
                        label: 'Thermal Receipt (58mm / 2 inch) — Mini Bluetooth / USB POS',
                        icon: <Receipt className="w-4 h-4 text-primary-500 flex-shrink-0" />,
                      },
                      {
                        value: 'Thermal72',
                        label: 'Thermal Receipt (72mm / 2.83 inch) — Mid-size POS Roll',
                        icon: <Receipt className="w-4 h-4 text-primary-500 flex-shrink-0" />,
                      },
                      {
                        value: 'Thermal100',
                        label: 'Thermal Receipt (100mm / 4 inch) — Wide Slip / Delivery Bill',
                        icon: <Receipt className="w-4 h-4 text-primary-600 flex-shrink-0" />,
                      },
                      {
                        value: 'A4',
                        label: 'Standard A4 Sheet (210 × 297 mm) — Full Page Tax Invoice',
                        icon: <FileText className="w-4 h-4 text-emerald-600 flex-shrink-0" />,
                      },
                      {
                        value: 'A5',
                        label: 'Standard A5 Sheet (148 × 210 mm) — Half Page Bill Book',
                        icon: <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />,
                      },
                      {
                        value: 'B5',
                        label: 'Standard B5 Sheet (176 × 250 mm) — Compact Billing Sheet',
                        icon: <FileText className="w-4 h-4 text-emerald-500 flex-shrink-0" />,
                      },
                      {
                        value: 'Letter',
                        label: 'US Letter Sheet (8.5 × 11 inch) — Standard Sheet',
                        icon: <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />,
                      },
                      {
                        value: 'Continuous3Inch',
                        label: 'Continuous 3-Inch Roll (76mm) — Dot Matrix / Impact Roll',
                        icon: <Layers className="w-4 h-4 text-purple-600 flex-shrink-0" />,
                      },
                    ]}
                    className="w-full block"
                    buttonClassName="w-full h-11 text-xs font-semibold rounded-xl justify-between shadow-2xs"
                    dropdownClassName="w-full max-w-none shadow-xl max-h-72"
                  />
                  <p className="min-h-[2.5rem] flex items-start text-3xs text-surface-500 leading-relaxed">
                    Supports all thermal roll sizes (58mm, 72mm, 80mm, 100mm) and standard cut sheets (A4, A5, B5, Letter).
                  </p>
                </div>

                {/* 3. Copies per Print */}
                <div className="flex flex-col space-y-2">
                  <div className="h-6 flex items-center justify-between">
                    <label className="text-xs font-bold text-surface-800">
                      Copies per Print
                    </label>
                    <span className="badge badge-neutral text-3xs font-bold">
                      {printerCopies} {Number(printerCopies) > 1 ? 'Copies' : 'Copy'}
                    </span>
                  </div>
                  <CustomSelect
                    value={printerCopies}
                    onChange={(val) => {
                      setPrinterCopies(val);
                      localStorage.setItem('pos_saved_printer_copies', val);
                    }}
                    options={[
                      { value: '1', label: '1 Copy (Customer Receipt)' },
                      { value: '2', label: '2 Copies (Customer + Shop Record)' },
                      { value: '3', label: '3 Copies (Customer + Store + Accounts)' },
                      { value: '4', label: '4 Copies' },
                      { value: '5', label: '5 Copies' },
                    ]}
                    className="w-full block"
                    buttonClassName="w-full h-11 text-xs font-semibold rounded-xl justify-between shadow-2xs"
                    dropdownClassName="w-full max-w-none shadow-xl"
                  />
                  <p className="min-h-[2.5rem] flex items-start text-3xs text-surface-500 leading-relaxed">
                    Automatically print duplicate copies on billing completion without asking each time.
                  </p>
                </div>
              </div>

              {/* Permanent Preference Lock Notice */}
              <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-xs text-blue-900 leading-relaxed flex-1">
                  <span className="font-bold">Permanent Device Persistence:</span>{' '}
                  Your selected printer device (<span className="font-mono font-bold">{selectedPrinter || systemDefaultPrinter || 'System Default'}</span>) and paper format (<span className="font-mono font-bold">{printerPaper}</span>) are saved directly in your workstation database and browser storage. They will <strong>never erase, reset, or disappear</strong> when navigating pages or restarting the system.
                </div>
              </div>

              {/* Bottom Actions: Test Print & Save */}
              <div className="pt-4 border-t border-surface-200/80 flex items-center justify-between gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleTestPrint}
                  disabled={isTestingPrinter}
                  className="btn-secondary h-11 px-4 text-xs font-bold flex items-center gap-2 rounded-xl"
                  title="Send a sample diagnostic receipt to the selected printer"
                >
                  {isTestingPrinter ? (
                    <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
                  ) : (
                    <Play className="w-4 h-4 text-primary-600" />
                  )}
                  <span>{isTestingPrinter ? 'Printing Test...' : 'Print Test Receipt'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-primary h-11 px-6 text-xs font-bold flex items-center gap-2 rounded-xl shadow-md"
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{isSaving ? 'Saving...' : 'Save Printer Preferences'}</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 4: Multi-Computer Network & Devices */}
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
                <div className="p-3 rounded-lg bg-surface-50 border border-surface-200 flex items-center justify-between">
                  <div>
                    <div className="text-2xs text-surface-500 font-medium">Host LAN IP</div>
                    <div className="font-mono text-xs font-bold text-surface-900 mt-0.5">
                      {networkInfo?.host_ip || '127.0.0.1'}
                    </div>
                  </div>
                  {networkInfo?.host_ip && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(networkInfo.host_ip);
                        toast.success('Host IP copied!');
                      }}
                      className="p-1.5 rounded hover:bg-surface-200 text-surface-600 transition-colors"
                      title="Copy Host IP"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  )}
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
                    {networkInfo?.shop_id || '—'}
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-primary-50/50 border border-primary-200 flex items-center justify-between">
                  <div>
                    <div className="text-2xs text-primary-700 font-semibold">Connection PIN</div>
                    <div className="font-mono text-xs font-extrabold text-primary-900 tracking-wider mt-0.5">
                      {networkInfo?.connection_code || '—'}
                    </div>
                  </div>
                  {networkInfo?.connection_code && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(networkInfo.connection_code);
                        toast.success('Connection PIN copied to clipboard!');
                      }}
                      className="p-1.5 rounded hover:bg-primary-100 text-primary-700 transition-colors"
                      title="Copy Connection PIN"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Multi-Adapter and Firewall Setup Bar */}
              <div className="pt-2 border-t border-surface-100 flex flex-wrap items-center justify-between gap-2">
                <div className="text-2xs text-surface-500">
                  {networkInfo?.available_ips && networkInfo.available_ips.length > 1 ? (
                    <span>Other available network IPs: <span className="font-mono font-medium text-surface-700">{networkInfo.available_ips.slice(1).join(', ')}</span></span>
                  ) : (
                    <span>Secondary cashiers connect using this Host IP & PIN on local Wi-Fi / LAN.</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const msg = await api.setupFirewallRules();
                      toast.success(msg);
                    } catch (e: any) {
                      toast.error(typeof e === 'string' ? e : 'Firewall configuration note: Please allow port 4123 in Windows Defender Firewall.');
                    }
                  }}
                  className="btn-secondary h-7 px-2.5 text-2xs flex items-center gap-1.5 font-semibold text-primary-700"
                  title="Configure Windows Defender Firewall rules for port 4123 & 4124"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Configure Windows Firewall</span>
                </button>
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

        {/* Tab 5: Local Backup & Restore */}
        {activeTab === 'backup' && (
          <BackupPage />
        )}

        {/* Tab 6: Offline Activation Status */}
        {activeTab === 'license' && (
          <div className="space-y-5">
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

          {/* USB Pen Drive Single-Use Security Key Generator */}
          <div className="card p-5 space-y-4 bg-white border border-surface-200 shadow-sm rounded-2xl">
            <div className="border-b border-surface-100 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
                  <Usb className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-surface-900">
                    Burn / Provision Single-Use USB Security Pen Drive
                  </h4>
                  <p className="text-2xs text-surface-500 mt-0.5">
                    Write a cryptographically signed hardware activation key onto an inserted USB pen drive.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadDrives}
                disabled={isLoadingDrives}
                className="btn-secondary h-8 px-2.5 text-2xs flex items-center gap-1 font-semibold"
                title="Scan for connected pen drives"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingDrives ? 'animate-spin text-primary-600' : ''}`} />
                <span>Scan Drives</span>
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-surface-800">
                    Target USB Pen Drive:
                  </label>
                  <span className="text-3xs text-surface-500 font-mono">
                    {drives.length} drives detected
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <CustomSelect
                    value={selectedDriveForBurn}
                    onChange={setSelectedDriveForBurn}
                    options={
                      drives.length === 0
                        ? [{ value: '', label: 'No USB Pen Drives Detected — Insert a pen drive and click Scan' }]
                        : drives.map((d) => ({
                            value: d.letter,
                            label: `${d.letter} (${d.label || 'Removable Storage'}) — ${d.is_removable ? 'USB Pen Drive' : 'Drive'}`,
                          }))
                    }
                    className="flex-1"
                    size="md"
                    placeholder="Select USB Drive..."
                  />

                  <button
                    type="button"
                    onClick={handleBurnUsbKey}
                    disabled={isBurningKey || !selectedDriveForBurn || drives.length === 0}
                    className="btn-primary h-10 px-5 text-xs font-bold flex items-center justify-center gap-2 shadow-xs whitespace-nowrap rounded-xl"
                  >
                    {isBurningKey ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : (
                      <KeyRound className="w-4 h-4" />
                    )}
                    <span>{isBurningKey ? 'Writing Security Key...' : 'Burn Security Key to Pen Drive'}</span>
                  </button>
                </div>
              </div>

              {/* Single-Use Consumption Guarantee Note */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-700 flex-shrink-0 mt-0.5" />
                <div className="leading-relaxed text-2xs space-y-1">
                  <div className="font-bold text-xs text-blue-950">One-Time Activation Security Guarantee:</div>
                  <div>
                    When this pen drive is plugged into a new workstation computer during software setup and activated, the software will <strong>immediately consume and permanently erase the key file from the pen drive</strong>.
                  </div>
                  <div className="text-blue-800">
                    This strictly guarantees the key cannot be reused or cloned to other computers. To install on another machine later, you must burn a fresh key.
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Tab 7: Factory Reset & Wipe Data */}
        {activeTab === 'danger' && (
          <div className="card p-5 space-y-4 bg-white border border-red-200">
            <div className="border-b border-red-100 pb-3">
              <h3 className="text-sm font-bold text-red-700 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>Factory Reset & Clean Data Wipe</span>
              </h3>
              <p className="text-2xs text-surface-500 mt-1">
                Erase all shop data, transactions, inventory, and categories to start with a fresh, empty application.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-red-50 border border-red-200 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-red-900 space-y-1">
                  <p className="font-bold">Warning: This action is permanent and cannot be undone!</p>
                  <p className="text-red-700">
                    Executing this reset will permanently delete:
                  </p>
                  <ul className="list-disc list-inside text-2xs text-red-800 space-y-0.5 pl-1">
                    <li>All past customer bills, invoices, and sales history</li>
                    <li>All payment records (Cash, UPI, Card)</li>
                    <li>All products, stock inventory counts, and category re-ordering</li>
                    <li>Draft carts and cashier counters</li>
                    <li>Bill sequence counter will restart cleanly from #1</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <div className="text-2xs text-surface-500">
                Tip: If you want to keep records, go to <b>Backup & Import</b> to download an export before resetting.
              </div>
              <button
                type="button"
                onClick={() => {
                  setResetConfirmText('');
                  setIsResetConfirmOpen(true);
                }}
                className="btn-danger text-xs h-9 px-4 flex items-center gap-2 shadow-xs"
              >
                <Trash2 className="w-4 h-4" />
                <span>Reset All Business Data</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Wipe / Factory Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-red-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-center text-surface-950">
              Confirm Complete Data Wipe
            </h3>
            <p className="text-xs text-center text-surface-600 mt-2">
              This will completely wipe all bills, customers, products, inventory, and transactions from this computer.
            </p>

            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200 text-2xs text-red-800 text-center font-medium">
              To proceed, please type <span className="font-mono font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">RESET</span> below:
            </div>

            <input
              type="text"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Type RESET to confirm"
              className="mt-3 form-input text-center font-mono font-bold tracking-widest text-sm"
              autoFocus
            />

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResetting}
                className="btn-secondary flex-1 py-2 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFactoryReset}
                disabled={resetConfirmText !== 'RESET' || isResetting}
                className="btn-danger flex-1 py-2 text-xs font-bold disabled:opacity-50"
              >
                {isResetting ? 'Wiping Data...' : 'Permanently Wipe Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SetupModeModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
      />
    </div>
  );
};
