'use client';

import React from 'react';
import { SearchIcon, AlertIcon, PlusIcon, RefreshIcon } from './icons';
import { User } from '@/types';

interface HeaderProps {
  user: User | null;
  timeRange: 'month' | 'quarter' | 'year';
  onTimeRangeChange: (range: 'month' | 'quarter' | 'year') => void;
  exceptionsCount: number;
  onReviewExceptions: () => void;
  onOpenExpenseModal: () => void;
  onOpenPurchaseModal: () => void;
  onRefresh: () => void;
}

export function Header({
  user,
  timeRange,
  onTimeRangeChange,
  exceptionsCount,
  onReviewExceptions,
  onOpenExpenseModal,
  onOpenPurchaseModal,
  onRefresh,
}: HeaderProps) {
  const firstName = user?.name ? user.name.split(' ')[0] : 'Tamim';

  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-[#EBE7DF]">
      {/* Top Bar with Search & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Eyebrow & Main Greeting */}
        <div className="flex flex-col">
          <span className="text-[11px] font-bold tracking-wider text-stone-600 uppercase">
            {timeRange === 'month' ? 'THIS MONTH' : timeRange === 'quarter' ? 'THIS QUARTER' : 'THIS YEAR'}
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-stone-900 tracking-tight leading-tight">
            Good morning, {firstName}
          </h1>
          <p className="text-xs md:text-sm text-stone-500 font-medium">
            A clear view of orders, courier cashflow, and confirmed profit.
          </p>
        </div>

        {/* Global Search and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="relative min-w-[220px]">
            <SearchIcon className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders, parcels, SKU..."
              className="w-full bg-white border border-[#E8E4DA] rounded-xl pl-9 pr-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-900 transition"
            />
          </div>

          {/* Time range selector pills */}
          <div className="bg-[#EBE7DF]/80 p-1 rounded-xl flex items-center gap-1 border border-[#DFDAD0]">
            {(['month', 'quarter', 'year'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onTimeRangeChange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  timeRange === r
                    ? 'bg-stone-900 text-white shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
                }`}
              >
                {r === 'month' ? 'This month' : r}
              </button>
            ))}
          </div>

          {/* Review Exceptions Button */}
          {exceptionsCount > 0 && (
            <button
              onClick={onReviewExceptions}
              className="flex items-center gap-1.5 bg-stone-900 text-amber-300 hover:bg-black font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs"
            >
              <AlertIcon className="w-3.5 h-3.5 text-amber-300" />
              <span>Review Exceptions ({exceptionsCount})</span>
            </button>
          )}

          {/* Quick Add Expense Button */}
          <button
            onClick={onOpenExpenseModal}
            className="flex items-center gap-1.5 bg-white border border-stone-300 hover:border-stone-400 text-stone-800 font-semibold text-xs px-3 py-2 rounded-xl transition shadow-2xs hover:bg-stone-50"
          >
            <PlusIcon className="w-3.5 h-3.5 text-stone-700" />
            <span>+ Expense</span>
          </button>

          {/* Quick Add Purchase Button */}
          <button
            onClick={onOpenPurchaseModal}
            className="flex items-center gap-1.5 bg-white border border-stone-300 hover:border-stone-400 text-stone-800 font-semibold text-xs px-3 py-2 rounded-xl transition shadow-2xs hover:bg-stone-50"
          >
            <PlusIcon className="w-3.5 h-3.5 text-stone-700" />
            <span>+ Purchase</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            title="Refresh Ledger"
            className="p-2 bg-white border border-[#E8E4DA] hover:bg-stone-50 text-stone-600 hover:text-stone-900 rounded-xl transition shadow-2xs"
          >
            <RefreshIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
