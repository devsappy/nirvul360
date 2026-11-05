'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { PlatformUser, PlatformUsersResponse, UserRole } from '@/types';
import {
  ShieldIcon,
  RefreshIcon,
  SearchIcon,
  UsersIcon,
  UserCheckIcon,
  StoreIcon,
  ActivityIcon,
  CheckIcon,
} from './icons';

interface SuperAdminUsersViewProps {
  onRefreshParent?: () => void;
}

export function SuperAdminUsersView({ onRefreshParent }: SuperAdminUsersViewProps) {
  const [data, setData] = useState<PlatformUsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'status' | 'name' | 'role' | 'recent'>('status');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);

  const loadUsersData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PlatformUsersResponse>('/api/admin/users');
      setData(res);
      if (onRefreshParent) {
        onRefreshParent();
      }
    } catch (err) {
      console.error('Failed to load platform users:', err);
    } finally {
      setLoading(false);
    }
  }, [onRefreshParent]);

  useEffect(() => {
    loadUsersData();
    // 15-second real-time polling fallback
    const interval = setInterval(loadUsersData, 15000);
    return () => clearInterval(interval);
  }, [loadUsersData]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const timeAgo = (iso: string | null) => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      const days = Math.floor(diffSec / 86400);
      if (days === 1) return 'Yesterday';
      if (days < 30) return `${days}d ago`;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const roleBadgeStyle = (role: UserRole | string) => {
    switch (role) {
      case 'super_admin':
        return {
          label: 'Super Admin',
          bg: 'bg-[#025033] border-[#00432C] text-[#FFFFFF]',
          dot: 'bg-[#CAE4D8]',
        };
      case 'admin':
        return {
          label: 'Platform Admin',
          bg: 'bg-[#05572F] border-[#3A8067] text-[#FFFFFF]',
          dot: 'bg-[#CAE4D8]',
        };
      case 'agency_owner':
      case 'owner':
        return {
          label: 'Agency Owner',
          bg: 'bg-[#CAE4D8] border-[#3A8067] text-[#025033]',
          dot: 'bg-[#025033]',
        };
      case 'accountant':
        return {
          label: 'Accountant',
          bg: 'bg-[#E6F7EF] border-[#CAE4D8] text-[#025033]',
          dot: 'bg-[#3A8067]',
        };
      default:
        return {
          label: role,
          bg: 'bg-[#FAFCF9] border-[#E5EAE7] text-[#025033]',
          dot: 'bg-[#3A8067]',
        };
    }
  };

  const uniqueMerchants = useMemo(() => {
    if (!data?.users) return [];
    const map = new Map<number, string>();
    data.users.forEach((u) => {
      if (u.merchant_id && u.merchant_name) {
        map.set(u.merchant_id, u.merchant_name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];

    return data.users
      .filter((u) => {
        // Status filter
        if (statusFilter === 'active' && !u.is_active) return false;
        if (statusFilter === 'inactive' && u.is_active) return false;

        // Role filter
        if (roleFilter !== 'all') {
          if (roleFilter === 'agency_owner' || roleFilter === 'owner') {
            if (u.role !== 'agency_owner' && (u.role as string) !== 'owner') return false;
          } else if (u.role !== roleFilter) {
            return false;
          }
        }

        // Tenant filter
        if (tenantFilter !== 'all' && String(u.merchant_id) !== tenantFilter) {
          return false;
        }

        // Search Query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchesName = u.name.toLowerCase().includes(q);
          const matchesEmail = u.email ? u.email.toLowerCase().includes(q) : false;
          const matchesPhone = u.whatsapp ? u.whatsapp.toLowerCase().includes(q) : false;
          const matchesStore = u.merchant_name ? u.merchant_name.toLowerCase().includes(q) : false;
          const matchesRole = u.role_label.toLowerCase().includes(q);
          return matchesName || matchesEmail || matchesPhone || matchesStore || matchesRole;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'status') {
          if (a.is_active && !b.is_active) return -1;
          if (!a.is_active && b.is_active) return 1;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'name') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'role') {
          const rankMap: Record<string, number> = {
            super_admin: 4,
            admin: 3,
            agency_owner: 2,
            owner: 2,
            accountant: 1,
          };
          return (rankMap[b.role] || 0) - (rankMap[a.role] || 0);
        }
        if (sortBy === 'recent') {
          const timeA = a.last_active ? new Date(a.last_active).getTime() : 0;
          const timeB = b.last_active ? new Date(b.last_active).getTime() : 0;
          return timeB - timeA;
        }
        return 0;
      });
  }, [data, searchQuery, statusFilter, roleFilter, tenantFilter, sortBy]);

  const summary = data?.summary || {
    total_users: 0,
    active_users: 0,
    inactive_users: 0,
    active_percentage: 0,
    roles: { super_admin: 0, admin: 0, agency_owner: 0, accountant: 0 },
    total_merchants: 0,
  };

  return (
    <div className="flex flex-col gap-8 pb-16">
      
      {/* 1. Super Admin Hero Header */}
      <div className="bg-[#025033] text-[#FFFFFF] rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xl border border-[#00432C]">
        <div className="flex flex-col gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#05572F] border border-[#3A8067] text-[#CAE4D8] text-[11px] font-bold tracking-wider uppercase w-fit">
            <ShieldIcon className="w-3.5 h-3.5 text-[#CAE4D8]" />
            <span>Super Administrator Control Tower</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[#FFFFFF]">
            Platform Users &amp; Live Session Telemetry
          </h1>
          <p className="text-xs sm:text-sm text-[#CAE4D8] font-medium max-w-xl">
            Real-time oversight of all platform users, active login sessions, hierarchy roles, and tenant organization accounts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00432C] border border-[#05572F] text-xs font-semibold text-[#FFFFFF]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#CAE4D8] animate-pulse" />
            <span>Real-time Active</span>
          </div>

          <button
            onClick={loadUsersData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#05572F] hover:bg-[#00432C] text-[#FFFFFF] text-xs font-bold transition border border-[#3A8067] shadow-xs"
          >
            <RefreshIcon className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Platform User Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Total Platform Users */}
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">
              Total Platform Users
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#E6F7EF] text-[#025033] flex items-center justify-center border border-[#CAE4D8]">
              <UsersIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <span className="text-3xl font-black text-[#025033]">{summary.total_users}</span>
            <span className="text-xs font-semibold text-[#3A8067] ml-2">Registered Accounts</span>
          </div>
          <div className="text-[11px] text-[#3A8067] flex items-center gap-1.5 pt-2 border-t border-[#E5EAE7]">
            <StoreIcon className="w-3.5 h-3.5 text-[#3A8067]" />
            <span>Across <strong className="text-[#025033]">{summary.total_merchants}</strong> tenant stores</span>
          </div>
        </div>

        {/* Card 2: Active Users Online */}
        <div className="bg-[#FFFFFF] border border-[#CAE4D8] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#025033] uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#025033] animate-pulse" />
              Active Users Now
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#E6F7EF] text-[#025033] flex items-center justify-center border border-[#CAE4D8]">
              <UserCheckIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5 flex items-baseline gap-2">
            <span className="text-3xl font-black text-[#025033]">{summary.active_users}</span>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              {summary.active_percentage}% Online
            </span>
          </div>
          <div className="text-[11px] text-[#3A8067] pt-2 border-t border-[#E5EAE7] flex items-center justify-between">
            <span>Valid active sessions</span>
            <span className="font-bold text-[#025033]">Live SSE</span>
          </div>
        </div>

        {/* Card 3: Inactive / Offline Accounts */}
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#3A8067] uppercase tracking-wider">
              Offline / Inactive Users
            </span>
            <div className="w-8 h-8 rounded-xl bg-[#FAFCF9] text-[#3A8067] flex items-center justify-center border border-[#E5EAE7]">
              <ActivityIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="my-2.5">
            <span className="text-3xl font-black text-[#025033]">{summary.inactive_users}</span>
            <span className="text-xs font-medium text-[#3A8067] ml-2">No Active Session</span>
          </div>
          <div className="text-[11px] text-[#3A8067] pt-2 border-t border-[#E5EAE7]">
            <span>Session expired or logged out</span>
          </div>
        </div>

        {/* Card 4: Hierarchy Role Breakdown */}
        <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#025033] uppercase tracking-wider">
              Role Distribution
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              4 Tiers
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 my-2">
            <div className="bg-[#025033] border border-[#00432C] rounded-xl p-2 flex items-center justify-between text-[#FFFFFF]">
              <span className="text-[10px] font-bold text-[#CAE4D8]">Super Admin</span>
              <strong className="text-xs font-black text-[#FFFFFF]">{summary.roles?.super_admin || 0}</strong>
            </div>
            <div className="bg-[#05572F] border border-[#3A8067] rounded-xl p-2 flex items-center justify-between text-[#FFFFFF]">
              <span className="text-[10px] font-bold text-[#CAE4D8]">Admin</span>
              <strong className="text-xs font-black text-[#FFFFFF]">{summary.roles?.admin || 0}</strong>
            </div>
            <div className="bg-[#CAE4D8] border border-[#3A8067] rounded-xl p-2 flex items-center justify-between text-[#025033]">
              <span className="text-[10px] font-bold text-[#025033]">Agency Owner</span>
              <strong className="text-xs font-black text-[#025033]">{summary.roles?.agency_owner || 0}</strong>
            </div>
            <div className="bg-[#E6F7EF] border border-[#CAE4D8] rounded-xl p-2 flex items-center justify-between text-[#025033]">
              <span className="text-[10px] font-bold text-[#025033]">Accountant</span>
              <strong className="text-xs font-black text-[#025033]">{summary.roles?.accountant || 0}</strong>
            </div>
          </div>

          <div className="text-[10px] text-[#3A8067] pt-1 border-t border-[#E5EAE7] flex items-center justify-between">
            <span>Granular RBAC enforcement</span>
            <span className="font-semibold text-[#025033]">{summary.total_users} Total</span>
          </div>
        </div>

      </div>

      {/* 3. User Directory & Filter Controls */}
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl shadow-2xs overflow-hidden flex flex-col">
        
        {/* Controls Bar */}
        <div className="p-5 border-b border-[#E5EAE7] flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#FAFCF9]">
          
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 bg-[#E6F7EF] p-1 rounded-xl border border-[#CAE4D8] w-fit">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'all'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs font-bold'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              All Users ({summary.total_users})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                statusFilter === 'active'
                  ? 'bg-[#05572F] text-[#FFFFFF] shadow-xs font-bold'
                  : 'text-[#025033] hover:bg-[#CAE4D8]/50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${statusFilter === 'active' ? 'bg-[#FFFFFF]' : 'bg-[#025033] animate-pulse'}`} />
              <span>Active Now ({summary.active_users})</span>
            </button>
            <button
              onClick={() => setStatusFilter('inactive')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                statusFilter === 'inactive'
                  ? 'bg-[#025033] text-[#FFFFFF] shadow-xs font-bold'
                  : 'text-[#3A8067] hover:text-[#025033] hover:bg-[#FFFFFF]'
              }`}
            >
              Offline ({summary.inactive_users})
            </button>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            
            {/* Search Input */}
            <div className="relative min-w-[240px] flex-1 sm:flex-initial">
              <SearchIcon className="w-3.5 h-3.5 text-[#3A8067] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, email, phone, store..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl pl-8 pr-3 py-1.5 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#3A8067] hover:text-[#025033] text-xs font-bold"
                >
                  &times;
                </button>
              )}
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-2.5 py-1.5 text-xs text-[#025033] focus:outline-none focus:border-[#025033] font-medium"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admins</option>
              <option value="admin">Platform Admins</option>
              <option value="agency_owner">Agency Owners</option>
              <option value="accountant">Accountants</option>
            </select>

            {/* Tenant Filter */}
            <select
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-2.5 py-1.5 text-xs text-[#025033] focus:outline-none focus:border-[#025033] font-medium"
            >
              <option value="all">All Tenant Stores</option>
              {uniqueMerchants.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name} (#{m.id})
                </option>
              ))}
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl px-2.5 py-1.5 text-xs text-[#025033] focus:outline-none focus:border-[#025033] font-medium"
            >
              <option value="status">Sort: Active First</option>
              <option value="name">Sort: Name (A-Z)</option>
              <option value="role">Sort: Role Hierarchy</option>
              <option value="recent">Sort: Most Recently Active</option>
            </select>

          </div>

        </div>

        {/* 4. Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#E5EAE7] bg-[#FAFCF9] text-[#3A8067] font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-5">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Store / Organization</th>
                <th className="py-3 px-4">Live Status</th>
                <th className="py-3 px-4">Last Activity</th>
                <th className="py-3 px-4">Joined Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {filteredUsers.map((u) => {
                const badge = roleBadgeStyle(u.role);
                const initials = u.name
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="hover:bg-[#E6F7EF]/50 transition cursor-pointer group"
                  >
                    {/* User Profile */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 relative ${
                            u.is_active
                              ? 'bg-[#CAE4D8] text-[#025033] border-2 border-[#025033]'
                              : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'
                          }`}
                        >
                          {initials}
                          {u.is_active && (
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#025033] border-2 border-[#FFFFFF]" />
                          )}
                        </div>

                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#025033] truncate group-hover:text-[#00432C]">
                              {u.name}
                            </span>
                            <span className="text-[10px] text-[#3A8067] font-mono">#{u.id}</span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-[#3A8067] flex-wrap">
                            {u.email && <span>{u.email}</span>}
                            {u.whatsapp && (
                              <>
                                <span className="text-[#CAE4D8]">•</span>
                                <span>{u.whatsapp}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${badge.bg}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                        <span>{u.role_label}</span>
                      </span>
                    </td>

                    {/* Store / Tenant */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#025033] truncate max-w-[170px]">
                          {u.merchant_name}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-[#3A8067]">
                          <span>Tenant #{u.merchant_id}</span>
                          {u.merchant_status === 'paused' && (
                            <span className="text-[#025033] font-bold bg-[#CAE4D8] px-1 rounded border border-[#3A8067]">
                              Paused
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Live Status */}
                    <td className="py-3.5 px-4">
                      {u.is_active ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#E6F7EF] border border-[#CAE4D8] text-[#025033] text-[11px] font-bold">
                          <span className="w-2 h-2 rounded-full bg-[#025033] animate-pulse" />
                          <span>Active Now</span>
                          {u.active_sessions_count > 1 && (
                            <span className="text-[10px] font-semibold text-[#05572F]">
                              ({u.active_sessions_count} sessions)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FAFCF9] text-[#3A8067] text-[11px] font-medium border border-[#E5EAE7]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3A8067]" />
                          <span>Offline</span>
                        </div>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="py-3.5 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#025033] text-[11px]">
                          {timeAgo(u.last_active)}
                        </span>
                        {u.last_action && (
                          <span className="text-[10px] text-[#3A8067] truncate max-w-[140px] capitalize">
                            {u.last_action.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Joined Date */}
                    <td className="py-3.5 px-4 text-[#3A8067] text-[11px]">
                      {formatDate(u.created_at)}
                    </td>

                    {/* Quick Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {u.email && (
                          <button
                            onClick={() => copyToClipboard(u.email || '', `email-${u.id}`)}
                            title="Copy Email"
                            className="p-1.5 rounded-lg border border-[#E5EAE7] bg-[#FFFFFF] hover:bg-[#E6F7EF] text-[#025033] transition text-[11px] font-medium"
                          >
                            {copiedId === `email-${u.id}` ? (
                              <CheckIcon className="w-3.5 h-3.5 text-[#025033]" />
                            ) : (
                              <span>Copy Email</span>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedUser(u)}
                          className="p-1.5 rounded-lg bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] transition text-[11px] font-bold px-2.5 border border-[#CAE4D8]"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-[#3A8067]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UsersIcon className="w-8 h-8 text-[#3A8067]" />
                      <span className="font-semibold text-[#025033]">No users match your filters</span>
                      <p className="text-[#3A8067] text-[11px]">
                        Try adjusting your search query, role filter, or status toggle.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setStatusFilter('all');
                          setRoleFilter('all');
                          setTenantFilter('all');
                        }}
                        className="mt-2 px-3 py-1.5 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] font-bold text-xs transition"
                      >
                        Reset All Filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="p-3.5 px-5 bg-[#FAFCF9] border-t border-[#E5EAE7] flex items-center justify-between text-xs text-[#3A8067]">
          <span>
            Showing <strong className="text-[#025033]">{filteredUsers.length}</strong> of <strong className="text-[#025033]">{summary.total_users}</strong> total platform accounts
          </span>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#025033]" />
              <strong className="text-[#025033]">{summary.active_users}</strong> Active
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3A8067]" />
              <strong className="text-[#025033]">{summary.inactive_users}</strong> Offline
            </span>
          </div>
        </div>

      </div>

      {/* 5. User Details Modal / Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 bg-[#00432C]/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div
            className="bg-[#FFFFFF] rounded-3xl max-w-lg w-full border border-[#E5EAE7] shadow-2xl p-6 flex flex-col gap-5 animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[#E5EAE7]">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm ${
                    selectedUser.is_active
                      ? 'bg-[#CAE4D8] text-[#025033] border-2 border-[#025033]'
                      : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'
                  }`}
                >
                  {selectedUser.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold text-[#025033]">{selectedUser.name}</h2>
                    <span className="text-xs text-[#3A8067] font-mono">#{selectedUser.id}</span>
                  </div>
                  <span className="text-xs text-[#3A8067]">{selectedUser.email || 'No email registered'}</span>
                </div>
              </div>

              <button
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] flex items-center justify-center font-bold text-sm transition"
              >
                &times;
              </button>
            </div>

            {/* User Metadata Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              
              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">Hierarchy Role</span>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold w-fit ${roleBadgeStyle(selectedUser.role).bg}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${roleBadgeStyle(selectedUser.role).dot}`} />
                  {selectedUser.role_label}
                </span>
              </div>

              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">Current Session</span>
                {selectedUser.is_active ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] text-[10px] font-bold w-fit border border-[#CAE4D8]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#025033] animate-pulse" />
                    Active ({selectedUser.active_sessions_count} session{selectedUser.active_sessions_count > 1 ? 's' : ''})
                  </span>
                ) : (
                  <span className="text-[#3A8067] font-semibold text-[11px]">No active session (Offline)</span>
                )}
              </div>

              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">Store Tenant</span>
                <span className="font-bold text-[#025033] truncate">{selectedUser.merchant_name}</span>
                <span className="text-[10px] text-[#3A8067]">Tenant ID #{selectedUser.merchant_id}</span>
              </div>

              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">WhatsApp / Phone</span>
                <span className="font-semibold text-[#025033]">{selectedUser.whatsapp || 'Not linked'}</span>
              </div>

              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">Last Telemetry Active</span>
                <span className="font-semibold text-[#025033]">{timeAgo(selectedUser.last_active)}</span>
                {selectedUser.last_active && (
                  <span className="text-[10px] text-[#3A8067] font-mono">
                    {new Date(selectedUser.last_active).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="bg-[#FAFCF9] p-3 rounded-xl border border-[#E5EAE7] flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-[#3A8067]">Last Activity Action</span>
                <span className="font-semibold text-[#025033] capitalize">
                  {selectedUser.last_action ? selectedUser.last_action.replace(/_/g, ' ') : 'None logged'}
                </span>
              </div>

            </div>

            {/* Created At */}
            <div className="p-3 bg-[#FAFCF9] rounded-xl text-[#3A8067] text-[11px] flex items-center justify-between border border-[#E5EAE7]">
              <span>Account Created:</span>
              <strong className="text-[#025033]">{formatDate(selectedUser.created_at)}</strong>
            </div>

            {/* Close Button */}
            <button
              onClick={() => setSelectedUser(null)}
              className="w-full py-2.5 rounded-xl bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] text-xs font-bold transition shadow-xs"
            >
              Close Details
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
