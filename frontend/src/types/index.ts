export type UserRole = 'super_admin' | 'admin' | 'agency_owner' | 'accountant';

export interface User {
  id: number;
  name: string;
  email: string | null;
  whatsapp: string | null;
  role: UserRole;
  role_label: string;
  merchant_id: number;
}

export interface Merchant {
  id: number;
  name: string;
  slug: string;
  currency: string;
  status?: 'active' | 'paused';
  paused_reason?: string | null;
  phone?: string;
  address?: string;
  settings?: Record<string, any>;
}

export interface KpiCardData {
  title: string;
  value: string | number;
  subtext: string;
  badge?: string;
  badgeType?: 'lime' | 'amber' | 'neutral' | 'red' | 'green';
  isHero?: boolean;
  tooltip?: string;
}

export interface OrderItem {
  id?: number;
  product_id: number;
  product_name?: string;
  sku?: string;
  qty: number;
  unit_price: number;
  unit_cost?: number;
}

export interface Order {
  id: number;
  external_id?: string;
  order_date: string;
  customer_name?: string;
  customer_phone?: string;
  address?: string;
  shipping_address?: string;
  courier?: string;
  consignment_id?: string;
  status: 'placed' | 'in_transit' | 'delivered' | 'returned' | 'cancelled';
  subtotal: number;
  shipping_charge: number;
  discount: number;
  total: number;
  advance_paid: number;
  cod_amount: number;
  delivered_date?: string;
  posting_state?: string;
  items?: OrderItem[];
}

export interface Product {
  id: number;
  name: string;
  sku?: string;
  selling_price?: number;
  purchase_price?: number;
  cost_price?: number;
  stock_qty?: number;
  active: boolean;
  external_id?: string;
  source?: string;
  margin?: number | null;
  created_at?: string;
}

export interface CashAccount {
  id: number;
  name: string;
  kind: 'bank' | 'bkash' | 'nagad' | 'cash';
  balance: number;
  is_default?: boolean;
}

export interface PnLLine {
  account: string;
  label: string;
  amount: number;
}

export interface PnLSection {
  label: string;
  amount: number;
  lines: PnLLine[];
}

export interface PnLReport {
  from: string;
  to: string;
  sections: Record<string, PnLSection>;
  gross_sales: number;
  net_sales: number;
  cogs: number;
  gross_profit: number;
  net_profit: number;
  margin: number | null;
  gross_margin: number | null;
  owner_withdrawals: number;
}

export interface PipelineStage {
  key: string;
  label: string;
  count: number;
  pct?: string;
}

export interface ActionAlerts {
  stuck_parcels: number;
  short_settlements: number;
  missing_costs: number;
  courier_settlements_pending: number;
}

export interface PlatformUser {
  id: number;
  name: string;
  email: string | null;
  whatsapp: string | null;
  role: UserRole;
  role_label: string;
  merchant_id: number;
  merchant_name: string;
  merchant_status?: 'active' | 'paused';
  is_active: boolean;
  active_sessions_count: number;
  last_active: string | null;
  last_action?: string | null;
  created_at: string;
}

export interface PlatformUsersSummary {
  total_users: number;
  active_users: number;
  inactive_users: number;
  active_percentage: number;
  roles: {
    super_admin: number;
    admin: number;
    agency_owner: number;
    accountant: number;
  };
  total_merchants: number;
}

export interface PlatformUsersResponse {
  summary: PlatformUsersSummary;
  users: PlatformUser[];
}

export interface CourierDrilldownPeriod {
  regular_return_pct: number;
  paid_return_pct: number;
  total_returns: number;
}

export interface CourierReturnItem {
  courier: string;
  name: string;
  return_pct: number;
  delivered_orders: number;
  returned_orders: number;
  total_orders: number;
  months_6: CourierDrilldownPeriod;
  year_1: CourierDrilldownPeriod;
}

export interface ProductPerformanceSummaryItem {
  product_id: number;
  name: string;
  sku: string;
  orders_placed: number;
  delivered: number;
  returned: number;
  delivered_pct: number;
  returned_pct: number;
  revenue_poisha: number;
  cogs_poisha: number | null;
  gross_profit_poisha: number | null;
  ad_spend_poisha: number | null;
  courier_cost_poisha: number | null;
  net_profit_poisha: number | null;
  net_margin: number | null;
  image_url?: string;
}

