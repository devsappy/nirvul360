'use strict';
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import { User, PosProductItem, PosOrdersSummary, PosRecentOrder } from '@/types';

interface PosViewProps {
  user?: User | null;
  onRefresh?: () => void;
  counterName?: string;
  merchantName?: string;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface CartItem {
  product: PosProductItem;
  qty: number;
}

interface ReceiptData {
  receipt_no: string;
  order_id: number;
  date: string;
  time: string;
  customer_name: string;
  customer_phone?: string;
  payment_method: string;
  items: Array<{
    name: string;
    sku: string;
    qty: number;
    unit_price: number;
    line_total: number;
    remaining_stock: number;
  }>;
  items_count: number;
  subtotal: number;
  discount: number;
  total: number;
  tendered: number;
  change: number;
  note?: string;
}

export function PosView({ user, onRefresh, counterName, merchantName, showToast }: PosViewProps) {
  // State
  const [products, setProducts] = useState<PosProductItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Card'>('Cash');
  const [customerName, setCustomerName] = useState('');
  const [discountStr, setDiscountStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Summary & Recent Orders
  const [summary, setSummary] = useState<PosOrdersSummary>({
    today_orders_count: 0,
    today_revenue_bdt: 0,
    cash_taken_bdt: 0,
    bkash_taken_bdt: 0,
    total_pos_orders: 0,
  });
  const [recentOrders, setRecentOrders] = useState<PosRecentOrder[]>([]);
  const [stockSyncTime, setStockSyncTime] = useState<string>('just now');

  // Modals
  const [receiptModalData, setReceiptModalData] = useState<ReceiptData | null>(null);
  const [isCashDrawerOpen, setIsCashDrawerOpen] = useState(false);
  const [isSalesModalOpen, setIsSalesModalOpen] = useState(false);

  // Cash drawer count states
  const [drawerNotes, setDrawerNotes] = useState({ 1000: 0, 500: 0, 100: 0, 50: 0, 20: 0, 10: 0 });

  // Sale metadata
  const startTime = useMemo(() => {
    const d = new Date();
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = async () => {
    try {
      const data = await api.get<{ products: PosProductItem[]; total: number }>('/api/pos/products');
      setProducts(data.products || []);
      const d = new Date();
      setStockSyncTime(
        d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' +
        d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      );
    } catch (err) {
      console.error('Failed to load POS products', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const data = await api.get<{ orders: PosRecentOrder[]; summary: PosOrdersSummary }>('/api/pos/orders?limit=20');
      setRecentOrders(data.orders || []);
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error('Failed to load POS orders', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchProducts(), fetchOrders()]).finally(() => setLoading(false));
  }, []);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase().trim();
    return products.filter(
      p => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q))
    );
  }, [products, searchQuery]);

  // Cart operations
  const addToCart = (product: PosProductItem) => {
    setCart(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart(prev => {
      return prev
        .map(item => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null);
    });
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const handleNewSale = () => {
    setCart([]);
    setCustomerName('');
    setDiscountStr('');
    setSearchQuery('');
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  // Calculations for current sale
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.selling_price_bdt * item.qty, 0);
  }, [cart]);

  const discount = useMemo(() => {
    const val = parseFloat(discountStr);
    return isNaN(val) || val < 0 ? 0 : Math.min(val, subtotal);
  }, [discountStr, subtotal]);

  const toPay = useMemo(() => {
    return Math.max(0, subtotal - discount);
  }, [subtotal, discount]);

