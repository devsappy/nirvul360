'use client';

import React from 'react';
import { WhatsAppIcon, BoltIcon } from './icons';

interface WhatsAppActivityCardProps {
  onOpenSimulator: () => void;
}

export function WhatsAppActivityCard({ onOpenSimulator }: WhatsAppActivityCardProps) {
  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 sm:p-5 lg:p-6 shadow-xs flex flex-col justify-between gap-4 sm:gap-5 h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3 sm:pb-3.5">
        <h3 className="text-base font-bold text-[#025033] tracking-tight">WhatsApp activity</h3>
        <span className="text-xs font-semibold bg-[#E6F7EF] text-[#025033] px-2.5 py-1 rounded-full border border-[#CAE4D8]">
          Live feed
        </span>
      </div>

      {/* Middle empty/placeholder state */}
      <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-[#E6F7EF] text-[#025033] flex items-center justify-center border border-[#CAE4D8]">
          <WhatsAppIcon className="w-6 h-6" />
        </div>
        <div className="flex flex-col gap-1 max-w-[250px]">
          <span className="text-sm font-semibold text-[#025033]">Direct Accountant Expense Bot</span>
          <p className="text-xs text-[#3A8067] leading-relaxed">
            Accountants can send expenses in Bengali (e.g. &apos;প্যাকেজিং ৫০০ টাকা&apos;) with 2-step verification.
          </p>
        </div>
      </div>

      {/* Action Button */}
      <div className="pt-3.5 border-t border-[#E5EAE7]">
        <button
          onClick={onOpenSimulator}
          className="w-full flex items-center justify-center gap-2 bg-[#FAFCF9] hover:bg-[#E6F7EF] border border-[#E5EAE7] text-[#025033] text-sm font-semibold py-3 rounded-xl transition shadow-2xs"
        >
          <BoltIcon className="w-4 h-4 text-[#025033] fill-current" />
          <span>Test WhatsApp Bot Simulator</span>
        </button>
      </div>
    </div>
  );
}
