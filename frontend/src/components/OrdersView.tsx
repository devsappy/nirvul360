'use client';

import React, { useState, useRef } from 'react';
import { Order } from '@/types';
import { formatTaka, api, getApiBaseUrl } from '@/lib/api';
import { PlusIcon, DownloadCloudIcon } from './icons';

interface OrdersViewProps {
  orders?: Order[];
  onRefresh: () => void;
  onOpenOrderModal: () => void;
  showToast?: (msg: string) => void;
}

export function OrdersView({ orders = [], onRefresh, onOpenOrderModal, showToast }: OrdersViewProps) {
  const [filter, setFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const orderList: Order[] = Array.isArray(orders)
    ? orders
    : (Array.isArray((orders as any)?.rows) ? (orders as any).rows : []);
  const filtered = filter === 'all' ? orderList : orderList.filter((o: Order) => o.status === filter);

  const statusStyles: Record<string, string> = {
    placed: 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7]',
    in_transit: 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]',
    delivered: 'bg-[#CAE4D8] text-[#025033] border-[#3A8067]',
    returned: 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]',
    cancelled: 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]',
  };

  const handleUpdateStatus = async (orderId: number, nextStatus: string) => {
    setUpdatingId(orderId);
    try {
      await api.put(`/api/orders/${orderId}/status`, { status: nextStatus });
      onRefresh();
    } catch (err: any) {
      alert(`Error updating order status: ${err.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('courier', 'pathao');

    try {
      const base = getApiBaseUrl();
      const endpoint = base ? `${base}/api/orders/import-courier-csv` : '/api/orders/import-courier-csv';
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to import courier orders');
      }
      const msg = `Successfully imported ${data.imported || 0} orders (${data.delivered || 0} delivered, ${data.returned || 0} returned, ${data.in_transit || 0} in transit)!`;
      if (showToast) {
        showToast(msg);
      } else {
        alert(msg);
      }
      onRefresh();
    } catch (err: any) {
      const errDetail = err.message || 'Error uploading courier deliveries sheet';
      if (showToast) {
        showToast(errDetail);
      } else {
        alert(errDetail);
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-6 shadow-2xs flex flex-col gap-5">
      {/* Top Header & Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5EAE7] pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#025033] tracking-tight">Order Lifecycle &amp; Recognition</h2>
          <p className="text-xs text-[#3A8067] font-medium">
            Rule 2: Placed orders never enter revenue until courier confirms delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filters */}
          <div className="bg-[#E6F7EF] p-1 rounded-xl flex items-center gap-1 border border-[#CAE4D8]">
            {(['all', 'placed', 'in_transit', 'delivered', 'returned'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                  filter === s
                    ? 'bg-[#025033] text-[#FFFFFF] shadow-xs font-bold'
                    : 'text-[#3A8067] hover:text-[#025033]'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".csv"
            className="hidden"
          />

          <button
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex items-center gap-1.5 bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] border border-[#CAE4D8] font-semibold text-xs px-3 py-2 rounded-xl transition shadow-2xs disabled:opacity-50"
            title="Import deliveries CSV from Pathao, Steadfast or RedX"
          >
            <DownloadCloudIcon className="w-3.5 h-3.5" />
            <span>{isImporting ? 'Importing Deliveries...' : 'Import Courier CSV'}</span>
          </button>

          <button
            onClick={onOpenOrderModal}
            className="flex items-center gap-1.5 bg-[#025033] text-[#FFFFFF] font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs hover:bg-[#05572F]"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Create Order</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase tracking-wider text-[10px]">
              <th className="pb-3 pl-2">Order ID</th>
              <th className="pb-3">Date</th>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Courier</th>
              <th className="pb-3">Total Amount</th>
              <th className="pb-3">Status</th>
              <th className="pb-3 text-right pr-2">Quick Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5EAE7]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-[#3A8067]">
                  No orders found in this status.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className="hover:bg-[#E6F7EF]/40 transition">
                  <td className="py-3.5 pl-2 font-mono font-bold text-[#025033]">
                    {o.external_id || `#ORD-${o.id}`}
                  </td>
                  <td className="py-3.5 text-[#3A8067]">{o.order_date}</td>
                  <td className="py-3.5">
                    <div className="font-semibold text-[#025033]">{o.customer_name || 'Guest'}</div>
                    <div className="text-[10px] text-[#3A8067]">{o.customer_phone}</div>
                  </td>
                  <td className="py-3.5 font-medium capitalize text-[#025033]">{o.courier || 'courier'}</td>
                  <td className="py-3.5 font-mono font-bold text-[#025033]">{formatTaka(o.total)}</td>
                  <td className="py-3.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                        statusStyles[o.status] || 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7]'
                      }`}
                    >
                      {o.status.replace('_', ' ')}
                    </span>
                    {o.posting_state === 'held' && (
                      <span className="ml-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[#CAE4D8] text-[#025033] border border-[#3A8067]">
                        Price Held
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 text-right pr-2">
                    {o.status === 'placed' && (
                      <button
                        onClick={() => handleUpdateStatus(o.id, 'in_transit')}
                        disabled={updatingId === o.id}
                        className="text-[11px] font-bold bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] border border-[#CAE4D8] px-2.5 py-1 rounded-lg transition"
                      >
                        Ship Parcel &rarr;
                      </button>
                    )}
                    {o.status === 'in_transit' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleUpdateStatus(o.id, 'delivered')}
                          disabled={updatingId === o.id}
                          className="text-[11px] font-bold bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] px-2.5 py-1 rounded-lg transition"
                        >
                          Mark Delivered
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(o.id, 'returned')}
                          disabled={updatingId === o.id}
                          className="text-[11px] font-bold bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] px-2 py-1 rounded-lg transition"
                        >
                          Returned
                        </button>
                      </div>
                    )}
                    {o.status === 'delivered' && (
                      <span className="text-[11px] text-[#025033] font-semibold">✓ Revenue Posted</span>
                    )}
                    {o.status === 'returned' && (
                      <span className="text-[11px] text-[#3A8067] font-semibold">✓ Freight Charged</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
