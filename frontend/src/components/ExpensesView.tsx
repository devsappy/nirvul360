'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiExpenses, formatTaka } from '@/lib/api';
import { ExpensesSummaryResponse, RecurringExpensesResponse, ExpenseEntryItem } from '@/types';

interface ExpensesViewProps {
  onNavigate?: (tab: string) => void;
  onOpenAddExpenseModal?: () => void;
}

export function ExpensesView({ onNavigate, onOpenAddExpenseModal }: ExpensesViewProps) {
  const [period, setPeriod] = useState<'this_month' | 'quarter' | 'year'>('this_month');
  const [summary, setSummary] = useState<ExpensesSummaryResponse | null>(null);
  const [recurring, setRecurring] = useState<RecurringExpensesResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recurringModalOpen, setRecurringModalOpen] = useState(false);

  // Add Expense inline form state
  const [formHead, setFormHead] = useState('packaging');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formDescription, setFormDescription] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const loadData = React.useCallback(async () => {
    try {
      const [sumRes, recRes] = await Promise.all([
        apiExpenses.getSummary(period),
        apiExpenses.getRecurring(),
      ]);
      setSummary(sumRes);
      setRecurring(recRes);
    } catch (err) {
      console.error('Failed to load expenses data', err);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formAmount);
    if (!amountNum || amountNum <= 0) return;

    setIsSubmitting(true);
    setFormSuccess('');
    try {
      if (formHead === 'owner_withdrawal') {
        await apiExpenses.createWithdrawal({
          amount: amountNum,
          date: formDate,
          note: formDescription,
        });
      } else {
        await apiExpenses.createExpense({
          head: formHead,
          amount: amountNum,
          date: formDate,
          note: formDescription,
        });
      }
      setFormAmount('');
      setFormDescription('');
      setFormSuccess('Entry recorded in ledger.');
      setTimeout(() => setFormSuccess(''), 3000);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  };

  const scrollToForm = () => {
    if (onOpenAddExpenseModal) {
      onOpenAddExpenseModal();
    } else {
      formRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Filtered recent entries
  const allEntries: ExpenseEntryItem[] = summary?.recent_entries || [];
  const filteredEntries = allEntries.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.description?.toLowerCase().includes(q) ||
      item.head?.toLowerCase().includes(q) ||
      item.source_label?.toLowerCase().includes(q) ||
      item.date?.includes(q)
    );
  });

  const details = summary?.details || {};
  const courier = details.courier || { total_poisha: 0 };
  const advertising = details.advertising || { total_poisha: 0 };
  const packaging = details.packaging || { total_poisha: 0 };
  const rent = details.rent || { total_poisha: 0 };
  const salary = details.salary || { total_poisha: 0 };
  const internet = details.internet || details.utilities || { total_poisha: 0 };

  const metaSyncDate = summary?.sync_status?.meta_last_synced_at || 'Recently';
  const waLastDate = summary?.sync_status?.whatsapp_last_entry_at || 'None';
  const totalOperatingPoisha = summary?.total_operating_expenses_poisha || 0;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Expenses</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatTaka(totalOperatingPoisha)}{summary?.from_date && summary?.to_date ? ` for ${summary.from_date}–${summary.to_date}` : ''} · Meta synced {metaSyncDate} · last WhatsApp entry {waLastDate}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Segmented Period Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setPeriod('this_month')}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === 'this_month' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              This month
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === 'quarter' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Quarter
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1.5 rounded-lg transition ${
                period === 'year' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              Year
            </button>
          </div>

          <button
            onClick={() => setRecurringModalOpen(true)}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Expense heads
          </button>
          <button
            onClick={scrollToForm}
            className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
          >
            + Add expense
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (67% width on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Expense Heads This Month Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">Expense heads this month</span>
                <span className="text-xs text-slate-500">
                  {summary?.from_date && summary?.to_date ? `${summary.from_date}–${summary.to_date}` : 'This month'} · everything below sits between gross profit and net profit
                </span>
              </div>
              <span className="text-lg font-bold text-slate-900">
                {formatTaka(totalOperatingPoisha)}
              </span>
            </div>

            {/* 6 Heads Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {/* 1. Courier charges */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Courier charges</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(courier.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {courier.subtext || (
                    `Delivery ${formatTaka(courier.delivery_poisha || 0)} · COD ${formatTaka(courier.cod_poisha || 0)} · returns ${formatTaka(courier.returns_poisha || 0)}`
                  )}
                </span>
              </div>

              {/* 2. Advertising */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Advertising</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(advertising.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {advertising.orig_currency ? (
                    `$${advertising.orig_amount?.toFixed(2)} @ ${advertising.fx_rate}${advertising.fx_rate_date ? ` · rate of ${advertising.fx_rate_date}` : ''}`
                  ) : (
                    advertising.subtext || 'Ad spend campaigns'
                  )}
                </span>
              </div>

              {/* 3. Packaging */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Packaging</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(packaging.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {packaging.entry_count ? (
                    `${packaging.entry_count} entries${packaging.whatsapp_count ? `, ${packaging.whatsapp_count} confirmed on WhatsApp` : ''}`
                  ) : (
                    'Poly bags and boxes'
                  )}
                </span>
              </div>

              {/* 4. Rent */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Rent</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(rent.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {rent.subtext || (rent.total_poisha > 0 ? 'Posted, recurring' : 'No entries')}
                </span>
              </div>

              {/* 5. Salary */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Salary</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(salary.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {salary.subtext || (salary.total_poisha > 0 ? 'Posted, recurring' : 'No entries')}
                </span>
              </div>

              {/* 6. Internet */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-[#FAFCF9] flex flex-col justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Internet</span>
                <span className="text-base font-bold text-slate-900">
                  {formatTaka(internet.total_poisha)}
                </span>
                <span className="text-[11px] text-slate-500 leading-tight">
                  {internet.subtext || (internet.total_poisha > 0 ? 'Posted, recurring' : 'No entries')}
                </span>
              </div>
            </div>
          </div>

          {/* Recent Entries Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-900">Recent entries</span>
                <span className="text-xs text-slate-500">Every row carries the source it came from</span>
              </div>
              <div className="relative w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search entries"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F] placeholder-slate-400"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 font-semibold text-[11px]">
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">HEAD</th>
                    <th className="py-2.5 px-3">DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-right">AMOUNT</th>
                    <th className="py-2.5 px-3 text-right">SOURCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No entries recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((row) => {
                      const isWithdrawal = row.is_owner_withdrawal || row.head === 'owner_drawings' || row.head === 'withdrawal';
                      return (
                        <tr key={row.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{row.date}</td>
                          <td className="py-3 px-3 font-medium text-slate-800 capitalize whitespace-nowrap">
                            {row.head_label || row.head?.replace('_', ' ')}
                          </td>
                          <td className="py-3 px-3 text-slate-600 max-w-xs">
                            <div>{row.description || '—'}</div>
                            {isWithdrawal && (
                              <span className="inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                                Not an expense
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                            {formatTaka(row.amount_poisha)}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {renderSourceBadge(row.source, row.confirmed_by || row.source_label)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer reconciliation footnote */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-500 gap-2">
              <span className="leading-relaxed">
                Expense total {formatTaka(totalOperatingPoisha)}. The owner withdrawal above is listed for your cash record and is deliberately left out of that total.
              </span>
              <span className="font-semibold text-slate-400 shrink-0">
                {filteredEntries.length} of {allEntries.length} entries
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (33% width on desktop) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Card 1: Recurring expenses */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Recurring expenses</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {recurring?.active_count ?? 0} active
              </span>
            </div>
            <p className="text-xs text-slate-500">Posts automatically each month</p>

            <div className="overflow-x-auto mt-1">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                    <th className="py-1.5 px-2">HEAD</th>
                    <th className="py-1.5 px-2">POSTS ON</th>
                    <th className="py-1.5 px-2 text-right">AMOUNT</th>
                    <th className="py-1.5 px-2 text-right">NEXT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {(recurring?.items && recurring.items.length > 0) ? (
                    recurring.items.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-2 font-medium text-slate-800 capitalize">{r.head}</td>
                        <td className="py-2.5 px-2 text-slate-500">{r.posts_on_day}th</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{formatTaka(r.amount_poisha)}</td>
                        <td className="py-2.5 px-2 text-right text-slate-400">{r.next_date}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        No active recurring overheads.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500 mt-1">
              <span className="leading-tight">
                {formatTaka(recurring?.monthly_total_poisha ?? 0)} a month in total. Change the amount and the new figure applies from the next posting, not backwards.
              </span>
              <button
                onClick={() => setRecurringModalOpen(true)}
                className="text-xs font-semibold text-[#062E1F] hover:underline ml-2 shrink-0"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Card 2: Owner withdrawals */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900">Owner withdrawals</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                Not an expense
              </span>
            </div>

            <div className="flex flex-col gap-1 py-1">
              <span className="text-xs text-slate-500">Taken this month</span>
              <span className="text-xl font-bold text-slate-900">
                {formatTaka(summary?.owner_withdrawals?.taken_this_month_poisha || 0)}
              </span>
            </div>

            {/* List of withdrawals */}
            <div className="flex flex-col gap-2 pt-1 border-t border-slate-100 text-xs">
              {(summary?.owner_withdrawals?.items && summary.owner_withdrawals.items.length > 0) ? (
                summary.owner_withdrawals.items.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-slate-600 py-1">
                    <span>{w.date} · {w.cash_account_name || 'cash'}</span>
                    <span className="font-semibold text-slate-900">{formatTaka(w.amount_poisha)}</span>
                  </div>
                ))
              ) : (
                <div className="text-slate-400 text-xs py-1">No withdrawals taken this month.</div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/60 text-[11px] text-amber-900 leading-relaxed mt-1">
              {summary?.owner_withdrawals?.educational_note ||
                'This reduces business cash. It does not touch net profit, because money you take out of the business is not a cost of running it.'}
            </div>
          </div>

          {/* Card 3: Add an expense form */}
          <div ref={formRef} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">Add an expense</span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('whatsapp')}
                  className="text-xs font-semibold text-[#062E1F] hover:underline"
                >
                  Or send it on WhatsApp
                </button>
              )}
            </div>

            {formSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                ✓ {formSuccess}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600">Head</label>
                <select
                  value={formHead}
                  onChange={(e) => setFormHead(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                >
                  <option value="packaging">Packaging & bags</option>
                  <option value="courier">Courier charges</option>
                  <option value="advertising">Advertising & boost</option>
                  <option value="salary">Salary & wages</option>
                  <option value="rent">Shop / office rent</option>
                  <option value="utilities">Internet & bills</option>
                  <option value="software">Software & domains</option>
                  <option value="transport">Transport</option>
                  <option value="other_expense">Other expense</option>
                  <option value="owner_withdrawal">Owner withdrawal (non-expense)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Amount (৳)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="500"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Poly bags 500 pcs"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#062E1F] hover:bg-[#0B3B28] text-white py-2.5 rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50 mt-1"
              >
                {isSubmitting ? 'Posting to ledger...' : 'Save entry'}
              </button>

              <span className="text-[10px] text-slate-400 text-center leading-tight">
                Recorded entries are immediately locked into the double-entry ledger with provenance tags.
              </span>
            </form>
          </div>
        </div>
      </div>

      {/* Recurring Overhead Modal */}
      {recurringModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">Recurring overhead heads</h3>
                <p className="text-xs text-slate-500">Fixed costs posted automatically each month</p>
              </div>
              <button
                onClick={() => setRecurringModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2.5 max-h-[360px] overflow-y-auto">
              {recurring?.items?.map((item) => (
                <div
                  key={item.id || item.head}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900 capitalize">{item.name || item.title || item.head}</span>
                    <span className="text-[11px] text-slate-500">Day {item.posts_on_day} of month · Next: {item.next_date}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-900">{formatTaka(item.amount_poisha)}/mo</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setRecurringModalOpen(false)}
                className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderSourceBadge(source: string, label?: string) {
  const s = source?.toLowerCase() || '';
  if (s.includes('whatsapp')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
        {label || 'WhatsApp · confirmed'}
      </span>
    );
  }
  if (s.includes('meta')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAFCF9] text-[#3A8067] border border-slate-200">
        {label || 'Meta API'}
      </span>
    );
  }
  if (s.includes('recurring') || s.includes('auto')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#E6F7EF] text-[#3A8067] border border-[#CAE4D8]">
        {label || 'Auto · recurring'}
      </span>
    );
  }
  if (s.includes('courier')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAFCF9] text-slate-600 border border-slate-200">
        {label || 'Courier API · settlements'}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#FAFCF9] text-[#025033] border border-slate-200">
      {label || 'Manual'}
    </span>
  );
}
