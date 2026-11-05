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

export interface DashboardData {
  range: { from: string; to: string; label: string };
  pnl: PnLReport;
  today_pnl: PnLReport;
  kpis: {
    delivered_sales: number;
    gross_profit: number;
    net_profit: number;
    orders_placed: number;
    delivery_rate: number;
    held_at_couriers: number;
    net_margin_pct: number;
    orders_in_transit: number;
    returned_orders: number;
    courier_accounts_count: number;
    delivered_orders?: number;
    gross_margin_pct?: number;
    settled_orders?: number;
    reconciled_orders?: number;
    misc_expenses?: number;
  };
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