export interface DashboardData {
  range: { from: string; to: string; label: string };
  pnl?: PnLReport | null;
  today_pnl?: PnLReport | null;
  kpis: {
    delivered_sales: number;
    gross_profit?: number | null;
    net_profit?: number | null;
    orders_placed: number;
    delivery_rate: number;
    return_rate?: number;
    held_at_couriers: number;
    net_margin_pct?: number | null;
    orders_in_transit: number;
    returned_orders: number;
    courier_accounts_count: number;
    delivered_orders?: number;
    gross_margin_pct?: number | null;
    settled_orders?: number;
    reconciled_orders?: number;
    misc_expenses?: number;
    ad_spend_usd?: number;
    ad_spend_bdt?: number;
    fx_rate?: number;
    courier_returns?: CourierReturnItem[];
  };
  courier_returns?: CourierReturnItem[];
  product_performance?: ProductPerformanceSummaryItem[];
  pipeline: PipelineStage[];
  today_deliveries: Order[];
  alerts: ActionAlerts;
  integrations: {
    courier: boolean;
    meta: boolean;
    whatsapp: boolean;
    supabase: boolean;
  };
  cash?: {
    as_of: string;
    cash_in_hand: number;
    cash_accounts: Array<{ id: number; name: string; kind: string; balance: number }>;
    held_at_couriers: number;
    claims_against_couriers: number;
    owed_to_suppliers: number;
    stock: { total: number; on_hand: number; in_transit: number; unvalued_products: number; unvalued_units: number };
    net_liquid: number;
  };
}

// --- Multi-Store & Navigation Shell Types ---
export type PlanTier = 'trial' | 'starter' | 'growth' | 'scale';

export interface StoreTenant {
  id: number;
  name: string;
  slug?: string;
  plan: PlanTier;
  plan_label: string;
  status: 'active' | 'paused' | 'trial';
  is_active: boolean;
  role: UserRole;
  role_label: string;
  stores_count?: number;
}

// --- Screen 1: Expenses Types ---
export type ExpenseCategory = 'courier' | 'advertising' | 'packaging' | 'rent' | 'salary' | 'internet' | 'utilities' | 'software' | 'transport' | 'other' | 'withdrawal';
export type ExpenseSource = 'whatsapp' | 'whatsapp_confirmed' | 'meta_api' | 'manual' | 'auto' | 'courier_api';

export interface ExpenseHeadDetails {
  total_poisha: number;
  total_taka?: number;
  subtext?: string;
  delivery_poisha?: number;
  cod_poisha?: number;
  returns_poisha?: number;
  orig_currency?: string;
  orig_amount?: number;
  fx_rate?: number;
  fx_rate_date?: string;
  entry_count?: number;
  whatsapp_count?: number;
}

export interface ExpenseEntryItem {
  id: number;
  date: string;
  head: string;
  head_label?: string;
  description: string;
  amount_poisha: number;
  amount_taka: number;
  source: ExpenseSource | string;
  source_label: string;
  confirmed_by?: string;
  created_by?: string;
  is_owner_withdrawal?: boolean;
}

export interface RecurringExpenseItem {
  id: number;
  head: string;
  title?: string;
  name?: string;
  amount?: number;
  amount_poisha: number;
  amount_taka: number;
  posts_on_day: number;
  next_date: string;
  is_active: boolean;
}

export interface OwnerWithdrawalItem {
  id: number;
  date: string;
  amount_poisha: number;
  amount_taka: number;
  cash_account_id?: number;
  cash_account_name?: string;
  note?: string;
}

export interface ExpensesSummaryResponse {
  period: string;
  from_date: string;
  to_date: string;
  total_operating_expenses_poisha: number;
  total_operating_expenses_taka: number;
  sync_status?: {
    meta_last_synced_at?: string;
    whatsapp_last_entry_at?: string;
    courier_last_synced_at?: string;
  };
  details: {
    courier?: ExpenseHeadDetails;
    advertising?: ExpenseHeadDetails;
    packaging?: ExpenseHeadDetails;
    rent?: ExpenseHeadDetails;
    salary?: ExpenseHeadDetails;
    internet?: ExpenseHeadDetails;
    utilities?: ExpenseHeadDetails;
    other?: ExpenseHeadDetails;
  };
  recent_entries: ExpenseEntryItem[];
  owner_withdrawals: {
    taken_this_month_poisha: number;
    taken_this_month_taka: number;
    items: OwnerWithdrawalItem[];
    educational_note: string;
  };
}

export interface RecurringExpensesResponse {
  active_count: number;
  monthly_total_poisha: number;
  monthly_total: number;
  items: RecurringExpenseItem[];
}

// --- Screen 2: Suppliers & Purchases Types ---
export interface SupplierItem {
  id: number;
  name: string;
  phone?: string;
  address?: string;
  terms_days: number;
  categories_summary?: string;
  payable_balance_poisha: number;
  payable_balance_taka: number;
  advance_balance_poisha: number;
  advance_balance_taka: number;
}

