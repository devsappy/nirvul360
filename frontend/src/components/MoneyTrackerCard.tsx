'use client';

import React from 'react';
import { formatTaka } from '@/lib/api';
import { InfoIcon } from './icons';

interface MoneyTrackerCardProps {
  cash?: {
    as_of: string;
    cash_in_hand: number;
    cash_accounts: Array<{ id: number; name: string; kind: string; balance: number }>;
    held_at_couriers: number;
    claims_against_couriers: number;
    owed_to_suppliers: number;
    stock: { total: number; on_hand: number; in_transit: number; unvalued_products: number; unvalued_units: number };
    net_liquid: number;
  } | null;
  onOpenMoneyTab: () => void;
}

/**
 * Complete money position on the dashboard: every taka the business owns or owes,
 * sourced from the double-entry ledger. Profit and cash are never conflated.
 */
export function MoneyTrackerCard({ cash, onOpenMoneyTab }: MoneyTrackerCardProps) {
  if (!cash) return null;

  const accounts = Array.isArray(cash.cash_accounts) ? cash.cash_accounts : [];
  const stock = cash.stock || { total: 0, on_hand: 0, in_transit: 0, unvalued_products: 0, unvalued_units: 0 };

  const rows = [
    {
      label: 'Cash in hand & bank',
      value: cash.cash_in_hand,
      hint: `${accounts.length} accounts (bank, bKash, Nagad, cash)`,
      tone: 'green' as const,
    },
    {
      label: 'Held at couriers (COD)',
      value: cash.held_at_couriers,
      hint: 'Collected by couriers, awaiting settlement payout',
      tone: 'amber' as const,
    },
    {
      label: 'Claims against couriers',
      value: cash.claims_against_couriers,
      hint: 'Filed claims for lost parcels & short settlements',
      tone: 'amber' as const,
    },
    {
      label: 'Stock value (on hand + in transit)',
      value: stock.total,
      hint: `On hand ${formatTaka(stock.on_hand)} • In transit ${formatTaka(stock.in_transit)}${
        stock.unvalued_units > 0 ? ` • ${stock.unvalued_units} units uncosted` : ''
      }`,
      tone: 'neutral' as const,
    },
    {
      label: 'Owed to suppliers',
      value: -cash.owed_to_suppliers,
      hint: 'Unpaid supplier payables (money leaving)',
      tone: 'red' as const,
    },
  ];

  const toneClasses: Record<string, string> = {
    green: 'text-[#025033]',
    amber: 'text-[#8a6d1a]',
    red: 'text-[#a33]',
    neutral: 'text-[#025033]',
  };

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col gap-4 sm:gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5EAE7] pb-3 sm:pb-3.5">
        <div>
          <h3 className="text-base font-bold text-[#025033] tracking-tight">Where the money is</h3>
          <p className="text-xs sm:text-sm text-[#3A8067] font-medium mt-0.5">
            Every taka tracked in the double-entry ledger — as of {cash.as_of}.
          </p>
        </div>
        <button
          onClick={onOpenMoneyTab}
          className="text-xs sm:text-sm font-semibold text-[#3A8067] hover:text-[#025033] transition self-start sm:self-auto"
        >
          Money tab &gt;
        </button>
      </div>

      {/* Cash account tiles */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {accounts.slice(0, 4).map((a) => (
            <div key={a.id} className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 sm:px-3.5 py-2.5 sm:py-3 flex flex-col gap-1 sm:gap-1.5 shadow-2xs">
              <span className="text-[10px] sm:text-xs font-bold uppercase text-[#3A8067] tracking-wider">{a.kind}</span>
              <span className="text-xs sm:text-sm font-semibold text-[#025033] truncate leading-tight">{a.name}</span>
              <span className="text-sm sm:text-base font-black text-[#025033] font-mono mt-0.5 break-all">{formatTaka(a.balance)}</span>
            </div>
          ))}
          <div className="bg-[#025033] text-[#FFFFFF] rounded-xl px-3 sm:px-3.5 py-2.5 sm:py-3 flex flex-col gap-1 sm:gap-1.5 border border-[#00432C] shadow-2xs">
            <span className="text-[10px] sm:text-xs font-bold uppercase text-[#CAE4D8] tracking-wider">Total cash</span>
            <span className="text-xs sm:text-sm font-semibold text-[#CAE4D8] truncate leading-tight">All accounts</span>
            <span className="text-sm sm:text-base font-black text-[#FFFFFF] font-mono mt-0.5 break-all">{formatTaka(cash.cash_in_hand)}</span>
          </div>
        </div>
      )}

      {/* Money position rows */}
      <div className="flex flex-col divide-y divide-[#E5EAE7]">
        {rows.map((r) => (
          <div key={r.label} className="py-2.5 sm:py-3 flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs sm:text-sm text-[#025033]">{r.label}</span>
              <span className="text-[11px] sm:text-xs text-[#3A8067] truncate mt-0.5">{r.hint}</span>
            </div>
            <span className={`font-mono text-sm sm:text-base font-bold shrink-0 ${toneClasses[r.tone]} ${r.value < 0 ? 'opacity-80' : ''}`}>
              {formatTaka(r.value)}
            </span>
          </div>
        ))}

        {/* Net liquid position */}
        <div className="py-3 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 sm:px-4 mt-2.5 sm:mt-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <InfoIcon className="w-4 h-4 text-[#025033] shrink-0" />
            <span className="font-bold text-[#025033] text-xs sm:text-sm">
              Net liquid position
              <span className="font-medium text-[#3A8067] ml-1.5 sm:ml-2 text-[11px] sm:text-xs block sm:inline">(cash + held at couriers − supplier payables)</span>
            </span>
          </div>
          <span className="font-mono text-sm sm:text-base font-black text-[#025033]">{formatTaka(cash.net_liquid)}</span>
        </div>
      </div>
    </div>
  );
}
