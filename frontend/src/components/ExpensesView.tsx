'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiExpenses } from '@/lib/api';
import { ExpensesSummaryResponse, RecurringExpensesResponse, ExpenseEntryItem, User } from '@/types';

interface ExpensesViewProps {
  currentUser?: User | null;
  onNavigate?: (tab: string) => void;
  onOpenAddExpenseModal?: () => void;
}

// Format number with commas
function formatNumber(num: number): string {
  if (isNaN(num)) return '0';
  return Math.round(num).toLocaleString('en-US');
}

// Formats "2026-11-05" -> "5 Nov"
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  // If already formatted like "1–6 Nov"
  if (dateStr.includes('–') || dateStr.includes('-') === false) return dateStr;
  try {
    const parts = dateStr.slice(0, 10).split('-');
    if (parts.length < 3) return dateStr;
    const day = parseInt(parts[2], 10);
    const mIdx = parseInt(parts[1], 10) - 1;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[mIdx] || ''}`;
  } catch {
    return dateStr;
  }
}

// Formats "2026-11-01" to "2026-11-06" -> "1–6 Nov 2026"
function formatDateRange(from?: string, to?: string): string {
  if (!from || !to) return 'This month';
  try {
    const fParts = from.slice(0, 10).split('-');
    const tParts = to.slice(0, 10).split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fDay = parseInt(fParts[2], 10);
    const tDay = parseInt(tParts[2], 10);
    const fMonth = months[parseInt(fParts[1], 10) - 1];
    const tMonth = months[parseInt(tParts[1], 10) - 1];
    const year = tParts[0];

    if (fParts[0] === tParts[0] && fParts[1] === tParts[1]) {
      if (fDay === tDay) return `${fDay} ${fMonth} ${year}`;
      return `${fDay}–${tDay} ${tMonth} ${year}`;
    }
    return `${fDay} ${fMonth} – ${tDay} ${tMonth} ${year}`;
  } catch {
    return `${from}–${to}`;
  }
}

// Formats "1" -> "1st of month", "3" -> "3rd of month"
function formatOrdinalDay(day: number): string {
  if (11 <= (day % 100) && (day % 100) <= 13) return `${day}th of month`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th';
  return `${day}${suffix} of month`;
}

// Formats "2026-12-01" -> "1 Dec"
function formatNextDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return formatShortDate(dateStr);
}

// Human-friendly head title
function formatHeadTitle(head: string): string {
  const map: Record<string, string> = {
    courier: 'Courier charges',
    courier_delivery: 'Courier charges',
    courier_cod_fee: 'Courier charges',
    courier_return_fee: 'Courier charges',
    ad_spend: 'Advertising',
    advertising: 'Advertising',
    packaging: 'Packaging',
    rent: 'Rent',
    salary: 'Salary',
    utilities: 'Internet',
    internet: 'Internet',
    software: 'Software & tools',
    transport: 'Transport',
    other_expense: 'Other expense',
    owner_drawings: 'Owner withdrawal',
    owner_withdrawal: 'Owner withdrawal',
  };
  return map[head] || head.replace(/_/g, ' ');
}

export function ExpensesView({ currentUser, onNavigate, onOpenAddExpenseModal }: ExpensesViewProps) {
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

  // Fixed Cost Prorated State (PDF Requirement 9)
  const [fixedCostMonthly, setFixedCostMonthly] = useState<number>(100000);
  const [customFxRate, setCustomFxRate] = useState<number>(122.50);

  // New recurring expense inline in modal
  const [newRecHead, setNewRecHead] = useState('rent');
  const [newRecAmount, setNewRecAmount] = useState('');
  const [newRecDay, setNewRecDay] = useState('1');
  const [isCreatingRec, setIsCreatingRec] = useState(false);

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

  const handleAddRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newRecAmount);
    if (!amt || amt <= 0) return;
    setIsCreatingRec(true);
    try {
      await apiExpenses.createRecurring({
        head: newRecHead,
        name: formatHeadTitle(newRecHead),
        amount: amt,
        amount_poisha: Math.round(amt * 100),
        amount_taka: amt,
        posts_on_day: parseInt(newRecDay, 10) || 1,
      } as any);
      setNewRecAmount('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create recurring expense');
    } finally {
      setIsCreatingRec(false);
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

  const details = summary?.details || (summary as any)?.category_details || {};
  const courier = details.courier || { total_poisha: 0 };
  const advertising = details.advertising || { total_poisha: 0 };
  const packaging = details.packaging || { total_poisha: 0 };
  const rent = details.rent || { total_poisha: 0 };
  const salary = details.salary || { total_poisha: 0 };
  const internet = details.internet || details.utilities || { total_poisha: 0 };

  const metaSyncDate = summary?.sync_status?.meta_last_synced_at || '—';
  const waLastDate = summary?.sync_status?.whatsapp_last_entry_at || '—';
  const totalOperatingPoisha = summary?.total_operating_expenses_poisha ?? 0;
  const dateRangeStr = formatDateRange(summary?.from_date, summary?.to_date);

  // Determine current user display name for manual attribution
  const currentUserName = currentUser?.name || 'Tamim Hossain';

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 font-sans antialiased text-[#111827]">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-[#E5EAE7]">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Expenses</h1>
          <p className="text-xs text-[#6B7280] mt-1 font-normal">
            ৳{formatNumber(totalOperatingPoisha / 100)} for {dateRangeStr} · Meta synced {metaSyncDate} · last WhatsApp entry {waLastDate}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {/* Segmented Period Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-white border border-[#E5EAE7] shadow-2xs gap-0.5">
            <button
              onClick={() => setPeriod('this_month')}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition ${
                period === 'this_month'
                  ? 'bg-[#025033] text-white font-medium shadow-xs'
                  : 'text-[#374151] hover:text-[#111827] font-medium'
              }`}
            >
              This month
            </button>
            <button
              onClick={() => setPeriod('quarter')}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition ${
                period === 'quarter'
                  ? 'bg-[#025033] text-white font-medium shadow-xs'
                  : 'text-[#374151] hover:text-[#111827] font-medium'
              }`}
            >
              Quarter
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3.5 py-1.5 rounded-lg text-xs transition ${
                period === 'year'
                  ? 'bg-[#025033] text-white font-medium shadow-xs'
                  : 'text-[#374151] hover:text-[#111827] font-medium'
              }`}
            >
              Year
            </button>
          </div>

          <button
            onClick={() => setRecurringModalOpen(true)}
            className="bg-white hover:bg-[#F9FAFB] border border-[#E5EAE7] text-[#111827] text-xs font-medium px-4 py-2 rounded-xl shadow-2xs transition"
          >
            Expense heads
          </button>
          <button
            onClick={scrollToForm}
            className="bg-[#025033] hover:bg-[#033F28] text-white text-xs font-medium px-4 py-2 rounded-xl shadow-2xs transition"
          >
            Add expense
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (68% width on desktop) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Card 1: Expense heads this month */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3F4F6]">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#111827]">Expense heads this month</span>
                <span className="text-xs text-[#6B7280] mt-0.5">
                  {dateRangeStr} · everything below sits between gross profit and net profit
                </span>
              </div>
              <span className="text-lg font-bold text-[#111827]">
                ৳{formatNumber(totalOperatingPoisha / 100)}
              </span>
            </div>

            {/* 6 Heads Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {/* 1. Fixed Cost (Prorated Daily - PDF Requirement 9) */}
              <div className="rounded-xl border border-[#CAE4D8] bg-[#E6F7EF] p-4 flex flex-col justify-between min-h-[110px] relative group">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#025033]">Fixed operating cost</span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#025033] text-white">
                    Prorated
                  </span>
                </div>
                <div className="my-1">
                  <div className="text-lg font-black text-[#025033] tracking-tight">
                    ৳{formatNumber(period === 'this_month' ? fixedCostMonthly : period === 'quarter' ? fixedCostMonthly * 3 : fixedCostMonthly * 12)}
                  </div>
                  <div className="text-[11px] font-bold text-[#3A8067]">
                    ৳{formatNumber(fixedCostMonthly / 30)} / day (৳{formatNumber(fixedCostMonthly)} / mo)
                  </div>
                </div>
                <span className="text-[10px] text-[#3A8067] leading-tight border-t border-[#CAE4D8] pt-1.5">
                  Divided over 30 days &amp; prorated to selected period
                </span>
              </div>

              {/* 2. Courier charges (Summarized from deductions & returns - PDF Requirement 9) */}
              <div className="rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] p-4 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827]">Courier charges</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">Auto-deducted</span>
                </div>
                <div className="my-1">
                  <div className="text-lg font-black text-[#111827] tracking-tight">
                    ৳{formatNumber(courier.total_poisha / 100)}
                  </div>
                  <div className="text-[11px] font-medium text-[#4B5563]">
                    Delivery: ৳{formatNumber((courier.delivery_poisha ?? 0) / 100)} · Return fees: ৳{formatNumber((courier.returns_poisha ?? 0) / 100)}
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] leading-tight border-t border-[#E5EAE7] pt-1.5">
                  COD fees: ৳{formatNumber((courier.cod_poisha ?? 0) / 100)} · Reconciled across Pathao &amp; Steadfast
                </span>
              </div>

              {/* 3. Advertising (Configurable USD to BDT - PDF Requirement 9) */}
              <div className="rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] p-4 flex flex-col justify-between min-h-[110px]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111827]">Advertising</span>
                  <div className="flex items-center gap-1 text-[10px] font-bold text-[#025033]">
                    <span>$1 = ৳</span>
                    <input
                      type="number"
                      step="0.5"
                      value={customFxRate}
                      onChange={(e) => setCustomFxRate(parseFloat(e.target.value) || 122.5)}
                      className="w-12 bg-white border border-[#CAE4D8] rounded px-1 text-center font-bold"
                    />
                  </div>
                </div>
                <div className="my-1">
                  <div className="text-lg font-black text-[#111827] tracking-tight">
                    ৳{formatNumber(advertising.total_poisha > 0 ? (advertising.total_poisha / 100) : (advertising.orig_amount ? advertising.orig_amount * customFxRate : 0))}
                  </div>
                  <div className="text-[11px] font-bold text-[#025033]">
                    ${((advertising.total_poisha / 100) / customFxRate).toFixed(2)} USD
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] leading-tight border-t border-[#E5EAE7] pt-1.5">
                  Auto-pulled from ad account converted at ৳{customFxRate}/$
                </span>
              </div>

              {/* 4. Packaging (Clearly shown - PDF Requirement 9) */}
              <div className="rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] p-4 flex flex-col justify-between min-h-[110px]">
                <span className="text-xs font-bold text-[#111827]">Packaging spend</span>
                <div className="my-1">
                  <div className="text-lg font-black text-[#111827] tracking-tight">
                    ৳{formatNumber(packaging.total_poisha / 100)}
                  </div>
                  <div className="text-[11px] text-[#6B7280]">
                    Poly bags, custom boxes &amp; tape
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] leading-tight border-t border-[#E5EAE7] pt-1.5">
                  {packaging.entry_count ? `${packaging.entry_count} batches recorded` : 'Direct fulfillment packaging'}
                </span>
              </div>

              {/* 5. Rent & Utilities */}
              <div className="rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] p-4 flex flex-col justify-between min-h-[110px]">
                <span className="text-xs font-bold text-[#111827]">Rent</span>
                <div className="my-1">
                  <div className="text-lg font-black text-[#111827] tracking-tight">
                    ৳{formatNumber(rent.total_poisha / 100)}
                  </div>
                  <div className="text-[11px] text-[#6B7280]">
                    {rent.subtext || (rent.total_poisha > 0 ? 'Posted 1 Nov, recurring' : 'Recurring overhead')}
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] leading-tight border-t border-[#E5EAE7] pt-1.5">
                  Studio &amp; warehouse lease
                </span>
              </div>

              {/* 6. Salary & Team */}
              <div className="rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] p-4 flex flex-col justify-between min-h-[110px]">
                <span className="text-xs font-bold text-[#111827]">Salary &amp; Staff</span>
                <div className="my-1">
                  <div className="text-lg font-black text-[#111827] tracking-tight">
                    ৳{formatNumber(salary.total_poisha / 100)}
                  </div>
                  <div className="text-[11px] text-[#6B7280]">
                    {salary.subtext || (salary.total_poisha > 0 ? 'Posted 1 Nov, recurring' : 'Monthly payroll')}
                  </div>
                </div>
                <span className="text-[10px] text-[#6B7280] leading-tight border-t border-[#E5EAE7] pt-1.5">
                  Operating workforce &amp; packaging team
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Recent entries */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#111827]">Recent entries</span>
                <span className="text-xs text-[#6B7280] mt-0.5">Every row carries the source it came from</span>
              </div>
              <div className="relative w-full sm:w-56">
                <input
                  type="text"
                  placeholder="Search entries"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs px-3 py-1.5 border border-[#E5EAE7] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#025033] placeholder-[#9CA3AF] text-[#111827]"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#F3F4F6] text-[#6B7280] font-semibold text-[10px] tracking-wider">
                    <th className="py-2.5 px-3">DATE</th>
                    <th className="py-2.5 px-3">HEAD</th>
                    <th className="py-2.5 px-3">DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-right">AMOUNT</th>
                    <th className="py-2.5 px-3 text-right">SOURCE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] font-normal">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#9CA3AF]">
                        No entries recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((row) => {
                      const isWithdrawal = row.is_owner_withdrawal || row.head === 'owner_drawings' || row.head === 'withdrawal';
                      return (
                        <tr key={row.id} className="hover:bg-[#FAFCF9] transition">
                          <td className="py-3 px-3 text-[#374151] whitespace-nowrap">
                            {formatShortDate(row.date)}
                          </td>
                          <td className="py-3 px-3 font-semibold text-[#111827] capitalize whitespace-nowrap">
                            {row.head_label || formatHeadTitle(row.head)}
                          </td>
                          <td className="py-3 px-3 text-[#374151] max-w-sm">
                            <div className="flex flex-col">
                              <span>{row.description || (isWithdrawal ? 'Cash taken by owner' : '—')}</span>
                              {isWithdrawal && (
                                <span className="inline-block mt-1 w-fit bg-[#025033] text-white text-[9px] font-medium px-2 py-0.5 rounded-full">
                                  Not an expense
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-[#111827] whitespace-nowrap">
                            ৳{formatNumber(row.amount_poisha / 100)}
                          </td>
                          <td className="py-3 px-3 text-right whitespace-nowrap">
                            {renderSourceBadge(row.source, row.confirmed_by || row.source_label, row.created_by || currentUserName)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Reconciliation Footnote */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#F3F4F6] text-xs text-[#6B7280] gap-2">
              <span className="leading-relaxed">
                Expense total ৳{formatNumber(totalOperatingPoisha / 100)}. The owner withdrawal above is listed for your cash record and is deliberately left out of that total.
              </span>
              <span className="font-normal text-[#6B7280] shrink-0">
                {filteredEntries.length} of {allEntries.length} entries
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (32% width on desktop) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Card 1: Recurring expenses */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#111827]">Recurring expenses</span>
                <span className="text-xs text-[#6B7280] mt-0.5">Posts automatically each month</span>
              </div>
              <span className="bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8] text-[10px] font-medium px-2.5 py-0.5 rounded-full">
                {recurring?.active_count ?? 0} active
              </span>
            </div>

            <div className="overflow-x-auto mt-1">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-[#F3F4F6] text-[10px] font-semibold text-[#6B7280] tracking-wider">
                    <th className="py-1.5 px-2">HEAD</th>
                    <th className="py-1.5 px-2">POSTS ON</th>
                    <th className="py-1.5 px-2 text-right">AMOUNT</th>
                    <th className="py-1.5 px-2 text-right">NEXT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6] font-normal">
                  {recurring?.items && recurring.items.length > 0 ? (
                    recurring.items.map((r) => (
                      <tr key={r.id} className="hover:bg-[#FAFCF9]">
                        <td className="py-2.5 px-2 font-semibold text-[#111827] capitalize">{formatHeadTitle(r.head)}</td>
                        <td className="py-2.5 px-2 text-[#374151]">{formatOrdinalDay(r.posts_on_day)}</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-[#111827]">৳{formatNumber(r.amount_poisha / 100)}</td>
                        <td className="py-2.5 px-2 text-right text-[#6B7280]">{formatNextDate(r.next_date)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-[#9CA3AF]">
                        No active recurring overheads.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-[#F3F4F6] text-xs text-[#6B7280] mt-1 gap-2">
              <span className="leading-snug">
                ৳{formatNumber((recurring?.monthly_total_poisha ?? 0) / 100)} a month in total. Change the amount and the new figure applies from the next posting, not backwards.
              </span>
              <button
                onClick={() => setRecurringModalOpen(true)}
                className="bg-white hover:bg-slate-50 border border-[#E5EAE7] text-[#111827] text-xs font-medium px-3 py-1 rounded-lg transition shrink-0"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Card 2: Owner withdrawals */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-[#111827]">Owner withdrawals</span>
              <span className="bg-[#FAFCF9] text-[#6B7280] border border-[#E5EAE7] text-[10px] font-medium px-2 py-0.5 rounded-full">
                Not an expense
              </span>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-[#6B7280]">Taken this month</span>
              <span className="text-xl font-bold text-[#111827]">
                ৳{formatNumber((summary?.owner_withdrawals?.taken_this_month_poisha ?? 0) / 100)}
              </span>
            </div>

            {/* List of withdrawals */}
            <div className="flex flex-col gap-1.5 pt-1 border-t border-[#F3F4F6] text-xs">
              {summary?.owner_withdrawals?.items && summary.owner_withdrawals.items.length > 0 ? (
                summary.owner_withdrawals.items.map((w) => (
                  <div key={w.id} className="flex items-center justify-between text-[#374151] py-0.5">
                    <span>{formatShortDate(w.date)} · {w.cash_account_name || 'cash'}</span>
                    <span className="font-semibold text-[#111827]">৳{formatNumber(w.amount_poisha / 100)}</span>
                  </div>
                ))
              ) : (summary?.owner_withdrawals as any)?.entries && (summary?.owner_withdrawals as any).entries.length > 0 ? (
                (summary?.owner_withdrawals as any).entries.map((w: any) => (
                  <div key={w.id} className="flex items-center justify-between text-[#374151] py-0.5">
                    <span>{formatShortDate(w.date)} · {w.cash_account_name || 'cash'}</span>
                    <span className="font-semibold text-[#111827]">৳{formatNumber(w.amount_poisha / 100)}</span>
                  </div>
                ))
              ) : (
                <div className="text-[#9CA3AF] text-xs py-1">No withdrawals recorded this month.</div>
              )}
            </div>

            <div className="text-xs text-[#6B7280] leading-relaxed pt-2 border-t border-[#F3F4F6]">
              {summary?.owner_withdrawals?.educational_note ||
                'This reduces business cash. It does not touch net profit, because money you take out of the business is not a cost of running it.'}
            </div>
          </div>

          {/* Card 3: Add an expense form */}
          <div ref={formRef} className="bg-white border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#F3F4F6]">
              <span className="text-sm font-semibold text-[#111827]">Add an expense</span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('whatsapp')}
                  className="text-xs text-[#6B7280] hover:text-[#025033] transition"
                >
                  Or send it on WhatsApp
                </button>
              )}
            </div>

            {formSuccess && (
              <div className="p-2.5 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8] text-[#025033] text-xs font-semibold">
                ✓ {formSuccess}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#374151]">Head</label>
                <select
                  value={formHead}
                  onChange={(e) => setFormHead(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-[#E5EAE7] rounded-xl bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#025033]"
                >
                  <option value="packaging">Packaging</option>
                  <option value="fixed_cost">Fixed cost (prorated overhead)</option>
                  <option value="courier">Courier charges</option>
                  <option value="advertising">Advertising</option>
                  <option value="salary">Salary</option>
                  <option value="rent">Rent</option>
                  <option value="utilities">Internet & utilities</option>
                  <option value="software">Software & tools</option>
                  <option value="transport">Transport</option>
                  <option value="other_expense">Other expense</option>
                  <option value="owner_withdrawal">Owner withdrawal (non-expense)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#374151]">Amount (৳)</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    placeholder="260"
                    required
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-[#E5EAE7] rounded-xl bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#025033] placeholder-[#9CA3AF]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-[#374151]">Date</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-[#E5EAE7] rounded-xl bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#025033]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#374151]">Description</label>
                <input
                  type="text"
                  placeholder="Tape and labels"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-[#E5EAE7] rounded-xl bg-white text-[#111827] focus:outline-none focus:ring-1 focus:ring-[#025033] placeholder-[#9CA3AF]"
                />
              </div>

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-fit bg-[#025033] hover:bg-[#033F28] text-white font-medium text-xs px-5 py-2 rounded-xl transition shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Posting...' : 'Save entry'}
                </button>
              </div>

              <p className="text-[11px] text-[#6B7280] leading-relaxed pt-2 border-t border-[#F3F4F6]">
                Entries made here are tagged Manual with your name. Entries sent on WhatsApp are tagged WhatsApp and carry the confirmation that approved them.
              </p>
            </form>
          </div>
        </div>
      </div>

      {/* Recurring Overhead Modal */}
      {recurringModalOpen && (
        <div className="fixed inset-0 z-50 bg-[#111827]/40 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl flex flex-col gap-4 border border-[#E5EAE7]">
            <div className="flex items-center justify-between pb-3 border-b border-[#F3F4F6]">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Recurring overhead heads</h3>
                <p className="text-xs text-[#6B7280] mt-0.5">Fixed costs posted automatically each month</p>
              </div>
              <button
                onClick={() => setRecurringModalOpen(false)}
                className="text-[#6B7280] hover:text-[#111827] text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* List Existing */}
            <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto">
              {recurring?.items && recurring.items.length > 0 ? (
                recurring.items.map((item) => (
                  <div
                    key={item.id || item.head}
                    className="p-3 rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] flex items-center justify-between"
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[#111827] capitalize">{item.name || formatHeadTitle(item.head)}</span>
                      <span className="text-[11px] text-[#6B7280]">
                        Day {item.posts_on_day} of month · Next: {formatNextDate(item.next_date)}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-[#111827]">৳{formatNumber(item.amount_poisha / 100)}/mo</span>
                  </div>
                ))
              ) : (
                <div className="py-4 text-center text-xs text-[#9CA3AF]">
                  No recurring overheads configured yet.
                </div>
              )}
            </div>

            {/* Add New Recurring Expense Inline */}
            <form onSubmit={handleAddRecurring} className="flex flex-col gap-2.5 pt-3 border-t border-[#F3F4F6]">
              <span className="text-xs font-semibold text-[#111827]">Add new recurring expense</span>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={newRecHead}
                  onChange={(e) => setNewRecHead(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-[#E5EAE7] rounded-xl bg-white text-[#111827]"
                >
                  <option value="rent">Rent</option>
                  <option value="salary">Salary</option>
                  <option value="internet">Internet</option>
                  <option value="software">Software</option>
                  <option value="other_expense">Other</option>
                </select>
                <input
                  type="number"
                  placeholder="Amount (৳)"
                  value={newRecAmount}
                  onChange={(e) => setNewRecAmount(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-[#E5EAE7] rounded-xl bg-white text-[#111827]"
                  required
                />
                <input
                  type="number"
                  min="1"
                  max="28"
                  placeholder="Day (1-28)"
                  value={newRecDay}
                  onChange={(e) => setNewRecDay(e.target.value)}
                  className="text-xs px-2.5 py-1.5 border border-[#E5EAE7] rounded-xl bg-white text-[#111827]"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isCreatingRec}
                className="w-full bg-[#025033] hover:bg-[#033F28] text-white py-2 rounded-xl text-xs font-medium transition disabled:opacity-50"
              >
                {isCreatingRec ? 'Saving...' : '+ Add recurring overhead'}
              </button>
            </form>

            <div className="flex justify-end pt-2 border-t border-[#F3F4F6]">
              <button
                onClick={() => setRecurringModalOpen(false)}
                className="bg-white hover:bg-slate-50 border border-[#E5EAE7] text-[#111827] px-4 py-2 rounded-xl text-xs font-medium transition"
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

function renderSourceBadge(source: string, label?: string, actor?: string) {
  const s = source?.toLowerCase() || '';
  if (s.includes('whatsapp')) {
    // If label has time like "confirmed 20:36", use it
    const timeMatch = label?.match(/\d{1,2}:\d{2}/);
    const badgeText = timeMatch ? `WhatsApp · confirmed ${timeMatch[0]}` : (label || 'WhatsApp · confirmed');
    return (
      <span className="inline-flex items-center text-[10px] font-normal text-[#374151] bg-[#FAFCF9] border border-[#E5EAE7] px-2.5 py-0.5 rounded-md">
        {badgeText}
      </span>
    );
  }
  if (s.includes('meta')) {
    return (
      <span className="inline-flex items-center text-[10px] font-normal text-[#374151] bg-[#FAFCF9] border border-[#E5EAE7] px-2.5 py-0.5 rounded-md">
        Meta API
      </span>
    );
  }
  if (s.includes('recurring') || s.includes('auto')) {
    return (
      <span className="inline-flex items-center text-[10px] font-normal text-[#374151] bg-[#FAFCF9] border border-[#E5EAE7] px-2.5 py-0.5 rounded-md">
        Auto · recurring
      </span>
    );
  }
  if (s.includes('courier')) {
    return (
      <span className="inline-flex items-center text-[10px] font-normal text-[#374151] bg-[#FAFCF9] border border-[#E5EAE7] px-2.5 py-0.5 rounded-md">
        {s.includes('upload') ? 'Courier sheet upload' : 'Courier API · settlements'}
      </span>
    );
  }
  // Manual
  const name = actor || 'Tamim Hossain';
  return (
    <span className="inline-flex items-center text-[10px] font-normal text-[#374151] bg-[#FAFCF9] border border-[#E5EAE7] px-2.5 py-0.5 rounded-md">
      Manual · {name}
    </span>
  );
}
