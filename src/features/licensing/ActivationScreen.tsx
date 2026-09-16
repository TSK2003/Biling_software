import React, { useEffect, useState } from 'react';
import { ShieldCheck, Usb, CheckCircle2, RefreshCw, AlertCircle, ArrowRight, ShieldAlert, Key, Wifi, Monitor } from 'lucide-react';
import { useLicense } from '../../contexts/LicenseContext';
import { ClientConnectScreen } from '../network/ClientConnectScreen';

export const ActivationScreen: React.FC = () => {
  const { status, detectedUsb, isScanningUsb, scanForUsb, activate, checkLicense } = useLicense();
  const [isActivating, setIsActivating] = useState(false);
  const [showClientConnect, setShowClientConnect] = useState(false);

  // Continuous auto-scan for USB pen drive every 2.5 seconds
  useEffect(() => {
    scanForUsb();
    const interval = window.setInterval(() => {
      scanForUsb();
    }, 2500);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const handleActivate = async () => {
    if (!detectedUsb?.drive_letter) return;
    setIsActivating(true);
    try {
      await activate(detectedUsb.drive_letter);
    } finally {
      setIsActivating(false);
    }
  };

  const handleClientConnected = () => {
    // Force reload to let App.tsx detect client mode
    window.location.reload();
  };

  const isActivated = status?.state === 'ACTIVE';

  // Show the full Client Connect screen when user switches
  if (showClientConnect) {
    return (
      <ClientConnectScreen
        onBackToHost={() => setShowClientConnect(false)}
        onConnected={handleClientConnected}
      />
    );
  }

  return (
    <div className="min-h-screen w-screen bg-surface-100 flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-2xl shadow-xl border border-surface-200 p-8 max-w-md w-full text-center">
        {/* Hardware Security Shield Badge */}
        <div className="w-14 h-14 rounded-2xl bg-primary-50 text-primary-600 border border-primary-200 flex items-center justify-center mx-auto mb-4 shadow-2xs">
          {isActivated ? (
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          ) : (
            <ShieldAlert className="w-7 h-7 text-primary-600" />
          )}
        </div>

        <h2 className="text-xl font-bold text-surface-900 tracking-tight mb-1">
          {isActivated ? 'AESCION POS Licensed & Active' : 'Security Pen Drive Required'}
        </h2>
        <p className="text-xs text-surface-500 mb-6">
          {isActivated
            ? 'This device is cryptographically licensed and hardware-bound.'
            : 'Please plug in your authorized AESCION Security Pen Drive to activate this computer.'}
        </p>

        {/* State Warning / Error Banner if tampered or mismatched */}
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

        {/* USB Pen Drive Detection Card */}
        <div className="p-4 rounded-xl bg-surface-50 border border-surface-200 mb-5 text-left transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center ${detectedUsb?.is_valid ? 'bg-emerald-100 text-emerald-700' : 'bg-surface-200 text-surface-600'}`}>
                <Usb className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs font-bold text-surface-800">
                Hardware USB Security Key
              </span>
            </div>

            <button
              type="button"
              onClick={() => scanForUsb()}
              disabled={isScanningUsb}
              className="text-2xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isScanningUsb ? 'animate-spin' : ''}`} />
              <span>{isScanningUsb ? 'Scanning USB...' : 'Scan Ports'}</span>
            </button>
          </div>

          {detectedUsb ? (
            detectedUsb.is_valid ? (
              <div className="space-y-2 pt-2.5 border-t border-surface-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">Shop License:</span>
                  <span className="font-bold text-surface-900">{detectedUsb.license.shop_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">USB Drive:</span>
                  <span className="font-mono font-bold text-surface-700 bg-surface-200/80 px-1.5 py-0.5 rounded text-2xs">
                    {detectedUsb.drive_letter}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-surface-500">License ID:</span>
                  <span className="font-mono text-2xs text-surface-600">{detectedUsb.license.license_id}</span>
                </div>
                <div className="flex items-center gap-1.5 text-2xs text-emerald-700 font-semibold pt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Ed25519 Cryptographic Signature Verified</span>
                </div>
              </div>
            ) : (
              <div className="pt-2 border-t border-surface-200 text-xs text-red-600">
                {detectedUsb.message}
              </div>
            )
          ) : (
            <div className="py-3 text-center space-y-2 border-t border-surface-200/60">
              <div className="flex items-center justify-center gap-2 text-xs text-surface-500">
                <div className="w-2 h-2 rounded-full bg-primary-500 animate-ping" />
                <span>Waiting for Security Pen Drive to be inserted...</span>
              </div>
              <p className="text-3xs text-surface-400">
                Insert any authorized AESCION Security USB into your computer.
              </p>
            </div>
          )}
        </div>

        {/* Action Button */}
        {isActivated ? (
          <button
            type="button"
            onClick={() => checkLicense()}
            className="btn-primary w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm"
          >
            <span>Continue to POS Terminal</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleActivate}
            disabled={!detectedUsb?.is_valid || isActivating}
            className="btn-primary w-full h-9 flex items-center justify-center gap-2 text-xs font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isActivating ? (
              <>
                <div className="spinner w-3.5 h-3.5 border-white" />
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

        {/* ============ CLIENT / CASHIER TERMINAL CONNECTION ============ */}
        {!isActivated && (
          <div className="mt-5 pt-5 border-t border-surface-200">
            <div className="flex items-center gap-2 justify-center mb-2.5">
              <div className="h-px flex-1 bg-surface-200" />
              <span className="text-3xs uppercase tracking-wider text-surface-400 font-semibold">or connect as cashier terminal</span>
              <div className="h-px flex-1 bg-surface-200" />
            </div>

            <p className="text-2xs text-surface-500 mb-3">
              If this is a secondary cashier / billing terminal, connect to the Main Host PC over your local Wi-Fi or Ethernet network.
            </p>

            <button
              type="button"
              onClick={() => setShowClientConnect(true)}
              className="w-full h-9 rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 text-blue-700
                         flex items-center justify-center gap-2 text-xs font-semibold
                         hover:bg-blue-100/60 hover:border-blue-400 transition-colors cursor-pointer"
            >
              <Wifi className="w-4 h-4" />
              <span>Connect to Main Host PC</span>
              <Monitor className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-surface-100 text-2xs text-surface-400">
          AESCION Offline POS • Complete Hardware Cryptographic Protection
        </div>
      </div>
    </div>
  );
};