export interface PurchaseBatchItem {
  id: number;
  batch_no: string;
  purchase_date: string;
  items_summary: string;
  total_cost_poisha: number;
  total_cost_taka: number;
  paid_amount_poisha: number;
  paid_amount_taka: number;
  status: 'unpaid' | 'part_paid' | 'paid';
}

export interface SupplierLedgerRow {
  id: number;
  date: string;
  entry: string;
  kind?: string;
  method?: string;
  amount_poisha: number;
  amount_taka: number;
  balance_poisha: number;
  balance_taka: number;
}

export interface SupplierStatementData {
  supplier: SupplierItem;
  batches: PurchaseBatchItem[];
  ledger: SupplierLedgerRow[];
  advance_note?: string;
}

export interface MemoDraftData {
  id: number;
  imageUrl?: string;
  fileName: string;
  supplier_name?: string;
  date?: string;
  item_name?: string;
  unit_cost_taka?: number;
  total_cost_taka?: number;
}

// --- Screen 3: WhatsApp Assistant Types ---
export interface WhatsAppStatusData {
  connected: boolean;
  connection: {
    business_number: string;
    last_message_in: string;
    failed_sends_30d: number;
    entries_created_this_month: number;
  };
  ledger_last_synced: string;
  daily_digest: {
    sends_at: string;
    timezone: string;
    language: string;
    contains: string;
    last_sent: string;
  };
  authorized_senders: WhatsAppSenderRow[];
  confirmation_log: WhatsAppAuditLogRow[];
  pending_draft?: WhatsAppDraftPayload | null;
}

export interface WhatsAppSenderRow {
  id: number;
  person: string;
  role: string;
  number: string;
  may_send: string;
  needs_confirmation: string;
}

export interface WhatsAppAuditLogRow {
  id: number;
  when: string;
  what_was_said: string;
  what_we_understood: string;
  answer: string;
  answer_time?: string;
  result_ref?: string;
}

export interface WhatsAppChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  status?: 'delivered' | 'read' | 'pending';
  draft_card?: {
    head: string;
    amount: number;
    date: string;
    status: string;
  };
}

export interface WhatsAppDraftPayload {
  id: number;
  raw_text: string;
  head?: string;
  head_label?: string;
  amount_poisha: number;
  amount_taka: number;
  date: string;
  note?: string;
}

// --- Screen 4: Integrations Types ---
export interface IntegrationSourceCard {
  key: 'pathao' | 'steadfast' | 'redx' | 'facebook_shop' | 'meta_ads' | 'bkash_nagad';
  name: string;
  category: 'courier' | 'store_orders' | 'advertising' | 'payments';
  badge: string;
  status: 'connected' | 'sheet_upload' | 'failed' | 'not_connected';
  status_label: string;
  last_sync: string | null;
  failures_count: number;
  failures_label: string;
  secondary_label?: string;
  brings_in?: string;
  spend_usd?: number;
  spend_taka?: number;
  rate_used?: number;
  rate_date?: string;
  orders_pulled_month?: number;
  page_name?: string;
  error_reason?: string;
  fix_hint?: string;
  actions: Array<{ label: string; action: string; primary?: boolean; variant?: 'default' | 'danger' }>;
}

export interface WritePermissionRow {
  source: string;
  writes: string;
}

export interface IntegrationsHubData {
  healthy_count: number;
  total_count: number;
  full_sync_last_completed: string;
  has_critical_error: boolean;
  alert?: {
    source: string;
    title: string;
    description: string;
    action_label: string;
  };
  cards: IntegrationSourceCard[];
  write_permissions: WritePermissionRow[];
}

// --- Screen 5: Settings Types ---
export interface BusinessProfileData {
  business_name: string;
  legal_entity: string;
  trade_license: string;
  bin: string;
  address: string;
  phone: string;
  email: string;
}

export interface VatTaxData {
  registration_number: string;
  sales_rate: number;
  commissionerate: string;
  active: boolean;
}

export interface FiscalTimezoneData {
  year_start: string;
  timezone: string;
  books_close: string;
}

export interface SubscriptionBillingData {
  plan: PlanTier;
  plan_label: string;
  stores_count: number;
  price_taka_month: number;
  next_charge_date: string;
  payment_method: string;
  orders_used: number;
  orders_limit: number;
  status: 'active' | 'paused';
}

export interface CashAccountItem {
  id: number;
  name: string;
  kind: 'bank' | 'bkash' | 'nagad' | 'cash';
  is_default: boolean;
  balance_poisha: number;
  balance_taka: number;
}

