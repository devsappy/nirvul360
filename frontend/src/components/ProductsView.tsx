'use client';

import React, { useState, useMemo } from 'react';
import { Product } from '@/types';
import { formatTaka, api } from '@/lib/api';
import { AlertIcon, PlusIcon, StoreIcon, DownloadCloudIcon, SearchIcon, CheckIcon } from './icons';

interface ProductsViewProps {
  products?: Product[];
  onRefresh: () => void;
  onOpenPurchaseModal: () => void;
  userRole?: string;
}

interface BulkRow {
  sku?: string;
  name: string;
  selling_price?: number;
  cost_price?: number;
  stock_qty?: number;
  active: boolean;
}

function parseInventoryCSV(text: string): BulkRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));
  const skuIdx = headers.findIndex((h) => h === 'sku' || h === 'product_sku' || h === 'code');
  const nameIdx = headers.findIndex((h) => h === 'name' || h === 'product_name' || h === 'title');
  const sellIdx = headers.findIndex((h) => h === 'selling_price' || h === 'price' || h === 'retail_price' || h === 'mrp');
  const costIdx = headers.findIndex((h) => h === 'cost_price' || h === 'cost' || h === 'purchase_price');
  const stockIdx = headers.findIndex((h) => h === 'stock_qty' || h === 'stock' || h === 'qty' || h === 'quantity');
  const activeIdx = headers.findIndex((h) => h === 'active' || h === 'status');

  const rows: BulkRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols: string[] = [];
    let inQuotes = false;
    let cur = '';
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        cols.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    cols.push(cur.trim());

    const name = nameIdx !== -1 ? cols[nameIdx] : cols[1] || cols[0];
    if (!name) continue;

    const sku = skuIdx !== -1 ? cols[skuIdx] : '';
    const sellRaw = sellIdx !== -1 ? parseFloat(cols[sellIdx].replace(/[^0-9.]/g, '')) : undefined;
    const costRaw = costIdx !== -1 ? parseFloat(cols[costIdx].replace(/[^0-9.]/g, '')) : undefined;
    const stockRaw = stockIdx !== -1 ? parseInt(cols[stockIdx].replace(/[^0-9-]/g, ''), 10) : 0;
    const activeVal =
      activeIdx !== -1
        ? !['0', 'false', 'paused', 'inactive', 'no'].includes(cols[activeIdx].toLowerCase())
        : true;

    rows.push({
      sku: sku ? sku.replace(/['"]/g, '') : undefined,
      name: name.replace(/['"]/g, ''),
      selling_price: !isNaN(sellRaw as number) ? sellRaw : undefined,
      cost_price: !isNaN(costRaw as number) ? costRaw : undefined,
      stock_qty: !isNaN(stockRaw) ? stockRaw : 0,
      active: activeVal,
    });
  }
  return rows;
}

export function ProductsView({ products = [], onRefresh, onOpenPurchaseModal, userRole }: ProductsViewProps) {
  const isAccountant = userRole === 'accountant';

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [costPrice, setCostPrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [priceNote, setPriceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [permissionNotice, setPermissionNotice] = useState<string | null>(null);

  // Bulk Upload Modal states
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMode, setBulkMode] = useState<'upload' | 'paste'>('upload');
  const [csvText, setCsvText] = useState('');
  const [parsedRows, setParsedRows] = useState<BulkRow[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{
    ok: boolean;
    message: string;
    created?: number;
    updated?: number;
  } | null>(null);

  const productList: Product[] = useMemo(
    () =>
      Array.isArray(products)
        ? products
        : Array.isArray((products as any)?.rows)
        ? (products as any).rows
        : [],
    [products]
  );

  // Filter & Search states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Store Pull Modal states
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [platform, setPlatform] = useState<'wordpress' | 'shopify' | 'laravel' | 'daraz' | 'custom'>('wordpress');
  const [storeUrl, setStoreUrl] = useState('https://demo-woocommerce.local');
  const [apiKey, setApiKey] = useState('ck_demo_982348239');
  const [apiSecret, setApiSecret] = useState('cs_demo_982348239');
  const [pulling, setPulling] = useState(false);
  const [pullMessage, setPullMessage] = useState<string | null>(null);

  // Status toggle handler with hierarchy permission enforcement
  const handleToggleStatus = async (product: Product) => {
    if (isAccountant) {
      setPermissionNotice(
        'Permission Denied: Accountants cannot pause or unpause items. Only Agency Owners, Admins, and Super Admins can manage item status.'
      );
      setTimeout(() => setPermissionNotice(null), 5000);
      return;
    }

    setTogglingId(product.id);
    try {
      const nextActive = !product.active;
      await api.patch(`/api/products/${product.id}/status`, { active: nextActive });
      onRefresh();
    } catch (err: any) {
      alert(`Error updating product status: ${err.message}`);
    } finally {
      setTogglingId(null);
    }
  };

  // Bulk Upload Handlers
  const handleDownloadTemplate = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'sku,name,selling_price,cost_price,stock_qty,active\n' +
      'TS-101,Classic Cotton T-Shirt,650,280,50,yes\n' +
      'HD-201,Fleece Winter Hoodie,1650,750,30,yes\n' +
      'PJ-301,Traditional Silk Panjabi,2200,1100,20,yes\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'gross_inventory_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
        const rows = parseInventoryCSV(content);
        setParsedRows(rows);
      }
    };
    reader.readAsText(file);
  };

  const handleTextChange = (text: string) => {
    setCsvText(text);
    const rows = parseInventoryCSV(text);
    setParsedRows(rows);
  };

  const handleCommitBulkUpload = async () => {
    if (parsedRows.length === 0) return;
    setBulkUploading(true);
    setBulkResult(null);

    try {
      const payload = {
        products: parsedRows.map((r) => ({
          sku: r.sku,
          name: r.name,
          selling_price: r.selling_price ? Math.round(r.selling_price * 100) : 0,
          cost_price: r.cost_price ? Math.round(r.cost_price * 100) : undefined,
          stock_qty: r.stock_qty || 0,
          active: r.active,
        })),
      };

      const res: any = await api.post('/api/products/bulk', payload);
      setBulkResult({
        ok: true,
        message: `Successfully processed ${res.created_count || 0} created, ${res.updated_count || 0} updated items!`,
        created: res.created_count,
        updated: res.updated_count,
      });
      onRefresh();
      setTimeout(() => {
        setShowBulkModal(false);
        setBulkResult(null);
        setParsedRows([]);
        setCsvText('');
      }, 2000);
    } catch (err: any) {
      setBulkResult({
        ok: false,
        message: err.message || 'Bulk upload failed. Please verify CSV formatting.',
      });
    } finally {
      setBulkUploading(false);
    }
  };

  // Pull Store Inventory handler
  const handlePullStoreInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    setPulling(true);
    setPullMessage(null);
    try {
      const res: any = await api.post('/api/integrations/pull-store', {
        platform,
        store_url: storeUrl,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      setPullMessage(`Success: Pulled ${res.synced_products || 0} products from your ${platform.toUpperCase()} store.`);
      onRefresh();
      setTimeout(() => {
        setShowStoreModal(false);
        setPullMessage(null);
      }, 2500);
    } catch (err: any) {
      setPullMessage(`Error: ${err.message || 'Failed to pull from store'}`);
    } finally {
      setPulling(false);
    }
  };

  // Pricing update submission handler
  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);
    try {
      const sellPoisha = Math.round(parseFloat(sellingPrice || '0') * 100);
      const costPoisha = costPrice ? Math.round(parseFloat(costPrice) * 100) : undefined;

      await api.put(`/api/products/${selectedProduct.id}/pricing`, {
        selling_price: sellPoisha,
        cost_price: costPoisha,
        note: priceNote || 'Updated via Products View',
      });

      setSelectedProduct(null);
      onRefresh();
    } catch (err: any) {
      alert(`Error updating pricing: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return productList.filter((p) => {
      if (statusFilter === 'active' && !p.active) return false;
      if (statusFilter === 'inactive' && p.active) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSku = p.sku ? p.sku.toLowerCase().includes(q) : false;
        return matchesName || matchesSku;
      }
      return true;
    });
  }, [productList, search, statusFilter]);

  // Summary counts
  const totalItems = productList.length;
  const activeCount = productList.filter((p) => p.active).length;
  const inactiveCount = totalItems - activeCount;

  return (
    <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-2xl p-6 shadow-2xs flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E5EAE7] pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-[#025033] tracking-tight">Inventory</h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
              {totalItems} items
            </span>
          </div>
          <p className="text-xs text-[#3A8067] font-medium mt-1">
            Real-time stock on hand, purchase cost valuations, and retail selling prices. Integrated with multi-tenant store webhooks.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* Bulk Upload CSV Button */}
          <button
            onClick={() => {
              if (isAccountant) {
                setPermissionNotice('Permission Denied: Accountants cannot bulk upload products. Only Agency Owners & Admins can manage product catalog.');
                setTimeout(() => setPermissionNotice(null), 5000);
                return;
              }
              setShowBulkModal(true);
            }}
            className="flex items-center gap-2 bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs"
          >
            <DownloadCloudIcon className="w-4 h-4 text-[#025033]" />
            <span>Bulk Upload</span>
          </button>

          {/* Pull from Store Website Button */}
          <button
            onClick={() => setShowStoreModal(true)}
            className="flex items-center gap-2 bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-2xs"
          >
            <StoreIcon className="w-4 h-4 text-[#025033]" />
            <span>Pull from Store</span>
          </button>

          {/* Record Stock Purchase Button */}
          <button
            onClick={onOpenPurchaseModal}
            className="flex items-center gap-1.5 bg-[#025033] text-[#FFFFFF] font-semibold text-xs px-4 py-2 rounded-xl transition shadow-xs hover:bg-[#05572F]"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            <span>+ Stock Purchase</span>
          </button>
        </div>
      </div>

      {/* Permission Restriction Notice */}
      {permissionNotice && (
        <div className="bg-[#E6F7EF] border border-[#3A8067] text-[#025033] rounded-xl p-3 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span className="font-semibold">{permissionNotice}</span>
          </div>
          <button onClick={() => setPermissionNotice(null)} className="text-[#025033] font-bold text-xs hover:text-[#00432C]">
            &times;
          </button>
        </div>
      )}

      {/* Quick Summary Pill Row & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
        {/* Status Filters */}
        <div className="flex items-center gap-1.5 bg-[#E6F7EF] p-1 rounded-xl border border-[#CAE4D8] w-fit">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
              statusFilter === 'all' ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs' : 'text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            All ({totalItems})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              statusFilter === 'active' ? 'bg-[#05572F] text-[#FFFFFF] shadow-2xs' : 'text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#CAE4D8]" />
            Active ({activeCount})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              statusFilter === 'inactive' ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs' : 'text-[#3A8067] hover:text-[#025033]'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-[#3A8067]" />
            Paused ({inactiveCount})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-64">
          <SearchIcon className="w-3.5 h-3.5 absolute left-3 top-2.5 text-[#3A8067]" />
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-[#FFFFFF] border border-[#E5EAE7] rounded-xl text-xs text-[#025033] placeholder-[#3A8067] focus:outline-none focus:border-[#025033]"
          />
        </div>
      </div>

      {/* Inventory Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#E5EAE7] text-[#3A8067] font-semibold uppercase tracking-wider text-[10px]">
              <th className="pb-3 pl-2">Status</th>
              <th className="pb-3">SKU</th>
              <th className="pb-3">Product Name</th>
              <th className="pb-3">Cost Price (Cost)</th>
              <th className="pb-3">Selling Price (Retail)</th>
              <th className="pb-3">Gross Margin</th>
              <th className="pb-3">Stock on Hand</th>
              <th className="pb-3 text-right pr-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5EAE7]">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-[#3A8067] text-xs">
                  No inventory items match your filter criteria.
                </td>
              </tr>
            ) : (
              filteredProducts.map((p) => {
                const sell = p.selling_price || 0;
                // cost price is in poisha from api
                const cost = p.cost_price !== undefined ? p.cost_price : p.purchase_price;
                const hasCost = cost !== undefined && cost !== null && cost > 0;
                const margin = hasCost && sell > 0 ? ((sell - cost) / sell) * 100 : null;
                const profitTaka = hasCost && sell > 0 ? (sell - cost) / 100 : 0;
                const isToggling = togglingId === p.id;

                return (
                  <tr key={p.id} className="hover:bg-[#E6F7EF]/40 transition">
                    {/* Status Pill Switcher */}
                    <td className="py-3.5 pl-2">
                      <button
                        onClick={() => handleToggleStatus(p)}
                        disabled={isToggling || isAccountant}
                        title={
                          isAccountant
                            ? 'Accountants cannot pause or unpause inventory items'
                            : p.active
                            ? 'Click to Pause item'
                            : 'Click to Resume item'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${
                          p.active
                            ? 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8] hover:bg-[#CAE4D8]'
                            : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7] hover:bg-[#E6F7EF]'
                        } ${isToggling ? 'opacity-50 cursor-wait' : ''} ${
                          isAccountant ? 'cursor-not-allowed opacity-75' : 'cursor-pointer'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            p.active ? 'bg-[#025033] animate-pulse' : 'bg-[#3A8067]'
                          }`}
                        />
                        <span>{p.active ? 'Active' : 'Paused'}</span>
                      </button>
                    </td>

                    {/* SKU */}
                    <td className="py-3.5 font-mono font-bold text-[#3A8067]">{p.sku || 'N/A'}</td>

                    {/* Product Name & Source badge */}
                    <td className="py-3.5">
                      <div className="flex flex-col">
                        <span className="font-bold text-[#025033]">{p.name}</span>
                        {p.source && p.source.startsWith('store_') && (
                          <span className="text-[10px] text-[#3A8067] font-medium">
                            Synced via {p.source.replace('store_', '').toUpperCase()}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cost Price (Purchase Cost) */}
                    <td className="py-3.5 font-mono">
                      {hasCost ? (
                        <span className="text-[#025033] font-semibold">{formatTaka(cost)}</span>
                      ) : (
                        <span className="flex items-center gap-1 text-[#025033] font-bold bg-[#CAE4D8] px-2 py-0.5 rounded-full border border-[#3A8067] inline-flex">
                          <AlertIcon className="w-3 h-3 text-[#025033]" />
                          <span>Missing Cost</span>
                        </span>
                      )}
                    </td>

                    {/* Selling Price (Retail Price) */}
                    <td className="py-3.5 font-mono font-bold text-[#025033]">
                      {formatTaka(p.selling_price)}
                    </td>

                    {/* Gross Margin */}
                    <td className="py-3.5 font-bold">
                      {margin !== null ? (
                        <div className="flex flex-col">
                          <span className="text-[#025033]">
                            {margin.toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-[#3A8067] font-mono">
                            +৳{profitTaka.toLocaleString('en-US', { minimumFractionDigits: 0 })}/unit
                          </span>
                        </div>
                      ) : (
                        <span className="text-[#3A8067]">—</span>
                      )}
                    </td>

                    {/* Stock on Hand */}
                    <td className="py-3.5 font-mono text-[#025033] font-medium">
                      {p.stock_qty || 0} units
                    </td>

                    {/* Action buttons */}
                    <td className="py-3.5 text-right pr-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Pause / Resume Button: Super Admin, Admin, Agency Owner */}
                        {isAccountant ? (
                          <button
                            disabled
                            title="Accountants are not authorized to pause or resume inventory items"
                            className="text-[11px] font-medium bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7] px-2 py-1 rounded-lg cursor-not-allowed opacity-60 flex items-center gap-1"
                          >
                            <span>⏸️</span>
                            <span>Pause</span>
                          </button>
                        ) : p.active ? (
                          <button
                            onClick={() => handleToggleStatus(p)}
                            disabled={isToggling}
                            title="Pause this item from being sold"
                            className="text-[11px] font-bold bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] px-2.5 py-1 rounded-lg transition flex items-center gap-1 disabled:opacity-50 shadow-2xs"
                          >
                            <span>⏸️</span>
                            <span>Pause</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(p)}
                            disabled={isToggling}
                            title="Resume this item for active sales"
                            className="text-[11px] font-bold bg-[#E6F7EF] hover:bg-[#CAE4D8] text-[#025033] border border-[#CAE4D8] px-2.5 py-1 rounded-lg transition flex items-center gap-1 disabled:opacity-50 shadow-2xs"
                          >
                            <span>▶️</span>
                            <span>Resume</span>
                          </button>
                        )}

                        {/* Edit Pricing */}
                        <button
                          onClick={() => {
                            setSelectedProduct(p);
                            setSellingPrice(p.selling_price ? (p.selling_price / 100).toString() : '');
                            setCostPrice(cost ? (cost / 100).toString() : '');
                            setPriceNote('');
                          }}
                          className="text-[11px] font-semibold bg-[#FAFCF9] hover:bg-[#E6F7EF] text-[#025033] border border-[#E5EAE7] px-2.5 py-1 rounded-lg transition"
                        >
                          Edit Pricing
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pricing Update Modal (Cost Price & Selling Price) */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-2xs p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#025033]">
                  Update Pricing: {selectedProduct.name}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  selectedProduct.active ? 'bg-[#E6F7EF] text-[#025033] border-[#CAE4D8]' : 'bg-[#FAFCF9] text-[#3A8067] border-[#E5EAE7]'
                }`}>
                  {selectedProduct.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-[#3A8067] mt-1">
                Cost price updates create a versioned record preserving historical margins for all past orders.
              </p>
            </div>

            <form onSubmit={handleSavePrice} className="flex flex-col gap-3.5">
              {/* Cost Price */}
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  Cost Price / Purchase Cost (৳ Taka)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 750"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
                <span className="text-[10px] text-[#3A8067] mt-0.5 block">
                  Releases deliveries currently on hold due to missing purchase valuation.
                </span>
              </div>

              {/* Selling Price */}
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  Selling Price / Retail Price (৳ Taka)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 1450"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              {/* Note / Audit Trail */}
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  Revision Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Supplier winter discount revision"
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#3A8067] hover:text-[#025033]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#025033] text-[#FFFFFF] rounded-xl text-xs font-bold hover:bg-[#05572F] transition shadow-xs"
                >
                  {saving ? 'Saving...' : 'Save Pricing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pull Inventory from Store Website Modal */}
      {showStoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00432C]/60 backdrop-blur-2xs p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-lg p-6 shadow-2xl flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2">
                <StoreIcon className="w-5 h-5 text-[#025033]" />
                <h3 className="text-base font-bold text-[#025033]">
                  Connect Store &amp; Pull Inventory
                </h3>
              </div>
              <p className="text-xs text-[#3A8067] mt-1">
                Connect your agency&apos;s website to pull and synchronize all inventory items, active/inactive statuses, and prices into Gross Management.
              </p>
            </div>

            {/* Platform Selection */}
            <div>
              <label className="block text-xs font-bold text-[#025033] uppercase tracking-wider mb-2">
                Select Store Platform:
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { id: 'wordpress', label: 'WordPress', sub: 'WooCommerce' },
                  { id: 'shopify', label: 'Shopify', sub: 'Store API' },
                  { id: 'laravel', label: 'Laravel', sub: 'Custom App' },
                  { id: 'daraz', label: 'Daraz', sub: 'Seller Center' },
                  { id: 'custom', label: 'Custom API', sub: 'REST / Hook' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setPlatform(item.id as any)}
                    className={`p-2 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                      platform === item.id
                        ? 'border-[#00432C] bg-[#025033] text-[#FFFFFF] shadow-2xs'
                        : 'border-[#E5EAE7] bg-[#FAFCF9] text-[#025033] hover:border-[#3A8067]'
                    }`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className={`text-[9px] ${platform === item.id ? 'text-[#CAE4D8]' : 'text-[#3A8067]'}`}>
                      {item.sub}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handlePullStoreInventory} className="flex flex-col gap-3.5">
              {/* Store URL */}
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  Store Website URL
                </label>
                <input
                  type="text"
                  placeholder="https://yourstore.com"
                  value={storeUrl}
                  onChange={(e) => setStoreUrl(e.target.value)}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              {/* API Key / Consumer Key */}
              <div>
                <label className="block text-xs font-semibold text-[#025033] mb-1">
                  {platform === 'shopify'
                    ? 'Admin Access Token'
                    : platform === 'wordpress'
                    ? 'WooCommerce Consumer Key (ck_...)'
                    : 'API Key / Token'}
                </label>
                <input
                  type="text"
                  placeholder="ck_live_..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                />
              </div>

              {/* API Secret (if needed) */}
              {platform !== 'shopify' && (
                <div>
                  <label className="block text-xs font-semibold text-[#025033] mb-1">
                    {platform === 'wordpress' ? 'WooCommerce Consumer Secret (cs_...)' : 'API Secret'}
                  </label>
                  <input
                    type="password"
                    placeholder="cs_live_..."
                    value={apiSecret}
                    onChange={(e) => setApiSecret(e.target.value)}
                    className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl px-3 py-2 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033]"
                  />
                </div>
              )}

              {pullMessage && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold ${
                    pullMessage.startsWith('Error')
                      ? 'bg-[#FAFCF9] text-[#025033] border border-[#E5EAE7]'
                      : 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8] flex items-center gap-2'
                  }`}
                >
                  {!pullMessage.startsWith('Error') && <CheckIcon className="w-4 h-4 text-[#025033]" />}
                  <span>{pullMessage}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7]">
                <button
                  type="button"
                  onClick={() => setShowStoreModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#3A8067] hover:text-[#025033]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pulling}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#025033] text-[#FFFFFF] rounded-xl text-xs font-bold hover:bg-[#05572F] transition shadow-xs disabled:opacity-50"
                >
                  <DownloadCloudIcon className="w-4 h-4" />
                  <span>{pulling ? 'Connecting & Pulling...' : 'Pull Store Inventory'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk Upload Inventory Products */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-[#00432C]/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] border border-[#E5EAE7] rounded-3xl w-full max-w-2xl p-6 shadow-2xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-[#E5EAE7] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#025033] text-[#CAE4D8] flex items-center justify-center text-sm shadow-xs border border-[#00432C]">
                  <DownloadCloudIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#025033]">Bulk Upload Inventory Products</h3>
                  <p className="text-xs text-[#3A8067]">
                    Import multiple items via CSV file or paste formatted CSV lines. Existing items match by SKU or Name.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBulkModal(false);
                  setBulkResult(null);
                }}
                className="w-7 h-7 rounded-full hover:bg-[#E6F7EF] text-[#3A8067] flex items-center justify-center font-bold"
              >
                &times;
              </button>
            </div>

            {/* Actions & Format Help */}
            <div className="bg-[#FAFCF9] border border-[#E5EAE7] rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-[#025033] block">Expected CSV Format:</span>
                <code className="text-[11px] text-[#3A8067] font-mono">
                  sku, name, selling_price, cost_price, stock_qty, active
                </code>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E5EAE7] hover:border-[#3A8067] text-[#025033] rounded-xl font-bold text-xs shadow-2xs transition shrink-0"
              >
                <span>📥 Download Sample CSV</span>
              </button>
            </div>

            {/* Input Mode Tabs */}
            <div className="flex items-center gap-2 border-b border-[#E5EAE7] pb-1 text-xs">
              <button
                type="button"
                onClick={() => setBulkMode('upload')}
                className={`px-3 py-1.5 font-bold rounded-xl transition ${
                  bulkMode === 'upload'
                    ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs'
                    : 'text-[#3A8067] hover:text-[#025033]'
                }`}
              >
                Upload CSV File
              </button>
              <button
                type="button"
                onClick={() => setBulkMode('paste')}
                className={`px-3 py-1.5 font-bold rounded-xl transition ${
                  bulkMode === 'paste'
                    ? 'bg-[#025033] text-[#FFFFFF] shadow-2xs'
                    : 'text-[#3A8067] hover:text-[#025033]'
                }`}
              >
                Paste CSV Text
              </button>
            </div>

            {/* Upload Mode 1: File Picker */}
            {bulkMode === 'upload' && (
              <div className="flex flex-col gap-2">
                <label className="border-2 border-dashed border-[#E5EAE7] hover:border-[#3A8067] rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-[#FAFCF9] hover:bg-[#E6F7EF]/30 transition">
                  <DownloadCloudIcon className="w-8 h-8 text-[#3A8067] mb-2" />
                  <span className="text-xs font-bold text-[#025033]">
                    Click to select CSV file from computer
                  </span>
                  <span className="text-[11px] text-[#3A8067] mt-0.5">Supports .csv or .txt files</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {/* Upload Mode 2: Paste CSV */}
            {bulkMode === 'paste' && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[#025033]">Paste CSV Rows:</label>
                <textarea
                  rows={5}
                  value={csvText}
                  onChange={(e) => handleTextChange(e.target.value)}
                  placeholder={`sku,name,selling_price,cost_price,stock_qty,active\nTS-101,Classic Cotton T-Shirt,650,280,50,yes\nHD-201,Fleece Winter Hoodie,1650,750,30,yes`}
                  className="w-full bg-[#FAFCF9] border border-[#E5EAE7] rounded-xl p-3 text-xs font-mono text-[#025033] focus:outline-none focus:border-[#025033] leading-relaxed"
                />
              </div>
            )}

            {/* Live Parsed Preview Table */}
            {parsedRows.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[#025033] flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5 text-[#025033]" />
                    <span>Parsed Preview:</span>
                    <strong className="text-[#025033] bg-[#E6F7EF] px-2 py-0.5 rounded-full border border-[#CAE4D8]">
                      {parsedRows.length} items ready
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setParsedRows([]);
                      setCsvText('');
                    }}
                    className="text-[#3A8067] hover:text-[#025033] text-[11px]"
                  >
                    Clear
                  </button>
                </div>

                <div className="border border-[#E5EAE7] rounded-xl overflow-x-auto max-h-48 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#FAFCF9] text-[10px] uppercase font-bold text-[#3A8067] border-b border-[#E5EAE7]">
                      <tr>
                        <th className="py-2 pl-3">SKU</th>
                        <th className="py-2">Product Name</th>
                        <th className="py-2">Selling (৳)</th>
                        <th className="py-2">Cost (৳)</th>
                        <th className="py-2">Stock</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5EAE7] font-mono text-[11px]">
                      {parsedRows.slice(0, 50).map((r, i) => (
                        <tr key={i} className="hover:bg-[#E6F7EF]/30">
                          <td className="py-1.5 pl-3 font-bold text-[#3A8067]">{r.sku || '—'}</td>
                          <td className="py-1.5 font-sans font-semibold text-[#025033]">{r.name}</td>
                          <td className="py-1.5 text-[#025033]">{r.selling_price ? `৳${r.selling_price}` : '—'}</td>
                          <td className="py-1.5 text-[#3A8067]">{r.cost_price ? `৳${r.cost_price}` : '—'}</td>
                          <td className="py-1.5 text-[#025033]">{r.stock_qty || 0}</td>
                          <td className="py-1.5 pr-3">
                            <span className={`px-1.5 py-0.5 rounded font-sans text-[10px] font-bold ${
                              r.active ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]' : 'bg-[#FAFCF9] text-[#3A8067] border border-[#E5EAE7]'
                            }`}>
                              {r.active ? 'Active' : 'Paused'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length > 50 && (
                  <span className="text-[10px] text-[#3A8067] italic">
                    Showing first 50 rows of {parsedRows.length} total products.
                  </span>
                )}
              </div>
            )}

            {/* Feedback / Result Banner */}
            {bulkResult && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold ${
                  bulkResult.ok
                    ? 'bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8] flex items-center gap-2'
                    : 'bg-[#FAFCF9] text-[#025033] border border-[#E5EAE7]'
                }`}
              >
                {bulkResult.ok && <CheckIcon className="w-4 h-4 text-[#025033] shrink-0" />}
                <span>{bulkResult.message}</span>
              </div>
            )}

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E5EAE7] mt-1">
              <button
                type="button"
                onClick={() => {
                  setShowBulkModal(false);
                  setBulkResult(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-[#3A8067] hover:text-[#025033] rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitBulkUpload}
                disabled={bulkUploading || parsedRows.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#025033] text-[#FFFFFF] rounded-xl text-xs font-bold hover:bg-[#05572F] transition shadow-xs disabled:opacity-50"
              >
                <DownloadCloudIcon className="w-4 h-4" />
                <span>
                  {bulkUploading
                    ? 'Importing...'
                    : `Upload & Import ${parsedRows.length > 0 ? `(${parsedRows.length} items)` : ''}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
