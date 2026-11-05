'use client';

import React from 'react';
import {
  DashboardIcon,
  OrdersIcon,
  CourierIcon,
  InventoryIcon,
  PosIcon,
  WhatsAppIcon,
  SettingsIcon,
  AlertIcon,
  BoltIcon,
  LogOutIcon,
  ShieldIcon,
  UsersIcon,
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
  const isSuperAdmin = role === 'super_admin';
  const isAdminOrSuper = role === 'super_admin' || role === 'admin';

  const roleBadgeConfig: Record<string, { label: string; bg: string; text: string; border: string }> = {
    super_admin: { label: 'SUPER ADMIN', bg: 'bg-[#05572F]', text: 'text-[#FFFFFF]', border: 'border-[#3A8067]' },
    admin: { label: 'ADMIN', bg: 'bg-[#05572F]', text: 'text-[#CAE4D8]', border: 'border-[#3A8067]' },
    agency_owner: { label: 'AGENCY OWNER', bg: 'bg-[#CAE4D8]', text: 'text-[#025033]', border: 'border-[#3A8067]' },
    accountant: { label: 'ACCOUNTANT', bg: 'bg-[#E6F7EF]', text: 'text-[#025033]', border: 'border-[#CAE4D8]' },
  };

  const currentRoleBadge = roleBadgeConfig[role] || roleBadgeConfig.agency_owner;

  const navItemsSuperAdmin = [
    { id: 'users_overview', label: 'Platform Users', icon: UsersIcon, badge: 'Active Users' },
    { id: 'admin_cockpit', label: 'Registered Tenants', icon: ShieldIcon, badge: 'SaaS Tower' },
  ];

  const navItemsDeveloper = [
    { id: 'admin_cockpit', label: 'Developer Cockpit', icon: ShieldIcon, badge: 'SaaS Tower' },
  ];

  const navItemsJourney = [
    { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
    { id: 'attention', label: 'Needs attention', icon: AlertIcon, badge: attentionCount > 0 ? attentionCount : null },
    { id: 'orders', label: 'Orders', icon: OrdersIcon },
    { id: 'settlements', label: 'Courier settlements', icon: CourierIcon },
    { id: 'products', label: 'Inventory', icon: InventoryIcon },
    { id: 'pos', label: 'POS / Offline Store', icon: PosIcon, badge: 'Retail' },
  ];

  const navItemsWorkspace = [
    { id: 'integrations', label: 'Integrations Hub', icon: ShieldIcon, badge: role === 'accountant' ? 'Restricted' : null },
    { id: 'whatsapp', label: 'WhatsApp assistant', icon: WhatsAppIcon },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const initials = user?.name ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() : 'NV';

  return (
    <aside className="w-64 bg-[#025033] border-r border-[#00432C] flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none text-white">
      {/* Top Header */}
      <div className="p-4 pb-0 flex flex-col gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-1 pt-1">
          <div className="w-8 h-8 rounded-xl bg-[#00432C] text-[#CAE4D8] flex items-center justify-center font-bold text-sm border border-[#05572F]">
            <BoltIcon className="w-4 h-4 fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-[#FFFFFF] leading-tight">nirvul360</span>
            <span className="text-[11px] text-[#CAE4D8] font-medium">
              {isSuperAdmin ? 'Super Admin Tower' : 'Automated accounting'}
            </span>
          </div>
        </div>

        {/* Store Card / Hierarchy Pill */}
        {isSuperAdmin ? (
          <div className="bg-[#00432C] border border-[#05572F] rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#05572F] text-[#FFFFFF] flex items-center justify-center text-xs font-black border border-[#3A8067]">
                  SA
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-extrabold text-[#FFFFFF] leading-tight">
                    nirvul360 Platform
                  </span>
                  <span className="text-[10px] text-[#CAE4D8] font-semibold">
                    Global Super Admin
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#05572F]/60">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-[#05572F] border-[#3A8067] text-[#FFFFFF]">
                SUPER ADMIN
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#025033] text-[10px] font-medium text-[#CAE4D8] border border-[#05572F]">
                <span className={`w-2 h-2 rounded-full ${
                  liveStatus === 'connected' ? 'bg-[#CAE4D8] animate-pulse' :
                  liveStatus === 'connecting' ? 'bg-[#CAE4D8]' : 'bg-[#3A8067]'
                }`} />
                <span>{liveStatus === 'connected' ? 'Live' : liveStatus === 'connecting' ? 'Syncing' : 'Offline'}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            onClick={isAdminOrSuper && onOpenTenantSwitcher ? onOpenTenantSwitcher : undefined}
            className={`bg-[#00432C] border border-[#05572F] rounded-xl p-3 flex flex-col gap-2 transition ${
              isAdminOrSuper ? 'cursor-pointer hover:border-[#CAE4D8]' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#05572F] flex items-center justify-center text-xs font-semibold text-[#FFFFFF] border border-[#3A8067]">
                  {(merchantName || 'AW').split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-semibold text-[#FFFFFF] leading-tight truncate max-w-[130px]">
                    {merchantName || 'Artisan Wear Bangladesh'}
                  </span>
                  <span className="text-[10px] text-[#CAE4D8]">
                    {isAdminOrSuper ? 'Click to switch tenant ▾' : 'Primary store'}
                  </span>
                </div>
              </div>
              {isAdminOrSuper && (
                <span className="text-[10px] text-[#CAE4D8] font-bold px-1.5 py-0.5 rounded bg-[#05572F]">
                  Switch
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-[#05572F]/60">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${currentRoleBadge.bg} ${currentRoleBadge.text} ${currentRoleBadge.border}`}>
                {currentRoleBadge.label}
              </span>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#025033] text-[10px] font-medium text-[#CAE4D8] border border-[#05572F]">
                <span className={`w-2 h-2 rounded-full ${
                  liveStatus === 'connected' ? 'bg-[#CAE4D8] animate-pulse' :
                  liveStatus === 'connecting' ? 'bg-[#CAE4D8]' : 'bg-[#3A8067]'
                }`} />
                <span>{liveStatus === 'connected' ? 'Live' : liveStatus === 'connecting' ? 'Syncing' : 'Offline'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Sections */}
        <div className="flex flex-col gap-5 pt-1 overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
          {isSuperAdmin ? (
            /* Super Admin Navigation: Only Platform Level Overview */
            <div>
              <span className="text-[10px] uppercase font-bold text-[#CAE4D8] tracking-wider px-2 block mb-1">
                Super Admin Oversight
              </span>
              <div className="flex flex-col gap-1">
                {navItemsSuperAdmin.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentTab === item.id || (item.id === 'users_overview' && currentTab === 'dashboard');
                  return (
                    <button
                      key={item.id}
                      onClick={() => onTabChange(item.id)}
                      className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-[#05572F] text-[#FFFFFF] font-bold border border-[#3A8067]'
                          : 'text-[#CAE4D8] hover:bg-[#00432C] hover:text-[#FFFFFF]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFFFFF]' : 'text-[#CAE4D8]'}`} />
                        <span>{item.label}</span>
                      </div>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        isActive ? 'bg-[#CAE4D8] text-[#025033]' : 'bg-[#00432C] text-[#CAE4D8]'
                      }`}>
                        {item.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Regular Store Journey for Admin, Agency Owner, Accountant */
            <>
              {/* Section 0: Developer Control Tower (For Admins) */}
              {isAdminOrSuper && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#CAE4D8] tracking-wider px-2 block mb-1">
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
                              ? 'bg-[#05572F] text-[#FFFFFF] font-bold border border-[#3A8067]'
                              : 'text-[#CAE4D8] hover:bg-[#00432C] hover:text-[#FFFFFF]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFFFFF]' : 'text-[#CAE4D8]'}`} />
                            <span>{item.label}</span>
                          </div>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#00432C] text-[#CAE4D8]">
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
                <span className="text-[10px] uppercase font-bold text-[#CAE4D8] tracking-wider px-2 block mb-1">
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
                            ? 'bg-[#05572F] text-[#FFFFFF] font-bold border border-[#3A8067]'
                            : 'text-[#CAE4D8] hover:bg-[#00432C] hover:text-[#FFFFFF]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFFFFF]' : 'text-[#CAE4D8]'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                            isActive ? 'bg-[#CAE4D8] text-[#025033]' : 'bg-[#00432C] text-[#CAE4D8] border border-[#3A8067]'
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
                <span className="text-[10px] uppercase font-bold text-[#CAE4D8] tracking-wider px-2 block mb-1">
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
                            ? 'bg-[#05572F] text-[#FFFFFF] font-bold border border-[#3A8067]'
                            : 'text-[#CAE4D8] hover:bg-[#00432C] hover:text-[#FFFFFF]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-[#FFFFFF]' : 'text-[#CAE4D8]'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-[#00432C] text-[#CAE4D8]">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Area: User Footer (and WhatsApp AI for store users) */}
      <div className="p-3 flex flex-col gap-2.5 bg-[#025033] border-t border-[#00432C]">
        {!isSuperAdmin && (
          /* WhatsApp AI Hero Card only for store users */
          <div className="bg-[#00432C] border border-[#05572F] rounded-2xl p-3.5 flex flex-col justify-between gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <BoltIcon className="w-3.5 h-3.5 text-[#CAE4D8] fill-current" />
                <span className="text-xs font-bold text-[#FFFFFF]">WhatsApp AI</span>
              </div>
              <span className="bg-[#05572F] text-[10px] font-semibold text-[#CAE4D8] px-2 py-0.5 rounded-full border border-[#3A8067]">
                Active
              </span>
            </div>
            <p className="text-[11px] text-[#CAE4D8] leading-tight">
              2-step confirmation for expenses &amp; cash receipts
            </p>
            <button
              onClick={onOpenWhatsApp}
              className="w-full bg-[#05572F] text-[#FFFFFF] hover:bg-[#00432C] font-semibold text-[11px] py-1.5 px-3 rounded-xl transition flex items-center justify-between mt-1 border border-[#3A8067]"
            >
              <span>Open simulator</span>
              <span>&rarr;</span>
            </button>
          </div>
        )}

        {/* User Profile Footer */}
        <div className="flex items-center justify-between pt-1 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#05572F] border border-[#3A8067] flex items-center justify-center font-bold text-xs text-[#FFFFFF] shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-[#FFFFFF] truncate leading-tight">
                {user?.name || 'Tamim Ahmed'}
              </span>
              <span className="text-[10px] text-[#CAE4D8] capitalize">
                {user?.role_label || 'Agency Owner'}
              </span>
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 text-[#CAE4D8] hover:text-[#FFFFFF] hover:bg-[#00432C] rounded-lg transition"
          >
            <LogOutIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