export interface MerchantSettingsResponse {
  business_profile: BusinessProfileData;
  vat_tax: VatTaxData;
  fiscal: FiscalTimezoneData;
  subscription: SubscriptionBillingData;
  last_changed_at: string;
  data_synced_at: string;
}

// --- Screen 6: Inventory Types ---
export interface DatedCostPrice {
  id: number;
  purchase_price: number;
  purchase_price_taka: number;
  effective_from: string;
  effective_to?: string | null;
  date_range_label: string;
  is_current: boolean;
  batch_no?: string | null;
  supplier_name?: string | null;
  note?: string | null;
  source?: string;
}

export interface InventoryProductRow extends Product {
  margin_pct?: number | null;
  cost_price_taka?: number | null;
  selling_price_taka?: number | null;
  has_cost_price?: boolean;
}

export interface BulkPricePreviewRow {
  product_id: number;
  sku: string;
  name: string;
  old_cost: number | null;
  old_cost_taka: number | null;
  new_cost: number;
  new_cost_taka: number;
  change_type: 'first_price' | 'price_increase' | 'price_decrease' | 'no_change';
  change_delta: string;
  effective_date: string;
  warnings: string[];
}

export interface StockAdjustmentResult {
  ok: boolean;
  product_id: number;
  product_name: string;
  system_qty: number;
  counted_qty: number;
  delta: number;
  shrinkage_units: number;
  shrinkage_loss_poisha: number;
  shrinkage_loss_taka: number;
  new_stock: number;
  unit_cost_taka: number;
}

// --- Screen 7: Team & Roles Types ---
export interface TeamMember {
  id: number;
  name: string;
  email: string | null;
  whatsapp?: string | null;
  role: 'owner' | 'agency_owner' | 'manager' | 'accountant' | string;
  role_label: string;
  last_active: string;
  scope: string;
  status: 'active' | 'invited' | string;
  invited_at?: string | null;
  created_at?: string;
}

export interface PermissionsMatrixRow {
  area: string;
  owner: string;
  manager: string;
  accountant: string;
  is_financial_margin?: boolean;
  description?: string;
}

export interface TeamApiResponse {
  members: TeamMember[];
  permissions_matrix: PermissionsMatrixRow[];
  current_user_capabilities: {
    can_see_net_profit: boolean;
    can_see_cost_prices: boolean;
    can_see_supplier_prices: boolean;
    can_edit_expenses: boolean;
    can_add_expenses: boolean;
    can_edit_stock: boolean;
    can_see_cash_flow: boolean;
    can_change_integrations: boolean;
    can_manage_team: boolean;
  };
  member_count?: number;
  last_permissions_changed?: string;
  activity_synced?: string;
}

// --- Screen 8: POS / Offline Store Types ---
export interface PosProductItem {
  id: number;
  name: string;
  sku: string | null;
  selling_price: number;
  selling_price_bdt: number;
  cost_price: number | null;
  stock_qty: number;
  in_stock: boolean;
  active: boolean;
  source?: string;
}

export interface PosCartItem {
  product: PosProductItem;
  qty: number;
  line_unit_bdt: number;
  line_total_bdt: number;
}

export interface PosOrdersSummary {
  today_orders_count: number;
  today_revenue_bdt: number;
  cash_taken_bdt: number;
  bkash_taken_bdt: number;
  nagad_taken_bdt?: number;
  card_taken_bdt?: number;
  total_pos_orders: number;
}

