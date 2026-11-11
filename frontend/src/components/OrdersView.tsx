'use strict';
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { api } from '@/lib/api';
import { Order, OrderDetailExtended } from '@/types';

interface OrdersViewProps {
  onRefreshParent?: () => void;
  onOpenOrderModal?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export function OrdersView({ onRefreshParent, onOpenOrderModal, showToast }: OrdersViewProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedCourier, setSelectedCourier] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<'this_month' | 'quarter' | 'year'>('this_month');

  // Selected Order for Slide-Over Drawer
  const [selectedOrder, setSelectedOrder] = useState<OrderDetailExtended | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Offline Order Creation Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCourier, setNewCourier] = useState('pathao');
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState(1);
  const [newItemPrice, setNewItemPrice] = useState(1000);
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (selectedStatus !== 'all') params.append('status', selectedStatus);
      if (selectedCourier !== 'all') params.append('courier', selectedCourier);

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load orders');
      const data = await res.json();
      setOrders(data.rows || []);
      setTotalCount(data.pagination?.total || (data.rows ? data.rows.length : 0));
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error loading orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderDetail = async (orderId: number) => {
    try {
      setLoadingDetail(true);
      const data = await api.get<OrderDetailExtended>(`/api/orders/${orderId}`);
      setSelectedOrder(data);
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast('Failed to load order details', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchOrders();
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedStatus, selectedCourier, timeRange]);

  const inTransitCount = useMemo(() => {
    return orders.filter(o => o.status === 'in_transit').length;
  }, [orders]);

  const handleRowClick = (order: Order) => {
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(null);
    } else {
      fetchOrderDetail(order.id);
    }
  };

  const handleCreateOfflineOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingNew(true);
      const payload = {
        customer_name: newCustomerName.trim() || 'Offline Customer',
        customer_phone: newCustomerPhone.trim(),
        address: newAddress.trim() || 'Dhaka',
        courier: newCourier,
        items: [
          {
            name: newItemName.trim() || 'Custom Order Item',
            qty: Number(newItemQty),
            unit_price: Number(newItemPrice),
          },
        ],
      };

      await api.post('/api/orders', payload);
      if (showToast) showToast('Order created successfully', 'success');
      setIsAddModalOpen(false);
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewAddress('');
      setNewItemName('');
      fetchOrders();
      if (onRefreshParent) onRefreshParent();
    } catch (err: any) {
      console.error(err);
      if (showToast) showToast(err.message || 'Error creating order', 'error');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const handleExport = () => {
    if (orders.length === 0) {
      if (showToast) showToast('No orders to export', 'info');
      return;
    }
    const headers = ['Order ID', 'Date', 'Customer', 'Courier', 'Total (BDT)', 'Status', 'Profit (BDT)'];
    const rows = orders.map(o => [
      o.external_id || `ORD-${o.id}`,
      o.order_date,
      o.customer_name || '',
      o.courier || '',
      o.total ? (o.total / 100).toFixed(2) : '0',
      o.status,
      (o as any).profit_taka ?? 'not a sale yet',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `orders_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTaka = (amount?: number | null) => {
    if (amount === undefined || amount === null) return '0';
    return amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0]">
            Delivered
          </span>
        );
      case 'returned':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            Returned
          </span>
        );
      case 'in_transit':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F1F5F9] text-[#475569] border border-[#E2E8F0]">
            In transit
          </span>
        );
      case 'placed':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#FEF3C7] text-[#D97706] border border-[#FDE68A]">
            Placed
          </span>
        );
    }
  };

  const renderProfitBadge = (order: Order) => {
    const profitTaka = (order as any).profit_taka;
    const status = order.status;

    if (status === 'delivered') {
      const val = profitTaka ?? 0;
      return (
        <span className="font-mono font-semibold text-[#15803D]">
          +{val >= 0 ? `৳${formatTaka(val)}` : `-৳${formatTaka(Math.abs(val))}`}
        </span>
      );
    }

    if (status === 'returned') {
      const val = profitTaka ? Math.abs(profitTaka) : 0;
      return (
        <span className="font-mono font-semibold text-[#B91C1C]">
          -৳{formatTaka(val)}
        </span>
      );
    }

    return (
      <span className="text-[#64748B] italic text-xs">
        not a sale yet
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Meta Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111827]">Orders</h1>
          <p className="text-sm text-[#4B5563] mt-0.5">
            {totalCount} placed{timeRange === 'this_month' ? ' this month' : timeRange === 'quarter' ? ' this quarter' : timeRange === 'year' ? ' this year' : ''} · courier status last synced{' '}
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Period Selector */}
          <div className="inline-flex items-center bg-white border border-[#E5EAE7] rounded-xl p-1 shadow-2xs">
            {(['this_month', 'quarter', 'year'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setTimeRange(p)}
                className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                  timeRange === p ? 'bg-[#025033] text-white shadow-2xs' : 'text-[#4B5563] hover:text-[#111827]'
                }`}
              >
                {p === 'this_month' ? 'This month' : p === 'quarter' ? 'Quarter' : 'Year'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExport}
            className="px-3.5 py-2 text-xs font-medium text-[#025033] bg-white border border-[#E5EAE7] rounded-xl hover:bg-[#F9FAF8] transition-colors shadow-2xs"
          >
            Export
          </button>

          <button
            type="button"
            onClick={() => (onOpenOrderModal ? onOpenOrderModal() : setIsAddModalOpen(true))}
            className="px-4 py-2 text-xs font-medium text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors shadow-2xs flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add offline order
          </button>
        </div>
      </div>

      {/* Main Container: Orders Table + Slide-Over Drawer */}
      <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Orders Table Panel */}
        <div className={`${selectedOrder ? 'lg:col-span-8' : 'lg:col-span-12'} transition-all duration-200`}>
          <div className="bg-white rounded-2xl border border-[#E5EAE7] shadow-2xs overflow-hidden">
            {/* Multi-Filter Bar */}
            <div className="p-4 border-b border-[#E5EAE7] grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3 bg-[#FAFCF9]">
              {/* Search Bar */}
              <div className="sm:col-span-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search order ID or customer"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              {/* Status Dropdown */}
              <div>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                >
                  <option value="all">Status: All statuses</option>
                  <option value="delivered">Delivered</option>
                  <option value="in_transit">In transit</option>
                  <option value="returned">Returned</option>
                  <option value="placed">Placed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              {/* Courier Dropdown */}
              <div>
                <select
                  value={selectedCourier}
                  onChange={(e) => setSelectedCourier(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                >
                  <option value="all">Courier: All couriers</option>
                  <option value="pathao">Pathao</option>
                  <option value="steadfast">Steadfast</option>
                  <option value="redx">RedX</option>
                  <option value="cash_others">Cash / Others</option>
                </select>
              </div>
            </div>

            {/* Orders Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#FAFCF9] text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider border-b border-[#E5EAE7]">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">ORDER ID</th>
                    <th scope="col" className="px-5 py-3.5">DATE</th>
                    <th scope="col" className="px-5 py-3.5">CUSTOMER</th>
                    <th scope="col" className="px-5 py-3.5">COURIER</th>
                    <th scope="col" className="px-5 py-3.5">VALUE</th>
                    <th scope="col" className="px-5 py-3.5">STATUS</th>
                    <th scope="col" className="px-5 py-3.5 text-right">PROFIT ON ORDER</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE7]">
                  {loading && orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-[#6B7280]">
                        Loading orders...
                      </td>
                    </tr>
                  ) : orders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-xs text-[#6B7280]">
                        No orders match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    orders.map(order => {
                      const isSelected = selectedOrder?.id === order.id;

                      return (
                        <tr
                          key={order.id}
                          onClick={() => handleRowClick(order)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-[#E6F7EF] hover:bg-[#D8F2E5]'
                              : 'hover:bg-[#FAFCF9]'
                          }`}
                        >
                          {/* ORDER ID */}
                          <td className="px-5 py-3.5 font-mono font-bold text-[#025033]">
                            {order.external_id || `ORD-${order.id}`}
                          </td>

                          {/* DATE */}
                          <td className="px-5 py-3.5 text-[#4B5563]">
                            {order.order_date}
                          </td>

                          {/* CUSTOMER */}
                          <td className="px-5 py-3.5 font-medium text-[#111827]">
                            {order.customer_name || 'Walk-in'}
                          </td>

                          {/* COURIER */}
                          <td className="px-5 py-3.5 text-[#4B5563]">
                            {order.courier ? order.courier.charAt(0).toUpperCase() + order.courier.slice(1) : 'Over Counter'}
                          </td>

                          {/* VALUE */}
                          <td className="px-5 py-3.5 font-semibold text-[#111827]">
                            ৳{formatTaka(order.total / 100)}
                          </td>

                          {/* STATUS */}
                          <td className="px-5 py-3.5">{renderStatusBadge(order.status)}</td>

                          {/* PROFIT ON ORDER */}
                          <td className="px-5 py-3.5 text-right">{renderProfitBadge(order)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer Bar */}
            <div className="p-4 border-t border-[#E5EAE7] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[#FAFCF9] text-xs">
              <div className="text-[#6B7280]">
                Profit appears only after delivery. Returned orders carry their return charge as a loss.{' '}
                {inTransitCount} {inTransitCount === 1 ? 'order' : 'orders'} in transit are not in revenue.
              </div>
              <div className="text-[#4B5563] font-medium self-end sm:self-auto">
                {orders.length} of {totalCount}
              </div>
            </div>
          </div>
        </div>

        {/* Slide-Over Order Detail Drawer (4 of 12 columns on lg) */}
        {(selectedOrder || loadingDetail) && (
          <div className="lg:col-span-4 bg-white rounded-2xl border border-[#E5EAE7] shadow-xl overflow-hidden sticky top-6">
            {loadingDetail ? (
              <div className="p-8 text-center text-xs text-[#6B7280]">
                Loading order details...
              </div>
            ) : selectedOrder ? (
              <>
                {/* Drawer Header */}
                <div className="p-4 border-b border-[#E5EAE7] flex items-center justify-between bg-[#FAFCF9]">
                  <div>
                    <h3 className="font-mono font-bold text-sm text-[#025033]">
                      {selectedOrder.external_id || `ORD-${selectedOrder.id}`}
                    </h3>
                    <p className="text-xs text-[#6B7280]">
                      {selectedOrder.customer_name || 'Customer'} · {selectedOrder.courier || 'Counter'} · {selectedOrder.status}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedOrder(null)}
                    className="px-2.5 py-1 text-xs font-medium text-[#4B5563] hover:text-[#111827] border border-[#E5EAE7] rounded-lg bg-white"
                  >
                    Close
                  </button>
                </div>

                <div className="p-4 space-y-5 text-xs max-h-[calc(100vh-220px)] overflow-y-auto">
              {/* Section 1: LINE ITEMS */}
              <div>
                <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  LINE ITEMS
                </div>
                <div className="space-y-2">
                  {(selectedOrder.line_items || []).map((it, idx) => (
                    <div key={idx} className="p-2.5 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7]">
                      <div className="flex justify-between items-start">
                        <div className="font-semibold text-[#111827]">{it.product_name}</div>
                        <div className="font-bold text-[#111827]">৳{it.line_total.toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="px-1.5 py-0.2 rounded bg-white text-[10px] font-mono text-[#4B5563] border border-[#D1D5DB]">
                          {it.sku || 'SKU'}
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          {it.qty} × ৳{it.unit_price} · cost ৳{it.unit_cost || 0} ({it.cost_date_label || 'dated price'})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: STATUS TIMELINE */}
              <div>
                <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  STATUS TIMELINE
                </div>
                <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#CAE4D8]">
                  {(selectedOrder.timeline || []).map((step, idx) => (
                    <div key={idx} className="relative">
                      <div
                        className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ${
                          step.completed ? 'bg-[#025033]' : 'bg-[#D1D5DB]'
                        }`}
                      ></div>
                      <div className="font-semibold text-[#111827]">{step.label}</div>
                      <div className="text-[11px] text-[#6B7280]">{step.timestamp || 'Pending'}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 3: COURIER CHARGES */}
              <div>
                <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  COURIER CHARGES
                </div>
                <div className="space-y-1.5 p-3 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7]">
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Delivery charge</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.courier_charges_breakdown?.delivery_charge ?? 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">COD fee</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.courier_charges_breakdown?.cod_fee || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Return charge</span>
                    <span className={selectedOrder.status === 'returned' ? 'text-[#DC2626] font-medium' : 'text-[#6B7280] italic'}>
                      {selectedOrder.status === 'returned'
                        ? `-৳${selectedOrder.courier_charges_breakdown?.return_fee ?? 0}`
                        : 'no return leg on this order'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 4: PROFIT ON THIS ORDER (Waterfall) */}
              <div>
                <div className="text-[11px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">
                  PROFIT ON THIS ORDER
                </div>
                <div className="space-y-1.5 p-3 bg-[#FAFCF9] rounded-xl border border-[#E5EAE7]">
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Delivered value</span>
                    <span className="text-[#10B981] font-semibold">
                      ৳{selectedOrder.waterfall?.delivered_value || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Cost of goods sold</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.waterfall?.cogs || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Courier charges</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.waterfall?.courier_charges || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Packaging</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.waterfall?.packaging || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#4B5563]">Ad spend mapped to these SKUs</span>
                    <span className="text-[#DC2626] font-medium">
                      -৳{selectedOrder.waterfall?.ad_spend || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pinned Bottom Banner */}
            <div className="p-4 bg-[#0B3B24] text-white flex items-center justify-between">
              <span className="font-bold text-xs uppercase tracking-wider">NET ON THIS ORDER</span>
              <span className="font-extrabold text-base">
                {selectedOrder.waterfall?.net_profit !== null && selectedOrder.waterfall?.net_profit !== undefined ? (
                  selectedOrder.waterfall.net_profit >= 0
                    ? `+৳${selectedOrder.waterfall.net_profit.toLocaleString()}`
                    : `-৳${Math.abs(selectedOrder.waterfall.net_profit).toLocaleString()}`
                ) : (
                  'not a sale yet'
                )}
              </span>
            </div>
          </>
          ) : null}
        </div>
      )}
    </div>

      {/* Add Offline Order Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-[#E5EAE7]">
            <h3 className="text-base font-bold text-[#111827] mb-1">Add Offline Order</h3>
            <p className="text-xs text-[#6B7280] mb-4">
              Enter customer and product details for offline / phone orders.
            </p>

            <form onSubmit={handleCreateOfflineOrder} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-[#374151] mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="e.g. মারুফ"
                  className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#374151] mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#374151] mb-1">Courier</label>
                  <select
                    value={newCourier}
                    onChange={(e) => setNewCourier(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033] bg-white"
                  >
                    <option value="pathao">Pathao</option>
                    <option value="steadfast">Steadfast</option>
                    <option value="redx">RedX</option>
                    <option value="cash_others">Cash / Others</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[#374151] mb-1">Shipping Address</label>
                <input
                  type="text"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  placeholder="e.g. Mirpur, Dhaka"
                  className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              <div className="pt-2 border-t border-[#E5EAE7]">
                <label className="block font-semibold text-[#374151] mb-1">Item Description</label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Cotton Kurti — Blue"
                  className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[#374151] mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={newItemQty}
                    onChange={(e) => setNewItemQty(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#374151] mb-1">Price (৳)</label>
                  <input
                    type="number"
                    min={0}
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(Number(e.target.value))}
                    className="w-full px-3 py-1.5 border border-[#D1D5DB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#025033]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-[#4B5563] hover:text-[#111827]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#025033] hover:bg-[#033E28] rounded-xl transition-colors disabled:opacity-50"
                >
                  {isSubmittingNew ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
