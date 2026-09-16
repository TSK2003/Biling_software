import React, { createContext, useContext, useState, useEffect } from 'react';
import type { LicenseStatus, USBKeyInfo } from '../types';
import { api } from '../lib/ipc';
import toast from 'react-hot-toast';

interface LicenseContextType {
  status: LicenseStatus | null;
  isLoading: boolean;
  detectedUsb: USBKeyInfo | null;
  isScanningUsb: boolean;
  checkLicense: () => Promise<LicenseStatus>;
  scanForUsb: () => Promise<USBKeyInfo | null>;
  activate: (driveLetter: string) => Promise<boolean>;
  deactivate: () => Promise<boolean>;
  isActivated: boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [detectedUsb, setDetectedUsb] = useState<USBKeyInfo | null>(null);
  const [isScanningUsb, setIsScanningUsb] = useState(false);

  const checkLicense = async (): Promise<LicenseStatus> => {
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
  };

  const scanForUsb = async (): Promise<USBKeyInfo | null> => {
    setIsScanningUsb(true);
    try {
      const usb = await api.detectUsbKey();
      setDetectedUsb(usb);
      return usb;
    } catch {
      setDetectedUsb(null);
      return null;
    } finally {
      setIsScanningUsb(false);
    }
  };

  const activate = async (driveLetter: string): Promise<boolean> => {
    try {
      const res = await api.activateLicense(driveLetter);
      setStatus(res);
      if (res.state === 'ACTIVE') {
        toast.success(`Activated successfully for ${res.shop_name}!`);
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

  const deactivate = async (): Promise<boolean> => {
    try {
      await api.deactivateLicense();
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
  }, []);

  return (
    <LicenseContext.Provider
      value={{
        status,
        isLoading,
        detectedUsb,
        isScanningUsb,
        checkLicense,
        scanForUsb,
        activate,
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