export interface PosRecentOrder {
  id: number;
  external_id: string;
  order_date: string;
  delivered_date?: string;
  customer_name: string;
  customer_phone?: string;
  payment_method?: string;
  time?: string;
  total: number;
  total_bdt: number;
  discount?: number;
  status?: string;
  items_count?: number;
  items?: Array<{
    name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
}

// --- Screen 9: Needs Attention / Exceptions Types ---
export type DiscrepancyType =
  | 'stuck_parcel'
  | 'short_settlement'
  | 'zero_settlement'
  | 'unsettled_cod'
  | 'product_without_price'
  | 'missing_cost'
  | 'duplicate_order'
  | 'missing_parcel';

export interface ExceptionQueueItem {
  id: number;
  type: DiscrepancyType | string;
  legacy_type?: string;
  label?: string;
  status: 'open' | 'resolved';
  value_poisha: number;
  value_taka: number;
  order_id?: number | null;
  product_id?: number | null;
  courier?: string | null;
  settlement_row_id?: number | null;
  order_ref?: string | null;
  customer_name?: string | null;
  product_sku?: string | null;
  order_total_taka?: number | null;
  settled_total_taka?: number | null;
  age_days: number;
  raised_at: string;
  details?: Record<string, any>;
  actions?: string[];
}

export interface ExceptionsSummaryResponse {
  count: number;
  total_unresolved_poisha: number;
  total_unresolved_taka: number;
  oldest_days: number;
  last_sync_time?: string;
  unresolved_by_type: Record<string, { count: number; total: number }>;
  items: ExceptionQueueItem[];
}

// --- Screen 10: Orders & Order Inspection Drawer Types ---
export interface OrderLineItemDetail {
  id: number;
  product_id: number;
  product_name: string;
  sku?: string;
  qty: number;
  unit_price: number;
  line_total: number;
  unit_cost?: number | null;
  cost_date_label?: string | null;
}

export interface OrderStatusTimelineStep {
  key: string;
  label: string;
  timestamp: string | null;
  completed: boolean;
}

export interface OrderCourierChargesBreakdown {
  delivery_charge: number;
  cod_fee: number;
  return_fee: number;
  total: number;
}

export interface OrderProfitWaterfall {
  delivered_value: number;
  cogs: number;
  courier_charges: number;
  packaging: number;
  ad_spend: number;
  net_profit: number | null;
  is_delivered: boolean;
  is_returned: boolean;
}

export interface OrderDetailExtended extends Order {
  line_items: OrderLineItemDetail[];
  timeline: OrderStatusTimelineStep[];
  courier_charges_breakdown: OrderCourierChargesBreakdown;
  waterfall: OrderProfitWaterfall;
  profit_poisha?: number | null;
  profit_taka?: number | null;
}

// --- Screen 11: Courier Settlements Types ---
export interface SettlementUploadedRow {
  row_id?: number;
  consignment_id: string;
  order_id?: number | null;
  customer_name?: string;
  cod_collected: number; // in poisha
  delivery_charge: number; // in poisha
  cod_fee: number; // in poisha
  return_charge: number; // in poisha
  charges?: number; // total charges in poisha
  match_status?: 'matched' | 'disputed';
  discrepancy_reason?: string;
  recommended_action?: 'resolve' | 'hold' | 'ignore';
}

export interface CourierReceivableSummary {
  courier: string;
  name: string;
  parcels: number;
  held_poisha: number;
  held_taka: number;
}

export interface SettlementReceivablesSummaryResponse {
  total_held_poisha: number;
  total_held_taka: number;
  couriers_count: number;
  last_synced_at?: string | null;
  last_uploaded_at?: string | null;
  outstanding_by_courier: CourierReceivableSummary[];
  charges_this_period: {
    delivery: Record<string, number>;
    cod_fee: Record<string, number>;
    return_charge: Record<string, number>;
  };
  returned_parcels_count: number;
}

// --- Screen 12: Reports & SKU Economics Types ---
export interface SkuEconomicsRow {
  product_id: number;
  sku: string;
  name: string;
  orders_placed: number;
  delivered: number;
  returned: number;
  delivered_pct: number;
  returned_pct: number;
  revenue_poisha: number;
  cogs_poisha: number | null;
  courier_cost_poisha: number;
  ad_spend_poisha: number;
  net_profit_poisha: number | null;
  net_margin: number | null;
  missing_cost_price: boolean;
  unmapped_campaign: boolean;
}

export interface ProductPerformanceSummaryTotals {
  total_products_moved: number;
  total_orders_placed: number;
  total_delivered: number;
  total_returned: number;
  total_revenue_poisha: number;
  total_cogs_poisha: number;
  total_courier_fees_poisha: number;
  total_ad_spend_poisha: number;
  total_sku_net_profit_poisha: number;
}

export interface AccountingFootnoteData {
  high_return_sku?: {
    sku: string;
    loss_poisha: number;
    returned_pct: number;
  } | null;
  missing_cost_sku?: {
    sku: string;
  } | null;
  unmapped_ad_spend_poisha: number;
  total_ad_spend_poisha?: number;
  unallocated_packaging_poisha: number;
  unallocated_fixed_costs_poisha: number;
  dashboard_net_profit_poisha?: number;
  dashboard_pnl_net_profit_poisha?: number;
  sku_net_profit_sum_poisha?: number;
  unresolved_exceptions_poisha: number;
  reconciliation_formula?: string;
}

export interface ProductPerformanceResponse {
  period: string;
  from_date: string;
  to_date: string;
  data_synced_at: string;
  rows: SkuEconomicsRow[];
  summary_totals: ProductPerformanceSummaryTotals;
  footnote_reconciliation: AccountingFootnoteData;
}


