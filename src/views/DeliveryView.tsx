
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Truck, 
  Smartphone, 
  Wallet, 
  DollarSign, 
  X,
  Navigation,
  Fuel as FuelIcon,
  Award,
  Search,
  Calendar,
  AlertTriangle,
  Zap,
  ArrowRightLeft,
  CheckCircle2,
  TrendingUp
} from 'lucide-react';
import { dbService } from '../db';
import { DeliveryWork, AppSettings, Expense } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const DeliveryView: React.FC<Props> = ({ settings, setSettings }) => {
  const [sessions, setSessions] = useState<DeliveryWork[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  // Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  // Filtering state
  const [dateFilter, setDateFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly' | 'year' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  
  // New Logic State
  const [appTotal, setAppTotal] = useState(''); // Total Earnings shown in App
  const [cashCollected, setCashCollected] = useState(''); // Cash in Hand
  
  const [kmDriven, setKmDriven] = useState('');
  const [otherExpenses, setOtherExpenses] = useState('');

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    const data = await dbService.getAll<DeliveryWork>('delivery');
    setSessions(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kmDriven || !appTotal) return;

    const km = parseFloat(kmDriven);
    const total = parseFloat(appTotal) || 0;
    const cash = parseFloat(cashCollected) || 0;
    // Logic: Settlement (Online) = Total Earnings - Cash Collected
    const settlement = total - cash;

    const id = editId || crypto.randomUUID();
    const existingSession = sessions.find(s => s.id === id);

    const sessionData: DeliveryWork = {
      id,
      date,
      cash: cash,
      online: settlement, 
      kmDriven: km,
      otherExpenses: parseFloat(otherExpenses) || 0,
      ledgerId: existingSession?.ledgerId // Preserve link if editing
    };

    // Calculate fuel adjustments
    let newFuelLevel = settings.currentFuel;

    if (editId) {
      if (existingSession) {
        const oldFuelUsed = existingSession.kmDriven / settings.mileage;
        const newFuelUsed = km / settings.mileage;
        newFuelLevel = newFuelLevel - (newFuelUsed - oldFuelUsed);
      }
    } else {
      const fuelUsed = km / settings.mileage;
      newFuelLevel = newFuelLevel - fuelUsed;
    }

    newFuelLevel = Math.max(0, Math.min(settings.capacity, newFuelLevel));

    setSettings({
      ...settings,
      currentFuel: newFuelLevel
    });

    await dbService.put('delivery', sessionData);
    
    if (editId) {
      setSessions(sessions.map(s => s.id === id ? sessionData : s));
    } else {
      setSessions([sessionData, ...sessions]);
    }
    
    // Low Fuel Alert Logic
    if (newFuelLevel < (settings.capacity * 0.15) && Notification.permission === 'granted') {
       new Notification('Fuel Low', { body: `Tank at ${(newFuelLevel/settings.capacity*100).toFixed(0)}%. Refuel recommended.` });
    }

    closeForm();
  };

  const handleTransferToLedger = async () => {
    // 1. Identify valid sessions currently in view that haven't been posted
    const eligibleSessions = filteredSessions.filter(s => !s.ledgerId);
    
    if (eligibleSessions.length === 0) {
      alert("All sessions in this view have already been posted to Ledger.");
      return;
    }

    // 2. Calculate net settlement for these sessions
    const settlement = eligibleSessions.reduce((acc, s) => acc + s.online, 0);
    
    if (settlement === 0) {
        alert("Net settlement is zero. Nothing to post.");
        return;
    }

    const isIncome = settlement > 0;
    const absAmount = Math.abs(settlement);

    // 3. Create Expense Object
    const payoutEntry: Expense = {
        id: crypto.randomUUID(),
        type: isIncome ? 'income' : 'expense',
        amount: absAmount,
        category: isIncome ? 'Income' : 'Transport', 
        subCategory: isIncome ? 'Salary 💵' : 'Maintenance 🔧',
        date: new Date().toISOString().split('T')[0],
        notes: `Delivery Payout: ${dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} Summary (${eligibleSessions.length} sessions)`,
        linkedToDelivery: true
    };

    // 4. Save to Expenses DB
    await dbService.put('expenses', payoutEntry);

    // 5. Update Delivery Sessions with ledgerId to prevent duplicates
    const updatedSessions = sessions.map(s => {
        if (eligibleSessions.find(es => es.id === s.id)) {
            return { ...s, ledgerId: payoutEntry.id };
        }
        return s;
    });

    // Batch update DB
    for (const session of eligibleSessions) {
        await dbService.put('delivery', { ...session, ledgerId: payoutEntry.id });
    }

    setSessions(updatedSessions);
    alert(`Successfully posted ${settings.currency}${absAmount} to Ledger. Marked ${eligibleSessions.length} sessions as transferred.`);
  };

  const openEdit = (session: DeliveryWork) => {
    setEditId(session.id);
    setDate(session.date);
    const total = session.cash + session.online;
    setAppTotal(total.toString());
    setCashCollected(session.cash.toString());
    setKmDriven(session.kmDriven.toString());
    setOtherExpenses(session.otherExpenses.toString());
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditId(null);
    setAppTotal('');
    setCashCollected('');
    setKmDriven('');
    setOtherExpenses('');
  };

  const confirmDelete = (id: string) => {
    setDeleteId(id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    
    const session = sessions.find(s => s.id === deleteId);
    if (session) {
       const fuelToRestore = session.kmDriven / settings.mileage;
       const newFuelLevel = Math.min(settings.capacity, settings.currentFuel + fuelToRestore);
       setSettings({
         ...settings,
         currentFuel: newFuelLevel
       });
    }

    await dbService.delete('delivery', deleteId);
    setSessions(sessions.filter(s => s.id !== deleteId));
    setDeleteId(null);
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter(s => {
      let matchesDate = true;
      const sessionDate = new Date(s.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (dateFilter === 'daily') {
        matchesDate = sessionDate.toDateString() === today.toDateString();
      } else if (dateFilter === 'weekly') {
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        matchesDate = sessionDate >= lastWeek;
      } else if (dateFilter === 'monthly') {
        matchesDate = sessionDate.getMonth() === today.getMonth() && sessionDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'year') {
        matchesDate = sessionDate.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'custom') {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        matchesDate = (!start || sessionDate >= start) && (!end || sessionDate <= end);
      }
      return matchesDate;
    });
  }, [sessions, dateFilter, startDate, endDate]);

  const totalStats = useMemo(() => {
    // Only aggregate sessions that match the filter for the main display
    return filteredSessions.reduce((acc, s) => {
      const fuelCost = (s.kmDriven / settings.mileage) * settings.petrolRate;
      const totalEarnings = s.cash + s.online; 
      const netProfit = totalEarnings - s.otherExpenses - fuelCost;
      
      return {
        appTotal: acc.appTotal + totalEarnings,
        settlement: acc.settlement + s.online,
        cashInHand: acc.cashInHand + s.cash,
        km: acc.km + s.kmDriven,
        profit: acc.profit + netProfit
      };
    }, { appTotal: 0, settlement: 0, cashInHand: 0, km: 0, profit: 0 });
  }, [filteredSessions, settings.mileage, settings.petrolRate]);

  // Calculate transferable amount (only un-ledgered items in current view)
  const transferableAmount = useMemo(() => {
    return filteredSessions
        .filter(s => !s.ledgerId)
        .reduce((acc, s) => acc + s.online, 0);
  }, [filteredSessions]);

  const totalFuelConsumed = useMemo(() => {
    return sessions.reduce((acc, s) => acc + (s.kmDriven / settings.mileage), 0);
  }, [sessions, settings.mileage]);

  const fuelPercent = Math.min(100, (settings.currentFuel / settings.capacity) * 100);

  let progressColorClass = '';
  if (fuelPercent > 50) {
    progressColorClass = 'bg-gradient-to-r from-emerald-400 to-emerald-600 shadow-[0_0_10px_rgba(16,185,129,0.4)]';
  } else if (fuelPercent > 20) {
    progressColorClass = 'bg-gradient-to-r from-amber-400 to-orange-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]';
  } else {
    progressColorClass = 'bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.4)]';
  }

  const previewSettlement = (parseFloat(appTotal) || 0) - (parseFloat(cashCollected) || 0);

  return (
    <div className="space-y-5 pb-6">
      {/* Hero Card */}
      <div className="bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-500 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-500/30 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1 bg-white/20 rounded-lg backdrop-blur-sm">
              <ArrowRightLeft size={14} className="text-white" />
            </div>
            <p className="text-blue-50 text-[10px] font-black uppercase tracking-widest">Total Payout (Settlement)</p>
          </div>
          <h2 className="text-3xl font-black mb-4 tracking-tight flex items-baseline gap-1">
            <span className="text-lg font-bold opacity-60">{settings.currency}</span>
            {totalStats.settlement.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            {totalStats.settlement < 0 && <span className="text-xs font-bold bg-white/20 px-2 py-0.5 rounded ml-2">PAYABLE</span>}
          </h2>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/10">
              <p className="text-[8px] opacity-60 font-black uppercase tracking-wider mb-0.5">App Total</p>
              <p className="text-base font-black">{settings.currency}{totalStats.appTotal.toLocaleString()}</p>
            </div>
            <div className="bg-white/10 p-3 rounded-xl backdrop-blur-md border border-white/10">
              <p className="text-[8px] opacity-60 font-black uppercase tracking-wider mb-0.5">Cash Hand</p>
              <p className="text-base font-black">{settings.currency}{totalStats.cashInHand.toLocaleString()}</p>
            </div>
          </div>
        </div>
        <Truck className="absolute -right-8 -bottom-8 text-white/5 rotate-12" size={140} />
      </div>

      {/* Transfer Action Bar */}
      <div className="bg-white dark:bg-darkcard p-1 rounded-2xl border dark:border-slate-800 shadow-sm flex items-center justify-between gap-2">
         <div className="flex-1 px-3 py-2 flex flex-col justify-center">
             <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Pending Transfer</span>
             <span className="text-sm font-black text-slate-900 dark:text-white">{settings.currency}{transferableAmount.toLocaleString()}</span>
         </div>
         {Math.abs(transferableAmount) > 0 ? (
            <button 
                onClick={handleTransferToLedger}
                className="px-4 py-3 bg-slate-900 dark:bg-white rounded-xl text-white dark:text-slate-900 text-[10px] font-black uppercase tracking-wider flex items-center gap-2 active:scale-95 transition-transform"
            >
                <TrendingUp size={14} />
                Post to Ledger
            </button>
         ) : (
            <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-400 text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={14} />
                All Posted
            </div>
         )}
      </div>

      {/* Fuel Intelligence */}
      <div className="bg-white dark:bg-darkcard p-5 rounded-[2rem] border dark:border-slate-800/50 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-sm">
              <FuelIcon size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-800 dark:text-white text-sm leading-tight">Energy Vault</h3>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-0.5">Tank Status</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">
              {settings.currentFuel.toFixed(2)}<span className="text-sm font-bold text-slate-400 ml-0.5">L</span>
            </div>
            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Available</p>
          </div>
        </div>

        <div className="h-3 w-full bg-slate-100 dark:bg-slate-900 rounded-full overflow-hidden mb-5 border border-slate-100 dark:border-slate-800">
          <div 
            className={`h-full transition-all duration-1000 ease-out rounded-full ${progressColorClass}`}
            style={{ width: `${fuelPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
            <Navigation size={14} className="text-blue-500 mb-0.5" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Range</span>
            <span className="text-xs font-black text-slate-800 dark:text-white">~{(settings.currentFuel * settings.mileage).toFixed(0)}<span className="text-[9px] text-slate-400 ml-0.5">KM</span></span>
          </div>
          
          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
            <Zap size={14} className="text-amber-500 mb-0.5" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Burned</span>
            <span className="text-xs font-black text-slate-800 dark:text-white">{totalFuelConsumed.toFixed(1)}<span className="text-[9px] text-slate-400 ml-0.5">L</span></span>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
            <Award size={14} className="text-emerald-500 mb-0.5" />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tight">Profit</span>
            <span className="text-xs font-black text-slate-800 dark:text-white">{settings.currency}{totalStats.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </div>

      {/* Date Filter & Logs Header */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-3xl border dark:border-slate-800/50 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b dark:border-slate-800 pb-2 mb-2">
          <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dispatches</h3>
          <span className="text-[9px] font-bold text-slate-300">{filteredSessions.length} total</span>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {['all', 'daily', 'weekly', 'monthly', 'year', 'custom'].map(f => (
            <button 
              key={f}
              onClick={() => setDateFilter(f as any)}
              className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${dateFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
            >
              {f === 'custom' ? <Calendar size={12} className="inline mr-1" /> : null}
              {f}
            </button>
          ))}
        </div>

        {dateFilter === 'custom' && (
          <div className="grid grid-cols-2 gap-2 pt-1 animate-in slide-in-from-top-2">
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="p-3 text-[10px] font-bold bg-slate-50 dark:bg-slate-900 rounded-xl outline-none dark:text-white border dark:border-slate-800" 
            />
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="p-3 text-[10px] font-bold bg-slate-50 dark:bg-slate-900 rounded-xl outline-none dark:text-white border dark:border-slate-800" 
            />
          </div>
        )}
      </div>

      {/* Daily Logs */}
      <div className="space-y-3">
        {filteredSessions.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-darkcard rounded-3xl border border-dashed dark:border-slate-800">
            <Navigation className="mx-auto text-slate-200 dark:text-slate-800 mb-2" size={24} />
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No matching logs</p>
          </div>
        ) : (
          filteredSessions.map(session => {
             const appTotal = session.cash + session.online;

             return (
              <div 
                key={session.id} 
                onClick={() => openEdit(session)}
                className="bg-white dark:bg-darkcard p-4 rounded-2xl shadow-sm border border-slate-50 dark:border-slate-800 flex flex-col gap-3 active:scale-[0.99] transition-transform cursor-pointer relative overflow-hidden"
              >
                {/* Visual Indicator for Posted Item */}
                {session.ledgerId && (
                    <div className="absolute top-0 right-0 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-bl-xl border-l border-b dark:border-slate-700">
                        <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Posted</span>
                    </div>
                )}

                <div className="flex justify-between items-center mt-1">
                  <span className="font-extrabold text-slate-800 dark:text-white text-[11px] uppercase tracking-wider">
                    {new Date(session.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} Dispatch
                  </span>
                  {!session.ledgerId && (
                     <button onClick={(e) => { e.stopPropagation(); confirmDelete(session.id); }} className="p-2 text-slate-200 hover:text-rose-500 transition-colors">
                        <Trash2 size={14} />
                     </button>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl text-center shadow-inner">
                    <span className="text-[7px] text-slate-400 font-black uppercase tracking-tight">App Total</span>
                    <p className="font-black text-slate-800 dark:text-slate-200 text-xs">{settings.currency}{appTotal.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl text-center shadow-inner">
                    <span className="text-[7px] text-slate-400 font-black uppercase tracking-tight">Cash Hand</span>
                    <p className="font-black text-slate-800 dark:text-slate-200 text-xs">{settings.currency}{session.cash.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl text-center shadow-inner">
                    <span className="text-[7px] text-slate-400 font-black uppercase tracking-tight">Settlement</span>
                    <p className={`font-black text-xs ${session.online >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {settings.currency}{session.online.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button onClick={() => setIsFormOpen(true)} className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center z-40 transition-all active:scale-90">
        <Plus size={28} />
      </button>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-darkcard w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border dark:border-slate-800 animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mb-2">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Delete Session?</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  This will permanently remove the dispatch record and <strong className="text-rose-500">restore the calculated fuel</strong> back to your tank level.
                </p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider">Cancel</button>
                <button onClick={executeDelete} className="flex-1 py-3.5 bg-rose-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-rose-500/20">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/New Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-darkcard w-full max-w-sm rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 border dark:border-slate-800">
            <div className="p-4 flex justify-between items-center bg-white/80 dark:bg-darkbg/80 backdrop-blur-xl border-b dark:border-slate-800">
              <div>
                <h2 className="text-lg font-black tracking-tight dark:text-white">{editId ? 'Update Dispatch' : 'New Dispatch'}</h2>
                <p className="text-[9px] text-blue-600 font-black uppercase">Session Entry</p>
              </div>
              <button onClick={closeForm} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Dispatch Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">App Total</label>
                  <div className="relative">
                    <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input type="number" value={appTotal} onChange={e => setAppTotal(e.target.value)} className="w-full pl-9 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" placeholder="0" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Cash Collected</label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                    <input type="number" value={cashCollected} onChange={e => setCashCollected(e.target.value)} className="w-full pl-9 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" placeholder="0" />
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30">
                 <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-blue-400 uppercase tracking-wider">Estimated Payout</span>
                    <span className={`text-sm font-black ${previewSettlement >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-500'}`}>
                        {previewSettlement < 0 ? 'PAYABLE ' : 'RECEIVABLE '} 
                        {settings.currency}{Math.abs(previewSettlement).toLocaleString()}
                    </span>
                 </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Distance (KM)</label>
                <div className="relative">
                  <Navigation className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
                  <input type="number" required value={kmDriven} onChange={e => setKmDriven(e.target.value)} className="w-full pl-9 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-black text-xl dark:text-white outline-none" placeholder="0.0" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Other Fees</label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" size={14} />
                  <input type="number" value={otherExpenses} onChange={e => setOtherExpenses(e.target.value)} className="w-full pl-9 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" placeholder="0" />
                </div>
              </div>

              <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-500/20 text-sm active:scale-95 transition-all uppercase tracking-widest mt-2">
                {editId ? 'Update Session' : 'Submit Session'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DeliveryView;
