'use client';

import React from 'react';
import { SearchIcon, AlertIcon, PlusIcon, RefreshIcon } from './icons';
import { User } from '@/types';

interface HeaderProps {
  user: User | null;
  timeRange: 'month' | 'last30' | 'quarter' | 'year';
  onTimeRangeChange: (range: 'month' | 'last30' | 'quarter' | 'year') => void;
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
  const isSuperAdmin = user?.role === 'super_admin';
  const firstName = user?.name ? user.name.split(' ')[0] : 'Tamim';

  if (isSuperAdmin) {
    return null;
  }

  return (
    <header className="flex flex-col gap-4 pb-6 border-b border-[#E5EAE7]">
      {/* Top Bar with Search & Quick Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Eyebrow & Main Greeting */}
        <div className="flex flex-col">
          <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-normal">
            {timeRange === 'month' ? 'This Month' : timeRange === 'last30' ? 'Last 30 Days' : timeRange === 'quarter' ? 'This Quarter' : 'This Year'}
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#025033] tracking-tight leading-tight">
            Good morning, {firstName}
          </h1>
          <p className="text-xs md:text-sm text-[#3A8067] font-medium">
            A clear view of orders, courier cashflow, and confirmed profit.
          </p>
        </div>

        {/* Global Search and Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search bar */}
          <div className="relative min-w-[220px]">
            <SearchIcon className="w-4 h-4 text-[#3A8067] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders, parcels, SKU..."
              className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl pl-9 pr-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
            />
          </div>

          {/* Time range selector pills */}
          <div className="bg-[#E6F7EF] p-1 rounded-xl flex items-center gap-1 border border-[#CAE4D8]">
            {(['month', 'last30', 'quarter', 'year'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onTimeRangeChange(r)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  timeRange === r
                    ? 'bg-[#025033] text-[#FFFFFF] shadow-xs font-bold'
                    : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
                }`}
              >
                {r === 'month' ? 'This month' : r === 'last30' ? 'Last 30 Days' : r}
              </button>
            ))}
          </div>

          {/* Review Exceptions Button */}
          {exceptionsCount > 0 && (
            <button
              onClick={onReviewExceptions}
              className="flex items-center gap-1.5 bg-[#025033] text-[#CAE4D8] hover:bg-[#05572F] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs border border-[#00432C]"
            >
              <AlertIcon className="w-3.5 h-3.5 text-[#CAE4D8]" />
              <span>Review Exceptions ({exceptionsCount})</span>
            </button>
          )}

          {/* Quick Add Expense Button */}
          <button
            onClick={onOpenExpenseModal}
            className="flex items-center gap-1.5 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF]"
          >
            <PlusIcon className="w-3.5 h-3.5 text-[#025033]" />
            <span>Expense</span>
          </button>

          {/* Quick Add Purchase Button */}
          <button
            onClick={onOpenPurchaseModal}
            className="flex items-center gap-1.5 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF]"
          >
            <PlusIcon className="w-3.5 h-3.5 text-[#025033]" />
            <span>Purchase</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            title="Refresh Ledger"
            className="p-2 bg-[#FFFFFF] border border-[#E5EAE7] hover:bg-[#E6F7EF] text-[#025033] rounded-xl transition shadow-2xs"
          >
            <RefreshIcon className="w-4 h-4 text-[#025033]" />
          </button>
        </div>
      </div>
    </header>
  );
}
