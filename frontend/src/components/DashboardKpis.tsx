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
  };
}

export function DashboardKpis({ kpis }: DashboardKpisProps) {
  const cards = [
    {
      title: 'Delivered sales',
      value: formatTaka(kpis.delivered_sales),
      badge: '55.6%',
      badgeType: 'green',
      subtext: '5 orders delivered',
      note: 'Revenue recognized only on confirmed delivery',
      isHero: false,
    },
    {
      title: 'Gross profit',
      value: formatTaka(kpis.gross_profit),
      badge: '42.4% margin',
      badgeType: 'green',
      subtext: 'Revenue minus COGS',
      note: 'Unit purchase costs matched to sold items',
      isHero: false,
    },
    {
      title: 'Net profit',
      value: formatTaka(kpis.net_profit),
      badge: kpis.net_profit < 0 ? 'Net loss' : 'Net profit',
      badgeType: kpis.net_profit < 0 ? 'red' : 'green',
      subtext: 'After ads, rent & freight',
      valueColor: kpis.net_profit < 0 ? 'text-[#B82E2E]' : 'text-emerald-700',
      note: 'Operating costs deducted in real-time',
      isHero: false,
    },
    {
      title: 'Orders placed',
      value: kpis.orders_placed.toString(),
      badge: '5 done',
      badgeType: 'neutral',
      subtext: `${kpis.orders_in_transit} in transit`,
      note: 'Placed orders never touch revenue before delivery',
      isHero: false,
    },
    {
      title: 'Delivery rate',
      value: `${(kpis.delivery_rate * 100).toFixed(1)}%`,
      badge: `${kpis.returned_orders} return`,
      badgeType: 'amber',
      subtext: 'Successful door deliveries',
      note: 'Returns cost courier fees in both directions',
      isHero: false,
    },
    {
      title: 'Held at couriers',
      value: formatTaka(kpis.held_at_couriers),
      badge: 'COD pending',
      badgeType: 'neutral',
      subtext: `${kpis.courier_accounts_count} courier accounts`,
      note: 'Money collected by Steadfast & Pathao awaiting bank settlement',
      isHero: false,
    },
    {
      title: 'Net margin',
      value: `${kpis.net_margin_pct.toFixed(1)}%`,
      badge: kpis.net_margin_pct < 0 ? 'Loss' : 'Profit',
      badgeType: 'neutral',
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
                ? 'bg-[#E7FA53] border-[#D5EB38] text-stone-900'
                : 'bg-white border-[#E8E4DA] text-stone-900 hover:border-stone-400/80 hover:shadow-xs'
            }`}
          >
            {/* Top row: Title + Badge */}
            <div className="flex items-start justify-between gap-1.5">
              <span className="text-xs font-semibold text-stone-600 tracking-tight leading-snug">
                {c.title}
              </span>
              {c.badge && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                    isHero
                      ? 'bg-black/10 text-stone-900'
                      : c.badgeType === 'green'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                      : c.badgeType === 'red'
                      ? 'bg-red-50 text-red-700 border border-red-200/60'
                      : c.badgeType === 'amber'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200/60'
                      : 'bg-stone-100 text-stone-600 border border-stone-200'
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
                  c.valueColor ? c.valueColor : 'text-stone-900'
                }`}
              >
                {c.value}
              </div>
            </div>

            {/* Bottom Row: Descriptive Subtext + Mini Icon with generous line-height */}
            <div className="mt-auto pt-2 border-t border-black/5 flex items-center justify-between text-xs text-stone-500 font-medium min-h-[26px]">
              <span className={`text-[11px] truncate leading-tight ${isHero ? 'text-stone-700 font-semibold' : 'text-stone-500'}`}>
                {c.subtext}
              </span>
              <div className="opacity-40 group-hover:opacity-80 transition shrink-0 ml-1">
                <BarChartIcon className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
