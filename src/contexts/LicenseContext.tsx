import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { DriveInfo, LicenseStatus, USBKeyInfo } from '../types';
import { api, isTauriApp } from '../lib/ipc';
import toast from 'react-hot-toast';

interface LicenseContextType {
  status: LicenseStatus | null;
  isLoading: boolean;
  detectedUsb: USBKeyInfo | null;
  drives: DriveInfo[];
  isScanningUsb: boolean;
  isTauri: boolean;
  checkLicense: () => Promise<LicenseStatus>;
  scanForUsb: () => Promise<USBKeyInfo | null>;
  activate: (driveLetter: string) => Promise<boolean>;
  activateWithCode: (code: string, shopName?: string) => Promise<boolean>;
  createSecurityKey: (driveLetter: string, shopName: string) => Promise<boolean>;
  enableBrowserDevMode: () => void;
  deactivate: () => Promise<boolean>;
  isActivated: boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detectedUsb, setDetectedUsb] = useState<USBKeyInfo | null>(null);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [isScanningUsb, setIsScanningUsb] = useState(false);
  const isTauri = isTauriApp();

  const checkLicense = useCallback(async (): Promise<LicenseStatus> => {
    try {
      const res = await api.checkLicense();
      setStatus(res);
      return res;
    } catch (err: any) {
      const fallback: LicenseStatus = {
        state: 'ACTIVATION_REQUIRED',
        message: typeof err === 'string' ? err : 'License verification failed',
      };
      setStatus(fallback);
      return fallback;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const scanForUsb = useCallback(async (): Promise<USBKeyInfo | null> => {
    setIsScanningUsb(true);
    try {
      // Parallel fetch: check detected USB key & list of all drives
      const [usb, allDrives] = await Promise.all([
        api.detectUsbKey().catch(() => null),
        api.getAllDrives().catch(() => []),
      ]);

      setDetectedUsb(usb);
      setDrives(allDrives);

      // If detectUsbKey didn't pick up a key but one of the drives has a valid key, pick it up!
      if (!usb && allDrives.length > 0) {
        const driveWithKey = allDrives.find((d) => d.has_key && d.key_info?.is_valid);
        if (driveWithKey && driveWithKey.key_info) {
          setDetectedUsb(driveWithKey.key_info);
          return driveWithKey.key_info;
        }
      }

      return usb;
    } catch {
      setDetectedUsb(null);
      return null;
    } finally {
      setIsScanningUsb(false);
    }
  }, []);

  const activate = async (driveLetter: string): Promise<boolean> => {
    try {
      const res = await api.activateLicense(driveLetter);
      setStatus(res);
      if (res.state === 'ACTIVE') {
        toast.success(`Activated successfully for ${res.shop_name || 'Shop'}!`);
        return true;
      } else {
        toast.error(res.message || 'Activation failed');
        return false;
      }
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Activation failed');
      return false;
    }
  };

  const activateWithCode = async (code: string, shopName?: string): Promise<boolean> => {
    try {
      const res = await api.activateWithCode(code, shopName);
      setStatus(res);
      if (res.state === 'ACTIVE') {
        toast.success(`Activated successfully for ${res.shop_name || 'Shop'}!`);
        return true;
      } else {
        toast.error(res.message || 'Activation failed');
        return false;
      }
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Activation code rejected');
      return false;
    }
  };

  const createSecurityKey = async (driveLetter: string, shopName: string): Promise<boolean> => {
    try {
      const msg = await api.createSecurityUsbKey(driveLetter, shopName, 'perpetual');
      toast.success(msg || 'Security Key created on drive!');
      await scanForUsb();
      return true;
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to create security key on drive');
      return false;
    }
  };

  const enableBrowserDevMode = () => {
    localStorage.setItem('dev_browser_mode', 'true');
    setStatus({
      state: 'ACTIVE',
      license_id: 'BROWSER-DEV-PREVIEW',
      shop_name: 'Billing APP (Demo Preview)',
      license_type: 'developer',
      activated_at: new Date().toISOString(),
      message: 'Browser Dev Preview Mode Active',
    });
    toast.success('Browser Dev Mode activated! All screens unlocked.');
  };

  const deactivate = async (): Promise<boolean> => {
    try {
      localStorage.removeItem('dev_browser_mode');
      if (isTauri) {
        await api.deactivateLicense();
      }
      await checkLicense();
      toast.success('Device deactivated. Security Key will be required to re-activate.');
      return true;
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Deactivation failed');
      return false;
    }
  };

  useEffect(() => {
    checkLicense();
  }, [checkLicense]);

  return (
    <LicenseContext.Provider
      value={{
        status,
        isLoading,
        detectedUsb,
        drives,
        isScanningUsb,
        isTauri,
        checkLicense,
        scanForUsb,
        activate,
        activateWithCode,
        createSecurityKey,
        enableBrowserDevMode,
        deactivate,
        isActivated: status?.state === 'ACTIVE',
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicense = () => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicense must be used within a LicenseProvider');
  }
  return context;
};
