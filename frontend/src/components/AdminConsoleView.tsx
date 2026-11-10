'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api, formatTaka } from '@/lib/api';
import { RefreshIcon } from './icons';

interface AdminConsoleViewProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onInspectTenant: (tenantId: number, tenantName: string) => void;
  showToast?: (msg: string) => void;
}

export function AdminConsoleView({
  currentTab,
  onTabChange,
  onInspectTenant,
  showToast = () => {},
}: AdminConsoleViewProps) {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'month' | 'quarter' | 'year'>('month');

  // Tab Data States
  const [overviewData, setOverviewData] = useState<any>(null);
  const [tenantsData, setTenantsData] = useState<any>(null);
  const [usersData, setUsersData] = useState<any>(null);
  const [exceptionsData, setExceptionsData] = useState<any>(null);
  const [billingData, setBillingData] = useState<any>(null);
  const [jobsData, setJobsData] = useState<any>(null);
  const [integrationsData, setIntegrationsData] = useState<any>(null);
  const [auditData, setAuditData] = useState<any>(null);
  const [aiData, setAiData] = useState<any>(null);
  const [supportData, setSupportData] = useState<any>(null);
  const [settingsData, setSettingsData] = useState<any>(null);

  // Selected Items for sidebars / drawers
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [tenantInspection, setTenantInspection] = useState<any>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userSessions, setUserSessions] = useState<any[]>([]);

  // Filters
  const [tenantFilter, setTenantFilter] = useState<'all' | 'active' | 'trial' | 'paused'>('all');
  const [tenantSearch, setTenantSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userSearch, setUserSearch] = useState('');
  const [auditAdminOnly, setAuditAdminOnly] = useState(false);
  const [supportFilter, setSupportFilter] = useState<'all' | 'urgent' | 'mine'>('all');

  // Announcement Form State
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMsg, setAnnouncementMsg] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState('all');
  const [announcementWhatsApp, setAnnouncementWhatsApp] = useState(true);

  // Fetch functions
  const loadTab = useCallback(async () => {
    setLoading(true);
    try {
      if (currentTab === 'admin_overview' || currentTab === 'overview') {
        const res = await api.get('/api/admin/overview');
        setOverviewData(res);
      } else if (currentTab === 'admin_tenants' || currentTab === 'tenants') {
        const res = await api.get<any>('/api/admin/tenants');
        setTenantsData(res);
        if (res?.tenants?.length && !selectedTenant) {
          setSelectedTenant(res.tenants[0]);
          loadTenantInspection(res.tenants[0].id);
        }
      } else if (currentTab === 'admin_users' || currentTab === 'users') {
        const res = await api.get<any>('/api/admin/users');
        setUsersData(res);
        if (res?.users?.length && !selectedUser) {
          setSelectedUser(res.users[0]);
          loadUserSessions(res.users[0].id);
        }
      } else if (currentTab === 'admin_exceptions' || currentTab === 'exceptions') {
        const res = await api.get('/api/admin/exceptions');
        setExceptionsData(res);
      } else if (currentTab === 'admin_billing' || currentTab === 'billing') {
        const res = await api.get('/api/admin/billing');
        setBillingData(res);
      } else if (currentTab === 'admin_jobs' || currentTab === 'jobs') {
        const res = await api.get('/api/admin/jobs');
        setJobsData(res);
      } else if (currentTab === 'admin_integrations' || currentTab === 'integrations') {
        const res = await api.get('/api/admin/integrations');
        setIntegrationsData(res);
      } else if (currentTab === 'admin_audit' || currentTab === 'audit') {
        const res = await api.get('/api/admin/audit-log');
        setAuditData(res);
      } else if (currentTab === 'admin_ai' || currentTab === 'ai') {
        const res = await api.get('/api/admin/ai');
        setAiData(res);
      } else if (currentTab === 'admin_support' || currentTab === 'support') {
        const res = await api.get('/api/admin/support');
        setSupportData(res);
      } else if (currentTab === 'admin_settings' || currentTab === 'settings') {
        const res = await api.get('/api/admin/settings');
        setSettingsData(res);
      }
    } catch (err: any) {
      console.error('Failed to load admin tab data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentTab, selectedTenant, selectedUser]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const loadTenantInspection = async (id: number) => {
    try {
      const res = await api.get(`/api/admin/tenants/${id}/inspection`);
      setTenantInspection(res);
    } catch {}
  };

  const loadUserSessions = async (userId: number) => {
    try {
      const res = await api.get<{ sessions: any[] }>(`/api/admin/users/${userId}/sessions`);
      setUserSessions(res?.sessions || []);
    } catch {
      setUserSessions([]);
    }
  };

  const handleRetryJob = async (jobKey: string) => {
    try {
      await api.post(`/api/admin/jobs/${jobKey}/retry`, {});
      showToast(`Retry triggered for job ${jobKey}`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Retry failed');
    }
  };

  const handleScaleWorkers = async (target: number) => {
    try {
      await api.post('/api/admin/jobs/scale-workers', { target_count: target });
      showToast(`Worker fleet scaled to ${target} workers`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Scaling failed');
    }
  };

  const handleRevokeStaleSessions = async () => {
    try {
      const res = await api.post<{ message?: string }>('/api/admin/sessions/revoke-stale', { days: 30 });
      showToast(res?.message || 'Stale sessions revoked');
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Revocation failed');
    }
  };

  const handleRevokeSession = async (token: string) => {
    try {
      await api.post(`/api/admin/sessions/${token}/revoke`, {});
      showToast('Session revoked successfully');
      if (selectedUser) {
        loadUserSessions(selectedUser.id);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke session');
    }
  };

  const handleRevokeAllUserSessions = async (userId: number) => {
    try {
      await api.post(`/api/admin/users/${userId}/sessions/revoke-all`, {});
      showToast('All sessions revoked for user');
      loadUserSessions(userId);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke all sessions');
    }
  };

  const handleRetryInvoice = async (invoiceId: number) => {
    try {
      await api.post(`/api/admin/billing/invoices/${invoiceId}/retry`, {});
      showToast(`Retry collection scheduled for invoice #${invoiceId}`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to retry invoice');
    }
  };

  const handleSendRelink = async (connectionId: number) => {
    try {
      await api.post(`/api/admin/integrations/${connectionId}/relink`, {});
      showToast('Relink notification dispatched to merchant owner');
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to send relink request');
    }
  };

  const handlePauseTenant = async (tenantId: number) => {
    try {
      await api.post(`/api/admin/tenants/${tenantId}/pause`, { reason: 'Admin console manual action' });
      showToast('Tenant has been paused');
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to pause tenant');
    }
  };

  const handleResumeTenant = async (tenantId: number) => {
    try {
      await api.post(`/api/admin/tenants/${tenantId}/resume`, {});
      showToast('Tenant access resumed');
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to resume tenant');
    }
  };

  const handlePostAnnouncement = async () => {
    if (!announcementTitle.trim()) {
      showToast('Please enter an announcement title');
      return;
    }
    try {
      await api.post('/api/admin/announcements', {
        title: announcementTitle,
        message: announcementMsg,
        audience: announcementAudience,
        send_whatsapp: announcementWhatsApp,
      });
      showToast('Announcement published successfully');
      setAnnouncementTitle('');
      setAnnouncementMsg('');
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to publish announcement');
    }
  };

  const handleToggleGuardrail = async (key: string, currentValue: boolean) => {
    try {
      await api.put('/api/admin/ai/guardrails', { key, enabled: !currentValue });
      showToast(`Guardrail updated: ${key}`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to update guardrail');
    }
  };

  const handleToggleFeatureFlag = async (key: string, pct: number) => {
    try {
      await api.put('/api/admin/settings/flags', { key, rollout_pct: pct });
      showToast(`Feature flag "${key}" set to ${pct}%`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to update feature flag');
    }
  };

  const handleToggleMaintenanceMode = async (active: boolean) => {
    try {
      await api.post('/api/admin/settings/maintenance', { active });
      showToast(`Maintenance mode ${active ? 'activated' : 'deactivated'}`);
      loadTab();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle maintenance mode');
    }
  };

  // Helper formatting
  const fmt = (val: number | undefined | null) => (val != null ? formatTaka(val) : '৳0');

  // Filtered Data
  const filteredTenants = useMemo(() => {
    const list: any[] = tenantsData?.tenants || [];
    return list.filter((t) => {
      if (tenantFilter !== 'all' && t.status !== tenantFilter) return false;
      if (tenantSearch.trim()) {
        const q = tenantSearch.toLowerCase();
        const matchesName = t.name?.toLowerCase().includes(q);
        const matchesOwner = t.owner_name?.toLowerCase().includes(q);
        const matchesPhone = t.owner_whatsapp?.includes(q);
        if (!matchesName && !matchesOwner && !matchesPhone) return false;
      }
      return true;
    });
  }, [tenantsData, tenantFilter, tenantSearch]);

  const filteredUsers = useMemo(() => {
    const list: any[] = usersData?.users || [];
    return list.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (userSearch.trim()) {
        const q = userSearch.toLowerCase();
        const matchesName = u.name?.toLowerCase().includes(q);
        const matchesEmail = u.email?.toLowerCase().includes(q);
        const matchesStore = u.merchant_name?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesStore) return false;
      }
      return true;
    });
  }, [usersData, userRoleFilter, userSearch]);

  const filteredAuditLogs = useMemo(() => {
    const list: any[] = auditData?.logs || [];
    if (auditAdminOnly) {
      return list.filter((l) => l.is_admin_action || l.actor?.toLowerCase().includes('admin'));
    }
    return list;
  }, [auditData, auditAdminOnly]);

  const filteredTickets = useMemo(() => {
    const list: any[] = supportData?.tickets || [];
    if (supportFilter === 'urgent') return list.filter((t) => t.priority === 'urgent' || t.priority === 'high');
    if (supportFilter === 'mine') return list.filter((t) => t.assigned_to === 'Tamim' || t.is_mine);
    return list;
  }, [supportData, supportFilter]);

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto pb-12 animate-in fade-in duration-150">
      {/* =========================================================================
          PAGE 1: OVERVIEW (Improvements/Nirvul360 Admin Panel.pdf Page 1)
      ========================================================================== */}
      {(currentTab === 'admin_overview' || currentTab === 'overview') && (
        <div className="flex flex-col gap-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Platform overview</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {overviewData?.total_tenants ?? 0} tenants · {overviewData?.active_sessions_count ?? 0} active users · telemetry updated live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-[#E5EBE5] rounded-xl p-1 text-xs font-semibold text-[#0B3828]">
                {(['month', 'quarter', 'year'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setTimeRange(r)}
                    className={`px-3 py-1 rounded-lg capitalize transition ${
                      timeRange === r ? 'bg-[#062E1F] text-white shadow-xs' : 'hover:text-[#062E1F]'
                    }`}
                  >
                    {r === 'month' ? 'This month' : r}
                  </button>
                ))}
              </div>
              <button
                onClick={loadTab}
                className="px-3 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition flex items-center gap-1.5"
              >
                <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
              <button
                onClick={() => onTabChange('admin_tenants')}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                Onboard tenant
              </button>
            </div>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Monthly recurring revenue</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {fmt(overviewData?.mrr_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#2D6A4F] font-medium">
                {overviewData?.mrr_growth_pct != null ? `+${overviewData.mrr_growth_pct}% MoM` : '+0.0% MoM'}
              </span>
            </div>

            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Active tenants</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {overviewData?.active_tenants ?? 0}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {overviewData?.trial_tenants ?? 0} on trial · {overviewData?.paused_tenants ?? 0} paused · {overviewData?.total_tenants ?? 0} total
              </span>
            </div>

            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Platform GMV (delivered)</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {fmt(overviewData?.delivered_gmv_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {(overviewData?.orders_tracked_count || 0).toLocaleString()} orders tracked
              </span>
            </div>

            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">System health</span>
              <span className={`text-2xl font-black ${overviewData?.alert ? 'text-[#B91C1C]' : 'text-[#166534]'}`}>
                {overviewData?.system_health || 'Healthy'}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {overviewData?.healthy_jobs_count ?? 0} of {overviewData?.total_jobs_count ?? 0} jobs healthy
              </span>
            </div>
          </div>

          {/* Failing Job Alert Banner if present */}
          {overviewData?.alert && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-start gap-3 text-xs">
                <span className="w-6 h-6 rounded-lg bg-[#EF4444] text-white flex items-center justify-center font-bold text-sm shrink-0">!</span>
                <div className="flex flex-col">
                  <span className="font-bold text-[#991B1B] text-sm">
                    {overviewData.alert.job_key} is failing
                  </span>
                  <span className="text-[#B91C1C] text-[11px]">
                    Failed {overviewData.alert.consecutive_failures} times — {overviewData.alert.error_message}. {overviewData.alert.impact_description}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => onTabChange('admin_jobs')}
                  className="px-3 py-1.5 rounded-xl border border-[#FCA5A5] bg-white hover:bg-[#FEE2E2] text-xs font-semibold text-[#991B1B] transition"
                >
                  View in Job monitor
                </button>
                <button
                  onClick={() => handleRetryJob(overviewData.alert.job_key)}
                  className="px-4 py-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition shadow-xs"
                >
                  Retry now
                </button>
              </div>
            </div>
          )}

          {/* 2-Column Section: Growth & Top Tenants (Left 2/3) vs Telemetry & Activity (Right 1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 flex flex-col gap-6">
              {/* Top 5 Tenants by Delivered GMV Table */}
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-[#E0E7E2] pb-2">
                  <h3 className="text-sm font-bold text-[#0B3828]">Top tenants by delivered GMV</h3>
                  <button
                    onClick={() => onTabChange('admin_tenants')}
                    className="text-xs font-semibold text-[#0B3828] hover:underline"
                  >
                    View all {overviewData?.total_tenants ?? 0} tenants →
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                        <th className="py-2">Tenant</th>
                        <th className="py-2">Plan</th>
                        <th className="py-2">Delivered GMV</th>
                        <th className="py-2">Orders</th>
                        <th className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E0E7E2]">
                      {overviewData?.top_tenants?.length ? (
                        overviewData.top_tenants.map((t: any) => (
                          <tr key={t.id} className="hover:bg-[#F8FAF8] transition">
                            <td className="py-2.5 font-bold text-[#0B3828]">{t.name}</td>
                            <td className="py-2.5 text-[#52796F]">{t.plan}</td>
                            <td className="py-2.5 font-semibold text-[#0B3828]">
                              {fmt(t.delivered_gmv_taka ?? 0)}
                            </td>
                            <td className="py-2.5 text-[#52796F]">{t.orders_count || 0}</td>
                            <td className="py-2.5 text-right">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  t.status === 'paused' ? 'bg-[#FEE2E2] text-[#991B1B]' : 'bg-[#DCFCE7] text-[#166534]'
                                }`}
                              >
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-xs text-[#52796F]">
                            No tenant orders recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column: Telemetry & Activity */}
            <div className="flex flex-col gap-6">
              {/* System Health Telemetry */}
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <h3 className="text-sm font-bold text-[#0B3828]">System telemetry</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">API — p95 latency</span>
                    <span className="font-bold text-[#0B3828]">{overviewData?.system_telemetry?.p95_latency_ms ?? 0} ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Database connections</span>
                    <span className="font-bold text-[#0B3828]">
                      {overviewData?.system_telemetry?.db_connections_used ?? 0} / {overviewData?.system_telemetry?.db_connections_max ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Queue depth</span>
                    <span className="font-bold text-[#0B3828]">
                      {(overviewData?.system_telemetry?.queue_depth ?? 0).toLocaleString()} waiting
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Workers online</span>
                    <span className="font-bold text-[#0B3828]">
                      {overviewData?.system_telemetry?.workers_online ?? 0} / {overviewData?.system_telemetry?.workers_total ?? 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Error rate, 24h</span>
                    <span className="font-bold text-[#0B3828]">{overviewData?.system_telemetry?.error_rate_24h_pct ?? 0}%</span>
                  </div>
                </div>
              </div>

              {/* Plan Mix */}
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <h3 className="text-sm font-bold text-[#0B3828]">Plan mix</h3>
                <div className="flex flex-col gap-2">
                  {overviewData?.plan_mix?.length ? (
                    overviewData.plan_mix.map((p: any) => (
                      <div key={p.plan} className="flex items-center justify-between">
                        <span className="text-[#52796F] flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[#062E1F]" /> {p.plan}
                        </span>
                        <span className="font-bold text-[#0B3828]">
                          {p.count} <span className="font-normal text-[10px] text-[#52796F]">({p.percentage}%)</span>
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#52796F]">No tenant plan data available.</div>
                  )}
                </div>
              </div>

              {/* Live Activity Feed */}
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <div className="flex items-center justify-between border-b border-[#E0E7E2] pb-2">
                  <h3 className="text-sm font-bold text-[#0B3828]">Live activity</h3>
                  <button
                    onClick={() => onTabChange('admin_audit')}
                    className="text-xs font-semibold text-[#0B3828] hover:underline"
                  >
                    Audit log →
                  </button>
                </div>
                <div className="flex flex-col gap-3">
                  {overviewData?.activity?.length ? (
                    overviewData.activity.slice(0, 5).map((a: any) => (
                      <div key={a.id} className="flex flex-col gap-0.5">
                        <div className="flex items-center justify-between font-semibold text-[#0B3828]">
                          <span>{a.action}</span>
                          <span className="text-[10px] text-[#52796F]">{a.at ? a.at.slice(11, 16) : ''}</span>
                        </div>
                        <span className="text-[11px] text-[#52796F]">
                          {a.merchant_name || 'System'} · {a.actor}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#52796F]">No recent activity entries recorded.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 2: TENANTS (Improvements/Nirvul360 Admin Panel.pdf Page 2)
      ========================================================================== */}
      {(currentTab === 'admin_tenants' || currentTab === 'tenants') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Tenants</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {tenantsData?.stats?.total_tenants ?? tenantsData?.tenants?.length ?? 0} merchant organisations · synced live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('Exporting tenants list to CSV...')}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Export CSV
              </button>
              <button
                onClick={() => onInspectTenant(1, 'New Store')}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                Onboard tenant
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E0E7E2] rounded-2xl p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {(['all', 'active', 'trial', 'paused'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setTenantFilter(f)}
                  className={`px-3 py-1 rounded-xl capitalize transition ${
                    tenantFilter === f ? 'bg-[#062E1F] text-white shadow-xs' : 'text-[#52796F] hover:bg-[#E5EBE5]'
                  }`}
                >
                  {f === 'all'
                    ? `All ${tenantsData?.stats?.total_tenants ?? tenantsData?.tenants?.length ?? 0}`
                    : f === 'active'
                    ? `Active ${tenantsData?.stats?.active_tenants ?? 0}`
                    : f === 'trial'
                    ? `Trial ${tenantsData?.stats?.trial_tenants ?? 0}`
                    : `Paused ${tenantsData?.stats?.paused_tenants ?? 0}`}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search name, owner, phone..."
                value={tenantSearch}
                onChange={(e) => setTenantSearch(e.target.value)}
                className="px-3 py-1.5 bg-[#F8FAF8] border border-[#D0DDD5] rounded-xl text-xs text-[#0B3828] focus:outline-none focus:border-[#0B3828] w-48 sm:w-60"
              />
            </div>
          </div>

          {/* Split View: Table on Left (2/3), Selected Tenant Drawer on Right (1/3) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E0E7E2] rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5">Tenant &amp; Owner</th>
                      <th className="py-2.5">Plan</th>
                      <th className="py-2.5">Users</th>
                      <th className="py-2.5">GMV</th>
                      <th className="py-2.5">Orders</th>
                      <th className="py-2.5 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E7E2]">
                    {filteredTenants.length ? (
                      filteredTenants.map((t: any) => (
                        <tr
                          key={t.id}
                          onClick={() => {
                            setSelectedTenant(t);
                            loadTenantInspection(t.id);
                          }}
                          className={`cursor-pointer transition ${
                            selectedTenant?.id === t.id ? 'bg-[#E5EBE5]' : 'hover:bg-[#F8FAF8]'
                          }`}
                        >
                          <td className="py-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-[#0B3828]">{t.name}</span>
                              <span className="text-[11px] text-[#52796F]">
                                {t.owner_name || 'No owner'} · {t.owner_whatsapp || t.owner_email || '—'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full bg-[#E5EBE5] text-[10px] font-bold text-[#0B3828] capitalize">
                              {t.plan || 'Starter'}
                            </span>
                          </td>
                          <td className="py-3 font-semibold text-[#0B3828]">{t.user_count || 1}</td>
                          <td className="py-3 font-semibold text-[#0B3828]">
                            {fmt(t.delivered_gmv_taka ?? 0)}
                          </td>
                          <td className="py-3 text-[#52796F]">{t.orders_count || 0}</td>
                          <td className="py-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.status === 'paused'
                                  ? 'bg-[#FEE2E2] text-[#991B1B]'
                                  : t.status === 'trial'
                                  ? 'bg-[#FEF3C7] text-[#92400E]'
                                  : 'bg-[#DCFCE7] text-[#166534]'
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-xs text-[#52796F]">
                          No tenants match your current filter.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Selected Tenant Drawer (Right 1/3) */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-5 text-xs">
              {selectedTenant ? (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="border-b border-[#E0E7E2] pb-3">
                      <span className="text-[10px] font-bold text-[#52796F] uppercase tracking-wider block">
                        SELECTED TENANT
                      </span>
                      <h2 className="text-lg font-black text-[#0B3828] mt-0.5">{selectedTenant.name}</h2>
                      <span className="text-xs text-[#52796F]">
                        Tenant #{selectedTenant.id} · {selectedTenant.plan || 'Starter plan'} · {selectedTenant.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#52796F] font-semibold">Delivered GMV</span>
                        <span className="text-sm font-black text-[#0B3828]">
                          {fmt(tenantInspection?.metrics?.delivered_gmv_taka ?? selectedTenant?.delivered_gmv_taka ?? 0)}
                        </span>
                      </div>
                      <div className="bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#52796F] font-semibold">Return rate</span>
                        <span className="text-sm font-black text-[#0B3828]">
                          {tenantInspection?.metrics?.return_rate_pct ?? selectedTenant?.return_rate_pct ?? 0}%
                        </span>
                      </div>
                      <div className="bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#52796F] font-semibold">Unresolved</span>
                        <span className="text-sm font-black text-[#991B1B]">
                          {fmt(tenantInspection?.metrics?.unresolved_taka ?? 0)}
                        </span>
                      </div>
                      <div className="bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl p-3 flex flex-col gap-0.5">
                        <span className="text-[10px] text-[#52796F] font-semibold">AI tokens used</span>
                        <span className="text-sm font-black text-[#0B3828]">
                          {tenantInspection?.metrics?.ai_tokens_used_pct ?? 0}%
                        </span>
                      </div>
                    </div>

                    {/* Limits on this plan */}
                    <div className="flex flex-col gap-2 pt-1 border-t border-[#E0E7E2]">
                      <span className="text-[11px] font-bold text-[#0B3828]">Plan usage</span>
                      <div className="flex flex-col gap-1 text-[11px]">
                        <div className="flex items-center justify-between text-[#52796F]">
                          <span>Orders this month</span>
                          <span className="font-semibold text-[#0B3828]">
                            {tenantInspection?.limits?.orders_this_month ?? 0} / {tenantInspection?.limits?.order_limit ?? '—'}
                          </span>
                        </div>
                        <div className="w-full bg-[#E0E7E2] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#0B3828] h-full"
                            style={{
                              width: `${Math.min(
                                100,
                                ((tenantInspection?.limits?.orders_this_month ?? 0) / Math.max(1, tenantInspection?.limits?.order_limit || 1)) * 100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex flex-col gap-2 pt-3 border-t border-[#E0E7E2]">
                    <button
                      onClick={() => onInspectTenant(selectedTenant.id, selectedTenant.name)}
                      className="w-full py-2.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <span>View dashboard as owner</span>
                      <span>↗</span>
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedTenant.status === 'paused' ? (
                        <button
                          onClick={() => handleResumeTenant(selectedTenant.id)}
                          className="py-2 rounded-xl border border-[#22C55E] bg-[#DCFCE7] hover:bg-[#BBF7D0] text-xs font-bold text-[#166534] transition"
                        >
                          Resume access
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePauseTenant(selectedTenant.id)}
                          className="py-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-xs font-bold text-[#991B1B] transition"
                        >
                          Pause tenant
                        </button>
                      )}
                      <button
                        onClick={() => showToast(`Tenant #${selectedTenant.id} plan settings opened`)}
                        className="py-2 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
                      >
                        Change plan
                      </button>
                    </div>
                    <span className="text-[10px] text-[#52796F] text-center">
                      Viewing as owner is recorded in the platform audit log
                    </span>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center text-[#52796F]">Select a tenant from the left table</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 3: USERS & SESSIONS (Improvements/Nirvul360 Admin Panel.pdf Page 3)
      ========================================================================== */}
      {(currentTab === 'admin_users' || currentTab === 'users') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Users &amp; sessions</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {usersData?.summary?.total_users ?? usersData?.users?.length ?? 0} registered accounts across {usersData?.summary?.total_merchants ?? 0} stores
              </p>
            </div>
            <button
              onClick={handleRevokeStaleSessions}
              className="px-4 py-1.5 rounded-xl border border-[#FCA5A5] bg-white hover:bg-[#FEE2E2] text-xs font-bold text-[#991B1B] transition shadow-xs"
            >
              Revoke all stale sessions
            </button>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Registered accounts</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {usersData?.summary?.total_users ?? 0}
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Active right now</span>
              <span className="text-2xl font-black text-[#166534]">
                {usersData?.summary?.active_users ?? 0}
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Active rate</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {usersData?.summary?.active_percentage ?? 0}%
              </span>
              <span className="text-[11px] text-[#52796F]">{usersData?.summary?.inactive_users ?? 0} inactive accounts</span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Role distribution</span>
              <span className="text-xs font-semibold text-[#0B3828] mt-1 leading-relaxed">
                {usersData?.summary?.roles?.super_admin ?? 0} super · {usersData?.summary?.roles?.agency_owner ?? 0} owner · {usersData?.summary?.roles?.manager ?? 0} manager · {usersData?.summary?.roles?.accountant ?? 0} acct.
              </span>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-[#E0E7E2] rounded-2xl p-3 shadow-2xs">
            <div className="flex items-center gap-1.5 text-xs font-semibold">
              {['all', 'super_admin', 'agency_owner', 'manager', 'accountant'].map((r) => (
                <button
                  key={r}
                  onClick={() => setUserRoleFilter(r)}
                  className={`px-3 py-1 rounded-xl capitalize transition ${
                    userRoleFilter === r ? 'bg-[#062E1F] text-white shadow-xs' : 'text-[#52796F] hover:bg-[#E5EBE5]'
                  }`}
                >
                  {r === 'all' ? 'All Roles' : r.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Search user name, email, store..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="px-3 py-1.5 bg-[#F8FAF8] border border-[#D0DDD5] rounded-xl text-xs text-[#0B3828] focus:outline-none focus:border-[#0B3828] w-48 sm:w-60"
              />
            </div>
          </div>

          {/* Users Table & Session Details */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E0E7E2] rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2.5">User</th>
                      <th className="py-2.5">Role</th>
                      <th className="py-2.5">Tenant</th>
                      <th className="py-2.5">Sessions</th>
                      <th className="py-2.5 text-right">Last Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E7E2]">
                    {filteredUsers.length ? (
                      filteredUsers.map((u: any) => (
                        <tr
                          key={u.id}
                          onClick={() => {
                            setSelectedUser(u);
                            loadUserSessions(u.id);
                          }}
                          className={`cursor-pointer transition ${
                            selectedUser?.id === u.id ? 'bg-[#E5EBE5]' : 'hover:bg-[#F8FAF8]'
                          }`}
                        >
                          <td className="py-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-[#0B3828]">{u.name}</span>
                              <span className="text-[11px] text-[#52796F]">{u.email}</span>
                            </div>
                          </td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded-full bg-[#E5EBE5] text-[10px] font-bold text-[#0B3828] capitalize">
                              {u.role_label || u.role}
                            </span>
                          </td>
                          <td className="py-3 text-[#52796F]">{u.merchant_name}</td>
                          <td className="py-3 font-semibold text-[#0B3828]">{u.active_sessions_count || 0}</td>
                          <td className="py-3 text-right text-[#52796F]">
                            {u.last_active ? 'Recently' : 'Never'}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-[#52796F]">
                          No users found matching current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* User Sessions Drawer */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-5 text-xs">
              {selectedUser ? (
                <>
                  <div className="flex flex-col gap-4">
                    <div className="border-b border-[#E0E7E2] pb-3">
                      <span className="text-[10px] font-bold text-[#52796F] uppercase tracking-wider block">
                        OPEN SESSIONS
                      </span>
                      <h2 className="text-lg font-black text-[#0B3828] mt-0.5">{selectedUser.name}</h2>
                      <span className="text-xs text-[#52796F]">
                        {selectedUser.role_label} · {selectedUser.merchant_name} · {userSessions.length} active sessions
                      </span>
                    </div>

                    <div className="flex flex-col gap-3">
                      {userSessions.length ? (
                        userSessions.map((sess: any) => (
                          <div
                            key={sess.token || sess.id}
                            className="p-3 bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl flex items-center justify-between"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-[#0B3828]">
                                {sess.user_agent || sess.device || 'Web Session'}
                              </span>
                              <span className="text-[10px] text-[#52796F]">
                                {sess.ip_address || '127.0.0.1'} · {sess.created_at ? sess.created_at.slice(0, 10) : 'Active'}
                              </span>
                            </div>
                            {sess.is_current ? (
                              <span className="text-[10px] font-bold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                                Current
                              </span>
                            ) : (
                              <button
                                onClick={() => handleRevokeSession(sess.token)}
                                className="text-[11px] font-bold text-[#991B1B] hover:underline"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="py-6 text-center text-xs text-[#52796F]">
                          No active sessions found for this user.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-3 border-t border-[#E0E7E2]">
                    <button
                      onClick={() => handleRevokeAllUserSessions(selectedUser.id)}
                      className="w-full py-2.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition shadow-xs"
                    >
                      Revoke all {userSessions.length} sessions
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => showToast(`User #${selectedUser.id} role edit requested`)}
                        className="py-2 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
                      >
                        Change role
                      </button>
                      <button
                        onClick={() => showToast(`Password reset link sent to ${selectedUser.email}`)}
                        className="py-2 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
                      >
                        Reset password
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-20 text-center text-[#52796F]">Select a user from the left table</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 4: EXCEPTION OVERVIEW (Improvements/Nirvul360 Admin Panel.pdf Page 4)
      ========================================================================== */}
      {(currentTab === 'admin_exceptions' || currentTab === 'exceptions') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Exception overview</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                Money the platform cannot account for yet, across every tenant · checked on continuous scan
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('Exporting exceptions summary to CSV...')}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Export CSV
              </button>
              <button
                onClick={loadTab}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                Run scan now
              </button>
            </div>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Unresolved value</span>
              <span className="text-2xl font-black text-[#991B1B]">
                {fmt(exceptionsData?.unresolved_value_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {exceptionsData?.total_open_items ?? 0} items · none of it in any P&amp;L
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Tenants affected</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {exceptionsData?.tenants_affected_count ?? 0}
              </span>
              <span className="text-[11px] text-[#52796F]">
                of {exceptionsData?.tenants_total_count ?? 0} total tenants
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Oldest open item</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {exceptionsData?.oldest_open_days ?? 0} days
              </span>
              <span className="text-[11px] text-[#52796F]">
                {exceptionsData?.oldest_open_type ? exceptionsData.oldest_open_type.replace('_', ' ') : 'None'}
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Cleared this month</span>
              <span className="text-2xl font-black text-[#166534]">
                {fmt(exceptionsData?.cleared_this_month_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {exceptionsData?.cleared_items_count ?? 0} items resolved by merchants
              </span>
            </div>
          </div>

          {/* 2-Column Split: By Exception Type & Tenants Needing Help */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* By Exception Type */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="border-b border-[#E0E7E2] pb-2">
                <h3 className="text-sm font-bold text-[#0B3828]">By exception category</h3>
              </div>
              <div className="flex flex-col gap-3">
                {exceptionsData?.by_type?.length ? (
                  exceptionsData.by_type.map((t: any) => (
                    <div key={t.type} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#0B3828]">{t.label || t.type}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#991B1B]">{fmt(t.total_value_taka ?? 0)}</span>
                          <span className="text-[11px] text-[#52796F]">({t.item_count} items)</span>
                        </div>
                      </div>
                      <div className="w-full bg-[#E0E7E2] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-[#991B1B] h-full"
                          style={{ width: `${Math.min(100, t.percentage_of_total || 0)}%` }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-[#52796F]">
                    No open exception categories detected.
                  </div>
                )}
              </div>
            </div>

            {/* Tenants Needing Help Table */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
              <div className="border-b border-[#E0E7E2] pb-2">
                <h3 className="text-sm font-bold text-[#0B3828]">Tenants with highest unresolved value</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2">Tenant</th>
                      <th className="py-2">Unresolved</th>
                      <th className="py-2">Open Items</th>
                      <th className="py-2">Oldest</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E7E2]">
                    {exceptionsData?.tenants_needing_help?.length ? (
                      exceptionsData.tenants_needing_help.map((row: any) => (
                        <tr key={row.merchant_id} className="hover:bg-[#F8FAF8] transition">
                          <td className="py-2.5 font-bold text-[#0B3828]">{row.merchant_name}</td>
                          <td className="py-2.5 font-black text-[#991B1B]">{fmt(row.unresolved_taka ?? 0)}</td>
                          <td className="py-2.5 text-[#52796F]">{row.open_items_count}</td>
                          <td className="py-2.5 text-[#52796F]">{row.oldest_item_days} days</td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => onInspectTenant(row.merchant_id, row.merchant_name)}
                              className="px-2.5 py-1 rounded-lg border border-[#D0DDD5] hover:bg-[#E5EBE5] text-[11px] font-bold text-[#0B3828]"
                            >
                              Inspect ↗
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-[#52796F]">
                          All tenants are reconciled! No open disputes or stuck parcels.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 5: BILLING & PLANS (Improvements/Nirvul360 Admin Panel.pdf Page 5)
      ========================================================================== */}
      {(currentTab === 'admin_billing' || currentTab === 'billing') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Billing &amp; plans</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                Subscriptions, invoices and failed collections · synced live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('Invoices exported to CSV')}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Export invoices
              </button>
              <button
                onClick={() => showToast('Plan creator drawer ready')}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                New plan
              </button>
            </div>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">MRR</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {fmt(billingData?.mrr_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                ARR {fmt(billingData?.arr_taka ?? 0)} · +{billingData?.mrr_growth_pct ?? 0}% MoM
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Collected this month</span>
              <span className="text-2xl font-black text-[#166534]">
                {fmt(billingData?.collected_month_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {billingData?.paid_invoices_count ?? 0} of {billingData?.total_invoices_count ?? 0} invoices paid
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Failed collections</span>
              <span className="text-2xl font-black text-[#991B1B]">
                {fmt(billingData?.failed_collections_taka ?? 0)}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {billingData?.delinquent_tenants_count ?? 0} delinquent · {billingData?.pause_imminent_count ?? 0} pause imminent
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Churn rate (30d)</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {billingData?.churn_rate_pct ?? 0}%
              </span>
              <span className="text-[11px] text-[#52796F]">
                {billingData?.churn_left_count ?? 0} left · {billingData?.churn_joined_count ?? 0} joined
              </span>
            </div>
          </div>

          {/* SaaS Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {billingData?.plans?.length ? (
              billingData.plans.map((p: any) => (
                <div
                  key={p.id}
                  className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#0B3828] capitalize">{p.name}</span>
                      <span className="text-[11px] font-semibold text-[#52796F]">
                        {p.active_tenants_count || 0} tenants
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-[#0B3828]">
                        {fmt(p.price_taka ?? 0)}
                      </span>
                      <span className="text-xs text-[#52796F]">/ month</span>
                    </div>
                    <ul className="text-xs text-[#52796F] space-y-1 mt-2">
                      <li>• Up to {p.order_limit?.toLocaleString()} orders / month</li>
                      <li>• Up to {p.courier_limit} couriers, {p.user_limit} users</li>
                      <li>• WhatsApp assistant: {p.has_whatsapp ? 'Enabled' : 'Not included'}</li>
                      <li>• Meta ads sync: {p.has_meta_sync ? 'Included' : 'Not included'}</li>
                    </ul>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E0E7E2]">
                    <button
                      onClick={() => showToast(`Edit plan ${p.name}`)}
                      className="py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => showToast(`Features for ${p.name}`)}
                      className="py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828]"
                    >
                      Features
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 py-6 text-center text-xs text-[#52796F]">
                No SaaS plan tiers configured.
              </div>
            )}
          </div>

          {/* Failed Collections Table */}
          <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="border-b border-[#E0E7E2] pb-2">
              <h3 className="text-sm font-bold text-[#0B3828]">
                Failed collections ({billingData?.failed_collections?.length || 0} invoices)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2">Tenant</th>
                    <th className="py-2">Plan</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Payment Method</th>
                    <th className="py-2">Attempts</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E7E2]">
                  {billingData?.failed_collections?.length ? (
                    billingData.failed_collections.map((f: any) => (
                      <tr key={f.invoice_id} className="hover:bg-[#F8FAF8] transition">
                        <td className="py-2.5 font-bold text-[#0B3828]">{f.merchant_name}</td>
                        <td className="py-2.5 text-[#52796F]">{f.plan}</td>
                        <td className="py-2.5 font-black text-[#991B1B]">{fmt(f.amount_taka ?? 0)}</td>
                        <td className="py-2.5 text-[#52796F] capitalize">{f.payment_method}</td>
                        <td className="py-2.5 text-[#52796F]">
                          {f.attempt_count} / {f.max_attempts}
                        </td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handleRetryInvoice(f.invoice_id)}
                            className="px-2.5 py-1 rounded-lg bg-[#062E1F] text-white hover:bg-[#0B3828] text-[11px] font-bold"
                          >
                            Retry charge
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-[#52796F]">
                        Zero delinquent invoices. All collections are current.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 6: JOB & QUEUE MONITOR (Improvements/Nirvul360 Admin Panel.pdf Page 6)
      ========================================================================== */}
      {(currentTab === 'admin_jobs' || currentTab === 'jobs') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Job &amp; queue monitor</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {jobsData?.total_jobs ?? 0} scheduled jobs · {jobsData?.workers?.length ?? 0} worker processes · live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast(`Dead-letter queue inspection (${jobsData?.dead_letter_count ?? 0} items)`)}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Dead-letter queue ({jobsData?.dead_letter_count ?? 0})
              </button>
              <button
                onClick={() => handleScaleWorkers((jobsData?.workers?.length || 4) + 2)}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                Scale workers (+2)
              </button>
            </div>
          </div>

          {/* Failing Job Banner if exists */}
          {jobsData?.alert && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 flex flex-col gap-3 shadow-xs">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 text-xs">
                  <span className="w-6 h-6 rounded-lg bg-[#EF4444] text-white flex items-center justify-center font-bold text-sm shrink-0">!</span>
                  <div className="flex flex-col">
                    <span className="font-bold text-[#991B1B] text-sm">
                      {jobsData.alert.job_key} is failing
                    </span>
                    <span className="text-[#B91C1C] text-[11px]">
                      {jobsData.alert.consecutive_failures} consecutive failures · {jobsData.alert.error_message}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRetryJob(jobsData.alert.job_key)}
                    className="px-3.5 py-1.5 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs font-bold transition shadow-xs"
                  >
                    Retry now
                  </button>
                </div>
              </div>
              {jobsData.alert.error_stack && (
                <pre className="bg-[#450A0A] text-[#FCA5A5] p-3 rounded-xl text-[10px] font-mono overflow-x-auto leading-relaxed">
                  {jobsData.alert.error_stack}
                </pre>
              )}
            </div>
          )}

          {/* Scheduled Jobs Table & Queues / Workers */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
              <div className="border-b border-[#E0E7E2] pb-2">
                <h3 className="text-sm font-bold text-[#0B3828]">
                  Scheduled jobs ({jobsData?.healthy_count ?? 0} healthy · {jobsData?.failing_count ?? 0} failing)
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2">Job</th>
                      <th className="py-2">Frequency</th>
                      <th className="py-2">Last Run</th>
                      <th className="py-2">Took</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E7E2]">
                    {jobsData?.jobs?.length ? (
                      jobsData.jobs.map((j: any) => (
                        <tr key={j.job_key} className="hover:bg-[#F8FAF8] transition">
                          <td className="py-2.5 font-bold font-mono text-[#0B3828]">{j.name || j.job_key}</td>
                          <td className="py-2.5 text-[#52796F]">{j.frequency}</td>
                          <td className="py-2.5 text-[#52796F]">{j.last_run_at ? j.last_run_at.slice(11, 16) : 'Never'}</td>
                          <td className="py-2.5 text-[#52796F]">{j.duration_ms} ms</td>
                          <td className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                j.status === 'ok'
                                  ? 'bg-[#DCFCE7] text-[#166534]'
                                  : 'bg-[#FEE2E2] text-[#991B1B]'
                              }`}
                            >
                              {j.status}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => handleRetryJob(j.job_key)}
                              className="px-2 py-0.5 rounded-lg border border-[#D0DDD5] hover:bg-[#E5EBE5] text-[10px] font-semibold text-[#0B3828]"
                            >
                              Run
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-xs text-[#52796F]">
                          No background scheduled jobs registered.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Queues & Workers Side Panel */}
            <div className="flex flex-col gap-6">
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <h3 className="text-sm font-bold text-[#0B3828]">Queue depths</h3>
                <div className="flex flex-col gap-2">
                  {jobsData?.queues?.length ? (
                    jobsData.queues.map((q: any) => (
                      <div key={q.name} className="flex items-center justify-between">
                        <span className="text-[#52796F] font-mono">{q.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0B3828]">{q.depth} waiting</span>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              q.depth > 100 ? 'bg-[#EF4444]' : 'bg-[#22C55E]'
                            }`}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#52796F]">Queues are clear.</div>
                  )}
                </div>
              </div>

              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <h3 className="text-sm font-bold text-[#0B3828]">Worker fleet</h3>
                <div className="flex flex-col gap-2">
                  {jobsData?.workers?.length ? (
                    jobsData.workers.map((w: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-[#52796F] font-mono">{w.worker_id || `worker-${idx + 1}`}</span>
                        <span className="font-bold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded-full text-[10px]">
                          {w.status || 'Active'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-[#52796F]">No workers reported in fleet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 7: INTEGRATION HEALTH (Improvements/Nirvul360 Admin Panel.pdf Page 7)
      ========================================================================== */}
      {(currentTab === 'admin_integrations' || currentTab === 'integrations') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Integration health</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {integrationsData?.total_connections ?? 0} live connections across {integrationsData?.total_tenants ?? 0} tenants
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('Notifying merchants with degraded connections...')}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Notify affected owners
              </button>
              <button
                onClick={loadTab}
                className="px-4 py-1.5 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
              >
                Force resync all
              </button>
            </div>
          </div>

          {/* Connectors Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {['courier', 'store', 'meta_ads', 'whatsapp', 'bkash'].map((ctype) => {
              const info = integrationsData?.connectors?.[ctype] || {};
              const label =
                ctype === 'courier'
                  ? 'Couriers'
                  : ctype === 'store'
                  ? 'Store Webhooks'
                  : ctype === 'meta_ads'
                  ? 'Meta Ads'
                  : ctype === 'whatsapp'
                  ? 'WhatsApp'
                  : 'bKash & Nagad';
              return (
                <div key={ctype} className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
                  <span className="text-[11px] font-semibold text-[#52796F]">{label}</span>
                  <span className="text-xl font-black text-[#0B3828]">
                    {info.active_count || 0} / {info.total_count || integrationsData?.total_tenants || 0}
                  </span>
                  <span className="text-[10px] text-[#52796F]">
                    {info.failing_count ? `${info.failing_count} failing` : `Uptime ${info.uptime_pct || 100}%`}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Failing Connections Table */}
          <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
            <div className="border-b border-[#E0E7E2] pb-2">
              <h3 className="text-sm font-bold text-[#0B3828]">
                Failing connections ({integrationsData?.failing_connections?.length || 0} connections)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2">Tenant</th>
                    <th className="py-2">Connector</th>
                    <th className="py-2">Last Success</th>
                    <th className="py-2">Reason</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E7E2]">
                  {integrationsData?.failing_connections?.length ? (
                    integrationsData.failing_connections.map((row: any) => (
                      <tr key={row.id} className="hover:bg-[#F8FAF8] transition">
                        <td className="py-2.5 font-bold text-[#0B3828]">{row.merchant_name}</td>
                        <td className="py-2.5 text-[#52796F]">{row.provider} · {row.connector_type}</td>
                        <td className="py-2.5 text-[#52796F]">{row.last_success_at ? row.last_success_at.slice(0, 10) : 'Never'}</td>
                        <td className="py-2.5 font-semibold text-[#991B1B]">{row.failure_reason}</td>
                        <td className="py-2.5 text-right">
                          <button
                            onClick={() => handleSendRelink(row.id)}
                            className="px-2.5 py-1 rounded-lg border border-[#D0DDD5] hover:bg-[#E5EBE5] text-[11px] font-bold text-[#0B3828] transition"
                          >
                            Send relink
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-[#52796F]">
                        Zero failing connector links! All third-party bridges are operational.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 8: AUDIT LOG (Improvements/Nirvul360 Admin Panel.pdf Page 8)
      ========================================================================== */}
      {(currentTab === 'admin_audit' || currentTab === 'audit') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Audit log</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {auditData?.total_count ?? filteredAuditLogs.length} entries · every financial write and admin session, kept for 7 years
              </p>
            </div>
            <button
              onClick={() => showToast('Exporting complete audit log to CSV...')}
              className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
            >
              Export CSV
            </button>
          </div>

          <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E0E7E2] pb-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAuditAdminOnly(!auditAdminOnly)}
                  className={`px-3 py-1 rounded-lg border text-xs font-semibold transition ${
                    auditAdminOnly ? 'bg-[#062E1F] text-white border-[#062E1F]' : 'border-[#D0DDD5] text-[#52796F]'
                  }`}
                >
                  Admin actions only
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2 font-sans">Timestamp</th>
                    <th className="py-2 font-sans">Actor</th>
                    <th className="py-2 font-sans">Tenant</th>
                    <th className="py-2 font-sans">Action</th>
                    <th className="py-2 font-sans">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E7E2]">
                  {filteredAuditLogs.length ? (
                    filteredAuditLogs.map((row: any) => (
                      <tr key={row.id} className="hover:bg-[#F8FAF8] transition">
                        <td className="py-2.5 text-[#52796F]">{row.at ? row.at.replace('T', ' ').slice(0, 19) : ''}</td>
                        <td className="py-2.5 font-bold font-sans text-[#0B3828]">{row.actor}</td>
                        <td className="py-2.5 font-sans text-[#52796F]">{row.merchant_name || 'Global'}</td>
                        <td className="py-2.5 font-bold text-[#0B3828]">{row.action}</td>
                        <td className="py-2.5 font-sans text-[#52796F]">{row.details || row.after || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-[#52796F] font-sans">
                        No audit log entries found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 9: AI CONTROL (Improvements/Nirvul360 Admin Panel.pdf Page 9)
      ========================================================================== */}
      {(currentTab === 'admin_ai' || currentTab === 'ai') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">AI control</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                Prompts, training corrections, model routing and token budgets · telemetry live
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => showToast('AI Sandbox testing panel opened')}
                className="px-3.5 py-1.5 rounded-xl border border-[#D0DDD5] hover:bg-[#E5EBE5] text-xs font-semibold text-[#0B3828] transition"
              >
                Test in sandbox
              </button>
            </div>
          </div>

          {/* Top 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Confirmation rate</span>
              <span className="text-2xl font-black text-[#166534]">
                {aiData?.confirmation_rate_pct ?? 0}%
              </span>
              <span className="text-[11px] text-[#52796F]">Merchants confirmed without editing</span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Drafts this month</span>
              <span className="text-2xl font-black text-[#0B3828]">
                {aiData?.drafts_this_month ?? 0}
              </span>
              <span className="text-[11px] text-[#52796F]">
                {aiData?.active_tenants_using_ai ?? 0} tenants using assistant
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Token spend</span>
              <span className="text-2xl font-black text-[#0B3828]">
                ${aiData?.token_spend_usd != null ? Number(aiData.token_spend_usd).toFixed(2) : '0.00'}
              </span>
              <span className="text-[11px] text-[#52796F]">
                ৳{aiData?.token_cost_bdt_per_draft ?? 0} avg per draft
              </span>
            </div>
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-4 flex flex-col gap-1 shadow-2xs">
              <span className="text-[11px] font-semibold text-[#52796F]">Training corrections</span>
              <span className="text-2xl font-black text-[#D97706]">
                {aiData?.waiting_corrections_count ?? 0}
              </span>
              <span className="text-[11px] text-[#52796F]">Pending few-shot additions</span>
            </div>
          </div>

          {/* Model Routing & Guardrails Switches */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Model Routing */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
              <h3 className="text-sm font-bold text-[#0B3828]">Model routing policies</h3>
              <div className="flex flex-col gap-2.5 text-xs">
                {aiData?.model_routing?.map((r: any) => (
                  <div key={r.task} className="p-3 bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="font-bold text-[#0B3828] capitalize">{r.task.replace('_', ' ')}</span>
                      <span className="text-[11px] text-[#52796F]">{r.description}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded-full">
                      {r.model}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Guardrails Switches */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
              <h3 className="text-sm font-bold text-[#0B3828]">Active guardrails</h3>
              <div className="flex flex-col gap-2.5 text-xs">
                {aiData?.guardrails &&
                  Object.entries(aiData.guardrails)
                    .filter(([k]) => ['must_confirm', 'amount_sanity', 'dedupe_10m', 'date_bounds', 'high_value_block'].includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="p-3 bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl flex items-center justify-between">
                        <span className="font-bold text-[#0B3828] capitalize">{k.replace('_', ' ')}</span>
                        <button
                          onClick={() => handleToggleGuardrail(k, Boolean(v))}
                          className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                            v ? 'bg-[#DCFCE7] text-[#166534]' : 'bg-[#E5EAE7] text-[#52796F]'
                          }`}
                        >
                          {v ? 'Enforced' : 'Disabled'}
                        </button>
                      </div>
                    ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 10: SUPPORT (Improvements/Nirvul360 Admin Panel.pdf Page 10)
      ========================================================================== */}
      {(currentTab === 'admin_support' || currentTab === 'support') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">Support &amp; announcements</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                {supportData?.open_tickets_count ?? filteredTickets.length} open tickets · continuous triage
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Open Tickets Table */}
            <div className="lg:col-span-2 bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-[#E0E7E2] pb-2">
                <h3 className="text-sm font-bold text-[#0B3828]">Tickets</h3>
                <div className="flex items-center gap-1.5 text-xs">
                  {(['all', 'urgent', 'mine'] as const).map((sf) => (
                    <button
                      key={sf}
                      onClick={() => setSupportFilter(sf)}
                      className={`px-2.5 py-0.5 rounded-lg capitalize font-semibold transition ${
                        supportFilter === sf ? 'bg-[#062E1F] text-white' : 'text-[#52796F] hover:bg-[#E5EBE5]'
                      }`}
                    >
                      {sf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#E0E7E2] text-[#52796F] text-[10px] uppercase font-bold tracking-wider">
                      <th className="py-2">ID</th>
                      <th className="py-2">Tenant</th>
                      <th className="py-2">Subject</th>
                      <th className="py-2">Waiting</th>
                      <th className="py-2 text-right">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E0E7E2]">
                    {filteredTickets.length ? (
                      filteredTickets.map((t: any) => (
                        <tr key={t.id} className="hover:bg-[#F8FAF8]">
                          <td className="py-2.5 font-bold font-mono text-[#0B3828]">#{t.id}</td>
                          <td className="py-2.5 font-bold text-[#0B3828]">{t.merchant_name}</td>
                          <td className="py-2.5 text-[#52796F]">{t.subject}</td>
                          <td className="py-2.5 text-[#52796F]">{t.waiting_since || 'Recent'}</td>
                          <td className="py-2.5 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                t.priority === 'urgent'
                                  ? 'bg-[#FEE2E2] text-[#991B1B]'
                                  : t.priority === 'high'
                                  ? 'bg-[#FEF3C7] text-[#92400E]'
                                  : 'bg-[#E5EBE5] text-[#0B3828]'
                              }`}
                            >
                              {t.priority}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-xs text-[#52796F]">
                          No open support tickets. Support queue is clear.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Announcement Form & History */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-4 text-xs">
              <h3 className="text-sm font-bold text-[#0B3828]">Broadcast announcement</h3>
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Announcement title"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  className="px-3 py-2 bg-[#F8FAF8] border border-[#D0DDD5] rounded-xl text-xs text-[#0B3828] focus:outline-none focus:border-[#0B3828]"
                />
                <textarea
                  rows={3}
                  placeholder="Message content broadcast to tenants..."
                  value={announcementMsg}
                  onChange={(e) => setAnnouncementMsg(e.target.value)}
                  className="px-3 py-2 bg-[#F8FAF8] border border-[#D0DDD5] rounded-xl text-xs text-[#0B3828] focus:outline-none focus:border-[#0B3828] resize-none"
                />
                <div className="flex items-center justify-between">
                  <select
                    value={announcementAudience}
                    onChange={(e) => setAnnouncementAudience(e.target.value)}
                    className="px-2 py-1 bg-[#F8FAF8] border border-[#D0DDD5] rounded-lg text-xs"
                  >
                    <option value="all">All Tenants</option>
                    <option value="pathao">Pathao Merchants</option>
                    <option value="steadfast">Steadfast Merchants</option>
                    <option value="growth">Growth Plan</option>
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-[#52796F] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={announcementWhatsApp}
                      onChange={(e) => setAnnouncementWhatsApp(e.target.checked)}
                      className="rounded"
                    />
                    <span>Send WhatsApp</span>
                  </label>
                </div>
                <button
                  onClick={handlePostAnnouncement}
                  className="w-full py-2 rounded-xl bg-[#062E1F] hover:bg-[#0B3828] text-white text-xs font-bold transition shadow-xs"
                >
                  Publish announcement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          PAGE 11: SYSTEM SETTINGS (Improvements/Nirvul360 Admin Panel.pdf Page 11)
      ========================================================================== */}
      {(currentTab === 'admin_settings' || currentTab === 'settings') && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-[#0B3828] tracking-tight">System settings</h1>
              <p className="text-xs text-[#52796F] mt-0.5">
                Platform-wide switches · changes recorded in audit log · dialect: {settingsData?.database?.dialect || 'PostgreSQL'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Feature Flags */}
            <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <h3 className="text-sm font-bold text-[#0B3828]">Feature flags &amp; rollout percentages</h3>
              <div className="flex flex-col gap-3 text-xs">
                {settingsData?.feature_flags &&
                  Object.entries(settingsData.feature_flags).map(([key, val]: [string, any]) => (
                    <div key={key} className="flex items-center justify-between p-2.5 bg-[#F8FAF8] border border-[#E0E7E2] rounded-xl">
                      <span className="font-bold text-[#0B3828] capitalize">{key.replace('_', ' ')}</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={Number(val) || 0}
                          onChange={(e) => handleToggleFeatureFlag(key, Number(e.target.value))}
                          className="w-24 accent-[#0B3828]"
                        />
                        <span className="text-xs font-black text-[#0B3828] w-10 text-right">{val}%</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Maintenance Mode & Database Status */}
            <div className="flex flex-col gap-6">
              <div className="bg-white border border-[#E0E7E2] rounded-2xl p-5 shadow-2xs flex flex-col gap-3 text-xs">
                <h3 className="text-sm font-bold text-[#0B3828]">Platform telemetry</h3>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">DB latency</span>
                    <span className="font-bold text-[#0B3828]">{settingsData?.system_status?.db_latency_ms != null ? `${settingsData.system_status.db_latency_ms} ms` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Uptime, 30 days</span>
                    <span className="font-bold text-[#166534]">{settingsData?.system_status?.uptime_pct != null ? `${settingsData.system_status.uptime_pct}%` : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#52796F]">Database connections</span>
                    <span className="font-bold text-[#0B3828]">
                      {settingsData?.database?.active_connections ?? 0} / {settingsData?.database?.max_connections ?? 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-5 shadow-xs flex flex-col gap-3">
                <h3 className="text-sm font-bold text-[#991B1B]">Maintenance mode</h3>
                <span className="text-[11px] text-[#B91C1C]">
                  Signs non-admin merchants out and displays a maintenance screen. Background worker queues remain operational.
                </span>
                <button
                  onClick={() => handleToggleMaintenanceMode(!settingsData?.maintenance_mode?.active)}
                  className={`py-2.5 rounded-xl border text-xs font-bold transition text-center ${
                    settingsData?.maintenance_mode?.active
                      ? 'bg-[#166534] text-white border-[#166534]'
                      : 'border-[#FCA5A5] bg-white hover:bg-[#FEE2E2] text-[#991B1B]'
                  }`}
                >
                  {settingsData?.maintenance_mode?.active ? 'Deactivate Maintenance Mode' : 'Turn on Maintenance Mode'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
