import React, { useState, useEffect, useRef } from 'react';
import { api, saveClientConfig } from '../../lib/ipc';
import { useNetwork } from '../../contexts/NetworkContext';
import { Wifi, Search, Server, ShieldAlert, CheckCircle2, RefreshCw, ArrowLeft, Clock, Zap } from 'lucide-react';
import toast from 'react-hot-toast';

interface ClientConnectScreenProps {
  onBackToHost?: () => void;
  onConnected?: () => void;
}

export const ClientConnectScreen: React.FC<ClientConnectScreenProps> = ({
  onBackToHost,
  onConnected,
}) => {
  const { scanForHosts, discoveredHosts, reloadNetworkInfo } = useNetwork();

  const [hostIp, setHostIp] = useState('');
  const [hostPort, setHostPort] = useState(4123);
  const [connectionCode, setConnectionCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scanSecondsRemaining, setScanSecondsRemaining] = useState(0);
  const [scanTotalSeconds, setScanTotalSeconds] = useState(15);
  const [isTesting, setIsTesting] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    shop_name?: string;
    shop_id?: string;
    message?: string;
  } | null>(null);

  const countdownTimerRef = useRef<number | null>(null);

  const startScan = async (durationSecs: number = 15) => {
    setIsScanning(true);
    setScanTotalSeconds(durationSecs);
    setScanSecondsRemaining(durationSecs);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = window.setInterval(() => {
      setScanSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const found = await scanForHosts();
      if (found.length > 0) {
        setHostIp(found[0].host_ip);
        setHostPort(found[0].host_port);
        toast.success(`Found Host: ${found[0].shop_name} (${found[0].host_ip})`);
      } else {
        toast('No host detected on broadcast. Enter Host IP manually below.');
      }
    } finally {
      setIsScanning(false);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setScanSecondsRemaining(0);
    }
  };

  const cancelScan = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setIsScanning(false);
    setScanSecondsRemaining(0);
  };

  const handleTestConnection = async () => {
    if (!hostIp.trim()) {
      toast.error('Please enter the Host IP address');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const info = await api.testHostConnection(hostIp.trim(), hostPort);
      setTestResult({
        success: true,
        shop_name: info.shop_name,
        shop_id: info.shop_id,
      });
      toast.success(`Connected to Host: ${info.shop_name}`);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: typeof err === 'string' ? err : 'Unable to reach Main Host PC',
      });
      toast.error('Connection test failed. Check IP & ensure Host is running.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostIp.trim()) {
      toast.error('Host IP is required');
      return;
    }
    if (!connectionCode.trim()) {
      toast.error('Connection code is required');
      return;
    }

    setIsConnecting(true);
    try {
      const cleanIp = hostIp.trim();
      const regData = await api.connectToHost(cleanIp, hostPort, connectionCode.trim());

      saveClientConfig({
        mode: 'client',
        hostIp: cleanIp,
        hostPort,
        apiToken: regData.api_token || '',
        deviceId: regData.shop_id ? `DEV-CLIENT-${regData.shop_id}` : `CLIENT-${Date.now()}`,
        shopName: regData.shop_name,
      });

      await reloadNetworkInfo();
      toast.success(`Connected to ${regData.shop_name || 'Shop Host'}!`);
      onConnected?.();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : err?.message || 'Failed to connect to Host');
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    startScan(15);
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);

  const progressPercent = isScanning && scanTotalSeconds > 0
    ? Math.round(((scanTotalSeconds - scanSecondsRemaining) / scanTotalSeconds) * 100)
    : 0;

  return (
    <div className="fixed inset-0 h-full w-full overflow-y-auto overflow-x-hidden bg-surface-100 select-none flex flex-col items-center p-3 sm:p-6 md:p-8">
      <div className="my-auto card w-full max-w-lg p-5 sm:p-6 bg-white shadow-xl border border-surface-200 space-y-4 sm:space-y-5 transition-all">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-surface-200 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                <Wifi className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-surface-900">
                Connect Cashier to Main Computer
              </h2>
            </div>
            <p className="text-2xs text-surface-500 mt-1">
              Join your shop local network to share products, billing & live database.
            </p>
          </div>
          {onBackToHost && (
            <button
              type="button"
              onClick={onBackToHost}
              className="btn-secondary h-8 px-2.5 text-2xs flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Host Mode</span>
            </button>
          )}
        </div>

        {/* Auto Discovery Panel with Timer */}
        <div className="p-3.5 rounded-xl bg-surface-50 border border-surface-200 space-y-2.5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-surface-800 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-primary-600" />
                <span>Automatic LAN Scanner</span>
              </div>
              <p className="text-2xs text-surface-500 mt-0.5">
                {isScanning
                  ? `Scanning local network (${scanSecondsRemaining}s remaining)...`
                  : discoveredHosts.length > 0
                  ? `Found ${discoveredHosts.length} active Host PC`
                  : 'Scan local Wi-Fi / LAN for active Main Computers'}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {isScanning ? (
                <button
                  type="button"
                  onClick={cancelScan}
                  className="btn-secondary h-7 px-2.5 text-2xs text-surface-600"
                >
                  Skip Scan
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startScan(15)}
                    className="btn-secondary h-7 px-2 text-2xs flex items-center gap-1"
                    title="15-second scan"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    <span>Scan (15s)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => startScan(45)}
                    className="btn-secondary h-7 px-2 text-2xs flex items-center gap-1"
                    title="45-second deep scan"
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <span>Scan (45s)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Scan Progress Bar */}
          {isScanning && (
            <div className="space-y-1">
              <div className="w-full bg-surface-200 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-primary-600 h-full rounded-full transition-all duration-1000 ease-linear"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-3xs text-surface-400 font-mono">
                <span>Searching broadcast...</span>
                <span>{scanSecondsRemaining}s</span>
              </div>
            </div>
          )}

          {/* Discovered Hosts List */}
          {discoveredHosts.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {discoveredHosts.map((h) => (
                <div
                  key={`${h.host_ip}:${h.host_port}`}
                  onClick={() => {
                    setHostIp(h.host_ip);
                    setHostPort(h.host_port);
                    toast.success(`Selected Host: ${h.shop_name}`);
                  }}
                  className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-between cursor-pointer hover:bg-emerald-100/70 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-emerald-700" />
                    <div>
                      <div className="text-xs font-bold text-emerald-950">{h.shop_name}</div>
                      <div className="text-2xs font-mono text-emerald-700">
                        {h.host_ip}:{h.host_port}
                      </div>
                    </div>
                  </div>
                  <span className="text-2xs font-semibold text-emerald-800 bg-emerald-200/60 px-2 py-0.5 rounded">
                    Click to Use
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wi-Fi <-> LAN Direct Connection Form */}
        <form onSubmit={handleConnect} className="space-y-3.5 pt-1">
          <div className="flex items-center gap-1.5 text-xs font-bold text-surface-900">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span>Direct IP Connection (Instant & Reliable)</span>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="col-span-2 form-group">
              <label className="form-label text-xs font-semibold">Host IP Address *</label>
              <input
                type="text"
                value={hostIp}
                onChange={(e) => setHostIp(e.target.value)}
                placeholder="Enter Host IP (e.g. 192.168.X.X)"
                className="form-input font-mono text-xs h-8"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label text-xs font-semibold">Port</label>
              <input
                type="number"
                value={hostPort}
                onChange={(e) => setHostPort(Number(e.target.value))}
                className="form-input font-mono text-xs h-8"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label text-xs font-semibold">Shop Connection PIN *</label>
            <input
              type="text"
              value={connectionCode}
              onChange={(e) => setConnectionCode(e.target.value.toUpperCase())}
              placeholder="Enter 6-digit Host Connection PIN"
              className="form-input font-mono uppercase text-xs tracking-wider h-8"
              required
            />
            <p className="text-2xs text-surface-400 mt-1">
              Find this on Computer 1 (Main PC) under <span className="font-semibold text-surface-600">Settings → Network & Devices</span>.
            </p>
          </div>

          {/* Test Connection State Feedback */}
          {testResult && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <div className="font-semibold">
                  {testResult.success
                    ? `Host Reachable: ${testResult.shop_name}`
                    : 'Connection Diagnostic'}
                </div>
                <div className="text-2xs mt-0.5">
                  {testResult.success
                    ? `Shop ID: ${testResult.shop_id} — Ready to pair with Main PC.`
                    : (
                      <div className="space-y-1">
                        <p>{testResult.message}</p>
                        <ul className="list-disc pl-4 text-3xs space-y-0.5 text-amber-800">
                          <li>Ensure both PCs are on the same Wi-Fi router / LAN.</li>
                          <li>Verify the Host IP matches the IP shown in Main PC Settings.</li>
                          <li>On Main PC, ensure Windows Defender Firewall allows port {hostPort} TCP.</li>
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting || !hostIp.trim()}
              className="btn-secondary w-1/2 h-8.5 text-xs flex items-center justify-center gap-1.5"
            >
              {isTesting ? <div className="spinner w-3 h-3" /> : <Server className="w-3.5 h-3.5" />}
              <span>Test Connection</span>
            </button>
            <button
              type="submit"
              disabled={isConnecting || !hostIp.trim() || !connectionCode.trim()}
              className="btn-primary w-1/2 h-8.5 text-xs flex items-center justify-center gap-1.5"
            >
              {isConnecting ? <div className="spinner w-3 h-3 border-white" /> : <Wifi className="w-3.5 h-3.5" />}
              <span>Connect & Pair</span>
            </button>
          </div>
        </form>

        {/* Quick Help Footer */}
        <div className="pt-2 border-t border-surface-100 text-3xs text-surface-400 text-center">
          Need help? On Main PC open <span className="font-semibold text-surface-600">Settings → Network & Connected Terminals</span> to see Host IP, Port and PIN.
        </div>
      </div>
    </div>
  );
};
