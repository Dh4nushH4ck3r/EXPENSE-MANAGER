
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { 
  CreditCard, 
  HandCoins, 
  Truck, 
  Settings as SettingsIcon, 
  Bell,
  BellRing,
  BellOff
} from 'lucide-react';
import { dbService } from './db';
import { AppSettings, Expense, Loan, DeliveryWork } from './types';

// Views
import ExpensesView from './views/ExpensesView';
import LoansView from './views/LoansView';
import DeliveryView from './views/DeliveryView';
import SettingsModal from './components/SettingsModal';

const DEFAULT_SETTINGS: AppSettings = {
  capacity: 5.5,
  currentFuel: 0, 
  mileage: 55,
  petrolRate: 101.42,
  currency: '₹',
  theme: 'system'
};

const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('app_settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // Theme Management
  useEffect(() => {
    const root = window.document.documentElement;
    const updateTheme = () => {
      const isDark = settings.theme === 'dark' || 
                    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    updateTheme();
    
    if (settings.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', updateTheme);
      return () => mediaQuery.removeEventListener('change', updateTheme);
    }
  }, [settings.theme]);

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    dbService.init().then(() => {
      setDbReady(true);
    });
  }, []);

  // Run checks once DB is ready and permissions are known/updated
  useEffect(() => {
    if (dbReady && notificationPermission === 'granted') {
        runSystemChecks(true); // silent mode = true (don't notify if everything is fine, only alerts)
    }
  }, [dbReady]);

  const sendNotification = (title: string, body: string) => {
    if (Notification.permission === 'granted') {
      // Check if serviceWorker is available for mobile support (optional enhancement) or standard API
      new Notification(title, {
        body,
        icon: '/favicon.ico', 
        badge: '/favicon.ico',
        tag: title // Prevent duplicate notifications of same type stacking
      });
    }
  };

  const runSystemChecks = async (onlyAlerts = false) => {
    let alertsFound = 0;

    // 1. Check Fuel Level
    const threshold = settings.capacity * 0.15;
    if (settings.currentFuel > 0 && settings.currentFuel < threshold) {
      sendNotification(
        'Low Fuel Warning', 
        `You have ${settings.currentFuel.toFixed(2)}L remaining. Time to refuel!`
      );
      alertsFound++;
    }

    // 2. Check Loan Due Dates
    const loans = await dbService.getAll<Loan>('loans');
    const activeLoans = loans.filter(l => l.status === 'active' && l.category === 'official');
    const today = new Date();
    
    let dueCount = 0;
    activeLoans.forEach(loan => {
      const loanDate = new Date(loan.date);
      let isDue = false;
      if (loan.paymentFrequency === 'monthly') {
        if (today.getDate() === loanDate.getDate()) isDue = true;
      } else if (loan.paymentFrequency === 'weekly') {
        if (today.getDay() === loanDate.getDay()) isDue = true;
      }
      if (isDue) dueCount++;
    });

    if (dueCount > 0) {
      sendNotification('Loan Payments Due', `You have ${dueCount} loan payments due today.`);
      alertsFound++;
    }

    // 3. Check Delivery Payouts (Weekend)
    const isWeekend = today.getDay() === 0 || today.getDay() === 6;
    if (isWeekend) {
      const sessions = await dbService.getAll<DeliveryWork>('delivery');
      const pendingSessions = sessions.filter(s => !s.ledgerId);
      const settlement = pendingSessions.reduce((acc, s) => acc + s.online, 0);
      
      if (settlement > 0) {
         sendNotification('Weekend Payout Alert', `You have ${settings.currency}${settlement.toLocaleString()} pending transfer to Ledger.`);
         alertsFound++;
      }
    }

    // 4. Process Recurring Expenses (Always runs, but only notifies on action)
    const expenses = await dbService.getAll<Expense>('expenses');
    const recurringOnes = expenses.filter(e => e.recurring);
    const todayStr = new Date().toISOString().split('T')[0];
    const dateObj = new Date(todayStr);
    
    let processedCount = 0;

    for (const exp of recurringOnes) {
      if (!exp.recurring) continue;
      
      let lastProcessed = new Date(exp.recurring.lastProcessed);
      let nextOccurrence = new Date(lastProcessed);
      let updated = false;

      while (true) {
        if (exp.recurring.frequency === 'daily') nextOccurrence.setDate(nextOccurrence.getDate() + 1);
        else if (exp.recurring.frequency === 'weekly') nextOccurrence.setDate(nextOccurrence.getDate() + 7);
        else if (exp.recurring.frequency === 'monthly') nextOccurrence.setMonth(nextOccurrence.getMonth() + 1);

        if (nextOccurrence <= dateObj) {
          const newExpDate = nextOccurrence.toISOString().split('T')[0];
          const newExp: Expense = {
            ...exp,
            id: crypto.randomUUID(),
            date: newExpDate,
            recurring: {
              ...exp.recurring,
              lastProcessed: newExpDate
            }
          };
          await dbService.put('expenses', newExp);
          lastProcessed = new Date(nextOccurrence);
          updated = true;
          processedCount++;
        } else {
          break;
        }
      }

      if (updated) {
        const updatedOriginal: Expense = {
          ...exp,
          recurring: {
            ...exp.recurring,
            lastProcessed: lastProcessed.toISOString().split('T')[0]
          }
        };
        await dbService.put('expenses', updatedOriginal);
      }
    }

    if (processedCount > 0) {
      sendNotification(
        'Recurring Expenses', 
        `Processed ${processedCount} recurring transactions today.`
      );
      alertsFound++;
    }

    // Feedback if manual check and no alerts
    if (!onlyAlerts && alertsFound === 0) {
        sendNotification('System Check', 'All systems operational. No pending alerts.');
    }
  };

  const handleBellClick = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support notifications.');
      return;
    }
    
    if (notificationPermission === 'granted') {
        // Run a manual check
        await runSystemChecks(false); // false = show "All systems OK" if nothing found
    } else if (notificationPermission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings to receive alerts.');
    } else {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
            sendNotification('ExpensePro', 'Notifications are now active!');
            await runSystemChecks(true);
        }
    }
  };

  useEffect(() => {
    localStorage.setItem('app_settings', JSON.stringify(settings));
  }, [settings]);

  if (!dbReady) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-blue-600 text-white dark:bg-slate-950">
        <div className="w-16 h-16 mb-6 bg-white rounded-2xl flex items-center justify-center animate-pulse shadow-2xl">
          <CreditCard className="text-blue-600 w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black tracking-tight">ExpensePro</h1>
        <p className="opacity-60 mt-2 text-sm font-medium">Powering up...</p>
      </div>
    );
  }

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col pb-20 dark:bg-darkbg selection:bg-blue-100 dark:selection:bg-blue-900">
        <header className="sticky top-0 z-40 bg-white/70 dark:bg-darkbg/70 backdrop-blur-xl border-b dark:border-slate-800/50 px-5 py-3 flex items-center justify-between transition-colors">
          <div className="flex flex-col">
            <h1 className="text-lg font-black text-slate-900 dark:text-white tracking-tight leading-none">ExpensePro</h1>
            <span className="text-[9px] text-blue-600 dark:text-blue-400 font-extrabold uppercase tracking-[0.1em] mt-1">Smart Manager</span>
          </div>
          <div className="flex gap-1 items-center">
            <button 
              onClick={handleBellClick}
              className={`p-2 rounded-xl transition-all relative active:scale-95 ${
                notificationPermission === 'granted' 
                  ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800' 
                  : notificationPermission === 'denied'
                    ? 'text-rose-400 bg-rose-50 dark:bg-rose-900/20'
                    : 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
              }`}
            >
              {notificationPermission === 'granted' ? <Bell size={18} /> : notificationPermission === 'denied' ? <BellOff size={18} /> : <BellRing size={18} />}
              {notificationPermission === 'default' && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white dark:border-darkbg animate-pulse"></span>
              )}
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all active:scale-95"
            >
              <SettingsIcon size={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-5 py-6 max-w-2xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<ExpensesView settings={settings} setSettings={setSettings} />} />
            <Route path="/loans" element={<LoansView settings={settings} />} />
            <Route path="/delivery" element={<DeliveryView settings={settings} setSettings={setSettings} />} />
          </Routes>
        </main>

        <nav className="fixed bottom-4 left-4 right-4 bg-white/90 dark:bg-darkcard/90 backdrop-blur-2xl border dark:border-slate-800/50 flex justify-around items-center h-16 rounded-3xl shadow-2xl dark:shadow-none z-50 transition-all">
          <NavLink to="/" icon={<CreditCard size={20} />} label="Ledger" />
          <NavLink to="/loans" icon={<HandCoins size={20} />} label="Vault" />
          <NavLink to="/delivery" icon={<Truck size={20} />} label="Transit" />
        </nav>

        {isSettingsOpen && (
          <SettingsModal 
            settings={settings} 
            setSettings={setSettings} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        )}
      </div>
    </HashRouter>
  );
};

const NavLink: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;
  
  return (
    <Link 
      to={to} 
      className={`flex flex-col items-center justify-center w-full h-full transition-all duration-300 relative rounded-2xl ${
        isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
      }`}
    >
      <div className={`mb-0.5 transition-transform duration-300 ${isActive ? 'scale-110 -translate-y-0.5' : 'scale-100'}`}>
        {icon}
      </div>
      <span className={`text-[9px] font-black uppercase tracking-wider transition-opacity ${isActive ? 'opacity-100' : 'opacity-40'}`}>{label}</span>
      {isActive && (
        <div className="absolute top-1 w-8 h-1 bg-blue-600 dark:bg-blue-400 rounded-full animate-in fade-in zoom-in duration-300"></div>
      )}
    </Link>
  );
};

export default App;
