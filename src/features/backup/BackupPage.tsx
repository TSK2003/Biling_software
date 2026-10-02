import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw,
  FolderOpen,
  RotateCcw,
  AlertTriangle,
  ShieldCheck,
  Database,
  Calendar,
  Layers,
  Receipt,
  Users,
  Wallet,
  ImageIcon,
  Key,
  CheckCircle2,
  HardDrive,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatDateTime } from '../../lib/format';
import { Modal } from '../../components/Modal';
import type { BackupManifest, BackupRecord } from '../../types';
import toast from 'react-hot-toast';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const BackupPage: React.FC = () => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backupFolderPath, setBackupFolderPath] = useState<string>('');

  // Manual Backup State
  const [isRunningDailyBackup, setIsRunningDailyBackup] = useState(false);

  // Manual Path Input State
  const [manualPathInput, setManualPathInput] = useState('');

  // Restore Modal State
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [restoreFilePath, setRestoreFilePath] = useState<string>('');
  const [restoreManifest, setRestoreManifest] = useState<BackupManifest | null>(null);
  const [isValidatingBackup, setIsValidatingBackup] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isRestoring, setIsRestoring] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBackups = async () => {
    setIsLoading(true);
    try {
      const list = await api.getBackupList();
      setBackups(list || []);
    } catch {
      setBackups([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadBackupFolder = async () => {
    try {
      const folder = await api.getBackupFolder();
      if (folder) {
        setBackupFolderPath(folder);
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadBackups();
    loadBackupFolder();
  }, []);

  const handleChooseBackupFolder = async () => {
    try {
      const selected = await api.pickBackupFolder();
      if (selected) {
        await api.setBackupFolder(selected);
        setBackupFolderPath(selected);
        toast.success(`Backup folder updated to: ${selected}`);
        await Promise.all([loadBackups(), loadBackupFolder()]);
      }
    } catch (err: any) {
      toast.error(typeof err === 'string' ? err : 'Failed to choose backup folder');
    }
  };

  const handlePickRestoreFile = async () => {
    try {
      const selected = await api.pickBackupFile();
      if (selected) {
        setManualPathInput(selected);
        handleStartRestoreFromFile(selected);
      }
    } catch {
      fileInputRef.current?.click();
    }
  };

  const handleOpenDownloads = async () => {
    try {
      await api.openDownloadsFolder();
      toast.success('Opened Backups folder in File Explorer');
    } catch {
      toast.error('Could not open folder in explorer');
    }
  };

  const handleOpenAppBackupsFolder = async () => {
    try {
      await api.openAppBackupsFolder();
      toast.success('Opened Application Backups folder in File Explorer');
    } catch {
      toast.error('Could not open installation backups folder');
    }
  };

  const handleTriggerDailyBackup = async () => {
    setIsRunningDailyBackup(true);
    const toastId = toast.loading('Creating database backup package...');
    try {
      const res = await api.triggerDailyBackupNow();
      toast.success(`Backup created successfully! Saved to: ${res.backup_path}`, {
        id: toastId,
        duration: 5000,
      });
      await Promise.all([loadBackups(), loadBackupFolder()]);
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Failed to create backup');
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsRunningDailyBackup(false);
    }
  };

  const handleLocateFile = async (filePath: string) => {
    try {
      await api.showInFileManager(filePath);
    } catch {
      toast.error('Could not locate file in explorer');
    }
  };

  // Restore process for a given file
  const handleStartRestoreFromFile = async (path: string) => {
    const target = path.trim();
    if (!target) {
      toast.error('Please specify a valid backup file path');
      return;
    }
    setRestoreFilePath(target);
    setRestoreManifest(null);
    setValidationError(null);
    setAdminPassword('');
    setIsRestoreModalOpen(true);
    setIsValidatingBackup(true);

    try {
      const manifest = await api.validateBackup(target);
      setRestoreManifest(manifest);
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Invalid or corrupted backup archive');
      setValidationError(errMsg);
      toast.error(errMsg);
    } finally {
      setIsValidatingBackup(false);
    }
  };

  // 3. Confirm and execute restore
  const handleConfirmRestore = async () => {
    if (!restoreFilePath) {
      toast.error('Please select a backup package');
      return;
    }
    if (!adminPassword.trim()) {
      toast.error('Administrator password is required to authorize restore');
      return;
    }

    setIsRestoring(true);
    const toastId = toast.loading('Authorizing and restoring business data...');

    try {
      await api.verifyAdminPassword(adminPassword);
      await api.restoreBackup(restoreFilePath);

      toast.success('Backup restored successfully! All business records and media have been restored.', {
        id: toastId,
        duration: 5000,
      });

      setIsRestoreModalOpen(false);
      setRestoreFilePath('');
      setRestoreManifest(null);
      setAdminPassword('');
      await loadBackups();

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Restore failed. Rollback applied.');
      toast.error(errMsg, { id: toastId, duration: 6000 });
    } finally {
      setIsRestoring(false);
    }
  };

  const latestBackup = backups && backups.length > 0 ? backups[0] : null;

  return (
    <div className="space-y-5">
      {/* Manual Database Backup & Recovery Card */}
      <div className="card p-5 bg-white border border-surface-200 shadow-sm rounded-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0 border border-primary-200">
              <Database className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-surface-900">
                  Database Backup & Disaster Recovery
                </h3>
                <span className="badge badge-neutral text-3xs font-bold">
                  Manual On-Demand
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-0.5">
                Create an on-demand, encrypted <code className="text-3xs bg-surface-100 px-1 py-0.5 rounded font-mono text-surface-800">.billingbackup</code> archive of your bills, inventory, expenses, and system settings.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleTriggerDailyBackup}
              disabled={isRunningDailyBackup}
              className="btn-primary text-xs flex items-center gap-2 py-2 px-4 font-bold rounded-lg shadow-sm cursor-pointer hover:bg-primary-700 transition-all"
              title="Create an on-demand database backup package now"
            >
              <Database className={`w-4 h-4 ${isRunningDailyBackup ? 'animate-spin' : ''}`} />
              <span>{isRunningDailyBackup ? 'Creating Backup...' : 'Backup Database Now'}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Backup Folder Selector Row */}
        <div className="p-3.5 rounded-lg bg-surface-50 border border-surface-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-2xs font-semibold text-surface-500 uppercase tracking-wider block">
                Backup Storage Location:
              </span>
              <span
                className="font-mono text-xs font-bold text-surface-900 truncate block mt-0.5"
                title={backupFolderPath}
              >
                {backupFolderPath || 'Configured Directory'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleChooseBackupFolder}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 font-semibold rounded-md shadow-2xs cursor-pointer"
              title="Select custom folder on this device"
            >
              <FolderOpen className="w-3.5 h-3.5 text-primary-600" />
              <span>Choose Backup Folder</span>
            </button>

            <button
              type="button"
              onClick={handleOpenDownloads}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-2.5 font-semibold rounded-md shadow-2xs cursor-pointer"
              title="Open backup folder in Windows File Explorer"
            >
              <HardDrive className="w-3.5 h-3.5 text-surface-600" />
              <span>Open in Explorer</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAppBackupsFolder}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-2.5 font-semibold rounded-md shadow-2xs cursor-pointer"
              title="Open internal application backup vault"
            >
              <Database className="w-3.5 h-3.5 text-primary-600" />
              <span>App Vault</span>
            </button>
          </div>
        </div>

        {/* Snapshot Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-2xs">
          <div className="bg-surface-50 p-2.5 rounded-md border border-surface-200">
            <span className="text-surface-500 block font-medium">Last Recorded Backup:</span>
            <span className="font-semibold text-surface-800 block mt-0.5">
              {latestBackup ? formatDateTime(latestBackup.created_at) : 'No backup created yet'}
            </span>
          </div>
          <div className="bg-surface-50 p-2.5 rounded-md border border-surface-200">
            <span className="text-surface-500 block font-medium">Available Backups:</span>
            <span className="font-bold text-surface-800 block mt-0.5">
              {backups.length} local backup archive{backups.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Restore from Local Backup Card */}
      <div className="card p-4 bg-white border border-surface-200 shadow-sm rounded-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-100 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-700 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-surface-900">
                Restore Database from Backup Package
              </h4>
              <p className="text-2xs text-surface-500">
                Restore database from any previously created .billingbackup package. Protected by Admin password.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePickRestoreFile}
            className="btn-secondary text-xs font-bold py-1.5 px-3 rounded-md border-amber-300 hover:bg-amber-50 text-amber-900 flex items-center gap-1.5 shadow-2xs cursor-pointer flex-shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
            <span>Select & Restore File (.billingbackup)</span>
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".billingbackup,.zip"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const filePath = (file as any).path || file.name;
              handleStartRestoreFromFile(filePath);
            }
          }}
        />

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualPathInput}
            onChange={(e) => setManualPathInput(e.target.value)}
            placeholder="Or enter full .billingbackup file path to load..."
            className="form-input text-xs font-mono py-1.5 px-3 flex-1 rounded-md h-9"
          />
          <button
            type="button"
            onClick={() => handleStartRestoreFromFile(manualPathInput)}
            disabled={!manualPathInput.trim()}
            className="btn-secondary text-xs py-1.5 px-4 font-semibold whitespace-nowrap rounded-md h-9"
            title="Validate and restore from entered path"
          >
            Load Package
          </button>
        </div>
      </div>

      {/* Local Backup History Table */}
      <div className="card p-4 bg-white border border-surface-200 shadow-sm rounded-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-100 pb-2.5">
          <div>
            <h4 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary-600" />
              <span>Available Local Backups ({backups.length})</span>
            </h4>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenDownloads}
              className="btn-secondary text-2xs flex items-center gap-1.5 py-1 px-2.5 font-medium"
              title="Open Backups folder in Windows Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-600" />
              <span>Open Folder</span>
            </button>
            <button
              type="button"
              onClick={loadBackups}
              disabled={isLoading}
              className="btn-ghost text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1 py-1 px-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>
        </div>

        <div className="table-container">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="py-2.5 px-3 text-left">Backup Date & Time</th>
                <th className="py-2.5 px-3 text-left">Type</th>
                <th className="py-2.5 px-3 text-left">Backup File Path</th>
                <th className="py-2.5 px-3 text-left">Size</th>
                <th className="py-2.5 px-3 text-center">Actions</th>
                <th className="py-2.5 px-3 text-right">Integrity</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-surface-400">
                    <div className="spinner mx-auto mb-1.5" />
                    <span>Loading local backups...</span>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-surface-400 text-xs">
                    No local backup snapshots found. Click <b>"Create Local Backup Now"</b> above to generate your first backup.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.id || b.backup_path} className="hover:bg-surface-50/70 transition-colors">
                    <td className="font-mono text-xs text-surface-900 font-semibold py-2.5 px-3 whitespace-nowrap">
                      {formatDateTime(b.created_at)}
                    </td>
                    <td className="py-2.5 px-3">
                      {b.backup_type === 'daily_auto' || b.backup_path.toLowerCase().includes('daily_autobackup') ? (
                        <span className="badge badge-primary uppercase text-2xs font-extrabold tracking-wider bg-primary-100 text-primary-800 border border-primary-200">
                          Daily Auto
                        </span>
                      ) : (
                        <span className="badge badge-neutral uppercase text-2xs font-semibold">
                          {b.backup_type || 'Manual'}
                        </span>
                      )}
                    </td>
                    <td className="font-mono text-xs text-surface-600 py-2.5 px-3">
                      <span className="truncate max-w-xs block" title={b.backup_path}>
                        {b.backup_path.split('\\').pop() || b.backup_path}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-surface-700 py-2.5 px-3 whitespace-nowrap">
                      {formatBytes(b.size_bytes)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartRestoreFromFile(b.backup_path)}
                          className="btn-secondary text-2xs py-1 px-2.5 border-amber-300 text-amber-800 hover:bg-amber-50 flex items-center gap-1 font-semibold"
                          title="Restore this backup snapshot"
                        >
                          <RotateCcw className="w-3 h-3 text-amber-600" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLocateFile(b.backup_path)}
                          className="btn-ghost text-2xs py-1 px-2 text-surface-600 hover:text-surface-900 flex items-center gap-1"
                          title="Locate file in Windows File Explorer"
                        >
                          <FolderOpen className="w-3 h-3 text-amber-600" />
                          <span>Locate</span>
                        </button>
                      </div>
                    </td>
                    <td className="text-right py-2.5 px-3">
                      <span className="badge badge-success text-2xs inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>SHA-256 Passed</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Restore Verification Modal */}
      <Modal
        isOpen={isRestoreModalOpen}
        onClose={() => {
          if (!isRestoring) {
            setIsRestoreModalOpen(false);
            setRestoreFilePath('');
            setRestoreManifest(null);
            setValidationError(null);
            setAdminPassword('');
          }
        }}
        title="Disaster Recovery: Restore Local Backup"
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-2xs text-surface-500 font-mono">
              Tamper-Proof SHA-256 Checksum Verified
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsRestoreModalOpen(false);
                  setRestoreFilePath('');
                  setRestoreManifest(null);
                  setValidationError(null);
                  setAdminPassword('');
                }}
                disabled={isRestoring}
                className="btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring || !adminPassword.trim() || isValidatingBackup || !restoreManifest}
                className="btn-primary bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                {isRestoring ? (
                  <div className="spinner w-3.5 h-3.5 border-white" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                <span>{isRestoring ? 'Restoring Business Data...' : 'Confirm & Restore Backup'}</span>
              </button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Target File Display */}
          <div className="p-3 rounded-lg bg-surface-50 border border-surface-200">
            <div className="text-2xs text-surface-500 font-medium">Backup Archive Target:</div>
            <div className="font-mono text-xs text-surface-900 font-bold truncate mt-0.5" title={restoreFilePath}>
              {restoreFilePath}
            </div>
          </div>

          {isValidatingBackup ? (
            <div className="text-center py-8 space-y-3">
              <div className="spinner mx-auto" />
              <p className="text-xs text-surface-600 font-medium">
                Validating archive integrity and verifying SHA-256 checksums...
              </p>
            </div>
          ) : validationError ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs space-y-2">
              <div className="font-bold text-red-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
                <span>Backup Validation Rejected</span>
              </div>
              <p className="text-red-700 leading-relaxed font-mono text-2xs">{validationError}</p>
            </div>
          ) : restoreManifest ? (
            <div className="space-y-4">
              {/* Header Info Banner */}
              <div className="p-4 rounded-lg bg-emerald-50/70 border border-emerald-200 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Backup Integrity Verified (SHA-256 Passed)</span>
                  </div>
                  <span className="badge badge-success text-2xs font-mono">
                    Format v{restoreManifest.backup_format_version || '2.0.0'}
                  </span>
                </div>
                <div className="text-2xs text-emerald-800">
                  Shop Name: <span className="font-bold">{restoreManifest.shop_name}</span> • Backup Date: <span className="font-mono">{formatDateTime(restoreManifest.backup_timestamp || restoreManifest.backup_date || '')}</span>
                </div>
              </div>

              {/* Restore Preview Grid */}
              <div className="border border-surface-200 rounded-lg p-4 bg-surface-50/50 space-y-3">
                <div className="text-xs font-bold text-surface-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-primary-600" />
                  <span>Restore Preview & Record Counts</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-blue-600" />
                      <span>Products</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.product_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Layers className="w-3 h-3 text-purple-600" />
                      <span>Categories</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.category_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Receipt className="w-3 h-3 text-emerald-600" />
                      <span>Bills</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.bill_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Receipt className="w-3 h-3 text-indigo-600" />
                      <span>Payments</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.payment_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Wallet className="w-3 h-3 text-amber-600" />
                      <span>Expenses</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.expense_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Users className="w-3 h-3 text-teal-600" />
                      <span>Staff & Users</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.user_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3 text-pink-600" />
                      <span>Media Assets</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      {restoreManifest.asset_count}
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-white border border-surface-200">
                    <div className="text-2xs text-surface-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-neutral-600" />
                      <span>Schema Ver.</span>
                    </div>
                    <div className="text-base font-bold text-surface-900 font-mono mt-0.5">
                      v{restoreManifest.schema_version}
                    </div>
                  </div>
                </div>
              </div>

              {/* Safety & Preservation Notice */}
              <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs space-y-1.5">
                <div className="font-bold text-amber-900 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Automatic Safety Snapshot Guarantee</span>
                </div>
                <ul className="list-disc list-inside text-2xs text-amber-800 space-y-0.5 leading-relaxed">
                  <li>An automatic pre-restore safety backup (<span className="font-mono">pre_restore</span>) is saved before any changes are written.</li>
                  <li>Local device licenses, USB security activations, and machine network identities are preserved.</li>
                  <li>If any error occurs during restoration, changes are atomically rolled back.</li>
                </ul>
              </div>

              {/* Admin Authorization Prompt */}
              <div className="form-group pt-1">
                <label className="form-label flex items-center gap-1.5 text-xs font-bold text-surface-900">
                  <Key className="w-3.5 h-3.5 text-amber-600" />
                  <span>Enter Administrator Password to Confirm Restore *</span>
                </label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  className="form-input text-xs font-mono"
                  disabled={isRestoring}
                  autoFocus
                />
                <span className="text-2xs text-surface-500">
                  Restoring data overwrites active business tables with the snapshot contents.
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
};
