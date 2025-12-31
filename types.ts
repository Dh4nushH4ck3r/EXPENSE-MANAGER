
export type TransactionType = 'expense' | 'income';

export interface Expense {
  id: string;
  type: TransactionType;
  amount: number;
  category: string;
  subCategory: string;
  date: string;
  notes: string;
  linkedToDelivery: boolean;
  litres?: number; // Only for fuel expenses
  recurring?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    lastProcessed: string;
  };
}

export interface LoanPayment {
  id: string;
  amount: number;
  date: string;
}

export interface Loan {
  id: string;
  name: string;
  amount: number;
  type: 'given' | 'taken';
  category?: 'friend' | 'official'; // New field: friend = no interest, official = interest
  interest: number;
  tenure: number | null; // Months
  paymentFrequency?: 'weekly' | 'monthly' | null; // New field
  payments: LoanPayment[];
  date: string;
  status: 'active' | 'cleared';
}

export interface DeliveryWork {
  id: string;
  date: string;
  cash: number;
  online: number;
  kmDriven: number;
  otherExpenses: number;
  ledgerId?: string; // Links to an Expense ID if transferred
}

export interface AppSettings {
  capacity: number;
  currentFuel: number;
  mileage: number;
  petrolRate: number;
  currency: string;
  theme: 'light' | 'dark' | 'system';
}

export const CATEGORIES: Record<string, { icon: string; subs: string[]; type: 'expense' | 'income' }> = {
  Transport: { icon: '🚗', subs: ['Fuel ⛽', 'Tolls 🛣', 'Parking 🅿', 'Maintenance 🔧'], type: 'expense' },
  Food: { icon: '🍽', subs: ['Groceries 🛒', 'Dining Out 🍔', 'Snacks 🍪', 'Tea / Coffee ☕'], type: 'expense' },
  Bills: { icon: '📄', subs: ['Electricity 💡', 'Mobile 📱', 'Internet 🌐', 'Gas 🔥'], type: 'expense' },
  Income: { icon: '💰', subs: ['Salary 💵', 'Refund 🔙', 'Reimbursement 🎫', 'Bonus 🎁', 'Misc Income 🔹'], type: 'income' },
  Others: { icon: '📦', subs: ['Misc 🔹', 'Shopping 🛍', 'Health 🏥'], type: 'expense' }
};
