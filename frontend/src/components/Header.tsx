'use client';

import React from 'react';
import { SearchIcon, AlertIcon, PlusIcon, RefreshIcon, MenuIcon } from './icons';
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
  onOpenMobileMenu?: () => void;
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
  onOpenMobileMenu,
}: HeaderProps) {
  const isSuperAdmin = user?.role === 'super_admin';
  const firstName = user?.name ? user.name.split(' ')[0] : 'Tamim';

  if (isSuperAdmin) {
    return null;
  }

  return (
    <header className="flex flex-col gap-4 sm:gap-5 pb-5 sm:pb-6 border-b border-[#E5EAE7]">
      {/* Top Bar with Search & Quick Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Eyebrow & Main Greeting + Mobile Menu Trigger */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#3A8067] uppercase tracking-normal">
              {timeRange === 'month' ? 'This Month' : timeRange === 'last30' ? 'Last 30 Days' : timeRange === 'quarter' ? 'This Quarter' : 'This Year'}
            </span>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#025033] tracking-tight leading-tight mt-0.5">
              Good morning, {firstName}
            </h1>
            <p className="text-xs sm:text-sm md:text-base text-[#3A8067] font-medium mt-0.5">
              A clear view of orders, courier cashflow, and confirmed profit.
            </p>
          </div>

          {/* Mobile hamburger menu toggle */}
          {onOpenMobileMenu && (
            <button
              onClick={onOpenMobileMenu}
              className="lg:hidden p-2.5 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8] text-[#025033] hover:bg-[#CAE4D8] transition shrink-0 mt-1"
              title="Open Navigation Menu"
            >
              <MenuIcon className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Global Search and Actions */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none min-w-[200px] sm:min-w-[240px]">
            <SearchIcon className="w-4 h-4 text-[#3A8067] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders, parcels, SKU..."
              className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl pl-10 pr-4 py-2 sm:py-2.5 text-xs sm:text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition shadow-2xs"
            />
          </div>

          {/* Time range selector pills */}
          <div className="bg-[#E6F7EF] p-1 sm:p-1.5 rounded-xl flex items-center gap-1 border border-[#CAE4D8] overflow-x-auto">
            {(['month', 'last30', 'quarter', 'year'] as const).map((r) => (
              <button
                key={r}
                onClick={() => onTimeRangeChange(r)}
                className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-semibold capitalize whitespace-nowrap transition ${
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
              className="flex items-center gap-1.5 sm:gap-2 bg-[#025033] text-[#CAE4D8] hover:bg-[#05572F] font-semibold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-xs border border-[#00432C] whitespace-nowrap"
            >
              <AlertIcon className="w-4 h-4 text-[#CAE4D8]" />
              <span>Review Exceptions ({exceptionsCount})</span>
            </button>
          )}

          {/* Quick Add Expense Button */}
          <button
            onClick={onOpenExpenseModal}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-semibold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF] whitespace-nowrap"
          >
            <PlusIcon className="w-4 h-4 text-[#025033]" />
            <span>Expense</span>
          </button>

          {/* Quick Add Purchase Button */}
          <button
            onClick={onOpenPurchaseModal}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-semibold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF] whitespace-nowrap"
          >
            <PlusIcon className="w-4 h-4 text-[#025033]" />
            <span>Purchase</span>
          </button>

          {/* Refresh Button */}
          <button
            onClick={onRefresh}
            title="Refresh Ledger"
            className="p-2 sm:p-2.5 bg-[#FFFFFF] border border-[#E5EAE7] hover:bg-[#E6F7EF] text-[#025033] rounded-xl transition shadow-2xs shrink-0"
          >
            <RefreshIcon className="w-4 h-4 text-[#025033]" />
          </button>
        </div>
      </div>
    </header>
  );
}
