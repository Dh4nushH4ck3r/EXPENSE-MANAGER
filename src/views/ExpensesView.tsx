
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  TrendingDown, 
  TrendingUp, 
  X,
  Search,
  LayoutGrid,
  Pencil,
  AlertTriangle
} from 'lucide-react';
import { dbService } from '../db';
import { Expense, AppSettings, CATEGORIES } from '../types';

interface Props {
  settings: AppSettings;
  setSettings: (s: AppSettings) => void;
}

const ExpensesView: React.FC<Props> = ({ settings, setSettings }) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'month' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Delete State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [category, setCategory] = useState('Transport');
  const [subCategory, setSubCategory] = useState('Fuel ⛽');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [litres, setLitres] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  useEffect(() => {
    loadExpenses();
  }, []);

  const loadExpenses = async () => {
    const data = await dbService.getAll<Expense>('expenses');
    setExpenses(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleTypeChange = (newType: 'expense' | 'income') => {
    setType(newType);
    const firstValidCat = Object.keys(CATEGORIES).find(cat => CATEGORIES[cat].type === newType);
    if (firstValidCat) {
      setCategory(firstValidCat);
      setSubCategory(CATEGORIES[firstValidCat].subs[0]);
    }
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;

    const numAmount = parseFloat(amount);
    const id = editId || crypto.randomUUID();
    const isFuel = category === 'Transport' && subCategory === 'Fuel ⛽';
    const numLitres = isFuel ? parseFloat(litres) : undefined;
    
    const expenseData: Expense = {
      id,
      type,
      amount: numAmount,
      category,
      subCategory,
      date,
      notes,
      linkedToDelivery: isFuel,
      litres: numLitres,
      recurring: isRecurring ? { frequency, lastProcessed: date } : undefined
    };

    let newFuelLevel = settings.currentFuel;

    if (editId) {
        const oldExp = expenses.find(e => e.id === editId);
        if (oldExp?.linkedToDelivery && isFuel) {
             const oldL = oldExp.litres || 0;
             const newL = numLitres || 0;
             newFuelLevel = newFuelLevel - oldL + newL;
        }
        else if (oldExp?.linkedToDelivery && !isFuel) {
             const oldL = oldExp.litres || 0;
             newFuelLevel = newFuelLevel - oldL;
        }
        else if (!oldExp?.linkedToDelivery && isFuel) {
             const newL = numLitres || 0;
             newFuelLevel = newFuelLevel + newL;
        }
    } else {
        if (isFuel) {
             const newL = numLitres || 0;
             newFuelLevel = newFuelLevel + newL;
        }
    }

    if (newFuelLevel !== settings.currentFuel) {
      setSettings({
        ...settings,
        currentFuel: Math.max(0, Math.min(settings.capacity, newFuelLevel))
      });
    }

    await dbService.put('expenses', expenseData);

    if (editId) {
      setExpenses(expenses.map(e => e.id === id ? expenseData : e));
    } else {
      setExpenses([expenseData, ...expenses]);
    }
    
    closeForm();
  };

  const openEdit = (expense: Expense) => {
    setEditId(expense.id);
    setAmount(expense.amount.toString());
    setType(expense.type);
    setCategory(expense.category);
    setSubCategory(expense.subCategory);
    setNotes(expense.notes);
    setDate(expense.date);
    setLitres(expense.litres ? expense.litres.toString() : '');
    setIsRecurring(!!expense.recurring);
    if (expense.recurring) setFrequency(expense.recurring.frequency);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditId(null);
    setAmount('');
    setType('expense');
    setCategory('Transport');
    setSubCategory('Fuel ⛽');
    setNotes('');
    setLitres('');
    setIsRecurring(false);
  };

  const confirmDelete = (id: string) => {
    setDeleteId(id);
  };

  const executeDelete = async () => {
    if (!deleteId) return;
    
    const exp = expenses.find(e => e.id === deleteId);
    
    if (exp?.linkedToDelivery && exp.litres) {
      setSettings({
        ...settings,
        currentFuel: Math.max(0, settings.currentFuel - exp.litres)
      });
    }

    await dbService.delete('expenses', deleteId);
    setExpenses(expenses.filter(e => e.id !== deleteId));
    setDeleteId(null);
  };

  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const matchesType = filterType === 'all' || e.type === filterType;
      const matchesSearch = e.notes.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          e.subCategory.toLowerCase().includes(searchQuery.toLowerCase());
      
      const d = new Date(e.date);
      const today = new Date();
      
      let matchesDate = true;
      if (dateFilter === 'today') {
        matchesDate = d.toDateString() === today.toDateString();
      } else if (dateFilter === 'month') {
        matchesDate = d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      } else if (dateFilter === 'custom') {
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        if (end) end.setHours(23, 59, 59, 999);
        matchesDate = (!start || d >= start) && (!end || d <= end);
      }
      return matchesType && matchesDate && matchesSearch;
    });
  }, [expenses, filterType, dateFilter, startDate, endDate, searchQuery]);

  const stats = useMemo(() => {
    const spent = filteredExpenses.reduce((acc, curr) => curr.type === 'expense' ? acc + curr.amount : acc, 0);
    const income = filteredExpenses.reduce((acc, curr) => curr.type === 'income' ? acc + curr.amount : acc, 0);
    return { spent, income };
  }, [filteredExpenses]);

  const availableCategories = useMemo(() => {
    return Object.keys(CATEGORIES).filter(cat => CATEGORIES[cat].type === type);
  }, [type]);

  return (
    <div className="space-y-5 pb-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 dark:from-rose-500/20 dark:to-transparent p-4 rounded-3xl border border-rose-200/50 dark:border-rose-900/30 flex flex-col relative overflow-hidden group">
          <TrendingDown size={32} className="absolute -right-2 -top-2 opacity-10 text-rose-600 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-black uppercase tracking-wider mb-1">Total Expense</span>
          <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{settings.currency}{stats.spent.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 dark:from-emerald-500/20 dark:to-transparent p-4 rounded-3xl border border-emerald-200/50 dark:border-emerald-900/30 flex flex-col relative overflow-hidden group">
          <TrendingUp size={32} className="absolute -right-2 -top-2 opacity-10 text-emerald-600 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-wider mb-1">Total Income</span>
          <span className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none">{settings.currency}{stats.income.toLocaleString()}</span>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-3xl border dark:border-slate-800/50 shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search records..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border-none rounded-xl text-xs font-bold outline-none dark:text-white"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hide">
          {['all', 'expense', 'income'].map(t => (
            <button 
              key={t}
              onClick={() => setFilterType(t as any)}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${filterType === t ? 'bg-slate-900 dark:bg-white text-white dark:text-darkbg' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
            >
              {t}
            </button>
          ))}
          <div className="w-[1px] h-6 bg-slate-200 dark:bg-slate-800 mx-0.5 shrink-0"></div>
          {['today', 'month', 'custom'].map(f => (
            <button 
              key={f}
              onClick={() => setDateFilter(f as any)}
              className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${dateFilter === f ? 'bg-blue-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
            >
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

      {/* List */}
      <div className="space-y-3">
        {filteredExpenses.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-darkcard rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
            <LayoutGrid size={24} className="mx-auto text-slate-200 dark:text-slate-800 mb-2" />
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No Records</p>
          </div>
        ) : (
          filteredExpenses.map(expense => (
            <div 
              key={expense.id}
              onClick={() => openEdit(expense)}
              className="bg-white dark:bg-darkcard p-3 rounded-2xl shadow-sm border border-slate-50 dark:border-slate-800 flex items-center justify-between group active:scale-[0.99] transition-transform cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-lg shadow-inner">
                  {CATEGORIES[expense.category]?.icon || '📦'}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 dark:text-white text-xs leading-none mb-1">{expense.subCategory.split(' ')[0]}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">{new Date(expense.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} • {expense.category}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-black text-xs ${expense.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}`}>
                  {expense.type === 'income' ? '+' : '-'}{settings.currency}{expense.amount.toLocaleString()}
                </span>
                <button 
                  onClick={(e) => { e.stopPropagation(); confirmDelete(expense.id); }}
                  className="p-2 text-slate-200 hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <button 
        onClick={() => setIsFormOpen(true)}
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center active:scale-90 transition-all z-40 group"
      >
        <Plus size={28} className="group-hover:rotate-90 transition-transform" />
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
                <h3 className="text-lg font-black text-slate-900 dark:text-white">Delete Record?</h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Permanently remove this entry? <br/>
                  <span className="opacity-70">If this was a fuel entry, the tank level will decrease.</span>
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

      {/* Form Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-darkcard w-full max-w-sm rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 border dark:border-slate-800">
            <div className="p-4 flex justify-between items-center bg-white/80 dark:bg-darkbg/80 backdrop-blur-xl border-b dark:border-slate-800">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{editId ? 'Edit Record' : 'New Record'}</h2>
                <p className="text-[9px] text-blue-600 font-black uppercase">Ledger Entry</p>
              </div>
              <button onClick={closeForm} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <X size={18} className="text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button 
                  type="button" 
                  onClick={() => handleTypeChange('expense')} 
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${type === 'expense' ? 'bg-white dark:bg-slate-800 shadow-sm text-rose-500' : 'text-slate-400'}`}
                >
                  Expense
                </button>
                <button 
                  type="button" 
                  onClick={() => handleTypeChange('income')} 
                  className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase transition-all ${type === 'income' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600' : 'text-slate-400'}`}
                >
                  Income
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Amount</label>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 group focus-within:border-blue-500/50 transition-colors">
                  <span className="text-2xl font-black text-slate-300 dark:text-slate-700">{settings.currency}</span>
                  <input 
                    type="number" 
                    required 
                    autoFocus={!editId}
                    value={amount} 
                    onChange={e => {
                      setAmount(e.target.value);
                      if (category === 'Transport' && subCategory === 'Fuel ⛽' && e.target.value) {
                        setLitres((parseFloat(e.target.value) / settings.petrolRate).toFixed(2));
                      }
                    }} 
                    className="w-full text-2xl font-black bg-transparent outline-none dark:text-white" 
                    placeholder="0" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                  <select 
                    value={category} 
                    onChange={e => {
                        const newCat = e.target.value;
                        setCategory(newCat); 
                        setSubCategory(CATEGORIES[newCat].subs[0]);
                    }}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 outline-none text-xs font-bold dark:text-white appearance-none truncate"
                  >
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{CATEGORIES[cat].icon} {cat}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Sub-Type</label>
                  <select 
                    value={subCategory} 
                    onChange={e => setSubCategory(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 outline-none text-xs font-bold dark:text-white appearance-none truncate"
                  >
                    {CATEGORIES[category]?.subs.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Notes (Optional)</label>
                <input 
                  type="text" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Add details..."
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none placeholder:text-slate-300" 
                />
              </div>

              <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-500/20 text-sm active:scale-95 transition-all uppercase tracking-widest mt-2">
                {editId ? 'Update Record' : 'Save Record'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpensesView;
