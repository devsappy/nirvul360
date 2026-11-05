'use client';

import React, { useState } from 'react';
import { CourierIcon, MetaIcon, WhatsAppIcon, SupabaseIcon, LockIcon, CloseIcon, StoreIcon, DownloadCloudIcon } from './icons';
import { User } from '@/types';
import { api } from '@/lib/api';

interface IntegrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  onSuccess: (msg: string) => void;
}

export function IntegrationsModal({ isOpen, onClose, user, onSuccess }: IntegrationsModalProps) {
  const [activeTab, setActiveTab] = useState<'store' | 'courier' | 'meta' | 'whatsapp' | 'supabase'>('store');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store form states
  const [storePlatform, setStorePlatform] = useState<'wordpress' | 'shopify' | 'laravel' | 'daraz' | 'custom'>('wordpress');
  const [storeUrl, setStoreUrl] = useState('');
  const [storeApiKey, setStoreApiKey] = useState('');
  const [storeApiSecret, setStoreApiSecret] = useState('');
  const [storePulling, setStorePulling] = useState(false);

  // Courier form states
  const [courierProvider, setCourierProvider] = useState('steadfast');
  const [courierApiKey, setCourierApiKey] = useState('');
  const [courierSecret, setCourierSecret] = useState('');

  // Meta form states
  const [metaAccountId, setMetaAccountId] = useState('');
  const [metaAccessToken, setMetaAccessToken] = useState('');

  // WhatsApp form states
  const [waPhoneNumberId, setWaPhoneNumberId] = useState('');
  const [waAccessToken, setWaAccessToken] = useState('');

  if (!isOpen) return null;

  const role = user?.role || 'accountant';
  const isBlocked = role === 'accountant';

  const handleConnectStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/integrations/store', {
        platform: storePlatform,
        store_url: storeUrl,
        api_key: storeApiKey,
        api_secret: storeApiSecret,
      });
      onSuccess(res.message || `Successfully connected ${storePlatform.toUpperCase()} Store!`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect store');
    } finally {
      setLoading(false);
    }
  };

  const handlePullStoreInventory = async () => {
    if (isBlocked) return;
    setStorePulling(true);
    setError(null);
    try {
      const res = await api.post('/api/integrations/store/pull-inventory', {
        platform: storePlatform,
        store_url: storeUrl,
        api_key: storeApiKey,
        api_secret: storeApiSecret,
      });
      onSuccess(res.message || `Successfully pulled ${res.pulled_count || 0} inventory items!`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to pull inventory');
    } finally {
      setStorePulling(false);
    }
  };

  const handleConnectCourier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/integrations/courier', {
        courier: courierProvider,
        apiKey: courierApiKey,
        secretKey: courierSecret,
      });
      onSuccess(`Successfully connected ${courierProvider.toUpperCase()} Courier!`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect courier');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/integrations/meta-ads', {
        ad_account_id: metaAccountId,
        access_token: metaAccessToken,
      });
      onSuccess('Successfully connected Meta Ads account!');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect Meta Ads');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWhatsApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlocked) return;
    setLoading(true);
    setError(null);
    try {
      await api.post('/api/integrations/whatsapp', {
        phone_number_id: waPhoneNumberId,
        access_token: waAccessToken,
      });
      onSuccess('Successfully connected WhatsApp Cloud API!');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to connect WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4">
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-[#025033]">Integrations Hub</h2>
            <p className="text-xs text-[#3A8067]">Connect Store website, Courier, Meta Ads, and WhatsApp</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#3A8067] hover:text-[#025033] rounded-lg transition">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Hierarchy Guard Banner */}
        {isBlocked && (
          <div className="px-6 py-3 bg-[#E6F7EF] border-b border-[#CAE4D8] flex items-center gap-2 text-xs text-[#025033] font-medium">
            <LockIcon className="w-4 h-4 text-[#025033] shrink-0" />
            <span>
              Hierarchy Restriction: Only <strong>Agency Owners</strong>, <strong>Admins</strong>, or <strong>Super Admins</strong> can configure integrations.
            </span>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-[#E5EAE7] px-6 pt-3 gap-2 bg-[#FAFCF9] overflow-x-auto">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 pb-2.5 px-2 text-xs font-semibold border-b-2 transition shrink-0 ${
              activeTab === 'store' ? 'border-[#025033] text-[#025033]' : 'border-transparent text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <StoreIcon className="w-4 h-4" />
            <span>Store Website</span>
          </button>
          <button
            onClick={() => setActiveTab('courier')}
            className={`flex items-center gap-2 pb-2.5 px-2 text-xs font-semibold border-b-2 transition shrink-0 ${
              activeTab === 'courier' ? 'border-[#025033] text-[#025033]' : 'border-transparent text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <CourierIcon className="w-4 h-4" />
            <span>Courier API</span>
          </button>
          <button
            onClick={() => setActiveTab('meta')}
            className={`flex items-center gap-2 pb-2.5 px-2 text-xs font-semibold border-b-2 transition shrink-0 ${
              activeTab === 'meta' ? 'border-[#025033] text-[#025033]' : 'border-transparent text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <MetaIcon className="w-4 h-4" />
            <span>Meta Ads</span>
          </button>
          <button
            onClick={() => setActiveTab('whatsapp')}
            className={`flex items-center gap-2 pb-2.5 px-2 text-xs font-semibold border-b-2 transition shrink-0 ${
              activeTab === 'whatsapp' ? 'border-[#025033] text-[#025033]' : 'border-transparent text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <WhatsAppIcon className="w-4 h-4" />
            <span>WhatsApp Cloud</span>
          </button>
          <button
            onClick={() => setActiveTab('supabase')}
            className={`flex items-center gap-2 pb-2.5 px-2 text-xs font-semibold border-b-2 transition shrink-0 ${
              activeTab === 'supabase' ? 'border-[#025033] text-[#025033]' : 'border-transparent text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <SupabaseIcon className="w-4 h-4" />
            <span>Supabase</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-xs rounded-xl">
              {error}
            </div>
          )}

          {activeTab === 'store' && (
            <form onSubmit={handleConnectStore} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1.5">
                  Platform (WordPress, Shopify, Laravel, Daraz, Custom)
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(['wordpress', 'shopify', 'laravel', 'daraz', 'custom'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={isBlocked}
                      onClick={() => setStorePlatform(p)}
                      className={`py-2 px-1 text-center rounded-xl border text-[11px] font-bold capitalize transition ${
                        storePlatform === p
                          ? 'border-[#00432C] bg-[#025033] text-[#FFFFFF]'
                          : 'border-[#E5EAE7] bg-[#FAFCF9] text-[#025033] hover:border-[#3A8067]'
                      }`}
                    >
                      {p === 'wordpress' ? 'WooCommerce' : p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Store Website URL</label>
                <input
                  type="text"
                  placeholder="https://myshop.com or https://myshop.myshopify.com"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  {storePlatform === 'shopify' ? 'Admin Access Token' : 'API Key / Consumer Key'}
                </label>
                <input
                  type="text"
                  placeholder={storePlatform === 'wordpress' ? 'ck_live_...' : 'API Key / Token'}
                  value={storeApiKey}
                  onChange={(e) => setStoreApiKey(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              {storePlatform !== 'shopify' && (
                <div>
                  <label className="block text-xs font-semibold text-[#025033] mb-1">API Secret / Consumer Secret</label>
                  <input
                    type="password"
                    placeholder="cs_live_..."
                    value={storeApiSecret}
                    onChange={(e) => setStoreApiSecret(e.target.value)}
                    disabled={isBlocked}
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isBlocked || loading}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isBlocked
                      ? 'bg-[#E5EAE7] text-[#3A8067] cursor-not-allowed'
                      : 'bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] shadow-xs'
                  }`}
                >
                  {isBlocked ? <LockIcon className="w-3.5 h-3.5" /> : null}
                  <span>{loading ? 'Connecting...' : 'Connect Store'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePullStoreInventory}
                  disabled={isBlocked || storePulling}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition flex items-center justify-center gap-1.5 ${
                    isBlocked
                      ? 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] cursor-not-allowed'
                      : 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7] hover:bg-[#E6F7EF] shadow-2xs'
                  }`}
                >
                  <DownloadCloudIcon className="w-3.5 h-3.5" />
                  <span>{storePulling ? 'Pulling Items...' : 'Pull Inventory Now'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'courier' && (
            <form onSubmit={handleConnectCourier} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Courier Provider</label>
                <select
                  value={courierProvider}
                  onChange={(e) => setCourierProvider(e.target.value)}
                  disabled={isBlocked}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] focus:outline-none focus:border-[#025033]"
                >
                  <option value="steadfast">Steadfast Courier (BD)</option>
                  <option value="pathao">Pathao Courier (BD)</option>
                  <option value="redx">RedX Logistics (BD)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">API Key</label>
                <input
                  type="text"
                  placeholder="e.g. st_live_key_99482..."
                  value={courierApiKey}
                  onChange={(e) => setCourierApiKey(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Secret Key (Optional)</label>
                <input
                  type="password"
                  placeholder="••••••••••••••••"
                  value={courierSecret}
                  onChange={(e) => setCourierSecret(e.target.value)}
                  disabled={isBlocked}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isBlocked || loading}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isBlocked
                      ? 'bg-[#E5EAE7] text-[#3A8067] cursor-not-allowed'
                      : 'bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] shadow-xs'
                  }`}
                >
                  {isBlocked ? <LockIcon className="w-3.5 h-3.5" /> : null}
                  <span>{loading ? 'Connecting...' : 'Connect Courier Website'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'meta' && (
            <form onSubmit={handleConnectMeta} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Meta Ad Account ID</label>
                <input
                  type="text"
                  placeholder="act_1234567890"
                  value={metaAccountId}
                  onChange={(e) => setMetaAccountId(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">System User Access Token</label>
                <input
                  type="password"
                  placeholder="EAAG..."
                  value={metaAccessToken}
                  onChange={(e) => setMetaAccessToken(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isBlocked || loading}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isBlocked
                      ? 'bg-[#E5EAE7] text-[#3A8067] cursor-not-allowed'
                      : 'bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] shadow-xs'
                  }`}
                >
                  {isBlocked ? <LockIcon className="w-3.5 h-3.5" /> : null}
                  <span>{loading ? 'Connecting...' : 'Connect Meta Ads'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'whatsapp' && (
            <form onSubmit={handleConnectWhatsApp} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Phone Number ID</label>
                <input
                  type="text"
                  placeholder="e.g. 1092837465..."
                  value={waPhoneNumberId}
                  onChange={(e) => setWaPhoneNumberId(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">Permanent Access Token</label>
                <input
                  type="password"
                  placeholder="EAAB..."
                  value={waAccessToken}
                  onChange={(e) => setWaAccessToken(e.target.value)}
                  disabled={isBlocked}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isBlocked || loading}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                    isBlocked
                      ? 'bg-[#E5EAE7] text-[#3A8067] cursor-not-allowed'
                      : 'bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] shadow-xs'
                  }`}
                >
                  {isBlocked ? <LockIcon className="w-3.5 h-3.5" /> : null}
                  <span>{loading ? 'Connecting...' : 'Connect WhatsApp Cloud API'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'supabase' && (
            <div className="flex flex-col gap-3 py-2 text-xs">
              <div className="p-4 bg-[#FAFCF9] border border-[#E5EAE7] rounded-2xl flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[#025033] font-bold">
                  <SupabaseIcon className="w-4 h-4 text-[#025033]" />
                  <span>Supabase PostgreSQL Integration</span>
                </div>
                <p className="text-[#3A8067] leading-relaxed">
                  Gross Management automatically replicates every double-entry journal, order status transition, and exception resolution to Supabase PostgreSQL in real-time.
                </p>
                <div className="flex items-center gap-2 pt-2 border-t border-[#E5EAE7] font-mono text-[11px] text-[#3A8067]">
                  <span>Schema: supabase/schema.sql</span>
                  <span>•</span>
                  <span>Mode: Async Replication Queue</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}