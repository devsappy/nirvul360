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
    placed: 'bg-amber-400',
    in_transit: 'bg-blue-400',
    delivered: 'bg-emerald-500',
    settled: 'bg-teal-500',
    reconciled: 'bg-purple-500',
  };

  return (
    <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 className="text-sm font-bold text-stone-900 tracking-tight">Order & Profit Pipeline</h3>
          <p className="text-xs text-stone-500 font-medium">From order placement to confirmed ledger profit across all couriers</p>
        </div>
        <button className="text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 px-3 py-1.5 rounded-xl transition border border-stone-200">
          Reconciliation funnel
        </button>
      </div>

      {/* Funnel Pipeline Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {pipeline.map((stage, idx) => {
          const dotColor = stageDots[stage.key] || 'bg-stone-400';
          return (
            <div
              key={stage.key}
              className="bg-[#FAF8F5] border border-[#EBE7DF] rounded-xl p-3 flex flex-col justify-between min-h-[90px] relative"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${dotColor}`} />
                  <span className="text-[11px] font-semibold text-stone-600">{stage.label}</span>
                </div>
                {stage.pct && (
                  <span className="text-[10px] font-bold text-stone-400">{stage.pct}</span>
                )}
              </div>
              <div className="text-lg font-black text-stone-900 tracking-tight mt-1">
                {stage.count} {stage.key === 'in_transit' ? 'parcels' : stage.key === 'settled' ? 'settled' : stage.key === 'reconciled' ? 'clean' : 'orders'}
              </div>
              {idx < pipeline.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-stone-300">
                  <ChevronRightIcon className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {/* 6th box: Net Profit indicator */}
        <div className="bg-stone-950 text-white rounded-xl p-3 flex flex-col justify-between min-h-[90px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#E5FF44]" />
            <span className="text-[11px] font-semibold text-stone-300">Net Profit</span>
          </div>
          <div className="text-base font-black text-[#E5FF44] tracking-tight mt-1">
            {netMarginPct.toFixed(1)}% margin
          </div>
        </div>
      </div>
    </div>
  );
}
