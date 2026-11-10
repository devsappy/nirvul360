/**
 * Resolves the backend base URL dynamically:
 * - On the server (Next.js server-side functions / SSR): uses process.env.BACKEND_URL (injected by Vercel service binding)
 *   or falls back to NEXT_PUBLIC_API_URL / localhost.
 * - In the browser: uses process.env.NEXT_PUBLIC_API_URL if configured, otherwise returns '' (relative path)
 *   so requests are routed to the same origin and handled by Vercel's top-level rewrites.
 */
export function getApiBaseUrl(): string {
  if (typeof window === 'undefined') {
    // Server runtime: Vercel service binding injects BACKEND_URL
    if (process.env.BACKEND_URL) {
      return process.env.BACKEND_URL.replace(/\/+$/, '');
    }
    return (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  }

  // Client runtime (browser)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return '';
}

export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  let url: string;
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    url = endpoint;
  } else {
    const base = getApiBaseUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    url = base ? `${base}${cleanEndpoint}` : cleanEndpoint;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let errDetail = 'Request failed';
    try {
      const data = await res.json();
      errDetail = data.detail || data.message || errDetail;
    } catch {}
    const err = new Error(errDetail);
    (err as any).status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  get: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'GET' }),
  post: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  }),
  put: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  }),
  patch: <T = any>(endpoint: string, data?: any) => apiRequest<T>(endpoint, {
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  }),
  delete: <T = any>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};

/** Format integer poisha into standard Bangladeshi Taka notation (e.g. ৳1,55,550 or -৳1,36,238) */
export function formatTaka(poisha: number | undefined | null): string {
  if (poisha === undefined || poisha === null || isNaN(poisha)) return '৳0';
  const isNegative = poisha < 0;
  const absTaka = Math.abs(poisha) / 100;
  
  // Format with Bangladeshi comma grouping: 1,55,550.00
  const parts = absTaka.toFixed(2).split('.');
  const intPart = parts[0];
  const decPart = parts[1];

  let lastThree = intPart.slice(-3);
  const otherNumbers = intPart.slice(0, -3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInt = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  
  const formatted = decPart === '00' ? formattedInt : `${formattedInt}.${decPart}`;
  return isNegative ? `-৳${formatted}` : `৳${formatted}`;
}

export function formatPct(ratio: number | undefined | null): string {
  if (ratio === undefined || ratio === null || isNaN(ratio)) return '0%';
  return `${(ratio * 100).toFixed(1)}%`;
}

// --- Screen-Specific Typed API Clients ---
import type {
  ExpensesSummaryResponse,
  RecurringExpensesResponse,
  RecurringExpenseItem,
  SupplierItem,
  SupplierStatementData,
  WhatsAppStatusData,
  WhatsAppChatMessage,
  IntegrationsHubData,
  MerchantSettingsResponse,
  CashAccountItem,
  DatedCostPrice,
  BulkPricePreviewRow,
  StockAdjustmentResult,
} from '../types';

export const apiExpenses = {
  getSummary: (period: string = 'this_month') =>
    api.get<ExpensesSummaryResponse>(`/api/expenses/summary?period=${period}`),
  getRecurring: () =>
    api.get<RecurringExpensesResponse>('/api/expenses/recurring'),
  createRecurring: (data: Partial<RecurringExpenseItem>) =>
    api.post('/api/expenses/recurring', data),
  updateRecurring: (id: number, data: Partial<RecurringExpenseItem>) =>
    api.put(`/api/expenses/recurring/${id}`, data),
  createExpense: (data: { head: string; amount: number; date?: string; cash_account_id?: number; note?: string }) =>
    api.post('/api/expenses', data),
  createWithdrawal: (data: { amount: number; date?: string; cash_account_id?: number; note?: string }) =>
    api.post('/api/withdrawals', data),
};

export const apiSuppliers = {
  list: () =>
    api.get<{ suppliers: SupplierItem[]; total_payable_taka?: number; total_advance_taka?: number }>('/api/suppliers'),
  getStatement: (id: number) =>
    api.get<SupplierStatementData>(`/api/suppliers/${id}/statement`),
  create: (data: Partial<SupplierItem>) =>
    api.post('/api/suppliers', data),
  createPurchase: (data: { productId: number; qty: number; unitCost: number; supplierId?: number; date?: string; paidAmount?: number; cashAccountId?: number }) =>
    api.post('/api/purchases', data),
  paySupplier: (data: { supplierId: number; amount: number; date?: string; cashAccountId?: number; note?: string }) =>
    api.post('/api/supplier-payments', data),
};

export const apiWhatsApp = {
  getOverview: () =>
    api.get<WhatsAppStatusData>('/api/whatsapp/overview'),
  getConversation: () =>
    api.get<{ messages: WhatsAppChatMessage[] }>('/api/whatsapp/conversation'),
  simulate: (text: string, phone?: string) =>
    api.post<{ ok: boolean; replies: string[]; pending_draft?: any }>('/api/whatsapp/simulate', { text, phone }),
  confirm: () =>
    api.post<{ ok: boolean; reply: string }>('/api/whatsapp/confirm'),
  reject: () =>
    api.post<{ ok: boolean; reply: string }>('/api/whatsapp/reject'),
};

export const apiIntegrations = {
  getOverview: () =>
    api.get<IntegrationsHubData>('/api/integrations/overview'),
};

export const apiSettings = {
  getSettings: () =>
    api.get<MerchantSettingsResponse>('/api/merchants/settings'),
  updateSettings: (data: Partial<MerchantSettingsResponse>) =>
    api.put('/api/merchants/settings', data),
  getCashAccounts: () =>
    api.get<{ accounts: CashAccountItem[]; total_cash_taka: number }>('/api/cash-accounts'),
  createCashAccount: (data: { name: string; kind: string; opening_balance?: number; is_default?: boolean }) =>
    api.post('/api/cash-accounts', data),
  closeAccount: (confirmationName: string) =>
    api.post('/api/merchants/close', { confirmation_name: confirmationName }),
};

export const apiProducts = {
  getPriceHistory: (productId: number) =>
    api.get<{ product_id: number; history: DatedCostPrice[] }>(`/api/products/${productId}/history`),
  previewBulkPrices: (rows: Array<{ product_id?: number; sku?: string; purchase_price: number }>) =>
    api.post<{ valid: BulkPricePreviewRow[]; skipped: Array<{ product_id?: number; sku?: string; reason: string }> }>('/api/products/prices/bulk-preview', { rows }),
  commitBulkPrices: (rows: Array<{ product_id?: number; sku?: string; purchase_price: number }>) =>
    api.post<{ ok: boolean; applied: number; skipped: any[]; records: any[] }>('/api/products/prices/bulk-commit', { rows }),
  adjustStockCount: (productId: number, countedQty: number, reason?: string) =>
    api.post<StockAdjustmentResult>(`/api/products/${productId}/stock-adjustment`, { counted_qty: countedQty, reason }),
};

export const apiTenants = {
  switchTenant: (merchantId: number) =>
    api.post<{ ok: boolean; active_merchant_id: number; merchant_name: string }>('/api/admin/switch-tenant', {
      merchant_id: merchantId,
    }),
  listTenants: () =>
    api.get<{ tenants: any[] }>('/api/admin/tenants'),
};

