'use client';

import React from 'react';
import { CloseIcon } from './icons';
import { CourierReturnItem } from '@/types';

interface CourierReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  courierData: CourierReturnItem | null;
}

export function CourierReturnModal({ isOpen, onClose, courierData }: CourierReturnModalProps) {
  if (!isOpen || !courierData) return null;

  const m6 = courierData.months_6;
  const y1 = courierData.year_1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#CAE4D8] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#E6F7EF] border border-[#CAE4D8] flex items-center justify-center font-black text-sm text-[#025033]">
              {courierData.courier.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#025033] tracking-tight">
                {courierData.name} Return Analysis
              </h2>
              <p className="text-xs text-[#3A8067] font-medium">
                Regular Return % vs Paid Return % Historical Drilldown
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#3A8067] hover:text-[#025033] hover:bg-[#E6F7EF] rounded-xl transition"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
          {/* Current Period KPI */}
          <div className="bg-[#E6F7EF] border border-[#CAE4D8] rounded-2xl p-4 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#3A8067]">
                Selected Period Return Rate
              </span>
              <div className="text-2xl font-black text-[#025033] mt-0.5">
                {courierData.return_pct.toFixed(1)}%
              </div>
            </div>
            <div className="text-right text-xs text-[#025033] font-semibold">
              <div>{courierData.returned_orders} returned</div>
              <div className="text-[#3A8067] font-medium">{courierData.delivered_orders} delivered</div>
            </div>
          </div>

          {/* 6 Months Comparison Box */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-4.5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#025033] uppercase tracking-wider">
                6 Months Performance
              </span>
              <span className="text-[11px] text-[#3A8067] font-semibold">
                {m6.total_returns} total returns
              </span>
            </div>

            {/* Split Bar */}
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex mb-2.5">
              <div
                style={{ width: `${m6.regular_return_pct}%` }}
                className="bg-[#DC2626] h-full transition-all"
                title={`Regular: ${m6.regular_return_pct}%`}
              />
              <div
                style={{ width: `${m6.paid_return_pct}%` }}
                className="bg-[#025033] h-full transition-all"
                title={`Paid: ${m6.paid_return_pct}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-red-50/70 border border-red-200">
                <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">
                  Regular Return %
                </span>
                <span className="text-lg font-black text-red-900">
                  {m6.regular_return_pct.toFixed(1)}%
                </span>
                <p className="text-[10px] text-red-700 mt-0.5">
                  Unpaid advance / store bore return fee
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8]">
                <span className="text-[10px] font-bold text-[#025033] uppercase tracking-wider block">
                  Paid Return %
                </span>
                <span className="text-lg font-black text-[#025033]">
                  {m6.paid_return_pct.toFixed(1)}%
                </span>
                <p className="text-[10px] text-[#3A8067] mt-0.5">
                  Advance fee collected from buyer
                </p>
              </div>
            </div>
          </div>

          {/* 1 Year Comparison Box */}
          <div className="bg-white border border-[#E5EAE7] rounded-2xl p-4.5 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#025033] uppercase tracking-wider">
                1 Year Performance (Long-term)
              </span>
              <span className="text-[11px] text-[#3A8067] font-semibold">
                {y1.total_returns} total returns
              </span>
            </div>

            {/* Split Bar */}
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden flex mb-2.5">
              <div
                style={{ width: `${y1.regular_return_pct}%` }}
                className="bg-[#DC2626] h-full transition-all"
                title={`Regular: ${y1.regular_return_pct}%`}
              />
              <div
                style={{ width: `${y1.paid_return_pct}%` }}
                className="bg-[#025033] h-full transition-all"
                title={`Paid: ${y1.paid_return_pct}%`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-2.5 rounded-xl bg-red-50/70 border border-red-200">
                <span className="text-[10px] font-bold text-red-800 uppercase tracking-wider block">
                  Regular Return %
                </span>
                <span className="text-lg font-black text-red-900">
                  {y1.regular_return_pct.toFixed(1)}%
                </span>
                <p className="text-[10px] text-red-700 mt-0.5">
                  Loss on round-trip courier shipping
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8]">
                <span className="text-[10px] font-bold text-[#025033] uppercase tracking-wider block">
                  Paid Return %
                </span>
                <span className="text-lg font-black text-[#025033]">
                  {y1.paid_return_pct.toFixed(1)}%
                </span>
                <p className="text-[10px] text-[#3A8067] mt-0.5">
                  Secured by delivery deposit
                </p>
              </div>
            </div>
          </div>

          {/* Operational Guidance */}
          <div className="p-3.5 bg-[#FAFCF9] border border-[#CAE4D8] rounded-xl text-xs text-[#025033] leading-relaxed">
            <strong className="font-bold">Insight:</strong> Ensuring customer confirmation and collecting delivery advance on high-risk parcels converts Regular returns into Paid returns, preventing roundtrip courier losses.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-[#FAFCF9] border-t border-[#E5EAE7] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#025033] hover:bg-[#05572F] text-white text-xs font-bold transition shadow-xs"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
