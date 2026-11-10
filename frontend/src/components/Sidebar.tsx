'use client';

import React, { useState } from 'react';
import { User } from '@/types';

interface StoreOption {
  id: number;
  name: string;
  plan?: string;
  is_active?: boolean;
}

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  user: User | null;
  merchantName?: string;
  stores?: StoreOption[];
  storesCount?: number;
  planLabel?: string;
  attentionCount: number;
  liveStatus: 'connected' | 'connecting' | 'offline';
  onSignOut: () => void;
  onOpenWhatsApp?: () => void;
  onOpenTenantSwitcher?: () => void;
  onSwitchStore?: (storeId: number) => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  user,
  merchantName,
  stores = [],
  storesCount,
  planLabel,
  attentionCount,
  liveStatus,
  onSignOut,
  onOpenTenantSwitcher,
  onSwitchStore,
}: SidebarProps) {
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const role = user?.role || 'agency_owner';
  const isAdminOrSuper = role === 'super_admin' || role === 'admin';
  const isAdminConsole = currentTab.startsWith('admin_') || currentTab === 'users_overview' || (role === 'super_admin' && !['dashboard', 'attention', 'orders', 'settlements', 'products', 'inventory', 'suppliers', 'expenses', 'reports', 'pos', 'integrations', 'whatsapp', 'team', 'settings'].includes(currentTab));

  const activeStoreName = merchantName || 'Store Account';
  const displayPlan = planLabel || (role === 'agency_owner' ? 'OWNER' : 'GROWTH');
  const countOfStores = storesCount || (stores.length > 0 ? stores.length : 1);

  // Accounting Navigation Links (Pure typography, zero icons)
  const navItemsAccounting = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'attention', label: 'Needs attention', badge: attentionCount > 0 ? attentionCount : null },
    { id: 'orders', label: 'Orders' },
    { id: 'settlements', label: 'Courier settlements' },
    { id: 'products', label: 'Inventory' },
    { id: 'suppliers', label: 'Suppliers & purchases' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'reports', label: 'Reports' },
    { id: 'pos', label: 'POS / offline store' },
  ];

  // Workspace Navigation Links (Pure typography, zero icons)
  const navItemsWorkspace = [
    { id: 'integrations', label: 'Integrations' },
    { id: 'whatsapp', label: 'WhatsApp assistant' },
    { id: 'team', label: 'Team & roles' },
    { id: 'settings', label: 'Settings' },
  ];

  // Super Admin Navigation Sections (Matching Nirvul360 Admin Panel.pdf)
  const navSectionsAdmin = [
    {
      title: 'PLATFORM',
      items: [
        { id: 'admin_overview', label: 'Overview' },
        { id: 'admin_tenants', label: 'Tenants' },
        { id: 'admin_users', label: 'Users & sessions' },
        { id: 'admin_exceptions', label: 'Exception overview', badge: attentionCount > 0 ? attentionCount : null },
      ],
    },
    {
      title: 'REVENUE',
      items: [
        { id: 'admin_billing', label: 'Billing & plans' },
      ],
    },
    {
      title: 'OPERATIONS',
      items: [
        { id: 'admin_jobs', label: 'Job & queue monitor', dot: true },
        { id: 'admin_integrations', label: 'Integration health' },
        { id: 'admin_audit', label: 'Audit log' },
      ],
    },
    {
      title: 'CONTROL',
      items: [
        { id: 'admin_ai', label: 'AI control' },
        { id: 'admin_support', label: 'Support' },
        { id: 'admin_settings', label: 'System settings' },
      ],
    },
  ];

  const initials = user?.name
    ? user.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  const defaultStoresList: StoreOption[] = stores.length > 0 ? stores : [
    { id: 1, name: activeStoreName, plan: displayPlan, is_active: true },
  ];

  return (
    <aside className="w-64 bg-[#062E1F] border-r border-[#0A3725] flex flex-col justify-between h-screen sticky top-0 shrink-0 select-none text-white z-40">
      {/* Top Header & Navigation */}
      <div className="p-4 pb-0 flex flex-col gap-4 overflow-y-auto">
        {/* Brand Header */}
        <div className="flex flex-col px-1 pt-1">
          <span className="text-lg font-bold tracking-tight text-white leading-tight">
            nirvul360
          </span>
          <span className="text-xs text-[#7FA992] font-normal leading-tight">
            {isAdminConsole ? 'Super admin console' : 'Automated accounting'}
          </span>
        </div>

        {/* Store / Platform Header Card */}
        {isAdminConsole ? (
          <div className="bg-[#0B3828] border border-[#124B33] rounded-xl p-3 flex flex-col gap-1.5 shadow-xs">
            <span className="text-sm font-semibold text-white">Nirvul360 Platform</span>
            <div className="flex items-center justify-between text-xs text-[#7FA992]">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#D97706] text-white uppercase tracking-wider">
                SUPER ADMIN
              </span>
              <span className="text-[11px] font-medium text-[#A3C9B8]">Multi-tenant control</span>
            </div>
          </div>
        ) : (
          <div className="relative">
            <div
              onClick={() => setStoreMenuOpen(!storeMenuOpen)}
              className="bg-[#0B3828] border border-[#124B33] rounded-xl p-3 cursor-pointer hover:border-[#1E754E] transition flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-semibold text-white truncate max-w-[130px]">
                  {activeStoreName}
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#166534] text-white uppercase border border-[#22C55E]/30 tracking-wider shrink-0">
                  {displayPlan}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-[#7FA992]">
                <span className="flex items-center gap-1">
                  {countOfStores} {countOfStores === 1 ? 'store' : 'stores'} <span className="text-[10px]">▾</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      liveStatus === 'connected' ? 'bg-[#22C55E] animate-pulse' : 'bg-[#7FA992]'
                    }`}
                  />
                  <span className="text-[10px] capitalize">{liveStatus}</span>
                </div>
              </div>
            </div>

            {/* Store Switcher Dropdown */}
            {storeMenuOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#0B3828] border border-[#124B33] rounded-xl shadow-xl p-2 z-50 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#6E9E85] tracking-wider px-2 py-1">
                  Your Stores ({defaultStoresList.length})
                </span>
                {defaultStoresList.map((st) => (
                  <button
                    key={st.id}
                    onClick={() => {
                      setStoreMenuOpen(false);
                      if (onSwitchStore) onSwitchStore(st.id);
                    }}
                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs transition ${
                      st.name === activeStoreName
                        ? 'bg-[#166534] text-white font-medium'
                        : 'text-[#8CAFA0] hover:bg-[#124B33] hover:text-white'
                    }`}
                  >
                    <span className="truncate">{st.name}</span>
                    {st.name === activeStoreName ? (
                      <span className="text-white text-xs">✓</span>
                    ) : (
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-[#062E1F] text-[#6E9E85]">
                        {st.plan || 'STORE'}
                      </span>
                    )}
                  </button>
                ))}
                {isAdminOrSuper && onOpenTenantSwitcher && (
                  <button
                    onClick={() => {
                      setStoreMenuOpen(false);
                      onOpenTenantSwitcher();
                    }}
                    className="mt-1 pt-1 border-t border-[#124B33] text-[11px] font-semibold text-[#CAE4D8] hover:text-white px-2 py-1 text-left"
                  >
                    Switch tenant (Admin) ↗
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Navigation Sections */}
        <div className="flex flex-col gap-4 pt-1">
          {isAdminConsole ? (
            /* Super Admin Navigation */
            navSectionsAdmin.map((sec) => (
              <div key={sec.title}>
                <span className="text-[11px] font-semibold text-[#6E9E85] uppercase tracking-wider px-3 pb-1 block">
                  {sec.title}
                </span>
                <div className="flex flex-col gap-0.5">
                  {sec.items.map((item: any) => {
                    const isActive = currentTab === item.id || (item.id === 'admin_overview' && currentTab === 'admin_cockpit') || (item.id === 'admin_users' && currentTab === 'users_overview');
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition ${
                          isActive
                            ? 'bg-[#166534] text-white font-medium'
                            : 'text-[#8CAFA0] hover:text-white hover:bg-[#0B3B28] font-normal'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 ml-2" />
                        ) : item.badge ? (
                          <span className="bg-[#F6D089] text-[#451A03] text-[10px] font-bold px-2 py-0.2 rounded-full shrink-0 ml-2">
                            {item.badge}
                          </span>
                        ) : item.dot ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0 ml-2" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            /* Client Store Navigation */
            <>
              {/* Section: ACCOUNTING */}
              <div>
                <span className="text-[11px] font-semibold text-[#6E9E85] uppercase tracking-wider px-3 pb-1 block">
                  ACCOUNTING
                </span>
                <div className="flex flex-col gap-0.5">
                  {navItemsAccounting.map((item) => {
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition ${
                          isActive
                            ? 'bg-[#166534] text-white font-medium'
                            : 'text-[#8CAFA0] hover:text-white hover:bg-[#0B3B28] font-normal'
                        }`}
                      >
                        <span>{item.label}</span>
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 ml-2" />
                        ) : item.badge ? (
                          <span className="bg-[#F6D089] text-[#451A03] text-[10px] font-bold px-2 py-0.2 rounded-full shrink-0 ml-2">
                            {item.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section: WORKSPACE */}
              <div>
                <span className="text-[11px] font-semibold text-[#6E9E85] uppercase tracking-wider px-3 pb-1 block">
                  WORKSPACE
                </span>
                <div className="flex flex-col gap-0.5">
                  {navItemsWorkspace.map((item) => {
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onTabChange(item.id)}
                        className={`flex items-center justify-between w-full px-3 py-2 rounded-xl text-xs transition ${
                          isActive
                            ? 'bg-[#166534] text-white font-medium'
                            : 'text-[#8CAFA0] hover:text-white hover:bg-[#0B3B28] font-normal'
                        }`}
                      >
                        <span>{item.label}</span>
                        {isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 ml-2" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-3.5 bg-[#062E1F] border-t border-[#0A3725] flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0B3B28] text-white font-bold text-xs flex items-center justify-center border border-[#14532D] shrink-0">
              {initials}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-white truncate leading-tight">
                {user?.name || (isAdminConsole ? 'Platform Admin' : 'User')}
              </span>
              <span className="text-[11px] text-[#8CAFA0] font-normal leading-tight capitalize">
                {isAdminConsole ? 'Super admin' : user?.role_label || (role === 'agency_owner' ? 'Owner' : role)}
              </span>
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 text-[#8CAFA0] hover:text-white hover:bg-[#0B3B28] rounded-lg transition text-xs"
          >
            Sign out
          </button>
        </div>

        {/* Console / Store Switcher Link */}
        {isAdminOrSuper && (
          <button
            onClick={() => onTabChange(isAdminConsole ? 'dashboard' : 'admin_overview')}
            className="w-full py-1.5 px-2.5 rounded-lg bg-[#0B3B28] hover:bg-[#124B33] text-[11px] font-semibold text-[#8CAFA0] hover:text-white flex items-center justify-between transition border border-[#124B33]"
          >
            <span>{isAdminConsole ? 'View Store Dashboard' : 'Super Admin Console'}</span>
            <span>↗</span>
          </button>
        )}
      </div>
    </aside>
  );
}
