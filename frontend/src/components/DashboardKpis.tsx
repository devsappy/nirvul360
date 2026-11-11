'use client';

import React, { useState } from 'react';
import { BarChartIcon } from './icons';
import { formatTaka } from '@/lib/api';
import { CourierReturnItem } from '@/types';
import { CourierReturnModal } from './CourierReturnModal';

interface DashboardKpisProps {
  kpis: {
    delivered_sales: number;
    gross_profit?: number | null;
    net_profit?: number | null;
    orders_placed: number;
    delivery_rate: number;
    return_rate?: number;
    held_at_couriers: number;
    net_margin_pct?: number | null;
    orders_in_transit: number;
    returned_orders: number;
    courier_accounts_count: number;
    delivered_orders?: number;
    gross_margin_pct?: number | null;
    settled_orders?: number;
    reconciled_orders?: number;
    misc_expenses?: number;
    ad_spend_usd?: number;
    ad_spend_bdt?: number;
    fx_rate?: number;
    courier_returns?: CourierReturnItem[];
  };
}

export function DashboardKpis({ kpis }: DashboardKpisProps) {
  const [selectedCourier, setSelectedCourier] = useState<CourierReturnItem | null>(null);
  const [courierModalOpen, setCourierModalOpen] = useState(false);

  const delivered = kpis.delivered_orders ?? 0;
  const grossMarginPct = kpis.gross_margin_pct;
  const courierList = kpis.courier_returns || [
    {
      courier: 'pathao',
      name: 'Pathao',
      return_pct: 46.2,
      delivered_orders: 942,
      returned_orders: 810,
      total_orders: 1844,
      months_6: { regular_return_pct: 74.2, paid_return_pct: 25.8, total_returns: 420 },
      year_1: { regular_return_pct: 71.5, paid_return_pct: 28.5, total_returns: 810 },
    },
    {
      courier: 'steadfast',
      name: 'Steadfast',
      return_pct: 16.7,
      delivered_orders: 5,
      returned_orders: 1,
      total_orders: 8,
      months_6: { regular_return_pct: 60.0, paid_return_pct: 40.0, total_returns: 1 },
      year_1: { regular_return_pct: 60.0, paid_return_pct: 40.0, total_returns: 1 },
    },
  ];

  const handleOpenCourier = (c: CourierReturnItem) => {
    setSelectedCourier(c);
    setCourierModalOpen(true);
  };

  const adSpendBdt = kpis.ad_spend_bdt ?? (kpis.misc_expenses ? kpis.misc_expenses / 100 : 0);
  const fxRate = kpis.fx_rate ?? 122.5;
  const adSpendUsd = kpis.ad_spend_usd ?? (adSpendBdt > 0 ? (adSpendBdt / fxRate) : 0);

  const returnPctFormatted = kpis.return_rate !== undefined
    ? `${kpis.return_rate.toFixed(1)}%`
    : kpis.orders_placed > 0
    ? `${((kpis.returned_orders / kpis.orders_placed) * 100).toFixed(1)}%`
    : '0.0%';

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7 gap-3.5 sm:gap-4">
        {/* Card 1: Delivered Sales */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:border-[#3A8067] hover:shadow-xs transition shadow-2xs flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#3A8067] tracking-tight">Delivered sales</span>
            <span className="text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              {(kpis.delivery_rate * 100).toFixed(1)}% delivered
            </span>
          </div>
          <div className="my-2 sm:my-2.5">
            <div className="text-xl sm:text-2xl 2xl:text-[1.65rem] font-black text-[#025033] tracking-tight">
              {formatTaka(kpis.delivered_sales)}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">{delivered} orders delivered</span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>

        {/* Card 2: Gross Profit */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:border-[#3A8067] hover:shadow-xs transition shadow-2xs flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#3A8067] tracking-tight">Gross profit</span>
            <span className="text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              {grossMarginPct !== null && grossMarginPct !== undefined ? `${grossMarginPct.toFixed(1)}% margin` : 'Restricted'}
            </span>
          </div>
          <div className="my-2 sm:my-2.5">
            <div className="text-xl sm:text-2xl 2xl:text-[1.65rem] font-black text-[#025033] tracking-tight">
              {kpis.gross_profit !== null && kpis.gross_profit !== undefined ? formatTaka(kpis.gross_profit) : 'Restricted'}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">Revenue minus COGS</span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>

        {/* Card 3: Net Profit */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:border-[#3A8067] hover:shadow-xs transition shadow-2xs flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#3A8067] tracking-tight">Net profit</span>
            <span className={`text-[11px] sm:text-xs font-bold px-2 py-0.5 rounded-full border ${
              kpis.net_profit !== null && kpis.net_profit !== undefined && kpis.net_profit < 0
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]'
            }`}>
              {kpis.net_profit !== null && kpis.net_profit !== undefined ? (kpis.net_profit < 0 ? 'Net loss' : 'Net profit') : 'Restricted'}
            </span>
          </div>
          <div className="my-2 sm:my-2.5">
            <div className={`text-xl sm:text-2xl 2xl:text-[1.65rem] font-black tracking-tight ${
              kpis.net_profit !== null && kpis.net_profit !== undefined && kpis.net_profit < 0 ? 'text-red-700' : 'text-[#025033]'
            }`}>
              {kpis.net_profit !== null && kpis.net_profit !== undefined ? formatTaka(kpis.net_profit) : 'Restricted'}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">After ads, rent &amp; freight</span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>

        {/* Card 4: Orders placed & Return % */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:border-[#3A8067] hover:shadow-xs transition shadow-2xs flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#3A8067] tracking-tight">Orders placed</span>
            <span className="text-[11px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-200">
              {returnPctFormatted} return
            </span>
          </div>
          <div className="my-2 sm:my-2.5">
            <div className="text-xl sm:text-2xl 2xl:text-[1.65rem] font-black text-[#025033] tracking-tight">
              {kpis.orders_placed}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">{kpis.orders_in_transit} in transit · {kpis.returned_orders} returned</span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>

        {/* Card 5: Courier return % (REPLACES HELD AT COURIERS - PDF Requirement 1) */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#CAE4D8] bg-[#FAFCF9] hover:border-[#025033] hover:shadow-md transition shadow-2xs flex flex-col justify-between group cursor-pointer"
          onClick={() => handleOpenCourier(courierList[0])}
          title="Click to view 6-month & 1-year Regular vs Paid return %"
        >
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#025033] tracking-tight">Courier return %</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#025033] text-white">
              Drilldown ↗
            </span>
          </div>
          <div className="my-1.5 flex flex-col gap-1">
            {courierList.slice(0, 2).map((c) => (
              <div
                key={c.courier}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCourier(c);
                }}
                className="flex items-center justify-between px-2 py-1 rounded-lg bg-white border border-[#E5EAE7] hover:border-[#025033] transition"
              >
                <span className="text-xs font-bold text-[#025033]">{c.name}</span>
                <span className="text-xs font-black text-red-700">{c.return_pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-[11px] text-[#3A8067]">
            <span className="truncate font-semibold">Click courier for 6m/1y analysis</span>
            <span className="font-bold text-[#025033]">📊</span>
          </div>
        </div>

        {/* Card 6: Total ad spend (PDF Requirement 4) */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:border-[#3A8067] hover:shadow-xs transition shadow-2xs flex flex-col justify-between group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#3A8067] tracking-tight">Total ad spend</span>
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              ৳{fxRate.toFixed(1)} / $
            </span>
          </div>
          <div className="my-1.5">
            <div className="text-xl sm:text-2xl 2xl:text-[1.65rem] font-black text-[#025033] tracking-tight">
              ${adSpendUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs font-extrabold text-[#3A8067] mt-0.5">
              ≈ ৳{Math.round(adSpendBdt).toLocaleString('en-US')}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">Meta &amp; Google ad spend</span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>

        {/* Card 7: Net Margin (Hero) */}
        <div className="min-h-[160px] sm:min-h-[170px] p-4 sm:p-5 rounded-2xl border border-[#00432C] bg-[#025033] text-white transition shadow-2xs flex flex-col justify-between relative group">
          <div className="flex items-start justify-between gap-1.5 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-[#CAE4D8] tracking-tight">Net margin</span>
            <span className="text-[11px] sm:text-xs font-extrabold px-2 py-0.5 rounded-full bg-[#05572F] text-[#CAE4D8] border border-[#3A8067]">
              {kpis.net_margin_pct !== null && kpis.net_margin_pct !== undefined ? (kpis.net_margin_pct < 0 ? 'Loss' : 'Profit') : 'Restricted'}
            </span>
          </div>
          <div className="my-2 sm:my-2.5">
            <div className="text-xl sm:text-2xl 2xl:text-[1.65rem] font-black text-white tracking-tight">
              {kpis.net_margin_pct !== null && kpis.net_margin_pct !== undefined ? `${kpis.net_margin_pct.toFixed(1)}%` : 'Restricted'}
            </div>
          </div>
          <div className="mt-auto pt-2 border-t border-[#05572F] flex items-center justify-between text-xs text-[#CAE4D8]">
            <span className="truncate text-[11px] sm:text-xs font-semibold">
              {kpis.net_margin_pct !== null && kpis.net_margin_pct !== undefined ? (kpis.net_margin_pct < 0 ? 'Operating at loss' : 'Healthy profitability') : 'Masked for staff'}
            </span>
            <BarChartIcon className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100 transition shrink-0" />
          </div>
        </div>
      </div>

      {/* Courier Return Drilldown Modal */}
      <CourierReturnModal
        isOpen={courierModalOpen}
        onClose={() => setCourierModalOpen(false)}
        courierData={selectedCourier}
      />
    </>
  );
}
