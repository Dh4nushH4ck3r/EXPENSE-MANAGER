
import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  HandCoins, 
  User, 
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Calendar,
  AlertTriangle,
  Scale,
  Briefcase,
  Users,
  Clock,
  Repeat,
  Calculator,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { dbService } from '../db';
import { Loan, AppSettings, LoanPayment } from '../types';

interface Props {
  settings: AppSettings;
}

const LoansView: React.FC<Props> = ({ settings }) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'cleared'>('active');
  const [expandedLoanId, setExpandedLoanId] = useState<string | null>(null);
  
  // Delete Config
  const [deleteConfig, setDeleteConfig] = useState<{type: 'loan' | 'payment', loanId: string, paymentId?: string} | null>(null);

  // Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'weekly' | 'monthly' | 'year' | 'custom'>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Form State
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'given' | 'taken'>('given');
  
  // New Form Logic
  const [category, setCategory] = useState<'friend' | 'official'>('friend');
  const [interest, setInterest] = useState('0');
  const [tenure, setTenure] = useState(''); // In months
  const [paymentFrequency, setPaymentFrequency] = useState<'weekly' | 'monthly'>('monthly');
  
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Payment State
  const [payingLoanId, setPayingLoanId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  useEffect(() => {
    loadLoans();
  }, []);

  const loadLoans = async () => {
    const data = await dbService.getAll<Loan>('loans');
    setLoans(data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    const id = editId || crypto.randomUUID();
    const existingLoan = loans.find(l => l.id === id);

    // Conditional Logic based on Category
    const isFriend = category === 'friend';
    
    const finalInterest = isFriend ? 0 : parseFloat(interest) || 0;
    const finalTenure = isFriend ? null : parseFloat(tenure) || null;
    const finalFrequency = isFriend ? null : paymentFrequency;

    const loanData: Loan = {
      id,
      name,
      amount: parseFloat(amount),
      type,
      category,
      interest: finalInterest,
      tenure: finalTenure,
      paymentFrequency: finalFrequency,
      payments: existingLoan?.payments || [],
      date,
      status: existingLoan?.status || 'active'
    };

    await dbService.put('loans', loanData);
    
    if (editId) {
      setLoans(loans.map(l => l.id === id ? loanData : l));
    } else {
      setLoans([loanData, ...loans]);
    }
    
    closeForm();
  };

  const openEdit = (loan: Loan) => {
    setEditId(loan.id);
    setName(loan.name);
    setAmount(loan.amount.toString());
    setType(loan.type);
    setDate(loan.date);
    
    // Set Category & specific fields
    const cat = loan.category || (loan.interest > 0 ? 'official' : 'friend');
    setCategory(cat);
    
    if (cat === 'official') {
      setInterest(loan.interest.toString());
      setTenure(loan.tenure ? loan.tenure.toString() : '');
      setPaymentFrequency(loan.paymentFrequency || 'monthly');
    } else {
      setInterest('0');
      setTenure('');
      setPaymentFrequency('monthly');
    }

    setIsFormOpen(true);
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditId(null);
    setName('');
    setAmount('');
    setType('given');
    // Reset defaults
    setCategory('friend');
    setInterest('0');
    setTenure('');
    setPaymentFrequency('monthly');
  };

  const addPayment = async (loanId: string) => {
    if (!paymentAmount) return;
    const amountNum = parseFloat(paymentAmount);
    
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const payment: LoanPayment = {
      id: crypto.randomUUID(),
      amount: amountNum,
      date: new Date().toISOString().split('T')[0]
    };

    const updatedLoan: Loan = {
      ...loan,
      payments: [...loan.payments, payment]
    };

    const currentPaid = updatedLoan.payments.reduce((acc, p) => acc + p.amount, 0);
    if (currentPaid >= updatedLoan.amount) {
      updatedLoan.status = 'cleared';
    }

    await dbService.put('loans', updatedLoan);
    setLoans(loans.map(l => l.id === loanId ? updatedLoan : l));
    setPayingLoanId(null);
    setPaymentAmount('');
  };

  const confirmDeleteLoan = (id: string) => {
    setDeleteConfig({ type: 'loan', loanId: id });
  };

  const confirmDeletePayment = (loanId: string, paymentId: string) => {
    setDeleteConfig({ type: 'payment', loanId, paymentId });
  };

  const executeDelete = async () => {
    if (!deleteConfig) return;

    if (deleteConfig.type === 'loan') {
        await dbService.delete('loans', deleteConfig.loanId);
        setLoans(loans.filter(l => l.id !== deleteConfig.loanId));
    } 
    else if (deleteConfig.type === 'payment' && deleteConfig.paymentId) {
        const loan = loans.find(l => l.id === deleteConfig.loanId);
        if (loan) {
            const updatedPayments = loan.payments.filter(p => p.id !== deleteConfig.paymentId);
            const totalPaid = updatedPayments.reduce((acc, p) => acc + p.amount, 0);
            const newStatus = totalPaid >= loan.amount ? 'cleared' : 'active';

            const updatedLoan: Loan = {
            ...loan,
            payments: updatedPayments,
            status: newStatus
            };

            await dbService.put('loans', updatedLoan);
            setLoans(loans.map(l => l.id === deleteConfig.loanId ? updatedLoan : l));
        }
    }
    setDeleteConfig(null);
  };

  const filteredLoans = useMemo(() => {
    return loans.filter(l => {
      const matchesStatus = l.status === activeTab;
      const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const checkDate = (dStr: string) => {
        const d = new Date(dStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateFilter === 'all') return true;
        if (dateFilter === 'weekly') {
            const lastWeek = new Date();
            lastWeek.setDate(today.getDate() - 7);
            return d >= lastWeek;
        }
        if (dateFilter === 'monthly') {
            return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
        }
        if (dateFilter === 'year') {
            return d.getFullYear() === today.getFullYear();
        }
        if (dateFilter === 'custom') {
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            if (start) start.setHours(0, 0, 0, 0);
            if (end) end.setHours(23, 59, 59, 999);
            return (!start || d >= start) && (!end || d <= end);
        }
        return true;
      };

      const loanDateMatches = checkDate(l.date);
      // Check if any payment matches the date filter
      const hasPaymentMatch = l.payments.some(p => checkDate(p.date));
      
      return matchesStatus && matchesSearch && (loanDateMatches || hasPaymentMatch);
    });
  }, [loans, activeTab, searchQuery, dateFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const given = loans.filter(l => l.type === 'given' && l.status === 'active')
      .reduce((acc, l) => acc + (l.amount - l.payments.reduce((pAcc, p) => pAcc + p.amount, 0)), 0);
    const taken = loans.filter(l => l.type === 'taken' && l.status === 'active')
      .reduce((acc, l) => acc + (l.amount - l.payments.reduce((pAcc, p) => pAcc + p.amount, 0)), 0);
    return { given, taken };
  }, [loans]);

  const loanCalculations = useMemo(() => {
    if (category !== 'official' || !amount || !interest || !tenure) return null;
    
    const P = parseFloat(amount);
    const R = parseFloat(interest);
    const T = parseFloat(tenure);
    
    // Simple Interest Logic: Interest = P * (R/100) * T
    const totalInterest = P * (R / 100) * T;
    const totalPayable = P + totalInterest;
    const monthlyPayment = totalPayable / T;
    
    return { totalInterest, totalPayable, monthlyPayment };
  }, [amount, interest, tenure, category]);

  const netPosition = stats.given - stats.taken;

  return (
    <div className="space-y-5 pb-6">
      {/* Net Position Card */}
      <div className="bg-slate-900 dark:bg-white rounded-[2rem] p-5 shadow-xl text-white dark:text-slate-900 relative overflow-hidden">
         <div className="relative z-10 flex flex-col items-center text-center">
            <Scale size={20} className="mb-2 opacity-80" />
            <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Net Position</span>
            <span className={`text-3xl font-black mt-1 ${netPosition >= 0 ? 'text-emerald-400 dark:text-emerald-600' : 'text-rose-400 dark:text-rose-600'}`}>
               {netPosition >= 0 ? '+' : '-'}{settings.currency}{Math.abs(netPosition).toLocaleString()}
            </span>
            <span className="text-[9px] font-bold opacity-50 mt-1">
               {netPosition >= 0 ? 'You are owed overall' : 'You owe overall'}
            </span>
         </div>
      </div>

      {/* Header Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 dark:from-blue-500/20 dark:to-transparent p-4 rounded-3xl border border-blue-200/50 dark:border-blue-900/30 flex flex-col relative overflow-hidden group">
          <ArrowUpRight size={32} className="absolute -right-2 -top-2 opacity-10 text-blue-600 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-wider mb-1">To Receive</span>
          <span className="text-xl font-black text-slate-900 dark:text-white leading-none">{settings.currency}{stats.given.toLocaleString()}</span>
        </div>
        <div className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 dark:from-rose-500/20 dark:to-transparent p-4 rounded-3xl border border-rose-200/50 dark:border-rose-900/30 flex flex-col relative overflow-hidden group">
          <ArrowDownLeft size={32} className="absolute -right-2 -top-2 opacity-10 text-rose-600 group-hover:scale-110 transition-transform" />
          <span className="text-[10px] text-rose-600 dark:text-rose-400 font-black uppercase tracking-wider mb-1">To Pay</span>
          <span className="text-xl font-black text-rose-600 dark:text-rose-400 leading-none">{settings.currency}{stats.taken.toLocaleString()}</span>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="bg-white dark:bg-darkcard p-4 rounded-3xl border dark:border-slate-800/50 shadow-sm space-y-4">
        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('active')} 
            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-white' : 'text-slate-400'}`}
          >
            Outstanding
          </button>
          <button 
            onClick={() => setActiveTab('cleared')} 
            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${activeTab === 'cleared' ? 'bg-white dark:bg-slate-800 shadow-sm text-emerald-600 dark:text-white' : 'text-slate-400'}`}
          >
            Settled
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <input 
            type="text" 
            placeholder="Search accounts..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border-none rounded-xl text-xs font-bold outline-none dark:text-white"
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {['all', 'weekly', 'monthly', 'year', 'custom'].map(f => (
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

      {/* Loan List */}
      <div className="space-y-3">
        {filteredLoans.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-darkcard rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
            <HandCoins size={24} className="mx-auto text-slate-200 dark:text-slate-800 mb-2" />
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">No matching records</p>
          </div>
        ) : (
          filteredLoans.map(loan => {
            const paid = loan.payments.reduce((acc, p) => acc + p.amount, 0);
            const remaining = Math.max(0, loan.amount - paid);
            const progress = Math.min(100, (paid / loan.amount) * 100);
            const isExpanded = expandedLoanId === loan.id;
            const isOfficial = loan.category === 'official';

            // Check if payment is due today (simple visual check)
            const today = new Date();
            const loanDate = new Date(loan.date);
            let isDueToday = false;
            if (loan.status === 'active' && isOfficial) {
                if (loan.paymentFrequency === 'monthly' && today.getDate() === loanDate.getDate()) isDueToday = true;
                else if (loan.paymentFrequency === 'weekly' && today.getDay() === loanDate.getDay()) isDueToday = true;
            }

            return (
              <div 
                key={loan.id} 
                className={`bg-white dark:bg-darkcard p-4 rounded-2xl shadow-sm border border-slate-50 dark:border-slate-800 flex flex-col gap-4 relative overflow-hidden ${isDueToday ? 'ring-2 ring-blue-500/20' : ''}`}
              >
                {/* Due Indicator */}
                {isDueToday && (
                    <div className="absolute top-0 right-0 bg-blue-600 text-white px-3 py-1 rounded-bl-xl shadow-lg">
                        <span className="text-[8px] font-black uppercase tracking-widest">Due Today</span>
                    </div>
                )}

                <div 
                  className="flex justify-between items-start cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner ${loan.type === 'given' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'bg-rose-50 dark:bg-rose-900/20 text-rose-500'}`}>
                      {isOfficial ? <Briefcase size={18} /> : <User size={18} />}
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-900 dark:text-white text-xs leading-none mb-1">{loan.name}</h4>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-wider">
                        {loan.type === 'given' ? 'Lent' : 'Borrowed'} • {new Date(loan.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-slate-900 dark:text-white leading-none">{settings.currency}{loan.amount.toLocaleString()}</span>
                    {isOfficial ? (
                      <p className="text-[8px] text-blue-600 font-bold mt-1 uppercase tracking-tighter bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded-md inline-block">
                        {loan.interest}% Int. • {loan.paymentFrequency}
                      </p>
                    ) : (
                      <p className="text-[8px] text-slate-400 font-bold mt-1 uppercase tracking-tighter">
                        Friend / Family
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-[8px] font-black uppercase tracking-wider px-0.5">
                    <span className="text-slate-300">Principal Repayment</span>
                    <span className="text-blue-600 dark:text-blue-400">{settings.currency}{remaining.toLocaleString()} left</span>
                  </div>
                  <div className="h-2 w-full bg-slate-50 dark:bg-slate-900 rounded-full border dark:border-slate-800 overflow-hidden relative">
                    <div className="h-full bg-blue-600 rounded-full transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between border-b dark:border-slate-800 pb-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">History</span>
                      <button onClick={() => setPayingLoanId(loan.id)} className="text-[9px] font-black text-blue-600 uppercase">Add Payment</button>
                    </div>
                    {isOfficial && loan.tenure && (
                      <div className="flex gap-2 mb-2">
                         <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border dark:border-slate-800">
                            <Clock size={10} className="text-slate-400" />
                            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300">{loan.tenure} Months</span>
                         </div>
                         <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900 px-3 py-1.5 rounded-lg border dark:border-slate-800">
                            <Repeat size={10} className="text-slate-400" />
                            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 capitalize">{loan.paymentFrequency}</span>
                         </div>
                      </div>
                    )}
                    {loan.payments.length === 0 ? (
                      <p className="text-center py-4 text-[9px] text-slate-400 font-black uppercase tracking-widest">No transactions</p>
                    ) : (
                      loan.payments.slice().reverse().map(p => (
                        <div key={p.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-900 rounded-lg group">
                          <span className="text-[9px] font-bold text-slate-500">{new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-slate-900 dark:text-white">+{settings.currency}{p.amount.toLocaleString()}</span>
                            <button 
                              onClick={() => confirmDeletePayment(loan.id, p.id)}
                              className="p-1 text-slate-300 hover:text-rose-500 rounded transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button 
                    onClick={() => openEdit(loan)}
                    className="flex-1 py-2 text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 rounded-xl border dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    Edit
                  </button>
                  {loan.status === 'active' && (
                    <button 
                      onClick={() => setPayingLoanId(loan.id)} 
                      className="flex-1 py-2 bg-blue-600 text-white text-[8px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/10"
                    >
                      Payment
                    </button>
                  )}
                  <button 
                    onClick={() => confirmDeleteLoan(loan.id)} 
                    className="p-2 bg-slate-50 dark:bg-slate-800 text-slate-300 hover:text-rose-500 rounded-xl"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <button 
        onClick={() => setIsFormOpen(true)} 
        className="fixed bottom-24 right-6 w-14 h-14 bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center z-40"
      >
        <Plus size={28} />
      </button>

      {/* Delete Confirmation Modal */}
      {deleteConfig && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-darkcard w-full max-w-sm rounded-[2rem] p-6 shadow-2xl border dark:border-slate-800 animate-in zoom-in-95">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 text-rose-500 rounded-full flex items-center justify-center mb-2">
                <AlertTriangle size={32} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  {deleteConfig.type === 'payment' ? 'Delete Payment?' : 'Delete Account?'}
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Permanently remove this {deleteConfig.type === 'payment' ? 'payment record' : 'vault entry'}. 
                  <br/><span className="opacity-70">This action cannot be undone.</span>
                </p>
              </div>
              <div className="flex gap-3 w-full mt-2">
                <button onClick={() => setDeleteConfig(null)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider">Cancel</button>
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
                <h2 className="text-lg font-black text-slate-900 dark:text-white">{editId ? 'Update Loan' : 'New Loan'}</h2>
                <p className="text-[9px] text-blue-600 font-black uppercase">Vault Entry</p>
              </div>
              <button onClick={closeForm} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            
            <form onSubmit={handleSaveLoan} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
              
              {/* Direction Toggle */}
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button type="button" onClick={() => setType('given')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${type === 'given' ? 'bg-white dark:bg-slate-800 shadow-sm text-blue-600' : 'text-slate-400'}`}>Lent (Given)</button>
                <button type="button" onClick={() => setType('taken')} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${type === 'taken' ? 'bg-white dark:bg-slate-800 shadow-sm text-rose-500' : 'text-slate-400'}`}>Borrowed (Taken)</button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Account Type</label>
                <div className="flex gap-2">
                   <button 
                      type="button"
                      onClick={() => setCategory('friend')}
                      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all ${category === 'friend' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                   >
                      <Users size={16} />
                      <span className="text-[9px] font-black uppercase">Friend/Family</span>
                   </button>
                   <button 
                      type="button"
                      onClick={() => setCategory('official')}
                      className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all ${category === 'official' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'border-slate-100 dark:border-slate-800 text-slate-400'}`}
                   >
                      <Briefcase size={16} />
                      <span className="text-[9px] font-black uppercase">Commercial</span>
                   </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">{category === 'friend' ? 'Friend Name' : 'Entity Name'}</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" placeholder="Identity..." />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Principal Amount</label>
                <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border dark:border-slate-800 group">
                  <span className="text-2xl font-black text-slate-300 dark:text-slate-700">{settings.currency}</span>
                  <input type="number" required value={amount} onChange={e => setAmount(e.target.value)} className="w-full text-2xl font-black bg-transparent outline-none dark:text-white" placeholder="0" />
                </div>
              </div>

              {category === 'official' && (
                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border dark:border-slate-800 space-y-3 animate-in slide-in-from-top-2">
                   <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Interest (%) / Month</label>
                       <input type="number" value={interest} onChange={e => setInterest(e.target.value)} className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" />
                     </div>
                     <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tenure (Months)</label>
                       <input type="number" value={tenure} onChange={e => setTenure(e.target.value)} className="w-full p-3 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" />
                     </div>
                   </div>
                   
                   {loanCalculations && (
                     <div className="bg-blue-600 rounded-xl p-3 text-white shadow-lg shadow-blue-500/20">
                        <div className="flex items-start gap-3">
                           <div className="p-2 bg-white/20 rounded-lg">
                              <Calculator size={16} className="text-white" />
                           </div>
                           <div className="flex-1">
                              <p className="text-[9px] font-bold opacity-80 uppercase tracking-wider mb-0.5">Estimated Monthly Pay</p>
                              <p className="text-xl font-black leading-none">{settings.currency}{loanCalculations.monthlyPayment.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                              <div className="mt-2 pt-2 border-t border-white/20 grid grid-cols-2 gap-2">
                                 <div>
                                    <p className="text-[8px] font-bold opacity-60 uppercase">Total Interest</p>
                                    <p className="text-xs font-bold">{settings.currency}{loanCalculations.totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-[8px] font-bold opacity-60 uppercase">Total Payable</p>
                                    <p className="text-xs font-bold">{settings.currency}{loanCalculations.totalPayable.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>
                   )}

                   <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Frequency</label>
                      <div className="flex bg-white dark:bg-slate-900 p-1 rounded-xl border dark:border-slate-800">
                        <button type="button" onClick={() => setPaymentFrequency('weekly')} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${paymentFrequency === 'weekly' ? 'bg-slate-100 dark:bg-slate-800 text-blue-600' : 'text-slate-400'}`}>Weekly</button>
                        <button type="button" onClick={() => setPaymentFrequency('monthly')} className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${paymentFrequency === 'monthly' ? 'bg-slate-100 dark:bg-slate-800 text-blue-600' : 'text-slate-400'}`}>Monthly</button>
                      </div>
                   </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border dark:border-slate-800 font-bold text-xs dark:text-white outline-none" />
              </div>

              <button type="submit" className="w-full py-4 bg-blue-600 text-white font-black rounded-xl shadow-lg shadow-blue-500/20 text-sm active:scale-95 transition-all uppercase tracking-widest mt-2">
                {editId ? 'Update Loan' : 'Commit Loan'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {payingLoanId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-2xl animate-in fade-in transition-all">
          <div className="bg-white dark:bg-darkcard w-full max-w-sm rounded-[2rem] p-8 shadow-2xl border dark:border-slate-800">
            <h3 className="text-xl font-black mb-6 text-slate-900 dark:text-white tracking-tight">Post Payment</h3>
            <div className="mb-8 space-y-3">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-wider ml-1">Amount</label>
              <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl group">
                <span className="text-2xl font-black text-slate-300 group-focus-within:text-blue-600 transition-colors">{settings.currency}</span>
                <input 
                  type="number" 
                  value={paymentAmount} 
                  onChange={e => setPaymentAmount(e.target.value)} 
                  autoFocus 
                  className="w-full text-2xl font-black bg-transparent border-none focus:ring-0 p-0 dark:text-white outline-none" 
                  placeholder="0" 
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPayingLoanId(null)} className="flex-1 py-4 bg-slate-50 dark:bg-slate-800 rounded-xl font-black text-[9px] text-slate-400 uppercase tracking-widest">Back</button>
              <button onClick={() => addPayment(payingLoanId)} className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black text-[9px] uppercase tracking-widest">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoansView;
