'use client';

import React from 'react';
import { Order } from '@/types';
import { formatTaka } from '@/lib/api';
import { PlusIcon } from './icons';

interface DeliveriesListProps {
  deliveries?: Order[];
  onViewAllOrders: () => void;
  onOpenOrderModal: () => void;
  onOpenExpenseModal: () => void;
}

export function DeliveriesList({
  deliveries = [],
  onViewAllOrders,
  onOpenOrderModal,
  onOpenExpenseModal,
}: DeliveriesListProps) {
  const deliveryList: Order[] = Array.isArray(deliveries)
    ? deliveries
    : (Array.isArray((deliveries as any)?.rows) ? (deliveries as any).rows : []);

  const statusStyles: Record<string, string> = {
    placed: 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7]',
    in_transit: 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]',
    delivered: 'bg-[#CAE4D8] text-[#025033] border-[#3A8067]',
    returned: 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]',
  };

  const formatOrderDate = (dateStr?: string) => {
    if (!dateStr || dateStr.length < 10) return '—';
    const monthIdx = parseInt(dateStr.slice(5, 7), 10) - 1;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dateStr.slice(8, 10)} ${months[monthIdx] || ''}`;
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3">
        <h3 className="text-sm font-bold text-[#025033] tracking-tight">Today&apos;s deliveries</h3>
        <button
          onClick={onViewAllOrders}
          className="text-xs font-semibold text-[#3A8067] hover:text-[#025033] transition"
        >
          All orders &gt;
        </button>
      </div>

      {/* Deliveries Rows */}
      <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[280px]">
        {deliveryList.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#3A8067]">No deliveries recorded today</div>
        ) : (
          deliveryList.slice(0, 5).map((d: Order) => (
            <div
              key={d.id}
              className="flex items-center justify-between p-2.5 rounded-xl hover:bg-[#E6F7EF]/40 transition border border-transparent hover:border-[#E5EAE7]"
            >
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-medium text-[#3A8067] w-12 shrink-0">
                  {formatOrderDate(d.order_date || d.delivered_date)}
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[#025033] leading-tight">
                    {d.customer_name || 'Customer'}
                  </span>
                  <span className="text-[10px] text-[#3A8067] capitalize">
                    {d.courier || 'courier'} • {formatTaka(d.total)}
                  </span>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize ${
                  statusStyles[d.status] || 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7]'
                }`}
              >
                {d.status}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Quick Action Buttons */}
      <div className="flex items-center gap-2 pt-3 border-t border-[#E5EAE7]">
        <button
          onClick={onOpenOrderModal}
          className="flex-1 flex items-center justify-center gap-1.5 bg-[#FAFCF9] hover:bg-[#E6F7EF] border border-[#E5EAE7] text-[#025033] text-xs font-semibold py-2 rounded-xl transition"
        >
          <PlusIcon className="w-3.5 h-3.5 text-[#025033]" />
          <span>Order</span>
        </button>
        <button
          onClick={onOpenExpenseModal}
          className="flex-1 flex items-center justify-center gap-1.5 bg-[#FAFCF9] hover:bg-[#E6F7EF] border border-[#E5EAE7] text-[#025033] text-xs font-semibold py-2 rounded-xl transition"
        >
          <PlusIcon className="w-3.5 h-3.5 text-[#025033]" />
          <span>Expense</span>
        </button>
        <button
          onClick={onViewAllOrders}
          className="flex-1 flex items-center justify-center gap-1 bg-[#FAFCF9] hover:bg-[#E6F7EF] border border-[#E5EAE7] text-[#025033] text-xs font-semibold py-2 rounded-xl transition"
        >
          <span>Sheet</span>
        </button>
      </div>
    </div>
  );
}
