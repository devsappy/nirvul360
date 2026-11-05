'use client';

import React, { useState } from 'react';
import { CloseIcon, PlusIcon } from './icons';
import { Product } from '@/types';
import { api } from '@/lib/api';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSuccess: (msg: string) => void;
}

export function PurchaseModal({ isOpen, onClose, products, onSuccess }: PurchaseModalProps) {
  const [productId, setProductId] = useState<number>(products[0]?.id || 1);
  const [qty, setQty] = useState('50');
  const [unitCost, setUnitCost] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseInt(qty);
    const cost = parseFloat(unitCost);
    if (isNaN(q) || q <= 0 || isNaN(cost) || cost <= 0) {
      setError('Please enter valid quantity and unit purchase price');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.post('/api/purchases', {
        product_id: productId,
        qty: q,
        unit_cost: cost,
        date,
        paid_amount: paidAmount ? parseFloat(paidAmount) : 0,
      });
      onSuccess(`Successfully recorded purchase of ${q} units! Inventory and moving average cost updated.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4">
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
          <div className="flex flex-col">
            <h2 className="text-base font-bold text-[#025033]">Record Product Purchase</h2>
            <p className="text-xs text-[#3A8067]">Allowed for Accountants &amp; Agency Owners</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#3A8067] hover:text-[#025033] rounded-lg transition">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-[#E6F7EF] border border-[#3A8067] text-[#025033] text-xs rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#025033] mb-1">Select Product</label>
            <select
              value={productId}
              onChange={(e) => setProductId(parseInt(e.target.value))}
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] focus:outline-none focus:border-[#025033]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku || `ID #${p.id}`})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#025033] mb-1">Quantity</label>
              <input
                type="number"
                placeholder="e.g. 50"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#025033] mb-1">Unit Cost (৳)</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 280"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#025033] mb-1">Amount Paid Upfront (৳)</label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 5000 (0 for full credit)"
              value={paidAmount}
              onChange={(e) => setPaidAmount(e.target.value)}
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#025033] mb-1">Purchase Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-medium text-[#025033] focus:outline-none focus:border-[#025033]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] font-bold text-xs py-2.5 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              <span>{loading ? 'Posting Purchase...' : 'Post Stock & Moving Cost'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
