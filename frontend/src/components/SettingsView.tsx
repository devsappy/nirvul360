'use client';

import React, { useState, useEffect } from 'react';
import { apiSettings, formatTaka, getApiBaseUrl } from '@/lib/api';
import { MerchantSettingsResponse, CashAccountItem } from '@/types';

interface SettingsViewProps {
  merchant?: { id: number; name: string } | null;
  onRefresh?: () => void;
}

export function SettingsView({ merchant, onRefresh }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'tax' | 'fiscal' | 'billing' | 'export' | 'danger'>('profile');
  const [settings, setSettings] = useState<MerchantSettingsResponse | null>(null);
  const [cashAccounts, setCashAccounts] = useState<CashAccountItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState('');

  // Editable Form States
  const [businessName, setBusinessName] = useState('');
  const [legalEntity, setLegalEntity] = useState('');
  const [tradeLicense, setTradeLicense] = useState('');
  const [bin, setBin] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [vatNumber, setVatNumber] = useState('');
  const [vatRate, setVatRate] = useState(0);
  const [commissionerate, setCommissionerate] = useState('');

  const [yearStart, setYearStart] = useState('1 July');
  const [timezone, setTimezone] = useState('Asia/Dhaka (UTC+06:00)');
  const [booksClose, setBooksClose] = useState('Last day of each month');

  // Close account danger state
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isClosingAccount, setIsClosingAccount] = useState(false);

  // Add Cash Account State
  const [cashModalOpen, setCashModalOpen] = useState(false);
  const [newCashName, setNewCashName] = useState('');
  const [newCashKind, setNewCashKind] = useState<'bank' | 'bkash' | 'nagad' | 'cash'>('bank');
  const [newCashOpening, setNewCashOpening] = useState('');
  const [isAddingCash, setIsAddingCash] = useState(false);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [settRes, cashRes] = await Promise.all([
        apiSettings.getSettings(),
        apiSettings.getCashAccounts(),
      ]);
      setSettings(settRes);
      setCashAccounts(cashRes.accounts || []);

      const p = settRes.business_profile;
      setBusinessName(p?.business_name || merchant?.name || '');
      setLegalEntity(p?.legal_entity || '');
      setTradeLicense(p?.trade_license || '');
      setBin(p?.bin || '');
      setAddress(p?.address || '');
      setPhone(p?.phone || '');
      setEmail(p?.email || '');

      const v = settRes.vat_tax;
      setVatNumber(v.registration_number || '');
      setVatRate(v.sales_rate || 0);
      setCommissionerate(v.commissionerate || '');

      const f = settRes.fiscal;
      setYearStart(f.year_start || '1 July');
      setTimezone(f.timezone || 'Asia/Dhaka (UTC+06:00)');
      setBooksClose(f.books_close || 'Last day of each month');
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  }, [merchant?.name]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess('');
    try {
      await apiSettings.updateSettings({
        business_profile: {
          business_name: businessName,
          legal_entity: legalEntity,
          trade_license: tradeLicense,
          bin,
          address,
          phone,
          email,
        },
        vat_tax: {
          registration_number: vatNumber,
          sales_rate: vatRate,
          commissionerate,
          active: Boolean(vatNumber.trim()),
        },
        fiscal: {
          year_start: yearStart,
          timezone,
          books_close: booksClose,
        },
      });
      setSaveSuccess('Settings saved successfully.');
      setTimeout(() => setSaveSuccess(''), 3000);
      onRefresh?.();
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    loadData();
  };

  const handleCloseAccount = async () => {
    if (confirmationInput.trim() !== businessName.trim()) return;
    if (!confirm('Are you ABSOLUTELY certain? All store data will be deleted permanently.')) return;

    setIsClosingAccount(true);
    try {
      await apiSettings.closeAccount(confirmationInput.trim());
      alert('Your account has been closed.');
      window.location.href = '/login';
    } catch (err: any) {
      alert(err.message || 'Failed to close account');
    } finally {
      setIsClosingAccount(false);
    }
  };

  const handleAddCashAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCashName.trim()) return;
    setIsAddingCash(true);
    try {
      await apiSettings.createCashAccount({
        name: newCashName.trim(),
        kind: newCashKind,
        opening_balance: parseFloat(newCashOpening) || 0,
      });
      setCashModalOpen(false);
      setNewCashName('');
      setNewCashOpening('');
      const cashRes = await apiSettings.getCashAccounts();
      setCashAccounts(cashRes.accounts || []);
    } catch (err: any) {
      alert(err.message || 'Failed to add cash account');
    } finally {
      setIsAddingCash(false);
    }
  };

  const downloadExport = (endpoint: string) => {
    const base = getApiBaseUrl();
    window.open(`${base}${endpoint}`, '_blank');
  };

  const lastChanged = settings?.last_changed_at || 'Recently';
  const dataSynced = settings?.data_synced_at || 'Recently';

  if (loading && !settings) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {businessName} · settings last changed {lastChanged} · account data synced {dataSynced}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saveSuccess && (
            <span className="text-xs text-emerald-800 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              ✓ {saveSuccess}
            </span>
          )}
          <button
            onClick={handleDiscard}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Discard changes
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* 2-Column Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Vertical Tabs (~22% width / col-span-3) */}
        <div className="lg:col-span-3 flex flex-col gap-1 bg-white border border-slate-200 rounded-2xl p-2.5 shadow-2xs">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'profile'
                ? 'bg-[#E6F7EF] text-[#025033] font-bold border-l-4 border-[#025033]'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Business profile
          </button>
          <button
            onClick={() => setActiveTab('tax')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'tax'
                ? 'bg-[#E6F7EF] text-[#025033] font-bold border-l-4 border-[#025033]'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            VAT &amp; tax
          </button>
          <button
            onClick={() => setActiveTab('fiscal')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'fiscal'
                ? 'bg-[#E6F7EF] text-[#025033] font-bold border-l-4 border-[#025033]'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Fiscal year &amp; timezone
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'billing'
                ? 'bg-[#E6F7EF] text-[#025033] font-bold border-l-4 border-[#025033]'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Subscription &amp; billing
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'export'
                ? 'bg-[#E6F7EF] text-[#025033] font-bold border-l-4 border-[#025033]'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Data export
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
              activeTab === 'danger'
                ? 'bg-rose-50 text-rose-800 font-bold border-l-4 border-rose-600'
                : 'text-rose-700 hover:bg-rose-50/60'
            }`}
          >
            Close account
          </button>
        </div>

        {/* Right Side: Tab Content (~78% width / col-span-9) */}
        <div className="lg:col-span-9 flex flex-col gap-6">
          {/* Tab 1: Business Profile */}
          {activeTab === 'profile' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900">Business profile</span>
                  <span className="text-xs text-slate-500">Shown on exports, invoices, and the tax pack</span>
                </div>
                <span className="text-[10px] font-semibold text-slate-400">Merchant details</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Business name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Legal entity</label>
                  <input
                    type="text"
                    value={legalEntity}
                    onChange={(e) => setLegalEntity(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Trade licence number</label>
                  <input
                    type="text"
                    value={tradeLicense}
                    onChange={(e) => setTradeLicense(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">BIN (Business Identification Number)</label>
                  <input
                    type="text"
                    value={bin}
                    onChange={(e) => setBin(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600">Registered address</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Phone</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: VAT & Tax */}
          {activeTab === 'tax' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900">VAT &amp; tax</span>
                  <span className="text-xs text-slate-500">These fields exist so the tax pack is ready when you register</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {vatNumber ? 'Active' : 'Not in use yet'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">VAT registration number</label>
                  <input
                    type="text"
                    placeholder="Not in use yet"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">VAT rate applied to sales (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={vatRate || ''}
                    onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">VAT circle / commissionerate</label>
                  <input
                    type="text"
                    placeholder="Not in use yet"
                    value={commissionerate}
                    onChange={(e) => setCommissionerate(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                No VAT is added to any invoice and no VAT appears in the profit and loss while these are empty. Filling them in changes future entries only — nothing already recorded is recalculated.
              </div>
            </div>
          )}

          {/* Tab 3: Fiscal year & timezone & Cash Accounts */}
          {activeTab === 'fiscal' && (
            <div className="flex flex-col gap-6">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Fiscal year &amp; timezone</span>
                    <span className="text-xs text-slate-500">Used by every financial report and the daily WhatsApp digest</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600">Fiscal year starts</label>
                    <select
                      value={yearStart}
                      onChange={(e) => setYearStart(e.target.value)}
                      className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    >
                      <option value="1 July">1 July (BD Standard)</option>
                      <option value="1 January">1 January</option>
                      <option value="1 April">1 April</option>
                      <option value="1 October">1 October</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    >
                      <option value="Asia/Dhaka (UTC+06:00)">Asia/Dhaka (UTC+06:00)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-semibold text-slate-600">Books close on</label>
                    <select
                      value={booksClose}
                      onChange={(e) => setBooksClose(e.target.value)}
                      className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                    >
                      <option value="Last day of each month">Last day of each month</option>
                      <option value="15th of each month">15th of each month</option>
                      <option value="Never">Never</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                  Current fiscal year: 1 July 2026 – 30 June 2027. Entries dated before a closed month need an owner&apos;s approval.
                </div>
              </div>

              {/* Cash Accounts List */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Cash &amp; bank accounts</span>
                    <span className="text-xs text-slate-500">Wallets and bank accounts where sales settle and payments originate</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCashModalOpen(true)}
                    className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-3 py-1.5 rounded-xl text-xs font-semibold shadow-xs"
                  >
                    + Add account
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                        <th className="py-2 px-3">ACCOUNT NAME</th>
                        <th className="py-2 px-3">KIND</th>
                        <th className="py-2 px-3">DEFAULT</th>
                        <th className="py-2 px-3 text-right">LIVE BALANCE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-normal">
                      {cashAccounts.map((ca) => (
                        <tr key={ca.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{ca.name}</td>
                          <td className="py-2.5 px-3 text-slate-500 capitalize">{ca.kind}</td>
                          <td className="py-2.5 px-3">
                            {ca.is_default && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033]">
                                Default
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatTaka(ca.balance_poisha)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Subscription & Billing */}
          {activeTab === 'billing' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900">Subscription &amp; billing</span>
                  <span className="text-xs text-slate-500">Plan details and billing method</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                  Active
                </span>
              </div>

              {(() => {
                const defaultAccount = cashAccounts.find((a) => a.is_default) || cashAccounts[0];
                const defaultPaymentMethod = defaultAccount
                  ? `${defaultAccount.kind === 'bkash' ? 'bKash' : defaultAccount.kind.charAt(0).toUpperCase() + defaultAccount.kind.slice(1)} · ending ${defaultAccount.name.slice(-4)}`
                  : 'No payment method on file';
                const rawMethod = settings?.subscription?.payment_method;
                const paymentMethodDisplay = rawMethod || defaultPaymentMethod;

                const ordersLimit = settings?.subscription?.orders_limit;
                const ordersUsed = settings?.subscription?.orders_used ?? 0;
                const usagePercent = ordersLimit && ordersLimit > 0
                  ? Math.min(100, (ordersUsed / ordersLimit) * 100)
                  : 0;

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Plan:</span>
                        <span className="font-bold text-slate-900">{settings?.subscription?.plan_label || '—'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Price:</span>
                        <span className="font-bold text-slate-900">
                          {settings?.subscription?.price_taka_month !== undefined
                            ? `৳${settings.subscription.price_taka_month} / month`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Next charge:</span>
                        <span className="font-semibold text-slate-800">{settings?.subscription?.next_charge_date || '—'}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-500">Method:</span>
                        <span className="font-semibold text-slate-800">{paymentMethodDisplay}</span>
                      </div>
                    </div>

                    {/* Order usage meter */}
                    <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-100">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-700">Orders this month:</span>
                        <span className="text-slate-900">{ordersUsed} of {ordersLimit !== undefined ? ordersLimit : '—'}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-[#062E1F] h-2 rounded-full transition-all"
                          style={{
                            width: `${usagePercent}%`,
                          }}
                        />
                      </div>
                    </div>
                  </>
                );
              })()}

              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => alert('Opening invoice history')}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Invoices
                </button>
                <button
                  type="button"
                  onClick={() => alert('Plan change wizard')}
                  className="px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Change plan
                </button>
              </div>
            </div>
          )}

          {/* Tab 5: Data Export */}
          {activeTab === 'export' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-slate-900">Data export</span>
                  <span className="text-xs text-slate-500">Yours to take, any time, with immutable provenance tags</span>
                </div>
              </div>

              <div className="flex flex-col divide-y divide-slate-100 text-xs">
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Full ledger, all entries with sources</span>
                    <span className="text-[11px] text-slate-500">Every journal line with origin tags and accounts</span>
                  </div>
                  <button
                    onClick={() => downloadExport('/api/export/ledger')}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 shadow-2xs"
                  >
                    CSV
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Orders, settlements and returns</span>
                    <span className="text-[11px] text-slate-500">Order timeline, parcel delivery status and fees</span>
                  </div>
                  <button
                    onClick={() => downloadExport('/api/export/orders')}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 shadow-2xs"
                  >
                    CSV
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Products with full cost price history</span>
                    <span className="text-[11px] text-slate-500">Versioned dated purchase costs and current stock on hand</span>
                  </div>
                  <button
                    onClick={() => downloadExport('/api/export/products')}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 shadow-2xs"
                  >
                    CSV
                  </button>
                </div>

                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-800">Everything, as a single archive</span>
                    <span className="text-[11px] text-slate-500">Full tenant zip package with SQLite/JSON snapshot</span>
                  </div>
                  <button
                    onClick={() => alert('Archive export request queued. Download link will be sent to owner email.')}
                    className="px-3 py-1.5 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-bold shadow-2xs"
                  >
                    Request
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                Exports carry the source tag on every row, so another accountant can check where each figure came from.
              </div>
            </div>
          )}

          {/* Tab 6: Close Account Danger Zone */}
          {activeTab === 'danger' && (
            <div className="bg-[#FFF5F5] border border-red-300 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-red-200">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-red-950">Close account</span>
                  <span className="text-xs text-red-700">Permanent data destruction safeguards</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-700 text-white">
                  Permanent
                </span>
              </div>

              <p className="text-xs text-red-800 leading-relaxed">
                Closing removes {settings?.subscription?.stores_count && settings.subscription.stores_count > 1 ? `all ${settings.subscription.stores_count} stores` : 'this store'}, all associated ledger entries and every connected source. Download your export first — we cannot restore the data afterwards.
              </p>

              <div className="flex flex-col gap-1.5 pt-1">
                <label className="text-xs font-bold text-red-950">
                  Type the store name <code className="bg-red-100 px-1.5 py-0.5 rounded text-red-900">{businessName}</code> to confirm:
                </label>
                <input
                  type="text"
                  placeholder={businessName}
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  className="text-xs px-3 py-2 border border-red-300 rounded-xl focus:outline-none focus:ring-1 focus:ring-red-600 bg-white"
                />
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={confirmationInput.trim() !== businessName.trim() || isClosingAccount}
                  onClick={handleCloseAccount}
                  className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold shadow-xs transition disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isClosingAccount ? 'Closing...' : 'Close this account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Cash Account Modal */}
      {cashModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add Cash / Bank Account</h3>
              <button onClick={() => setCashModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleAddCashAccount} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Account Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. City Bank Primary / bKash Merchant"
                  value={newCashName}
                  onChange={(e) => setNewCashName(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Kind</label>
                <select
                  value={newCashKind}
                  onChange={(e) => setNewCashKind(e.target.value as any)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  <option value="bank">Bank account</option>
                  <option value="bkash">bKash wallet</option>
                  <option value="nagad">Nagad wallet</option>
                  <option value="cash">Cash in hand</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Opening Balance (৳)</label>
                <input
                  type="number"
                  placeholder="0"
                  value={newCashOpening}
                  onChange={(e) => setNewCashOpening(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCashModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingCash}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold"
                >
                  {isAddingCash ? 'Saving...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
