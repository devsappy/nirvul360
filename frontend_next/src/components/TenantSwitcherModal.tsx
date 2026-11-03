'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { ShieldIcon, SearchIcon, CheckIcon } from './icons';

interface Tenant {
  id: number;
  name: string;
  owner: {
    name: string;
    email: string | null;
  };
  metrics: {
    total_orders: number;
    total_gmv: number;
  };
}

interface TenantSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTenant: (merchantId: number, merchantName: string) => void;
  activeMerchantId?: number;
}

export function TenantSwitcherModal({
  isOpen,
  onClose,
  onSelectTenant,
  activeMerchantId,
}: TenantSwitcherModalProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api
      .get<{ tenants: Tenant[] }>('/api/admin/tenants')
      .then((res) => setTenants(res.tenants || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filtered = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.owner.name && t.owner.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-stone-200 flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150">
        
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-900 text-[#E5FF44] flex items-center justify-center">
              <ShieldIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm">Switch Tenant Dashboard</h3>
              <p className="text-[11px] text-stone-500">Developer impersonation mode</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full hover:bg-stone-100 text-stone-400 flex items-center justify-center font-bold text-lg"
          >
            &times;
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search stores or owners..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl pl-8 pr-3 py-2 text-xs text-stone-800 focus:outline-none focus:border-stone-900 font-medium"
          />
        </div>

        {/* Tenant List */}
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {loading && (
            <div className="py-8 text-center text-xs text-stone-400">Loading tenants...</div>
          )}

          {!loading &&
            filtered.map((t) => {
              const isSelected = t.id === activeMerchantId;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectTenant(t.id, t.name);
                    onClose();
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition ${
                    isSelected
                      ? 'bg-purple-50 border-purple-300 ring-1 ring-purple-200'
                      : 'bg-white border-stone-200 hover:border-stone-400 hover:bg-[#FAF8F5]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-stone-900 text-[#E5FF44] font-black text-xs flex items-center justify-center shrink-0">
                      {t.name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-stone-900 text-xs">{t.name}</span>
                        <span className="text-[10px] text-stone-400 font-mono">#{t.id}</span>
                      </div>
                      <span className="text-[11px] text-stone-500">
                        Owner: {t.owner.name} &bull; {t.metrics.total_orders} orders
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckIcon className="w-3 h-3" /> Active
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-400">
          <span>All metrics scope to chosen tenant</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl text-stone-600 hover:bg-stone-100 font-semibold"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
