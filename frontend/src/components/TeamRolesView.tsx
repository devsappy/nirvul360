'use strict';
'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { User, TeamMember, PermissionsMatrixRow, TeamApiResponse } from '@/types';

interface TeamRolesViewProps {
  user?: User | null;
  merchantName?: string;
  onRefresh?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function TeamRolesView({ user, merchantName, onRefresh, showToast }: TeamRolesViewProps) {
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [matrix, setMatrix] = useState<PermissionsMatrixRow[]>([]);
  const [lastPermissionsChanged, setLastPermissionsChanged] = useState<string | null>(null);
  const [activitySynced, setActivitySynced] = useState<string | null>(null);

  // Modals state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditRolesOpen, setIsEditRolesOpen] = useState(false);
  const [isActivityOpen, setIsActivityOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);

  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'accountant'>('manager');
  const [inviteScope, setInviteScope] = useState('current_store');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Edit role form state
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<string>('manager');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const data = await api.get<TeamApiResponse>('/api/team');
      setMembers(data.members || []);
      setMatrix(data.permissions_matrix || []);
      setLastPermissionsChanged(data.last_permissions_changed || null);
      setActivitySynced(data.activity_synced || null);
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error loading team data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const data = await api.get<{ activity: any[] }>('/api/team/activity');
      setActivityLogs(data.activity || []);
    } catch (err) {
      console.error('Failed to load activity logs', err);
    }
  };

  useEffect(() => {
    fetchTeamData();
  }, []);

  const handleOpenActivity = () => {
    fetchActivityLogs();
    setIsActivityOpen(true);
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim()) {
      if (showToast) showToast('Name and email are required', 'error');
      return;
    }
    try {
      setIsSubmittingInvite(true);
      await api.post('/api/team/invite', {
        name: inviteName.trim(),
        email: inviteEmail.trim(),
        role: inviteRole,
        scope: inviteScope,
      });
      if (showToast) showToast(`Invite sent to ${inviteEmail}`, 'success');
      setIsInviteOpen(false);
      setInviteName('');
      setInviteEmail('');
      fetchTeamData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleRoleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) return;
    try {
      setIsSubmittingRole(true);
      await api.put(`/api/team/${selectedMemberId}/role`, { role: editRole });
      if (showToast) showToast('Role updated successfully', 'success');
      setIsEditRolesOpen(false);
      setSelectedMemberId(null);
      fetchTeamData();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      if (showToast) showToast(err.message, 'error');
    } finally {
      setIsSubmittingRole(false);
    }
  };

  const getInitials = (name: string) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const formatTimestamp = (ts?: string | null) => {
    if (!ts) return 'Never signed in';
    try {
      const d = new Date(ts);
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return ts;
    }
  };

  const isOwner = user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'agency_owner';

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Context */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Team &amp; roles</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            {members.length} {members.length === 1 ? 'person' : 'people'} on {merchantName || 'this store'}
            {' · '}permissions last changed {lastPermissionsChanged ? formatTimestamp(lastPermissionsChanged) : 'recently'}
            {' · '}activity synced {activitySynced ? formatTimestamp(activitySynced) : 'just now'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenActivity}
            className="px-4 py-2 text-sm font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Activity log
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setIsInviteOpen(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite someone
            </button>
          )}
        </div>
      </div>

      {/* Card 1: Members Directory Table */}
      <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-[#E5EAE7] flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">Members</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Access is per store. These {members.length} are on {merchantName || 'this store'} only.
            </p>
          </div>
          <span className="px-2.5 py-1 text-xs font-medium text-[#025033] bg-[#E6F7EF] border border-[#CAE4D8] rounded-full">
            {members.length} people
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAFCF9] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-[#E5EAE7]">
              <tr>
                <th scope="col" className="px-6 py-3.5">PERSON</th>
                <th scope="col" className="px-6 py-3.5">ROLE</th>
                <th scope="col" className="px-6 py-3.5">LAST ACTIVE</th>
                <th scope="col" className="px-6 py-3.5">SCOPE</th>
                <th scope="col" className="px-6 py-3.5 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {loading && members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#6B7280]">
                    Loading team members...
                  </td>
                </tr>
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-[#6B7280]">
                    No team members found.
                  </td>
                </tr>
              ) : (
                members.map((m, idx) => {
                  const isOwnerRole = m.role === 'owner' || m.role === 'agency_owner' || m.role === 'super_admin';
                  const initials = getInitials(m.name);
                  const isInvited = m.status === 'invited';

                  return (
                    <tr key={m.id || idx} className="hover:bg-[#FAFCF9] transition-colors">
                      {/* PERSON */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                              isOwnerRole
                                ? 'bg-[#0B3B28] text-white'
                                : 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-[#111827]">{m.name}</div>
                            <div className="text-xs text-[#6B7280]">{m.email || 'No email registered'}</div>
                          </div>
                        </div>
                      </td>

                      {/* ROLE */}
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                            isOwnerRole
                              ? 'bg-[#0B3828] text-white'
                              : 'bg-[#F3F4F6] text-[#374151] border border-[#E5EAE7]'
                          }`}
                        >
                          {m.role_label || m.role}
                        </span>
                      </td>

                      {/* LAST ACTIVE */}
                      <td className="px-6 py-4 text-xs text-[#4B5563]">
                        {formatTimestamp(m.last_active)}
                      </td>

                      {/* SCOPE */}
                      <td className="px-6 py-4 text-xs text-[#4B5563]">
                        {m.scope || merchantName || 'Current Store'}
                      </td>

                      {/* STATUS */}
                      <td className="px-6 py-4 text-right">
                        {isInvited ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                            Invite sent {m.invited_at ? formatTimestamp(m.invited_at).split(',')[0] : ''}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#E6F7EF] text-[#166534] border border-[#CAE4D8]">
                            Active
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card 2: Permissions Matrix ("What each role can see") */}
      <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
        <div className="p-5 border-b border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#111827]">What each role can see</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Money you earn and money you pay suppliers is owner-only. Staff see the work, not the margin.
            </p>
          </div>
          {isOwner && (
            <button
              type="button"
              onClick={() => {
                const nonOwner = members.find(m => m.role !== 'owner' && m.role !== 'agency_owner');
                if (nonOwner) {
                  setSelectedMemberId(nonOwner.id);
                  setEditRole(nonOwner.role);
                } else if (members.length > 0) {
                  setSelectedMemberId(members[0].id);
                  setEditRole(members[0].role);
                }
                setIsEditRolesOpen(true);
              }}
              className="px-3.5 py-1.5 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs self-start sm:self-auto"
            >
              Edit roles
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#FAFCF9] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-[#E5EAE7]">
              <tr>
                <th scope="col" className="px-6 py-3.5">AREA</th>
                <th scope="col" className="px-6 py-3.5 text-center">OWNER</th>
                <th scope="col" className="px-6 py-3.5 text-center">MANAGER</th>
                <th scope="col" className="px-6 py-3.5 text-center">ACCOUNTANT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAE7]">
              {matrix.map((row, idx) => {
                const isFinancialMargin = !!row.is_financial_margin;
                const rowClass = isFinancialMargin
                  ? 'bg-[#FFF5F5] border-y border-[#FED7D7]'
                  : 'hover:bg-[#FAFCF9] transition-colors';

                const renderBadge = (label: string) => {
                  const isHidden = label.toLowerCase() === 'hidden' || label.toLowerCase() === 'no access';
                  if (isHidden) {
                    return (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                        Hidden
                      </span>
                    );
                  }
                  return (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                      {label}
                    </span>
                  );
                };

                return (
                  <tr key={idx} className={rowClass}>
                    <td className="px-6 py-3.5 font-medium text-[#111827]">
                      <div>{row.area}</div>
                      {row.description && (
                        <div className="text-[11px] text-[#6B7280] font-normal">{row.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-3.5 text-center">{renderBadge(row.owner)}</td>
                    <td className="px-6 py-3.5 text-center">{renderBadge(row.manager)}</td>
                    <td className="px-6 py-3.5 text-center">{renderBadge(row.accountant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isInviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5EAE7] relative">
            <h3 className="text-lg font-bold text-[#111827] mb-1">Invite team member</h3>
            <p className="text-xs text-[#6B7280] mb-4">
              Send an invite to give access to this store. Financial margins will stay masked for non-owners.
            </p>

            <form onSubmit={handleInviteSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Shakib Al Hasan"
                  className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@company.bd"
                  className="w-full px-3.5 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e: any) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033] bg-white"
                  >
                    <option value="manager">Manager</option>
                    <option value="accountant">Accountant</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1">Store Scope</label>
                  <select
                    value={inviteScope}
                    onChange={(e) => setInviteScope(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033] bg-white"
                  >
                    <option value="current_store">{merchantName || 'Current Store'}</option>
                    <option value="all_stores">All 3 stores</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setIsInviteOpen(false)}
                  className="px-4 py-2 text-sm text-[#4B5563] hover:text-[#111827] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingInvite}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmittingInvite ? 'Sending...' : 'Send invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Roles Modal */}
      {isEditRolesOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5EAE7]">
            <h3 className="text-lg font-bold text-[#111827] mb-1">Edit team role</h3>
            <p className="text-xs text-[#6B7280] mb-4">
              Select a member to change their role and permissions.
            </p>

            <form onSubmit={handleRoleUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">Select Member</label>
                <select
                  value={selectedMemberId || ''}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setSelectedMemberId(id);
                    const m = members.find(mem => mem.id === id);
                    if (m) setEditRole(m.role);
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033] bg-white"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role_label || m.role})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">New Role</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033] bg-white"
                >
                  <option value="manager">Manager</option>
                  <option value="accountant">Accountant</option>
                  <option value="owner">Owner</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setIsEditRolesOpen(false)}
                  className="px-4 py-2 text-sm text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmittingRole ? 'Saving...' : 'Save role'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Activity Log Modal */}
      {isActivityOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-[#E5EAE7] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <div>
                <h3 className="text-lg font-bold text-[#111827]">Team Activity Log</h3>
                <p className="text-xs text-[#6B7280]">Recent actions and permission changes</p>
              </div>
              <button
                type="button"
                onClick={() => setIsActivityOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] text-xl font-bold px-2"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto py-3 space-y-3 flex-1">
              {activityLogs.length === 0 ? (
                <p className="text-xs text-[#6B7280] text-center py-6">No recent activity logged.</p>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl text-xs">
                    <div className="flex items-center justify-between font-semibold text-[#111827]">
                      <span>{log.action}</span>
                      <span className="text-[#6B7280] font-normal">{formatTimestamp(log.created_at)}</span>
                    </div>
                    <div className="text-[#4B5563] mt-1">
                      Actor: <span className="font-medium text-[#111827]">{log.actor}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#E5EAE7] text-right">
              <button
                type="button"
                onClick={() => setIsActivityOpen(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
