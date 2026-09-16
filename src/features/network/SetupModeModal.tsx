import React, { useState } from 'react';
import { Modal } from '../../components/Modal';
import { Server, Monitor, ShieldCheck, Wifi, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useNetwork } from '../../contexts/NetworkContext';

interface SetupModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SetupModeModal: React.FC<SetupModeModalProps> = ({ isOpen, onClose }) => {
  const { networkInfo, setMode } = useNetwork();
  const [selectedMode, setSelectedMode] = useState<'host' | 'client'>(networkInfo?.mode || 'host');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await setMode(selectedMode);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Choose Setup Type — Multi-Computer Mode"
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            {isSaving ? <div className="spinner w-3.5 h-3.5 border-white" /> : <ArrowRight className="w-3.5 h-3.5" />}
            <span>Confirm & Continue</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <p className="text-xs text-surface-600 leading-relaxed">
          Configure how this computer operates in your shop network. All computers in the shop connect to the same central database.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Option 1: Main Host Computer */}
          <div
            onClick={() => setSelectedMode('host')}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedMode === 'host'
                ? 'border-primary-600 bg-primary-50/40 ring-2 ring-primary-100'
                : 'border-surface-200 hover:border-surface-300 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-primary-100 text-primary-700 flex items-center justify-center mb-3">
                <Server className="w-5 h-5" />
              </div>
              {selectedMode === 'host' && (
                <CheckCircle2 className="w-5 h-5 text-primary-600" />
              )}
            </div>
            <h4 className="text-sm font-bold text-surface-900">Main Computer (Host)</h4>
            <p className="text-2xs text-surface-500 mt-1 leading-relaxed">
              Holds the central SQLite database, master inventory, user accounts, and local network service. Choose this for your primary counter PC.
            </p>
            <div className="mt-3 pt-3 border-t border-surface-200/60 flex items-center gap-1 text-2xs font-medium text-emerald-700">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Full Local Authority & USB License</span>
            </div>
          </div>

          {/* Option 2: Additional Cashier Client Computer */}
          <div
            onClick={() => setSelectedMode('client')}
            className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedMode === 'client'
                ? 'border-primary-600 bg-primary-50/40 ring-2 ring-primary-100'
                : 'border-surface-200 hover:border-surface-300 bg-white'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3">
                <Monitor className="w-5 h-5" />
              </div>
              {selectedMode === 'client' && (
                <CheckCircle2 className="w-5 h-5 text-primary-600" />
              )}
            </div>
            <h4 className="text-sm font-bold text-surface-900">Additional Computer (Client)</h4>
            <p className="text-2xs text-surface-500 mt-1 leading-relaxed">
              Connects over your shop Wi-Fi / LAN to the Main Host PC for live billing, shared products, and synchronized sales without file conflicts.
            </p>
            <div className="mt-3 pt-3 border-t border-surface-200/60 flex items-center gap-1 text-2xs font-medium text-blue-700">
              <Wifi className="w-3.5 h-3.5" />
              <span>Fast LAN Connection Code Pairing</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
