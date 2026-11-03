'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';
import { DashboardKpis } from '@/components/DashboardKpis';
import { OrderPipeline } from '@/components/OrderPipeline';
import { DeliveriesList } from '@/components/DeliveriesList';
import { WhatsAppActivityCard } from '@/components/WhatsAppActivityCard';
import { ActionItemsCard } from '@/components/ActionItemsCard';
import { PnLTable } from '@/components/PnLTable';
import { OrdersView } from '@/components/OrdersView';
import { ProductsView } from '@/components/ProductsView';
import { MoneyView } from '@/components/MoneyView';
import { IntegrationsModal } from '@/components/IntegrationsModal';
import { ExpenseModal } from '@/components/ExpenseModal';
import { PurchaseModal } from '@/components/PurchaseModal';
import { WhatsAppDrawer } from '@/components/WhatsAppDrawer';
import { DeveloperCockpit } from '@/components/DeveloperCockpit';
import { TenantSwitcherModal } from '@/components/TenantSwitcherModal';
import { User, DashboardData, Order, Product, CashAccount } from '@/types';
import { api } from '@/lib/api';
import { realtime } from '@/lib/events';
import { InfoIcon } from '@/components/icons';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [merchant, setMerchant] = useState<{ id: number; name: string; status?: 'active' | 'paused'; paused_reason?: string | null } | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year'>('month');
  const [liveStatus, setLiveStatus] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [whatsAppOpen, setWhatsAppOpen] = useState(false);
  const [tenantSwitcherOpen, setTenantSwitcherOpen] = useState(false);

  // Data
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [recentEntries, setRecentEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadData = useCallback(async () => {
    try {
      const [dashRes, ordRes, prodRes, moneyRes] = await Promise.all([
        api.get<DashboardData>('/api/dashboard'),
        api.get<any>('/api/orders'),
        api.get<any>('/api/products'),
        api.get<{ entries: any[]; cash: CashAccount[] }>('/api/money'),
      ]);

      const orderList = Array.isArray(ordRes)
        ? ordRes
        : (ordRes?.rows && Array.isArray(ordRes.rows))
        ? ordRes.rows
        : [];
      const productList = Array.isArray(prodRes)
        ? prodRes
        : (prodRes?.rows && Array.isArray(prodRes.rows))
        ? prodRes.rows
        : [];

      setDashboard(dashRes);
      setOrders(orderList);
      setProducts(productList);
      setCashAccounts(moneyRes?.cash || []);
      setRecentEntries(moneyRes?.entries || []);
    } catch (err: any) {
      if (err.status === 401) {
        setUser(null);
        router.replace('/login');
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  // Check auth session
  useEffect(() => {
    api
      .get<{ user: User; merchant: { id: number; name: string; status?: 'active' | 'paused'; paused_reason?: string | null } }>('/api/me')
      .then((res) => {
        if (res?.user) {
          setUser(res.user);
          if (res?.merchant) {
            setMerchant(res.merchant);
          }
          if (res?.merchant?.status === 'paused' && res.user.role !== 'super_admin' && res.user.role !== 'admin') {
            setLoading(false);
          } else {
            loadData();
          }
        } else {
          router.replace('/login');
        }
      })
      .catch(() => {
        router.replace('/login');
      });
  }, [router, loadData]);

  const handleInspectTenant = async (merchantId: number, merchantName: string) => {
    try {
      await api.post('/api/admin/switch-tenant', { merchant_id: merchantId });
      const meRes = await api.get<{ user: User; merchant: { id: number; name: string; status?: 'active' | 'paused'; paused_reason?: string | null } }>('/api/me');
      if (meRes?.merchant) {
        setMerchant(meRes.merchant);
      } else {
        setMerchant({ id: merchantId, name: merchantName });
      }
      await loadData();
      setCurrentTab('dashboard');
      showToast(`Switched developer context to ${merchantName}`);
    } catch (err: any) {
      showToast(err.message || 'Failed to switch merchant');
    }
  };

  const handleResumeCurrentTenant = async () => {
    if (!merchant) return;
    try {
      await api.post(`/api/admin/tenants/${merchant.id}/resume`);
      setMerchant((prev) => (prev ? { ...prev, status: 'active', paused_reason: null } : null));
      showToast(`Tenant "${merchant.name}" access has been resumed successfully.`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to resume tenant');
    }
  };

  // Realtime SSE connection
  useEffect(() => {
    if (!user) return;

    realtime.connect();
    const unsubStatus = realtime.onStatusChange((s) => setLiveStatus(s));

    // Hot-update data on any ledger or order event!
    const unsubEvents = realtime.subscribe((event) => {
      console.log('Realtime event received:', event);
      loadData();
    });

    return () => {
      unsubStatus();
      unsubEvents();
      realtime.disconnect();
    };
  }, [user, loadData]);

  const handleTabChange = (tab: string) => {
    if (tab === 'integrations') {
      setIntegrationsOpen(true);
      return;
    }
    if (tab === 'whatsapp') {
      setWhatsAppOpen(true);
      return;
    }
    setCurrentTab(tab);
  };

  const handleSignOut = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {}
    setUser(null);
    router.replace('/login');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-stone-900 animate-spin" />
        <span className="text-xs font-semibold text-stone-500">Checking authentication...</span>
      </div>
    );
  }

  // Account Suspended Screen for Tenant Users (Agency Owner / Accountant)
  if (merchant?.status === 'paused' && user.role !== 'super_admin' && user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#F5F2EB] flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl flex flex-col items-center text-center gap-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center text-3xl border border-rose-100 shadow-xs">
            ⏸️
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 w-fit mx-auto">
              Account Suspended
            </span>
            <h1 className="text-xl font-black text-stone-900 mt-1">
              Subscription Payment Overdue
            </h1>
            <p className="text-xs text-stone-600">
              Access to <strong className="text-stone-900">{merchant.name}</strong> is temporarily paused due to an outstanding subscription invoice.
            </p>
          </div>

          <div className="w-full bg-[#FAF8F5] border border-stone-200 rounded-2xl p-4 text-left flex flex-col gap-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-stone-400 font-medium">Store Account</span>
              <span className="font-bold text-stone-800">{merchant.name} (#{merchant.id})</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-stone-400 font-medium">Your Role</span>
              <span className="font-semibold text-stone-800">{user.role_label}</span>
            </div>
            <div className="pt-2 border-t border-stone-200/60 flex flex-col gap-1">
              <span className="text-stone-400 font-medium text-[11px]">Suspension Note:</span>
              <span className="font-semibold text-rose-700 bg-rose-50/80 p-2.5 rounded-xl border border-rose-100 text-xs leading-relaxed">
                {merchant.paused_reason || 'Subscription payment overdue'}
              </span>
            </div>
          </div>

          <p className="text-xs text-stone-500 max-w-sm leading-relaxed">
            Please contact the Gross Management Platform Super Administrator to settle the balance and restore immediate access.
          </p>

          <div className="w-full flex flex-col gap-2 pt-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition shadow-sm"
            >
              Check &amp; Refresh Status
            </button>
            <button
              onClick={handleSignOut}
              className="w-full py-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-600 text-xs font-semibold transition"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const exceptionsCount = dashboard?.alerts
    ? (dashboard.alerts.stuck_parcels || 0) +
      (dashboard.alerts.short_settlements || 0) +
      (dashboard.alerts.missing_costs || 0)
    : 7;

  return (
    <div className="flex min-h-screen bg-[#FAF8F5]">
      {/* 1. Left Sticky Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={handleTabChange}
        user={user}
        merchantName={merchant?.name}
        attentionCount={exceptionsCount}
        liveStatus={liveStatus}
        onSignOut={handleSignOut}
        onOpenWhatsApp={() => setWhatsAppOpen(true)}
        onOpenTenantSwitcher={() => setTenantSwitcherOpen(true)}
      />

      {/* 2. Main Content Area */}
      <main className="flex-1 p-6 md:p-8 lg:p-10 max-w-7xl mx-auto flex flex-col gap-6 overflow-x-hidden">
        {/* Header with Search & Controls */}
        <Header
          user={user}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          exceptionsCount={exceptionsCount}
          onReviewExceptions={() => setCurrentTab('orders')}
          onOpenExpenseModal={() => setExpenseModalOpen(true)}
          onOpenPurchaseModal={() => setPurchaseModalOpen(true)}
          onRefresh={loadData}
        />

        {/* Paused Tenant Warning Banner for Admins */}
        {merchant?.status === 'paused' && (user.role === 'super_admin' || user.role === 'admin') && (
          <div className="bg-rose-600 text-white rounded-2xl p-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-rose-700 animate-in fade-in slide-in-from-top-1">
            <div className="flex items-center gap-3 text-xs">
              <span className="text-xl">⏸️</span>
              <div>
                <span className="font-bold block tracking-wide">
                  TENANT ACCOUNT PAUSED: {merchant.name} (Staff Locked Out)
                </span>
                <span className="text-rose-100 text-[11px]">
                  Reason: <strong>{merchant.paused_reason || 'Subscription payment overdue'}</strong>. Staff cannot access the dashboard until resumed.
                </span>
              </div>
            </div>
            <button
              onClick={handleResumeCurrentTenant}
              className="px-4 py-1.5 rounded-xl bg-white text-rose-700 hover:bg-rose-50 font-bold text-xs transition shrink-0 shadow-xs flex items-center gap-1.5"
            >
              <span>Resume Tenant Access</span>
              <span>▶️</span>
            </button>
          </div>
        )}

        {/* Developer Impersonation Oversight Banner */}
        {(user.role === 'super_admin' || user.role === 'admin') && currentTab === 'dashboard' && (
          <div className="bg-purple-950 text-purple-100 border border-purple-800 rounded-2xl p-3.5 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3 text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5FF44] animate-pulse shrink-0" />
              <span>
                <strong>Developer Oversight Active:</strong> Currently inspecting live books &amp; dashboard for{' '}
                <strong className="underline text-white font-bold">{merchant?.name || 'Artisan Wear Bangladesh'}</strong>.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setTenantSwitcherOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-purple-900 hover:bg-purple-800 text-purple-200 text-xs font-semibold border border-purple-700 transition"
              >
                Switch Tenant ▾
              </button>
              <button
                onClick={() => setCurrentTab('admin_cockpit')}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-xs"
              >
                Exit to Developer Cockpit
              </button>
            </div>
          </div>
        )}

        {/* Real-time Toast Banner */}
        {toastMessage && (
          <div className="p-3 bg-stone-900 text-white rounded-2xl flex items-center justify-between text-xs shadow-md animate-fade-in border border-stone-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#E5FF44]" />
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-stone-400 hover:text-white text-xs px-2"
            >
              &times;
            </button>
          </div>
        )}

        {/* Loading state placeholder */}
        {loading && !dashboard ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-stone-400">
            <div className="w-8 h-8 rounded-full border-2 border-stone-300 border-t-stone-900 animate-spin" />
            <span className="text-xs font-medium">Loading ledger &amp; cash accounts...</span>
          </div>
        ) : (
          <>
            {/* View: Dashboard */}
            {currentTab === 'dashboard' && dashboard && (
              <div className="flex flex-col gap-6">
                {/* 7 KPI Cards (Delivered Sales, Gross Profit, Net Profit, Orders Placed, Delivery Rate, Held at Couriers, Net Margin) */}
                {dashboard.kpis ? (
                  <DashboardKpis kpis={dashboard.kpis} />
                ) : (
                  <div className="p-4 bg-stone-100 rounded-2xl text-xs text-stone-500">Calculating KPIs...</div>
                )}

                {/* Numbers You Can Trust Notice */}
                <div className="bg-white border border-[#E8E4DA] rounded-2xl p-4 flex items-center justify-between text-xs text-stone-600 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <InfoIcon className="w-4 h-4 text-stone-700 shrink-0" />
                    <span>
                      <strong>Numbers you can trust:</strong> Profit only includes delivered orders. Product value is measured at versioned purchase cost.
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider hidden sm:inline">
                    Double-Entry Guaranteed
                  </span>
                </div>

                {/* Order & Profit Pipeline (5-stage funnel) */}
                {dashboard.pipeline && (
                  <OrderPipeline
                    pipeline={dashboard.pipeline}
                    netMarginPct={dashboard.kpis?.net_margin_pct ?? 0}
                  />
                )}

                {/* 3-Column Mid Section: Deliveries, WhatsApp Activity, Action Items */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <DeliveriesList
                    deliveries={dashboard.today_deliveries && dashboard.today_deliveries.length > 0 ? dashboard.today_deliveries : orders}
                    onViewAllOrders={() => setCurrentTab('orders')}
                    onOpenOrderModal={() => setCurrentTab('orders')}
                    onOpenExpenseModal={() => setExpenseModalOpen(true)}
                  />
                  <WhatsAppActivityCard onOpenSimulator={() => setWhatsAppOpen(true)} />
                  <ActionItemsCard
                    alerts={dashboard.alerts || { stuck_parcels: 0, short_settlements: 0, missing_costs: 0, courier_settlements_pending: 0 }}
                    onOpenExceptions={() => setCurrentTab('orders')}
                    onOpenSettlements={() => setCurrentTab('settlements')}
                    onOpenProducts={() => setCurrentTab('products')}
                  />
                </div>

                {/* Double-Entry Profit & Loss Statement Table */}
                {dashboard.pnl && <PnLTable pnl={dashboard.pnl} />}
              </div>
            )}

            {/* View: Orders */}
            {currentTab === 'orders' && (
              <OrdersView
                orders={orders}
                onRefresh={loadData}
                onOpenOrderModal={() => showToast('Order creation modal opened')}
              />
            )}

            {/* View: Inventory */}
            {currentTab === 'products' && (
              <ProductsView
                products={products}
                onRefresh={loadData}
                onOpenPurchaseModal={() => setPurchaseModalOpen(true)}
                userRole={user?.role}
              />
            )}

            {/* View: Money & Cash */}
            {currentTab === 'money' && (
              <MoneyView
                cashAccounts={cashAccounts}
                entries={recentEntries}
                onRefresh={loadData}
                onOpenExpenseModal={() => setExpenseModalOpen(true)}
              />
            )}

            {/* View: Developer Cockpit / SaaS Monitor */}
            {currentTab === 'admin_cockpit' && (
              <DeveloperCockpit
                onInspectTenant={handleInspectTenant}
                activeMerchantId={merchant?.id}
              />
            )}

            {/* View: Needs Attention / Settlements */}
            {(currentTab === 'attention' || currentTab === 'settlements' || currentTab === 'settings') && (
              <div className="bg-white border border-[#E8E4DA] rounded-2xl p-6 shadow-2xs flex flex-col gap-4">
                <h2 className="text-base font-bold text-stone-900 capitalize tracking-tight">
                  {currentTab.replace('_', ' ')}
                </h2>
                <p className="text-xs text-stone-500">
                  {currentTab === 'attention' && '7 exception items waiting for resolution: stuck parcels, short settlements, and uncosted products.'}
                  {currentTab === 'settlements' && 'Courier settlements from Steadfast and Pathao ready for automated reconciliation.'}
                  {currentTab === 'settings' && 'Merchant credentials, API webhooks, Supabase cloud sync, and 4-tier hierarchy user access.'}
                </p>
                <div className="pt-2">
                  <button
                    onClick={() => setCurrentTab('dashboard')}
                    className="text-xs font-semibold bg-stone-900 text-white px-4 py-2 rounded-xl"
                  >
                    Return to Dashboard
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* 3. Interactive Modals & Drawers */}
      <IntegrationsModal
        isOpen={integrationsOpen}
        onClose={() => setIntegrationsOpen(false)}
        user={user}
        onSuccess={showToast}
      />

      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          loadData();
        }}
      />

      <PurchaseModal
        isOpen={purchaseModalOpen}
        onClose={() => setPurchaseModalOpen(false)}
        products={products}
        onSuccess={(msg) => {
          showToast(msg);
          loadData();
        }}
      />

      <WhatsAppDrawer
        isOpen={whatsAppOpen}
        onClose={() => setWhatsAppOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          loadData();
        }}
      />

      {/* Tenant Impersonation & Switcher Modal for Developers/Admins */}
      <TenantSwitcherModal
        isOpen={tenantSwitcherOpen}
        onClose={() => setTenantSwitcherOpen(false)}
        onSelectTenant={handleInspectTenant}
        activeMerchantId={merchant?.id}
      />
    </div>
  );
}
