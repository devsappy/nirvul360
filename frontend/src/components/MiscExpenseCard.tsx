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
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5EAE7] pb-3">
        <div>
          <h3 className="text-sm font-bold text-[#025033] tracking-tight">Record Miscellaneous Expense</h3>
          <p className="text-xs text-[#3A8067] font-medium">
            Small spends outside the standard heads — saved to the ledger instantly.
          </p>
        </div>
        {totalMisc > 0 && (
          <span className="text-[11px] font-bold text-[#3A8067] bg-[#FAFCF9] px-2.5 py-1 rounded-full border border-[#E5EAE7] whitespace-nowrap">
            Recent: {formatTaka(totalMisc)}
          </span>
        )}
      </div>

      {/* Quick form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {error && (
          <div className="p-2.5 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-xs rounded-xl">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#3A8067] mb-1">Amount (৳)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="e.g. 250"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-[#3A8067] mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033] transition"
            />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-[#3A8067] mb-1">What was it for?</label>
          <input
            type="text"
            placeholder="e.g. Snacks for delivery man, rickshaw fare, tape..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] disabled:opacity-60 font-bold text-xs py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
        >
          <PlusIcon className="w-3.5 h-3.5" />
          <span>{saving ? 'Posting journal...' : 'Record Misc Expense'}</span>
        </button>
      </form>

      {/* Recent misc expenses */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[#3A8067]">Recent misc expenses</span>
        {miscEntries.length === 0 ? (
          <span className="text-xs text-[#3A8067] py-2">No miscellaneous expenses recorded yet</span>
        ) : (
          miscEntries.map((j) => {
            const amt = Math.max(0, (j.lines || []).filter((l) => l.account === 'other_expense').reduce((s, l) => s + (l.amount || 0), 0));
            return (
              <div key={j.id} className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-xl hover:bg-[#E6F7EF]/40 transition">
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-[#025033] truncate">{j.memo || 'Misc expense'}</span>
                  <span className="text-[10px] text-[#3A8067]">{j.entry_date}</span>
                </div>
                <span className="text-xs font-mono font-bold text-[#025033] shrink-0">-{formatTaka(amt)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
