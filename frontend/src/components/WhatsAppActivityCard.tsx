'use client';

import React from 'react';
import { WhatsAppIcon, BoltIcon } from './icons';

interface WhatsAppActivityCardProps {
  onOpenSimulator: () => void;
}

export function WhatsAppActivityCard({ onOpenSimulator }: WhatsAppActivityCardProps) {
  return (
    <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 pb-3">
        <h3 className="text-sm font-bold text-stone-900 tracking-tight">WhatsApp activity</h3>
        <span className="text-[10px] font-semibold bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full border border-stone-200">
          Live feed
        </span>
      </div>

      {/* Middle empty/placeholder state or activity cards */}
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2.5">
        <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <WhatsAppIcon className="w-5 h-5" />
        </div>
        <div className="flex flex-col gap-0.5 max-w-[240px]">
          <span className="text-xs font-semibold text-stone-800">Direct Accountant Expense Bot</span>
          <p className="text-[11px] text-stone-500 leading-tight">
            Accountants can send expenses in Bengali (e.g. &apos;প্যাকেজিং ৫০০ টাকা&apos;) with 2-step verification.
          </p>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-3 border-t border-stone-100">
        <button
          onClick={onOpenSimulator}
          className="w-full flex items-center justify-center gap-2 bg-[#FAF8F5] hover:bg-[#F3EFE6] border border-[#EBE7DF] text-stone-900 text-xs font-semibold py-2.5 rounded-xl transition"
        >
          <BoltIcon className="w-3.5 h-3.5 text-stone-900 fill-current" />
          <span>Test WhatsApp Bot Simulator</span>
        </button>
      </div>
    </div>
  );
}
