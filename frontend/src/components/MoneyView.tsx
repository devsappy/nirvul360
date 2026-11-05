'use client';

import React, { useState } from 'react';
import { CashAccount } from '@/types';
import { formatTaka, api } from '@/lib/api';
import { PlusIcon, InfoIcon } from './icons';

interface MoneyViewProps {
  cashAccounts?: CashAccount[];
  entries?: any[];
  onRefresh: () => void;
  onOpenExpenseModal: () => void;
}

export function MoneyView({
  cashAccounts = [],
  entries = [],
  onRefresh,
  onOpenExpenseModal,
}: MoneyViewProps) {
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawNote, setWithdrawNote] = useState('');
  const [saving, setSaving] = useState(false);

  const safeCashAccounts = Array.isArray(cashAccounts) ? cashAccounts : [];
  const safeEntries = Array.isArray(entries) ? entries : [];

  const totalCash = safeCashAccounts.reduce((acc, c) => acc + (c.balance || 0), 0);

  const handleWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawAmount);
    if (isNaN(amt) || amt <= 0) return;

    setSaving(true);
    try {
      await api.post('/api/withdrawals', {
        amount: amt,
        date: new Date().toISOString().slice(0, 10),
        note: withdrawNote || 'Owner personal withdrawal',
      });
      setWithdrawModalOpen(false);
      setWithdrawAmount('');
      setWithdrawNote('');
      onRefresh();
    } catch (err: any) {
      alert(`Error recording withdrawal: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Top Cards: Cash Positions */}
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-6 shadow-2xs flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5EAE7] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#025033] tracking-tight">Money &amp; Cash Accounts</h2>
            <p className="text-xs text-[#3A8067] font-medium">
              Verified physical cash, bank, and mobile wallet liquidity. Profit and cash are never conflated.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setWithdrawModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#FAFCF9] border border-[#E5EAE7] hover:bg-[#E6F7EF] text-[#025033] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs"
            >
              <span>Owner Withdrawal</span>
            </button>
            <button
              onClick={onOpenExpenseModal}
              className="flex items-center gap-1.5 bg-[#025033] text-[#FFFFFF] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs hover:bg-[#05572F]"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>+ Record Expense</span>
            </button>
          </div>
        </div>

        {/* Account Tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {safeCashAccounts.map((acct) => (
            <div
              key={acct.id}
              className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-4 flex flex-col justify-between min-h-[110px]"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#025033]">{acct.name}</span>
                <span className="text-[10px] font-bold uppercase text-[#3A8067]">{acct.kind}</span>
              </div>
              <div className="text-xl font-black text-[#025033] font-mono mt-2">
                {formatTaka(acct.balance)}
              </div>
              <div className="text-[10px] text-[#3A8067] mt-auto pt-2 border-t border-[#E5EAE7]">
                {acct.is_default ? 'Default payout account' : 'Secondary wallet'}
              </div>
            </div>
          ))}

          {/* Total Liquid Cash Box */}
          <div className="bg-[#025033] text-[#FFFFFF] rounded-xl p-4 flex flex-col justify-between min-h-[110px] border border-[#00432C]">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#CAE4D8]">Total Available Cash</span>
              <span className="w-2 h-2 rounded-full bg-[#CAE4D8]" />
            </div>
            <div className="text-2xl font-black text-[#FFFFFF] font-mono mt-2">
              {formatTaka(totalCash)}
            </div>
            <div className="text-[10px] text-[#CAE4D8] mt-auto pt-2 border-t border-[#05572F]">
              Double-entry verified balance
            </div>
          </div>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-6 shadow-2xs flex flex-col gap-4">
        <h3 className="text-sm font-bold text-[#025033] tracking-tight">Recent Ledger Journals</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase tracking-wider text-[10px]">
                <th className="pb-3 pl-2">Journal #</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Transaction Kind</th>
                <th className="pb-3">Memo</th>
                <th className="pb-3">Source</th>
                <th className="pb-3 text-right pr-2">Amount (BDT)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {safeEntries.slice(0, 8).map((j: any) => (
                <tr key={j.id} className="hover:bg-[#E6F7EF]/40 transition">
                  <td className="py-3 pl-2 font-mono font-bold text-[#3A8067]">#{j.id}</td>
                  <td className="py-3 text-[#3A8067]">{j.entry_date}</td>
                  <td className="py-3 font-semibold text-[#025033] capitalize">
                    {j.kind?.replace('_', ' ')}
                  </td>
                  <td className="py-3 text-[#3A8067] max-w-xs truncate">{j.memo || '—'}</td>
                  <td className="py-3">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                      {j.source}
                    </span>
                  </td>
                  <td className="py-3 font-mono font-bold text-right pr-2 text-[#025033]">
                    {formatTaka(j.amount || j.orig_amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Owner Withdrawal Modal */}
      {withdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-2xs p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4">
            <h3 className="text-sm font-bold text-[#025033]">Record Owner Withdrawal</h3>
            <div className="p-3 bg-[#E6F7EF] rounded-xl border border-[#CAE4D8] text-xs text-[#025033] leading-tight flex items-start gap-2">
              <InfoIcon className="w-4 h-4 text-[#025033] shrink-0 mt-0.5" />
              <span>
                <strong>Non-negotiable Rule 9:</strong> Owner withdrawals reduce cash assets, but NEVER touch business profit.
              </span>
            </div>
            <form onSubmit={handleWithdrawal} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Amount in Taka (৳)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 25000"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Note (Optional)</label>
                <input
                  type="text"
                  placeholder="Personal withdrawal for family expenses"
                  value={withdrawNote}
                  onChange={(e) => setWithdrawNote(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setWithdrawModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-[#3A8067] hover:text-[#025033]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 bg-[#025033] text-[#FFFFFF] rounded-xl text-xs font-bold hover:bg-[#05572F] transition shadow-xs"
                >
                  {saving ? 'Posting...' : 'Record Withdrawal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
