'use client';

import React, { useState } from 'react';
import { Order } from '@/types';
import { formatTaka, api } from '@/lib/api';
import { PlusIcon } from './icons';

interface OrdersViewProps {
  orders?: Order[];
  onRefresh: () => void;
  onOpenOrderModal: () => void;
}

export function OrdersView({ orders = [], onRefresh, onOpenOrderModal }: OrdersViewProps) {
  const [filter, setFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const orderList: Order[] = Array.isArray(orders)
    ? orders
    : (Array.isArray((orders as any)?.rows) ? (orders as any).rows : []);
  const filtered = filter === 'all' ? orderList : orderList.filter((o: Order) => o.status === filter);

  const statusStyles: Record<string, string> = {
    placed: 'bg-stone-100 text-stone-700 border-stone-200',
    in_transit: 'bg-blue-50 text-blue-700 border-blue-200',
    delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    returned: 'bg-red-50 text-red-700 border-red-200',
    cancelled: 'bg-stone-100 text-stone-400 border-stone-200',
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

  return (
    <div className="bg-white border border-[#E8E4DA] rounded-2xl p-6 shadow-2xs flex flex-col gap-5">
      {/* Top Header & Filter Pills */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900 tracking-tight">Order Lifecycle &amp; Recognition</h2>
          <p className="text-xs text-stone-500 font-medium">
            Rule 2: Placed orders never enter revenue until courier confirms delivery.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filters */}
          <div className="bg-[#FAF8F5] p-1 rounded-xl flex items-center gap-1 border border-[#EBE7DF]">
            {(['all', 'placed', 'in_transit', 'delivered', 'returned'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                  filter === s
                    ? 'bg-stone-900 text-white shadow-xs font-bold'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>

          <button
            onClick={onOpenOrderModal}
            className="flex items-center gap-1.5 bg-stone-900 text-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-xs hover:bg-black"
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
            <tr className="border-b border-stone-100 text-stone-400 font-semibold uppercase tracking-wider text-[10px]">
              <th className="pb-3 pl-2">Order ID</th>
              <th className="pb-3">Date</th>
              <th className="pb-3">Customer</th>
              <th className="pb-3">Courier</th>
              <th className="pb-3">Total Amount</th>
              <th className="pb-3">Status</th>
              <th className="pb-3 text-right pr-2">Quick Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-stone-400">
                  No orders found in this status.
                </td>
              </tr>
            ) : (
              filtered.map((o) => (
                <tr key={o.id} className="hover:bg-stone-50/70 transition">
                  <td className="py-3.5 pl-2 font-mono font-bold text-stone-900">
                    {o.external_id || `#ORD-${o.id}`}
                  </td>
                  <td className="py-3.5 text-stone-500">{o.order_date}</td>
                  <td className="py-3.5">
                    <div className="font-semibold text-stone-900">{o.customer_name || 'Guest'}</div>
                    <div className="text-[10px] text-stone-400">{o.customer_phone}</div>
                  </td>
                  <td className="py-3.5 font-medium capitalize text-stone-700">{o.courier || 'courier'}</td>
                  <td className="py-3.5 font-mono font-bold text-stone-900">{formatTaka(o.total)}</td>
                  <td className="py-3.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                        statusStyles[o.status] || 'bg-stone-100 text-stone-600 border-stone-200'
                      }`}
                    >
                      {o.status.replace('_', ' ')}
                    </span>
                    {o.posting_state === 'held' && (
                      <span className="ml-1 text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Price Held
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 text-right pr-2">
                    {o.status === 'placed' && (
                      <button
                        onClick={() => handleUpdateStatus(o.id, 'in_transit')}
                        disabled={updatingId === o.id}
                        className="text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-lg transition"
                      >
                        Ship Parcel &rarr;
                      </button>
                    )}
                    {o.status === 'in_transit' && (
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleUpdateStatus(o.id, 'delivered')}
                          disabled={updatingId === o.id}
                          className="text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-lg transition"
                        >
                          Mark Delivered
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(o.id, 'returned')}
                          disabled={updatingId === o.id}
                          className="text-[11px] font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-2 py-1 rounded-lg transition"
                        >
                          Returned
                        </button>
                      </div>
                    )}
                    {o.status === 'delivered' && (
                      <span className="text-[11px] text-emerald-600 font-semibold">✓ Revenue Posted</span>
                    )}
                    {o.status === 'returned' && (
                      <span className="text-[11px] text-red-600 font-semibold">✓ Freight Charged</span>
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
