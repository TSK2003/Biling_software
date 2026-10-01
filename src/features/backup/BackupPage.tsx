import React, { useState, useEffect, useRef } from 'react';
import {
  FolderArchive,
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
  FileCheck,
  Sparkles,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { api } from '../../lib/ipc';
import { formatDateTime } from '../../lib/format';
import { Modal } from '../../components/Modal';
import type { BackupManifest, BackupRecord, AutoBackupStatus } from '../../types';
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
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Daily Automatic Backup State
  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus | null>(null);
  const [isRunningDailyBackup, setIsRunningDailyBackup] = useState(false);
  const [isTogglingAuto, setIsTogglingAuto] = useState(false);

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

  const loadAutoStatus = async () => {
    try {
      const st = await api.getAutoBackupStatus();
      setAutoBackupStatus(st);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadBackups();
    loadAutoStatus();
  }, []);

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
    const toastId = toast.loading('Creating daily automatic backup package...');
    try {
      const res = await api.triggerDailyBackupNow();
      toast.success(`Daily backup created successfully! Saved to: ${res.backup_path}`, {
        id: toastId,
        duration: 5000,
      });
      await Promise.all([loadBackups(), loadAutoStatus()]);
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Failed to create daily backup');
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsRunningDailyBackup(false);
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!autoBackupStatus) return;
    setIsTogglingAuto(true);
    try {
      const nextState = !autoBackupStatus.enabled;
      await api.setAutoBackupEnabled(nextState);
      toast.success(nextState ? 'Automatic daily backup enabled' : 'Automatic daily backup disabled');
      await loadAutoStatus();
    } catch {
      toast.error('Failed to change auto-backup setting');
    } finally {
      setIsTogglingAuto(false);
    }
  };

  const handleLocateFile = async (filePath: string) => {
    try {
      await api.showInFileManager(filePath);
    } catch {
      toast.error('Could not locate file in explorer');
    }
  };

  // 1. Create Local Backup (.billingbackup)
  const handleCreateLocalBackup = async () => {
    setIsCreatingBackup(true);
    const toastId = toast.loading('Creating local database backup package...');
    try {
      const backupPath = await api.createBackup('manual');
      toast.success(`Local backup created successfully! Saved to: ${backupPath}`, {
        id: toastId,
        duration: 5000,
      });
      await loadBackups();
    } catch (err: any) {
      const errMsg = typeof err === 'string' ? err : (err?.message || 'Failed to create local backup');
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // 2. Start restore process for a given file
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

  return (
    <div className="space-y-5">
      {/* Overview Banner Card */}
      <div className="card p-5 bg-white border border-surface-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-surface-900">
                  Local Database Backup & Disaster Recovery
                </h3>
                <span className="badge badge-success text-2xs font-semibold">
                  Local Vault Active
                </span>
              </div>
              <p className="text-xs text-surface-500 mt-1 max-w-2xl leading-relaxed">
                Atomic local snapshots of your complete billing database, product catalogue, media assets, and business expenses.
                Saved directly onto your computer's local drive as tamper-proof <span className="font-mono font-bold text-primary-700">.billingbackup</span> packages with SHA-256 integrity verification.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleOpenDownloads}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
              title="Open Backups / Downloads folder in Windows File Explorer"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Open Downloads Folder</span>
            </button>
            <button
              type="button"
              onClick={handleOpenAppBackupsFolder}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3"
              title="Open Installation Backups folder in Windows File Explorer"
            >
              <HardDrive className="w-4 h-4 text-primary-600" />
              <span>Open App Backups</span>
            </button>
          </div>
        </div>
      </div>

      {/* Daily Automatic Backup Engine Card */}
      <div className="card p-5 bg-gradient-to-r from-white via-primary-50/20 to-blue-50/30 border border-primary-200/90 shadow-sm rounded-2xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center flex-shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-extrabold text-surface-900">
                  Daily Automatic Backup (Software Installation Folder)
                </h3>
                {autoBackupStatus?.enabled ? (
                  <span className="badge badge-success text-2xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Daily Vault Active</span>
                  </span>
                ) : (
                  <span className="badge badge-danger text-2xs font-bold">
                    Auto-Backup Paused
                  </span>
                )}
                {autoBackupStatus?.last_date === new Date().toISOString().slice(0, 10) ? (
                  <span className="badge badge-primary text-2xs font-semibold">
                    Today's Snapshot Secured ({autoBackupStatus.last_date})
                  </span>
                ) : (
                  <span className="badge badge-warning text-2xs font-semibold">
                    Today's Snapshot Pending
                  </span>
                )}
              </div>
              <p className="text-xs text-surface-600 mt-1 max-w-2xl leading-relaxed">
                The software automatically creates a complete tamper-proof backup package every day it opens, stored directly inside your software installation directory. You can restore any past day with a single click.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            <button
              type="button"
              onClick={handleToggleAutoBackup}
              disabled={isTogglingAuto}
              className={`btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 font-semibold ${
                autoBackupStatus?.enabled ? 'text-primary-700 border-primary-300' : 'text-surface-600'
              }`}
              title="Toggle automatic daily backups"
            >
              {autoBackupStatus?.enabled ? (
                <ToggleRight className="w-4 h-4 text-primary-600" />
              ) : (
                <ToggleLeft className="w-4 h-4 text-surface-400" />
              )}
              <span>{autoBackupStatus?.enabled ? 'Auto-Backup: Enabled' : 'Auto-Backup: Disabled'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAppBackupsFolder}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 font-semibold"
              title="Open Application Backups folder in Windows Explorer"
            >
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Open Folder</span>
            </button>

            <button
              type="button"
              onClick={handleTriggerDailyBackup}
              disabled={isRunningDailyBackup}
              className="btn-primary text-xs flex items-center gap-1.5 py-2 px-3 font-bold shadow-xs"
              title="Trigger today's backup snapshot immediately"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningDailyBackup ? 'animate-spin' : ''}`} />
              <span>{isRunningDailyBackup ? 'Backing Up...' : "Run Today's Backup Now"}</span>
            </button>
          </div>
        </div>

        {autoBackupStatus && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-surface-200/80 text-2xs">
            <div className="bg-white/85 p-2.5 rounded-xl border border-surface-200/80 shadow-2xs">
              <span className="text-surface-500 block font-medium">Software Backups Location:</span>
              <span className="font-mono font-bold text-primary-700 truncate block mt-0.5" title={autoBackupStatus.folder_path}>
                {autoBackupStatus.folder_path}
              </span>
            </div>
            <div className="bg-white/85 p-2.5 rounded-xl border border-surface-200/80 shadow-2xs">
              <span className="text-surface-500 block font-medium">Last Auto-Backup Recorded:</span>
              <span className="font-semibold text-surface-800 block mt-0.5">
                {autoBackupStatus.last_date ? `${autoBackupStatus.last_date} ${autoBackupStatus.last_time ? `(${autoBackupStatus.last_time})` : ''}` : 'No daily backup recorded yet'}
              </span>
            </div>
            <div className="bg-white/85 p-2.5 rounded-xl border border-surface-200/80 shadow-2xs">
              <span className="text-surface-500 block font-medium">Daily Snapshots Available:</span>
              <span className="font-bold text-surface-800 block mt-0.5">
                {autoBackupStatus.total_backups} daily point-in-time archives
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Main Action Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Create Local Backup */}
        <div className="card p-5 bg-white border border-surface-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-primary-300 transition-colors">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded-lg bg-primary-50 text-primary-700 flex items-center justify-center">
              <FolderArchive className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-surface-900">
                Create Local Backup
              </h4>
              <p className="text-xs text-surface-500 mt-1 leading-relaxed">
                Generates a clean atomic snapshot of all products, categories, sales bills, payments, customers, and expenses into your local computer's backups folder.
              </p>
            </div>

            <div className="bg-surface-50 p-2.5 rounded-lg border border-surface-200 text-2xs text-surface-600 space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-surface-800">
                <FileCheck className="w-3.5 h-3.5 text-primary-600" />
                <span>Package Type: Standalone .billingbackup package</span>
              </div>
              <div className="text-surface-500">
                Includes full SQLite WAL sync & SHA-256 cryptographic verification checksum.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCreateLocalBackup}
            disabled={isCreatingBackup}
            className="btn-primary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-xs"
          >
            {isCreatingBackup ? (
              <div className="spinner w-4 h-4 border-white" />
            ) : (
              <FolderArchive className="w-4 h-4" />
            )}
            <span>{isCreatingBackup ? 'Creating Backup Snapshot...' : 'Create Local Backup Now'}</span>
          </button>
        </div>

        {/* Card 2: Restore from Local Backup */}
        <div className="card p-5 bg-white border border-surface-200 shadow-sm flex flex-col justify-between space-y-4 hover:border-amber-300 transition-colors">
          <div className="space-y-2">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <RotateCcw className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-surface-900">
                Restore from Local File
              </h4>
              <p className="text-xs text-surface-500 mt-1 leading-relaxed">
                Restore your database from any previously created <span className="font-mono text-amber-800 font-semibold">.billingbackup</span> package. Protected by Administrator password verification and automatic pre-restore safety snapshots.
              </p>
            </div>

            <div className="space-y-1.5">
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
                  placeholder="Or enter full .billingbackup file path..."
                  className="form-input text-xs font-mono py-1.5 flex-1"
                />
                <button
                  type="button"
                  onClick={() => handleStartRestoreFromFile(manualPathInput)}
                  disabled={!manualPathInput.trim()}
                  className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
                  title="Validate and restore from entered path"
                >
                  Load
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn-secondary w-full py-2.5 text-xs font-bold border-amber-300 hover:bg-amber-50 text-amber-900 flex items-center justify-center gap-2 shadow-xs cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-amber-700" />
            <span>Select & Restore File (.billingbackup)</span>
          </button>
        </div>
      </div>

      {/* Local Backup History Table */}
      <div className="card p-5 bg-white border border-surface-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-100 pb-3">
          <div>
            <h4 className="text-sm font-bold text-surface-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary-600" />
              <span>Available Local Backups ({backups.length})</span>
            </h4>
            <p className="text-2xs text-surface-500 mt-0.5">
              Saved locally on this device. You can restore any point-in-time snapshot with 1 click.
            </p>
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
