'use client';

import React, { useState, useEffect, useRef } from 'react';
import { apiSuppliers, formatTaka } from '@/lib/api';
import { SupplierItem, SupplierStatementData, MemoDraftData } from '@/types';

interface SuppliersViewProps {
  products?: any[];
  onOpenNewPurchase?: () => void;
}

export function SuppliersView({ products: propsProducts, onOpenNewPurchase }: SuppliersViewProps) {
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [statement, setStatement] = useState<SupplierStatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [statementLoading, setStatementLoading] = useState(false);
  const [productList, setProductList] = useState<any[]>(propsProducts || []);

  // New Purchase Form state
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<number | ''>('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchCode, setBatchCode] = useState(() => `PB-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`);
  const [productId, setProductId] = useState<number | ''>('');
  const [productSku, setProductSku] = useState('');
  const [productPreviousCost, setProductPreviousCost] = useState(0);
  const [qty, setQty] = useState<number | ''>(1);
  const [unitCost, setUnitCost] = useState<number | ''>('');
  const [paidAmount, setPaidAmount] = useState<number | ''>(0);
  const [isSavingPurchase, setIsSavingPurchase] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState('');
  const purchaseFormRef = useRef<HTMLDivElement>(null);
  const memoFileInputRef = useRef<HTMLInputElement>(null);

  // Record Payment Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);

  // Add Supplier Modal State (PDF Requirement 7)
  const [addSupplierModalOpen, setAddSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState('');
  const [newSupPhone, setNewSupPhone] = useState('');
  const [newSupAddress, setNewSupAddress] = useState('');
  const [newSupTerms, setNewSupTerms] = useState('30');
  const [newSupCategory, setNewSupCategory] = useState('');
  const [isSavingSupplier, setIsSavingSupplier] = useState(false);

  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) return;
    setIsSavingSupplier(true);
    try {
      await apiSuppliers.create({
        name: newSupName.trim(),
        phone: newSupPhone.trim() || undefined,
        address: newSupAddress.trim() || undefined,
        terms_days: parseInt(newSupTerms, 10) || 30,
        categories_summary: newSupCategory.trim() || undefined,
      });
      setAddSupplierModalOpen(false);
      setNewSupName('');
      setNewSupPhone('');
      setNewSupAddress('');
      setNewSupCategory('');
      await loadSuppliers();
    } catch (err: any) {
      alert(err.message || 'Failed to add supplier');
    } finally {
      setIsSavingSupplier(false);
    }
  };

  // OCR Memo Draft State initialized cleanly as null
  const [memoDraft, setMemoDraft] = useState<MemoDraftData | null>(null);

  useEffect(() => {
    if (propsProducts && propsProducts.length > 0) {
      setProductList(propsProducts);
      if (productId === '') {
        setProductId(propsProducts[0].id);
        setProductSku(propsProducts[0].sku || '');
        const cost = propsProducts[0].purchase_price ? propsProducts[0].purchase_price / 100 : (propsProducts[0].cost_price ? propsProducts[0].cost_price / 100 : 0);
        setProductPreviousCost(cost);
      }
    } else {
      import('@/lib/api').then(({ api }) => {
        api.get<any>('/api/products').then((res) => {
          const list = Array.isArray(res) ? res : (res?.rows || res?.products || []);
          if (Array.isArray(list) && list.length > 0) {
            setProductList(list);
            if (productId === '') {
              setProductId(list[0].id);
              setProductSku(list[0].sku || '');
              const cost = list[0].purchase_price ? list[0].purchase_price / 100 : (list[0].cost_price ? list[0].cost_price / 100 : 0);
              setProductPreviousCost(cost);
            }
          }
        }).catch(() => {});
      });
    }
  }, [propsProducts, productId]);

  const handleMemoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const supName = suppliers.find((s) => s.id === purchaseSupplierId)?.name || 'Selected Supplier';
    const activeProd = productList.find((p) => p.id === productId);
    const prodName = activeProd ? `${activeProd.name} (${activeProd.sku})` : 'Catalog Item';
    const uCost = Number(unitCost) || productPreviousCost || 0;
    const q = Number(qty) || 1;
    setMemoDraft({
      id: Date.now(),
      fileName: file.name,
      supplier_name: supName,
      date: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      item_name: prodName,
      unit_cost_taka: uCost,
      total_cost_taka: uCost * q,
    });
  };

  const loadSuppliers = React.useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiSuppliers.list();
      const list = res.suppliers || [];
      setSuppliers(list);
      if (list.length > 0 && selectedSupplierId === null) {
        setSelectedSupplierId(list[0].id);
        setPurchaseSupplierId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load suppliers', err);
    } finally {
      setLoading(false);
    }
  }, [selectedSupplierId]);

  const loadStatement = React.useCallback(async (supplierId: number) => {
    try {
      setStatementLoading(true);
      const res = await apiSuppliers.getStatement(supplierId);
      setStatement(res);
    } catch (err) {
      console.error('Failed to load supplier statement', err);
    } finally {
      setStatementLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (selectedSupplierId) {
      loadStatement(selectedSupplierId);
      setPurchaseSupplierId(selectedSupplierId);
    }
  }, [selectedSupplierId, loadStatement]);

  const totalPayablePoisha = suppliers.reduce((sum, s) => sum + (s.payable_balance_poisha || 0), 0);
  const totalAdvancesPoisha = suppliers.reduce((sum, s) => sum + (s.advance_balance_poisha || 0), 0);

  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) || suppliers[0];

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseSupplierId || !productId || !qty || !unitCost) return;

    setIsSavingPurchase(true);
    setPurchaseSuccess('');
    try {
      await apiSuppliers.createPurchase({
        supplierId: Number(purchaseSupplierId),
        productId: Number(productId),
        qty: Number(qty),
        unitCost: Number(unitCost),
        date: purchaseDate,
        paidAmount: Number(paidAmount || 0),
      });
      setPurchaseSuccess('Purchase saved & stock updated.');
      setTimeout(() => setPurchaseSuccess(''), 3000);
      await loadSuppliers();
      if (selectedSupplierId) await loadStatement(selectedSupplierId);
    } catch (err: any) {
      alert(err.message || 'Failed to save purchase');
    } finally {
      setIsSavingPurchase(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !paymentAmount) return;

    setIsSubmittingPayment(true);
    try {
      await apiSuppliers.paySupplier({
        supplierId: selectedSupplierId,
        amount: parseFloat(paymentAmount),
        date: paymentDate,
        note: paymentNote,
      });
      setPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentNote('');
      await loadSuppliers();
      await loadStatement(selectedSupplierId);
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const calculatedBatchTotal = (Number(qty) || 0) * (Number(unitCost) || 0);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Suppliers &amp; purchases</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatTaka(totalPayablePoisha)} payable across {suppliers.length} suppliers · ledger last synced today, 02:15
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setAddSupplierModalOpen(true)}
            className="border border-[#025033] bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] px-3.5 py-2 rounded-xl text-xs font-bold shadow-2xs transition"
          >
            + Add supplier
          </button>
          <button
            onClick={() => setPaymentModalOpen(true)}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Record payment
          </button>
          <button
            onClick={() => (onOpenNewPurchase ? onOpenNewPurchase() : purchaseFormRef.current?.scrollIntoView({ behavior: 'smooth' }))}
            className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
          >
            New purchase
          </button>
        </div>
      </div>

      {/* 3-Pane Layout matching Improvements/2.jpeg */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Pane 1: Suppliers Master List (~25% width / col-span-3) */}
        <div className="lg:col-span-3 flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden flex flex-col">
            <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Suppliers</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {suppliers.length}
                </span>
              </div>
              <button
                onClick={() => setAddSupplierModalOpen(true)}
                className="text-xs font-bold text-[#025033] hover:underline"
              >
                + Add
              </button>
            </div>

            {/* Vendor Items List */}
            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {loading && suppliers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">Loading suppliers...</div>
              ) : (
                suppliers.map((s) => {
                const isSelected = s.id === selectedSupplierId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedSupplierId(s.id)}
                    className={`w-full text-left p-3.5 transition flex flex-col gap-1 border-l-4 ${
                      isSelected
                        ? 'bg-[#E6F7EF] border-[#025033]'
                        : 'border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold truncate ${isSelected ? 'text-[#025033]' : 'text-slate-900'}`}>
                        {s.name}
                      </span>
                      <span className="text-xs font-bold text-slate-900 shrink-0 ml-2">
                        {formatTaka(s.payable_balance_poisha)}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight">
                      Payable · {s.advance_balance_poisha > 0 ? `advance paid ${formatTaka(s.advance_balance_poisha)}` : 'no advance'} · {s.categories_summary || 'General fabrics'}
                    </span>
                  </button>
                );
              }))}
            </div>

            {/* Bottom Dark Banner */}
            <div className="p-3.5 bg-[#062E1F] text-white flex flex-col gap-1 text-[11px] font-semibold border-t border-[#0A3725]">
              <div className="flex items-center justify-between">
                <span className="text-[#8CAFA0]">TOTAL PAYABLE</span>
                <span className="font-bold">{formatTaka(totalPayablePoisha)}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-[#8CAFA0]">
                <span>Advances paid out</span>
                <span>{formatTaka(totalAdvancesPoisha)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pane 2: Selected Supplier Statement & Running Ledger (~42% width / col-span-5) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-5">
            {/* Vendor Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex flex-col">
                <h2 className="text-base font-bold text-slate-900">{selectedSupplier?.name || 'Supplier'}</h2>
                <span className="text-xs text-slate-500 mt-0.5">
                  {[selectedSupplier?.address, selectedSupplier?.phone].filter(Boolean).join(' · ')}{selectedSupplier?.terms_days ? ` · ${selectedSupplier.terms_days}d terms` : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                  Payable {formatTaka(selectedSupplier?.payable_balance_poisha)}
                </span>
                <button
                  onClick={() => window.print()}
                  className="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700"
                >
                  Statement
                </button>
              </div>
            </div>

            {/* Section 1: PURCHASE BATCHES */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  PURCHASE BATCHES
                </span>
                {statementLoading && (
                  <span className="text-[10px] text-slate-400">Syncing statement...</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                      <th className="py-2 px-2">BATCH</th>
                      <th className="py-2 px-2">DATE</th>
                      <th className="py-2 px-2">ITEMS</th>
                      <th className="py-2 px-2 text-right">VALUE</th>
                      <th className="py-2 px-2 text-right">STATUS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {statement?.batches && statement.batches.length > 0 ? (
                      statement.batches.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-2 font-semibold text-slate-800">{b.batch_no}</td>
                          <td className="py-2.5 px-2 text-slate-500 whitespace-nowrap">{b.purchase_date}</td>
                          <td className="py-2.5 px-2 text-slate-600 truncate max-w-[130px]">{b.items_summary}</td>
                          <td className="py-2.5 px-2 text-right font-semibold text-slate-900">{formatTaka(b.total_cost_poisha)}</td>
                          <td className="py-2.5 px-2 text-right">
                            {renderBatchStatusBadge(b.status)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          No purchase batches recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Section 2: PAYMENTS & RUNNING BALANCE */}
            <div className="flex flex-col gap-2.5 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                PAYMENTS &amp; RUNNING BALANCE
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                      <th className="py-2 px-2">DATE</th>
                      <th className="py-2 px-2">ENTRY</th>
                      <th className="py-2 px-2">METHOD</th>
                      <th className="py-2 px-2 text-right">AMOUNT</th>
                      <th className="py-2 px-2 text-right">BALANCE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-normal">
                    {statement?.ledger && statement.ledger.length > 0 ? (
                      statement.ledger.map((l) => {
                        const isPayment = l.amount_poisha < 0 || l.kind === 'payment';
                        return (
                          <tr key={l.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-2 text-slate-500 whitespace-nowrap">{l.date}</td>
                            <td className="py-2.5 px-2 text-slate-800 font-medium">{l.entry}</td>
                            <td className="py-2.5 px-2 text-slate-500 capitalize">{l.method || 'bKash'}</td>
                            <td className={`py-2.5 px-2 text-right font-semibold ${isPayment ? 'text-emerald-700' : 'text-slate-900'}`}>
                              {isPayment ? `-${formatTaka(Math.abs(l.amount_poisha))}` : formatTaka(l.amount_poisha)}
                            </td>
                            <td className="py-2.5 px-2 text-right font-bold text-slate-900">
                              {formatTaka(l.balance_poisha)}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-slate-400">
                          No ledger timeline records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Advance Footnote */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600 leading-relaxed flex items-center justify-between">
              <span>
                {statement?.advance_note || (
                  ((statement?.supplier?.advance_balance_poisha ?? selectedSupplier?.advance_balance_poisha ?? 0) > 0)
                    ? `An advance of ${formatTaka(statement?.supplier?.advance_balance_poisha ?? selectedSupplier?.advance_balance_poisha)} is recorded with this supplier.`
                    : 'No unbilled advance payments pending for this vendor.'
                )}
              </span>
              <span className="font-bold text-slate-900 shrink-0 ml-3">
                {formatTaka(selectedSupplier?.payable_balance_poisha)}
              </span>
            </div>
          </div>
        </div>

        {/* Pane 3: New Purchase Form & Memo OCR Draft (~33% width / col-span-4) */}
        <div ref={purchaseFormRef} className="lg:col-span-4 flex flex-col gap-6">
          {/* Card: New purchase */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3.5">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-sm font-bold text-slate-900">New purchase</span>
              <span className="text-[10px] font-semibold text-slate-500">Posts to stock on save</span>
            </div>

            {purchaseSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                ✓ {purchaseSuccess}
              </div>
            )}

            <form onSubmit={handleSavePurchase} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600">Supplier</label>
                <select
                  value={purchaseSupplierId}
                  onChange={(e) => setPurchaseSupplierId(Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Purchase date</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Batch code</label>
                  <input
                    type="text"
                    value={batchCode}
                    onChange={(e) => setBatchCode(e.target.value)}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600">Product SKU</label>
                <select
                  value={productId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setProductId(id);
                    const prod = productList.find((p) => p.id === id);
                    if (prod) {
                      setProductSku(prod.sku || '');
                      const cost = prod.purchase_price ? prod.purchase_price / 100 : (prod.cost_price ? prod.cost_price / 100 : 0);
                      setProductPreviousCost(cost);
                      if (!unitCost || unitCost === 0) {
                        setUnitCost(cost || '');
                      }
                    }
                  }}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                >
                  {productList.length === 0 ? (
                    <option value="">No products in catalog</option>
                  ) : (
                    productList.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku ? `${p.sku} — ` : ''}{p.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={qty}
                    onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-semibold text-slate-600">Unit cost (৳)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                  />
                </div>
              </div>

              {/* Dynamic Batch Total */}
              <div className="flex items-center justify-between text-xs py-1 px-3 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-slate-500">Batch total:</span>
                <span className="font-bold text-slate-900">৳{calculatedBatchTotal.toLocaleString()}</span>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-slate-600">Paid upfront now (৳, optional)</label>
                <input
                  type="number"
                  min="0"
                  placeholder="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
                />
              </div>

              {/* FIFO Versioned Cost Price Note */}
              <div className="p-2.5 rounded-xl bg-[#FAFCF9] border border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                Saving opens a new dated cost price of <strong>৳{unitCost || 0}</strong> for <strong>{productSku}</strong> from {purchaseDate}. Orders delivered before then keep <strong>৳{productPreviousCost}</strong>.
              </div>

              {/* Memo Photo OCR Upload Input */}
              <input
                type="file"
                ref={memoFileInputRef}
                accept="image/*,.pdf"
                onChange={handleMemoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => memoFileInputRef.current?.click()}
                className="w-full text-center border border-dashed border-slate-300 hover:border-[#062E1F] bg-slate-50 hover:bg-white text-slate-600 hover:text-slate-900 py-2 rounded-xl text-xs font-semibold transition flex items-center justify-center gap-1.5"
              >
                <span>📷</span>
                <span>Upload memo photo for OCR draft</span>
              </button>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  className="w-1/2 border border-slate-200 hover:bg-slate-50 text-slate-700 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Save draft
                </button>
                <button
                  type="submit"
                  disabled={isSavingPurchase}
                  className="w-1/2 bg-[#062E1F] hover:bg-[#0B3B28] text-white py-2 rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50"
                >
                  {isSavingPurchase ? 'Saving...' : 'Save purchase'}
                </button>
              </div>
            </form>
          </div>

          {/* Card: Memo photo — draft */}
          {memoDraft && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">Memo photo — draft</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  Nothing saved yet
                </span>
              </div>

              {/* Thumbnail representation */}
              <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold shrink-0">
                  📄
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-slate-800 truncate">{memoDraft.fileName}</span>
                  <span className="text-[11px] text-slate-500">Scanned memo image</span>
                </div>
              </div>

              {/* WHAT WE READ */}
              <div className="flex flex-col gap-1.5 pt-1 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">WHAT WE READ</span>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Supplier:</span>
                  <span className="font-semibold text-slate-800">{memoDraft.supplier_name}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-semibold text-slate-800">{memoDraft.date}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Item:</span>
                  <span className="font-semibold text-slate-800">{memoDraft.item_name}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b border-slate-100">
                  <span className="text-slate-500">Unit cost:</span>
                  <span className="font-semibold text-slate-800">৳{memoDraft.unit_cost_taka}</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="text-slate-500">Total:</span>
                  <span className="font-bold text-slate-900">৳{memoDraft.total_cost_taka?.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                <span className="leading-tight">
                  Check every line. The draft is filled in on the left, and nothing reaches the ledger until you press Save purchase.
                </span>
                <button
                  type="button"
                  onClick={() => setMemoDraft(null)}
                  className="text-xs font-semibold text-red-700 hover:underline ml-2 shrink-0"
                >
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Record Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Record supplier payment</h3>
              <button onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleRecordPayment} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Supplier</label>
                <div className="text-xs font-bold text-slate-900 py-1">{selectedSupplier?.name}</div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Amount (৳)</label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="4000"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Payment Date</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Note / Reference</label>
                <input
                  type="text"
                  placeholder="e.g. bKash payment TrxID #892817"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPayment}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold"
                >
                  {isSubmittingPayment ? 'Recording...' : 'Post payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Add Supplier Modal (PDF Requirement 7) */}
      {addSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 border border-[#CAE4D8] max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <div>
                <h3 className="text-base font-extrabold text-[#025033]">Add New Supplier</h3>
                <p className="text-xs text-[#3A8067]">
                  Register vendor for purchasing, fabric batches &amp; running ledger.
                </p>
              </div>
              <button
                onClick={() => setAddSupplierModalOpen(false)}
                className="text-[#3A8067] hover:text-[#025033] text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-bold text-[#025033] mb-1">
                  Supplier Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Noman Fabrics Ltd / Islampur"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-semibold text-[#025033] focus:outline-none focus:border-[#025033]"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#025033] mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 01711-XXXXXX"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#025033] mb-1">Credit Terms (Days)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="30"
                    value={newSupTerms}
                    onChange={(e) => setNewSupTerms(e.target.value)}
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#025033] mb-1">Address / Market Location</label>
                <input
                  type="text"
                  placeholder="e.g. Shop 42, Islampur Market, Dhaka"
                  value={newSupAddress}
                  onChange={(e) => setNewSupAddress(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#025033] mb-1">Material Categories</label>
                <input
                  type="text"
                  placeholder="e.g. Silk, Cotton, Buttons &amp; Zippers"
                  value={newSupCategory}
                  onChange={(e) => setNewSupCategory(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setAddSupplierModalOpen(false)}
                  className="px-4 py-2 border border-[#E5EAE7] rounded-xl text-xs font-bold text-[#3A8067] hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSupplier}
                  className="px-5 py-2 bg-[#025033] hover:bg-[#05572F] text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  {isSavingSupplier ? 'Saving...' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function renderBatchStatusBadge(status: string) {
  const s = status?.toLowerCase() || '';
  if (s === 'paid') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">Paid</span>;
  }
  if (s === 'part_paid') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">Part paid</span>;
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">Unpaid</span>;
}
