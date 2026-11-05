'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Order } from '@/types';
import {
  CourierIcon,
  CheckIcon,
  RefreshIcon,
  DownloadCloudIcon,
  ShieldIcon
} from './icons';

interface SettlementsViewProps {
  orders: Order[];
  onRefresh: () => void;
  onOpenIntegrations: () => void;
  showToast: (msg: string) => void;
}

export function SettlementsView({
  orders,
  onRefresh,
  onOpenIntegrations,
  showToast,
}: SettlementsViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'consignments' | 'reconcile' | 'history'>('consignments');
  const [courierInfo, setCourierInfo] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [settlementHistory, setSettlementHistory] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCourier, setSelectedCourier] = useState('pathao');

  // Load integration info & recent settlements
  const loadData = async () => {
    try {
      const hub = await api.get('/api/integrations');
      if (hub?.courier_website) {
        setCourierInfo(hub.courier_website);
        if (hub.courier_website.provider) {
          setSelectedCourier(hub.courier_website.provider);
        }
      }
    } catch {}

    try {
      const res = await api.get('/api/settlements');
      if (res?.uploads) {
        setSettlementHistory(res.uploads);
      }
    } catch {}
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter courier orders
  const courierOrders = orders.filter((o) => o.courier || o.consignment_id);
  const deliveredOrders = courierOrders.filter((o) => o.status === 'delivered');
  const inTransitOrders = courierOrders.filter((o) => o.status === 'in_transit');

  const totalCodPending = deliveredOrders.reduce((sum, o) => sum + (o.cod_amount || 0), 0);

  // Sync courier parcels
  const handleSyncCourier = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/api/integrations/courier/sync', {});
      showToast(res.message || 'Successfully synced consignments from courier!');
      onRefresh();
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to sync courier orders');
    } finally {
      setSyncing(false);
    }
  };

  // Preview uploaded settlement sheet
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setUploading(true);
    setPreviewData(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('courier', selectedCourier);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/settlements/preview`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to parse settlement sheet');
      }
      setPreviewData(data);
      showToast(`Sheet mapped successfully: ${data.rows?.length || 0} rows found`);
    } catch (err: any) {
      showToast(err.message || 'Error processing settlement sheet');
    } finally {
      setUploading(false);
    }
  };

  // Commit settlement preview
  const handleCommitSettlement = async () => {
    if (!previewData || !previewData.rows) return;
    setCommitting(true);
    try {
      const res = await api.post('/api/settlements/commit', {
        courier: selectedCourier,
        rows: previewData.rows,
        filename: selectedFile?.name || `${selectedCourier}-settlement.csv`,
      });
      showToast(`Settlement reconciled! ${res.posted || 0} parcels credited, ${res.exceptions || 0} exceptions raised.`);
      setPreviewData(null);
      setSelectedFile(null);
      onRefresh();
      loadData();
      setActiveSubTab('history');
    } catch (err: any) {
      showToast(err.message || 'Failed to commit settlement');
    } finally {
      setCommitting(false);
    }
  };

  // Generate and download a sample Pathao settlement CSV matching current orders
  const handleDownloadSampleSheet = () => {
    const headers = 'Consignment ID,Customer Name,Order ID,COD Amount,Status,Delivery Fee,COD Fee,Return Fee,Date\n';
    let rows = '';
    if (courierOrders.length > 0) {
      rows = courierOrders
        .map((o) => {
          const cod = (o.cod_amount ? o.cod_amount / 100 : 1500).toFixed(0);
          const fee = '60';
          const codFee = ((Number(cod) * 0.01) || 15).toFixed(0);
          return `${o.consignment_id || `PTH-${o.id}`},${o.customer_name || 'Customer'},${o.id},${cod},${o.status === 'delivered' ? 'Delivered' : o.status === 'returned' ? 'Returned' : 'In Transit'},${fee},${codFee},0,2026-11-05`;
        })
        .join('\n');
    } else {
      rows = 'PTH-DHK-9901,Rahim Chowdhury,1,1850,Delivered,60,19,0,2026-11-05\n' +
             'PTH-CTG-9902,Farhana Yasmin,2,1450,Delivered,70,15,0,2026-11-05\n' +
             'PTH-SYL-9903,Tanvir Hasan,3,3700,Delivered,60,37,0,2026-11-05\n' +
             'PTH-RAJ-9904,Mehedi Hasan,4,0,Returned,60,0,60,2026-11-05\n';
    }

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Pathao_Settlement_Sample_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Downloaded sample Pathao settlement CSV!');
  };

  const isConnected = Boolean(courierInfo?.connected);
  const providerName = (courierInfo?.provider || selectedCourier).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      
      {/* 1. Header Banner & Courier Integration Status */}
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl p-6 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#E6F7EF] border border-[#CAE4D8] flex items-center justify-center text-[#025033]">
            <CourierIcon className="w-7 h-7" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-[#025033] tracking-tight">
                {providerName} Courier Hub
              </h1>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                isConnected
                  ? 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]'
                  : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#025033] animate-pulse' : 'bg-[#3A8067]'}`} />
                {isConnected ? 'Connected & Active' : 'Not Connected'}
              </span>
            </div>
            <p className="text-xs text-[#3A8067] mt-0.5">
              Automated reconciliation of Cash-on-Delivery collections, delivery deductions, and consignment tracking.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={handleSyncCourier}
            disabled={syncing}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] text-xs font-bold transition shadow-xs disabled:opacity-50"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync Consignments'}</span>
          </button>
          <button
            onClick={onOpenIntegrations}
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-[#E5EAE7] bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] text-xs font-bold transition"
          >
            <ShieldIcon className="w-3.5 h-3.5 text-[#3A8067]" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#3A8067] uppercase tracking-wider">Unsettled Cash at Courier</span>
          <div className="my-2">
            <span className="text-2xl font-black text-[#025033]">
              ৳{(totalCodPending / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <span className="text-[11px] text-[#3A8067]">
            {deliveredOrders.length} delivered parcel{deliveredOrders.length === 1 ? '' : 's'} awaiting settlement payout
          </span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#3A8067] uppercase tracking-wider">In-Transit Parcels</span>
          <div className="my-2">
            <span className="text-2xl font-black text-[#025033]">{inTransitOrders.length}</span>
          </div>
          <span className="text-[11px] text-[#3A8067]">Active consignments out for doorstep delivery</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-xs font-semibold text-[#3A8067] uppercase tracking-wider">Reconciled Statements</span>
          <div className="my-2">
            <span className="text-2xl font-black text-[#025033]">{settlementHistory.length}</span>
          </div>
          <span className="text-[11px] text-[#3A8067]">Settlement batches processed &amp; posted to ledger</span>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#E5EAE7] pb-1">
        <button
          onClick={() => setActiveSubTab('consignments')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeSubTab === 'consignments'
              ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs'
              : 'text-[#3A8067] hover:bg-[#E6F7EF] hover:text-[#025033]'
          }`}
        >
          Live Consignments ({courierOrders.length})
        </button>
        <button
          onClick={() => setActiveSubTab('reconcile')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeSubTab === 'reconcile'
              ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs'
              : 'text-[#3A8067] hover:bg-[#E6F7EF] hover:text-[#025033]'
          }`}
        >
          Upload Settlement Sheet
        </button>
        <button
          onClick={() => setActiveSubTab('history')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeSubTab === 'history'
              ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs'
              : 'text-[#3A8067] hover:bg-[#E6F7EF] hover:text-[#025033]'
          }`}
        >
          Reconciliation History ({settlementHistory.length})
        </button>
      </div>

      {/* TAB 1: LIVE CONSIGNMENTS TABLE */}
      {activeSubTab === 'consignments' && (
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl overflow-hidden shadow-2xs">
          <div className="p-5 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
            <div>
              <h3 className="text-sm font-bold text-[#025033]">Courier Consignments &amp; Parcels</h3>
              <p className="text-xs text-[#3A8067]">Tracked deliveries across Pathao and connected couriers</p>
            </div>
            <button
              onClick={handleDownloadSampleSheet}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#CAE4D8] bg-[#E6F7EF] text-[#025033] text-xs font-bold hover:bg-[#CAE4D8] transition"
            >
              <DownloadCloudIcon className="w-3.5 h-3.5" />
              <span>Download Sample Pathao Sheet</span>
            </button>
          </div>

          {courierOrders.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-[#E6F7EF] text-[#025033] flex items-center justify-center">
                <CourierIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-[#025033]">No courier consignments recorded yet</p>
              <p className="text-xs text-[#3A8067] max-w-sm">
                Click &ldquo;Sync Consignments&rdquo; above to fetch your initial consignments from {providerName}.
              </p>
              <button
                onClick={handleSyncCourier}
                disabled={syncing}
                className="mt-2 px-4 py-2 rounded-xl bg-[#025033] text-[#FFFFFF] text-xs font-bold hover:bg-[#05572F] transition"
              >
                Sync Pathao Consignments Now
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAFCF9] border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Consignment / Tracking</th>
                    <th className="py-3 px-4">Order ID</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Shipping Destination</th>
                    <th className="py-3 px-4 text-right">COD Amount</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {courierOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#FAFCF9] transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-[#025033]">
                        {o.consignment_id || `SF-${o.id}`}
                      </td>
                      <td className="py-3.5 px-4 text-[#3A8067] font-medium">#{o.id}</td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-[#025033]">{o.customer_name || 'Walk-in Customer'}</span>
                          <span className="text-[11px] text-[#3A8067]">{o.customer_phone}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-[#3A8067] max-w-xs truncate">{o.shipping_address || 'Dhaka, Bangladesh'}</td>
                      <td className="py-3.5 px-4 text-right font-bold text-[#025033]">
                        ৳{((o.cod_amount || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                          o.status === 'delivered'
                            ? 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]'
                            : o.status === 'in_transit'
                            ? 'bg-[#FFF8E6] text-[#8C6D00] border-[#FFE699]'
                            : o.status === 'returned'
                            ? 'bg-[#FDE8E8] text-[#9B1C1C] border-[#F8B4B4]'
                            : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]'
                        }`}>
                          {o.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UPLOAD & AUTOMATED RECONCILIATION */}
      {activeSubTab === 'reconcile' && (
        <div className="flex flex-col gap-6">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl p-6 shadow-2xs flex flex-col gap-5">
            <div>
              <h3 className="text-sm font-bold text-[#025033]">Automated Settlement Sheet Reconciler</h3>
              <p className="text-xs text-[#3A8067] mt-0.5">
                Upload weekly settlement spreadsheets (.CSV or .XLSX) from Pathao, Steadfast, or RedX. The engine automatically matches consignments, posts cash collections, and records delivery charges.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-full sm:w-64">
                <label className="block text-xs font-bold text-[#025033] mb-1">Select Courier</label>
                <select
                  value={selectedCourier}
                  onChange={(e) => setSelectedCourier(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] focus:outline-none focus:border-[#025033]"
                >
                  <option value="pathao">Pathao Courier</option>
                  <option value="steadfast">Steadfast Courier</option>
                  <option value="redx">RedX Logistics</option>
                  <option value="sa_paribahan">SA Paribahan</option>
                </select>
              </div>

              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-[#025033] mb-1">Upload Settlement File (.CSV or .XLSX)</label>
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="w-full text-xs text-[#3A8067] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#025033] file:text-[#FFFFFF] hover:file:bg-[#05572F] file:cursor-pointer bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-1"
                />
              </div>
            </div>

            {uploading && (
              <div className="p-4 bg-[#E6F7EF] rounded-xl border border-[#CAE4D8] flex items-center gap-3">
                <div className="w-4 h-4 border-2 border-[#025033] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-[#025033]">
                  Parsing columns and matching consignments with double-entry database...
                </span>
              </div>
            )}
          </div>

          {/* PREVIEW SUMMARY & ROWS TABLE */}
          {previewData && (
            <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl overflow-hidden shadow-2xs flex flex-col gap-4">
              <div className="p-6 border-b border-[#E5EAE7] bg-[#FAFCF9] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-[#025033]">
                    Reconciliation Preview: {previewData.display_name || selectedCourier.toUpperCase()}
                  </h4>
                  <p className="text-xs text-[#3A8067] mt-0.5">
                    Found {previewData.rows?.length || 0} rows &bull; {previewData.summary?.matched || 0} matched with system orders
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setPreviewData(null)}
                    className="px-4 py-2 rounded-xl border border-[#E5EAE7] text-xs font-bold text-[#3A8067] hover:bg-[#FAFCF9] transition"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleCommitSettlement}
                    disabled={committing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] text-xs font-bold transition shadow-md disabled:opacity-50"
                  >
                    <CheckIcon className="w-4 h-4" />
                    <span>{committing ? 'Posting to Books...' : 'Commit & Reconcile to Ledger'}</span>
                  </button>
                </div>
              </div>

              {/* Financial Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-2">
                <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10px] font-bold text-[#3A8067] uppercase">Total COD Collected</span>
                  <p className="text-sm font-black text-[#025033] mt-0.5">
                    ৳{((previewData.summary?.total_cod_poisha || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10px] font-bold text-[#3A8067] uppercase">Total Courier Deductions</span>
                  <p className="text-sm font-black text-[#025033] mt-0.5">
                    ৳{((previewData.summary?.total_fees_poisha || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10px] font-bold text-[#3A8067] uppercase">Net Cash to Bank</span>
                  <p className="text-sm font-black text-[#025033] mt-0.5">
                    ৳{(((previewData.summary?.total_cod_poisha || 0) - (previewData.summary?.total_fees_poisha || 0)) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7]">
                  <span className="text-[10px] font-bold text-[#3A8067] uppercase">Matched Consignments</span>
                  <p className="text-sm font-black text-[#025033] mt-0.5">
                    {previewData.summary?.matched || 0} / {previewData.rows?.length || 0}
                  </p>
                </div>
              </div>

              {/* Parsed Rows */}
              <div className="overflow-x-auto max-h-96 px-6 pb-6">
                <table className="w-full text-left text-xs border border-[#E5EAE7] rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-[#FAFCF9] border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase text-[10px]">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Consignment ID</th>
                      <th className="py-2.5 px-3">Customer</th>
                      <th className="py-2.5 px-3 text-right">COD Collected</th>
                      <th className="py-2.5 px-3 text-right">Delivery Fee</th>
                      <th className="py-2.5 px-3 text-right">COD Fee</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAE7]">
                    {previewData.rows?.map((r: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[#FAFCF9]">
                        <td className="py-2 px-3 text-[#3A8067] font-mono">{r.row_no || idx + 1}</td>
                        <td className="py-2 px-3 font-mono font-bold text-[#025033]">{r.consignment_id}</td>
                        <td className="py-2 px-3 text-[#025033]">{r.customer_name || 'N/A'}</td>
                        <td className="py-2 px-3 text-right font-bold text-[#025033]">
                          ৳{((r.cod_collected || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-[#3A8067]">
                          ৳{((r.delivery_charge || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-[#3A8067]">
                          ৳{((r.cod_fee || 0) / 100).toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                            {r.status || 'Delivered'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AUDIT HISTORY */}
      {activeSubTab === 'history' && (
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl overflow-hidden shadow-2xs">
          <div className="p-5 border-b border-[#E5EAE7] bg-[#FAFCF9]">
            <h3 className="text-sm font-bold text-[#025033]">Settlement Reconciliation History</h3>
            <p className="text-xs text-[#3A8067]">Audit log of committed courier statements and postings</p>
          </div>

          {settlementHistory.length === 0 ? (
            <div className="p-12 text-center text-xs text-[#3A8067]">
              No settlement statements reconciled yet. Upload your first statement in the &ldquo;Upload Settlement Sheet&rdquo; tab.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#FAFCF9] border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase text-[10px]">
                    <th className="py-3 px-4">Upload ID</th>
                    <th className="py-3 px-4">Courier</th>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Rows Reconciled</th>
                    <th className="py-3 px-4">Date Committed</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {settlementHistory.map((u) => (
                    <tr key={u.id} className="hover:bg-[#FAFCF9]">
                      <td className="py-3 px-4 font-mono font-bold text-[#025033]">#{u.id}</td>
                      <td className="py-3 px-4 font-bold text-[#025033] uppercase">{u.courier}</td>
                      <td className="py-3 px-4 font-mono text-[#3A8067]">{u.filename || 'settlement.csv'}</td>
                      <td className="py-3 px-4 text-[#025033]">
                        {u.rows?.posted || u.row_count || 0} posted ({u.rows?.exceptions || 0} exceptions)
                      </td>
                      <td className="py-3 px-4 text-[#3A8067]">
                        {u.committed_at ? new Date(u.committed_at).toLocaleDateString() : 'Today'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                          Reconciled
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
}
