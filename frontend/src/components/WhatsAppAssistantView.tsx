'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiWhatsApp } from '@/lib/api';
import { WhatsAppStatusData, WhatsAppChatMessage } from '@/types';

interface WhatsAppAssistantViewProps {
  onOpenDrawer?: () => void;
}

export function WhatsAppAssistantView({ onOpenDrawer }: WhatsAppAssistantViewProps) {
  const [telemetry, setTelemetry] = useState<WhatsAppStatusData | null>(null);
  const [messages, setMessages] = useState<WhatsAppChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadData = React.useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, convRes] = await Promise.all([
        apiWhatsApp.getOverview(),
        apiWhatsApp.getConversation(),
      ]);
      setTelemetry(overviewRes);
      if (convRes?.messages && convRes.messages.length > 0) {
        setMessages(convRes.messages);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp data', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || isSending) return;

    const userMsgId = `usr-${Date.now()}`;
    const userMsg: WhatsAppChatMessage = {
      id: userMsgId,
      sender: 'user',
      text,
      timestamp: 'Just now',
      status: 'delivered',
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsSending(true);

    try {
      const res = await apiWhatsApp.simulate(text);
      if (res.replies && res.replies.length > 0) {
        for (let i = 0; i < res.replies.length; i++) {
          const replyText = res.replies[i];
          const isDraftCard = replyText.includes('📝 এই এন্ট্রিটি ড্রাফট করা হয়েছে:');
          const botMsg: WhatsAppChatMessage = {
            id: `bot-${Date.now()}-${i}`,
            sender: 'bot',
            text: replyText,
            timestamp: 'Just now',
            draft_card: isDraftCard && res.pending_draft ? {
              head: res.pending_draft.head_label || res.pending_draft.head,
              amount: res.pending_draft.amount_taka,
              date: res.pending_draft.date,
              status: 'pending',
            } : undefined,
          };
          setMessages((prev) => [...prev, botMsg]);
        }
      }
      // Refresh telemetry & logs
      const updatedOverview = await apiWhatsApp.getOverview();
      setTelemetry(updatedOverview);
    } catch (err: any) {
      alert(err.message || 'Failed to simulate WhatsApp message');
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickChip = (chipText: string) => {
    handleSendMessage(chipText);
  };

  const businessNumber = telemetry?.connection?.business_number || 'Not connected';
  const lastMessageIn = telemetry?.connection?.last_message_in || 'None';
  const ledgerSync = telemetry?.ledger_last_synced || 'Recently';

  if (loading && !telemetry) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400 text-sm">
        Connecting to WhatsApp assistant...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">WhatsApp assistant</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Connected · last message received {lastMessageIn} · ledger last synced {ledgerSync}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => handleSendMessage('প্যাকেজিং ৪০০ টাকা')}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Send a test message
          </button>
          <button
            onClick={() => (onOpenDrawer ? onOpenDrawer() : alert('Daily digest configuration available in settings.'))}
            className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
          >
            Assistant settings
          </button>
        </div>
      </div>

      {/* 2-Column Split: Conversation Simulator (Left) + Controls & Telemetry (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 2-Way Simulator (~48% width / col-span-6) */}
        <div className="lg:col-span-6 flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col h-[680px]">
            {/* Chat Stream Header */}
            <div className="p-3.5 bg-[#062E1F] text-white flex items-center justify-between border-b border-[#0A3725]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#166534] flex items-center justify-center font-bold text-xs text-white">
                  WA
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold">{businessNumber}</span>
                  <span className="text-[10px] text-[#8CAFA0]">Live WhatsApp conversation stream</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#0B3828] text-[10px] text-[#22C55E] border border-[#166534]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                <span>Live</span>
              </div>
            </div>

            {/* Conversation Feed */}
            <div className="flex-1 p-4 overflow-y-auto bg-[#F0F2F5] flex flex-col gap-3">
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-12 h-12 rounded-full bg-slate-200/80 flex items-center justify-center text-xl mb-2 text-slate-600">
                    💬
                  </div>
                  <p className="text-xs font-semibold text-slate-600">No WhatsApp messages yet</p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                    Type a message or click a quick chip below to draft an entry.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] ${isUser ? 'self-end items-end' : 'self-start items-start'}`}
                    >
                      <div
                        className={`p-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                          isUser
                            ? 'bg-[#DCF8C6] text-slate-900 rounded-tr-none'
                            : 'bg-white text-slate-900 rounded-tl-none border border-slate-200/80'
                        }`}
                      >
                        {/* Structured Bengali Draft Card if present */}
                        {msg.draft_card && (
                          <div className="mb-2 p-2.5 rounded-xl bg-[#FAFCF9] border border-slate-200 text-xs flex flex-col gap-1">
                            <div className="flex justify-between font-medium">
                              <span className="text-slate-500">ধরন:</span>
                              <span className="font-bold text-slate-800">খরচ — {msg.draft_card.head}</span>
                            </div>
                            <div className="flex justify-between font-medium">
                              <span className="text-slate-500">টাকা:</span>
                              <span className="font-bold text-slate-900">৳{msg.draft_card.amount}</span>
                            </div>
                            <div className="flex justify-between font-medium">
                              <span className="text-slate-500">তারিখ:</span>
                              <span className="text-slate-700">{msg.draft_card.date}</span>
                            </div>
                            <div className="mt-1 pt-1 border-t border-slate-200 text-[11px] font-semibold text-slate-600 flex justify-between">
                              <span>ঠিক আছে?</span>
                              <span className="text-[#025033]">হ্যাঁ / না</span>
                            </div>
                          </div>
                        )}

                        <div className="whitespace-pre-line">{msg.text}</div>
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Response Chips */}
            <div className="p-2 bg-slate-100 border-t border-slate-200 flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-slate-400 px-1 font-semibold text-[10px] shrink-0">Quick chips:</span>
              <button
                type="button"
                onClick={() => handleQuickChip('প্যাকেজিং ৫০০ টাকা')}
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 whitespace-nowrap shadow-2xs"
              >
                প্যাকেজিং ৫০০ টাকা
              </button>
              <button
                type="button"
                onClick={() => handleQuickChip('salary 15000')}
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 whitespace-nowrap shadow-2xs"
              >
                salary 15000
              </button>
              <button
                type="button"
                onClick={() => handleQuickChip('হ্যাঁ')}
                className="px-2.5 py-1 rounded-full bg-[#E6F7EF] hover:bg-emerald-100 text-[#025033] font-bold border border-[#CAE4D8] whitespace-nowrap shadow-2xs"
              >
                হ্যাঁ
              </button>
              <button
                type="button"
                onClick={() => handleQuickChip('না')}
                className="px-2.5 py-1 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-800 font-bold border border-rose-200 whitespace-nowrap shadow-2xs"
              >
                না
              </button>
              <button
                type="button"
                onClick={() => handleQuickChip('আজকের হিসাব')}
                className="px-2.5 py-1 rounded-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 whitespace-nowrap shadow-2xs"
              >
                আজকের হিসাব
              </button>
            </div>

            {/* Chat Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="p-3 bg-white border-t border-slate-200 flex items-center gap-2"
            >
              <input
                type="text"
                placeholder="Type a message (e.g. প্যাকেজিং ৫০০ টাকা)..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                className="flex-1 text-xs px-3.5 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
              />
              <button
                type="submit"
                disabled={isSending || !chatInput.trim()}
                className="px-4 py-2.5 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-40 transition"
              >
                {isSending ? 'Sending...' : 'Send'}
              </button>
            </form>

            {/* Footnote */}
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 text-center leading-tight">
              Nothing is written to the ledger until the merchant answers. A message with no reply stays a draft and is listed here as waiting.
            </div>
          </div>
        </div>

        {/* Right Column: Controls, Senders & Confirmation Log (~52% width / col-span-6) */}
        <div className="lg:col-span-6 flex flex-col gap-5">
          {/* Top 2 Cards: Connection & Daily Digest */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Connection */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Connection</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                  Connected
                </span>
              </div>
              <div className="flex flex-col gap-1 text-xs pt-1">
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Business number:</span>
                  <span className="font-semibold text-slate-800">{businessNumber}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Last message in:</span>
                  <span className="font-semibold text-slate-800">{lastMessageIn}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Failed sends, 30 days:</span>
                  <span className="font-semibold text-slate-800">{telemetry?.connection?.failed_sends_30d ?? 0}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Entries created this month:</span>
                  <span className="font-bold text-slate-900">{telemetry?.connection?.entries_created_this_month ?? 0}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Daily digest */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">Daily digest</span>
                <button
                  type="button"
                  onClick={() => alert('Digest settings modal')}
                  className="text-xs font-semibold text-[#062E1F] hover:underline"
                >
                  Change
                </button>
              </div>
              <div className="flex flex-col gap-1 text-xs pt-1">
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Sends at:</span>
                  <span className="font-semibold text-slate-800">{telemetry?.daily_digest?.sends_at ?? '—'} · Asia/Dhaka</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Language:</span>
                  <span className="font-semibold text-slate-800">{telemetry?.daily_digest?.language ?? '—'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Contains:</span>
                  <span className="font-semibold text-slate-800 truncate max-w-[130px]">{telemetry?.daily_digest?.contains ?? "Daily summary"}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Last sent:</span>
                  <span className="font-semibold text-slate-800">{telemetry?.daily_digest?.last_sent ?? 'None'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Who may send entries */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Who may send entries</span>
                <span className="text-[11px] text-slate-500">A number not on this list gets a polite refusal and nothing is recorded</span>
              </div>
              <button
                type="button"
                onClick={() => alert('Manage authorized numbers modal')}
                className="text-xs font-semibold text-[#062E1F] hover:underline shrink-0"
              >
                Manage
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                    <th className="py-2 px-2">PERSON</th>
                    <th className="py-2 px-2">NUMBER</th>
                    <th className="py-2 px-2">MAY SEND</th>
                    <th className="py-2 px-2 text-right">NEEDS CONFIRMATION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {(telemetry?.authorized_senders && telemetry.authorized_senders.length > 0) ? (
                    telemetry.authorized_senders.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 font-semibold text-slate-800">
                          {u.person} <span className="text-[10px] text-slate-400 font-normal">({u.role})</span>
                        </td>
                        <td className="py-2 px-2 text-slate-500">{u.number}</td>
                        <td className="py-2 px-2 text-slate-600 truncate max-w-[150px]">{u.may_send}</td>
                        <td className="py-2 px-2 text-right font-medium text-slate-800">{u.needs_confirmation}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-3 text-center text-slate-400">
                        No authorized senders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card 4: Confirmation log */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-slate-800">Confirmation log</span>
                <span className="text-[11px] text-slate-500">What was said, what we understood, and what the merchant answered</span>
              </div>
              <span className="text-[10px] font-semibold text-slate-400">Kept for 24 months</span>
            </div>

            <div className="overflow-x-auto max-h-[220px]">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                    <th className="py-2 px-2">WHEN</th>
                    <th className="py-2 px-2">WHAT WAS SAID</th>
                    <th className="py-2 px-2">WHAT WE UNDERSTOOD</th>
                    <th className="py-2 px-2 text-right">ANSWER</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {(telemetry?.confirmation_log && telemetry.confirmation_log.length > 0) ? (
                    telemetry.confirmation_log.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2 px-2 text-slate-500 whitespace-nowrap">{log.when}</td>
                        <td className="py-2 px-2 font-medium text-slate-800 truncate max-w-[120px]">{log.what_was_said}</td>
                        <td className="py-2 px-2 text-slate-600 truncate max-w-[140px]">{log.what_we_understood}</td>
                        <td className="py-2 px-2 text-right">
                          {log.answer === 'confirmed' ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                              Confirmed
                            </span>
                          ) : log.answer === 'rejected' ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                              Rejected
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                              Waiting
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        No confirmation logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-500 leading-tight">
              A message describing a courier return does not write a return — those come from the courier API only, to prevent double counting.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
