'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BoltIcon, GoogleIcon, MetaIcon } from '@/components/icons';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'register'>('signin');

  // Sign-in form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regStoreName, setRegStoreName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

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

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email or phone number and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/login', {
        email: email.trim(),
        password: password,
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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || regName.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).');
      return;
    }
    if (!regEmail.trim() || !regEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (regPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/register', {
        name: regName.trim(),
        store_name: regStoreName.trim() || undefined,
        email: regEmail.trim().toLowerCase(),
        phone: regPhone.trim() || undefined,
        password: regPassword,
      });
      if (res?.ok) {
        // Automatically authenticated via session cookie
        router.push('/');
      } else {
        setError(res?.detail || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#00432C] relative flex flex-col md:flex-row select-none m-0 p-0">
      
      {/* LEFT PANEL: Brand & Architectural Photography (Desktop 42% width) */}
      <div className="hidden md:flex md:w-[44%] lg:w-[42%] xl:w-[40%] relative h-full flex-col justify-between p-8 lg:p-12 xl:p-14 z-10 overflow-hidden shrink-0 bg-[#025033]">
        {/* Full Architectural Background Image with solid monochromatic overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
          style={{ backgroundImage: `url('/building.jpg')` }}
        />
        {/* Solid Monochromatic Overlay */}
        <div className="absolute inset-0 bg-[#00432C]/80 z-0" />

        {/* Top-Left Frosted Brand Badge */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#3A8067] bg-[#00432C]/80 backdrop-blur-md text-[#FFFFFF] text-xs font-black uppercase tracking-widest shadow-xl">
            <BoltIcon className="w-4 h-4 text-[#CAE4D8]" />
            <span>NIRVUL360</span>
          </div>
        </div>

        {/* Bottom Hero Statement */}
        <div className="relative z-10 text-[#FFFFFF] flex flex-col gap-2.5 mt-auto max-w-md">
          <span className="text-xs uppercase tracking-widest text-[#CAE4D8] font-black">
            Automated Accounting Engine
          </span>
          <h2 className="text-3xl lg:text-4xl xl:text-5xl font-black text-[#FFFFFF] leading-tight tracking-tight">
            Engineered for Bangladeshi E-Commerce &amp; F-Commerce
          </h2>
          <p className="text-sm text-[#CAE4D8] leading-relaxed font-normal mt-1">
            Strict double-entry ledger, real-time courier cashflow tracking, and multi-tenant hierarchy control.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL: Off White & Pure White Surface with Left Curve */}
      <div className="flex-1 bg-[#FAFCF9] h-full flex flex-col justify-between overflow-y-auto relative z-20 md:rounded-l-[44px] lg:rounded-l-[60px] p-6 sm:p-10 lg:p-12 xl:p-16 shadow-2xl border-l border-[#E5EAE7]">
        <div className="max-w-lg w-full mx-auto flex flex-col justify-between h-full py-1">
          
          {/* Top Row: Mobile Logo & Desktop Sign-in / Create Switcher */}
          <div className="flex items-center justify-between md:justify-end gap-3 text-sm font-medium text-[#3A8067] mb-3 sm:mb-2">
            {/* Mobile-only brand badge */}
            <div className="md:hidden flex items-center gap-2 text-[#025033] font-bold text-base">
              <BoltIcon className="w-5 h-5 text-[#025033]" />
              <span>nirvul360</span>
            </div>
            
            {mode === 'signin' ? (
              <div className="flex items-center gap-2.5">
                <span className="hidden sm:inline text-sm text-[#3A8067]">Need a merchant account?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#025033] bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] font-bold transition text-xs shadow-2xs"
                >
                  Create Account
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <span className="hidden sm:inline text-sm text-[#3A8067]">Already have an account?</span>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-[#025033] bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] font-bold transition text-xs shadow-2xs"
                >
                  Sign In
                </button>
              </div>
            )}
          </div>

          {/* Form Header */}
          <div className="my-2 sm:my-3">
            <h1 className="text-3xl sm:text-4xl font-black text-[#025033] tracking-tight">
              {mode === 'signin' ? 'Sign in to your account' : 'Create new merchant account'}
            </h1>
            <p className="text-sm sm:text-base text-[#3A8067] mt-1 font-medium">
              {mode === 'signin'
                ? 'Strict double-entry books with role-based permissions.'
                : 'Start tracking orders, courier cashflow, and confirmed net profits.'}
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#E5EAE7]/70 rounded-2xl mb-4 border border-[#E5EAE7]">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
              }}
              className={`py-2.5 text-sm font-bold rounded-xl transition ${
                mode === 'signin'
                  ? 'bg-[#FFFFFF] text-[#025033] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2.5 text-sm font-bold rounded-xl transition ${
                mode === 'register'
                  ? 'bg-[#FFFFFF] text-[#025033] shadow-xs'
                  : 'text-[#3A8067] hover:text-[#025033]'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3.5 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-sm rounded-xl font-medium leading-relaxed">
              {error}
            </div>
          )}

          {/* SIGN IN FORM */}
          {mode === 'signin' ? (
            <>
              {/* Side-by-Side Quick Auth Buttons */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setError('Google SSO is not configured for this instance. Please enter your email and password below.')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2.5 py-3 px-3.5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:bg-[#E6F7EF] hover:border-[#3A8067] transition shadow-2xs font-semibold text-xs sm:text-sm text-[#025033]"
                >
                  <GoogleIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">Sign in with Google</span>
                </button>
                <button
                  type="button"
                  onClick={() => setError('Meta SSO is not configured for this instance. Please enter your email and password below.')}
                  disabled={loading}
                  className="flex items-center justify-center gap-2.5 py-3 px-3.5 rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] hover:bg-[#E6F7EF] hover:border-[#3A8067] transition shadow-2xs font-semibold text-xs sm:text-sm text-[#025033]"
                >
                  <MetaIcon className="w-4 h-4 text-[#025033] shrink-0" />
                  <span className="truncate">Sign in with Meta</span>
                </button>
              </div>

              {/* Input Fields */}
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] shadow-2xs overflow-hidden divide-y divide-[#E5EAE7]">
                  <div className="p-4 sm:p-5">
                    <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                      Email Address or Phone Number
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. owner@demo.bd or 01711000001"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      className="w-full text-sm sm:text-base text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent"
                    />
                  </div>

                  <div className="p-4 sm:p-5">
                    <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                      Password
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full text-sm sm:text-base text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm px-1">
                  <label className="flex items-center gap-2 text-[#3A8067] cursor-pointer">
                    <input
                      type="checkbox"
                      defaultChecked
                      className="rounded border-[#E5EAE7] text-[#025033] focus:ring-0"
                    />
                    <span className="text-xs sm:text-sm font-medium">Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(null);
                    }}
                    className="text-xs sm:text-sm font-bold text-[#025033] hover:underline"
                  >
                    Need an account?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] font-bold text-sm sm:text-base py-4 rounded-xl transition shadow-md flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-5 h-5 rounded-full border-2 border-[#CAE4D8] border-t-[#FFFFFF] animate-spin" />
                  ) : (
                    <span>Sign In</span>
                  )}
                </button>
              </form>
            </>
          ) : (
            /* CREATE ACCOUNT FORM */
            <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
              <div className="rounded-2xl border border-[#E5EAE7] bg-[#FFFFFF] shadow-2xs overflow-hidden divide-y divide-[#E5EAE7]">
                <div className="p-3.5 sm:p-4">
                  <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Tamim Ahmed"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    required
                    className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent"
                  />
                </div>

                <div className="p-3.5 sm:p-4">
                  <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                    Store or Business Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Artisan Wear Bangladesh"
                    value={regStoreName}
                    onChange={(e) => setRegStoreName(e.target.value)}
                    className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent"
                  />
                </div>

                <div className="p-3.5 sm:p-4">
                  <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. merchant@store.bd"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent"
                  />
                </div>

                <div className="p-3.5 sm:p-4">
                  <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                    Phone / WhatsApp (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 01711000000"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#E5EAE7]">
                  <div className="p-3.5 sm:p-4">
                    <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                      Password (min 6) *
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent font-mono"
                    />
                  </div>

                  <div className="p-3.5 sm:p-4">
                    <label className="block text-xs font-bold text-[#3A8067] uppercase tracking-wider mb-1.5">
                      Confirm Password *
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••••••"
                      value={regConfirmPassword}
                      onChange={(e) => setRegConfirmPassword(e.target.value)}
                      required
                      className="w-full text-sm text-[#025033] placeholder-[#3A8067] focus:outline-none font-medium bg-transparent font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="text-xs text-[#3A8067] px-1 font-medium">
                Your account will be provisioned with Agency Owner privileges and a default cash account.
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] font-bold text-sm sm:text-base py-4 rounded-xl transition shadow-md flex items-center justify-center gap-2 mt-1 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-5 h-5 rounded-full border-2 border-[#CAE4D8] border-t-[#FFFFFF] animate-spin" />
                ) : (
                  <span>Create Account &amp; Launch Dashboard</span>
                )}
              </button>
            </form>
          )}

          {/* Bottom Micro Copy */}
          <div className="pt-3 text-center">
            <p className="text-xs text-[#3A8067] font-medium">
              Non-negotiable double-entry ledger &bull; Asia/Dhaka (UTC+6) &bull; Supabase synced
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
