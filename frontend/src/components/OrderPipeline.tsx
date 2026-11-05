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
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-sm font-bold text-[#025033] tracking-tight">Order & Profit Pipeline</h3>
          <p className="text-xs text-[#3A8067] font-medium">From order placement to confirmed ledger profit across all couriers</p>
        </div>
        <button className="text-xs font-semibold text-[#025033] bg-[#E6F7EF] hover:bg-[#CAE4D8] px-3 py-1.5 rounded-xl transition border border-[#CAE4D8]">
          Reconciliation funnel
        </button>
      </div>

      {/* Funnel Pipeline Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {pipeline.map((stage, idx) => {
          const dotColor = stageDots[stage.key] || 'bg-[#3A8067]';
          return (
            <div
              key={stage.key}
              className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-3 flex flex-col justify-between min-h-[90px] relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-[11px] font-semibold text-[#3A8067]">{stage.label}</span>
                </div>
                {stage.pct && (
                  <span className="text-[10px] font-bold text-[#3A8067]">{stage.pct}</span>
                )}
              </div>
              <div className="text-lg font-black text-[#025033] tracking-tight mt-1">
                {stage.count} {stage.key === 'in_transit' ? 'parcels' : stage.key === 'settled' ? 'settled' : stage.key === 'reconciled' ? 'clean' : 'orders'}
              </div>
              {idx < pipeline.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-[#3A8067]">
                  <ChevronRightIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* 6th box: Net Profit indicator */}
        <div className="bg-[#025033] text-[#FFFFFF] rounded-xl p-3 flex flex-col justify-between min-h-[90px] border border-[#00432C]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#CAE4D8]" />
            <span className="text-[11px] font-semibold text-[#CAE4D8]">Net Profit</span>
          </div>
          <div className="text-base font-black text-[#FFFFFF] tracking-tight mt-1">
            {netMarginPct.toFixed(1)}% margin
          </div>
        </div>
      </div>
    </div>
  );
}
