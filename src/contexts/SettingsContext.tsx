import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Setting } from '../types';
import { api } from '../lib/ipc';

interface SettingsContextType {
  settings: Record<string, string>;
  isLoading: boolean;
  shopName: string;
  currencySymbol: string;
  gstEnabled: boolean;
  gstNumber: string;
  defaultPaymentMethod: string;
  reloadSettings: () => Promise<void>;
  updateSetting: (key: string, value: string) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const reloadSettings = async () => {
    try {
      const list: Setting[] = await api.getSettings();
      const map: Record<string, string> = {};
      for (const s of list) {
        map[s.key] = s.value;
      }
      setSettings(map);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (key: string, value: string) => {
    await api.updateSetting(key, value);
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    reloadSettings();
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        shopName: settings['shop_name'] || 'AESCION POS',
        currencySymbol: settings['currency_symbol'] || '₹',
        gstEnabled: settings['gst_enabled'] === 'true',
        gstNumber: settings['gst_number'] || '',
        defaultPaymentMethod: settings['default_payment_method'] || 'cash',
        reloadSettings,
        updateSetting,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
