'use client';

import React from 'react';
import { ProductPerformanceSummaryItem } from '@/types';
import { formatTaka } from '@/lib/api';

interface DashboardProductPerformanceProps {
  products: ProductPerformanceSummaryItem[];
  onViewAll?: () => void;
}

export function DashboardProductPerformance({
  products = [],
  onViewAll,
}: DashboardProductPerformanceProps) {
  // Sort by highest net profit first
  const sorted = [...products].sort((a, b) => (b.net_profit_poisha ?? 0) - (a.net_profit_poisha ?? 0));

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl p-5 sm:p-6 shadow-2xs flex flex-col gap-4">
      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#E5EAE7]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-black text-[#025033] tracking-tight">
              Product Performance
            </h2>
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              Highest Profit First
            </span>
          </div>
          <p className="text-xs text-[#3A8067] font-medium mt-0.5">
            Confirmed ledger net profit per product after deducting unit COGS, courier fees, and ad spend.
          </p>
        </div>

        {onViewAll && (
          <button
            onClick={onViewAll}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] text-xs font-bold transition border border-[#CAE4D8] flex items-center gap-1.5 shrink-0"
          >
            <span>Full Economics Report</span>
            <span>↗</span>
          </button>
        )}
      </div>

      {/* Products Table */}
      {sorted.length === 0 ? (
        <div className="py-12 text-center text-xs text-[#3A8067] font-medium">
          No product performance data available for this date period.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#E5EAE7] text-[11px] font-extrabold text-[#3A8067] uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">RANK</th>
                <th className="py-3 px-3">PRODUCT / MODEL</th>
                <th className="py-3 px-3 text-center">DELIVERED</th>
                <th className="py-3 px-3 text-center">RETURN %</th>
                <th className="py-3 px-3 text-right">REVENUE</th>
                <th className="py-3 px-3 text-right">COGS</th>
                <th className="py-3 px-3 text-right">NET PROFIT</th>
                <th className="py-3 px-3 text-right">NET MARGIN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {sorted.slice(0, 7).map((prod, idx) => {
                const netProfit = prod.net_profit_poisha !== null && prod.net_profit_poisha !== undefined ? prod.net_profit_poisha : null;
                const isLoss = netProfit !== null && netProfit < 0;
                const isTop1 = idx === 0;

                return (
                  <tr
                    key={prod.product_id}
                    className={`hover:bg-[#FAFCF9] transition ${
                      isTop1 ? 'bg-[#E6F7EF]/30 font-semibold' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-xs font-black ${
                        idx === 0
                          ? 'bg-[#025033] text-white shadow-xs'
                          : idx === 1
                          ? 'bg-[#CAE4D8] text-[#025033]'
                          : idx === 2
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        #{idx + 1}
                      </span>
                    </td>

                    {/* Product / Model */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8] flex items-center justify-center text-xs font-black text-[#025033] shrink-0">
                          {prod.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-extrabold text-[#025033] line-clamp-1">
                            {prod.name}
                          </div>
                          <div className="text-[11px] text-[#3A8067] font-mono font-medium">
                            {prod.sku || `SKU #${prod.product_id}`}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Delivered */}
                    <td className="py-3 px-3 text-center font-bold text-[#025033]">
                      {prod.delivered}
                      <span className="text-[10px] text-[#3A8067] block font-normal">
                        of {prod.orders_placed} placed
                      </span>
                    </td>

                    {/* Return % */}
                    <td className="py-3 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                        (prod.returned_pct || 0) > 0.2
                          ? 'bg-red-50 text-red-800 border border-red-200'
                          : 'bg-green-50 text-green-800'
                      }`}>
                        {((prod.returned_pct || 0) * 100).toFixed(1)}%
                      </span>
                    </td>

                    {/* Revenue */}
                    <td className="py-3 px-3 text-right font-bold text-[#025033]">
                      {formatTaka(prod.revenue_poisha)}
                    </td>

                    {/* COGS */}
                    <td className="py-3 px-3 text-right font-medium text-[#3A8067]">
                      {prod.cogs_poisha !== null ? formatTaka(prod.cogs_poisha) : '—'}
                    </td>

                    {/* Net Profit */}
                    <td className="py-3 px-3 text-right">
                      {netProfit !== null ? (
                        <span className={`text-sm font-black ${isLoss ? 'text-red-700' : 'text-[#025033]'}`}>
                          {isLoss ? '-' : ''}{formatTaka(Math.abs(netProfit))}
                        </span>
                      ) : (
                        <span className="text-[#3A8067] italic text-[11px]">Pending cost</span>
                      )}
                    </td>

                    {/* Net Margin */}
                    <td className="py-3 px-3 text-right font-black">
                      {prod.net_margin !== null ? (
                        <span className={isLoss ? 'text-red-700' : 'text-[#025033]'}>
                          {(prod.net_margin * 100).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-[#3A8067] font-normal">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
