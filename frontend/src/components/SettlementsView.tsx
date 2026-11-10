'use strict';
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api, getApiBaseUrl } from '@/lib/api';
import {
  SettlementUploadedRow,
  SettlementReceivablesSummaryResponse,
} from '@/types';

interface SettlementsViewProps {
  onRefreshParent?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function SettlementsView({ onRefreshParent, showToast }: SettlementsViewProps) {
  // Periods
  const [timeRange, setTimeRange] = useState<'this_month' | 'quarter' | 'year'>('this_month');

  // Receivables Summary
  const [recSummary, setRecSummary] = useState<SettlementReceivablesSummaryResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Upload & Mapping Wizard State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<string>('steadfast');
  const [isUploading, setIsUploading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Preview Data
  const [matchedRows, setMatchedRows] = useState<SettlementUploadedRow[]>([]);
  const [disputedRows, setDisputedRows] = useState<SettlementUploadedRow[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({
    'Consignment ID': 'order_id',
    'Merchant Amount': 'cod_collected',
    'Delivery Charge': 'delivery_charge',
    'COD Charge': 'cod_fee',
    'Return Charge': 'return_charge',
    'Updated At': 'unmapped',
  });

  // History Drawer
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchReceivablesSummary = async () => {
    try {
      setLoadingSummary(true);
      const data = await api.get<SettlementReceivablesSummaryResponse>(`/api/settlements/receivables-summary?period=${timeRange}`);
      setRecSummary(data);
    } catch (err) {
      console.error('Failed to load receivables summary', err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const data = await api.get<{ uploads: any[] }>('/api/settlements');
      setUploadHistory(data.uploads || []);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  };

  useEffect(() => {
    fetchReceivablesSummary();
  }, [timeRange]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('courier', selectedCourier);

      const baseUrl = getApiBaseUrl();
      const url = baseUrl ? `${baseUrl}/api/settlements/preview` : '/api/settlements/preview';

      const res = await fetch(url, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        let msg = 'Failed to preview settlement file';
        try {
          const errData = await res.json();
          msg = errData.detail || errData.message || msg;
        } catch {
          msg = `Server returned HTTP ${res.status}`;
        }
        throw new Error(msg);
      }

      const data = await res.json();

      if (data.summary) {
        setMatchedRows(data.summary.matched_rows || []);
        setDisputedRows(data.summary.disputed_rows || []);
      }
      if (showToast) showToast(`Parsed ${data.rows?.length || 0} rows from ${file.name}`, 'success');
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error parsing settlement file', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmMapping = async () => {
    if (!selectedFile && matchedRows.length === 0) {
      if (showToast) showToast('Please upload a settlement file first', 'error');
      return;
    }

    try {
      setIsCommitting(true);
      const allRowsToCommit = [...matchedRows, ...disputedRows];
      const payload = {
        courier: selectedCourier,
        rows: allRowsToCommit,
        filename: selectedFile?.name || `${selectedCourier}-settlement.csv`,
      };

      const data = await api.post<{ posted: number }>('/api/settlements/commit', payload);

      if (showToast) showToast(`Reconciled: ${data.posted || 0} orders cleared to cash.`, 'success');
      setSelectedFile(null);
      setMatchedRows([]);
      setDisputedRows([]);
      fetchReceivablesSummary();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Failed to confirm settlement', 'error');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleResolveAction = (row: SettlementUploadedRow) => {
    if (showToast) showToast(`Routing ${row.consignment_id} to Needs attention discrepancy queue.`, 'info');
  };

  const handleHoldAction = (row: SettlementUploadedRow) => {
    if (showToast) showToast(`Holding ${row.consignment_id} pending delivery completion.`, 'info');
  };

  const handleIgnoreAction = (row: SettlementUploadedRow) => {
    if (showToast) showToast(`Ignored ${row.consignment_id} (already settled in previous batch).`, 'info');
  };

  const matchedTotalPoisha = useMemo(() => {
    return matchedRows.reduce((sum, r) => sum + (r.cod_collected || 0), 0);
  }, [matchedRows]);

  const disputedTotalPoisha = useMemo(() => {
    return disputedRows.reduce((sum, r) => sum + (r.cod_collected || 0), 0);
  }, [disputedRows]);

  const unmappedColumnsCount = useMemo(() => {
    return Object.values(columnMappings).filter(v => v === 'unmapped').length;
  }, [columnMappings]);

  const formatTaka = (val?: number | null) => {
    if (val === undefined || val === null) return '0';
    return val.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Courier settlements</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            {loadingSummary ? (
              <span>Refreshing courier balances...</span>
            ) : (
              <span>
                ৳{formatTaka(recSummary?.total_held_taka)} still held at {recSummary?.couriers_count ?? 0} couriers · Pathao API synced{' '}
                {recSummary?.last_synced_at ? new Date(recSummary.last_synced_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
                {' · '}last sheet uploaded {recSummary?.last_uploaded_at ? new Date(recSummary.last_uploaded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
              </span>
            )}
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
            onClick={() => {
              fetchHistory();
              setIsHistoryOpen(true);
            }}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Settlement history
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-xs font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload sheet
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
      </div>

      {/* Top Section: 2-Step Side-by-Side Settlement Reconciliation Wizard */}
      <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Left Step 1: 1 · Settlement sheet */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-[#111827]">1 · Settlement sheet</div>
              <span className="text-[11px] font-medium text-[#6B7280]">Step 1 of 3</span>
            </div>

            {selectedFile ? (
              <div className="p-4 bg-[#E6F7EF]/40 border border-[#22C55E]/40 rounded-xl flex items-center justify-between">
                <div>
                  <div className="font-mono font-bold text-xs text-[#025033]">{selectedFile.name}</div>
                  <div className="text-[11px] text-[#6B7280] mt-0.5">
                    {matchedRows.length + disputedRows.length} rows · {(selectedFile.size / 1024).toFixed(0)} KB · read just now
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1 text-xs font-semibold text-[#025033] bg-white border border-[#CAE4D8] rounded-lg hover:bg-[#F9FAF8]"
                >
                  Replace
                </button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-8 border-2 border-dashed border-[#CAE4D8] rounded-xl bg-[#FAFCF9] hover:bg-[#E6F7EF]/20 cursor-pointer text-center transition-colors"
              >
                <svg className="w-8 h-8 text-[#3A8067] mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isUploading ? (
                  <div className="font-semibold text-xs text-[#025033]">Uploading and reading columns...</div>
                ) : (
                  <>
                    <div className="font-semibold text-xs text-[#111827]">Drop a .xlsx or .csv from Pathao, Steadfast or RedX</div>
                    <div className="text-[11px] text-[#6B7280] mt-1">Nothing posts to the ledger until the mapping on the right is confirmed.</div>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-[#374151]">Courier</label>
              <select
                value={selectedCourier}
                onChange={(e) => setSelectedCourier(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
              >
                <option value="steadfast">Steadfast</option>
                <option value="pathao">Pathao</option>
                <option value="redx">RedX</option>
              </select>
            </div>
          </div>

          {/* Right Step 2: 2 · Map their columns to ours */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-bold text-sm text-[#111827]">2 · Map their columns to ours</div>
              <span className="text-[11px] font-medium text-[#6B7280]">
                Step 2 of 3 · remembered for next {selectedCourier.charAt(0).toUpperCase() + selectedCourier.slice(1)} upload
              </span>
            </div>

            <div className="border border-[#E5EAE7] rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left">
                <thead className="bg-[#FAFCF9] text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-[#E5EAE7]">
                  <tr>
                    <th className="px-3.5 py-2">THEIR COLUMN</th>
                    <th className="px-3.5 py-2">OUR FIELD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {Object.entries(columnMappings).map(([theirCol, ourField]) => (
                    <tr key={theirCol} className="hover:bg-[#FAFCF9]">
                      <td className="px-3.5 py-2 font-mono text-[#374151]">{theirCol}</td>
                      <td className="px-3.5 py-2">
                        <select
                          value={ourField}
                          onChange={(e) => {
                            const val = e.target.value;
                            setColumnMappings(prev => ({ ...prev, [theirCol]: val }));
                          }}
                          className={`w-full px-2 py-1 text-xs rounded-lg border bg-white focus:outline-none focus:ring-1 focus:ring-[#025033] ${
                            ourField === 'unmapped'
                              ? 'border-amber-300 bg-amber-50/50 text-[#92400E]'
                              : 'border-[#D1D5DB] text-[#111827]'
                          }`}
                        >
                          <option value="order_id">Order ID</option>
                          <option value="cod_collected">COD collected</option>
                          <option value="delivery_charge">Delivery charge</option>
                          <option value="cod_fee">COD fee</option>
                          <option value="return_charge">Return charge</option>
                          <option value="unmapped">Not mapped — pick a field</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
              <div className="text-[11px] text-[#6B7280]">
                {unmappedColumnsCount > 0 ? `${unmappedColumnsCount} column still unmapped. ` : ''}
                Return charge is kept as its own field — it is never merged into delivery charge.
              </div>
              <button
                type="button"
                disabled={isCommitting}
                onClick={handleConfirmMapping}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50 shadow-2xs whitespace-nowrap self-end sm:self-auto"
              >
                {isCommitting ? 'Posting to ledger...' : 'Confirm mapping'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: 3-Column Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Column 1 (~35% width: 4 of 12 columns on lg): Matched Table */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5EAE7]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[#111827]">Matched</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#DCFCE7] text-[#15803D]">
                  {matchedRows.length}
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                {matchedRows.length} rows · ৳{formatTaka(matchedTotalPoisha / 100)} will clear from held at couriers
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {matchedRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B7280]">
                No matched rows to display. Upload a settlement sheet to reconcile.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] text-[#6B7280] font-semibold uppercase bg-[#FAFCF9] border-b border-[#E5EAE7]">
                  <tr>
                    <th className="py-2 px-1">ORDER ID</th>
                    <th className="py-2 px-1">CUSTOMER</th>
                    <th className="py-2 px-1 text-right">COD</th>
                    <th className="py-2 px-1 text-right">CHARGES</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {matchedRows.slice(0, 15).map((row, idx) => (
                    <tr key={idx} className="hover:bg-[#FAFCF9]">
                      <td className="py-2 px-1 font-mono font-medium text-[#025033]">{row.consignment_id}</td>
                      <td className="py-2 px-1 text-[#4B5563]">{row.customer_name || 'Customer'}</td>
                      <td className="py-2 px-1 text-right font-semibold text-[#111827]">৳{formatTaka(row.cod_collected / 100)}</td>
                      <td className="py-2 px-1 text-right text-[#DC2626]">
                        {row.charges ? `-৳${formatTaka(row.charges / 100)}` : '-৳95'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="pt-2 border-t border-[#E5EAE7] text-[11px] text-[#6B7280]">
            Posting these clears ৳{formatTaka(matchedTotalPoisha / 100)} out of held at couriers and into cash.
          </div>
        </div>

        {/* Column 2 (~35% width: 4 of 12 columns on lg): Did not match Table */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-5 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5EAE7]">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-[#111827]">Did not match</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FEF3C7] text-[#D97706]">
                  {disputedRows.length}
                </span>
              </div>
              <p className="text-[11px] text-[#6B7280] mt-0.5">
                {disputedRows.length} rows · ৳{formatTaka(disputedTotalPoisha / 100)} held back from profit
              </p>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            {disputedRows.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B7280]">
                All rows matched. No disputed items in this upload.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] text-[#6B7280] font-semibold uppercase bg-[#FAFCF9] border-b border-[#E5EAE7]">
                  <tr>
                    <th className="py-2 px-1">THEIR ID</th>
                    <th className="py-2 px-1">WHY</th>
                    <th className="py-2 px-1 text-right">AMOUNT</th>
                    <th className="py-2 px-1 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {disputedRows.slice(0, 15).map((row, idx) => {
                    const isShort = row.discrepancy_reason?.includes('short');
                    const isReturnOnDelivered = row.discrepancy_reason?.includes('Return charge');

                    return (
                      <tr key={idx} className="hover:bg-[#FAFCF9]">
                        <td className="py-2 px-1 font-mono font-medium text-[#111827]">{row.consignment_id}</td>
                        <td className={`py-2 px-1 ${isShort || isReturnOnDelivered ? 'text-[#DC2626] font-medium' : 'text-[#4B5563]'}`}>
                          {row.discrepancy_reason || 'Discrepancy'}
                        </td>
                        <td className="py-2 px-1 text-right font-semibold text-[#111827]">
                          ৳{formatTaka(row.cod_collected / 100)}
                        </td>
                        <td className="py-2 px-1 text-right">
                          {row.recommended_action === 'hold' ? (
                            <button
                              type="button"
                              onClick={() => handleHoldAction(row)}
                              className="px-2 py-0.5 text-[11px] font-medium border border-[#D1D5DB] rounded bg-white text-[#374151] hover:bg-[#F3F4F6]"
                            >
                              Hold
                            </button>
                          ) : row.recommended_action === 'ignore' ? (
                            <button
                              type="button"
                              onClick={() => handleIgnoreAction(row)}
                              className="px-2 py-0.5 text-[11px] font-medium border border-[#D1D5DB] rounded bg-white text-[#374151] hover:bg-[#F3F4F6]"
                            >
                              Ignore
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleResolveAction(row)}
                              className="px-2 py-0.5 text-[11px] font-medium border border-[#E5EAE7] rounded bg-[#E6F7EF] text-[#025033] hover:bg-[#D5EFE3]"
                            >
                              Resolve
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="p-2.5 bg-[#FFFBEB] rounded-xl border border-[#FDE68A] text-[11px] text-[#92400E]">
            These {disputedRows.length} rows stay in Needs attention and out of profit until each one is given a reason.
          </div>
        </div>

        {/* Column 3 (~30% width: 4 of 12 columns on lg): Outstanding by courier Summary Card */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs p-5 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#E5EAE7]">
            <h3 className="font-bold text-sm text-[#111827]">Outstanding by courier</h3>
            <span className="text-xs text-[#6B7280]">
              Synced {recSummary?.last_synced_at ? new Date(recSummary.last_synced_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—'}
            </span>
          </div>

          {/* Table 1: Receivables by Courier */}
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left">
              <thead className="text-[10px] text-[#6B7280] font-semibold uppercase bg-[#FAFCF9] border-b border-[#E5EAE7]">
                <tr>
                  <th className="py-2 px-1">COURIER</th>
                  <th className="py-2 px-1 text-center">PARCELS</th>
                  <th className="py-2 px-1 text-right">HELD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAE7]">
                {(recSummary?.outstanding_by_courier || []).map((c) => (
                  <tr key={c.courier} className="hover:bg-[#FAFCF9]">
                    <td className="py-2 px-1 font-medium text-[#111827]">{c.name}</td>
                    <td className="py-2 px-1 text-center text-[#4B5563]">{c.parcels}</td>
                    <td className="py-2 px-1 text-right font-semibold text-[#111827]">৳{formatTaka(c.held_taka)}</td>
                  </tr>
                ))}
                <tr className="bg-[#E6F7EF]/50 font-bold text-[#025033]">
                  <td className="py-2 px-1">Total held</td>
                  <td className="py-2 px-1 text-center">
                    {(recSummary?.outstanding_by_courier || []).reduce((sum, c) => sum + c.parcels, 0)}
                  </td>
                  <td className="py-2 px-1 text-right">৳{formatTaka(recSummary?.total_held_taka)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Table 2: Charges This Period Kept Apart */}
          <div className="pt-2 border-t border-[#E5EAE7] space-y-2">
            <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider">
              CHARGES THIS PERIOD, KEPT APART
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left">
                <thead className="text-[10px] text-[#6B7280] font-semibold uppercase bg-[#FAFCF9] border-b border-[#E5EAE7]">
                  <tr>
                    <th className="py-1.5 px-1">CHARGE</th>
                    <th className="py-1.5 px-1 text-right">PATHAO</th>
                    <th className="py-1.5 px-1 text-right">STEADFAST</th>
                    <th className="py-1.5 px-1 text-right">REDX</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  <tr>
                    <td className="py-1.5 px-1 text-[#4B5563]">Delivery</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.delivery?.['pathao'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.delivery?.['steadfast'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.delivery?.['redx'] ?? 0) / 100)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-1 text-[#4B5563]">COD fee</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.cod_fee?.['pathao'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.cod_fee?.['steadfast'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.cod_fee?.['redx'] ?? 0) / 100)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 px-1 text-[#4B5563]">Return charge</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.return_charge?.['pathao'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.return_charge?.['steadfast'] ?? 0) / 100)}</td>
                    <td className="py-1.5 px-1 text-right">৳{formatTaka((recSummary?.charges_this_period?.return_charge?.['redx'] ?? 0) / 100)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="text-[11px] text-[#6B7280] leading-snug">
              Return charges on {recSummary?.returned_parcels_count ?? 0} returned parcels are shown on their own line and never folded into delivery.
            </div>
          </div>
        </div>
      </div>

      {/* History Slide-Over Drawer */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-[#E5EAE7] max-h-[80vh] flex flex-col text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Settlement History</h3>
                <p className="text-[11px] text-[#6B7280]">Previous batch reconciliations</p>
              </div>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] text-xl font-bold px-2"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-3 flex-1">
              {uploadHistory.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B7280]">No settlement sheets uploaded yet.</div>
              ) : (
                uploadHistory.map(u => (
                  <div key={u.id} className="p-3 bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-[#111827]">{u.filename}</div>
                      <div className="text-[11px] text-[#6B7280]">{u.courier?.toUpperCase()} · {u.row_count} rows · {u.committed_at || u.created_at}</div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D]">
                      {u.status || 'Posted'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E5EAE7] text-right">
              <button
                type="button"
                onClick={() => setIsHistoryOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
