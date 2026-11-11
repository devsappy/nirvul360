'use client';

import React, { useState, useEffect, useRef } from 'react';
import { CloseIcon, PlusIcon } from './icons';
import { Product, SupplierItem } from '@/types';
import { api, apiSuppliers } from '@/lib/api';

interface PurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSuccess: (msg: string) => void;
}

export function PurchaseModal({ isOpen, onClose, products, onSuccess }: PurchaseModalProps) {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [productId, setProductId] = useState<number>(products[0]?.id || 1);
  const [qty, setQty] = useState('50');
  const [unitCost, setUnitCost] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memo photo upload state (PDF Requirement 7)
  const [memoFileName, setMemoFileName] = useState<string | null>(null);
  const [memoPreview, setMemoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline Add Supplier
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');

  useEffect(() => {
    if (isOpen) {
      apiSuppliers
        .list()
        .then((res) => {
          const list = res.suppliers || [];
          setSuppliers(list);
          if (list.length > 0 && !supplierId) {
            setSupplierId(list[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMemoFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setMemoPreview(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateSupplierInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) return;
    try {
      const res = await apiSuppliers.create({
        name: newSupName.trim(),
        phone: newSupPhone.trim() || undefined,
        terms_days: 30,
      });
      const newId = res.id;
      const updatedList = await apiSuppliers.list();
      setSuppliers(updatedList.suppliers || []);
      setSupplierId(newId);
      setShowAddSupplier(false);
      setNewSupName('');
      setNewSupPhone('');
    } catch (err: any) {
      alert(err.message || 'Failed to add supplier');
    }
  };

  const q = parseInt(qty) || 0;
  const cost = parseFloat(unitCost) || 0;
  const totalBatchCost = q * cost;
  const paid = parseFloat(paidAmount) || 0;
  const balanceRemaining = Math.max(0, totalBatchCost - paid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (q <= 0 || cost <= 0) {
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
        supplier_id: supplierId || undefined,
        date,
        paid_amount: paid,
      });
      onSuccess(`Successfully recorded purchase of ${q} units! Inventory, moving cost & supplier ledger updated.`);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-[#FFFFFF] border border-[#CAE4D8] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
          <div className="flex flex-col">
            <h2 className="text-base font-extrabold text-[#025033]">Record Product Purchase</h2>
            <p className="text-xs text-[#3A8067]">
              Enters stock, recalculates unit cost &amp; updates supplier ledger
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 text-[#3A8067] hover:text-[#025033] rounded-lg transition">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl font-semibold">
              {error}
            </div>
          )}

          {/* Supplier Selector + Add Inline (PDF Requirement 7) */}
          <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-2xl p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#025033]">Supplier / Vendor</label>
              <button
                type="button"
                onClick={() => setShowAddSupplier(!showAddSupplier)}
                className="text-[11px] font-bold text-[#025033] hover:underline"
              >
                {showAddSupplier ? 'Cancel' : '+ Add New Supplier'}
              </button>
            </div>

            {showAddSupplier ? (
              <div className="space-y-2 pt-1 border-t border-[#E5EAE7]">
                <input
                  type="text"
                  placeholder="New supplier name"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="w-full bg-white border border-[#CAE4D8] rounded-xl px-3 py-1.5 text-xs text-[#025033]"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Phone number"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    className="flex-1 bg-white border border-[#CAE4D8] rounded-xl px-3 py-1.5 text-xs text-[#025033]"
                  />
                  <button
                    type="button"
                    onClick={handleCreateSupplierInline}
                    className="px-3 py-1.5 bg-[#025033] text-white rounded-xl text-xs font-bold"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(parseInt(e.target.value) || '')}
                className="w-full bg-white border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-semibold text-[#025033] focus:outline-none focus:border-[#025033]"
              >
                <option value="">Select a supplier (or cash purchase)</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ''} · Payable: ৳{Math.round(s.payable_balance_taka || 0)}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Product Selection */}
          <div>
            <label className="block text-xs font-bold text-[#025033] mb-1">Product Details</label>
            <select
              value={productId}
              onChange={(e) => setProductId(parseInt(e.target.value))}
              className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-semibold text-[#025033] focus:outline-none focus:border-[#025033]"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku || `ID #${p.id}`}) — Current Stock: {p.stock_qty || 0}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity & Unit Cost */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#025033] mb-1">Quantity Received</label>
              <input
                type="number"
                placeholder="e.g. 50"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                min="1"
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#025033] mb-1">Unit Cost (৳)</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 280"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                required
                min="0.01"
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
          </div>

          {/* Total Value & Payment Split */}
          <div className="p-3.5 bg-[#E6F7EF] border border-[#CAE4D8] rounded-2xl flex items-center justify-between text-xs">
            <div>
              <span className="text-[#3A8067] font-semibold block text-[11px]">Total Batch Cost</span>
              <span className="text-base font-black text-[#025033]">
                ৳{totalBatchCost.toLocaleString('en-US')}
              </span>
            </div>
            <div className="text-right">
              <span className="text-[#3A8067] font-semibold block text-[11px]">
                {balanceRemaining > 0 ? 'Payable Balance' : 'Fully Paid'}
              </span>
              <span className={`text-base font-black ${balanceRemaining > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                ৳{balanceRemaining.toLocaleString('en-US')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#025033] mb-1">Amount Paid (৳)</label>
              <input
                type="number"
                step="any"
                placeholder="0 for credit"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#025033] mb-1">Purchase Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] focus:outline-none focus:border-[#025033]"
              />
            </div>
          </div>

          {/* Memo Photo Upload (PDF Requirement 7) */}
          <div>
            <label className="block text-xs font-bold text-[#025033] mb-1">
              Supplier Memo / Invoice Photo
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {memoFileName ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-white border border-[#CAE4D8]">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-lg">📄</span>
                  <span className="text-xs font-bold text-[#025033] truncate">{memoFileName}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMemoFileName(null);
                    setMemoPreview(null);
                  }}
                  className="text-xs font-bold text-red-600 hover:underline shrink-0 ml-2"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 border border-dashed border-[#CAE4D8] rounded-xl bg-[#FAFCF9] hover:bg-[#E6F7EF] text-xs font-bold text-[#025033] flex items-center justify-center gap-2 transition"
              >
                <span>📷 Upload Memo / Receipt Photo</span>
              </button>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] font-bold text-xs py-3 rounded-xl transition shadow-xs flex items-center justify-center gap-1.5"
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
