
import React, { useRef } from 'react';
import { X, Save, Download, Upload, AlertCircle, Monitor, Moon, Sun } from 'lucide-react';
import { AppSettings, Expense, Loan, DeliveryWork } from '../types';
import { dbService } from '../db';

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ settings, setSettings, onClose }) => {
  const [localSettings, setLocalSettings] = React.useState(settings);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    setSettings(localSettings);
    onClose();
  };

  const handleExport = async () => {
    const expenses = await dbService.getAll<Expense>('expenses');
    const loans = await dbService.getAll<Loan>('loans');
    const delivery = await dbService.getAll<DeliveryWork>('delivery');

    const data = {
      settings: localSettings,
      expenses,
      loans,
      delivery,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `expense_pro_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.settings) setLocalSettings(data.settings);
        
        if (data.expenses) {
          for (const item of data.expenses) await dbService.put('expenses', item);
        }
        if (data.loans) {
          for (const item of data.loans) await dbService.put('loans', item);
        }
        if (data.delivery) {
          for (const item of data.delivery) await dbService.put('delivery', item);
        }
        
        alert('Vault imported successfully! Rebuilding application state...');
        window.location.reload();
      } catch (err) {
        alert('Invalid backup file. Error parsing vault.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-darkcard w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border dark:border-slate-800">
        <div className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/40">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 dark:text-white">Preferences</h2>
            <p className="text-xs text-slate-500 font-medium">Configure your workspace</p>
          </div>
          <button onClick={onClose} className="p-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-2xl shadow-sm text-slate-500 dark:text-slate-400 transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[65vh] overflow-y-auto scrollbar-hide">
          {/* Appearance Section */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Appearance</h3>
            <div className="flex bg-slate-100 dark:bg-slate-900 p-1.5 rounded-2xl">
              {[
                { id: 'light', icon: <Sun size={18} />, label: 'Light' },
                { id: 'system', icon: <Monitor size={18} />, label: 'Auto' },
                { id: 'dark', icon: <Moon size={18} />, label: 'Dark' }
              ].map(theme => (
                <button
                  key={theme.id}
                  onClick={() => setLocalSettings({...localSettings, theme: theme.id as any})}
                  className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl transition-all duration-300 ${
                    localSettings.theme === theme.id 
                    ? 'bg-white dark:bg-slate-800 shadow-md text-blue-600 dark:text-blue-400' 
                    : 'text-slate-500 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                >
                  {theme.icon}
                  <span className="text-[10px] font-bold">{theme.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">System Config</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">Mileage (KM/L)</label>
                <input 
                  type="number" 
                  value={localSettings.mileage}
                  onChange={e => setLocalSettings({...localSettings, mileage: parseFloat(e.target.value)})}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">Petrol (Rate/L)</label>
                <input 
                  type="number" 
                  value={localSettings.petrolRate}
                  onChange={e => setLocalSettings({...localSettings, petrolRate: parseFloat(e.target.value)})}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 ml-1">Currency Symbol</label>
              <input 
                type="text" 
                value={localSettings.currency}
                onChange={e => setLocalSettings({...localSettings, currency: e.target.value})}
                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none text-sm font-bold dark:text-white"
              />
            </div>
          </div>

          {/* Backup Section */}
          <div className="pt-4 space-y-4">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Data Sync</h3>
            <div className="flex flex-col gap-3">
              <button 
                onClick={handleExport}
                className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-2xl font-bold hover:bg-blue-100 transition-all border border-blue-100 dark:border-blue-900/30"
              >
                <div className="flex items-center gap-3">
                  <Download size={20} />
                  <span>Export Vault</span>
                </div>
                <div className="text-[10px] bg-white dark:bg-slate-800 px-2 py-1 rounded-lg">.JSON</div>
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 rounded-2xl font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-100 dark:border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <Upload size={20} />
                  <span>Import Data</span>
                </div>
                <div className="text-[10px] bg-white dark:bg-slate-800 px-2 py-1 rounded-lg">FILE</div>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleImport} 
                className="hidden" 
                accept=".json"
              />
            </div>
          </div>
        </div>

        <div className="p-6 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex gap-4">
          <button 
            onClick={onClose}
            className="flex-1 py-4 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-2xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-xl shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
