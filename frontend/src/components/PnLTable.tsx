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
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
      {/* Table Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5EAE7] pb-3">
        <div>
          <h3 className="text-sm font-bold text-[#025033] tracking-tight">
            Profit &amp; Loss Statement (Bangladeshi E-commerce)
          </h3>
          <p className="text-xs text-[#3A8067] font-medium">
            Revenue recognised on delivery only. All numbers derive strictly from balanced double-entry journals.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[#3A8067] bg-[#FAFCF9] px-2.5 py-1 rounded-full border border-[#E5EAE7]">
            {pnl.from} to {pnl.to}
          </span>
        </div>
      </div>

      {/* PnL Line Items */}
      <div className="flex flex-col text-xs divide-y divide-[#E5EAE7]">
        {/* 1. Gross Sales */}
        {sections.gross_sales && (
          <div className="py-2">
            <div
              onClick={() => toggle('gross_sales')}
              className="flex items-center justify-between cursor-pointer font-bold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['gross_sales'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.gross_sales.label}</span>
              </div>
              <span className="font-mono text-sm text-[#025033]">{formatTaka(sections.gross_sales.amount)}</span>
            </div>
            {expandedSections['gross_sales'] && sections.gross_sales.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.gross_sales.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Returns */}
        {sections.returns && sections.returns.amount !== 0 && (
          <div className="py-2 pl-6 flex items-center justify-between text-[#3A8067]">
            <span>{sections.returns.label}</span>
            <span className="font-mono text-[#025033]">-{formatTaka(sections.returns.amount)}</span>
          </div>
        )}

        {/* Held for review (excluded from profit until resolved) */}
        {sections.held && sections.held.amount !== 0 && (
          <div className="py-2 pl-6 flex items-center justify-between text-[#3A8067]">
            <span>{sections.held.label}</span>
            <span className="font-mono text-[#025033]">-{formatTaka(sections.held.amount)}</span>
          </div>
        )}

        {/* Net Sales Subtotal */}
        <div className="py-2.5 flex items-center justify-between font-bold bg-[#FAFCF9] px-3 rounded-xl border border-[#E5EAE7]">
          <span className="text-[#025033]">Net Sales</span>
          <span className="font-mono text-[#025033] text-sm">{formatTaka(pnl.net_sales)}</span>
        </div>

        {/* 2. COGS */}
        {sections.cogs && (
          <div className="py-2">
            <div
              onClick={() => toggle('cogs')}
              className="flex items-center justify-between cursor-pointer font-bold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['cogs'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.cogs.label}</span>
              </div>
              <span className="font-mono text-sm text-[#025033]">-{formatTaka(sections.cogs.amount)}</span>
            </div>
            {expandedSections['cogs'] && sections.cogs.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.cogs.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Gross Profit Subtotal */}
        <div className="py-2.5 flex items-center justify-between font-extrabold bg-[#FAFCF9] px-3 rounded-xl border border-[#E5EAE7]">
          <span className="text-[#025033]">Gross Profit</span>
          <span className="font-mono text-[#025033] text-sm">{formatTaka(pnl.gross_profit)}</span>
        </div>

        {/* 3. Courier Costs */}
        {sections.courier && (
          <div className="py-2">
            <div
              onClick={() => toggle('courier')}
              className="flex items-center justify-between cursor-pointer font-semibold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['courier'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.courier.label}</span>
              </div>
              <span className="font-mono text-[#025033]">-{formatTaka(sections.courier.amount)}</span>
            </div>
            {expandedSections['courier'] && sections.courier.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.courier.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">-{formatTaka(l.amount)}</span>
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
              className="flex items-center justify-between cursor-pointer font-semibold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['ads'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.ads.label}</span>
              </div>
              <span className="font-mono text-[#025033]">-{formatTaka(sections.ads.amount)}</span>
            </div>
            {expandedSections['ads'] && sections.ads.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.ads.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">-{formatTaka(l.amount)}</span>
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
              className="flex items-center justify-between cursor-pointer font-semibold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['fixed'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.fixed.label}</span>
              </div>
              <span className="font-mono text-[#025033]">-{formatTaka(sections.fixed.amount)}</span>
            </div>
            {expandedSections['fixed'] && sections.fixed.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.fixed.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 6. Packaging & Fulfilment */}
        {sections.packaging && (
          <div className="py-2 pl-6 flex items-center justify-between text-[#3A8067]">
            <span>{sections.packaging.label}</span>
            <span className="font-mono text-[#025033]">-{formatTaka(sections.packaging.amount)}</span>
          </div>
        )}

        {/* 7. Other / Miscellaneous Expenses (misc expense records, write-offs, bad debt) */}
        {sections.other && (
          <div className="py-2">
            <div
              onClick={() => toggle('other')}
              className="flex items-center justify-between cursor-pointer font-semibold text-[#025033] hover:text-[#00432C] py-1"
            >
              <div className="flex items-center gap-1.5">
                {expandedSections['other'] ? (
                  <ChevronDownIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                ) : (
                  <ChevronRightIcon className="w-3.5 h-3.5 text-[#3A8067]" />
                )}
                <span>{sections.other.label}</span>
              </div>
              <span className="font-mono text-[#025033]">-{formatTaka(sections.other.amount)}</span>
            </div>
            {expandedSections['other'] && sections.other.lines?.length > 0 && (
              <div className="pl-6 pt-1 space-y-1 text-[#3A8067]">
                {sections.other.lines.map((l, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span>{l.label}</span>
                    <span className="font-mono text-[#025033]">-{formatTaka(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FINAL NET PROFIT / LOSS */}
        <div className="pt-3 pb-1 flex items-center justify-between font-black text-sm bg-[#025033] text-[#FFFFFF] p-3.5 rounded-xl mt-2 border border-[#00432C]">
          <div className="flex items-center gap-2">
            <span>Confirmed Net Profit / (Loss)</span>
            <span className="text-xs font-medium text-[#CAE4D8]">
              ({pnl.margin !== null ? `${(pnl.margin * 100).toFixed(1)}% net margin` : '0%'})
            </span>
          </div>
          <span className="font-mono text-base text-[#FFFFFF]">
            {formatTaka(pnl.net_profit)}
          </span>
        </div>

        {/* Owner Withdrawals Memo (Non-negotiable Rule 9) */}
        <div className="py-2.5 px-3 flex items-center justify-between text-xs text-[#025033] bg-[#E6F7EF] rounded-lg mt-2 border border-[#CAE4D8]">
          <div className="flex items-center gap-2">
            <InfoIcon className="w-3.5 h-3.5 text-[#025033] shrink-0" />
            <span>
              <strong>Owner withdrawals:</strong> {formatTaka(pnl.owner_withdrawals)} (Reduces cash asset; strictly excluded from P&amp;L)
            </span>
          </div>
          <span className="text-[10px] font-bold text-[#025033] uppercase">Rule 9 Compliant</span>
        </div>
      </div>
    </div>
  );
}
