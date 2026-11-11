'use client';

import React, { useState } from 'react';
import { SearchIcon, AlertIcon, PlusIcon, RefreshIcon, MenuIcon } from './icons';
import { User } from '@/types';

export type TimeRangeOption = 'month' | 'last30' | 'last7' | 'custom';

interface HeaderProps {
  user: User | null;
  timeRange: TimeRangeOption;
  onTimeRangeChange: (range: TimeRangeOption, customDates?: { from: string; to: string }) => void;
  exceptionsCount: number;
  onReviewExceptions: () => void;
  onOpenExpenseModal: () => void;
  onOpenPurchaseModal: () => void;
  onRefresh: () => void;
  onOpenMobileMenu?: () => void;
  customFrom?: string;
  customTo?: string;
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
  customFrom = '',
  customTo = '',
}: HeaderProps) {
  const isSuperAdmin = user?.role === 'super_admin';
  const firstName = user?.name ? user.name.split(' ')[0] : 'Tamim';

  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [startDate, setStartDate] = useState(customFrom || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(customTo || new Date().toISOString().slice(0, 10));

  if (isSuperAdmin) {
    return null;
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (startDate && endDate) {
      onTimeRangeChange('custom', { from: startDate, to: endDate });
      setShowCustomPicker(false);
    }
  };

  const rangeLabel = timeRange === 'month'
    ? 'This Month'
    : timeRange === 'last30'
    ? 'Last 30 Days'
    : timeRange === 'last7'
    ? 'Last 7 Days'
    : `Custom (${startDate} to ${endDate})`;

  return (
    <header className="flex flex-col gap-4 sm:gap-5 pb-5 sm:pb-6 border-b border-[#E5EAE7]">
      {/* Top Bar with Search & Quick Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        {/* Eyebrow & Main Greeting + Mobile Menu Trigger */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-[#3A8067] uppercase tracking-normal">
              {rangeLabel}
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
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 relative">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none min-w-[200px] sm:min-w-[240px]">
            <SearchIcon className="w-4 h-4 text-[#3A8067] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search orders, parcels, SKU..."
              className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl pl-10 pr-4 py-2 sm:py-2.5 text-xs sm:text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition shadow-2xs font-medium"
            />
          </div>

          {/* Time range selector pills: This Month, Last 30 Days, Last 7 Days, Custom */}
          <div className="bg-[#E6F7EF] p-1 sm:p-1.5 rounded-xl flex items-center gap-1 border border-[#CAE4D8] overflow-x-auto relative">
            <button
              onClick={() => {
                setShowCustomPicker(false);
                onTimeRangeChange('month');
              }}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition ${
                timeRange === 'month'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              This Month
            </button>

            <button
              onClick={() => {
                setShowCustomPicker(false);
                onTimeRangeChange('last30');
              }}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition ${
                timeRange === 'last30'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              Last 30 Days
            </button>

            <button
              onClick={() => {
                setShowCustomPicker(false);
                onTimeRangeChange('last7');
              }}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition ${
                timeRange === 'last7'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              Last 7 Days
            </button>

            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={`px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition flex items-center gap-1 ${
                timeRange === 'custom'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              <span>Custom</span>
              <span className="text-[10px]">▾</span>
            </button>

            {/* Custom Date Range Popover */}
            {showCustomPicker && (
              <div className="absolute right-0 top-full mt-2 z-50 bg-[#FFFFFF] border border-[#CAE4D8] rounded-2xl shadow-xl p-4 w-72 animate-in fade-in zoom-in-95 duration-150">
                <form onSubmit={handleApplyCustom} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-1 border-b border-[#E5EAE7]">
                    <span className="text-xs font-bold text-[#025033]">Custom Date Range</span>
                    <button
                      type="button"
                      onClick={() => setShowCustomPicker(false)}
                      className="text-xs text-[#3A8067] hover:text-[#025033]"
                    >
                      &times;
                    </button>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#025033] mb-1">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-2.5 py-1.5 text-xs text-[#025033] font-medium focus:outline-none focus:border-[#025033]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-[#025033] mb-1">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                      className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-2.5 py-1.5 text-xs text-[#025033] font-medium focus:outline-none focus:border-[#025033]"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomPicker(false)}
                      className="px-3 py-1.5 rounded-lg border border-[#E5EAE7] text-xs font-medium text-[#3A8067] hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 rounded-lg bg-[#025033] hover:bg-[#05572F] text-white text-xs font-bold shadow-xs"
                    >
                      Apply Range
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Review Exceptions Button */}
          {exceptionsCount > 0 && (
            <button
              onClick={onReviewExceptions}
              className="flex items-center gap-1.5 sm:gap-2 bg-[#025033] text-[#CAE4D8] hover:bg-[#05572F] font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-xs border border-[#00432C] whitespace-nowrap"
            >
              <AlertIcon className="w-4 h-4 text-[#CAE4D8]" />
              <span>Review Exceptions ({exceptionsCount})</span>
            </button>
          )}

          {/* Quick Add Expense Button */}
          <button
            onClick={onOpenExpenseModal}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF] whitespace-nowrap"
          >
            <PlusIcon className="w-4 h-4 text-[#025033]" />
            <span>Expense</span>
          </button>

          {/* Quick Add Purchase Button */}
          <button
            onClick={onOpenPurchaseModal}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl transition shadow-2xs hover:bg-[#E6F7EF] whitespace-nowrap"
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
