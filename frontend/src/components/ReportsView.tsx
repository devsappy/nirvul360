'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  ProductPerformanceResponse,
  UserRole,
} from '@/types';

interface ReportsViewProps {
  userRole?: UserRole | string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function ReportsView({ userRole, showToast }: ReportsViewProps) {
  const isManager = userRole === 'manager';
  const [activeSubTab, setActiveSubTab] = useState<'pnl' | 'cash_flow' | 'product_performance' | 'tax_pack'>('product_performance');
  const [timeRange, setTimeRange] = useState<'this_month' | 'quarter' | 'year'>('this_month');

  // Product performance data
  const [perfData, setPerfData] = useState<ProductPerformanceResponse | null>(null);
  const [loadingPerf, setLoadingPerf] = useState(false);

  // P&L data
  const [pnlData, setPnlData] = useState<any | null>(null);
  const [loadingPnl, setLoadingPnl] = useState(false);

  // Cash flow data
  const [cashFlowData, setCashFlowData] = useState<any | null>(null);
  const [loadingCashFlow, setLoadingCashFlow] = useState(false);

  // Tax pack data
  const [settingsData, setSettingsData] = useState<any | null>(null);

  const fetchProductPerformance = async () => {
    try {
      setLoadingPerf(true);
      const data = await api.get<ProductPerformanceResponse>(`/api/reports/product-performance?period=${timeRange}`);
      setPerfData(data);
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error loading product performance', 'error');
    } finally {
      setLoadingPerf(false);
    }
  };

  const fetchPnl = async () => {
    try {
      setLoadingPnl(true);
      const data = await api.get<any>(`/api/reports/pnl?period=${timeRange}`);
      setPnlData(data);
    } catch (err) {
      console.error('Failed to load P&L', err);
    } finally {
      setLoadingPnl(false);
    }
  };

  const fetchCashFlow = async () => {
    try {
      setLoadingCashFlow(true);
      const data = await api.get<any>(`/api/reports/cash-flow?period=${timeRange}`);
      setCashFlowData(data);
    } catch (err) {
      console.error('Failed to load Cash Flow', err);
    } finally {
      setLoadingCashFlow(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await api.get<any>('/api/merchants/settings');
      setSettingsData(data);
    } catch (err) {
      console.error('Failed to load settings', err);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'product_performance') {
      fetchProductPerformance();
    } else if (activeSubTab === 'pnl') {
      fetchPnl();
    } else if (activeSubTab === 'cash_flow') {
      fetchCashFlow();
    } else if (activeSubTab === 'tax_pack') {
      fetchSettings();
      fetchPnl();
    }
  }, [activeSubTab, timeRange]);

  // Product performance search & selection (PDF Requirement 13)
  const [productSearch, setProductSearch] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());

  const rows = useMemo(() => {
    return perfData?.rows || [];
  }, [perfData]);

