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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/auth/login', {
        email: email.trim(),
        password: password,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4">
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#025033] text-[#CAE4D8] flex items-center justify-center font-bold text-base shadow-sm border border-[#00432C]">
            <BoltIcon className="w-5 h-5 fill-current" />
          </div>
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-[#025033] leading-tight">Gross Management</h2>
            <span className="text-xs text-[#3A8067]">Sign in to your accounting workspace</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-xs rounded-xl font-medium">
            {error}
          </div>
        )}

        {/* Custom Credentials Option */}
        <form
          onSubmit={handleLogin}
          className="flex flex-col gap-3 pt-3 border-t border-[#E5EAE7]"
        >
          <div>
            <label className="block text-xs font-semibold text-[#025033] mb-1">Email or Phone</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#025033] mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#025033] text-[#FFFFFF] font-bold text-xs py-2.5 rounded-xl transition hover:bg-[#05572F] mt-1 shadow-xs"
          >
            {loading ? 'Authenticating...' : 'Sign in with credentials'}
          </button>
        </form>
      </div>
    </div>
  );
}
