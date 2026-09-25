import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  Usb,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  Key,
  Wifi,
  Monitor,
  HardDrive,
  Server,
  AlertTriangle,
} from 'lucide-react';
import { useLicense } from '../../contexts/LicenseContext';
import { ClientConnectScreen } from '../network/ClientConnectScreen';
import { isTauriApp } from '../../lib/ipc';

export const ActivationScreen: React.FC = () => {
  const {
    status,
    detectedUsb,
    drives,
    isScanningUsb,
    scanForUsb,
    activate,
    activateWithCode,
    checkLicense,
  } = useLicense();

  const [activeSetupMode, setActiveSetupMode] = useState<'host' | 'client'>('host');
  const [isActivating, setIsActivating] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [activationCode, setActivationCode] = useState('');
  const [shopNameInput, setShopNameInput] = useState('');
  const [selectedDrive, setSelectedDrive] = useState<string>('');

  // Auto-scan for USB pen drive every 2.5 seconds
  useEffect(() => {
    scanForUsb();
    const interval = window.setInterval(() => {
      scanForUsb();
    }, 2500);

    return () => {
      clearInterval(interval);
    };
  }, [scanForUsb]);

  // Keep selectedDrive synced with detected USB
  useEffect(() => {
    if (detectedUsb?.drive_letter) {
      setSelectedDrive(detectedUsb.drive_letter);
    }
  }, [detectedUsb]);

  const handleActivate = async () => {
    const driveToUse = selectedDrive || detectedUsb?.drive_letter;
    if (!driveToUse) return;
    setIsActivating(true);
    try {
      await activate(driveToUse);
    } finally {
      setIsActivating(false);
    }
  };

  const handleActivateWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activationCode.trim()) return;
    setIsActivating(true);
    try {
      await activateWithCode(activationCode.trim(), shopNameInput.trim());
    } finally {
      setIsActivating(false);
    }
  };

  const isActivated = status?.state === 'ACTIVE';

  if (activeSetupMode === 'client') {
    return (
      <ClientConnectScreen
        onBackToHost={() => setActiveSetupMode('host')}
        onConnected={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="fixed inset-0 h-full w-full overflow-y-auto overflow-x-hidden bg-surface-100 select-none flex flex-col items-center p-3 sm:p-6 md:p-8">
      <div className="my-auto bg-white rounded-2xl shadow-xl border border-surface-200 p-5 sm:p-7 max-w-lg w-full text-center transition-all">
        {/* Hardware Security Shield Badge */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary-50 text-primary-600 border border-primary-200 flex items-center justify-center mx-auto mb-3 shadow-sm">
          {isActivated ? (
            <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-7 h-7 sm:w-8 sm:h-8 text-primary-600" />
          )}
        </div>

        <h2 className="text-xl sm:text-2xl font-bold text-surface-900 tracking-tight mb-1">
          {isActivated ? 'Billing Software Licensed & Active' : 'Setup & Security Key Required'}
        </h2>
        <p className="text-xs text-surface-500 mb-3 sm:mb-4 leading-relaxed">
          {isActivated
            ? 'This computer is cryptographically licensed and hardware-bound.'
            : 'To use this terminal, activate with a Security Key or connect to an existing Host PC.'}
        </p>

        {/* 2-Mode Setup Selector */}
        {!isActivated && (
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-100 rounded-xl mb-3 sm:mb-4 border border-surface-200">
            <button
              type="button"
              onClick={() => setActiveSetupMode('host')}
              className="py-1.5 sm:py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer bg-white text-primary-700 shadow-sm border border-surface-200/80"
            >
              <Server className="w-3.5 h-3.5" />
              <span>Main Host PC</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSetupMode('client')}
              className="py-1.5 sm:py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer text-surface-600 hover:text-surface-900"
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Hosting Access (Cashier)</span>
            </button>
          </div>
        )}

        {/* State Warning / Error Banner if status is not ACTIVE */}
        {status?.state && status.state !== 'NOT_ACTIVATED' && status.state !== 'ACTIVE' && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-left flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <div className="font-semibold uppercase tracking-wide text-2xs text-amber-900">
                {status.state.replace('_', ' ')}
              </div>
              <div className="mt-0.5 leading-relaxed">{status.message || 'Security verification required.'}</div>
            </div>
          </div>
        )}

        {/* Web Browser Notice */}
        {!isTauriApp() && (
          <div className="mb-5 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-left flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900 leading-relaxed">
              <span className="font-bold block text-blue-800">Browser Preview Mode Detected</span>
              Web browsers cannot access USB hardware directly. Please launch the <b>Desktop Application</b> (run <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-2xs">npm start</code> or open the installed <b>Billing Software</b> setup) for native Pen Drive detection.
            </div>
          </div>
        )}

        {/* USB Pen Drive Detection Card */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-surface-50 border border-surface-200 mb-3 sm:mb-4 text-left transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  detectedUsb?.is_valid
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-surface-200 text-surface-600'
                }`}
              >
                <Usb className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-surface-800">
                Hardware USB Security Key
              </span>
            </div>

            <button
              type="button"
              onClick={() => scanForUsb()}
              disabled={isScanningUsb}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningUsb ? 'animate-spin' : ''}`} />
              <span>{isScanningUsb ? 'Scanning...' : 'Scan Ports'}</span>
            </button>
          </div>

          {detectedUsb ? (
            detectedUsb.is_valid ? (
              <div className="space-y-2.5 pt-3 border-t border-surface-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Shop License:</span>
                  <span className="font-bold text-surface-900">{detectedUsb.license.shop_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Security USB Drive:</span>
                  <span className="font-mono font-bold text-primary-700 bg-primary-50 px-2 py-0.5 rounded text-xs border border-primary-200">
                    {detectedUsb.drive_letter}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">License ID:</span>
                  <span className="font-mono text-2xs text-surface-600">{detectedUsb.license.license_id}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-700 font-medium pt-1">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Ed25519 Cryptographic Signature Verified</span>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-surface-200 text-xs text-red-600">
                {detectedUsb.message}
              </div>
            )
          ) : (
            <div className="py-3 text-center space-y-2 border-t border-surface-200/70">
              <div className="flex items-center justify-center gap-2 text-xs text-surface-500">
                <div className="w-2 h-2 rounded-full bg-primary-500 animate-ping" />
                <span>Waiting for Security Pen Drive to be inserted...</span>
              </div>
              <p className="text-2xs text-surface-400">
                Insert any authorized Security Pen Drive into this computer to activate.
              </p>
            </div>
          )}
        </div>

        {/* Connected Storage & USB Drives Discovery */}
        {drives.length > 0 && (
          <div className="mb-3 sm:mb-4 p-3 sm:p-3.5 rounded-xl bg-surface-50 border border-surface-200 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs uppercase tracking-wider font-bold text-surface-500 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Detected Storage & Drives ({drives.length})</span>
              </span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {drives.map((d) => {
                const isDriveSelected = selectedDrive === d.letter;
                return (
                  <div
                    key={d.letter}
                    onClick={() => {
                      setSelectedDrive(d.letter);
                      if (d.key_info) {
                        scanForUsb();
                      }
                    }}
                    className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer border transition ${
                      d.has_key
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-semibold'
                        : isDriveSelected
                        ? 'bg-primary-50 border-primary-300 text-primary-950 font-medium'
                        : 'bg-white border-surface-200 text-surface-700 hover:border-surface-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-surface-200/80 text-xs">
                        {d.letter}
                      </span>
                      <span className="truncate max-w-[150px] font-medium">{d.label}</span>
                      {d.free_gb > 0 && (
                        <span className="text-2xs text-surface-400">({d.free_gb} GB free)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {d.has_key ? (
                        <span className="text-2xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                          Security Key Ready
                        </span>
                      ) : (
                        <span className="text-2xs text-surface-400 font-mono">
                          {d.total_gb > 0 ? `${d.total_gb} GB` : 'No Key'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Activation Action Button */}
        {isActivated ? (
          <button
            type="button"
            onClick={() => checkLicense()}
            className="btn-primary w-full h-11 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer"
          >
            <span>Continue to POS Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            disabled={!detectedUsb?.is_valid || isActivating}
            className="btn-primary w-full h-11 flex items-center justify-center gap-2 text-sm font-bold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActivating ? (
              <>
                <div className="spinner w-4 h-4 border-white" />
                <span>Binding Device & Activating...</span>
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                <span>Activate This Device (Bind to Hardware)</span>
              </>
            )}
          </button>
        )}

        {/* Manual License Key Entry Option */}
        {!isActivated && (
          <div className="mt-3">
            {!showCodeInput ? (
              <button
                type="button"
                onClick={() => setShowCodeInput(true)}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold cursor-pointer underline decoration-dotted"
              >
                Or activate using a License Code
              </button>
            ) : (
              <form onSubmit={handleActivateWithCode} className="mt-2.5 p-3 rounded-xl bg-surface-50 border border-surface-200 text-left space-y-2">
                <div className="text-xs font-bold text-surface-800 flex items-center justify-between">
                  <span>Enter License Key</span>
                  <button
                    type="button"
                    onClick={() => setShowCodeInput(false)}
                    className="text-2xs text-surface-400 hover:text-surface-600"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Enter Registered Shop Name"
                  value={shopNameInput}
                  onChange={(e) => setShopNameInput(e.target.value)}
                  className="input w-full h-8 sm:h-9 text-xs"
                  required
                />
                <input
                  type="text"
                  placeholder="Enter License Key (e.g. KEY-XXXX-XXXX)"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  className="input w-full h-8 sm:h-9 text-xs font-mono"
                  required
                />
                <button
                  type="submit"
                  disabled={isActivating || !activationCode.trim() || !shopNameInput.trim()}
                  className="btn-primary w-full h-8 sm:h-9 text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Activate with Code</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Secondary Cashier Terminal Option */}
        {!isActivated && (
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-surface-200">
            <div className="flex items-center gap-2 justify-center mb-2">
              <div className="h-px flex-1 bg-surface-200" />
              <span className="text-3xs uppercase tracking-wider text-surface-400 font-semibold">
                or connect as cashier terminal
              </span>
              <div className="h-px flex-1 bg-surface-200" />
            </div>

            <p className="text-2xs text-surface-500 mb-2.5">
              If this is a secondary cashier terminal, connect to the Main Host PC over your local Wi-Fi or Ethernet network.
            </p>

            <button
              type="button"
              onClick={() => setActiveSetupMode('client')}
              className="w-full h-9 sm:h-10 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 text-primary-700
                         flex items-center justify-center gap-2 text-xs font-semibold
                         hover:bg-primary-100/60 hover:border-primary-400 transition cursor-pointer"
            >
              <Wifi className="w-4 h-4" />
              <span>Connect to Main Host PC (Hosting Access)</span>
              <Monitor className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        )}

        <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-surface-100 text-2xs text-surface-400">
          Billing Software • Hardware Cryptographic Security & Local Network Integration
        </div>
      </div>
    </div>
  );
};
