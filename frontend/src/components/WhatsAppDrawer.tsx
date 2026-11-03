'use client';

import React, { useState } from 'react';
import { WhatsAppIcon, CloseIcon, CheckIcon } from './icons';
import { api } from '@/lib/api';

interface Message {
  sender: 'user' | 'bot';
  text: string;
  time: string;
}

interface WhatsAppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}

export function WhatsAppDrawer({ isOpen, onClose, onSuccess }: WhatsAppDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: 'আসসালামু আলাইকুম! আমি আপনার Gross Management WhatsApp সহকারী।\n\nআপনি যেকোনো খরচের হিসাব বাংলায় লিখে পাঠাতে পারেন (যেমন: "প্যাকেজিং ৪০০ টাকা" বা "salary 15000")।\n\nঅথবা আজকের প্রফিট দেখতে "আজকের হিসাব" লিখুন।',
      time: 'Just now',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    const userMsg: Message = {
      sender: 'user',
      text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setLoading(true);

    try {
      const res = await api.post('/webhooks/whatsapp', {
        from: '8801711000001',
        message: text,
      });

      const replies: string[] = res.replies || [res.message || 'মেসেজ গৃহীত হয়েছে।'];
      replies.forEach((r) => {
        setMessages((prev) => [
          ...prev,
          {
            sender: 'bot',
            text: r,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      });

      if (text === 'হ্যাঁ' || text === 'yes') {
        onSuccess('WhatsApp entry confirmed and posted to the double-entry books!');
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `⚠️ Error: ${err.message || 'Failed to process message'}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-2xs transition">
      <div className="w-full max-w-md bg-[#FAF8F5] h-full shadow-2xl border-l border-[#EBE7DF] flex flex-col justify-between">
        {/* Header */}
        <div className="px-5 py-4 bg-emerald-800 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center">
              <WhatsAppIcon className="w-5 h-5 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-tight">Gross WhatsApp AI</span>
              <span className="text-[11px] text-emerald-200">2-step verified expense assistant</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white rounded-lg">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Message Log */}
        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`flex flex-col max-w-[85%] ${
                m.sender === 'user' ? 'self-end items-end' : 'self-start items-start'
              }`}
            >
              <div
                className={`p-3 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap shadow-2xs ${
                  m.sender === 'user'
                    ? 'bg-emerald-600 text-white rounded-tr-xs'
                    : 'bg-white text-stone-900 border border-stone-200/70 rounded-tl-xs'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[9px] text-stone-400 mt-1 px-1">{m.time}</span>
            </div>
          ))}

          {loading && (
            <div className="self-start bg-white p-3 rounded-2xl text-xs border border-stone-200 text-stone-500 animate-pulse">
              typing...
            </div>
          )}
        </div>

        {/* Quick prompt buttons */}
        <div className="px-4 py-2 bg-stone-100 border-t border-stone-200/60 flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => handleSend('প্যাকেজিং ৪০০ টাকা')}
            className="px-2.5 py-1 rounded-full bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 text-[11px] whitespace-nowrap"
          >
            প্যাকেজিং ৪০০ টাকা
          </button>
          <button
            onClick={() => handleSend('salary 15000')}
            className="px-2.5 py-1 rounded-full bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 text-[11px] whitespace-nowrap"
          >
            salary 15000
          </button>
          <button
            onClick={() => handleSend('হ্যাঁ')}
            className="px-2.5 py-1 rounded-full bg-emerald-600 text-white hover:bg-emerald-700 text-[11px] font-bold whitespace-nowrap flex items-center gap-1"
          >
            <CheckIcon className="w-3 h-3" />
            <span>হ্যাঁ (Confirm)</span>
          </button>
          <button
            onClick={() => handleSend('আজকের হিসাব')}
            className="px-2.5 py-1 rounded-full bg-white text-stone-800 border border-stone-300 hover:bg-stone-50 text-[11px] whitespace-nowrap"
          >
            আজকের হিসাব
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-white border-t border-[#EBE7DF] flex items-center gap-2">
          <input
            type="text"
            placeholder="Type in Bangla or English..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-[#FAF8F5] border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-600 font-medium"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !inputText.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
