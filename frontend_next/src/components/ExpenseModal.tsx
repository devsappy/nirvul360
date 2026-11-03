'use client';

import React, { useState } from 'react';
import { CloseIcon, PlusIcon } from './icons';
import { api } from '@/lib/api';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function ExpenseModal({ isOpen, onClose, onSuccess }: ExpenseModalProps) {
  const [head, setHead] = useState('packaging');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/api/expenses', {
        head,
        amount: val,
        date,
        note: note || 'Offline expense recorded',
      });
      onSuccess(`Successfully recorded ৳${val} for ${head}!`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record expense');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-[#FAF8F5]">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-stone-900">Record Offline Expense</h2>
            <p className="text-xs text-stone-500">Allowed for Accountants &amp; Agency Owners</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Expense Category (Head)</label>
            <select
              value={head}
              onChange={(e) => setHead(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            >
              <option value="packaging">Packaging &amp; Poly Bags</option>
              <option value="salary">Staff Salary &amp; Wages</option>
              <option value="rent">Office / Showroom Rent</option>
              <option value="utilities">Utilities &amp; Electric Bills</option>
              <option value="transport">Van Freight &amp; Transport</option>
              <option value="software">Software &amp; Domain/Hosting</option>
              <option value="other_expense">Other Miscellaneous Expense</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Amount in Taka (৳)</label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Expense Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Memo / Note (Optional)</label>
            <input
              type="text"
              placeholder="e.g. 100 poly bags purchased from Chawkbazar"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-stone-900 text-white hover:bg-black font-bold text-xs py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>{loading ? 'Posting Journal...' : 'Post Balanced Expense Entry'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
