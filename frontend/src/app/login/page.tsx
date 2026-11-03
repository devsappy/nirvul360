'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BoltIcon, GoogleIcon, MetaIcon } from '@/components/icons';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.bd');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already logged in, redirect straight to dashboard
  useEffect(() => {
    api
      .get('/api/me')
      .then((res) => {
        if (res?.user) {
          router.replace('/');
        }
      })
      .catch(() => {
        // Not logged in, stay on login page
      });
  }, [router]);

  const handleLogin = async (targetEmail?: string) => {
    const loginEmail = targetEmail || email;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/login', {
        email: loginEmail,
        password: password || 'password123',
      });
      if (res?.ok) {
        router.push('/');
      } else {
        setError('Login failed. Please check your credentials.');
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
      desc: 'Tier 4 • Global audits',
      badge: 'Super Admin',
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      role: 'admin',
      label: 'Platform Admin',
      email: 'admin@gross.bd',
      desc: 'Tier 3 • Store config',
      badge: 'Admin',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    {
      role: 'agency_owner',
      label: 'Agency Owner',
      email: 'owner@demo.bd',
      desc: 'Tier 2 • Tamim (Integrations)',
      badge: 'Agency Owner',
      badgeColor: 'bg-lime-50 text-stone-900 border-lime-300',
    },
    {
      role: 'accountant',
      label: 'Accountant',
      email: 'accountant@demo.bd',
      desc: 'Tier 1 • Karim (Expenses & Bot)',
      badge: 'Accountant',
      badgeColor: 'bg-amber-50 text-amber-800 border-amber-200',
    },
  ];

  return (
    <div className="h-screen w-screen overflow-hidden bg-stone-950 relative flex flex-col md:flex-row select-none m-0 p-0">
      
      {/* LEFT PANEL: Full-Height Architectural Photography & Brand (Desktop 42% width) */}
      <div className="hidden md:flex md:w-[44%] lg:w-[42%] xl:w-[40%] relative h-full flex-col justify-between p-8 lg:p-12 xl:p-14 z-10 overflow-hidden shrink-0">
        {/* Full Architectural Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url('/building.jpg')` }}
        />
        {/* Dark Cinematic Vignette & Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/60 z-0" />

        {/* Top-Left Frosted Glass Badge (Matching Inspiration 'CLASSIC DESIGNS') */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-white/25 bg-black/40 backdrop-blur-md text-white text-[11px] font-black uppercase tracking-widest shadow-xl">
            <BoltIcon className="w-3.5 h-3.5 text-[#E5FF44]" />
            <span>GROSS MANAGEMENT</span>
          </div>
        </div>

        {/* Bottom Hero Statement */}
        <div className="relative z-10 text-white flex flex-col gap-2 mt-auto max-w-md">
          <span className="text-[10px] uppercase tracking-widest text-[#E5FF44] font-black">
            Automated Accounting Engine
          </span>
          <h2 className="text-2xl lg:text-3xl xl:text-4xl font-black text-white leading-tight tracking-tight">
            Engineered for Bangladeshi E-Commerce &amp; F-Commerce
          </h2>
          <p className="text-xs text-stone-300 leading-relaxed font-normal">
            Strict double-entry ledger, real-time courier cashflow tracking, and 4-tier hierarchy control.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL: Pure White Full-Height Surface with Elegant Left Curve */}
      <div className="flex-1 bg-white h-full flex flex-col justify-between overflow-y-auto relative z-20 md:rounded-l-[44px] lg:rounded-l-[60px] p-6 sm:p-10 lg:p-12 xl:p-16 shadow-2xl">
        <div className="max-w-lg w-full mx-auto flex flex-col justify-between h-full py-1">
          
          {/* Top Row: Mobile Logo & Desktop Sign-in Switcher */}
          <div className="flex items-center justify-between md:justify-end gap-3 text-xs font-medium text-stone-500 mb-4 sm:mb-2">
            {/* Mobile-only brand badge */}
            <div className="md:hidden flex items-center gap-2 text-stone-900 font-bold">
              <BoltIcon className="w-4 h-4 text-stone-900" />
              <span>Gross Management</span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">Already have an account?</span>
              <button
                type="button"
                onClick={() => handleLogin('owner@demo.bd')}
                className="px-4 py-1.5 rounded-xl border border-stone-300 hover:border-stone-900 text-stone-900 font-bold transition text-xs shadow-2xs hover:bg-stone-50"
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Form Header */}
          <div className="my-3 sm:my-5">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-stone-900 tracking-tight">
              Sign in to your account
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 mt-1.5 font-medium">
              Strict double-entry books with role-based permissions.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl font-medium leading-relaxed">
              {error}
            </div>
          )}

          {/* Side-by-Side Quick Auth Buttons (Matching Inspiration Pill Style) */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              type="button"
              onClick={() => handleLogin('owner@demo.bd')}
              disabled={loading}
              className="flex items-center justify-center gap-2.5 py-3 px-3 rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition shadow-2xs font-semibold text-xs text-stone-800"
            >
              <GoogleIcon className="w-4 h-4 shrink-0" />
              <span className="truncate">Sign in with Google</span>
            </button>
            <button
              type="button"
              onClick={() => handleLogin('owner@demo.bd')}
              disabled={loading}
              className="flex items-center justify-center gap-2.5 py-3 px-3 rounded-2xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition shadow-2xs font-semibold text-xs text-stone-800"
            >
              <MetaIcon className="w-4 h-4 text-[#1877F2] shrink-0" />
              <span className="truncate">Sign in with Meta</span>
            </button>
          </div>

          {/* Quick 4-Tier Hierarchy Access (1-Click Switcher) */}
          <div className="mb-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-stone-500 tracking-wider">
                Quick 4-Tier Hierarchy Access:
              </span>
              <span className="text-[10px] text-stone-400 font-semibold">Click to enter as</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {quickRoles.map((r) => (
                <button
                  key={r.role}
                  type="button"
                  onClick={() => {
                    setEmail(r.email);
                    setPassword('password123');
                    handleLogin(r.email);
                  }}
                  disabled={loading}
                  className="p-3 rounded-xl border border-stone-200/80 bg-[#FAF8F5] text-left transition hover:bg-white hover:border-stone-400 hover:shadow-2xs flex flex-col justify-between group"
                >
                  <div className="flex items-center justify-between gap-1 w-full">
                    <span className="text-xs font-bold text-stone-900 truncate">{r.label}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md border ${r.badgeColor} shrink-0`}>
                      {r.badge}
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-500 truncate mt-1">{r.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Unified Form Input Well (Matching Inspiration Box Style) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="flex flex-col gap-3.5"
          >
            <div className="rounded-2xl border border-stone-200 bg-white shadow-2xs overflow-hidden divide-y divide-stone-100">
              <div className="p-3.5 sm:p-4">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Email Address or Phone Number
                </label>
                <input
                  type="text"
                  placeholder="owner@demo.bd or 01711000001"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-none font-medium bg-transparent"
                />
              </div>

              <div className="p-3.5 sm:p-4">
                <label className="block text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1">
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-none font-medium bg-transparent font-mono"
                />
              </div>
            </div>

            {/* Dark Primary Action Button (Matching Inspiration Dark Pill Style) */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1C2030] hover:bg-[#121624] text-white font-bold text-xs sm:text-sm py-3.5 sm:py-4 rounded-xl transition shadow-md flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 border-stone-400 border-t-white animate-spin" />
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Bottom Micro Copy */}
          <div className="pt-4 text-center">
            <p className="text-[11px] text-stone-400 font-medium">
              Non-negotiable double-entry ledger &bull; Asia/Dhaka (UTC+6) &bull; Supabase synced
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}