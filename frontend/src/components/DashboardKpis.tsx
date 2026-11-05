'use client';

import React from 'react';
import { BarChartIcon } from './icons';
import { formatTaka } from '@/lib/api';

interface DashboardKpisProps {
  kpis: {
    delivered_sales: number;
    gross_profit: number;
    net_profit: number;
    orders_placed: number;
    delivery_rate: number;
    held_at_couriers: number;
    net_margin_pct: number;
    orders_in_transit: number;
    returned_orders: number;
    courier_accounts_count: number;
    delivered_orders?: number;
    gross_margin_pct?: number;
    settled_orders?: number;
    reconciled_orders?: number;
    misc_expenses?: number;
  };
}

export function DashboardKpis({ kpis }: DashboardKpisProps) {
  const delivered = kpis.delivered_orders ?? 0;
  const grossMarginPct = kpis.gross_margin_pct ?? 0;
  const settled = kpis.settled_orders ?? 0;

  const cards = [
    {
      title: 'Delivered sales',
      value: formatTaka(kpis.delivered_sales),
      badge: `${(kpis.delivery_rate * 100).toFixed(1)}% delivered`,
      badgeType: 'green',
      subtext: `${delivered} orders delivered`,
      note: 'Revenue recognized only on confirmed delivery',
      isHero: false,
    },
    {
      title: 'Gross profit',
      value: formatTaka(kpis.gross_profit),
      badge: `${grossMarginPct.toFixed(1)}% margin`,
      badgeType: 'green',
      subtext: 'Revenue minus COGS',
      note: 'Unit purchase costs matched to sold items',
      isHero: false,
    },
    {
      title: 'Net profit',
      value: formatTaka(kpis.net_profit),
      badge: kpis.net_profit < 0 ? 'Net loss' : 'Net profit',
      badgeType: kpis.net_profit < 0 ? 'muted' : 'green',
      subtext: 'After ads, rent & freight',
      valueColor: 'text-[#025033]',
      note: 'Operating costs deducted in real-time',
      isHero: false,
    },
    {
      title: 'Orders placed',
      value: kpis.orders_placed.toString(),
      badge: `${delivered} done`,
      badgeType: 'neutral',
      subtext: `${kpis.orders_in_transit} in transit`,
      note: 'Placed orders never touch revenue before delivery',
      isHero: false,
    },
    {
      title: 'Delivery rate',
      value: `${(kpis.delivery_rate * 100).toFixed(1)}%`,
      badge: `${kpis.returned_orders} return`,
      badgeType: 'muted',
      subtext: `${settled} COD settled`,
      note: 'Returns cost courier fees in both directions',
      isHero: false,
    },
    {
      title: 'Held at couriers',
      value: formatTaka(kpis.held_at_couriers),
      badge: 'COD pending',
      badgeType: 'neutral',
      subtext: `${kpis.courier_accounts_count} couriers holding money`,
      note: 'Money collected by Steadfast & Pathao awaiting bank settlement',
      isHero: false,
    },
    {
      title: 'Net margin',
      value: `${kpis.net_margin_pct.toFixed(1)}%`,
      badge: kpis.net_margin_pct < 0 ? 'Loss' : 'Profit',
      badgeType: 'hero',
      subtext: kpis.net_margin_pct < 0 ? 'Operating at loss' : 'Healthy profitability',
      isHero: true,
      note: 'Net margin on recognized sales',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3.5">
      {cards.map((c, idx) => {
        const isHero = c.isHero;

        return (
          <div
            key={idx}
            className={`min-h-[155px] p-4 sm:p-5 rounded-2xl border transition shadow-2xs flex flex-col justify-between relative group ${
              isHero
                ? 'bg-[#025033] border-[#00432C] text-[#FFFFFF]'
                : 'bg-[#FFFFFF] border-[#E5EAE7] text-[#025033] hover:border-[#3A8067] hover:shadow-xs'
            }`}
          >
            {/* Top row: Title + Badge */}
            <div className="flex items-start justify-between gap-1.5">
              <span className={`text-xs font-semibold tracking-tight leading-snug ${isHero ? 'text-[#CAE4D8]' : 'text-[#3A8067]'}`}>
                {c.title}
              </span>
              {c.badge && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    isHero
                      ? 'bg-[#05572F] text-[#CAE4D8] border border-[#3A8067]'
                      : c.badgeType === 'green'
                      ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]'
                      : c.badgeType === 'muted'
                      ? 'bg-[#CAE4D8] text-[#025033] border border-[#3A8067]'
                      : 'bg-[#FAFCF9] text-[#025033] border border-[#E5EAE7]'
                  }`}
                >
                  {c.badge}
                </span>
              )}
            </div>

            {/* Middle: Big Metric Value */}
            <div className="my-2">
              <div
                className={`text-xl sm:text-2xl font-black tracking-tight leading-tight ${
                  isHero ? 'text-[#FFFFFF]' : c.valueColor ? c.valueColor : 'text-[#025033]'
                }`}
              >
                {c.value}
              </div>
            </div>

            {/* Bottom Row: Descriptive Subtext + Mini Icon */}
            <div className={`mt-auto pt-2 border-t flex items-center justify-between text-xs font-medium min-h-[26px] ${
              isHero ? 'border-[#05572F] text-[#CAE4D8]' : 'border-[#E5EAE7] text-[#3A8067]'
            }`}>
              <span className={`text-[11px] truncate leading-tight ${isHero ? 'text-[#CAE4D8] font-semibold' : 'text-[#3A8067]'}`}>
                {c.subtext}
              </span>
              <div className="opacity-50 group-hover:opacity-100 transition shrink-0 ml-1">
                <BarChartIcon className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
