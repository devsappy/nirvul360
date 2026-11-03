'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
  ShieldIcon,
  RefreshIcon,
  PlusIcon,
  SearchIcon
} from './icons';

interface TenantOwner {
  id: number | null;
  name: string;
  email: string | null;
  phone: string | null;
}

interface TenantMetrics {
  total_orders: number;
  total_gmv: number;
  delivered_gmv: number;
  delivered_count: number;
  returned_count: number;
  in_transit_count: number;
  recorded_cash: number;
}

interface Tenant {
  id: number;
  name: string;
  status: 'active' | 'paused';
  paused_reason?: string | null;
  created_at: string;
  is_active_selection: boolean;
  owner: TenantOwner;
  user_counts: {
    total: number;
    accountants: number;
  };
  metrics: TenantMetrics;
  integrations: {
    courier: boolean;
    meta_ads: boolean;
    whatsapp: boolean;
  };
  last_active: string;
}

interface ActivityItem {
  id: number;
  at: string;
  merchant_id: number;
  merchant_name: string;
  actor: string;
  raw_actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: string | null;
}

interface SystemStats {
  tenants_count: number;
  users_count: number;
  total_orders: number;
  total_gmv: number;
  total_journals: number;
  active_realtime_listeners: number;
  supabase: {
    configured: boolean;
    connected: boolean;
  };
}

interface DeveloperCockpitProps {
  onInspectTenant: (merchantId: number, merchantName: string) => void;
  activeMerchantId?: number;
}

