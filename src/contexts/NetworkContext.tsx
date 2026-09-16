import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, saveClientConfig, clearClientConfig } from '../lib/ipc';
import { NetworkInfo, Device, DiscoveredHost } from '../types';
import toast from 'react-hot-toast';

interface NetworkContextType {
  networkInfo: NetworkInfo | null;
  devices: Device[];
  isLoading: boolean;
  isClientConnected: boolean;
  discoveredHosts: DiscoveredHost[];
  reloadNetworkInfo: () => Promise<void>;
  loadDevices: () => Promise<void>;
  scanForHosts: () => Promise<DiscoveredHost[]>;
  setMode: (mode: 'host' | 'client', hostIp?: string, hostPort?: number, code?: string) => Promise<void>;
  approveDevice: (deviceId: string) => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  renameDevice: (deviceId: string, name: string) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [discoveredHosts, setDiscoveredHosts] = useState<DiscoveredHost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClientConnected, setIsClientConnected] = useState(true);

  const reloadNetworkInfo = async () => {
    try {
      const info = await api.getNetworkInfo();
      setNetworkInfo(info);
      if (info.mode === 'client' && info.host_ip && info.host_port) {
        saveClientConfig({
          mode: 'client',
          hostIp: info.host_ip,
          hostPort: info.host_port,
          apiToken: '',
          deviceId: info.device_id || 'CLIENT-DEV',
        });
        setIsClientConnected(true);
      } else if (info.mode === 'host') {
        clearClientConfig();
        setIsClientConnected(true);
      }
    } catch {
      // Fallback default info
      setNetworkInfo({
        mode: 'host',
        shop_id: 'SHOP-AESCION-000001',
        shop_name: 'Fruit Shop',
        host_ip: '127.0.0.1',
        host_port: 4123,
        connection_code: 'AESCION-884920',
        is_server_running: true,
        device_id: 'DEV-HOST-000001',
        device_name: 'MAIN-PC',
        is_approved: true,
        client_count: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadDevices = async () => {
    try {
      const list = await api.getRegisteredDevices();
      setDevices(list || []);
    } catch {
      setDevices([]);
    }
  };

  const scanForHosts = async (): Promise<DiscoveredHost[]> => {
    try {
      const found = await api.discoverHosts();
      setDiscoveredHosts(found || []);
      return found || [];
    } catch {
      return [];
    }
  };

  const setMode = async (
    mode: 'host' | 'client',
    hostIp?: string,
    hostPort?: number,
    code?: string
  ) => {
    try {
      await api.setNetworkMode(mode, hostIp, hostPort, code);
      await reloadNetworkInfo();
      toast.success(`Switched to ${mode === 'host' ? 'Main Host PC' : 'Additional Client PC'} mode`);
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to update network mode');
    }
  };

  const approveDevice = async (deviceId: string) => {
    try {
      await api.approveDevice(deviceId);
      toast.success('Device approved & authorized for billing');
      await loadDevices();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to approve device');
    }
  };

  const revokeDevice = async (deviceId: string) => {
    try {
      await api.revokeDevice(deviceId);
      toast.success('Device authorization revoked');
      await loadDevices();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to revoke device');
    }
  };

  const renameDevice = async (deviceId: string, name: string) => {
    try {
      await api.renameDevice(deviceId, name);
      toast.success('Device renamed');
      await loadDevices();
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to rename device');
    }
  };

  useEffect(() => {
    reloadNetworkInfo();
    loadDevices();
  }, []);

  return (
    <NetworkContext.Provider
      value={{
        networkInfo,
        devices,
        isLoading,
        isClientConnected,
        discoveredHosts,
        reloadNetworkInfo,
        loadDevices,
        scanForHosts,
        setMode,
        approveDevice,
        revokeDevice,
        renameDevice,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};
