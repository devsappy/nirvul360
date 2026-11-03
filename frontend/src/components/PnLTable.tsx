'use client';

import React, { useState } from 'react';
import { PnLReport } from '@/types';
import { formatTaka } from '@/lib/api';
import { ChevronDownIcon, ChevronRightIcon, InfoIcon } from './icons';

interface PnLTableProps {
  pnl: PnLReport;
}

export function PnLTable({ pnl }: PnLTableProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    gross_sales: true,
    cogs: true,
    courier: true,
    ads: true,
    fixed: true,
  });

  const toggle = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = pnl.sections || {};

  return (
    <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-3">
        <div>
          <h3 className="text-sm font-bold text-stone-900 tracking-tight">
            Profit &amp; Loss Statement (Bangladeshi E-commerce)
          </h3>
          <p className="text-xs text-stone-500 font-medium">
            Revenue recognised on delivery only. All numbers derive strictly from balanced double-entry journals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
            {pnl.from} to {pnl.to}
          </span>
        </div>
      </div>

      {/* PnL Line Items */}
      <div className="flex flex-col text-xs divide-y divide-stone-100">
        {/* 1. Gross Sales */}
        {sections.gross_sales && (
          <div className="py-2">
            <div
              onClick={() => toggle('gross_sales')}
              className="flex items-center justify-between cursor-pointer font-bold text-stone-900 hover:text-stone-700 py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['gross_sales'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-stone-400" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>{sections.gross_sales.label}</span>
              </div>
              <span className="font-mono text-sm">{formatTaka(sections.gross_sales.amount)}</span>
            </div>
            {expandedSections['gross_sales'] && sections.gross_sales.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-stone-600">
                {sections.gross_sales.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono">{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Returns */}
        {sections.returns && sections.returns.amount !== 0 && (
          <div className="py-2 pl-6 flex items-center justify-between text-stone-600">
            <span>{sections.returns.label}</span>
            <span className="font-mono text-red-600">-{formatTaka(sections.returns.amount)}</span>
          </div>
        )}

        {/* Net Sales Subtotal */}
        <div className="py-2.5 flex items-center justify-between font-bold bg-[#FAF8F5] px-3 rounded-xl border border-[#EBE7DF]">
          <span className="text-stone-900">Net Sales</span>
          <span className="font-mono text-stone-900 text-sm">{formatTaka(pnl.net_sales)}</span>
        </div>

        {/* 2. COGS */}
        {sections.cogs && (
          <div className="py-2">
            <div
              onClick={() => toggle('cogs')}
              className="flex items-center justify-between cursor-pointer font-bold text-stone-900 hover:text-stone-700 py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['cogs'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-stone-400" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>{sections.cogs.label}</span>
              </div>
              <span className="font-mono text-sm text-stone-800">-{formatTaka(sections.cogs.amount)}</span>
            </div>
            {expandedSections['cogs'] && sections.cogs.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-stone-600">
                {sections.cogs.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gross Profit Subtotal */}
        <div className="py-2.5 flex items-center justify-between font-extrabold bg-[#FAF8F5] px-3 rounded-xl border border-[#EBE7DF]">
          <span className="text-stone-900">Gross Profit</span>
          <span className="font-mono text-stone-900 text-sm">{formatTaka(pnl.gross_profit)}</span>
        </div>

        {/* 3. Courier Costs */}
        {sections.courier && (
          <div className="py-2">
            <div
              onClick={() => toggle('courier')}
              className="flex items-center justify-between cursor-pointer font-semibold text-stone-800 hover:text-stone-600 py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['courier'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-stone-400" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>{sections.courier.label}</span>
              </div>
              <span className="font-mono text-stone-700">-{formatTaka(sections.courier.amount)}</span>
            </div>
            {expandedSections['courier'] && sections.courier.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-stone-500">
                {sections.courier.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Ad Spend */}
        {sections.ads && (
          <div className="py-2">
            <div
              onClick={() => toggle('ads')}
              className="flex items-center justify-between cursor-pointer font-semibold text-stone-800 hover:text-stone-600 py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['ads'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-stone-400" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>{sections.ads.label}</span>
              </div>
              <span className="font-mono text-stone-700">-{formatTaka(sections.ads.amount)}</span>
            </div>
            {expandedSections['ads'] && sections.ads.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-stone-500">
                {sections.ads.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Fixed Operating Costs */}
        {sections.fixed && (
          <div className="py-2">
            <div
              onClick={() => toggle('fixed')}
              className="flex items-center justify-between cursor-pointer font-semibold text-stone-800 hover:text-stone-600 py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['fixed'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-stone-400" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-stone-400" />
                )}
                <span>{sections.fixed.label}</span>
              </div>
              <span className="font-mono text-stone-700">-{formatTaka(sections.fixed.amount)}</span>
            </div>
            {expandedSections['fixed'] && sections.fixed.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-stone-500">
                {sections.fixed.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Packaging & Other Expenses */}
        {sections.packaging && (
          <div className="py-2 pl-6 flex items-center justify-between text-stone-600">
            <span>{sections.packaging.label}</span>
            <span className="font-mono">-{formatTaka(sections.packaging.amount)}</span>
          </div>
        )}

        {/* FINAL NET PROFIT / LOSS */}
        <div className="pt-3 pb-1 flex items-center justify-between font-black text-sm bg-stone-900 text-white p-3.5 rounded-xl mt-2">
          <div className="flex items-center gap-2">
            <span>Confirmed Net Profit / (Loss)</span>
            <span className="text-xs font-medium text-stone-400">
              ({pnl.margin !== null ? `${(pnl.margin * 100).toFixed(1)}% net margin` : '0%'})
            </span>
          </div>
          <span className={`font-mono text-base ${pnl.net_profit < 0 ? 'text-red-400' : 'text-[#E5FF44]'}`}>
            {formatTaka(pnl.net_profit)}
          </span>
        </div>

        {/* Owner Withdrawals Memo (Non-negotiable Rule 9) */}
        <div className="py-2.5 px-3 flex items-center justify-between text-xs text-stone-500 bg-amber-50/60 rounded-lg mt-2 border border-amber-200/50">
          <div className="flex items-center gap-2">
            <InfoIcon className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>
              <strong>Owner withdrawals:</strong> {formatTaka(pnl.owner_withdrawals)} (Reduces cash asset; strictly excluded from P&amp;L)
            </span>
          </div>
          <span className="text-[10px] font-bold text-amber-800 uppercase">Rule 9 Compliant</span>
        </div>
      </div>
    </div>
  );
}