export function DeveloperCockpit({ onInspectTenant, activeMerchantId }: DeveloperCockpitProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterMerchant, setFilterMerchant] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Tenant Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerPassword, setNewOwnerPassword] = useState('password123');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Pause / Resume Tenant Modal & Actions
  const [pauseModalTenant, setPauseModalTenant] = useState<Tenant | null>(null);
  const [pauseReason, setPauseReason] = useState('Subscription payment overdue');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const handlePauseConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseModalTenant) return;
    setActionLoading(true);
    try {
      await api.post(`/api/admin/tenants/${pauseModalTenant.id}/pause`, {
        reason: pauseReason.trim() || 'Subscription payment overdue',
      });
      const name = pauseModalTenant.name;
      setPauseModalTenant(null);
      await loadData();
      setActionNotice(`Paused account for ${name}. Staff users are now locked out.`);
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to pause tenant account');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResumeTenant = async (tenant: Tenant) => {
    setActionLoading(true);
    try {
      await api.post(`/api/admin/tenants/${tenant.id}/resume`);
      await loadData();
      setActionNotice(`Resumed account for ${tenant.name}. Staff access restored.`);
      setTimeout(() => setActionNotice(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Failed to resume tenant account');
    } finally {
      setActionLoading(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [tRes, aRes, sRes] = await Promise.all([
        api.get<{ tenants: Tenant[]; current_merchant_id: number }>('/api/admin/tenants'),
        api.get<{ activity: ActivityItem[] }>('/api/admin/activity?limit=50'),
        api.get<SystemStats>('/api/admin/stats'),
      ]);
      setTenants(tRes.tenants || []);
      setActivity(aRes.activity || []);
      setStats(sRes);
    } catch (err) {
      console.error('Failed to load admin cockpit data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000); // 12s live polling fallback
    return () => clearInterval(interval);
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError(null);
    try {
      await api.post('/api/admin/create-tenant', {
        name: newStoreName,
        owner_name: newOwnerName,
        owner_email: newOwnerEmail,
        owner_password: newOwnerPassword,
        owner_whatsapp: newOwnerPhone,
      });
      setShowCreateModal(false);
      setNewStoreName('');
      setNewOwnerName('');
      setNewOwnerEmail('');
      setNewOwnerPhone('');
      await loadData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to onboard tenant');
    } finally {
      setCreateLoading(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.owner.name && t.owner.name.toLowerCase().includes(q)) ||
      (t.owner.email && t.owner.email.toLowerCase().includes(q))
    );
  });

  const filteredActivity = activity.filter((act) => {
    if (filterMerchant === 'all') return true;
    return act.merchant_id === filterMerchant;
  });

  const formatBDT = (poisha: number) => {
    const taka = poisha / 100;
    return `৳${taka.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const timeAgo = (iso: string) => {
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return 'just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return `${Math.floor(diffSec / 86400)}d ago`;
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-8 pb-16">
      
      {/* 1. Header Banner */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col gap-2 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-purple-300 text-[11px] font-bold tracking-wider uppercase w-fit">
            <ShieldIcon className="w-3.5 h-3.5" />
            <span>Developer &amp; Platform Admin Cockpit</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            SaaS Multi-Tenant Monitoring Tower
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 font-medium max-w-xl">
            Monitor real-time user activities across all client organizations, review system telemetry, and inspect any tenant dashboard with 1 click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition border border-white/10"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#E5FF44] hover:bg-[#d6f030] text-stone-950 text-xs font-bold transition shadow-md"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>Onboard New Tenant</span>
          </button>
        </div>
      </div>

      {/* Action Notice Notification */}
      {actionNotice && (
        <div className="bg-stone-900 text-white rounded-2xl px-5 py-3 text-xs flex items-center justify-between shadow-lg border border-stone-800 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#E5FF44] animate-pulse" />
            <span className="font-medium">{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-stone-400 hover:text-white font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2. Platform Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total SaaS Tenants</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-stone-900">{stats?.tenants_count || tenants.length}</span>
            <span className="text-xs font-bold text-emerald-600 ml-2">Active</span>
          </div>
          <span className="text-[11px] text-stone-400">Stores on platform</span>
        </div>

        <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Total Users Registered</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-stone-900">{stats?.users_count || 0}</span>
            <span className="text-xs font-medium text-stone-500 ml-1.5">Across 4 tiers</span>
          </div>
          <span className="text-[11px] text-stone-400">Super Admin &gt; Admin &gt; Owner &gt; Accountant</span>
        </div>

        <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Platform Total GMV</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-stone-900">
              {stats?.total_gmv ? formatBDT(stats.total_gmv) : '৳0'}
            </span>
          </div>
          <span className="text-[11px] text-stone-400">{stats?.total_orders || 0} total orders tracked</span>
        </div>

        <div className="bg-white border border-[#E8E4DA] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-stone-500 uppercase tracking-wider">Real-time Telemetry</span>
          <div className="my-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xl sm:text-2xl font-black text-stone-900">
              {stats?.active_realtime_listeners ?? 1} Listeners
            </span>
          </div>
          <span className="text-[11px] text-stone-400">
            {stats?.supabase?.connected ? 'Supabase Cloud Connected' : 'Local SQLite + SSE Active'}
          </span>
        </div>
      </div>

      {/* 3. Main Section: Tenant Directory & Live User Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: All SaaS Tenants (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Registered SaaS Tenants</h2>
              <p className="text-xs text-stone-500">Click &quot;View Dashboard&quot; to inspect any merchant as developer</p>
            </div>
            
            <div className="relative min-w-[200px]">
              <SearchIcon className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tenant or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-stone-200 rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-800 focus:outline-none focus:border-stone-900"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {filteredTenants.map((t) => {
              const isCurrent = t.id === activeMerchantId;
              return (
                <div
                  key={t.id}
                  className={`bg-white border rounded-2xl p-5 transition shadow-2xs flex flex-col gap-4 ${
                    isCurrent ? 'border-purple-500 ring-2 ring-purple-100' : 'border-[#E8E4DA] hover:border-stone-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-stone-900 text-[#E5FF44] font-black text-xs flex items-center justify-center shrink-0">
                        {t.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-stone-900 text-sm">{t.name}</span>
                          <span className="text-[10px] text-stone-400 font-mono">#{t.id}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                              Active View
                            </span>
                          )}
                          {t.status === 'paused' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Paused (Overdue)
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-stone-500">
                          Owner: <strong className="text-stone-700 font-semibold">{t.owner.name}</strong> ({t.owner.email})
                        </span>
                        {t.status === 'paused' && t.paused_reason && (
                          <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-0.5 mt-1 flex items-center gap-1.5 w-fit">
                            <span>⏸️</span>
                            <span>Suspension Note: <strong>{t.paused_reason}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {t.status === 'paused' ? (
                        <button
                          onClick={() => handleResumeTenant(t)}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
                          title="Reactivate account and restore staff access"
                        >
                          <span>Resume Account</span>
                          <span>▶️</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setPauseModalTenant(t);
                            setPauseReason('Subscription payment overdue');
                          }}
                          disabled={actionLoading}
                          className="px-3 py-1.5 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50"
                          title="Pause dashboard if subscription payment is overdue"
                        >
                          <span>Pause Account</span>
                          <span>⏸️</span>
                        </button>
                      )}

                      <button
                        onClick={() => onInspectTenant(t.id, t.name)}
                        className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 ${
                          isCurrent
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-stone-900 text-white hover:bg-stone-800'
                        }`}
                      >
                        <span>{isCurrent ? 'Inspecting' : 'View Dashboard'}</span>
                        <span className="text-[10px] opacity-75">👁️</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics & Badges */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-stone-100 bg-[#FAF8F5] rounded-xl px-3 text-xs">
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Total Orders</span>
                      <strong className="text-stone-900 font-bold">{t.metrics.total_orders}</strong>
                      <span className="text-[10px] text-emerald-600 ml-1">({t.metrics.delivered_count} del)</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Total GMV</span>
                      <strong className="text-stone-900 font-bold">{formatBDT(t.metrics.total_gmv)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase font-semibold block">Staff Users</span>
                      <strong className="text-stone-900 font-bold">{t.user_counts.total} users</strong>
                      <span className="text-[10px] text-stone-500 ml-1">({t.user_counts.accountants} acc)</span>
                    </div>
                  </div>

                  {/* Integrations & Last Active */}
                  <div className="flex items-center justify-between text-[11px] text-stone-500">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-stone-400">Integrations:</span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.courier ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-stone-100 text-stone-400'}`}>
                        Courier
                      </span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.meta_ads ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-stone-100 text-stone-400'}`}>
                        Meta Ads
                      </span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.whatsapp ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-stone-100 text-stone-400'}`}>
                        WhatsApp Bot
                      </span>
                    </div>

                    <span className="text-[10px] text-stone-400">
                      Active: {timeAgo(t.last_active)}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredTenants.length === 0 && (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 text-center text-xs text-stone-500">
                No tenants matched your search criteria.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Platform-Wide Live Activity Feed (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-stone-900">Platform Live Activity Feed</h2>
              <p className="text-xs text-stone-500">Audit stream of what other users are doing</p>
            </div>

            {/* Filter Dropdown */}
            <select
              value={filterMerchant}
              onChange={(e) => setFilterMerchant(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-white border border-stone-200 rounded-xl px-2.5 py-1 text-xs text-stone-700 focus:outline-none"
            >
              <option value="all">All Merchants</option>
              {tenants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-[#E8E4DA] rounded-2xl p-4 shadow-2xs flex flex-col divide-y divide-stone-100 max-h-[640px] overflow-y-auto">
            {filteredActivity.map((act) => {
              const detailsObj = act.details ? (() => {
                try { return JSON.parse(act.details); } catch { return act.details; }
              })() : null;

              return (
                <div key={act.id} className="py-3 flex flex-col gap-1 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-stone-900">{act.actor}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-600 font-medium">
                        {act.merchant_name}
                      </span>
                    </div>
                    <span className="text-[10px] text-stone-400">{timeAgo(act.at)}</span>
                  </div>

                  <div className="text-xs text-stone-700 font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    <span className="font-semibold text-stone-800 capitalize">
                      {act.action.replace(/_/g, ' ')}
                    </span>
                    {detailsObj && typeof detailsObj === 'object' && detailsObj.note && (
                      <span className="text-stone-500">&bull; {detailsObj.note}</span>
                    )}
                    {detailsObj && typeof detailsObj === 'object' && detailsObj.amount && (
                      <span className="text-stone-900 font-bold">
                        ৳{detailsObj.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {detailsObj && typeof detailsObj === 'object' && detailsObj.synced_orders && (
                    <div className="text-[10px] text-stone-500 pl-3">
                      Courier sync: {detailsObj.synced_orders} orders updated, COD: ৳{(detailsObj.cod_collected / 100).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredActivity.length === 0 && (
              <div className="py-12 text-center text-xs text-stone-400">
                No recent activity recorded for this tenant.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal: Onboard New Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-stone-900 text-[#E5FF44] flex items-center justify-center">
                  <PlusIcon className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-stone-900 text-sm">Onboard New SaaS Tenant</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-full hover:bg-stone-100 text-stone-400 flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Store / Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sylhet Artisan Crafts"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  required
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Agency Owner Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anisul Haque"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  required
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Owner Email
                </label>
                <input
                  type="email"
                  placeholder="owner@store.bd"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  required
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Owner Initial Password
                </label>
                <input
                  type="password"
                  value={newOwnerPassword}
                  onChange={(e) => setNewOwnerPassword(e.target.value)}
                  required
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Owner WhatsApp / Phone (Optional)
                </label>
                <input
                  type="text"
                  placeholder="88017XXXXXXXX"
                  value={newOwnerPhone}
                  onChange={(e) => setNewOwnerPhone(e.target.value)}
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {createLoading ? 'Provisioning...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Pause Tenant Account */}
      {pauseModalTenant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center text-sm border border-rose-200">
                  ⏸️
                </div>
                <div>
                  <h3 className="font-bold text-stone-900 text-sm">Pause Tenant Dashboard</h3>
                  <span className="text-[11px] text-stone-500">{pauseModalTenant.name} (#{pauseModalTenant.id})</span>
                </div>
              </div>
              <button
                onClick={() => setPauseModalTenant(null)}
                className="w-7 h-7 rounded-full hover:bg-stone-100 text-stone-400 flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-3.5 text-xs text-rose-900 flex flex-col gap-1.5">
              <span className="font-bold flex items-center gap-1.5 text-rose-800">
                <span>⚠️</span> Immediate Lockout Effect:
              </span>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                Pausing this organization locks out its Agency Owners and Accountants from reading or mutating operational data. Super Admins retain the ability to inspect and resume the account at any time.
              </p>
            </div>

            <form onSubmit={handlePauseConfirm} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-stone-600 uppercase mb-1">
                  Reason for Suspension
                </label>
                <input
                  type="text"
                  placeholder="e.g. Subscription payment overdue (November)"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  required
                  className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs text-stone-900 focus:outline-none focus:border-stone-900"
                />
                <span className="text-[10px] text-stone-400 mt-1 block">
                  This notice will be displayed to staff members attempting to access the dashboard.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100 mt-2">
                <button
                  type="button"
                  onClick={() => setPauseModalTenant(null)}
                  className="px-4 py-2 rounded-xl text-stone-600 hover:bg-stone-100 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition disabled:opacity-50 shadow-sm flex items-center gap-1.5"
                >
                  <span>{actionLoading ? 'Pausing...' : 'Confirm & Pause Account'}</span>
                  <span>⏸️</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
