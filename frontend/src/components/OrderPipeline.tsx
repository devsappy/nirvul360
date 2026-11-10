'use client';

import React from 'react';
import { PipelineStage } from '@/types';
import { ChevronRightIcon } from './icons';

interface OrderPipelineProps {
  pipeline: PipelineStage[];
  netMarginPct: number;
}

export function OrderPipeline({ pipeline, netMarginPct }: OrderPipelineProps) {
  const stageDots: Record<string, string> = {
    placed: 'bg-[#3A8067]',
    in_transit: 'bg-[#05572F]',
    delivered: 'bg-[#025033]',
    settled: 'bg-[#CAE4D8]',
    reconciled: 'bg-[#00432C]',
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col gap-4 sm:gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-base font-bold text-[#025033] tracking-tight">Order & Profit Pipeline</h3>
          <p className="text-xs sm:text-sm text-[#3A8067] font-medium mt-0.5">From order placement to confirmed ledger profit across all couriers</p>
        </div>
        <button className="text-xs sm:text-sm font-semibold text-[#025033] bg-[#E6F7EF] hover:bg-[#CAE4D8] px-3.5 py-1.5 rounded-xl transition border border-[#CAE4D8] self-start sm:self-auto">
          Reconciliation funnel
        </button>
      </div>

      {/* Funnel Pipeline Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5">
        {pipeline.map((stage, idx) => {
          const dotColor = stageDots[stage.key] || 'bg-[#3A8067]';
          return (
            <div
              key={stage.key}
              className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[95px] sm:min-h-[105px] relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <span className={`w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full ${dotColor}`} />
                  <span className="text-[11px] sm:text-xs font-semibold text-[#3A8067]">{stage.label}</span>
                </div>
                {stage.pct && (
                  <span className="text-[11px] sm:text-xs font-bold text-[#3A8067]">{stage.pct}</span>
                )}
              </div>
              <div className="text-base sm:text-xl font-black text-[#025033] tracking-tight mt-1.5 break-words">
                {stage.count} {stage.key === 'in_transit' ? 'parcels' : stage.key === 'settled' ? 'settled' : stage.key === 'reconciled' ? 'clean' : 'orders'}
              </div>
              {idx < pipeline.length - 1 && (
                <div className="hidden lg:block absolute -right-2.5 top-1/2 -translate-y-1/2 z-10 text-[#3A8067]">
                  <ChevronRightIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* 6th box: Net Profit indicator */}
        <div className="bg-[#025033] text-[#FFFFFF] rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[95px] sm:min-h-[105px] border border-[#00432C]">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="w-2 sm:w-2.5 h-2 sm:h-2.5 rounded-full bg-[#CAE4D8]" />
            <span className="text-[11px] sm:text-xs font-semibold text-[#CAE4D8]">Net Profit</span>
          </div>
          <div className="text-base sm:text-lg font-black text-[#FFFFFF] tracking-tight mt-1.5 break-words">
            {netMarginPct.toFixed(1)}% margin
          </div>
        </div>
      </div>
    </div>
  );
}
