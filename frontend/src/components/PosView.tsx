'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { api, formatTaka } from '@/lib/api';
import { User } from '@/types';
import {
  PosIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  SearchIcon,
  CheckIcon,
  AlertIcon,
} from './icons';

interface PosProduct {
  id: number;
  name: string;
  sku: string | null;
  selling_price_bdt: number;
  purchase_price_bdt: number;
  stock_qty: number;
  effective_from: string | null;
  active: number;
  margin_pct: number;
}

interface CartItem {
  product: PosProduct;
  qty: number;
  unit_price: number;
}

interface CompletedReceipt {
  receipt_no: string;
  order_id: number;
  status: string;
  placed_at: string;
  payment_method: string;
  subtotal: number;
  discount: number;
  total: number;
  tendered: number;
  change: number;
  customer_name: string;
  customer_phone?: string;
  items: Array<{
    product_id: number;
    name: string;
    sku: string;
    qty: number;
    unit_price: number;
    line_total: number;
    remaining_stock: number;
  }>;
}

interface PosViewProps {
  user: User | null;
  onRefresh?: () => void;
}

export function PosView({ user, onRefresh }: PosViewProps) {
  const [products, setProducts] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discount, setDiscount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bkash' | 'nagad' | 'card'>('cash');
  const [tendered, setTendered] = useState<string>('');
  const [orderNote, setOrderNote] = useState('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [completedReceipt, setCompletedReceipt] = useState<CompletedReceipt | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [todayOrdersCount, setTodayOrdersCount] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Fetch POS products
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get<{ products: PosProduct[]; total_items: number; in_stock_items: number }>('/api/pos/products');
      setProducts(res?.products || []);
    } catch (err: any) {
      console.error('Failed to load POS catalog:', err);
      showToast(err?.message || 'Failed to load POS catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch POS sales history
  const fetchOrdersHistory = useCallback(async () => {
    try {
      const res = await api.get<{ orders: any[]; total_sales_today: number; total_orders_today: number }>('/api/pos/orders');
      setRecentOrders(res?.orders || []);
      setTodayRevenue(res?.total_sales_today || 0);
      setTodayOrdersCount(res?.total_orders_today || 0);
    } catch (err) {
      console.error('Failed to load POS history:', err);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    fetchOrdersHistory();
  }, [fetchProducts, fetchOrdersHistory]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchQuery =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase())) ||
        String(p.id).includes(searchQuery);

      if (!matchQuery) return false;

      if (stockFilter === 'in_stock') return p.stock_qty > 0;
      if (stockFilter === 'low_stock') return p.stock_qty > 0 && p.stock_qty <= 5;
      if (stockFilter === 'out_of_stock') return p.stock_qty <= 0;

      return true;
    });
  }, [products, searchQuery, stockFilter]);

  // Cart operations
  const addToCart = (product: PosProduct) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      return [...prev, { product, qty: 1, unit_price: product.selling_price_bdt }];
    });
  };

  const updateCartQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.qty + delta;
            return newQty > 0 ? { ...item, qty: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscount('0');
    setTendered('');
    setOrderNote('');
  };

  // Financial calculations
  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + item.unit_price * item.qty, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    const val = parseFloat(discount) || 0;
    return Math.min(subtotal, Math.max(0, val));
  }, [discount, subtotal]);

  const netTotal = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  const changeDue = useMemo(() => {
    const tenderedVal = parseFloat(tendered);
    if (isNaN(tenderedVal) || tenderedVal < netTotal) return 0;
    return Math.round((tenderedVal - netTotal) * 100) / 100;
  }, [tendered, netTotal]);

  // Quick cash buttons
  const handleQuickCash = (amount: number | 'exact') => {
    if (amount === 'exact') {
      setTendered(String(netTotal));
    } else {
      setTendered(String(amount));
    }
  };

  // Submit POS checkout
  const handleCheckout = async () => {
    if (cart.length === 0) {
      showToast('Please add at least one product to the ticket.');
      return;
    }

    const tenderedVal = tendered ? parseFloat(tendered) : netTotal;
    if (paymentMethod === 'cash' && tenderedVal < netTotal) {
      showToast('Cash tendered is less than total payable amount.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        items: cart.map((it) => ({
          product_id: it.product.id,
          qty: it.qty,
          unit_price: it.unit_price,
        })),
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || undefined,
        discount: discountAmount,
        payment_method: paymentMethod,
        tendered: tenderedVal,
        note: orderNote.trim() || 'POS Retail Counter Sale',
      };

      const res = await api.post<CompletedReceipt>('/api/pos/checkout', payload);
      setCompletedReceipt(res);
      showToast(`Sale recorded successfully! Receipt #${res.receipt_no}`);

      // Reset cart and refresh catalog & history
      clearCart();
      await Promise.all([fetchProducts(), fetchOrdersHistory()]);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      console.error('POS Checkout error:', err);
      showToast(err?.message || 'Checkout failed. Please check stock and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-7xl mx-auto pb-12">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-[#025033] text-[#FFFFFF] border border-[#3A8067] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2.5 text-xs font-semibold">
          <CheckIcon className="w-4 h-4 text-[#CAE4D8]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* POS Top Control Bar & KPI Counters */}
      <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#E6F7EF] border border-[#CAE4D8] flex items-center justify-center text-[#025033]">
            <PosIcon className="w-6 h-6 stroke-current" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-[#025033] tracking-tight">Point of Sale (POS)</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] border border-[#CAE4D8] text-[#025033]">
                OFFLINE STORE REGISTER
              </span>
            </div>
            <p className="text-xs text-[#3A8067]">
              Over-the-counter retail sales with immediate stock decrement, cash recognition, and double-entry COGS posting.
            </p>
          </div>
        </div>

        {/* Quick Day Summary Badges */}
        <div className="flex items-center gap-3">
          <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 py-2 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-[#3A8067] tracking-wider">Today&apos;s Sales</span>
            <span className="text-sm font-extrabold text-[#025033]">{formatTaka(todayRevenue)}</span>
          </div>

          <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3.5 py-2 flex flex-col">
            <span className="text-[10px] uppercase font-bold text-[#3A8067] tracking-wider">Tickets Today</span>
            <span className="text-sm font-extrabold text-[#025033]">{todayOrdersCount}</span>
          </div>

          <button
            onClick={() => setShowHistoryModal(true)}
            className="flex items-center gap-1.5 bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] border border-[#CAE4D8] text-xs font-bold px-3.5 py-2 rounded-xl transition"
          >
            <ReceiptIcon className="w-4 h-4" />
            <span>Sales History</span>
          </button>
        </div>
      </div>

      {/* Main Dual-Column POS Terminal Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Side: Product Catalog (7 cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Catalog Search & Category Filters */}
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-4 shadow-2xs flex flex-col gap-3">
            <div className="relative w-full">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3A8067]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products by title, SKU, or ID..."
                className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#3A8067] hover:text-[#025033]"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
              <button
                onClick={() => setStockFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                  stockFilter === 'all'
                    ? 'bg-[#025033] text-[#FFFFFF] border-[#025033]'
                    : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                }`}
              >
                All Catalog ({products.length})
              </button>

              <button
                onClick={() => setStockFilter('in_stock')}
                className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                  stockFilter === 'in_stock'
                    ? 'bg-[#025033] text-[#FFFFFF] border-[#025033]'
                    : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                }`}
              >
                In Stock ({products.filter((p) => p.stock_qty > 0).length})
              </button>

              <button
                onClick={() => setStockFilter('low_stock')}
                className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                  stockFilter === 'low_stock'
                    ? 'bg-[#025033] text-[#FFFFFF] border-[#025033]'
                    : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                }`}
              >
                Low Stock (≤5) ({products.filter((p) => p.stock_qty > 0 && p.stock_qty <= 5).length})
              </button>

              <button
                onClick={() => setStockFilter('out_of_stock')}
                className={`px-3 py-1.5 rounded-lg font-bold border transition ${
                  stockFilter === 'out_of_stock'
                    ? 'bg-[#025033] text-[#FFFFFF] border-[#025033]'
                    : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                }`}
              >
                Out of Stock ({products.filter((p) => p.stock_qty <= 0).length})
              </button>
            </div>
          </div>

          {/* Product Grid */}
          {loading ? (
            <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-12 flex flex-col items-center justify-center gap-2">
              <div className="w-7 h-7 border-2 border-[#025033] border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-semibold text-[#3A8067]">Loading offline inventory catalog...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-12 flex flex-col items-center justify-center gap-2 text-center">
              <AlertIcon className="w-8 h-8 text-[#3A8067]" />
              <span className="text-sm font-bold text-[#025033]">No products match your search</span>
              <p className="text-xs text-[#3A8067] max-w-sm">
                Try searching for another SKU, product name, or reset the stock filter to view all catalog items.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              {filteredProducts.map((p) => {
                const inCart = cart.find((item) => item.product.id === p.id);
                const isOutOfStock = p.stock_qty <= 0;

                return (
                  <div
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={`bg-[#FFFFFF] border rounded-2xl p-3.5 flex flex-col justify-between gap-3 shadow-2xs transition-all cursor-pointer relative hover:border-[#025033] ${
                      inCart
                        ? 'border-[#025033] bg-[#FAFCF9]'
                        : isOutOfStock
                        ? 'border-[#E5EAE7] opacity-80'
                        : 'border-[#E5EAE7]'
                    }`}
                  >
                    {/* Top Row: SKU & In-Cart Badge */}
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-mono font-bold text-[#3A8067] truncate max-w-[120px]">
                        {p.sku || `SKU-${p.id}`}
                      </span>
                      {inCart && (
                        <span className="bg-[#025033] text-[#FFFFFF] text-[10px] font-black px-2 py-0.5 rounded-full">
                          {inCart.qty} in ticket
                        </span>
                      )}
                    </div>

                    {/* Middle: Product Title & Stock Status */}
                    <div className="flex flex-col gap-1">
                      <h3 className="text-xs font-bold text-[#025033] line-clamp-2 leading-snug">
                        {p.name}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            p.stock_qty > 5
                              ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]'
                              : p.stock_qty > 0
                              ? 'bg-[#CAE4D8] text-[#00432C] border border-[#3A8067]'
                              : 'bg-[#E5EAE7] text-[#3A8067] border border-[#CAE4D8]'
                          }`}
                        >
                          {p.stock_qty > 0 ? `${p.stock_qty} in stock` : '0 in stock'}
                        </span>
                        {p.margin_pct > 0 && (
                          <span className="text-[9px] font-semibold text-[#3A8067]">
                            {p.margin_pct}% margin
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Price & One-Click Add Button */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#E5EAE7]">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[#3A8067] font-medium">Retail Price</span>
                        <span className="text-sm font-black text-[#025033]">
                          {formatTaka(p.selling_price_bdt)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p);
                        }}
                        className="w-7 h-7 rounded-lg bg-[#E6F7EF] hover:bg-[#025033] text-[#025033] hover:text-[#FFFFFF] border border-[#CAE4D8] flex items-center justify-center transition"
                        title="Add 1 to Ticket"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Active Ticket / Cashier Register (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-5 shadow-2xs flex flex-col gap-4 sticky top-4">
            {/* Ticket Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5EAE7]">
              <div className="flex items-center gap-2">
                <ShoppingCartIcon className="w-5 h-5 text-[#025033]" />
                <h2 className="text-sm font-black text-[#025033]">Active Ticket Slip</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                  {cart.reduce((sum, item) => sum + item.qty, 0)} items
                </span>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs font-semibold text-[#3A8067] hover:text-[#025033] transition"
                >
                  Clear Ticket
                </button>
              )}
            </div>

            {/* Customer Information (Optional) */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-[#3A8067] uppercase tracking-wider block mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Walk-in Customer"
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-[#3A8067] uppercase tracking-wider block mb-1">
                  Phone (Optional)
                </label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
                />
              </div>
            </div>

            {/* Ticket Cart Line Items */}
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-center gap-2 border border-dashed border-[#E5EAE7] rounded-xl bg-[#FAFCF9]">
                  <ShoppingCartIcon className="w-6 h-6 text-[#3A8067]" />
                  <span className="text-xs font-bold text-[#025033]">Register Ticket is Empty</span>
                  <span className="text-[11px] text-[#3A8067]">
                    Tap products on the left catalog to add them to this sale ticket.
                  </span>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAFCF9] border border-[#E5EAE7] gap-2"
                  >
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-xs font-bold text-[#025033] truncate">
                        {item.product.name}
                      </span>
                      <div className="flex items-center gap-1.5 text-[10px] text-[#3A8067]">
                        <span>{formatTaka(item.unit_price)} each</span>
                        <span>•</span>
                        <span className="font-mono">{item.product.sku || `SKU-${item.product.id}`}</span>
                      </div>
                    </div>

                    {/* Stepper Controls */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateCartQty(item.product.id, -1)}
                        className="w-6 h-6 rounded-md bg-[#FFFFFF] border border-[#E5EAE7] text-[#025033] flex items-center justify-center hover:bg-[#E6F7EF] transition"
                      >
                        <MinusIcon className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold text-[#025033]">
                        {item.qty}
                      </span>
                      <button
                        onClick={() => updateCartQty(item.product.id, 1)}
                        className="w-6 h-6 rounded-md bg-[#FFFFFF] border border-[#E5EAE7] text-[#025033] flex items-center justify-center hover:bg-[#E6F7EF] transition"
                      >
                        <PlusIcon className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Item Total & Delete */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-[#025033] min-w-[55px] text-right">
                        {formatTaka(item.unit_price * item.qty)}
                      </span>
                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="text-[#3A8067] hover:text-[#025033] transition p-1"
                        title="Remove"
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Discount & Note */}
            {cart.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#E5EAE7]">
                <div>
                  <label className="text-[10px] font-bold text-[#3A8067] uppercase tracking-wider block mb-1">
                    Special Discount (৳)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0"
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-bold text-[#025033] focus:outline-none focus:border-[#025033] transition"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-[#3A8067] uppercase tracking-wider block mb-1">
                    Register Memo
                  </label>
                  <input
                    type="text"
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    placeholder="e.g. Counter 1 Sale"
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033] transition"
                  />
                </div>
              </div>
            )}

            {/* Calculation Totals */}
            <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-3.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-[#3A8067]">
                <span>Ticket Subtotal</span>
                <span>{formatTaka(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-[#3A8067]">
                  <span>Discount Applied</span>
                  <span>-{formatTaka(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1.5 border-t border-[#E5EAE7]">
                <span className="text-sm font-extrabold text-[#025033]">Net Payable</span>
                <span className="text-base font-black text-[#025033]">
                  {formatTaka(netTotal)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-[#3A8067] uppercase tracking-wider">
                Settlement Payment Method
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {(['cash', 'bkash', 'nagad', 'card'] as const).map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold border capitalize transition ${
                      paymentMethod === method
                        ? 'bg-[#025033] text-[#FFFFFF] border-[#025033]'
                        : 'bg-[#FAFCF9] text-[#025033] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Tendered & Change Due (If Cash) */}
            {paymentMethod === 'cash' && cart.length > 0 && (
              <div className="flex flex-col gap-2 p-3 bg-[#E6F7EF] border border-[#CAE4D8] rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#025033]">Cash Tendered</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleQuickCash('exact')}
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#CAE4D8] text-[#025033] hover:bg-[#CAE4D8] transition"
                    >
                      Exact
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickCash(500)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#CAE4D8] text-[#025033] hover:bg-[#CAE4D8] transition"
                    >
                      ৳500
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickCash(1000)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#CAE4D8] text-[#025033] hover:bg-[#CAE4D8] transition"
                    >
                      ৳1,000
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickCash(2000)}
                      className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#FFFFFF] border border-[#CAE4D8] text-[#025033] hover:bg-[#CAE4D8] transition"
                    >
                      ৳2,000
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#3A8067]">
                      ৳
                    </span>
                    <input
                      type="number"
                      step="any"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder={String(netTotal)}
                      className="w-full bg-[#FFFFFF] border border-[#CAE4D8] rounded-xl pl-6 pr-3 py-1.5 text-xs font-black text-[#025033] focus:outline-none focus:border-[#025033]"
                    />
                  </div>

                  <div className="flex items-center justify-between px-3 py-1.5 bg-[#FFFFFF] border border-[#CAE4D8] rounded-xl">
                    <span className="text-[11px] font-bold text-[#3A8067]">Change:</span>
                    <span className="text-xs font-black text-[#025033]">
                      {formatTaka(changeDue)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Complete Sale Action Button */}
            <button
              onClick={handleCheckout}
              disabled={submitting || cart.length === 0}
              className={`w-full py-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition ${
                submitting || cart.length === 0
                  ? 'bg-[#E5EAE7] text-[#3A8067] cursor-not-allowed'
                  : 'bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] shadow-sm'
              }`}
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#FFFFFF] border-t-transparent rounded-full animate-spin" />
                  <span>Processing Retail Sale...</span>
                </>
              ) : (
                <>
                  <ReceiptIcon className="w-4 h-4" />
                  <span>Charge {formatTaka(netTotal)} & Print Receipt</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Completed Sale Thermal Receipt Modal */}
      {completedReceipt && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3">
              <div className="flex items-center gap-2 text-[#025033]">
                <ReceiptIcon className="w-5 h-5" />
                <span className="font-extrabold text-sm">Retail Sales Receipt</span>
              </div>
              <span className="text-xs font-mono font-bold bg-[#E6F7EF] text-[#025033] px-2.5 py-1 rounded-full border border-[#CAE4D8]">
                {completedReceipt.receipt_no}
              </span>
            </div>

            {/* Printable Thermal Receipt Container */}
            <div
              id="pos-thermal-receipt"
              className="bg-[#FAFCF9] border border-dashed border-[#CAE4D8] rounded-2xl p-4 flex flex-col gap-3 font-mono text-xs text-[#025033]"
            >
              {/* Receipt Header */}
              <div className="text-center flex flex-col gap-0.5">
                <span className="font-black text-sm tracking-tight text-[#025033]">NIRVUL360 RETAIL OUTLET</span>
                <span className="text-[10px] text-[#3A8067]">Over-the-Counter Sales Desk</span>
                <span className="text-[10px] text-[#3A8067]">{completedReceipt.placed_at}</span>
              </div>

              <div className="border-t border-dashed border-[#CAE4D8] pt-2 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#3A8067]">Cashier:</span>
                  <span className="font-bold">{user?.name || 'Store Cashier'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#3A8067]">Customer:</span>
                  <span className="font-bold">{completedReceipt.customer_name}</span>
                </div>
                {completedReceipt.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-[#3A8067]">Phone:</span>
                    <span>{completedReceipt.customer_phone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#3A8067]">Payment:</span>
                  <span className="uppercase font-bold">{completedReceipt.payment_method}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="border-t border-dashed border-[#CAE4D8] pt-2">
                <div className="flex justify-between text-[10px] text-[#3A8067] font-bold uppercase mb-1">
                  <span>Item</span>
                  <span>Qty × Rate</span>
                  <span>Total</span>
                </div>
                <div className="flex flex-col gap-1 text-[11px]">
                  {completedReceipt.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <div className="flex flex-col max-w-[170px]">
                        <span className="font-bold truncate">{it.name}</span>
                        <span className="text-[9px] text-[#3A8067]">{it.sku}</span>
                      </div>
                      <span className="text-[#3A8067]">
                        {it.qty} × {formatTaka(it.unit_price)}
                      </span>
                      <span className="font-bold">{formatTaka(it.line_total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals Breakdown */}
              <div className="border-t border-dashed border-[#CAE4D8] pt-2 flex flex-col gap-1 text-[11px]">
                <div className="flex justify-between text-[#3A8067]">
                  <span>Subtotal:</span>
                  <span>{formatTaka(completedReceipt.subtotal)}</span>
                </div>
                {completedReceipt.discount > 0 && (
                  <div className="flex justify-between text-[#3A8067]">
                    <span>Discount:</span>
                    <span>-{formatTaka(completedReceipt.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-xs text-[#025033] pt-1 border-t border-[#E5EAE7]">
                  <span>Total Paid:</span>
                  <span>{formatTaka(completedReceipt.total)}</span>
                </div>
                {completedReceipt.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between text-[#3A8067]">
                      <span>Tendered:</span>
                      <span>{formatTaka(completedReceipt.tendered)}</span>
                    </div>
                    <div className="flex justify-between text-[#3A8067]">
                      <span>Change:</span>
                      <span>{formatTaka(completedReceipt.change)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Footer text */}
              <div className="border-t border-dashed border-[#CAE4D8] pt-2 text-center text-[9px] text-[#3A8067]">
                <p>Double-entry accounting journal posted.</p>
                <p>Inventory decremented over the counter.</p>
                <p className="font-bold text-[#025033] mt-1">Thank you for your purchase!</p>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] border border-[#CAE4D8] flex items-center justify-center gap-1.5 transition"
              >
                <ReceiptIcon className="w-4 h-4" />
                <span>Print Slip</span>
              </button>

              <button
                onClick={() => setCompletedReceipt(null)}
                className="py-2.5 px-4 rounded-xl text-xs font-bold bg-[#025033] hover:bg-[#05572F] text-[#FFFFFF] flex items-center justify-center gap-1.5 transition"
              >
                <span>New Ticket</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POS Today's Sales History Drawer / Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl max-w-2xl w-full p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-[#E5EAE7] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8] flex items-center justify-center">
                  <ReceiptIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-[#025033]">Today&apos;s POS Sales Register</h3>
                  <p className="text-[11px] text-[#3A8067]">
                    Total: {formatTaka(todayRevenue)} across {todayOrdersCount} over-the-counter sales
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="w-7 h-7 rounded-lg bg-[#FAFCF9] border border-[#E5EAE7] text-[#3A8067] hover:text-[#025033] flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            {/* List of Orders */}
            <div className="flex flex-col gap-2 overflow-y-auto pr-1">
              {recentOrders.length === 0 ? (
                <div className="py-12 text-center text-xs font-semibold text-[#3A8067]">
                  No offline POS sales completed today yet.
                </div>
              ) : (
                recentOrders.map((ord: any) => (
                  <div
                    key={ord.id}
                    className="p-3.5 rounded-xl bg-[#FAFCF9] border border-[#E5EAE7] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#025033]">
                          {ord.external_id || `POS-${ord.id}`}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                          Delivered
                        </span>
                      </div>
                      <span className="text-[11px] text-[#3A8067]">
                        {ord.customer_name || 'Walk-in Customer'} • {ord.placed_at?.slice(11, 16) || ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-sm text-[#025033]">
                        {formatTaka(ord.total_bdt || ord.total / 100)}
                      </span>
                      <button
                        onClick={() => {
                          setCompletedReceipt({
                            receipt_no: ord.external_id || `POS-${ord.id}`,
                            order_id: ord.id,
                            status: ord.status,
                            placed_at: ord.placed_at,
                            payment_method: 'cash',
                            subtotal: ord.subtotal ? ord.subtotal / 100 : (ord.total / 100),
                            discount: ord.discount ? ord.discount / 100 : 0,
                            total: ord.total / 100,
                            tendered: ord.total / 100,
                            change: 0,
                            customer_name: ord.customer_name || 'Walk-in Customer',
                            customer_phone: ord.customer_phone,
                            items: (ord.items || []).map((it: any) => ({
                              product_id: it.product_id,
                              name: it.product_name || `Item #${it.product_id}`,
                              sku: it.sku || `SKU-${it.product_id}`,
                              qty: it.qty,
                              unit_price: it.unit_price ? it.unit_price / 100 : 0,
                              line_total: it.line_total ? it.line_total / 100 : 0,
                              remaining_stock: 0,
                            })),
                          });
                          setShowHistoryModal(false);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#FFFFFF] border border-[#CAE4D8] text-[#025033] hover:bg-[#E6F7EF] text-[11px] font-bold transition"
                      >
                        Receipt Slip
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-[#E5EAE7] flex justify-end">
              <button
                onClick={() => setShowHistoryModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[#025033] text-[#FFFFFF] hover:bg-[#05572F] transition"
              >
                Close Day Book
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
