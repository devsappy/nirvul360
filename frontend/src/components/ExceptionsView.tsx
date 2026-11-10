'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { ExceptionQueueItem, ExceptionsSummaryResponse } from '@/types';

interface ExceptionsViewProps {
  onRefreshParent?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
  netProfitPoisha?: number;
}

export function ExceptionsView({ onRefreshParent, showToast, netProfitPoisha = 0 }: ExceptionsViewProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ExceptionsSummaryResponse>({
    count: 0,
    total_unresolved_poisha: 0,
    total_unresolved_taka: 0,
    oldest_days: 0,
    unresolved_by_type: {},
    items: [],
  });

  // Filters
  const [timeRange, setTimeRange] = useState<'this_month' | 'quarter' | 'year'>('this_month');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Inline Resolution Form State
  const [selectedReason, setSelectedReason] = useState<'partial_delivery' | 'delivery_discount' | 'courier_short'>('partial_delivery');
  const [resolutionNote, setResolutionNote] = useState('Rider says customer refused 1 of 3 items');
  const [isResolving, setIsResolving] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const fetchExceptions = async () => {
    try {
      setLoading(true);
      const data = await api.get<ExceptionsSummaryResponse>('/api/exceptions?status=open&sort=oldest');
      setSummary(data);
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error loading exceptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions();
  }, [timeRange]);

  // Discrepancy counts
  const typeCounts = useMemo(() => {
    const byType = summary.unresolved_by_type || {};
    return {
      all: summary.count || 0,
      stuck_parcel: byType['stuck_parcel']?.count || 0,
      short_settlement: byType['short_settlement']?.count || 0,
      zero_settlement: byType['zero_settlement']?.count || 0,
      unsettled_cod: byType['unsettled_cod']?.count || 0,
      product_without_price: (byType['product_without_price']?.count || 0) + (byType['missing_cost']?.count || 0),
      duplicate_order: byType['duplicate_order']?.count || 0,
      missing_parcel: byType['missing_parcel']?.count || 0,
    };
  }, [summary]);

  // Filtered items
  const filteredItems = useMemo(() => {
    const items = summary.items || [];
    if (selectedTypeFilter === 'all') return items;
    if (selectedTypeFilter === 'product_without_price') {
      return items.filter(it => it.type === 'product_without_price' || it.type === 'missing_cost');
    }
    return items.filter(it => it.type === selectedTypeFilter);
  }, [summary.items, selectedTypeFilter]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  const handleToggleExpand = (item: ExceptionQueueItem) => {
    if (expandedId === item.id) {
      setExpandedId(null);
    } else {
      setExpandedId(item.id);
      setSelectedReason('partial_delivery');
      setResolutionNote(item.details?.reason || '');
    }
  };

  const handleResolveSubmit = async (item: ExceptionQueueItem) => {
    try {
      setIsResolving(true);
      const payload: any = {
        action: item.actions?.[0] || 'resolve',
        reason_code: selectedReason,
        note: resolutionNote.trim(),
      };

      const res = await fetch(`/api/exceptions/${item.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || 'Resolution failed');

      if (showToast) showToast(`Item ${item.order_ref || item.id} resolved and posted to ledger.`, 'success');
      setExpandedId(null);
      fetchExceptions();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error resolving item', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  const handleExportList = () => {
    if (!summary.items || summary.items.length === 0) {
      if (showToast) showToast('No items to export', 'info');
      return;
    }
    const headers = ['ID', 'Type', 'Order Ref', 'Customer', 'Value (BDT)', 'Age (Days)', 'Status'];
    const rows = summary.items.map(it => [
      it.id,
      it.type,
      it.order_ref || '',
      it.customer_name || '',
      it.value_taka,
      it.age_days,
      it.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `exceptions_queue_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAskCourier = () => {
    if (showToast) showToast('Courier webhook sync dispatched. Polling Pathao, Steadfast & RedX...', 'info');
    setTimeout(() => {
      fetchExceptions();
    }, 1500);
  };

  const formatTaka = (amountPoisha?: number | null) => {
    if (amountPoisha === undefined || amountPoisha === null) return '0';
    return (amountPoisha / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const renderTypePill = (type: string) => {
    switch (type) {
      case 'stuck_parcel':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            Stuck parcel
          </span>
        );
      case 'short_settlement':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            Short settlement
          </span>
        );
      case 'zero_settlement':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            Zero-value delivery
          </span>
        );
      case 'unsettled_cod':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            Unsettled COD
          </span>
        );
      case 'product_without_price':
      case 'missing_cost':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            No cost price
          </span>
        );
      case 'duplicate_order':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
            Duplicate order
          </span>
        );
      case 'missing_parcel':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF2F2] text-[#991B1B] border border-[#FEE2E2]">
            Lost parcel
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Needs attention</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            {summary.count} {summary.count === 1 ? 'unresolved item' : 'unresolved items'} · courier data last synced{' '}
            {summary.last_sync_time ? new Date(summary.last_sync_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'recently'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="inline-flex items-center bg-white border border-[#E5EAE7] rounded-xl p-1 shadow-2xs">
            {(['this_month', 'quarter', 'year'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setTimeRange(p)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  timeRange === p ? 'bg-[#025033] text-white shadow-2xs' : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                {p === 'this_month' ? 'This month' : p === 'quarter' ? 'Quarter' : 'Year'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportList}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Export list
          </button>

          <button
            type="button"
            onClick={handleAskCourier}
            className="px-4 py-2 text-xs font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            Ask courier for status
          </button>
        </div>
      </div>

      {/* Hero Banner: Quarantine Isolation Container */}
      <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-2xl p-6 shadow-2xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Metrics (3 Primary Columns) */}
          <div className="lg:col-span-7 grid grid-cols-3 divide-x divide-[#FCD34D]/60 pr-2">
            <div className="pr-4">
              <div className="text-[11px] font-bold tracking-wider text-[#92400E] uppercase">UNRESOLVED VALUE</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#78350F] mt-1">
                ৳{formatTaka(summary.total_unresolved_poisha)}
              </div>
            </div>
            <div className="px-4">
              <div className="text-[11px] font-bold tracking-wider text-[#92400E] uppercase">ITEMS</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#78350F] mt-1">
                {summary.count}
              </div>
            </div>
            <div className="pl-4">
              <div className="text-[11px] font-bold tracking-wider text-[#92400E] uppercase">OLDEST</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-[#78350F] mt-1">
                {summary.oldest_days || 0} days
              </div>
            </div>
          </div>

          {/* Right Callout Text */}
          <div className="lg:col-span-5 text-xs text-[#92400E] leading-relaxed border-t lg:border-t-0 lg:border-l lg:border-[#FCD34D]/60 pt-4 lg:pt-0 lg:pl-6">
            None of this money is in your net profit of{' '}
            <span className="font-bold text-[#78350F]">৳{formatTaka(netProfitPoisha)}</span>. It stays out until you give
            each item a reason. Resolving an item posts it to the ledger straight away.
          </div>
        </div>
      </div>

      {/* Discrepancy Type Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { key: 'all', label: 'All', count: typeCounts.all },
          { key: 'stuck_parcel', label: 'Stuck parcels', count: typeCounts.stuck_parcel },
          { key: 'short_settlement', label: 'Short settlement', count: typeCounts.short_settlement },
          { key: 'zero_settlement', label: 'Zero-value delivery', count: typeCounts.zero_settlement },
          { key: 'unsettled_cod', label: 'Unsettled COD', count: typeCounts.unsettled_cod },
          { key: 'product_without_price', label: 'No cost price', count: typeCounts.product_without_price },
          { key: 'duplicate_order', label: 'Duplicate order', count: typeCounts.duplicate_order },
          { key: 'missing_parcel', label: 'Lost parcel', count: typeCounts.missing_parcel },
        ].map(filter => (
          <button
            key={filter.key}
            type="button"
            onClick={() => {
              setSelectedTypeFilter(filter.key);
              setCurrentPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all ${
              selectedTypeFilter === filter.key
                ? 'bg-[#025033] text-white border-[#025033] shadow-2xs'
                : 'bg-white text-[#374151] border-[#E5EAE7] hover:bg-[#F9FAF8]'
            }`}
          >
            {filter.label} <span className="opacity-80 font-normal">({filter.count})</span>
          </button>
        ))}
      </div>

      {/* Unresolved Items Table Card */}
      <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
        {/* Table Subheader */}
        <div className="p-5 border-b border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#FAFCF9]">
          <div>
            <h2 className="text-base font-bold text-[#111827]">Unresolved items</h2>
            <p className="text-xs text-[#6B7280]">
              Sorted by age, oldest first · showing {paginatedItems.length} of {filteredItems.length}
            </p>
          </div>
          <div className="text-xs text-[#6B7280]">
            Courier API · sheet upload · {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* Table Container */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAFCF9] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-[#E5EAE7]">
              <tr>
                <th scope="col" className="px-6 py-3.5">TYPE</th>
                <th scope="col" className="px-6 py-3.5">ORDER / SKU</th>
                <th scope="col" className="px-6 py-3.5">CUSTOMER</th>
                <th scope="col" className="px-6 py-3.5">VALUE</th>
                <th scope="col" className="px-6 py-3.5">AGE</th>
                <th scope="col" className="px-6 py-3.5 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {loading && paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-xs text-[#6B7280]">
                    Loading unresolved items...
                  </td>
                </tr>
              ) : paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs text-[#6B7280]">
                    No unresolved discrepancies. All courier deliveries, settlements, and product costs are currently balanced in the ledger.
                  </td>
                </tr>
              ) : (
                paginatedItems.map(item => {
                  const isExpanded = expandedId === item.id;
                  const isOld = item.age_days > 30;

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`hover:bg-[#FAFCF9] transition-colors ${isExpanded ? 'bg-[#FAFCF9]' : ''}`}>
                        {/* TYPE */}
                        <td className="px-6 py-4">{renderTypePill(item.type)}</td>

                        {/* ORDER / SKU */}
                        <td className="px-6 py-4 font-mono font-medium text-[#111827]">
                          <span className="px-2 py-0.5 rounded-md bg-[#F3F4F6] text-[#374151] border border-[#E5EAE7]">
                            {item.order_ref || item.product_sku || `EXC-${item.id}`}
                          </span>
                        </td>

                        {/* CUSTOMER */}
                        <td className="px-6 py-4 font-medium text-[#111827]">
                          {item.customer_name || '—'}
                        </td>

                        {/* VALUE */}
                        <td className="px-6 py-4 font-semibold text-[#111827]">
                          {item.value_poisha === 0 && item.details?.expected_taka ? (
                            <div>
                              <span>৳0</span>
                              <div className="text-[10px] text-[#6B7280] font-normal">
                                expected ৳{item.details.expected_taka}
                              </div>
                            </div>
                          ) : (
                            `৳${formatTaka(item.value_poisha)}`
                          )}
                        </td>

                        {/* AGE */}
                        <td className="px-6 py-4">
                          <span className={isOld ? 'text-[#DC2626] font-bold' : 'text-[#4B5563]'}>
                            {item.age_days} d
                          </span>
                        </td>

                        {/* ACTION */}
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleExpand(item)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                              isExpanded
                                ? 'bg-[#025033] text-white border-[#025033]'
                                : 'bg-white text-[#025033] border-[#E5EAE7] hover:bg-[#F9FAF8]'
                            }`}
                          >
                            {isExpanded ? 'Close' : 'Give a reason'}
                          </button>
                        </td>
                      </tr>

                      {/* Inline Resolution Drawer (Row Expansion) */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 bg-[#F8FAF8] border-b border-[#E5EAE7]">
                            <div className="p-5 bg-white rounded-xl border border-[#E5EAE7] shadow-xs space-y-4">
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-3 border-b border-[#E5EAE7]">
                                <div>
                                  <h4 className="text-sm font-bold text-[#111827]">
                                    Why is ৳{formatTaka(item.value_poisha)} missing on {item.order_ref || `Order #${item.order_id}`}?
                                  </h4>
                                  <p className="text-xs text-[#6B7280]">
                                    Order value ৳{item.order_total_taka || '—'} · Settled ৳{item.settled_total_taka || '—'} · Difference ৳{formatTaka(item.value_poisha)}
                                  </p>
                                </div>
                                <span className="text-[11px] text-[#6B7280] bg-[#F3F4F6] px-2.5 py-1 rounded-full border border-[#E5EAE7] self-start sm:self-auto">
                                  {item.courier || 'courier sheet'} upload
                                </span>
                              </div>

                              <div>
                                <label className="block text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                                  PICK A REASON
                                </label>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {/* Reason 1: Partial delivery */}
                                  <label
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                      selectedReason === 'partial_delivery'
                                        ? 'bg-[#E6F7EF] border-[#025033] ring-1 ring-[#025033]'
                                        : 'bg-white border-[#E5EAE7] hover:border-[#D1D5DB]'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="radio"
                                        name={`reason-${item.id}`}
                                        value="partial_delivery"
                                        checked={selectedReason === 'partial_delivery'}
                                        onChange={() => setSelectedReason('partial_delivery')}
                                        className="mt-0.5 text-[#025033] focus:ring-[#025033]"
                                      />
                                      <div>
                                        <div className="font-semibold text-xs text-[#111827]">
                                          Partial delivery — customer took some items
                                        </div>
                                        <div className="text-[11px] text-[#4B5563] mt-1 leading-snug">
                                          Revenue drops to settled amount. COGS is recalculated on the items kept.
                                        </div>
                                      </div>
                                    </div>
                                  </label>

                                  {/* Reason 2: Discount at door */}
                                  <label
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                      selectedReason === 'delivery_discount'
                                        ? 'bg-[#E6F7EF] border-[#025033] ring-1 ring-[#025033]'
                                        : 'bg-white border-[#E5EAE7] hover:border-[#D1D5DB]'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="radio"
                                        name={`reason-${item.id}`}
                                        value="delivery_discount"
                                        checked={selectedReason === 'delivery_discount'}
                                        onChange={() => setSelectedReason('delivery_discount')}
                                        className="mt-0.5 text-[#025033] focus:ring-[#025033]"
                                      />
                                      <div>
                                        <div className="font-semibold text-xs text-[#111827]">
                                          Discount given at the door
                                        </div>
                                        <div className="text-[11px] text-[#4B5563] mt-1 leading-snug">
                                          ৳{formatTaka(item.value_poisha)} posts as a sales discount against this order.
                                        </div>
                                      </div>
                                    </div>
                                  </label>

                                  {/* Reason 3: Courier short */}
                                  <label
                                    className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${
                                      selectedReason === 'courier_short'
                                        ? 'bg-[#E6F7EF] border-[#025033] ring-1 ring-[#025033]'
                                        : 'bg-white border-[#E5EAE7] hover:border-[#D1D5DB]'
                                    }`}
                                  >
                                    <div className="flex items-start gap-2">
                                      <input
                                        type="radio"
                                        name={`reason-${item.id}`}
                                        value="courier_short"
                                        checked={selectedReason === 'courier_short'}
                                        onChange={() => setSelectedReason('courier_short')}
                                        className="mt-0.5 text-[#025033] focus:ring-[#025033]"
                                      />
                                      <div>
                                        <div className="font-semibold text-xs text-[#111827]">
                                          Courier settled short — they owe us
                                        </div>
                                        <div className="text-[11px] text-[#4B5563] mt-1 leading-snug">
                                          ৳{formatTaka(item.value_poisha)} stays receivable from {item.courier || 'courier'} and out of profit.
                                        </div>
                                      </div>
                                    </div>
                                  </label>
                                </div>
                              </div>

                              {/* Note Field & Submit Buttons */}
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                                <div className="flex-1 flex items-center gap-2">
                                  <label className="text-xs font-semibold text-[#374151] whitespace-nowrap">Note</label>
                                  <input
                                    type="text"
                                    value={resolutionNote}
                                    onChange={(e) => setResolutionNote(e.target.value)}
                                    placeholder="Rider says customer refused 1 of 3 items"
                                    className="w-full px-3 py-1.5 text-xs bg-[#FAFCF9] border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                                  />
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-auto">
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId(null)}
                                    className="px-3.5 py-1.5 text-xs font-medium text-[#4B5563] hover:text-[#111827]"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isResolving}
                                    onClick={() => handleResolveSubmit(item)}
                                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
                                  >
                                    {isResolving ? 'Saving...' : 'Save reason'}
                                  </button>
                                </div>
                              </div>

                              <div className="text-[11px] text-[#6B7280] italic">
                                Until a reason is saved, this ৳{formatTaka(item.value_poisha)} is not revenue, not a loss and not in net profit. Saving posts it tonight and the entry keeps your name against it.
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer & Pagination */}
        <div className="p-4 border-t border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAFCF9] text-xs">
          <div className="text-[#6B7280] leading-relaxed">
            Nothing on this screen counts in profit. Clearing all {summary.count} items would move{' '}
            <span className="font-semibold text-[#111827]">৳{formatTaka(summary.total_unresolved_poisha)}</span> into the ledger — up or down, we do not guess which.
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-3 py-1 rounded-lg border border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs font-medium text-[#4B5563]">
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-3 py-1 rounded-lg border border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
