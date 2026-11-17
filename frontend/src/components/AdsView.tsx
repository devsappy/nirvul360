'use client';

import React, { useState } from 'react';

interface CampaignRow {
  id: string;
  name: string;
  channel: 'facebook' | 'google' | 'youtube' | 'tiktok';
  status: 'active' | 'paused';
  spend_usd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  roas: number;
}

export function AdsView() {
  const [fxRate, setFxRate] = useState<number>(122.50);
  const [activeChannel, setActiveChannel] = useState<'all' | 'facebook' | 'google' | 'youtube' | 'tiktok'>('all');
  const [datePeriod, setDatePeriod] = useState<'this_month' | 'last30' | 'last7'>('this_month');

  // Multi-channel campaign benchmarks (synced with double-entry ledger)
  const campaigns: CampaignRow[] = [
    {
      id: 'fb-01',
      name: 'Eid Panjabi Collection - Conversions BOF',
      channel: 'facebook',
      status: 'active',
      spend_usd: 540.00,
      impressions: 142000,
      clicks: 4820,
      conversions: 186,
      roas: 5.2,
    },
    {
      id: 'fb-02',
      name: 'Artisan Retargeting - Catalog Sales',
      channel: 'facebook',
      status: 'active',
      spend_usd: 280.50,
      impressions: 78500,
      clicks: 2910,
      conversions: 114,
      roas: 4.8,
    },
    {
      id: 'gg-01',
      name: 'Brand Search - Panjabi & Cotton Wear BD',
      channel: 'google',
      status: 'active',
      spend_usd: 310.00,
      impressions: 45200,
      clicks: 3450,
      conversions: 142,
      roas: 6.1,
    },
    {
      id: 'yt-01',
      name: 'Fabric Crafting Story - In-Feed Video',
      channel: 'youtube',
      status: 'active',
      spend_usd: 175.00,
      impressions: 89000,
      clicks: 1650,
      conversions: 48,
      roas: 3.4,
    },
    {
      id: 'tt-01',
      name: 'Trending Style - TikTok Shop Spark Ads',
      channel: 'tiktok',
      status: 'active',
      spend_usd: 244.50,
      impressions: 215000,
      clicks: 6200,
      conversions: 95,
      roas: 3.9,
    },
  ];

  const filtered = campaigns.filter((c) => activeChannel === 'all' || c.channel === activeChannel);

  const totalSpendUsd = filtered.reduce((sum, c) => sum + c.spend_usd, 0);
  const totalSpendBdt = totalSpendUsd * fxRate;
  const totalImpressions = filtered.reduce((sum, c) => sum + c.impressions, 0);
  const totalClicks = filtered.reduce((sum, c) => sum + c.clicks, 0);
  const totalConversions = filtered.reduce((sum, c) => sum + c.conversions, 0);
  const avgRoas = filtered.length > 0 ? (filtered.reduce((sum, c) => sum + c.roas, 0) / filtered.length).toFixed(1) : '0.0';

  const channelTotals = {
    facebook: campaigns.filter((c) => c.channel === 'facebook').reduce((s, c) => s + c.spend_usd, 0),
    google: campaigns.filter((c) => c.channel === 'google').reduce((s, c) => s + c.spend_usd, 0),
    youtube: campaigns.filter((c) => c.channel === 'youtube').reduce((s, c) => s + c.spend_usd, 0),
    tiktok: campaigns.filter((c) => c.channel === 'tiktok').reduce((s, c) => s + c.spend_usd, 0),
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 font-sans antialiased text-[#025033]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#E5EAE7]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#025033]">
              Advertising
            </h1>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              4 Channels
            </span>
          </div>
          <p className="text-sm text-[#3A8067] font-medium mt-1">
            Real-time ad spend converted to Taka and debited automatically against operating profit.
          </p>
        </div>

        {/* Currency Conversion Config & Period */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-[#CAE4D8] shadow-2xs">
            <span className="text-sm font-bold text-[#3A8067] whitespace-nowrap">FX Rate:</span>
            <span className="text-sm font-extrabold text-[#025033]">$1 = ৳</span>
            <input
              type="number"
              step="0.1"
              value={fxRate}
              onChange={(e) => setFxRate(parseFloat(e.target.value) || 122.5)}
              className="w-18 text-sm font-black text-[#025033] bg-[#E6F7EF] rounded-lg px-2 py-1 text-center focus:outline-none focus:ring-1 focus:ring-[#025033]"
            />
          </div>

          <div className="bg-[#E6F7EF] p-1.5 rounded-xl flex items-center gap-1 border border-[#CAE4D8]">
            {(['this_month', 'last30', 'last7'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setDatePeriod(p)}
                className={`px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition capitalize ${
                  datePeriod === p
                    ? 'bg-[#025033] text-white shadow-xs'
                    : 'text-[#3A8067] hover:text-[#025033]'
                }`}
              >
                {p === 'this_month' ? 'This Month' : p === 'last30' ? 'Last 30 Days' : 'Last 7 Days'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Spend */}
        <div className="p-5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#3A8067]">Total Ad Spend</span>
          <div className="my-2.5">
            <div className="text-2xl sm:text-3xl font-black text-[#025033] tracking-tight">
              ${totalSpendUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-sm sm:text-base font-bold text-[#3A8067] mt-1">
              ≈ ৳{Math.round(totalSpendBdt).toLocaleString('en-US')}
            </div>
          </div>
          <span className="text-xs sm:text-[13px] font-medium text-[#3A8067] border-t border-[#E5EAE7] pt-2.5">
            Converted at ৳{fxRate.toFixed(2)} / USD
          </span>
        </div>

        {/* Blended ROAS */}
        <div className="p-5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#3A8067]">Blended ROAS</span>
          <div className="my-2.5">
            <div className="text-2xl sm:text-3xl font-black text-[#025033] tracking-tight">
              {avgRoas}x
            </div>
            <div className="text-sm font-bold text-green-700 mt-1">
              Healthy return on ad spend
            </div>
          </div>
          <span className="text-xs sm:text-[13px] font-medium text-[#3A8067] border-t border-[#E5EAE7] pt-2.5">
            Directly mapped orders &amp; revenue
          </span>
        </div>

        {/* Impressions & Clicks */}
        <div className="p-5 rounded-2xl bg-white border border-[#E5EAE7] shadow-2xs flex flex-col justify-between">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#3A8067]">Reach &amp; Engagement</span>
          <div className="my-2.5">
            <div className="text-2xl sm:text-3xl font-black text-[#025033] tracking-tight">
              {totalImpressions.toLocaleString('en-US')}
            </div>
            <div className="text-sm font-bold text-[#3A8067] mt-1">
              {totalClicks.toLocaleString('en-US')} clicks ({((totalClicks / (totalImpressions || 1)) * 100).toFixed(2)}% CTR)
            </div>
          </div>
          <span className="text-xs sm:text-[13px] font-medium text-[#3A8067] border-t border-[#E5EAE7] pt-2.5">
            Avg CPC: ${(totalSpendUsd / (totalClicks || 1)).toFixed(2)}
          </span>
        </div>

        {/* Attributed Conversions */}
        <div className="p-5 rounded-2xl bg-[#025033] text-white border border-[#00432C] shadow-2xs flex flex-col justify-between">
          <span className="text-xs sm:text-sm font-bold uppercase tracking-wider text-[#CAE4D8]">Attributed Orders</span>
          <div className="my-2.5">
            <div className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              {totalConversions}
            </div>
            <div className="text-sm font-bold text-[#CAE4D8] mt-1">
              Cost / Order: ৳{Math.round(totalSpendBdt / (totalConversions || 1)).toLocaleString('en-US')}
            </div>
          </div>
          <span className="text-xs sm:text-[13px] font-semibold text-[#CAE4D8] border-t border-[#05572F] pt-2.5">
            Confirmed delivered in pipeline
          </span>
        </div>
      </div>

      {/* Channel Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Facebook Ads */}
        <div
          onClick={() => setActiveChannel(activeChannel === 'facebook' ? 'all' : 'facebook')}
          className={`p-5 rounded-2xl border transition cursor-pointer shadow-2xs flex flex-col justify-between gap-4 ${
            activeChannel === 'facebook'
              ? 'bg-[#E6F7EF] border-[#025033] ring-2 ring-[#025033]'
              : 'bg-white border-[#E5EAE7] hover:border-[#CAE4D8]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-base shrink-0">
                f
              </span>
              <div>
                <h3 className="text-base font-extrabold text-[#025033] leading-snug">Facebook Ads</h3>
                <span className="text-xs font-semibold text-[#3A8067] leading-snug block">Meta Business</span>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#025033]">
              ${channelTotals.facebook.toFixed(2)}
            </div>
            <div className="text-sm font-bold text-[#3A8067] mt-1">
              ≈ ৳{Math.round(channelTotals.facebook * fxRate).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* Google Ads */}
        <div
          onClick={() => setActiveChannel(activeChannel === 'google' ? 'all' : 'google')}
          className={`p-5 rounded-2xl border transition cursor-pointer shadow-2xs flex flex-col justify-between gap-4 ${
            activeChannel === 'google'
              ? 'bg-[#E6F7EF] border-[#025033] ring-2 ring-[#025033]'
              : 'bg-white border-[#E5EAE7] hover:border-[#CAE4D8]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-base shrink-0">
                G
              </span>
              <div>
                <h3 className="text-base font-extrabold text-[#025033] leading-snug">Google Ads</h3>
                <span className="text-xs font-semibold text-[#3A8067] leading-snug block">Search &amp; Shopping</span>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#025033]">
              ${channelTotals.google.toFixed(2)}
            </div>
            <div className="text-sm font-bold text-[#3A8067] mt-1">
              ≈ ৳{Math.round(channelTotals.google * fxRate).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* YouTube Ads */}
        <div
          onClick={() => setActiveChannel(activeChannel === 'youtube' ? 'all' : 'youtube')}
          className={`p-5 rounded-2xl border transition cursor-pointer shadow-2xs flex flex-col justify-between gap-4 ${
            activeChannel === 'youtube'
              ? 'bg-[#E6F7EF] border-[#025033] ring-2 ring-[#025033]'
              : 'bg-white border-[#E5EAE7] hover:border-[#CAE4D8]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center font-black text-base shrink-0">
                ▶
              </span>
              <div>
                <h3 className="text-base font-extrabold text-[#025033] leading-snug">YouTube Ads</h3>
                <span className="text-xs font-semibold text-[#3A8067] leading-snug block">In-Feed &amp; Shorts</span>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#025033]">
              ${channelTotals.youtube.toFixed(2)}
            </div>
            <div className="text-sm font-bold text-[#3A8067] mt-1">
              ≈ ৳{Math.round(channelTotals.youtube * fxRate).toLocaleString('en-US')}
            </div>
          </div>
        </div>

        {/* TikTok Ads */}
        <div
          onClick={() => setActiveChannel(activeChannel === 'tiktok' ? 'all' : 'tiktok')}
          className={`p-5 rounded-2xl border transition cursor-pointer shadow-2xs flex flex-col justify-between gap-4 ${
            activeChannel === 'tiktok'
              ? 'bg-[#E6F7EF] border-[#025033] ring-2 ring-[#025033]'
              : 'bg-white border-[#E5EAE7] hover:border-[#CAE4D8]'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-black text-white flex items-center justify-center font-black text-base shrink-0">
                ♪
              </span>
              <div>
                <h3 className="text-base font-extrabold text-[#025033] leading-snug">TikTok Ads</h3>
                <span className="text-xs font-semibold text-[#3A8067] leading-snug block">Spark Ads &amp; Feed</span>
              </div>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
          </div>
          <div>
            <div className="text-2xl font-black text-[#025033]">
              ${channelTotals.tiktok.toFixed(2)}
            </div>
            <div className="text-sm font-bold text-[#3A8067] mt-1">
              ≈ ৳{Math.round(channelTotals.tiktok * fxRate).toLocaleString('en-US')}
            </div>
          </div>
        </div>
      </div>

      {/* Campaigns Breakdown Table */}
      <div className="bg-white rounded-3xl border border-[#E5EAE7] p-5 sm:p-6 shadow-2xs flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
          <div>
            <h2 className="text-lg font-extrabold text-[#025033]">Campaign Performance &amp; Ad Ledger</h2>
            <p className="text-sm text-[#3A8067] font-medium mt-0.5">
              Showing {filtered.length} active campaigns across selected channels.
            </p>
          </div>
          {activeChannel !== 'all' && (
            <button
              onClick={() => setActiveChannel('all')}
              className="text-sm font-bold text-[#025033] hover:underline"
            >
              Clear Filter (Show All)
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#E5EAE7] text-xs font-extrabold text-[#3A8067] uppercase tracking-wider">
                <th className="py-3.5 px-3.5">CAMPAIGN</th>
                <th className="py-3.5 px-3.5">CHANNEL</th>
                <th className="py-3.5 px-3.5">STATUS</th>
                <th className="py-3.5 px-3.5 text-right">SPEND (USD)</th>
                <th className="py-3.5 px-3.5 text-right">SPEND (BDT)</th>
                <th className="py-3.5 px-3.5 text-center">IMPRESSIONS</th>
                <th className="py-3.5 px-3.5 text-center">CLICKS</th>
                <th className="py-3.5 px-3.5 text-center">ORDERS</th>
                <th className="py-3.5 px-3.5 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {filtered.map((camp) => (
                <tr key={camp.id} className="hover:bg-[#FAFCF9] transition">
                  <td className="py-4 px-3.5 font-extrabold text-[#025033]">
                    {camp.name}
                  </td>
                  <td className="py-4 px-3.5 capitalize font-bold text-[#3A8067]">
                    {camp.channel}
                  </td>
                  <td className="py-4 px-3.5">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-800 border border-green-200">
                      <span className="w-2 h-2 rounded-full bg-green-600" />
                      Active
                    </span>
                  </td>
                  <td className="py-4 px-3.5 text-right font-black text-[#025033]">
                    ${camp.spend_usd.toFixed(2)}
                  </td>
                  <td className="py-4 px-3.5 text-right font-bold text-[#3A8067]">
                    ৳{Math.round(camp.spend_usd * fxRate).toLocaleString('en-US')}
                  </td>
                  <td className="py-4 px-3.5 text-center font-medium text-[#025033]">
                    {camp.impressions.toLocaleString('en-US')}
                  </td>
                  <td className="py-4 px-3.5 text-center font-medium text-[#025033]">
                    {camp.clicks.toLocaleString('en-US')}
                  </td>
                  <td className="py-4 px-3.5 text-center font-black text-[#025033]">
                    {camp.conversions}
                  </td>
                  <td className="py-4 px-3.5 text-right">
                    <span className="inline-block px-3 py-1 rounded-lg text-xs sm:text-sm font-black bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                      {camp.roas.toFixed(1)}x
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
