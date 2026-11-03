'use client';

import React, { useState } from 'react';
import { BoltIcon } from './icons';
import { api } from '@/lib/api';
import { User } from '@/types';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: User) => void;
}

export function LoginModal({ isOpen, onLoginSuccess }: LoginModalProps) {
  const [email, setEmail] = useState('owner@demo.bd');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (targetEmail?: string) => {
    const loginEmail = targetEmail || email;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/login', {
        email: loginEmail,
        password: 'password123',
      });
      if (res.user) {
        onLoginSuccess(res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const quickRoles = [
    {
      role: 'super_admin',
      label: 'Super Admin',
      email: 'superadmin@gross.bd',
      desc: 'All merchants, system config & audits',
      badge: 'Tier 4',
      bg: 'hover:border-purple-300',
    },
    {
      role: 'admin',
      label: 'Platform Admin',
      email: 'admin@gross.bd',
      desc: 'Multi-merchant oversight & store config',
      badge: 'Tier 3',
      bg: 'hover:border-blue-300',
    },
    {
      role: 'agency_owner',
      label: 'Agency Owner (Tamim)',
      email: 'owner@demo.bd',
      desc: 'Can connect courier, Meta ads & WhatsApp',
      badge: 'Tier 2',
      bg: 'hover:border-lime-400',
    },
    {
      role: 'accountant',
      label: 'Accountant (Karim)',
      email: 'accountant@demo.bd',
      desc: 'Offline misc & product expense + WhatsApp bot',
      badge: 'Tier 1',
      bg: 'hover:border-amber-300',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
      <div className="bg-white border border-stone-200 rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-stone-900 text-[#E5FF44] flex items-center justify-center font-bold text-base shadow-sm">
            <BoltIcon className="w-5 h-5 fill-current" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-stone-900 leading-tight">Gross Management</h2>
            <span className="text-xs text-stone-500">Sign in to your accounting workspace</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        {/* Quick Role Switcher for paired testing */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase font-bold text-stone-600 tracking-wider">
            Quick 4-Tier Hierarchy Sign-In
          </span>
          <div className="grid grid-cols-1 gap-2">
            {quickRoles.map((r) => (
              <button
                key={r.role}
                type="button"
                onClick={() => {
                  setEmail(r.email);
                  handleLogin(r.email);
                }}
                disabled={loading}
                className={`p-3 rounded-xl border border-stone-200 bg-[#FAF8F5] text-left transition flex items-center justify-between ${r.bg} hover:bg-white`}
              >
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-900">{r.label}</span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-stone-200 text-stone-700">
                      {r.badge}
                    </span>
                  </div>
                  <span className="text-[11px] text-stone-500 mt-0.5">{r.desc}</span>
                </div>
                <span className="text-stone-400 text-sm font-bold">&rarr;</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Credentials Option */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
          className="flex flex-col gap-3 pt-3 border-t border-stone-100"
        >
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Email or Phone</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-stone-900"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-stone-900 text-white font-bold text-xs py-2.5 rounded-xl transition hover:bg-black mt-1"
          >
            {loading ? 'Authenticating...' : 'Sign in with credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
