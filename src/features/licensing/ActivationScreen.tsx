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
  Globe,
  Sparkles,
  PlusCircle,
} from 'lucide-react';
import { useLicense } from '../../contexts/LicenseContext';
import { ClientConnectScreen } from '../network/ClientConnectScreen';

export const ActivationScreen: React.FC = () => {
  const {
    status,
    detectedUsb,
    drives,
    isScanningUsb,
    isTauri,
    scanForUsb,
    activate,
    activateWithCode,
    createSecurityKey,
    enableBrowserDevMode,
    checkLicense,
  } = useLicense();

  const [isActivating, setIsActivating] = useState(false);
  const [showClientConnect, setShowClientConnect] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [activationCode, setActivationCode] = useState('AESCION-PRO-2026');
  const [shopNameInput, setShopNameInput] = useState('My Shop');
  const [selectedDrive, setSelectedDrive] = useState<string>('');

  // Continuous auto-scan for USB pen drive every 2.5 seconds
  useEffect(() => {
    scanForUsb();
    const interval = window.setInterval(() => {
      scanForUsb();
    }, 2500);

    return () => {
      clearInterval(interval);
    };
  }, [scanForUsb]);

  // If detectedUsb changes, set selectedDrive to it
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

  const handleCreateKeyOnDrive = async (driveLetter: string) => {
    const shop = window.prompt('Enter Shop Name for this Security Pen Drive:', 'My Shop');
    if (!shop) return;
    await createSecurityKey(driveLetter, shop);
  };

  const isActivated = status?.state === 'ACTIVE';

  if (showClientConnect) {
    return (
      <ClientConnectScreen
        onBackToHost={() => setShowClientConnect(false)}
        onConnected={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="min-h-screen w-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 select-none">
      <div className="bg-slate-800 rounded-3xl shadow-2xl border border-slate-700 p-8 max-w-lg w-full text-center relative overflow-hidden">
        {/* Subtle Background Glow */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Browser Mode Banner (if opened in browser instead of desktop) */}
        {!isTauri && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-left">
            <div className="flex items-center gap-2.5 text-amber-400 font-semibold text-sm mb-1.5">
              <Globe className="w-4 h-4 flex-shrink-0" />
              <span>Web Browser Preview Mode</span>
            </div>
            <p className="text-xs text-amber-200/80 leading-relaxed mb-3">
              Hardware USB pen drive detection runs inside the Windows Desktop App (<code className="bg-black/30 px-1 py-0.5 rounded font-mono text-amber-300">npm start</code>). To test or preview all screens in this browser right now:
            </p>
            <button
              type="button"
              onClick={enableBrowserDevMode}
              className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-amber-500/20"
            >
              <Sparkles className="w-4 h-4" />
              <span>Enable Browser Dev Mode (Instant Unlock)</span>
            </button>
          </div>
        )}

        {/* Security Shield Icon */}
        <div className="w-16 h-16 rounded-2xl bg-slate-700/80 text-blue-400 border border-slate-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
          {isActivated ? (
            <ShieldCheck className="w-8 h-8 text-emerald-400" />
          ) : (
            <ShieldAlert className="w-8 h-8 text-blue-400" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-white tracking-tight mb-1">
          {isActivated ? 'Billing APP Licensed & Active' : 'Security Pen Drive Required'}
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          {isActivated
            ? 'This device is cryptographically licensed and hardware-bound.'
            : 'Insert your authorized Security USB Pen Drive into this PC to activate.'}
        </p>

        {/* Warning Banner if state != ACTIVE */}
        {status?.state && status.state !== 'NOT_ACTIVATED' && status.state !== 'ACTIVE' && (
          <div className="mb-5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-left flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200">
              <div className="font-semibold uppercase tracking-wide text-2xs text-amber-400">
                {status.state.replace('_', ' ')}
              </div>
              <div className="mt-0.5 leading-relaxed">{status.message || 'Security verification required.'}</div>
            </div>
          </div>
        )}

        {/* USB Key Detection Card */}
        <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-700/70 mb-5 text-left transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  detectedUsb?.is_valid
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                <Usb className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-slate-200">
                Hardware USB Security Key
              </span>
            </div>

            <button
              type="button"
              onClick={() => scanForUsb()}
              disabled={isScanningUsb}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isScanningUsb ? 'animate-spin' : ''}`} />
              <span>{isScanningUsb ? 'Scanning...' : 'Scan Ports'}</span>
            </button>
          </div>

          {detectedUsb ? (
            detectedUsb.is_valid ? (
              <div className="space-y-2.5 pt-3 border-t border-slate-700/60">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Shop License:</span>
                  <span className="font-bold text-emerald-300">{detectedUsb.license.shop_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Security USB Drive:</span>
                  <span className="font-mono font-bold text-blue-300 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded text-xs">
                    {detectedUsb.drive_letter}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">License ID:</span>
                  <span className="font-mono text-2xs text-slate-300">{detectedUsb.license.license_id}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium pt-1">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Ed25519 Cryptographic Signature Verified & Sealed</span>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-700/60 text-xs text-rose-400">
                {detectedUsb.message}
              </div>
            )
          ) : (
            <div className="py-3 text-center space-y-2 border-t border-slate-700/60">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                <span>Waiting for Security Pen Drive to be inserted...</span>
              </div>
              <p className="text-2xs text-slate-500">
                Insert any authorized Security Pen Drive into any USB port.
              </p>
            </div>
          )}
        </div>

        {/* Connected Drives Discovery List */}
        {drives.length > 0 && (
          <div className="mb-5 p-3.5 rounded-2xl bg-slate-900/40 border border-slate-700/50 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-2xs uppercase tracking-wider font-bold text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5" />
                <span>Detected Drives ({drives.length})</span>
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
                    className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer border transition ${
                      d.has_key
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        : isDriveSelected
                        ? 'bg-slate-700/60 border-blue-500 text-white'
                        : 'bg-slate-800/60 border-slate-700/50 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-black/30 text-xs">
                        {d.letter}
                      </span>
                      <span className="truncate max-w-[140px] font-medium">{d.label}</span>
                      {d.free_gb > 0 && (
                        <span className="text-2xs text-slate-400">({d.free_gb} GB free)</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {d.has_key ? (
                        <span className="text-2xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                          Security Key
                        </span>
                      ) : d.is_removable ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCreateKeyOnDrive(d.letter);
                          }}
                          className="text-2xs bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-2 py-0.5 rounded-full font-semibold border border-blue-500/30 flex items-center gap-1 cursor-pointer"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>Make Key</span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Action Button */}
        {isActivated ? (
          <button
            type="button"
            onClick={() => checkLicense()}
            className="w-full h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-600/30 cursor-pointer transition"
          >
            <span>Continue to POS Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            disabled={!detectedUsb?.is_valid || isActivating}
            className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 text-sm shadow-lg shadow-blue-600/30 cursor-pointer transition"
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

        {/* Manual License Code Toggle */}
        {!isActivated && (
          <div className="mt-4">
            {!showCodeInput ? (
              <button
                type="button"
                onClick={() => setShowCodeInput(true)}
                className="text-xs text-blue-400 hover:text-blue-300 font-semibold cursor-pointer underline decoration-dotted"
              >
                Or activate using a License Code
              </button>
            ) : (
              <form onSubmit={handleActivateWithCode} className="mt-3 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-700/70 text-left space-y-2.5">
                <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                  <span>Enter License Key</span>
                  <button
                    type="button"
                    onClick={() => setShowCodeInput(false)}
                    className="text-2xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Shop Name"
                  value={shopNameInput}
                  onChange={(e) => setShopNameInput(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="e.g. AESCION-PRO-2026"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={isActivating || !activationCode.trim()}
                  className="w-full h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Activate with Code</span>
                </button>
              </form>
            )}
          </div>
        )}

        {/* Client Cashier Terminal Option */}
        {!isActivated && (
          <div className="mt-5 pt-5 border-t border-slate-700/60">
            <div className="flex items-center gap-2 justify-center mb-2.5">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-3xs uppercase tracking-wider text-slate-400 font-semibold">
                or connect as cashier terminal
              </span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <p className="text-2xs text-slate-400 mb-3">
              If this is a secondary cashier terminal, connect to the Main Host PC over local Wi-Fi or Ethernet.
            </p>

            <button
              type="button"
              onClick={() => setShowClientConnect(true)}
              className="w-full h-10 rounded-xl border border-dashed border-slate-600 bg-slate-700/30 text-slate-300
                         flex items-center justify-center gap-2 text-xs font-semibold
                         hover:bg-slate-700/60 hover:text-white transition cursor-pointer"
            >
              <Wifi className="w-4 h-4 text-blue-400" />
              <span>Connect to Main Host PC</span>
              <Monitor className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-700/40 text-3xs text-slate-500">
          Billing APP • Hardware Cryptographic Security & Offline Verification
        </div>
      </div>
    </div>
  );
};
