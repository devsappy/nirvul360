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
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between gap-4 sm:gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3 sm:pb-3.5">
        <h3 className="text-base font-bold text-[#025033] tracking-tight">Action items & alerts</h3>
        <span className="text-xs font-semibold bg-[#E6F7EF] text-[#025033] px-2.5 py-1 rounded-full border border-[#CAE4D8]">
          Automated checks
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Section 1: Parcels needing attention */}
        <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-4 flex flex-col gap-3 shadow-2xs">
          <div
            onClick={onOpenExceptions}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <AlertIcon className="w-4 h-4 text-[#025033]" />
              <span className="text-sm font-bold text-[#025033] group-hover:text-[#00432C] transition">
                Parcels needing attention
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#3A8067]">
              <span>{alerts.stuck_parcels + alerts.short_settlements}</span>
              <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5EAE7]">
            <span className="text-[#3A8067] font-medium">Stuck parcels ({alerts.stuck_parcels})</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#CAE4D8] text-[#025033] border border-[#3A8067]">
              Courier delay
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#3A8067] font-medium">Short settlements ({alerts.short_settlements})</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#CAE4D8] text-[#025033] border border-[#3A8067]">
              COD mismatch
            </span>
          </div>
        </div>

        {/* Section 2: Courier settlements */}
        <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-4 flex flex-col gap-3 shadow-2xs">
          <div
            onClick={onOpenSettlements}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <CourierIcon className="w-4 h-4 text-[#025033]" />
              <span className="text-sm font-bold text-[#025033] group-hover:text-[#00432C] transition">
                Courier settlements
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#3A8067]">
              <span>{alerts.courier_settlements_pending}</span>
              <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5EAE7]">
            <span className="text-[#3A8067] font-medium capitalize">pathao</span>
            <span className="text-sm font-bold text-[#025033]">৳2,138</span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-[#3A8067] font-medium capitalize">steadfast</span>
            <span className="text-sm font-bold text-[#025033]">৳3,517.5</span>
          </div>
        </div>

        {/* Section 3: Accounting checks */}
        <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-4 flex flex-col gap-3 shadow-2xs">
          <div
            onClick={onOpenProducts}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <SettingsIcon className="w-4 h-4 text-[#025033]" />
              <span className="text-sm font-bold text-[#025033] group-hover:text-[#00432C] transition">
                Accounting checks
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold text-[#3A8067]">
              <span>{alerts.missing_costs} pending</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-[#E5EAE7]">
            <span className="text-[#3A8067] font-medium">Products missing purchase price</span>
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              {alerts.missing_costs} SKU
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
