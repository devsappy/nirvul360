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
    <div className="fixed inset-0 z-50 flex justify-end bg-[#00432C]/60 backdrop-blur-2xs transition">
      <div className="w-full max-w-md bg-[#FAFCF9] h-full shadow-2xl border-l border-[#E5EAE7] flex flex-col justify-between">
        {/* Header */}
        <div className="px-5 py-4 bg-[#025033] text-[#FFFFFF] flex items-center justify-between shadow-xs border-b border-[#00432C]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#05572F] flex items-center justify-center border border-[#3A8067]">
              <WhatsAppIcon className="w-5 h-5 text-[#FFFFFF]" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-sm leading-tight text-[#FFFFFF]">Gross WhatsApp AI</span>
              <span className="text-[11px] text-[#CAE4D8]">2-step verified expense assistant</span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[#CAE4D8] hover:text-[#FFFFFF] rounded-lg transition">
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
                    ? 'bg-[#025033] text-[#FFFFFF] rounded-tr-xs'
                    : 'bg-[#FFFFFF] text-[#025033] border border-[#E5EAE7] rounded-tl-xs'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[9px] text-[#3A8067] mt-1 px-1">{m.time}</span>
            </div>
          ))}

          {loading && (
            <div className="self-start bg-[#FFFFFF] p-3 rounded-2xl text-xs border border-[#E5EAE7] text-[#3A8067] animate-pulse">
              typing...
            </div>
          )}
        </div>

        {/* Quick prompt buttons */}
        <div className="px-4 py-2 bg-[#E6F7EF] border-t border-[#CAE4D8] flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => handleSend('প্যাকেজিং ৪০০ টাকা')}
            className="px-2.5 py-1 rounded-full bg-[#FFFFFF] text-[#025033] border border-[#E5EAE7] hover:bg-[#CAE4D8] text-[11px] whitespace-nowrap transition"
          >
            প্যাকেজিং ৪০০ টাকা
          </button>
          <button
            onClick={() => handleSend('salary 15000')}
            className="px-2.5 py-1 rounded-full bg-[#FFFFFF] text-[#025033] border border-[#E5EAE7] hover:bg-[#CAE4D8] text-[11px] whitespace-nowrap transition"
          >
            salary 15000
          </button>
          <button
            onClick={() => handleSend('হ্যাঁ')}
            className="px-2.5 py-1 rounded-full bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] text-[11px] font-bold whitespace-nowrap flex items-center gap-1 transition"
          >
            <CheckIcon className="w-3 h-3 text-[#FFFFFF]" />
            <span>হ্যাঁ (Confirm)</span>
          </button>
          <button
            onClick={() => handleSend('আজকের হিসাব')}
            className="px-2.5 py-1 rounded-full bg-[#FFFFFF] text-[#025033] border border-[#E5EAE7] hover:bg-[#CAE4D8] text-[11px] whitespace-nowrap transition"
          >
            আজকের হিসাব
          </button>
        </div>

        {/* Input Bar */}
        <div className="p-3 bg-[#FFFFFF] border-t border-[#E5EAE7] flex items-center gap-2">
          <input
            type="text"
            placeholder="Type in Bangla or English..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] font-medium"
          />
          <button
            onClick={() => handleSend()}
            disabled={loading || !inputText.trim()}
            className="bg-[#025033] hover:bg-[#05572F] disabled:opacity-50 text-[#FFFFFF] px-4 py-2 rounded-xl text-xs font-bold transition shadow-2xs"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