  const totalUnits = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.qty, 0);
  }, [cart]);

  const totalCogs = useMemo(() => {
    return cart.reduce((sum, item) => {
      const cost = item.product.cost_price ? item.product.cost_price / 100 : 0;
      return sum + cost * item.qty;
    }, 0);
  }, [cart]);

  const profitOnThisSale = useMemo(() => {
    return toPay - totalCogs;
  }, [toPay, totalCogs]);

  const nextSalePreview = useMemo(() => {
    const topId = recentOrders.length > 0 ? recentOrders[0].id : summary.total_pos_orders || 0;
    return String(topId + 1).padStart(4, '0');
  }, [recentOrders, summary]);

  // Checkout submission
  const handleTakePayment = async () => {
    if (cart.length === 0) {
      if (showToast) showToast('Cart is empty. Add products to continue.', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        items: cart.map(item => ({
          product_id: item.product.id,
          qty: item.qty,
          unit_price: item.product.selling_price_bdt,
        })),
        customer_name: customerName.trim() || 'Walk-in Customer',
        discount: discount,
        payment_method: paymentMethod.toLowerCase(),
        tendered: toPay,
      };

      const data = await api.post<ReceiptData>('/api/pos/checkout', payload);

      setReceiptModalData(data);
      if (showToast) showToast(`Payment taken: ৳${toPay.toLocaleString()} via ${paymentMethod}`, 'success');

      // Clear current sale
      handleNewSale();
      // Refresh inventory & orders summary
      fetchProducts();
      fetchOrders();
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Payment failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }, []);

  const totalCashDrawer = useMemo(() => {
    return (
      drawerNotes[1000] * 1000 +
      drawerNotes[500] * 500 +
      drawerNotes[100] * 100 +
      drawerNotes[50] * 50 +
      drawerNotes[20] * 20 +
      drawerNotes[10] * 10
    );
  }, [drawerNotes]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header & Telemetry */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">POS / offline store</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            {counterName || merchantName || 'Retail Register'} · {summary.today_orders_count} {summary.today_orders_count === 1 ? 'sale' : 'sales'} today · stock figures synced {stockSyncTime}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsSalesModalOpen(true)}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Today&apos;s sales
          </button>
          <button
            type="button"
            onClick={() => setIsCashDrawerOpen(true)}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Open cash drawer count
          </button>
          <button
            type="button"
            onClick={handleNewSale}
            className="px-4 py-2 text-xs font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New sale
          </button>
        </div>
      </div>

      {/* 65% / 35% Split Screen Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel (~65% width: 8 of 12 columns on lg) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
            {/* Counter Sale Subheader */}
            <div className="p-5 border-b border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAFCF9]">
              <div>
                <h2 className="text-base font-bold text-[#111827]">Counter sale</h2>
                <p className="text-xs text-[#6B7280]">
                  Sale POS-{nextSalePreview} · started {startTime}
                </p>
              </div>
              <div className="w-full sm:w-64">
                <div className="relative">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Scan or search SKU"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                  />
                  <svg className="w-3.5 h-3.5 text-[#9CA3AF] absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* 4-Column Quick-Add SKU Tiles Grid */}
            <div className="p-5 border-b border-[#E5EAE7]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-72 overflow-y-auto pr-1">
                {loading ? (
                  <div className="col-span-4 py-8 text-center text-xs text-[#6B7280]">
                    Loading products...
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="col-span-4 py-8 text-center text-xs text-[#6B7280]">
                    No products matching search query.
                  </div>
                ) : (
                  filteredProducts.map((p) => {
                    const hasCost = p.cost_price !== null && p.cost_price > 0;
                    const isUncosted = !hasCost;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        className={`p-3 rounded-xl text-left border transition-all hover:shadow-xs flex flex-col justify-between ${
                          isUncosted
                            ? 'bg-[#FFFBEB] border-[#F59E0B] hover:border-[#D97706]'
                            : 'bg-white border-[#E5EAE7] hover:border-[#025033]'
                        }`}
                      >
                        <div>
                          <div className="font-semibold text-xs text-[#111827] line-clamp-1">{p.name}</div>
                          <div className={`text-[11px] mt-0.5 ${isUncosted ? 'text-[#D97706] font-medium' : 'text-[#6B7280]'}`}>
                            {isUncosted ? `${p.sku || 'SKU'} · no cost price` : `${p.sku || 'SKU'} · ${p.stock_qty} left`}
                          </div>
                        </div>
                        <div className="mt-2 font-bold text-xs text-[#025033]">
                          ৳{p.selling_price_bdt.toLocaleString()}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active Cart Section */}
            <div className="p-5 border-b border-[#E5EAE7]">
              <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-3">
                CART ({cart.length} {cart.length === 1 ? 'item' : 'items'})
              </div>

              {cart.length === 0 ? (
                <div className="py-8 text-center text-xs text-[#6B7280] bg-[#FAFCF9] rounded-xl border border-dashed border-[#E5EAE7]">
                  Cart is empty. Tap any product tile above or scan a barcode to add.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAFCF9] text-[#6B7280] border-b border-[#E5EAE7]">
                      <tr>
                        <th scope="col" className="pb-2 font-semibold">ITEM</th>
                        <th scope="col" className="pb-2 font-semibold text-center">QTY</th>
                        <th scope="col" className="pb-2 font-semibold text-right">PRICE</th>
                        <th scope="col" className="pb-2 font-semibold text-right">LINE TOTAL</th>
                        <th scope="col" className="pb-2 font-semibold text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5EAE7]">
                      {cart.map((item) => (
                        <tr key={item.product.id}>
                          <td className="py-2.5 pr-2">
                            <div className="font-semibold text-[#111827]">{item.product.name}</div>
                            <div className="text-[10px] text-[#6B7280]">{item.product.sku || 'SKU'}</div>
                          </td>
                          <td className="py-2.5 text-center">
                            <div className="inline-flex items-center border border-[#D1D5DB] rounded-lg overflow-hidden bg-white">
                              <button
                                type="button"
                                onClick={() => updateCartQty(item.product.id, -1)}
                                className="px-2 py-0.5 hover:bg-[#F3F4F6] text-[#374151]"
                              >
                                -
                              </button>
                              <span className="px-2 py-0.5 font-semibold text-[#111827] min-w-[24px]">
                                {item.qty}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCartQty(item.product.id, 1)}
                                className="px-2 py-0.5 hover:bg-[#F3F4F6] text-[#374151]"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 text-right font-medium text-[#4B5563]">
                            ৳{item.product.selling_price_bdt.toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right font-bold text-[#111827]">
                            ৳{(item.product.selling_price_bdt * item.qty).toLocaleString()}
                          </td>
                          <td className="py-2.5 text-right pl-2">
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.product.id)}
                              className="text-[#9CA3AF] hover:text-[#DC2626] font-medium"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Checkout Controls */}
            <div className="p-5 bg-[#FAFCF9] grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              {/* Payment Method & Customer */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-1.5">
                    PAYMENT METHOD
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['Cash', 'bKash', 'Nagad', 'Card'] as const).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 text-xs font-semibold rounded-xl border transition-colors ${
                          paymentMethod === method
                            ? 'bg-[#025033] text-white border-[#025033] shadow-2xs'
                            : 'bg-white text-[#374151] border-[#D1D5DB] hover:bg-[#F3F4F6]'
                        }`}
                      >
                        {method}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                      Customer (optional)
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. মারুফ"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                      Discount (৳)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={discountStr}
                      onChange={(e) => setDiscountStr(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                    />
                  </div>
                </div>
              </div>

              {/* Totals & Take Payment CTA */}
              <div className="space-y-2 bg-white p-4 rounded-xl border border-[#E5EAE7]">
                <div className="flex justify-between text-xs text-[#4B5563]">
                  <span>Subtotal</span>
                  <span className="font-semibold text-[#111827]">৳{subtotal.toLocaleString()}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-[#DC2626]">
                    <span>Discount</span>
                    <span className="font-semibold">-৳{discount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-[#6B7280]">
                  <span>VAT</span>
                  <span className="italic">not in use yet</span>
                </div>
                <div className="pt-2 border-t border-[#E5EAE7] flex justify-between items-baseline">
                  <span className="text-sm font-bold text-[#111827]">TO PAY</span>
                  <span className="text-xl font-extrabold text-[#025033]">৳{toPay.toLocaleString()}</span>
                </div>

                <button
                  type="button"
                  disabled={cart.length === 0 || isSubmitting}
                  onClick={handleTakePayment}
                  className="w-full mt-3 py-2.5 text-sm font-bold text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
                >
                  {isSubmitting ? 'Processing sale...' : 'Take payment & print'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel (~35% width: 4 of 12 columns on lg) — 3 Stacked Cards */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card 1: Today at the counter */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <h3 className="text-sm font-bold text-[#111827]">Today at the counter</h3>
              <span className="text-xs text-[#6B7280]">{todayFormatted}, so far</span>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-3">
              <div>
                <div className="text-[11px] text-[#6B7280]">Sales</div>
                <div className="text-lg font-bold text-[#111827]">{summary.today_orders_count}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#6B7280]">Value</div>
                <div className="text-lg font-bold text-[#111827]">৳{summary.today_revenue_bdt.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#6B7280]">Cash taken</div>
                <div className="text-base font-semibold text-[#025033]">৳{summary.cash_taken_bdt.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#6B7280]">bKash taken</div>
                <div className="text-base font-semibold text-[#025033]">৳{summary.bkash_taken_bdt.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Card 2: Recent counter sales */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <h3 className="text-sm font-bold text-[#111827]">Recent counter sales</h3>
              <button
                type="button"
                onClick={() => setIsSalesModalOpen(true)}
                className="text-xs text-[#025033] font-medium hover:underline"
              >
                See all
              </button>
            </div>
            <div className="pt-2">
              {recentOrders.length === 0 ? (
                <div className="py-6 text-center text-xs text-[#6B7280]">No recent counter sales.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-[10px] text-[#6B7280] font-semibold uppercase">
                      <tr>
                        <th className="py-1.5">SALE</th>
                        <th className="py-1.5">TIME</th>
                        <th className="py-1.5">PAID BY</th>
                        <th className="py-1.5 text-right">VALUE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5EAE7]">
                      {recentOrders.slice(0, 5).map((order) => (
                        <tr key={order.id} className="hover:bg-[#FAFCF9]">
                          <td className="py-2 font-mono font-medium text-[#111827]">{order.external_id}</td>
                          <td className="py-2 text-[#6B7280]">{order.time || '—'}</td>
                          <td className="py-2 text-[#4B5563]">{order.payment_method || 'Cash'}</td>
                          <td className="py-2 text-right font-semibold text-[#111827]">
                            ৳{order.total_bdt.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Where this sale lands (Educational live double-entry flow) */}
          <div className="bg-white rounded-2xl border border-[#E5EAE7] p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#E5EAE7]">
              <div>
                <h3 className="text-sm font-bold text-[#111827]">Where this sale lands</h3>
                <p className="text-[11px] text-[#6B7280]">On taking payment</p>
              </div>
              <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#4B5563]">Revenue, recognised now</span>
                <span className="font-semibold text-[#10B981]">+৳{toPay.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#4B5563]">Cost of goods sold</span>
                <span className="font-semibold text-[#DC2626]">
                  {totalCogs > 0 ? `-৳${totalCogs.toLocaleString()}` : '৳0'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#4B5563]">Cash &amp; bank</span>
                <span className="font-semibold text-[#10B981]">+৳{toPay.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#4B5563]">Stock on hand</span>
                <span className="font-semibold text-[#DC2626]">
                  {totalUnits > 0 ? `-${totalUnits} units` : '0 units'}
                </span>
              </div>

              <div className="pt-2 border-t border-[#E5EAE7] flex justify-between items-center font-bold">
                <span className="text-[#111827]">Profit on this sale</span>
                <span className={profitOnThisSale >= 0 ? 'text-[#025033]' : 'text-[#DC2626]'}>
                  ৳{profitOnThisSale.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-3 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7] text-[11px] text-[#4B5563] leading-relaxed">
              A counter sale is delivered the moment it is paid, so revenue is recognised at once — no courier, no COD fee and no return leg. It joins the same ledger as the online orders.
            </div>
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {receiptModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-[#E5EAE7] text-xs">
            <div className="text-center pb-3 border-b border-[#E5EAE7]">
              <div className="font-bold text-base text-[#111827]">{merchantName || 'Gross Management'}</div>
              <div className="text-[11px] text-[#6B7280]">{counterName || 'Counter Register'}</div>
              <div className="mt-1 font-mono font-semibold text-[#025033]">{receiptModalData.receipt_no}</div>
              <div className="text-[10px] text-[#9CA3AF]">{receiptModalData.date} · {receiptModalData.time.split('T')[1]?.substring(0, 5) || ''}</div>
            </div>

            <div className="py-3 border-b border-[#E5EAE7] space-y-1.5">
              <div className="flex justify-between text-[#6B7280]">
                <span>Customer</span>
                <span className="font-medium text-[#111827]">{receiptModalData.customer_name}</span>
              </div>
              <div className="flex justify-between text-[#6B7280]">
                <span>Payment</span>
                <span className="font-medium text-[#111827]">{receiptModalData.payment_method.toUpperCase()}</span>
              </div>
              <div className="flex justify-between text-[#6B7280]">
                <span>Cashier</span>
                <span className="font-medium text-[#111827]">{user?.name || 'Counter Staff'}</span>
              </div>
            </div>

            <div className="py-3 border-b border-[#E5EAE7] space-y-2">
              {receiptModalData.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <div>
                    <div className="font-medium text-[#111827]">{it.name}</div>
                    <div className="text-[10px] text-[#6B7280]">{it.qty} × ৳{it.unit_price}</div>
                  </div>
                  <div className="font-semibold text-[#111827]">৳{it.line_total}</div>
                </div>
              ))}
            </div>

            <div className="py-3 border-b border-[#E5EAE7] space-y-1 font-medium">
              <div className="flex justify-between text-[#4B5563]">
                <span>Subtotal</span>
                <span>৳{receiptModalData.subtotal}</span>
              </div>
              {receiptModalData.discount > 0 && (
                <div className="flex justify-between text-[#DC2626]">
                  <span>Discount</span>
                  <span>-৳{receiptModalData.discount}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-sm text-[#025033] pt-1">
                <span>TOTAL</span>
                <span>৳{receiptModalData.total}</span>
              </div>
            </div>

            <div className="pt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 text-center font-medium text-[#025033] bg-[#E6F7EF] rounded-xl hover:bg-[#D5EFE3]"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceiptModalData(null)}
                className="flex-1 py-2 text-center font-medium text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Count Modal */}
      {isCashDrawerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5EAE7]">
            <h3 className="text-base font-bold text-[#111827] mb-1">Cash drawer count</h3>
            <p className="text-xs text-[#6B7280] mb-4">
              Count currency notes currently in the register drawer.
            </p>

            <div className="space-y-2 text-xs">
              {[1000, 500, 100, 50, 20, 10].map((denomination) => (
                <div key={denomination} className="flex items-center justify-between">
                  <span className="font-medium text-[#374151]">৳{denomination} notes</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={drawerNotes[denomination as keyof typeof drawerNotes] || ''}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setDrawerNotes(prev => ({ ...prev, [denomination]: val }));
                      }}
                      className="w-20 px-2 py-1 text-right border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#025033]"
                    />
                    <span className="w-16 text-right font-semibold text-[#111827]">
                      ৳{((drawerNotes[denomination as keyof typeof drawerNotes] || 0) * denomination).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-[#E5EAE7] flex justify-between items-baseline">
              <span className="text-xs font-bold text-[#111827]">Total in drawer</span>
              <span className="text-base font-bold text-[#025033]">৳{totalCashDrawer.toLocaleString()}</span>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCashDrawerOpen(false)}
                className="px-4 py-2 text-xs font-medium text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
              >
                Close count
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Today's Sales Full List Modal */}
      {isSalesModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl border border-[#E5EAE7] max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <div>
                <h3 className="text-base font-bold text-[#111827]">Today&apos;s counter sales</h3>
                <p className="text-xs text-[#6B7280]">
                  {summary.today_orders_count} sales · ৳{summary.today_revenue_bdt.toLocaleString()} total revenue
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsSalesModalOpen(false)}
                className="text-[#9CA3AF] hover:text-[#111827] text-xl font-bold px-2"
              >
                &times;
              </button>
            </div>

            <div className="overflow-y-auto py-3 flex-1">
              {recentOrders.length === 0 ? (
                <p className="text-xs text-[#6B7280] text-center py-6">No sales recorded today.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAFCF9] text-[#6B7280] font-semibold border-b border-[#E5EAE7]">
                    <tr>
                      <th className="px-3 py-2">RECEIPT</th>
                      <th className="px-3 py-2">CUSTOMER</th>
                      <th className="px-3 py-2">METHOD</th>
                      <th className="px-3 py-2">ITEMS</th>
                      <th className="px-3 py-2 text-right">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAE7]">
                    {recentOrders.map(order => (
                      <tr key={order.id} className="hover:bg-[#FAFCF9]">
                        <td className="px-3 py-2 font-mono font-medium text-[#025033]">{order.external_id}</td>
                        <td className="px-3 py-2">{order.customer_name}</td>
                        <td className="px-3 py-2">{order.payment_method}</td>
                        <td className="px-3 py-2">{order.items_count} units</td>
                        <td className="px-3 py-2 text-right font-bold text-[#111827]">৳{order.total_bdt.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="pt-3 border-t border-[#E5EAE7] text-right">
              <button
                type="button"
                onClick={() => setIsSalesModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-white bg-[#025033] rounded-xl hover:bg-[#033E28]"
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