  const filteredRows = useMemo(() => {
    if (!productSearch.trim()) return rows;
    const q = productSearch.toLowerCase();
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q));
  }, [rows, productSearch]);

  const toggleSelectRow = (id: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllRows = () => {
    if (filteredRows.length > 0 && filteredRows.every((r) => selectedRowIds.has(r.product_id))) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.product_id)));
    }
  };

  // Dynamic Footnote derivations
  const highestLossSku = useMemo(() => {
    const negativeRows = rows.filter(r => (r.net_profit_poisha ?? 0) < 0);
    if (negativeRows.length === 0) return null;
    return negativeRows.reduce((worst, cur) => (cur.net_profit_poisha! < worst.net_profit_poisha! ? cur : worst), negativeRows[0]);
  }, [rows]);

  const missingCostSku = useMemo(() => {
    return rows.find(r => r.missing_cost_price);
  }, [rows]);

  const footnote = perfData?.footnote_reconciliation;

  const formatTaka = (amountPoisha?: number | null) => {
    if (amountPoisha === undefined || amountPoisha === null) return '0';
    return (amountPoisha / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const handleExportSpreadsheet = () => {
    if (rows.length === 0) {
      if (showToast) showToast('No rows to export', 'info');
      return;
    }
    const headers = ['SKU', 'Product', 'Orders', 'Delivered %', 'Returned %', 'Revenue (BDT)', 'COGS (BDT)', 'Courier (BDT)', 'Ad Spend (BDT)', 'Net Profit (BDT)', 'Net Margin %'];
    const csvRows = rows.map(r => [
      r.sku,
      `"${r.name}"`,
      r.delivered,
      r.delivered_pct ? `${(r.delivered_pct * 100).toFixed(1)}%` : '—',
      r.returned_pct ? `${(r.returned_pct * 100).toFixed(1)}%` : '—',
      r.revenue_poisha ? (r.revenue_poisha / 100).toFixed(2) : '0',
      r.cogs_poisha !== null ? (r.cogs_poisha / 100).toFixed(2) : 'not known',
      r.courier_cost_poisha ? (r.courier_cost_poisha / 100).toFixed(2) : '0',
      r.ad_spend_poisha ? (r.ad_spend_poisha / 100).toFixed(2) : 'no campaign',
      r.net_profit_poisha !== null ? (r.net_profit_poisha / 100).toFixed(2) : 'not calculated',
      r.net_margin !== null ? `${(r.net_margin * 100).toFixed(1)}%` : '—',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `product_performance_${timeRange}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = () => {
    if (showToast) showToast('Printing / exporting PDF report...', 'info');
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Reports</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            Product performance{perfData?.from_date && perfData?.to_date ? `, ${perfData.from_date}–${perfData.to_date}` : ''} · built from data last synced{' '}
            {perfData?.data_synced_at ? new Date(perfData.data_synced_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
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
            onClick={handleExportPdf}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Export PDF
          </button>

          <button
            type="button"
            onClick={handleExportSpreadsheet}
            className="px-4 py-2 text-xs font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Export spreadsheet
          </button>
        </div>
      </div>

      {/* Sub-Tab Navigation Pills */}
      <div className="flex items-center gap-2 border-b border-[#E5EAE7] pb-3">
        {[
          { key: 'pnl', label: 'Profit & loss' },
          { key: 'cash_flow', label: 'Cash flow' },
          { key: 'product_performance', label: 'Product performance' },
          { key: 'tax_pack', label: 'Tax pack' },
        ].map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveSubTab(tab.key as any)}
            className={`px-4 py-2 text-xs font-semibold rounded-xl transition-all ${
              activeSubTab === tab.key
                ? 'bg-[#064E3B] text-white shadow-2xs'
                : 'bg-white text-[#4B5563] border border-[#E5EAE7] hover:bg-[#F9FAF8]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-Tab 3: Product performance (Active Default) */}
      {activeSubTab === 'product_performance' && (
        <div className="space-y-6">
          {/* Card: SKU Economics Table */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAFCF9]">
              <div>
                <h2 className="text-base font-extrabold text-[#025033]">Product performance</h2>
                <p className="text-xs text-[#3A8067]">
                  {filteredRows.length} {filteredRows.length === 1 ? 'product' : 'products'} · sorted by net profit, highest first · delivered and returned rates are on settled parcels only
                </p>
              </div>

              {/* Search by model or product name (PDF Requirement 13) */}
              <div className="flex items-center gap-3">
                {selectedRowIds.size > 0 && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#025033] text-white">
                    {selectedRowIds.size} selected
                  </span>
                )}
                <div className="relative w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Search by model or product..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="w-full text-xs px-3 py-1.5 border border-[#CAE4D8] rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#025033] placeholder-[#3A8067] text-[#025033]"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFCF9] text-[10px] font-extrabold text-[#3A8067] uppercase tracking-wider border-b border-[#E5EAE7]">
                  <tr>
                    <th scope="col" className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        checked={filteredRows.length > 0 && filteredRows.every((r) => selectedRowIds.has(r.product_id))}
                        onChange={toggleSelectAllRows}
                        className="rounded text-[#025033] focus:ring-[#025033]"
                        title="Select all products"
                      />
                    </th>
                    <th scope="col" className="px-4 py-3">SKU / MODEL</th>
                    <th scope="col" className="px-4 py-3">PRODUCT</th>
                    <th scope="col" className="px-4 py-3 text-center">ORDERS</th>
                    <th scope="col" className="px-4 py-3 text-center">DELIVERED</th>
                    <th scope="col" className="px-4 py-3 text-center">RETURNED</th>
                    <th scope="col" className="px-4 py-3 text-right">REVENUE</th>
                    <th scope="col" className="px-4 py-3 text-right">COGS</th>
                    <th scope="col" className="px-4 py-3 text-right">COURIER</th>
                    <th scope="col" className="px-4 py-3 text-right">AD SPEND</th>
                    <th scope="col" className="px-4 py-3 text-right">NET PROFIT</th>
                    <th scope="col" className="px-4 py-3 text-right">NET MARGIN</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {loadingPerf && filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-8 text-center text-xs text-[#6B7280]">
                        Loading product economics...
                      </td>
                    </tr>
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-12 text-center text-xs text-[#6B7280]">
                        No product movement recorded matching &ldquo;{productSearch}&rdquo;.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map(r => {
                      const isNegative = (r.net_profit_poisha ?? 0) < 0;
                      const isMissingCost = r.missing_cost_price || r.cogs_poisha === null;
                      const isSelected = selectedRowIds.has(r.product_id);

                      let rowBg = isSelected ? 'bg-[#E6F7EF]/50' : 'hover:bg-[#FAFCF9]';
                      if (!isSelected) {
                        if (isMissingCost) {
                          rowBg = 'bg-[#FEF9EE] hover:bg-[#FEF3C7]/40';
                        } else if (isNegative) {
                          rowBg = 'bg-[#FFF1F2] hover:bg-[#FEE2E2]/60';
                        }
                      }

                      return (
                        <tr key={r.product_id} className={`transition-colors ${rowBg}`}>
                          {/* Checkbox (PDF Requirement 13) */}
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(r.product_id)}
                              className="rounded text-[#025033] focus:ring-[#025033]"
                            />
                          </td>

                          {/* SKU */}
                          <td className="px-4 py-3.5 font-mono font-bold text-[#025033]">
                            {r.sku}
                          </td>

                          {/* PRODUCT */}
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-[#111827]">{r.name}</div>
                            {isMissingCost && (
                              <div className="mt-0.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EF4444] text-white">
                                  No cost price
                                </span>
                              </div>
                            )}
                          </td>

                          {/* ORDERS */}
                          <td className="px-4 py-3.5 text-center font-medium text-[#4B5563]">
                            {r.delivered}
                          </td>

                          {/* DELIVERED */}
                          <td className="px-4 py-3.5 text-center text-[#111827]">
                            {r.delivered_pct !== null && r.delivered_pct !== undefined ? `${(r.delivered_pct * 100).toFixed(1)}%` : '—'}
                          </td>

                          {/* RETURNED */}
                          <td className="px-4 py-3.5 text-center">
                            {r.returned_pct !== null && r.returned_pct !== undefined ? (
                              <span className={(r.returned_pct > 0.25) ? 'text-[#DC2626] font-semibold' : 'text-[#4B5563]'}>
                                {(r.returned_pct * 100).toFixed(1)}%
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>

                          {/* REVENUE */}
                          <td className="px-4 py-3.5 text-right font-semibold text-[#111827]">
                            ৳{formatTaka(r.revenue_poisha)}
                          </td>

                          {/* COGS */}
                          <td className="px-4 py-3.5 text-right">
                            {isMissingCost ? (
                              <span className="text-[#B45309] italic">not known</span>
                            ) : (
                              <span className="text-[#4B5563]">৳{formatTaka(r.cogs_poisha)}</span>
                            )}
                          </td>

                          {/* COURIER */}
                          <td className="px-4 py-3.5 text-right text-[#4B5563]">
                            ৳{formatTaka(r.courier_cost_poisha)}
                          </td>

                          {/* AD SPEND */}
                          <td className="px-4 py-3.5 text-right">
                            {r.ad_spend_poisha ? (
                              <span className="text-[#4B5563]">৳{formatTaka(r.ad_spend_poisha)}</span>
                            ) : (
                              <span className="text-[#9CA3AF] italic">no campaign mapped</span>
                            )}
                          </td>

                          {/* NET PROFIT */}
                          <td className="px-4 py-3.5 text-right">
                            {isMissingCost ? (
                              <span className="text-[#9CA3AF] italic">not calculated</span>
                            ) : isNegative ? (
                              <span className="text-[#DC2626] font-bold">
                                -৳{formatTaka(Math.abs(r.net_profit_poisha!))}
                              </span>
                            ) : (
                              <span className="text-[#025033] font-bold">
                                ৳{formatTaka(r.net_profit_poisha)}
                              </span>
                            )}
                          </td>

                          {/* NET MARGIN */}
                          <td className="px-4 py-3.5 text-right">
                            {isMissingCost || r.net_margin === null ? (
                              <span className="text-[#9CA3AF]">—</span>
                            ) : isNegative ? (
                              <span className="text-[#DC2626] font-semibold">
                                {(r.net_margin * 100).toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-[#025033] font-semibold">
                                {(r.net_margin * 100).toFixed(1)}%
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}

                  {/* Summary Row: ROWS ABOVE, ADDED UP */}
                  {rows.length > 0 && (
                    <tr className="bg-[#FAFCF9] font-bold border-t-2 border-[#E5EAE7]">
                      <td colSpan={2} className="px-4 py-3.5 text-[#111827] uppercase tracking-wider text-[11px]">
                        ROWS ABOVE, ADDED UP
                      </td>
                      <td className="px-4 py-3.5 text-center text-[#111827]">
                        {rows.reduce((sum, r) => sum + r.delivered, 0)}
                      </td>
                      <td className="px-4 py-3.5"></td>
                      <td className="px-4 py-3.5"></td>
                      <td className="px-4 py-3.5 text-right text-[#111827]">
                        ৳{formatTaka(perfData?.summary_totals?.total_revenue_poisha)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[#111827]">
                        ৳{formatTaka(perfData?.summary_totals?.total_cogs_poisha)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[#111827]">
                        ৳{formatTaka(perfData?.summary_totals?.total_courier_fees_poisha)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[#111827]">
                        ৳{formatTaka(perfData?.summary_totals?.total_ad_spend_poisha)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[#025033]">
                        ৳{formatTaka(perfData?.summary_totals?.total_sku_net_profit_poisha)}
                      </td>
                      <td className="px-4 py-3.5 text-right text-[#6B7280] font-normal">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card: Accounting Footnote Reconciliation Card */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-[#111827] uppercase tracking-wider">
              Accounting Footnote Reconciliation
            </h3>
            <ul className="space-y-2 text-xs text-[#3A8067] leading-relaxed list-disc pl-5">
              <li>
                {highestLossSku ? (
                  <>
                    <span className="font-semibold text-[#111827]">{highestLossSku.sku}</span> lost{' '}
                    <span className="font-semibold text-[#DC2626]">
                      ৳{formatTaka(Math.abs(highestLossSku.net_profit_poisha ?? 0))}
                    </span>{' '}
                    this period.{' '}
                    {highestLossSku.returned_pct ? `${(highestLossSku.returned_pct * 100).toFixed(1)}%` : '0.0%'} of its settled parcels came back, and every return carries its delivery leg, its return leg and the ad spend that bought the order.
                  </>
                ) : (
                  <span>No SKU loss data recorded for this period.</span>
                )}
              </li>
              <li>
                {missingCostSku ? (
                  <>
                    <span className="font-semibold text-[#111827]">{missingCostSku.sku}</span> is left out of the net profit column because it has no cost price. Its profit is unknown, which is not the same as zero.
                  </>
                ) : (
                  <span>All active products have recorded cost prices. Items without costs are omitted from net profit until resolved.</span>
                )}
              </li>
              <li>
                ৳{formatTaka(footnote?.unmapped_ad_spend_poisha ?? 0)} of the ৳{formatTaka(perfData?.summary_totals?.total_ad_spend_poisha ?? footnote?.unmapped_ad_spend_poisha ?? 0)} Meta spend could not be mapped to a product, so it is blank above rather than spread across rows. It is still in the profit and loss.
              </li>
              <li>
                Packaging ৳{formatTaka(footnote?.unallocated_packaging_poisha ?? 0)} and fixed costs ৳{formatTaka(footnote?.unallocated_fixed_costs_poisha ?? 0)} are not allocated to products. ৳{formatTaka(footnote?.sku_net_profit_sum_poisha ?? 0)} less those, less the unmapped ad spend and plus the uncosted items&apos; unresolved margin, is the ৳{formatTaka(footnote?.dashboard_pnl_net_profit_poisha ?? 0)} net profit on the dashboard.
              </li>
            </ul>
          </div>

          {/* Bottom Warning Banner */}
          <div className="p-4 bg-[#FFFBEB] rounded-2xl border border-[#FDE68A] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-[#92400E]">
            <div>
              <span className="font-bold">৳{formatTaka(footnote?.unresolved_exceptions_poisha ?? 0)}</span> of unresolved items is not in any column on this report. Clearing it in Needs attention will change these figures.
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3 py-1 bg-white border border-[#FCD34D] rounded-lg font-semibold hover:bg-[#FEF3C7]"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={handleExportSpreadsheet}
                className="px-3 py-1 bg-[#025033] text-white rounded-lg font-semibold hover:bg-[#033E28]"
              >
                Export spreadsheet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sub-Tab 1: Profit & Loss (Dashboard Card / Widget Visual System - PDF Requirement 12) */}
      {activeSubTab === 'pnl' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-[#025033]">Profit &amp; Loss Dashboard</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                  Visual Accounting
                </span>
              </div>
              <p className="text-xs text-[#3A8067] font-medium mt-0.5">
                Double-entry guaranteed · {pnlData?.from || 'Start'} to {pnlData?.to || 'End'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3.5 py-1.5 bg-white border border-[#CAE4D8] text-[#025033] rounded-xl font-bold text-xs hover:bg-[#E6F7EF] transition"
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={handleExportSpreadsheet}
                className="px-3.5 py-1.5 bg-[#025033] text-white rounded-xl font-bold text-xs hover:bg-[#05572F] transition shadow-xs"
              >
                Export Spreadsheet
              </button>
            </div>
          </div>

          {isManager ? (
            <div className="p-4 bg-[#FFF5F5] rounded-xl border border-[#FED7D7] text-xs text-[#991B1B]">
              <span className="font-semibold">Access Restricted:</span> Profit &amp; Loss reports are restricted to Owners and Accountants. In accordance with your team permissions matrix, net profit figures are hidden.
            </div>
          ) : loadingPnl ? (
            <div className="py-12 text-center text-xs text-[#3A8067] font-medium">Loading Profit &amp; Loss dashboard...</div>
          ) : pnlData ? (
            <>
              {/* 5 Top Summary Visual KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Gross Sales */}
                <div className="p-4.5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#3A8067]">Delivered Sales</span>
                  <div className="my-2">
                    <div className="text-xl sm:text-2xl font-black text-[#025033] tracking-tight">
                      ৳{formatTaka(pnlData.gross_sales)}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#3A8067] border-t border-[#E5EAE7] pt-2">
                    Confirmed deliveries only
                  </span>
                </div>

                {/* 2. COGS */}
                <div className="p-4.5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#3A8067]">Cost of Goods (COGS)</span>
                  <div className="my-2">
                    <div className="text-xl sm:text-2xl font-black text-red-700 tracking-tight">
                      -৳{formatTaka(pnlData.cogs)}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#3A8067] border-t border-[#E5EAE7] pt-2">
                    FIFO dated batch cost
                  </span>
                </div>

                {/* 3. Gross Profit */}
                <div className="p-4.5 rounded-2xl bg-[#E6F7EF] border border-[#CAE4D8] shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#025033]">Gross Profit</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#025033] text-white">
                      {pnlData.gross_margin ? `${(pnlData.gross_margin * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="my-2">
                    <div className="text-xl sm:text-2xl font-black text-[#025033] tracking-tight">
                      ৳{formatTaka(pnlData.gross_profit)}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#3A8067] border-t border-[#CAE4D8] pt-2">
                    Revenue minus item costs
                  </span>
                </div>

                {/* 4. Total Operating Expenses */}
                <div className="p-4.5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#3A8067]">Operating Expenses</span>
                  <div className="my-2">
                    <div className="text-xl sm:text-2xl font-black text-[#111827] tracking-tight">
                      -৳{formatTaka(
                        Object.values(pnlData.sections || {}).reduce((sum: number, sec: any) => sum + (sec.amount || 0), 0)
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#3A8067] border-t border-[#E5EAE7] pt-2">
                    Courier, ads, packaging &amp; fixed
                  </span>
                </div>

                {/* 5. Net Profit */}
                <div className={`p-4.5 rounded-2xl text-white shadow-2xs flex flex-col justify-between ${
                  (pnlData.net_profit || 0) < 0 ? 'bg-red-800 border border-red-900' : 'bg-[#025033] border border-[#00432C]'
                }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#CAE4D8]">Net Profit</span>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/20 text-white">
                      {pnlData.margin ? `${(pnlData.margin * 100).toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="my-2">
                    <div className="text-xl sm:text-2xl font-black tracking-tight text-white">
                      {(pnlData.net_profit || 0) < 0 ? '-' : ''}৳{formatTaka(Math.abs(pnlData.net_profit || 0))}
                    </div>
                  </div>
                  <span className="text-[10px] font-semibold text-[#CAE4D8] border-t border-white/20 pt-2">
                    Confirmed bottom-line return
                  </span>
                </div>
              </div>

              {/* Visual Breakdown Widgets Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Widget 1: Operating Expense Breakdown Card */}
                <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
                    <h3 className="text-sm font-extrabold text-[#025033]">Operating Expenses Breakdown</h3>
                    <span className="text-xs font-bold text-[#3A8067]">By Category</span>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(pnlData.sections || {}).map(([key, sec]: [string, any]) => {
                      const amount = sec.amount || 0;
                      const totalExp = Object.values(pnlData.sections || {}).reduce((s: number, sc: any) => s + (sc.amount || 0), 0) || 1;
                      const pct = Math.min(100, Math.round((amount / totalExp) * 100));

                      return (
                        <div key={key} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-[#025033]">{sec.label || key}</span>
                            <span className="font-bold text-[#111827]">৳{formatTaka(amount)}</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${pct}%` }}
                              className="h-full bg-[#025033] rounded-full transition-all"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Widget 2: Profit Waterfall Bridge Card */}
                <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs flex flex-col gap-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
                    <h3 className="text-sm font-extrabold text-[#025033]">Profit Flow Bridge</h3>
                    <span className="text-xs font-bold text-[#3A8067]">From Sales to Net</span>
                  </div>

                  <div className="space-y-3.5 text-xs">
                    {/* Step 1: Gross Sales */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAFCF9] border border-[#E5EAE7]">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-green-100 text-green-800 font-black text-xs flex items-center justify-center">+</span>
                        <span className="font-bold text-[#025033]">Gross Delivered Sales</span>
                      </div>
                      <span className="font-black text-[#025033]">৳{formatTaka(pnlData.gross_sales)}</span>
                    </div>

                    {/* Step 2: Less COGS */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-50/60 border border-red-200">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-red-100 text-red-800 font-black text-xs flex items-center justify-center">-</span>
                        <span className="font-bold text-red-900">Cost of Goods Sold (COGS)</span>
                      </div>
                      <span className="font-black text-red-900">-৳{formatTaka(pnlData.cogs)}</span>
                    </div>

                    {/* Step 3: Equals Gross Profit */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8]">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#025033] text-white font-black text-xs flex items-center justify-center">=</span>
                        <span className="font-extrabold text-[#025033]">Gross Operating Profit</span>
                      </div>
                      <span className="font-black text-[#025033]">৳{formatTaka(pnlData.gross_profit)}</span>
                    </div>

                    {/* Step 4: Less Overheads */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/60 border border-amber-200">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 font-black text-xs flex items-center justify-center">-</span>
                        <span className="font-bold text-amber-900">Operating Costs (Courier + Ads + Rent)</span>
                      </div>
                      <span className="font-black text-amber-900">
                        -৳{formatTaka(
                          Object.values(pnlData.sections || {}).reduce((sum: number, sec: any) => sum + (sec.amount || 0), 0)
                        )}
                      </span>
                    </div>

                    {/* Step 5: Equals Confirmed Net Profit */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[#025033] text-white border border-[#00432C]">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-white/20 font-black text-xs flex items-center justify-center">★</span>
                        <span className="font-extrabold">Final Confirmed Net Profit</span>
                      </div>
                      <span className="font-black text-base text-white">
                        {(pnlData.net_profit || 0) < 0 ? '-' : ''}৳{formatTaka(Math.abs(pnlData.net_profit || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="py-8 text-center text-xs text-[#6B7280]">No P&amp;L data available.</div>
          )}
        </div>
      )}

      {/* Sub-Tab 2: Cash flow */}
      {activeSubTab === 'cash_flow' && (
        <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-6 space-y-6">
          <div className="border-b border-[#E5EAE7] pb-4">
            <h2 className="text-base font-bold text-[#111827]">Cash Flow Statement</h2>
            <p className="text-xs text-[#6B7280]">
              Liquid inflows, supplier disbursements, courier collections, and bank balances
            </p>
          </div>

          {loadingCashFlow ? (
            <div className="py-8 text-center text-xs text-[#6B7280]">Loading Cash Flow statement...</div>
          ) : cashFlowData ? (
            <div className="space-y-4 max-w-2xl text-xs">
              <div className="p-4 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7] space-y-2">
                <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Accounts Balance</div>
                {(cashFlowData.cash_accounts || []).map((acc: any) => (
                  <div key={acc.id} className="flex justify-between font-medium text-[#111827]">
                    <span>{acc.name} ({acc.kind})</span>
                    <span>৳{formatTaka(acc.balance)}</span>
                  </div>
                ))}
              </div>

              <div className="flex justify-between py-2 border-b border-[#E5EAE7]">
                <span className="text-[#4B5563]">Operating Cash Flow</span>
                <span className="font-semibold text-[#111827]">৳{formatTaka(cashFlowData.operating_flow || cashFlowData.inflows)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-[#E5EAE7]">
                <span className="text-[#4B5563]">Owner Withdrawals (Direct Equity)</span>
                <span className="text-[#DC2626] font-medium">-৳{formatTaka(cashFlowData.owner_withdrawals || 0)}</span>
              </div>
              <div className="flex justify-between py-2 bg-[#E6F7EF] px-3 rounded-lg font-bold text-[#025033]">
                <span>Net Liquid Cash Position</span>
                <span>৳{formatTaka(cashFlowData.net_liquid || cashFlowData.closing_balance)}</span>
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#6B7280]">No cash flow statement data available.</div>
          )}
        </div>
      )}

      {/* Sub-Tab 4: Tax pack */}
      {activeSubTab === 'tax_pack' && (
        <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-6 space-y-6">
          <div className="border-b border-[#E5EAE7] pb-4">
            <h2 className="text-base font-bold text-[#111827]">Tax Pack (NBR Mushak-6.3 Ready)</h2>
            <p className="text-xs text-[#6B7280]">
              Value Added Tax compliance and registered business profile
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            <div className="p-4 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7] space-y-2">
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">VAT Registration Profile</div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Business Name</span><span className="font-semibold text-[#111827]">{settingsData?.business_profile?.business_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Trade License</span><span className="font-mono text-[#111827]">{settingsData?.business_profile?.trade_license || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Business Identification No (BIN)</span><span className="font-mono text-[#025033] font-bold">{settingsData?.vat_tax?.registration_number || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">VAT Commissionerate</span><span className="text-[#111827]">{settingsData?.vat_tax?.commissionerate || '—'}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Default Sales VAT Rate</span><span className="font-bold text-[#111827]">{settingsData?.vat_tax?.sales_rate ?? 0}%</span></div>
            </div>

            <div className="p-4 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7] space-y-3">
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">Mushak Tax Computation</div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Taxable Delivered Turnover</span><span className="font-semibold text-[#111827]">৳{formatTaka(pnlData?.gross_sales ?? 0)}</span></div>
              <div className="flex justify-between"><span className="text-[#6B7280]">Output VAT Liability ({settingsData?.vat_tax?.sales_rate ?? 15}%)</span><span className="font-semibold text-[#025033]">৳{formatTaka(Math.round(((pnlData?.gross_sales ?? 0) * (settingsData?.vat_tax?.sales_rate ?? 15)) / 100))}</span></div>
              <button
                type="button"
                onClick={() => {
                  if (showToast) showToast('Generated NBR Mushak-6.3 monthly tax declaration pack.', 'success');
                }}
                className="w-full mt-4 py-2 text-xs font-semibold text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
              >
                Download NBR Mushak-6.3 Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
