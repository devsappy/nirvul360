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
      <div className="bg-[#025033] text-[#FFFFFF] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-[#00432C]">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#05572F] border border-[#3A8067] text-[#CAE4D8] text-[11px] font-bold tracking-wider uppercase w-fit">
            <ShieldIcon className="w-3.5 h-3.5 text-[#CAE4D8]" />
            <span>Developer &amp; Platform Admin Cockpit</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#FFFFFF]">
            SaaS Multi-Tenant Monitoring Tower
          </h1>
          <p className="text-xs sm:text-sm text-[#CAE4D8] font-medium max-w-xl">
            Monitor real-time user activities across all client organizations, review system telemetry, and inspect any tenant dashboard with 1 click.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#05572F] hover:bg-[#00432C] text-[#FFFFFF] text-xs font-bold transition border border-[#3A8067]"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#CAE4D8] hover:bg-[#E6F7EF] text-[#025033] text-xs font-bold transition shadow-md border border-[#3A8067]"
          >
            <PlusIcon className="w-3.5 h-3.5 text-[#025033]" />
            <span>Onboard New Tenant</span>
          </button>
        </div>
      </div>

      {/* Action Notice Notification */}
      {actionNotice && (
        <div className="bg-[#00432C] text-[#FFFFFF] rounded-2xl px-5 py-3 text-xs flex items-center justify-between shadow-lg border border-[#05572F] animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#CAE4D8] animate-pulse" />
            <span className="font-medium text-[#FFFFFF]">{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-[#CAE4D8] hover:text-[#FFFFFF] font-bold ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* 2. Platform Telemetry Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">Total SaaS Tenants</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-[#025033]">{stats?.tenants_count || tenants.length}</span>
            <span className="text-xs font-bold text-[#025033] ml-2">Active</span>
          </div>
          <span className="text-[11px] text-[#3A8067]">Stores on platform</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">Total Users Registered</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-[#025033]">{stats?.users_count || 0}</span>
            <span className="text-xs font-medium text-[#3A8067] ml-1.5">Across 4 tiers</span>
          </div>
          <span className="text-[11px] text-[#3A8067]">Super Admin &gt; Admin &gt; Owner &gt; Accountant</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">Platform Total GMV</span>
          <div className="my-2">
            <span className="text-2xl sm:text-3xl font-black text-[#025033]">
              {stats?.total_gmv ? formatBDT(stats.total_gmv) : '৳0'}
            </span>
          </div>
          <span className="text-[11px] text-[#3A8067]">{stats?.total_orders || 0} total orders tracked</span>
        </div>

        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">Real-time Telemetry</span>
          <div className="my-2 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#025033] animate-pulse" />
            <span className="text-xl sm:text-2xl font-black text-[#025033]">
              {stats?.active_realtime_listeners ?? 1} Listeners
            </span>
          </div>
          <span className="text-[11px] text-[#3A8067]">
            {loading && !stats
              ? 'Checking database connection...'
              : stats?.supabase?.connected
              ? 'Supabase Cloud (PostgreSQL) Connected'
              : 'Local SQLite Fallback Active'}
          </span>
        </div>
      </div>

      {/* 3. Main Section: Tenant Directory & Live User Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: All SaaS Tenants (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-[#025033]">Registered SaaS Tenants</h2>
              <p className="text-xs text-[#3A8067]">Click &quot;View Dashboard&quot; to inspect any merchant as developer</p>
            </div>
            
            <div className="relative min-w-[200px]">
              <SearchIcon className="w-3.5 h-3.5 text-[#3A8067] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tenant or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {filteredTenants.map((t) => {
              const isCurrent = t.id === activeMerchantId;
              return (
                <div
                  key={t.id}
                  className={`bg-[#FFFFFF] border rounded-2xl p-5 transition shadow-2xs flex flex-col gap-4 ${
                    isCurrent ? 'border-[#025033] ring-2 ring-[#CAE4D8]' : 'border-[#E5EAE7] hover:border-[#3A8067]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#025033] text-[#CAE4D8] font-black text-xs flex items-center justify-center shrink-0 border border-[#00432C]">
                        {t.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-[#025033] text-sm">{t.name}</span>
                          <span className="text-[10px] text-[#3A8067] font-mono">#{t.id}</span>
                          {isCurrent && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#05572F] text-[#FFFFFF] border border-[#3A8067]">
                              Active View
                            </span>
                          )}
                          {t.status === 'paused' ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#CAE4D8] text-[#025033] border border-[#3A8067] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#025033] animate-pulse" />
                              Paused (Overdue)
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#025033]" />
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[#3A8067]">
                          Owner: <strong className="text-[#025033] font-semibold">{t.owner.name}</strong> ({t.owner.email})
                        </span>
                        {t.status === 'paused' && t.paused_reason && (
                          <div className="text-[11px] text-[#025033] bg-[#E6F7EF] border border-[#CAE4D8] rounded-lg px-2.5 py-0.5 mt-1 flex items-center gap-1.5 w-fit">
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
                          className="px-3 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] shadow-xs disabled:opacity-50"
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
                          className="px-3 py-1.5 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] disabled:opacity-50"
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
                            ? 'bg-[#00432C] text-[#FFFFFF] ring-1 ring-[#CAE4D8]'
                            : 'bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F]'
                        }`}
                      >
                        <span>{isCurrent ? 'Inspecting' : 'View Dashboard'}</span>
                        <span className="text-[10px] opacity-75">👁️</span>
                      </button>
                    </div>
                  </div>

                  {/* Metrics & Badges */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-[#E5EAE7] bg-[#FAFCF9] rounded-xl px-3 text-xs">
                    <div>
                      <span className="text-[10px] text-[#3A8067] uppercase font-semibold block">Total Orders</span>
                      <strong className="text-[#025033] font-bold">{t.metrics.total_orders}</strong>
                      <span className="text-[10px] text-[#025033] ml-1">({t.metrics.delivered_count} del)</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#3A8067] uppercase font-semibold block">Total GMV</span>
                      <strong className="text-[#025033] font-bold">{formatBDT(t.metrics.total_gmv)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#3A8067] uppercase font-semibold block">Staff Users</span>
                      <strong className="text-[#025033] font-bold">{t.user_counts.total} users</strong>
                      <span className="text-[10px] text-[#3A8067] ml-1">({t.user_counts.accountants} acc)</span>
                    </div>
                  </div>

                  {/* Integrations & Last Active */}
                  <div className="flex items-center justify-between text-[11px] text-[#3A8067]">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[#3A8067]">Integrations:</span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.courier ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]' : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'}`}>
                        Courier
                      </span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.meta_ads ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]' : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'}`}>
                        Meta Ads
                      </span>
                      <span className={`px-2 py-0.5 rounded-md font-semibold ${t.integrations.whatsapp ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]' : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'}`}>
                        WhatsApp Bot
                      </span>
                    </div>

                    <span className="text-[10px] text-[#3A8067]">
                      Active: {timeAgo(t.last_active)}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredTenants.length === 0 && (
              <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-8 text-center text-xs text-[#3A8067]">
                No tenants matched your search criteria.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Platform-Wide Live Activity Feed (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#025033]">Platform Live Activity Feed</h2>
              <p className="text-xs text-[#3A8067]">Audit stream of what other users are doing</p>
            </div>

            {/* Filter Dropdown */}
            <select
              value={filterMerchant}
              onChange={(e) => setFilterMerchant(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-2.5 py-1 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
            >
              <option value="all">All Merchants</option>
              {tenants.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 shadow-2xs flex flex-col divide-y divide-[#E5EAE7] max-h-[640px] overflow-y-auto">
            {filteredActivity.map((act) => {
              const detailsObj = act.details ? (() => {
                try { return JSON.parse(act.details); } catch { return act.details; }
              })() : null;

              return (
                <div key={act.id} className="py-3 flex flex-col gap-1 first:pt-1 last:pb-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-[#025033]">{act.actor}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#E6F7EF] text-[#025033] font-medium border border-[#CAE4D8]">
                        {act.merchant_name}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#3A8067]">{timeAgo(act.at)}</span>
                  </div>

                  <div className="text-xs text-[#025033] font-medium flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#025033] shrink-0" />
                    <span className="font-semibold text-[#025033] capitalize">
                      {act.action.replace(/_/g, ' ')}
                    </span>
                    {detailsObj && typeof detailsObj === 'object' && detailsObj.note && (
                      <span className="text-[#3A8067]">&bull; {detailsObj.note}</span>
                    )}
                    {detailsObj && typeof detailsObj === 'object' && detailsObj.amount && (
                      <span className="text-[#025033] font-bold">
                        ৳{detailsObj.amount.toLocaleString()}
                      </span>
                    )}
                  </div>

                  {detailsObj && typeof detailsObj === 'object' && detailsObj.synced_orders && (
                    <div className="text-[10px] text-[#3A8067] pl-3">
                      Courier sync: {detailsObj.synced_orders} orders updated, COD: ৳{(detailsObj.cod_collected / 100).toLocaleString()}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredActivity.length === 0 && (
              <div className="py-12 text-center text-xs text-[#3A8067]">
                No recent activity recorded for this tenant.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal: Onboard New Tenant */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#00432C]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E5EAE7] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#025033] text-[#CAE4D8] flex items-center justify-center">
                  <PlusIcon className="w-4 h-4 text-[#CAE4D8]" />
                </div>
                <h3 className="font-bold text-[#025033] text-sm">Onboard New SaaS Tenant</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-7 h-7 rounded-full hover:bg-[#E6F7EF] text-[#3A8067] flex items-center justify-center transition"
              >
                &times;
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-xs rounded-xl font-medium">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Store / Brand Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sylhet Artisan Crafts"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  required
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Agency Owner Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Anisul Haque"
                  value={newOwnerName}
                  onChange={(e) => setNewOwnerName(e.target.value)}
                  required
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Owner Email
                </label>
                <input
                  type="email"
                  placeholder="owner@store.bd"
                  value={newOwnerEmail}
                  onChange={(e) => setNewOwnerEmail(e.target.value)}
                  required
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Owner Initial Password
                </label>
                <input
                  type="password"
                  value={newOwnerPassword}
                  onChange={(e) => setNewOwnerPassword(e.target.value)}
                  required
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Owner WhatsApp / Phone (Optional)
                </label>
                <input
                  type="text"
                  placeholder="88017XXXXXXXX"
                  value={newOwnerPhone}
                  onChange={(e) => setNewOwnerPhone(e.target.value)}
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7] mt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl text-[#3A8067] hover:bg-[#E6F7EF] text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] text-xs font-bold transition disabled:opacity-50"
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
        <div className="fixed inset-0 z-50 bg-[#00432C]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-3xl max-w-md w-full p-6 shadow-2xl border border-[#E5EAE7] flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#E6F7EF] text-[#025033] flex items-center justify-center text-sm border border-[#CAE4D8]">
                  ⏸️
                </div>
                <div>
                  <h3 className="font-bold text-[#025033] text-sm">Pause Tenant Dashboard</h3>
                  <span className="text-[11px] text-[#3A8067]">{pauseModalTenant.name} (#{pauseModalTenant.id})</span>
                </div>
              </div>
              <button
                onClick={() => setPauseModalTenant(null)}
                className="w-7 h-7 rounded-full hover:bg-[#E6F7EF] text-[#3A8067] flex items-center justify-center transition"
              >
                &times;
              </button>
            </div>

            <div className="bg-[#E6F7EF] border border-[#CAE4D8] rounded-2xl p-3.5 text-xs text-[#025033] flex flex-col gap-1.5">
              <span className="font-bold flex items-center gap-1.5 text-[#025033]">
                <span>⚠️</span> Immediate Lockout Effect:
              </span>
              <p className="text-[11px] text-[#3A8067] leading-relaxed">
                Pausing this organization locks out its Agency Owners and Accountants from reading or mutating operational data. Super Admins retain the ability to inspect and resume the account at any time.
              </p>
            </div>

            <form onSubmit={handlePauseConfirm} className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#025033] uppercase mb-1">
                  Reason for Suspension
                </label>
                <input
                  type="text"
                  placeholder="e.g. Subscription payment overdue (November)"
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  required
                  className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
                />
                <span className="text-[10px] text-[#3A8067] mt-1 block">
                  This notice will be displayed to staff members attempting to access the dashboard.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7] mt-2">
                <button
                  type="button"
                  onClick={() => setPauseModalTenant(null)}
                  className="px-4 py-2 rounded-xl text-[#3A8067] hover:bg-[#E6F7EF] text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-4 py-2 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] text-xs font-bold transition disabled:opacity-50 shadow-sm flex items-center gap-1.5"
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
