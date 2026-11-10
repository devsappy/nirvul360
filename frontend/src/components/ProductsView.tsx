'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Product, DatedCostPrice, BulkPricePreviewRow } from '@/types';
import { formatTaka, apiProducts, api } from '@/lib/api';

interface ProductsViewProps {
  products?: Product[];
  onRefresh: () => void;
  onOpenPurchaseModal?: () => void;
  userRole?: string;
}

export function ProductsView({
  products = [],
  onRefresh,
  onOpenPurchaseModal,
}: ProductsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMissingOnly, setFilterMissingOnly] = useState(false);

  // Cost Price History Popover State
  const [historyPopoverProduct, setHistoryPopoverProduct] = useState<Product | null>(null);
  const [priceHistory, setPriceHistory] = useState<DatedCostPrice[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Bulk CSV Upload Drawer State
  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkPricePreviewRow[]>([]);
  const [bulkSkipped, setBulkSkipped] = useState<Array<{ sku?: string; product_id?: number; reason: string }>>([]);
  const [isCommittingBulk, setIsCommittingBulk] = useState(false);
  const [bulkCommitSuccess, setBulkCommitSuccess] = useState('');
  const bulkFileInputRef = useRef<HTMLInputElement | null>(null);

  // Stock Count Adjustment Drawer State
  const [adjustmentDrawerOpen, setAdjustmentDrawerOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState<number | ''>(products[0]?.id ?? '');
  const [adjCounted, setAdjCounted] = useState<number | ''>(products[0]?.stock_qty ?? 0);
  const [adjReason, setAdjReason] = useState('Damaged in storage');
  const [isPostingAdjustment, setIsPostingAdjustment] = useState(false);
  const [adjSuccess, setAdjSuccess] = useState('');

  // Add Product Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newProdSku, setNewProdSku] = useState('');
  const [newProdSelling, setNewProdSelling] = useState('');
  const [newProdCost, setNewProdCost] = useState('');
  const [newProdStock, setNewProdStock] = useState('0');
  const [isAddingProduct, setIsAddingProduct] = useState(false);

  // Quick Add Price Modal State (for unpriced row)
  const [priceModalProduct, setPriceModalProduct] = useState<Product | null>(null);
  const [newSinglePrice, setNewSinglePrice] = useState('');
  const [isSavingSinglePrice, setIsSavingSinglePrice] = useState(false);

  // Calculate missing cost prices and unvalued inventory
  const unpricedProducts = useMemo(() => {
    return products.filter((p) => p.cost_price === undefined || p.cost_price === null || p.cost_price <= 0);
  }, [products]);

  const missingCostCount = unpricedProducts.length;
  // Dynamic calculation of unvalued units from stock
  const missingUnits = unpricedProducts.reduce((sum, p) => sum + (p.stock_qty || 0), 0);
  const missingSalesWorth = unpricedProducts.reduce((sum, p) => sum + ((p.selling_price || 0) * (p.stock_qty || 0)), 0);

  // Total stock at cost
  const totalStockAtCostPoisha = useMemo(() => {
    return products.reduce((sum, p) => sum + ((p.cost_price || 0) * (p.stock_qty || 0)), 0);
  }, [products]);

  // Load Price History when product selected
  useEffect(() => {
    if (historyPopoverProduct) {
      setLoadingHistory(true);
      apiProducts
        .getPriceHistory(historyPopoverProduct.id)
        .then((res) => {
          setPriceHistory(res.history || []);
        })
        .catch((err) => {
          console.error('Failed to load price history', err);
        })
        .finally(() => {
          setLoadingHistory(false);
        });
    }
  }, [historyPopoverProduct]);

  // Initialize Bulk Upload preview from live catalog slice or file upload
  const handleOpenBulkUpload = async () => {
    setBulkDrawerOpen(true);
    setBulkCommitSuccess('');
    try {
      const sampleRows = products.slice(0, 5).map((p) => ({
        product_id: p.id,
        sku: p.sku || `PROD-${p.id}`,
        purchase_price: p.cost_price
          ? p.cost_price / 100
          : p.selling_price
          ? Math.round((p.selling_price * 0.7) / 100)
          : 100,
      }));
      if (sampleRows.length > 0) {
        const preview = await apiProducts.previewBulkPrices(sampleRows);
        setBulkRows(preview.valid || []);
        setBulkSkipped(preview.skipped || []);
      } else {
        setBulkRows([]);
        setBulkSkipped([]);
      }
    } catch (err) {
      console.error('Failed to preview bulk prices', err);
    }
  };

  const handleBulkCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length <= 1) return;
      const headers = lines[0].toLowerCase().split(',').map((h) => h.trim());
      const skuIdx = headers.indexOf('sku');
      const idIdx = headers.indexOf('product_id') !== -1 ? headers.indexOf('product_id') : headers.indexOf('id');
      const priceIdx = headers.findIndex((h) => h.includes('price') || h.includes('cost'));

      const parsedRows: Array<{ sku?: string; product_id?: number; purchase_price: number }> = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        const price = priceIdx !== -1 ? parseFloat(parts[priceIdx]) : NaN;
        if (isNaN(price)) continue;
        const row: { sku?: string; product_id?: number; purchase_price: number } = { purchase_price: price };
        if (skuIdx !== -1 && parts[skuIdx]) row.sku = parts[skuIdx];
        if (idIdx !== -1 && parseInt(parts[idIdx], 10)) row.product_id = parseInt(parts[idIdx], 10);
        parsedRows.push(row);
      }
      if (parsedRows.length > 0) {
        const preview = await apiProducts.previewBulkPrices(parsedRows);
        setBulkRows(preview.valid || []);
        setBulkSkipped(preview.skipped || []);
      }
    } catch (err) {
      console.error('Failed to parse bulk CSV file', err);
    }
  };

  const handleApplyBulkPrices = async () => {
    if (bulkRows.length === 0) return;
    setIsCommittingBulk(true);
    try {
      const payload = bulkRows.map((r) => ({
        product_id: r.product_id,
        sku: r.sku,
        purchase_price: r.new_cost_taka,
      }));
      await apiProducts.commitBulkPrices(payload);
      setBulkCommitSuccess(`Applied ${bulkRows.length} dated price rows to ledger.`);
      setTimeout(() => {
        setBulkCommitSuccess('');
        setBulkDrawerOpen(false);
      }, 2500);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to commit bulk prices');
    } finally {
      setIsCommittingBulk(false);
    }
  };

  // Selected product for stock count adjustment
  const selectedAdjProduct = products.find((p) => p.id === Number(adjProductId)) || products[0];
  const adjSystemStock = selectedAdjProduct?.stock_qty ?? 0;
  const adjCountedNum = adjCounted === '' ? adjSystemStock : Number(adjCounted);
  const adjDelta = adjCountedNum - adjSystemStock;
  const adjUnitCost = selectedAdjProduct?.cost_price ? selectedAdjProduct.cost_price / 100 : 0;
  const adjShrinkageLoss = adjDelta < 0 ? Math.abs(adjDelta) * adjUnitCost : 0;

  const handlePostAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || adjCounted === '') return;

    setIsPostingAdjustment(true);
    try {
      await apiProducts.adjustStockCount(Number(adjProductId), Number(adjCounted), adjReason);
      setAdjSuccess('Stock count adjusted and shrinkage posted to P&L.');
      setTimeout(() => {
        setAdjSuccess('');
        setAdjustmentDrawerOpen(false);
      }, 2500);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to post adjustment');
    } finally {
      setIsPostingAdjustment(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdName.trim()) return;

    setIsAddingProduct(true);
    try {
      await api.post('/api/products', {
        name: newProdName.trim(),
        sku: newProdSku.trim() || undefined,
        selling_price: parseFloat(newProdSelling) || undefined,
        cost_price: parseFloat(newProdCost) || undefined,
        purchase_price: parseFloat(newProdCost) || undefined,
        stock_qty: parseInt(newProdStock, 10) || 0,
      });
      setAddModalOpen(false);
      setNewProdName('');
      setNewProdSku('');
      setNewProdSelling('');
      setNewProdCost('');
      setNewProdStock('0');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to add product');
    } finally {
      setIsAddingProduct(false);
    }
  };

  const handleSaveSinglePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!priceModalProduct || !newSinglePrice) return;

    setIsSavingSinglePrice(true);
    try {
      await api.put(`/api/products/${priceModalProduct.id}/price`, {
        purchase_price: parseFloat(newSinglePrice),
        cost_price: parseFloat(newSinglePrice),
        note: 'Stated purchase price',
      });
      setPriceModalProduct(null);
      setNewSinglePrice('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to save price');
    } finally {
      setIsSavingSinglePrice(false);
    }
  };

  // Filtered Products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filterMissingOnly) {
        if (p.cost_price && p.cost_price > 0) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
    });
  }, [products, filterMissingOnly, searchQuery]);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-12 relative">
      {/* Header matching Improvements/6.jpeg */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 gap-4 border-b border-slate-200/80">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {products.length} products · stock at cost {formatTaka(totalStockAtCostPoisha || 0)}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {onOpenPurchaseModal && (
            <button
              onClick={onOpenPurchaseModal}
              className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
            >
              + Purchase batch
            </button>
          )}
          <button
            onClick={() => setAdjustmentDrawerOpen(true)}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Stock count adjustment
          </button>
          <button
            onClick={handleOpenBulkUpload}
            className="border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold shadow-2xs transition"
          >
            Bulk CSV upload
          </button>
          <button
            onClick={() => setAddModalOpen(true)}
            className="bg-[#062E1F] hover:bg-[#0B3B28] text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-xs transition"
          >
            + Add product
          </button>
        </div>
      </div>

      {/* Missing Cost Price Warning Banner matching 6.jpeg */}
      {missingCostCount > 0 && (
        <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-red-900">
              {missingCostCount} products have no cost price
            </span>
            <span className="text-xs text-red-700 mt-0.5 max-w-2xl leading-relaxed">
              {missingUnits} units of these went out this period, worth {formatTaka(missingSalesWorth)} in sales. Their gross profit is not estimated and not guessed at a percentage — it is held in Needs attention until you enter a real purchase price.
            </span>
          </div>
          <button
            onClick={() => setFilterMissingOnly(!filterMissingOnly)}
            className="bg-white hover:bg-red-50 text-red-800 border border-red-300 font-semibold px-3.5 py-2 rounded-xl text-xs shadow-2xs shrink-0 self-start sm:self-auto transition"
          >
            {filterMissingOnly ? 'Show all products' : `Add the ${missingCostCount} missing prices`}
          </button>
        </div>
      )}

      {/* Products SKU Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-900">Products</span>
            <span className="text-xs text-slate-500">
              Cost price is the price in effect on the delivery date, never an average and never a percentage
            </span>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search SKU or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs px-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#062E1F]"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold text-slate-400">
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">NAME</th>
                <th className="py-2.5 px-3 text-right">COST PRICE</th>
                <th className="py-2.5 px-3 text-right">SELLING PRICE</th>
                <th className="py-2.5 px-3 text-right">MARGIN</th>
                <th className="py-2.5 px-3 text-right">STOCK</th>
                <th className="py-2.5 px-3 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {filteredProducts.map((p) => {
                const hasCost = p.cost_price && p.cost_price > 0;
                const sellingTaka = p.selling_price ? p.selling_price / 100 : 0;
                const costTaka = p.cost_price ? p.cost_price / 100 : 0;
                const marginPct = (hasCost && sellingTaka > 0)
                  ? (((sellingTaka - costTaka) / sellingTaka) * 100).toFixed(1)
                  : null;

                return (
                  <tr
                    key={p.id}
                    className={`transition ${
                      !hasCost ? 'bg-[#FEF2F2]/60 hover:bg-[#FEF2F2]' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                      {p.sku || `PROD-${p.id}`}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 max-w-xs truncate">
                      {p.name}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {hasCost ? (
                        <span className="font-semibold text-slate-900">{formatTaka(p.cost_price)}</span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEE2E2] text-[#991B1B]">
                          No cost price
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700 whitespace-nowrap">
                      {formatTaka(p.selling_price)}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {marginPct !== null ? (
                        <span className="font-semibold text-slate-900">{marginPct}%</span>
                      ) : (
                        <span className="text-red-700 font-medium text-[11px]">not calculated</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {p.stock_qty || 0}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      {hasCost ? (
                        <button
                          onClick={() => setHistoryPopoverProduct(p)}
                          className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
                        >
                          History
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setPriceModalProduct(p);
                            setNewSinglePrice('');
                          }}
                          className="px-2.5 py-1 border border-red-300 rounded-lg text-xs font-bold text-red-800 hover:bg-red-50 transition shadow-2xs"
                        >
                          Add price
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-100 text-[11px] text-slate-500 gap-2">
          <span>
            Stock on hand falls on delivery, not on order placement. Returned parcels put stock back when the courier marks the return received.
          </span>
          <span className="font-semibold text-slate-400 shrink-0">
            {filteredProducts.length} products
          </span>
        </div>
      </div>

      {/* Floating Cost Price History Popover matching Improvements/6.jpeg */}
      {historyPopoverProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            {/* Popover Header */}
            <div className="p-4 bg-[#025033] text-white flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-bold">Cost price history</span>
                <span className="text-xs text-[#CAE4D8]">
                  {historyPopoverProduct.sku || historyPopoverProduct.name}
                </span>
              </div>
              <button
                onClick={() => setHistoryPopoverProduct(null)}
                className="text-[#CAE4D8] hover:text-white text-xs font-bold px-2 py-1 rounded bg-[#05572F]"
              >
                Close
              </button>
            </div>

            {/* Timeline */}
            <div className="p-5 flex flex-col gap-4 max-h-[360px] overflow-y-auto">
              {loadingHistory ? (
                <div className="text-xs text-slate-400 text-center py-6">Loading cost timeline...</div>
              ) : priceHistory.length === 0 ? (
                <div className="text-xs text-slate-400 text-center py-6">No historical price changes recorded.</div>
              ) : (
                priceHistory.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#025033] mt-1 shrink-0" />
                    <div className="flex flex-col flex-1 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {formatTaka(item.purchase_price)}
                        </span>
                        {item.is_current && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
                            In effect now
                          </span>
                        )}
                      </div>
                      <span className="text-slate-500 text-[11px] mt-0.5">
                        {item.date_range_label}
                        {item.batch_no ? ` · batch ${item.batch_no}` : ''}
                        {item.supplier_name ? ` · ${item.supplier_name}` : ''}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Popover Footer Footnote */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-600 leading-relaxed">
              An order delivered on 14 Sep is costed at the price in effect then, not today&apos;s price. Old prices are kept, never overwritten.
            </div>
          </div>
        </div>
      )}

      {/* Side Drawer 1: Bulk CSV Upload Preview matching Improvements/6.jpeg */}
      {bulkDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-lg h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Bulk CSV upload</h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                    Preview — not applied
                  </span>
                </div>
                <button onClick={() => setBulkDrawerOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {bulkRows.length + bulkSkipped.length} rows staged · check them before anything is written.
                </p>
                <input
                  type="file"
                  ref={bulkFileInputRef}
                  accept=".csv"
                  onChange={handleBulkCsvFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => bulkFileInputRef.current?.click()}
                  className="text-xs font-semibold px-2.5 py-1 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition shrink-0"
                >
                  Upload CSV
                </button>
              </div>

              {bulkCommitSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl">
                  ✓ {bulkCommitSuccess}
                </div>
              )}

              {/* Preview Table */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400">
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3 text-right">NEW COST</th>
                      <th className="py-2 px-3 text-right">EFFECTIVE</th>
                      <th className="py-2 px-3 text-right">CHANGE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkRows.map((r) => (
                      <tr key={r.sku}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{r.sku}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">৳{r.new_cost_taka}</td>
                        <td className="py-2.5 px-3 text-right text-slate-500">{r.effective_date}</td>
                        <td className="py-2.5 px-3 text-right">
                          {renderChangeDeltaBadge(r.change_type, r.change_delta)}
                        </td>
                      </tr>
                    ))}
                    {bulkSkipped.map((s, idx) => (
                      <tr key={idx} className="bg-red-50/50">
                        <td className="py-2.5 px-3 font-semibold text-red-800">{s.sku || 'Unknown'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-right text-slate-400">—</td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                            Row skipped
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
              <span className="text-xs text-slate-500">
                {bulkRows.length} rows will be added as dated entries. {bulkSkipped.length} skipped.
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setBulkDrawerOpen(false)}
                  className="w-1/2 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isCommittingBulk || bulkRows.length === 0}
                  onClick={handleApplyBulkPrices}
                  className="w-1/2 py-2.5 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs disabled:opacity-50"
                >
                  {isCommittingBulk ? 'Applying...' : `Apply ${bulkRows.length} rows`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Side Drawer 2: Stock Count Adjustment Drawer matching Improvements/6.jpeg */}
      {adjustmentDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Stock count adjustment</h3>
                <span className="text-[11px] text-slate-400 font-semibold">No prior count</span>
              </div>

              {adjSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold rounded-xl">
                  ✓ {adjSuccess}
                </div>
              )}

              <form onSubmit={handlePostAdjustment} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Product</label>
                  <select
                    value={adjProductId}
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : '';
                      setAdjProductId(val);
                      const prod = products.find((p) => p.id === val);
                      if (prod) setAdjCounted(prod.stock_qty ?? 0);
                    }}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    {products.length === 0 ? (
                      <option value="">No products available</option>
                    ) : (
                      products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku || `PROD-${p.id}`} — {p.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">You counted</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={adjCounted}
                    onChange={(e) => setAdjCounted(e.target.value === '' ? '' : Number(e.target.value))}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>

                {/* Comparison Card */}
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex flex-col gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">System says:</span>
                    <span className="font-semibold text-slate-800">{adjSystemStock}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">You counted:</span>
                    <span className="font-semibold text-slate-800">{adjCountedNum}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                    <span className="text-slate-700">Shrinkage to post:</span>
                    <span className={adjDelta < 0 ? 'text-red-700 font-black' : 'text-slate-900'}>
                      {adjDelta < 0 ? `${adjDelta} units · -৳${adjShrinkageLoss.toLocaleString()}` : `${adjDelta} units`}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Reason</label>
                  <select
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Damaged in storage">Damaged in storage</option>
                    <option value="Theft / unaccounted">Theft / unaccounted</option>
                    <option value="Expired / spoiled">Expired / spoiled</option>
                    <option value="Counting mistake">Counting mistake</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={isPostingAdjustment}
                  className="w-full py-2.5 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold shadow-xs transition disabled:opacity-50 mt-2"
                >
                  {isPostingAdjustment ? 'Posting...' : 'Post adjustment'}
                </button>
              </form>
            </div>

            <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed">
              Shrinkage is costed at ৳{adjUnitCost}, the price in effect today, and lands in the P&amp;L as its own line — never silently inside cost of goods sold.
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl flex flex-col gap-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Add inventory product</h3>
              <button onClick={() => setAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <form onSubmit={handleAddProduct} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Product Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Printed Kurti — Rose"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">SKU Code</label>
                <input
                  type="text"
                  placeholder="e.g. KRT-ROSE-M"
                  value={newProdSku}
                  onChange={(e) => setNewProdSku(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Selling Price (৳)</label>
                  <input
                    type="number"
                    placeholder="1450"
                    value={newProdSelling}
                    onChange={(e) => setNewProdSelling(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-700">Purchase Cost (৳)</label>
                  <input
                    type="number"
                    placeholder="1090"
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Opening Stock</label>
                <input
                  type="number"
                  placeholder="0"
                  value={newProdStock}
                  onChange={(e) => setNewProdStock(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAddingProduct}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold"
                >
                  {isAddingProduct ? 'Adding...' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add Price Modal (for unpriced row) */}
      {priceModalProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl flex flex-col gap-3.5 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Set purchase price</h3>
              <button onClick={() => setPriceModalProduct(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>

            <div className="text-xs text-slate-600">
              Setting dated cost price for <strong>{priceModalProduct.sku || priceModalProduct.name}</strong>.
            </div>

            <form onSubmit={handleSaveSinglePrice} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-slate-700">Purchase Price (৳)</label>
                <input
                  type="number"
                  required
                  step="0.01"
                  min="0.01"
                  placeholder="e.g. 350.00"
                  value={newSinglePrice}
                  onChange={(e) => setNewSinglePrice(e.target.value)}
                  className="text-xs px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPriceModalProduct(null)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSinglePrice}
                  className="px-4 py-2 bg-[#062E1F] hover:bg-[#0B3B28] text-white rounded-xl text-xs font-semibold"
                >
                  {isSavingSinglePrice ? 'Saving...' : 'Set Price'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function renderChangeDeltaBadge(type: string, delta: string) {
  if (type === 'first_price') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E6F7EF] text-[#025033] border border-[#CAE4D8]">
        {delta}
      </span>
    );
  }
  if (type === 'price_increase') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
        {delta}
      </span>
    );
  }
  if (type === 'price_decrease') {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
        {delta}
      </span>
    );
  }
  return <span className="text-slate-400 text-[11px] font-medium">{delta}</span>;
}
