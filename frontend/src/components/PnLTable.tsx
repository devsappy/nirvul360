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
    other: true,
  });

  const toggle = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const sections = pnl.sections || {};

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col gap-4 sm:gap-5">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-[#E5EAE7] pb-3 sm:pb-3.5">
        <div>
          <h3 className="text-base font-bold text-[#025033] tracking-tight">
            Profit &amp; Loss Statement (Bangladeshi E-commerce)
          </h3>
          <p className="text-xs sm:text-sm text-[#3A8067] font-medium mt-0.5">
            Revenue recognised on delivery only. All numbers derive strictly from balanced double-entry journals.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-semibold text-[#3A8067] bg-[#FAFCF9] px-3 py-1 rounded-full border border-[#E5EAE7]">
            {pnl.from} to {pnl.to}
          </span>
        </div>
      </div>

      {/* PnL Line Items */}
      <div className="flex flex-col divide-y divide-[#E5EAE7]">
        {/* 1. Gross Sales */}
        {sections.gross_sales && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('gross_sales')}
              className="flex items-center justify-between cursor-pointer font-bold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['gross_sales'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.gross_sales.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">{formatTaka(sections.gross_sales.amount)}</span>
            </div>
            {expandedSections['gross_sales'] && sections.gross_sales.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.gross_sales.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Returns */}
        {sections.returns && sections.returns.amount !== 0 && (
          <div className="py-2.5 pl-6 flex items-center justify-between text-xs text-[#3A8067]">
            <span>{sections.returns.label}</span>
            <span className="font-mono text-sm text-[#025033]">-{formatTaka(sections.returns.amount)}</span>
          </div>
        )}

        {/* Held for review (excluded from profit until resolved) */}
        {sections.held && sections.held.amount !== 0 && (
          <div className="py-2.5 pl-6 flex items-center justify-between text-xs text-[#3A8067]">
            <span>{sections.held.label}</span>
            <span className="font-mono text-sm text-[#025033]">-{formatTaka(sections.held.amount)}</span>
          </div>
        )}

        {/* Net Sales Subtotal */}
        <div className="py-3 flex items-center justify-between font-bold text-sm bg-[#FAFCF9] px-3.5 rounded-xl border border-[#E5EAE7]">
          <span className="text-[#025033]">Net Sales</span>
          <span className="font-mono text-[#025033] text-base">{formatTaka(pnl.net_sales)}</span>
        </div>

        {/* 2. COGS */}
        {sections.cogs && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('cogs')}
              className="flex items-center justify-between cursor-pointer font-bold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['cogs'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.cogs.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">-{formatTaka(sections.cogs.amount)}</span>
            </div>
            {expandedSections['cogs'] && sections.cogs.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.cogs.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gross Profit Subtotal */}
        <div className="py-3 flex items-center justify-between font-extrabold text-sm bg-[#FAFCF9] px-3.5 rounded-xl border border-[#E5EAE7]">
          <span className="text-[#025033]">Gross Profit</span>
          <span className="font-mono text-[#025033] text-base">{formatTaka(pnl.gross_profit)}</span>
        </div>

        {/* 3. Courier Costs */}
        {sections.courier && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('courier')}
              className="flex items-center justify-between cursor-pointer font-semibold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['courier'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.courier.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">-{formatTaka(sections.courier.amount)}</span>
            </div>
            {expandedSections['courier'] && sections.courier.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.courier.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Ad Spend */}
        {sections.ads && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('ads')}
              className="flex items-center justify-between cursor-pointer font-semibold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['ads'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.ads.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">-{formatTaka(sections.ads.amount)}</span>
            </div>
            {expandedSections['ads'] && sections.ads.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.ads.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. Fixed Operating Costs */}
        {sections.fixed && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('fixed')}
              className="flex items-center justify-between cursor-pointer font-semibold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['fixed'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.fixed.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">-{formatTaka(sections.fixed.amount)}</span>
            </div>
            {expandedSections['fixed'] && sections.fixed.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.fixed.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Packaging & Fulfilment */}
        {sections.packaging && (
          <div className="py-2.5 pl-6 flex items-center justify-between text-xs text-[#3A8067]">
            <span>{sections.packaging.label}</span>
            <span className="font-mono text-sm text-[#025033]">-{formatTaka(sections.packaging.amount)}</span>
          </div>
        )}

        {/* 7. Other / Miscellaneous Expenses */}
        {sections.other && (
          <div className="py-2.5">
            <div
              onClick={() => toggle('other')}
              className="flex items-center justify-between cursor-pointer font-semibold text-sm text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-2">
                {expandedSections['other'] ? (
                  <ChevronDownIcon className="w-4 h-4 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-[#3A8067]" />
                )}
                <span>{sections.other.label}</span>
              </div>
              <span className="font-mono text-base text-[#025033]">-{formatTaka(sections.other.amount)}</span>
            </div>
            {expandedSections['other'] && sections.other.lines?.length > 0 && (
              <div className="pl-6 pt-1.5 space-y-1.5 text-xs text-[#3A8067]">
                {sections.other.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-sm text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FINAL NET PROFIT / LOSS */}
        <div className="pt-3.5 pb-2 flex items-center justify-between font-black text-sm bg-[#025033] text-[#FFFFFF] p-4 rounded-xl mt-2.5 border border-[#00432C] shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="text-base font-bold">Confirmed Net Profit / (Loss)</span>
            <span className="text-xs font-medium text-[#CAE4D8]">
              ({pnl.margin !== null ? `${(pnl.margin * 100).toFixed(1)}% net margin` : '0%'})
            </span>
          </div>
          <span className="font-mono text-lg text-[#FFFFFF]">
            {formatTaka(pnl.net_profit)}
          </span>
        </div>

        {/* Owner Withdrawals Memo (Non-negotiable Rule 9) */}
        <div className="py-3 px-3.5 flex items-center justify-between text-xs text-[#025033] bg-[#E6F7EF] rounded-xl mt-2.5 border border-[#CAE4D8]">
          <div className="flex items-center gap-2.5">
            <InfoIcon className="w-4 h-4 text-[#025033] shrink-0" />
            <span>
              <strong>Owner withdrawals:</strong> {formatTaka(pnl.owner_withdrawals)} (Reduces cash asset; strictly excluded from P&amp;L)
            </span>
          </div>
          <span className="text-xs font-bold text-[#025033] uppercase tracking-wider">Rule 9 Compliant</span>
        </div>
      </div>
    </div>
  );
}
