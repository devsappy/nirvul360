'use client';

import React from 'react';
import {
  DashboardIcon,
  OrdersIcon,
  CourierIcon,
  InventoryIcon,
  WhatsAppIcon,
  SettingsIcon,
  AlertIcon,
  BoltIcon,
  LogOutIcon,
  ShieldIcon
} from './icons';
import { User } from '@/types';

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  user: User | null;
  merchantName?: string;
  attentionCount: number;
  liveStatus: 'connected' | 'connecting' | 'offline';
  onSignOut: () => void;
  onOpenWhatsApp: () => void;
  onOpenTenantSwitcher?: () => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  user,
  merchantName,
  attentionCount,
  liveStatus,
  onSignOut,
  onOpenWhatsApp,
  onOpenTenantSwitcher,
}: SidebarProps) {
  const role = user?.role || 'agency_owner';
  const isAdminOrSuper = role === 'super_admin' || role === 'admin';

  const roleBadgeConfig: Record<string, { label: string; bg: string; text: string }> = {
    super_admin: { label: 'SUPER ADMIN', bg: 'bg-purple-100 border-purple-200', text: 'text-purple-800' },
    admin: { label: 'ADMIN', bg: 'bg-blue-100 border-blue-200', text: 'text-blue-800' },
    agency_owner: { label: 'AGENCY OWNER', bg: 'bg-[#E5FF44]/30 border-[#C4E000]', text: 'text-stone-900' },
    accountant: { label: 'ACCOUNTANT', bg: 'bg-amber-100 border-amber-200', text: 'text-amber-800' },
  };

  const currentRoleBadge = roleBadgeConfig[role] || roleBadgeConfig.agency_owner;

  const navItemsDeveloper = [
    { id: 'admin_cockpit', label: 'Developer Cockpit', icon: ShieldIcon, badge: 'SaaS Tower' },
  ];

  const navItemsJourney = [
    { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
    { id: 'attention', label: 'Needs attention', icon: AlertIcon, badge: attentionCount > 0 ? attentionCount : null },
    { id: 'orders', label: 'Orders', icon: OrdersIcon },
    { id: 'settlements', label: 'Courier settlements', icon: CourierIcon },
    { id: 'products', label: 'Inventory', icon: InventoryIcon },
  ];

  const navItemsWorkspace = [
    { id: 'integrations', label: 'Integrations Hub', icon: ShieldIcon, badge: role === 'accountant' ? 'Restricted' : null },
    { id: 'whatsapp', label: 'WhatsApp assistant', icon: WhatsAppIcon },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const initials = user?.name ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'GM';

  return (
    <aside className="w-64 bg-[#F7F5F0] border-r border-[#E8E4DA] flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none">
      {/* Top Header */}
      <div className="p-4 pb-0 flex flex-col gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-8 h-8 rounded-xl bg-stone-900 text-[#E5FF44] flex items-center justify-center font-bold text-sm shadow-sm">
            <BoltIcon className="w-4 h-4 fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-stone-900 leading-tight">Gross Management</span>
            <span className="text-[11px] text-stone-500 font-medium">Automated accounting</span>
          </div>
        </div>

        {/* Store Card / Hierarchy Pill */}
        <div 
          onClick={isAdminOrSuper && onOpenTenantSwitcher ? onOpenTenantSwitcher : undefined}
          className={`bg-white border border-[#E8E4DA] rounded-xl p-3 shadow-2xs flex flex-col gap-2 transition ${
            isAdminOrSuper ? 'cursor-pointer hover:border-purple-400 hover:shadow-xs' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-xs font-semibold text-stone-700">
                {(merchantName || 'AW').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-stone-900 leading-tight truncate max-w-[130px]">
                  {merchantName || 'Artisan Wear Bangladesh'}
                </span>
                <span className="text-[10px] text-stone-500">
                  {isAdminOrSuper ? 'Click to switch tenant ▾' : 'Primary store'}
                </span>
              </div>
            </div>
            {isAdminOrSuper && (
              <span className="text-[10px] text-purple-600 font-bold px-1.5 py-0.5 rounded bg-purple-50">
                Switch
              </span>
            )}
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-stone-100">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentRoleBadge.bg} ${currentRoleBadge.text}`}>
              {currentRoleBadge.label}
            </span>
            {/* Live SSE pulse pill */}
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-stone-100 text-[10px] font-medium text-stone-700">
              <span className={`w-2 h-2 rounded-full ${
                liveStatus === 'connected' ? 'bg-emerald-500 animate-pulse' :
                liveStatus === 'connecting' ? 'bg-amber-400 animate-ping' : 'bg-stone-400'
              }`} />
              <span>{liveStatus === 'connected' ? 'Live' : liveStatus === 'connecting' ? 'Syncing' : 'Offline'}</span>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex flex-col gap-5 pt-1 overflow-y-auto max-h-[calc(100vh-340px)] pr-1">
          
          {/* Section 0: Developer Control Tower (For Admins & Super Admins) */}
          {isAdminOrSuper && (
            <div>
              <span className="text-[10px] uppercase font-bold text-purple-700 tracking-wider px-2 block mb-1">
                Developer Oversight
              </span>
              <div className="flex flex-col gap-0.5">
                {navItemsDeveloper.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-purple-900 text-white shadow-xs font-bold'
                          : 'text-purple-900 hover:bg-purple-100/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#E5FF44]' : 'text-purple-700'}`} />
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-200/60 text-purple-900">
                        {item.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 1: Journey */}
          <div>
            <span className="text-[10px] uppercase font-bold text-stone-600 tracking-wider px-2 block mb-1">
              Accounting Journey
            </span>
            <div className="flex flex-col gap-0.5">
              {navItemsJourney.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-stone-900 text-white shadow-xs font-bold'
                        : 'text-stone-700 hover:bg-[#EBE7DF]/80 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#E5FF44]' : 'text-stone-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                        isActive ? 'bg-[#E5FF44] text-stone-900' : 'bg-red-500 text-white'
                      }`}>
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Workspace */}
          <div>
            <span className="text-[10px] uppercase font-bold text-stone-600 tracking-wider px-2 block mb-1">
              Workspace
            </span>
            <div className="flex flex-col gap-0.5">
              {navItemsWorkspace.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id)}
                    className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-stone-900 text-white shadow-xs font-bold'
                        : 'text-stone-700 hover:bg-[#EBE7DF]/80 hover:text-stone-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#E5FF44]' : 'text-stone-500'}`} />
                      <span>{item.label}</span>
                    </div>
                    {item.badge && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-stone-200 text-stone-600">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Area: WhatsApp AI Card & User Footer */}
      <div className="p-3 flex flex-col gap-2.5 bg-[#F7F5F0]">
        {/* WhatsApp AI Hero Card */}
        <div className="bg-[#E7FA53] border border-[#D5EB38] rounded-2xl p-3.5 shadow-2xs flex flex-col justify-between gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BoltIcon className="w-3.5 h-3.5 text-stone-900 fill-current" />
              <span className="text-xs font-bold text-stone-900">WhatsApp AI</span>
            </div>
            <span className="bg-white/80 backdrop-blur-xs text-[10px] font-semibold text-stone-800 px-2 py-0.5 rounded-full border border-black/5">
              Active
            </span>
          </div>
          <p className="text-[11px] text-stone-800 leading-tight">
            2-step confirmation for expenses & cash receipts
          </p>
          <button
            onClick={onOpenWhatsApp}
            className="w-full bg-stone-900 text-white hover:bg-black font-semibold text-[11px] py-1.5 px-3 rounded-xl transition flex items-center justify-between mt-1"
          >
            <span>Open simulator</span>
            <span>&rarr;</span>
          </button>
        </div>

        {/* User Profile Footer */}
        <div className="flex items-center justify-between pt-1 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-stone-200 border border-stone-300 flex items-center justify-center font-bold text-xs text-stone-700 shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-stone-900 truncate leading-tight">
                {user?.name || 'Tamim Ahmed'}
              </span>
              <span className="text-[10px] text-stone-500 capitalize">
                {user?.role_label || 'Agency Owner'}
              </span>
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-200 rounded-lg transition"
          >
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
