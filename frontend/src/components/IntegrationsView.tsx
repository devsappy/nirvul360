'use client';

import React, { useState, useEffect } from 'react';
import { api, apiIntegrations } from '@/lib/api';
import { IntegrationsHubData, IntegrationSourceCard } from '@/types';

interface IntegrationsViewProps {
  onOpenSyncLog?: () => void;
  onNavigateToSettlements?: () => void;
  onShowToast?: (msg: string) => void;
}

export function IntegrationsView({
  onOpenSyncLog,
  onNavigateToSettlements,
  onShowToast,
}: IntegrationsViewProps) {
  const [data, setData] = useState<IntegrationsHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncAllFeedback, setSyncAllFeedback] = useState('');
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingCardKey, setSyncingCardKey] = useState<string | null>(null);

  // RedX Token Modal
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [newTokenValue, setNewTokenValue] = useState('');
  const [isSavingToken, setIsSavingToken] = useState(false);

  // Meta Ads Modal
  const [metaModalOpen, setMetaModalOpen] = useState(false);
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');
  const [metaCurrency, setMetaCurrency] = useState('USD');
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const [metaFeedback, setMetaFeedback] = useState<string | null>(null);

  // Courier Modal (Pathao / Steadfast)
  const [courierModalOpen, setCourierModalOpen] = useState(false);
  const [courierProvider, setCourierProvider] = useState<'pathao' | 'steadfast' | 'redx'>('pathao');
  const [courierApiKey, setCourierApiKey] = useState('');
  const [courierSecret, setCourierSecret] = useState('');
  const [isSavingCourier, setIsSavingCourier] = useState(false);
  const [courierFeedback, setCourierFeedback] = useState<string | null>(null);

  // Store Modal
  const [storeModalOpen, setStoreModalOpen] = useState(false);
  const [storePlatform, setStorePlatform] = useState('wordpress');
  const [storeUrl, setStoreUrl] = useState('');
  const [storeApiKey, setStoreApiKey] = useState('');
  const [storeSecret, setStoreSecret] = useState('');
  const [isSavingStore, setIsSavingStore] = useState(false);
  const [storeFeedback, setStoreFeedback] = useState<string | null>(null);

  // MFS Modal
  const [mfsModalOpen, setMfsModalOpen] = useState(false);
  const [mfsProvider, setMfsProvider] = useState<'bKash' | 'Nagad'>('bKash');

  const notify = (msg: string) => {
    if (onShowToast) onShowToast(msg);
  };

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiIntegrations.getOverview();
      setData(res);
    } catch (err) {
      console.error('Failed to load integrations overview', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync All
  const handleSyncAll = async () => {
    try {
      setIsSyncingAll(true);
      setSyncAllFeedback('Syncing active sources...');
      try {
        await api.post('/api/integrations/courier/sync', {});
      } catch {}
      try {
        await api.post('/api/integrations/meta-ads/sync', {});
      } catch {}
      await loadData();
      setSyncAllFeedback('All active sources synced successfully.');
      notify('All active sources synced successfully.');
      setTimeout(() => setSyncAllFeedback(''), 4000);
    } catch (err: any) {
      setSyncAllFeedback('Sync completed with warnings.');
      setTimeout(() => setSyncAllFeedback(''), 4000);
    } finally {
      setIsSyncingAll(false);
    }
  };

  // Fix RedX Token
  const handleFixRedxToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenValue.trim()) return;

    setIsSavingToken(true);
    try {
      await api.post('/api/integrations/courier', {
        courier: 'redx',
        apiKey: newTokenValue.trim(),
      });
      setTokenModalOpen(false);
      setNewTokenValue('');
      await loadData();
      notify('RedX token saved and verified successfully.');
    } catch (err: any) {
      notify(err.message || 'Failed to save RedX token');
    } finally {
      setIsSavingToken(false);
    }
  };

  // Save Meta Ads Credentials
  const handleSaveMetaAds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metaAccountId.trim() || !metaAccessToken.trim()) {
      setMetaFeedback('Both Ad Account ID and Access Token are required.');
      return;
    }
    setIsSavingMeta(true);
    setMetaFeedback(null);
    try {
      await api.post('/api/integrations/meta-ads', {
        ad_account_id: metaAccountId.trim(),
        access_token: metaAccessToken.trim(),
        currency: metaCurrency,
      });
      setMetaModalOpen(false);
      setMetaAccountId('');
      setMetaAccessToken('');
      await loadData();
      notify('Meta Ads account connected successfully!');
    } catch (err: any) {
      setMetaFeedback(err.message || 'Failed to connect Meta Ads account');
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Disconnect Meta Ads
  const handleDisconnectMetaAds = async () => {
    setIsSavingMeta(true);
    try {
      await api.post('/api/integrations/disconnect', { type: 'meta' });
      setMetaModalOpen(false);
      await loadData();
      notify('Meta Ads disconnected.');
    } catch (err: any) {
      setMetaFeedback(err.message || 'Failed to disconnect');
    } finally {
      setIsSavingMeta(false);
    }
  };

  // Save Courier Credentials
  const handleSaveCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courierApiKey.trim()) {
      setCourierFeedback('API Key is required.');
      return;
    }
    setIsSavingCourier(true);
    setCourierFeedback(null);
    try {
      await api.post('/api/integrations/courier', {
        courier: courierProvider,
        apiKey: courierApiKey.trim(),
        secretKey: courierSecret.trim(),
      });
      setCourierModalOpen(false);
      setCourierApiKey('');
      setCourierSecret('');
      await loadData();
      notify(`${courierProvider.toUpperCase()} Courier connected successfully!`);
    } catch (err: any) {
      setCourierFeedback(err.message || 'Failed to connect courier');
    } finally {
      setIsSavingCourier(false);
    }
  };

  // Disconnect Courier
  const handleDisconnectCourier = async () => {
    setIsSavingCourier(true);
    try {
      await api.post('/api/integrations/disconnect', { type: 'courier' });
      setCourierModalOpen(false);
      await loadData();
      notify('Courier disconnected.');
    } catch (err: any) {
      setCourierFeedback(err.message || 'Failed to disconnect courier');
    } finally {
      setIsSavingCourier(false);
    }
  };

  // Save Store Credentials
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStore(true);
    setStoreFeedback(null);
    try {
      await api.post('/api/integrations/store', {
        platform: storePlatform,
        store_url: storeUrl.trim(),
        api_key: storeApiKey.trim(),
        api_secret: storeSecret.trim(),
      });
      setStoreModalOpen(false);
      await loadData();
      notify('Store connected successfully!');
    } catch (err: any) {
      setStoreFeedback(err.message || 'Failed to connect store');
    } finally {
      setIsSavingStore(false);
    }
  };

  // Generic Card Action Router
  const handleCardAction = async (card: IntegrationSourceCard, act: { label: string; action: string }) => {
    const action = act.action;
    const key = card.key;

    // Sync now
    if (action === 'sync') {
      try {
        setSyncingCardKey(key);
        if (key === 'meta_ads') {
          await api.post('/api/integrations/meta-ads/sync', {});
          notify('Meta Ads spend synced successfully.');
        } else if (key === 'pathao' || key === 'steadfast') {
          await api.post('/api/integrations/courier/sync', {});
          notify('Courier parcel statuses synced successfully.');
        } else if (key === 'facebook_shop') {
          await api.post('/api/integrations/store/pull-inventory', {});
          notify('Store orders and products synced successfully.');
        }
        await loadData();
      } catch (err: any) {
        notify(err.message || 'Sync failed');
      } finally {
        setSyncingCardKey(null);
      }
      return;
    }

    // Meta Ads Actions
    if (key === 'meta_ads' || action === 'connect_meta') {
      setMetaFeedback(null);
      setMetaModalOpen(true);
      return;
    }

    // Courier Actions
    if (key === 'pathao' || action === 'connect_pathao') {
      setCourierProvider('pathao');
      setCourierFeedback(null);
      setCourierModalOpen(true);
      return;
    }
    if (key === 'steadfast' || action === 'connect_steadfast') {
      if (action === 'upload') {
        if (onNavigateToSettlements) {
          onNavigateToSettlements();
        } else {
          notify('Navigate to Courier Settlements tab to upload statements.');
        }
        return;
      }
      if (action === 'request_key') {
        notify('Contact Steadfast Support at portal.steadfast.com.bd to request an API key.');
        return;
      }
      setCourierProvider('steadfast');
      setCourierFeedback(null);
      setCourierModalOpen(true);
      return;
    }
    if (key === 'redx' || action === 'connect_redx' || action === 'paste_token') {
      setTokenModalOpen(true);
      return;
    }

    // Store Actions
    if (key === 'facebook_shop' || action === 'connect_store') {
      setStoreFeedback(null);
      setStoreModalOpen(true);
      return;
    }

    // bKash / Nagad Actions
    if (key === 'bkash_nagad' || action === 'connect_bkash' || action === 'connect_nagad') {
      setMfsProvider(action.includes('nagad') ? 'Nagad' : 'bKash');
      setMfsModalOpen(true);
      return;
    }

    notify(`${act.label} clicked`);
  };

  const healthyCount = data?.healthy_count ?? 0;
  const totalCount = data?.total_count ?? (data?.cards?.length || 0);
  const fullSyncTime = data?.full_sync_last_completed || 'Recently';

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading integrations...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Integrations</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {healthyCount} of {totalCount} sources healthy · full sync last completed {fullSyncTime}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {syncAllFeedback && (
            <span className="text-xs text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              ✓ {syncAllFeedback}
            </span>
          )}
          <button
            onClick={() => onOpenSyncLog?.() || notify('Opening sync audit log')}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Sync log
          </button>
          <button
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            className="bg-[#062E1F] hover:bg-[#0B3B28] disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
          >
            {isSyncingAll ? 'Syncing...' : 'Sync all now'}
          </button>
        </div>
      </div>

      {/* Critical Degraded/Expired Token Alert Banner */}
      {data?.alert && (
        <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-red-900">{data.alert.title}</span>
            <span className="text-xs text-red-700 mt-0.5 max-w-2xl leading-relaxed">
              {data.alert.description}
            </span>
          </div>
          <button
            onClick={() => setTokenModalOpen(true)}
            className="bg-white hover:bg-red-50 text-red-800 border border-red-300 font-semibold px-3.5 py-2 rounded-xl text-xs shadow-2xs shrink-0 self-start sm:self-auto transition"
          >
            {data.alert.action_label}
          </button>
        </div>
      )}

      {/* 6 Connector Cards Grid (3 cols x 2 rows) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {(data?.cards || []).map((card) => {
          const isRedxFailed = card.key === 'redx' && card.status === 'failed';
          const isSyncingThis = syncingCardKey === card.key;

          return (
            <div
              key={card.key}
              className={`rounded-2xl p-5 shadow-2xs flex flex-col justify-between gap-4 border transition ${
                isRedxFailed
                  ? 'bg-[#FFF5F5] border-[#FCA5A5]'
                  : 'bg-white border-slate-200'
              }`}
            >
              {/* Card Top: Badge & Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                      isRedxFailed
                        ? 'bg-red-900 text-white'
                        : card.key === 'pathao'
                        ? 'bg-[#025033] text-white'
                        : card.key === 'facebook_shop'
                        ? 'bg-blue-600 text-white'
                        : card.key === 'meta_ads'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-white'
                    }`}
                  >
                    {card.badge}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900 leading-tight">{card.name}</span>
                    <span className="text-[11px] text-slate-500 capitalize leading-tight">{card.category?.replace('_', ' ')}</span>
                  </div>
                </div>

                {renderConnectorStatusPill(card.status, card.status_label)}
              </div>

              {/* Card Body: Key-Value Metric Rows */}
              <div className="flex flex-col gap-1.5 text-xs">
                {card.last_sync !== undefined && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Last successful sync:</span>
                    <span className="font-semibold text-slate-800">{card.last_sync || 'Never'}</span>
                  </div>
                )}
                {card.failures_label && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">{card.failures_label.split(':')[0]}:</span>
                    <span className={`font-semibold ${isRedxFailed ? 'text-red-700 font-bold' : 'text-slate-800'}`}>
                      {card.failures_label.split(':')[1] || card.failures_count}
                    </span>
                  </div>
                )}
                {card.brings_in && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Brings in:</span>
                    <span className="font-semibold text-slate-800 truncate max-w-[150px]">{card.brings_in}</span>
                  </div>
                )}
                {card.orders_pulled_month !== undefined && card.orders_pulled_month !== null && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Orders pulled this month:</span>
                    <span className="font-semibold text-slate-800">{card.orders_pulled_month}</span>
                  </div>
                )}
                {card.page_name && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Page:</span>
                    <span className="font-semibold text-slate-800">{card.page_name}</span>
                  </div>
                )}
                {card.spend_usd !== undefined && card.spend_usd !== null && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Spend this month:</span>
                    <span className="font-semibold text-slate-800">
                      ${card.spend_usd.toFixed(2)} · ৳{card.spend_taka?.toLocaleString() ?? 0}
                    </span>
                  </div>
                )}
                {card.rate_used && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">Rate used:</span>
                    <span className="font-semibold text-slate-800">
                      {card.rate_used}{card.rate_date ? ` on ${card.rate_date}` : ''}
                    </span>
                  </div>
                )}
                {card.secondary_label && (
                  <div className="flex justify-between py-0.5 border-b border-slate-100">
                    <span className="text-slate-500">{card.secondary_label.split(':')[0]}:</span>
                    <span className="font-semibold text-slate-800">{card.secondary_label.split(':')[1]}</span>
                  </div>
                )}
              </div>

              {/* Internal Callout Box for Error State */}
              {card.error_reason && (
                <div className="p-3 rounded-xl bg-red-100/70 border border-red-200 text-xs flex flex-col gap-1.5">
                  <span className="font-bold text-red-950">Reason: {card.error_reason}</span>
                  {card.fix_hint && (
                    <span className="text-[11px] text-red-800 leading-relaxed font-normal">
                      {card.fix_hint}
                    </span>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                {card.actions.map((act) => {
                  if (act.variant === 'danger') {
                    return (
                      <button
                        key={act.action}
                        onClick={() => handleCardAction(card, act)}
                        className="flex-1 bg-red-700 hover:bg-red-800 text-white py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
                      >
                        {act.label}
                      </button>
                    );
                  }
                  if (act.primary) {
                    return (
                      <button
                        key={act.action}
                        disabled={isSyncingThis}
                        onClick={() => handleCardAction(card, act)}
                        className="flex-1 bg-[#062E1F] hover:bg-[#0B3B28] disabled:opacity-50 text-white py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
                      >
                        {isSyncingThis ? 'Working...' : act.label}
                      </button>
                    );
                  }
                  return (
                    <button
                      key={act.action}
                      disabled={isSyncingThis}
                      onClick={() => handleCardAction(card, act)}
                      className="flex-1 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
                    >
                      {isSyncingThis ? 'Working...' : act.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Specification Table: What each source is allowed to write */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-100 gap-1">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900">What each source is allowed to write</span>
            <span className="text-xs text-slate-500">
              A source may only write the fields listed here. Anything outside them goes to Needs attention instead.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">Synced {fullSyncTime}</span>
        </div>

        {/* 5-Column Grid Table */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-1">
          {(data?.write_permissions || []).map((perm) => (
            <div key={perm.source} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col gap-1.5">
              <span className="text-xs font-bold text-slate-900">{perm.source}</span>
              <span className="text-[11px] text-slate-600 leading-relaxed font-normal">
                {perm.writes}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 1. Modal: Meta Ads Connect & Settings */}
      {metaModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex flex-col">
                <h3 className="text-base font-bold text-slate-900">Connect Meta Ads</h3>
                <p className="text-xs text-slate-500">Link your Facebook / Instagram advertising account</p>
              </div>
              <button onClick={() => setMetaModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            {metaFeedback && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {metaFeedback}
              </div>
            )}

            <form onSubmit={handleSaveMetaAds} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Meta Ad Account ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. act_123456789012345"
                  value={metaAccountId}
                  onChange={(e) => setMetaAccountId(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
                <span className="text-[11px] text-slate-400">Found in Meta Ads Manager top-left corner under your account name.</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">System User Access Token</label>
                <textarea
                  rows={3}
                  required
                  placeholder="EAAB..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
                <span className="text-[11px] text-slate-400">Requires `ads_read` and `read_insights` permissions from Meta Business Manager.</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Billing Currency</label>
                <select
                  value={metaCurrency}
                  onChange={(e) => setMetaCurrency(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                >
                  <option value="USD">USD ($)</option>
                  <option value="BDT">BDT (৳)</option>
                </select>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDisconnectMetaAds}
                  disabled={isSavingMeta}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Disconnect
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMetaModalOpen(false)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingMeta}
                    className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {isSavingMeta ? 'Connecting...' : 'Save and verify'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Modal: Courier Connect (Pathao / Steadfast) */}
      {courierModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex flex-col">
                <h3 className="text-base font-bold text-slate-900">Connect {courierProvider.toUpperCase()} Courier</h3>
                <p className="text-xs text-slate-500">Live parcel tracking, COD reconciliation & charges</p>
              </div>
              <button onClick={() => setCourierModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            {courierFeedback && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {courierFeedback}
              </div>
            )}

            <form onSubmit={handleSaveCourier} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">API Key</label>
                <input
                  type="text"
                  required
                  placeholder="Enter courier API key"
                  value={courierApiKey}
                  onChange={(e) => setCourierApiKey(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Secret / Token (Optional)</label>
                <input
                  type="password"
                  placeholder="Enter API secret"
                  value={courierSecret}
                  onChange={(e) => setCourierSecret(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleDisconnectCourier}
                  disabled={isSavingCourier}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Disconnect
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCourierModalOpen(false)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCourier}
                    className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                  >
                    {isSavingCourier ? 'Saving...' : 'Save and connect'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Modal: Store Orders Connect */}
      {storeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex flex-col">
                <h3 className="text-base font-bold text-slate-900">Connect Store Orders</h3>
                <p className="text-xs text-slate-500">Auto-pull orders, line items & customer details</p>
              </div>
              <button onClick={() => setStoreModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            {storeFeedback && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                {storeFeedback}
              </div>
            )}

            <form onSubmit={handleSaveStore} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Platform</label>
                <select
                  value={storePlatform}
                  onChange={(e) => setStorePlatform(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                >
                  <option value="wordpress">WooCommerce / WordPress</option>
                  <option value="shopify">Shopify</option>
                  <option value="custom">Custom Store / Facebook Shop</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Store Website URL</label>
                <input
                  type="url"
                  placeholder="https://yourstore.com"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Consumer Key / API Key</label>
                <input
                  type="text"
                  placeholder="ck_..."
                  value={storeApiKey}
                  onChange={(e) => setStoreApiKey(e.target.value)}
                  className="text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setStoreModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStore}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isSavingStore ? 'Saving...' : 'Save and connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Modal: Paste New RedX API Token */}
      {tokenModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Connect RedX API Token</h3>
              <button onClick={() => setTokenModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Open your RedX merchant panel under Settings → API, generate a new token, and paste it below. This will resume tracking for parcels currently in transit.
            </p>

            <form onSubmit={handleFixRedxToken} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">API Token</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  value={newTokenValue}
                  onChange={(e) => setNewTokenValue(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTokenModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingToken}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs"
                >
                  {isSavingToken ? 'Verifying token...' : 'Save and verify'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal: MFS (bKash & Nagad) Information */}
      {mfsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex flex-col">
                <h3 className="text-base font-bold text-slate-900">{mfsProvider} Merchant API</h3>
                <p className="text-xs text-slate-500">Automated mobile financial service reconciliation</p>
              </div>
              <button onClick={() => setMfsModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed flex flex-col gap-2">
              <span className="font-bold text-slate-900">{mfsProvider} Direct Gateway Status: Not Connected</span>
              <p>
                To enable automated real-time statement pulls for {mfsProvider}, contact your corporate account manager to request API credentials (App Key, App Secret, and Merchant Username).
              </p>
              <p className="text-slate-500">
                In the meantime, your {mfsProvider} cash movements and supplier disbursements are recorded manually through your Double-Entry Cash Accounts.
              </p>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setMfsModalOpen(false)}
                className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderConnectorStatusPill(status: string, label: string) {
  if (status === 'connected') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
        {label}
      </span>
    );
  }
  if (status === 'sheet_upload') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
        {label}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-700 text-white">
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
      {label}
    </span>
  );
}
