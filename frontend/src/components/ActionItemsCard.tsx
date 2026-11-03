'use client';

import React from 'react';
import { AlertIcon, CourierIcon, SettingsIcon, ChevronRightIcon } from './icons';
import { ActionAlerts } from '@/types';

interface ActionItemsCardProps {
  alerts: ActionAlerts;
  onOpenExceptions: () => void;
  onOpenSettlements: () => void;
  onOpenProducts: () => void;
}

export function ActionItemsCard({
  alerts,
  onOpenExceptions,
  onOpenSettlements,
  onOpenProducts,
}: ActionItemsCardProps) {
  return (
    <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <h3 className="text-sm font-bold text-stone-900 tracking-tight">Action items & alerts</h3>
        <span className="text-[10px] font-semibold bg-stone-100 text-stone-700 px-2.5 py-1 rounded-full border border-stone-200">
          Automated checks
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Section 1: Parcels needing attention */}
        <div className="bg-[#FAF8F5] border border-[#EBE7DF] rounded-xl p-3.5 flex flex-col gap-2.5">
          <div
            onClick={onOpenExceptions}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <AlertIcon className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-bold text-stone-900 group-hover:text-amber-700 transition">
                Parcels needing attention
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-stone-500">
              <span>{alerts.stuck_parcels + alerts.short_settlements}</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
            <span className="text-stone-600 font-medium">Stuck parcels ({alerts.stuck_parcels})</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Courier delay
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-600 font-medium">Short settlements ({alerts.short_settlements})</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              COD mismatch
            </span>
          </div>
        </div>

        {/* Section 2: Courier settlements */}
        <div className="bg-[#FAF8F5] border border-[#EBE7DF] rounded-xl p-3.5 flex flex-col gap-2.5">
          <div
            onClick={onOpenSettlements}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <CourierIcon className="w-4 h-4 text-stone-700" />
              <span className="text-xs font-bold text-stone-900 group-hover:text-stone-700 transition">
                Courier settlements
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-stone-500">
              <span>{alerts.courier_settlements_pending}</span>
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
            <span className="text-stone-600 font-medium capitalize">pathao</span>
            <span className="text-xs font-bold text-stone-900">৳2,138</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-600 font-medium capitalize">steadfast</span>
            <span className="text-xs font-bold text-stone-900">৳3,517.5</span>
          </div>
        </div>

        {/* Section 3: Accounting checks */}
        <div className="bg-[#FAF8F5] border border-[#EBE7DF] rounded-xl p-3.5 flex flex-col gap-2.5">
          <div
            onClick={onOpenProducts}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-stone-700" />
              <span className="text-xs font-bold text-stone-900 group-hover:text-stone-700 transition">
                Accounting checks
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-stone-500">
              <span>{alerts.missing_costs} pending</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-200/60">
            <span className="text-stone-600 font-medium">Products missing purchase price</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200">
              {alerts.missing_costs} SKU
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
