'use client';

import React, { useState } from 'react';
import { formatTaka, api } from '@/lib/api';
import { PlusIcon } from './icons';

interface JournalEntry {
  id: number;
  entry_date: string;
  kind: string;
  memo: string;
  source: string;
  amount?: number;
  lines?: Array<{ account: string; amount: number }>;
}

interface MiscExpenseCardProps {
  entries?: JournalEntry[];
  onRefresh: () => void;
  onSuccess: (msg: string) => void;
}

/**
 * Quick recorder for miscellaneous / other expenses, right on the dashboard.
 * Posts a balanced double-entry journal (other_expense debit / cash credit) to
 * /api/expenses, so every taka is tracked in the database ledger.
 */
export function MiscExpenseCard({ entries = [], onRefresh, onSuccess }: MiscExpenseCardProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recent misc/other expense journals (recent ledger entries filtered to other_expense,
  // excluding reversal journals which already net out in the totals)
  const miscEntries = (Array.isArray(entries) ? entries : [])
    .filter((j) => !String(j.kind || '').startsWith('reversal_'))
    .filter((j) => (j.lines || []).some((l) => l.account === 'other_expense'))
    .slice(0, 5);

  const totalMisc = miscEntries.reduce(
    (acc, j) => {
      const s = (j.lines || []).filter((l) => l.account === 'other_expense').reduce((sum, l) => sum + (l.amount || 0), 0);
      return s > 0 ? acc + s : acc; // expense debits are positive, accidental credits ignored
    },
    0
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/expenses', {
        head: 'other_expense',
        amount: val,
        date,
        note: note || 'Miscellaneous expense',
      });
      setAmount('');
      setNote('');
      onSuccess(`Miscellaneous expense of ৳${val.toLocaleString('en-BD')} recorded in the ledger`);
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Failed to record expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xs flex flex-col gap-4 sm:gap-5 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5EAE7] pb-3 sm:pb-3.5">
        <div>
          <h3 className="text-base font-bold text-[#025033] tracking-tight">Record Miscellaneous Expense</h3>
          <p className="text-xs sm:text-sm text-[#3A8067] font-medium mt-0.5">
            Small spends outside the standard heads — saved to the ledger instantly.
          </p>
        </div>
        {totalMisc > 0 && (
          <span className="text-xs font-bold text-[#3A8067] bg-[#FAFCF9] px-3 py-1 rounded-full border border-[#E5EAE7] whitespace-nowrap self-start sm:self-auto">
            Recent: {formatTaka(totalMisc)}
          </span>
        )}
      </div>

      {/* Quick form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {error && (
          <div className="p-3 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-sm rounded-xl">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold uppercase text-[#3A8067] mb-1.5 tracking-wider">Amount (৳)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 250"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 py-2.5 text-sm font-mono text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition shadow-2xs"
            />
          </div>
          <div>
            <label className="block text-xs font-bold uppercase text-[#3A8067] mb-1.5 tracking-wider">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 py-2.5 text-sm text-[#025033] focus:outline-none focus:border-[#025033] transition shadow-2xs"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-[#3A8067] mb-1.5 tracking-wider">What was it for?</label>
          <input
            type="text"
            placeholder="e.g. Snacks for delivery man, rickshaw fare, tape..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 py-2.5 text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition shadow-2xs"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] disabled:opacity-60 font-bold text-sm py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-2 mt-1"
        >
          <PlusIcon className="w-4 h-4" />
          <span>{saving ? 'Posting journal...' : 'Record Misc Expense'}</span>
        </button>
      </form>

      {/* Recent misc expenses */}
      <div className="flex flex-col gap-2 pt-1">
        <span className="text-xs font-bold uppercase tracking-wider text-[#3A8067]">Recent misc expenses</span>
        {miscEntries.length === 0 ? (
          <span className="text-sm text-[#3A8067] py-2">No miscellaneous expenses recorded yet</span>
        ) : (
          miscEntries.map((j) => {
            const amt = Math.max(0, (j.lines || []).filter((l) => l.account === 'other_expense').reduce((s, l) => s + (l.amount || 0), 0));
            return (
              <div key={j.id} className="flex items-center justify-between gap-2.5 py-2 px-3 rounded-xl hover:bg-[#E6F7EF]/40 transition">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-[#025033] truncate">{j.memo || 'Misc expense'}</span>
                  <span className="text-xs text-[#3A8067] mt-0.5">{j.entry_date}</span>
                </div>
                <span className="text-sm font-mono font-bold text-[#025033] shrink-0">-{formatTaka(amt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
