# Nirvul360 Dual-Track E2E Testing Infrastructure (TEST_INFRA)

## Architecture Overview

The Nirvul360 testing infrastructure provides requirement-driven, opaque-box end-to-end verification across the entire multi-tenant automated accounting platform. The test suite enforces the core accounting principles, business rules, and interface contracts defined in `ORIGINAL_REQUEST.md`, `PROJECT.md`, `Improvements/1.jpeg–12.jpeg`, and `Improvements/Nirvul360 Admin Panel.pdf`.

### Core Accounting & System Invariants
1. **Integer Poisha Representation**: All monetary balances, revenues, costs, and expenses are represented in integer poisha (1 BDT = 100 poisha) to prevent floating-point drift.
2. **Double-Entry & Immutability**: Financial transactions write to append-only tables (`journals`, `journal_lines`, `product_price_history`, `audit_log`). In-place `UPDATE` and `DELETE` operations are strictly blocked by engine-level triggers.
3. **Owner Withdrawal Isolation**: Cash drawings by business owners reduce cash assets but are strictly excluded from Operating Expenses and Net Profit calculations.
4. **FIFO & Versioned Costing**: COGS calculations reference versioned purchase prices tied to chronological inventory batches and effective date ranges.
5. **Discrepancy Quarantine**: Unreconciled courier settlements, stuck parcels, and unpriced SKUs are isolated in the `exception_queue` and withheld from Net Profit until explicitly resolved with approved reason codes.
6. **Super Admin Impersonation Audit**: Super Admin tenant switching (`admin_view_as_owner`) creates non-repudiable audit records with actor IDs and timestamp metadata.
7. **Dynamic Data Principle**: Zero hardcoding of mockup demo values. All telemetry, KPI grids, summaries, and reports compute directly from live application state.

---

## 4-Tier Testing Methodology

```
+-------------------------------------------------------------------------+
| Tier 4: Real-World Scenarios (End-to-End Merchant Lifecycle Workflows)   |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 3: Cross-Feature Combinations (Pairwise Inter-Module Interactions) |
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (Limits, Overflow, Zero, Auth, Triggers)|
+-------------------------------------------------------------------------+
                                    ^
+-------------------------------------------------------------------------+
| Tier 1: Feature Coverage (>=5 Comprehensive Cases Per Feature Area)     |
+-------------------------------------------------------------------------+
```

---

## Tier 1: Feature Coverage

### Feature Area 1: Client Accounting & Navigation
Covers Screens 1, 2, 5 (Expenses, Recurring Overheads, Withdrawals, Suppliers, Purchases, Settings).

- **TC-1.1: Expense Entry Creation & Category Breakdown (`POST /api/expenses`, `GET /api/money`, `GET /api/expenses/summary`)**
  - *Input*: Post packaging expense `৳350` (35,000 poisha) and courier expense `৳1,200` (120,000 poisha) for current month.
  - *Expected Output*: Expenses recorded in `journals` with `source='manual'`, total expenses reflect `৳1,550`, category breakdown shows `packaging=35000` and `courier=120000`.
  - *Verification*: Query `GET /api/money` and `GET /api/expenses/summary?period=this_month`.

- **TC-1.2: Recurring Expenses Forward-Only Generation (`GET /api/expenses/recurring`)**
  - *Input*: Configure recurring monthly rent (`৳18,000`), salary (`৳25,000`), and internet (`৳2,500`) posting on day 1 and 3.
  - *Expected Output*: API returns active recurring items with `posts_on_day`, calculated `next_date`, and monthly total `৳45,500`. Editing an amount does not alter past posted entries.
  - *Verification*: Query `GET /api/expenses/recurring` and verify response structure and amounts.

- **TC-1.3: Owner Cash Withdrawal Isolation (`POST /api/withdrawals`, `GET /api/dashboard/pnl`)**
  - *Input*: Record owner withdrawal of `৳5,000` (500,000 poisha) from default cash account.
  - *Expected Output*: Cash account balance decreases by 500,000 poisha. PnL report `operating_expenses` remains unaffected; `net_profit` is not reduced by the withdrawal.
  - *Verification*: Compare cash balance before/after via `GET /api/dashboard/cash` and verify `GET /api/dashboard/pnl` shows 0 impact on expenses.

- **TC-1.4: Supplier Master-Detail & Payables Ledger (`GET /api/suppliers`, `POST /api/supplier-payments`)**
  - *Input*: Create supplier "Rahim Fabrics" with terms 30 days. Record purchase batch of `৳22,400` unpaid, and partial payment of `৳4,000`.
  - *Expected Output*: `payable_balance` equals `৳18,400`. Supplier statement shows chronological purchase batch row and payment row with negative balance delta.
  - *Verification*: `GET /api/suppliers` and `GET /api/suppliers/{id}/statement`.

- **TC-1.5: Merchant Business Settings & Tax Configuration (`GET /api/settings`, `POST /api/settings`)**
  - *Input*: Update trade license, BIN (`BIN-987654321`), VAT registration rate (7.5%), and fiscal start month (July).
  - *Expected Output*: Settings persist and return in merchant config; tax calculations apply 7.5% default sales VAT rate.
  - *Verification*: Query `GET /api/settings` and inspect stored JSON schema.

---

### Feature Area 2: Operations, POS & Fulfillment
Covers Screens 6, 8, 9, 10, 11 (Inventory, POS Counter, Discrepancies, Orders, Settlements).

- **TC-2.1: POS Register Checkout & Real-Time Accounting Flow (`POST /api/pos/checkout`)**
  - *Input*: Sell 2 units of SKU-A (`৳1,200` each) via POS counter with payment split: `৳1,500` Cash, `৳900` bKash.
  - *Expected Output*: Order created with status `delivered`, stock decremented by 2, `journal_lines` debits Cash (150,000 poisha) and bKash (90,000 poisha), credits Sales Revenue (240,000 poisha).
  - *Verification*: Verify response `order_id`, stock count via `GET /api/products`, and ledger entries.

- **TC-2.2: Multi-Filter Orders & Delivered/Return Profit Badges (`GET /api/orders`)**
  - *Input*: Query orders filtered by status (`delivered` vs `returned`) and date range.
  - *Expected Output*: Delivered orders return calculated positive profit; returned orders return courier return fee loss (e.g. -৳120) with red badge indicator.
  - *Verification*: Inspect order list items for `net_profit`, `margin_pct`, and courier fee deductions.

- **TC-2.3: Courier Settlement Reconciliation 2-Step Wizard (`POST /api/settlements/preview`, `POST /api/settlements/commit`)**
  - *Input*: Upload courier settlement sheet (CSV) containing 5 delivered consignments and 1 short-paid consignment.
  - *Expected Output*: Preview classifies 5 orders as `matched` (clearing to Cash) and 1 order as `disputed` (short settlement discrepancy flagged). Commit clears matched cash and logs exception.
  - *Verification*: `POST /api/settlements/preview` returns preview split; `POST /api/settlements/commit` posts journals and queues exception.

- **TC-2.4: Needs Attention Discrepancy Quarantine (`GET /api/exceptions`, `POST /api/exceptions/{id}/resolve`)**
  - *Input*: Inspect unpriced SKU sale and short-settlement exception in quarantine. Resolve short settlement with reason code `partial_delivery` and adjustment notes.
  - *Expected Output*: Unresolved value decreases by discrepancy amount; exception status updates to `resolved`; adjustment journal posts to P&L.
  - *Verification*: Query `GET /api/exceptions` before and after resolution.

- **TC-2.5: Stock Adjustment & Shrinkage Loss to P&L (`POST /api/products/{id}/stock-adjust`)**
  - *Input*: Record physical inventory count discrepancy of -5 units (shrinkage/damage) at unit cost `৳400`.
  - *Expected Output*: Stock balance reduced by 5 units; journal entry debits Shrinkage Loss (200,000 poisha) and credits Inventory Asset (200,000 poisha).
  - *Verification*: Verify `stock_movements` table and `GET /api/dashboard/pnl` shows shrinkage expense.

---

### Feature Area 3: Super Admin Platform & Tenant Management
Covers Admin Pages 1, 2, 3 (Platform Overview, Tenants Directory, Users & Sessions).

- **TC-3.1: Platform Overview Telemetry Header (`GET /api/admin/overview`, `GET /api/admin/stats`)**
  - *Input*: Super Admin requests platform overview telemetry.
  - *Expected Output*: Returns aggregate MRR (computed from active tenants' plans), active/trial/paused tenant counts, platform delivered GMV, and system health status. Zero hardcoded mock figures.
  - *Verification*: Execute `GET /api/admin/overview` and verify all KPI values match aggregated SQL queries across `merchants` and `orders`.

- **TC-3.2: Tenant Directory & Status Filtering (`GET /api/admin/tenants`)**
  - *Input*: Super Admin lists tenants filtered by `status=active`, `status=trial`, `status=paused`.
  - *Expected Output*: Returns correct filtered tenant subsets with owner details, GMV, order volume, and integration connection statuses.
  - *Verification*: Compare count of returned tenants with database count by status.

- **TC-3.3: Tenant Inspection Drawer Telemetry (`GET /api/admin/tenants/{id}/inspection`)**
  - *Input*: Super Admin inspects specific tenant organization `#id`.
  - *Expected Output*: Returns 2x2 metric grid (Delivered GMV, Return Rate, Unresolved Money, AI Tokens Used), per-channel integration sync statuses, and plan usage progress bars.
  - *Verification*: Match returned inspection metrics against raw merchant data.

- **TC-3.4: Super Admin Tenant Impersonation & Audit (`POST /api/admin/switch-tenant`)**
  - *Input*: Super Admin switches context to target tenant `#id`.
  - *Expected Output*: Session active merchant context updates; operational API calls return target tenant's data; `audit_log` records immutable `admin_switch_context` entry with admin user ID.
  - *Verification*: Assert `switch_res.status_code == 200`, verify `GET /api/orders` returns switched tenant's orders, and inspect `audit_log`.

- **TC-3.5: User Directory & Stale Session Revocation (`GET /api/admin/users`, `POST /api/admin/sessions/revoke`)**
  - *Input*: Query all platform users with role breakdown; revoke all sessions idle > 30 days.
  - *Expected Output*: Returns registered accounts, active now count, and role distribution. Stale sessions are revoked from `sessions` table.
  - *Verification*: `GET /api/admin/users` followed by session table verification.

---

### Feature Area 4: Super Admin Operations, Revenue & Control
Covers Admin Pages 4, 5, 6, 7, 8, 9, 10, 11 (Exceptions, Billing, Jobs, Integrations, Audit, AI, Support, Settings).

- **TC-4.1: Platform-Wide Exception Triaging & Priority Broadcast (`GET /api/admin/exceptions`)**
  - *Input*: Super Admin inspects platform-wide exception summary.
  - *Expected Output*: Returns total unresolved money across all merchants, breakdown by exception category, and prioritized merchant list ordered by unresolved value.
  - *Verification*: Assert category sum equals platform unresolved total.

- **TC-4.2: SaaS Billing, Plans Grid & Dunning Management (`GET /api/admin/billing`)**
  - *Input*: Query SaaS billing metrics, subscription plans (Starter ৳500, Growth ৳1,000, Scale ৳2,500), and failed collections.
  - *Expected Output*: Accurate MRR, ARR, active subscribers per plan, and dunning retry table with retry attempt counters.
  - *Verification*: Assert MRR equals sum of active tenant subscription fees.

- **TC-4.3: Scheduled Jobs Telemetry & Dead-Letter Queue (`GET /api/admin/jobs`)**
  - *Input*: Query telemetry for the 13 background cron workers and dead-letter queue.
  - *Expected Output*: Returns status for courier sync, meta ads pull, daily digest, and dunning jobs; reports queue depths and failed job error snippets.
  - *Verification*: Assert response includes all scheduled job keys and DLQ count.

- **TC-4.4: Integration Health Monitor & Token Expiry (`GET /api/admin/integrations`)**
  - *Input*: Query connection health across Courier, Meta Ads, WhatsApp, Store, and MFS adapters.
  - *Expected Output*: Returns connector uptime %, failing connections count, and list of expiring tokens requiring relink prompts.
  - *Verification*: Check health status categories and token expiration warnings.

- **TC-4.5: Immutable 7-Year Audit Trail (`GET /api/admin/audit-log`)**
  - *Input*: Query audit log with filters: `admin_only=true`, `money_changing=true`.
  - *Expected Output*: Returns chronologically ordered append-only audit entries containing `actor`, `action`, `entity`, `before`, `after`, and timestamp.
  - *Verification*: Confirm all returned entries possess valid non-empty actor and entity IDs.

---

## Tier 2: Boundary & Corner Cases

- **TC-B1: Zero & Sub-Unit Precision (0 Poisha & 1 Poisha Boundary)**
  - *Input*: Post order or expense with 0 amount; post transaction with exactly 1 poisha (0.01 BDT).
  - *Expected Output*: 0 amount rejected with HTTP 400/422 validation error. 1 poisha successfully processed, stored as integer `1`, and formatted as `৳0.01`.
  - *Verification*: Confirm integer poisha math without round-off artifacts.

- **TC-B2: Overflow & Extreme Value Handling (৳100,000,000 / 10 Billion Poisha)**
  - *Input*: Submit transaction with extreme value `৳100,000,000` (10,000,000,000 poisha).
  - *Expected Output*: System stores and calculates 64-bit integer without integer overflow or float truncation.
  - *Verification*: Assert retrieved value equals exact submitted value.

- **TC-B3: Date & Calendar Boundaries (Leap Year Feb 29 & Month-End Cutoffs)**
  - *Input*: Post transactions on `2024-02-29`, `2026-02-28`, and monthly closing boundary `2026-10-31 23:59:59` vs `2026-11-01 00:00:00`.
  - *Expected Output*: Date parser handles valid leap year dates, rejects invalid dates (`2026-02-29` HTTP 400), and assigns entries to the correct reporting month.
  - *Verification*: Verify PnL date filtering boundaries (`from_date` and `to_date` inclusivity).

- **TC-B4: Negative Amounts & Refund Invariants**
  - *Input*: Submit expense with negative amount `amount = -500`.
  - *Expected Output*: API rejects negative operating expenses with 400 Bad Request; refunds must use formal credit notes or return workflow.
  - *Verification*: Assert HTTP 400 with validation message.

- **TC-B5: Role-Based Access Control Boundaries (Accountant vs Agency Owner vs Super Admin)**
  - *Input*: Authenticate as `accountant` and attempt to call `POST /api/integrations/courier` and `GET /api/admin/tenants`.
  - *Expected Output*: Both calls fail with HTTP 403 Forbidden ("Permission denied: Only Agency Owners or Super Admins").
  - *Verification*: Assert status 403 and error message content.

- **TC-B6: Immutable Ledger Trigger Enforcement (SQL Injection & Bypass Rejection)**
  - *Input*: Attempt direct SQL `UPDATE journals SET amount = 0` or `DELETE FROM audit_log`.
  - *Expected Output*: Database engine trigger aborts execution with `OperationalError: journals table is append-only`.
  - *Verification*: Execute raw SQL in test and assert trigger exception is raised.

- **TC-B7: Paused Tenant Session Lockout**
  - *Input*: Super Admin pauses tenant `#id`. Authenticated merchant staff makes request to `/api/orders`.
  - *Expected Output*: Request rejected with HTTP 403 Forbidden and message specifying paused reason.
  - *Verification*: Verify lockout triggers immediately upon tenant pause and clears upon resume.

---

## Tier 3: Cross-Feature Combinations

- **TC-C1: Return Leg vs PnL & Courier Return Fee**
  - *Interaction*: Order transition from `in_transit` to `returned`.
  - *Expected Outcome*: Initial sales revenue is reversed. COGS is NOT charged to P&L (goods return to inventory asset). Courier return fee (e.g. `৳120`) is debited as operating expense. Net order profit is negative `–৳120`.
  - *Verification*: Verify `GET /api/orders/{id}` profit waterfall and `GET /api/dashboard/pnl`.

- **TC-C2: Discrepancy Quarantine vs Settlement Clearing**
  - *Interaction*: Courier settlement batch imports with 1 short-paid consignment.
  - *Expected Outcome*: Matched portion clears to cash immediately. Short-settled portion is quarantined in `exception_queue`. Net profit does NOT recognize the contested cash until staff assigns reason code `partial_delivery`.
  - *Verification*: Trace cash account balance vs PnL recognized profit before and after exception resolution.

- **TC-C3: Owner Withdrawal vs Operating Overhead**
  - *Interaction*: Owner withdraws `৳10,000` cash; operating expenses incurred `৳4,000`.
  - *Expected Outcome*: Cash account decreases by `৳14,000`. Dashboard PnL shows Operating Expenses = `৳4,000`. Net Profit reflects only operating overheads, completely isolated from the `৳10,000` withdrawal.
  - *Verification*: Assert `cash_delta == -1400000` and `pnl_expenses == 400000`.

- **TC-C4: Super Admin Tenant Switching vs Multi-Tenant Data Isolation**
  - *Interaction*: Super Admin switches from Tenant A to Tenant B, creates an order, then switches to Tenant C.
  - *Expected Outcome*: Order created under Tenant B is completely invisible to Tenant A and Tenant C. Each tenant's cash balances, orders, and reports remain isolated. Audit log tracks both switch events.
  - *Verification*: Query orders under each merchant ID and assert complete partition.

- **TC-C5: Dated FIFO Purchase Batch vs POS Retail Sale Costing**
  - *Interaction*: Batch 1 purchased 10 units @ `৳200` on Nov 1. Batch 2 purchased 10 units @ `৳250` on Nov 5. POS sells 12 units on Nov 6 @ `৳500`.
  - *Expected Outcome*: POS sale COGS computes via FIFO: (10 * 200) + (2 * 250) = `৳2,500`. Gross profit = `৳6,000 - ৳2,500 = ৳3,500`.
  - *Verification*: Inspect `order_items` COGS allocation and resulting PnL gross profit.

---

## Tier 4: Real-World Merchant Accounting Scenarios

- **TC-W1: End-to-End E-Commerce Order Lifecycle**
  - *Workflow*:
    1. Order created (`placed`, COD `৳2,400`, shipping `৳120`).
    2. Consignment dispatched via Pathao courier webhook (`in_transit`).
    3. Courier delivers parcel to customer (`delivered`).
    4. Weekly courier settlement file processed via settlement wizard.
    5. COD collected minus courier delivery fee (`৳120`) clears to Merchant Bank account.
    6. Double-entry ledger updates: Cash debited `৳2,280`, Courier Fee debited `৳120`, Sales Revenue credited `৳2,400`.
  - *Success Criteria*: All intermediate journal entries balance to zero, order profit is positive, cash matches bank deposit.

- **TC-W2: Raw Purchase to POS Sale with Multi-Payment Checkout**
  - *Workflow*:
    1. Enter supplier purchase batch of 50 bags @ `৳450` from "Hossain Accessories".
    2. Record partial payment of `৳10,000` via bKash; `৳12,500` remains payable.
    3. Customer purchases 2 bags in retail POS register for `৳1,600`.
    4. Customer pays split: `৳1,000` Cash + `৳600` bKash.
    5. Cash drawer registers +৳1,000 cash and +৳600 bKash. COGS of `৳900` recognized.
  - *Success Criteria*: Stock count = 48, supplier payable = `৳12,500`, cash ledger balanced, POS sale receipt issued.

- **TC-W3: Short Settlement Quarantine, Triaging & Resolution**
  - *Workflow*:
    1. Delivered order expected COD = `৳1,800`.
    2. Courier settlement remittance provides only `৳1,500` with ৳300 courier deduction.
    3. Settlement engine flags short settlement discrepancy of `৳300` into `exception_queue`.
    4. Merchant accountant investigates and resolves exception with reason code `door_discount` (customer was given discount at doorstep).
    5. Discrepancy is removed from quarantine; ৳300 posts as sales discount expense; PnL reflects net adjusted profit.
  - *Success Criteria*: Zero unaccounted funds, exception queue cleared, audit log captures accountant resolution notes.

- **TC-W4: Multi-Tenant Platform Operations & Dunning Suspension**
  - *Workflow*:
    1. Super Admin onboards new merchant "Dhaka Trends" on Growth plan (`৳1,000/mo`).
    2. Merchant processes 25 orders; telemetry tracks GMV and active sessions.
    3. Monthly subscription billing collection fails (Attempt 1 of 3, 2 of 3, 3 of 3).
    4. Dunning engine pauses merchant account; reason logged "Subscription payment overdue".
    5. Merchant staff logins are blocked from operational APIs (HTTP 403).
    6. Super Admin inspects tenant in admin drawer, collects payment offline, and resumes account.
    7. Merchant staff access is instantly restored; all historical data is intact.
  - *Success Criteria*: Strict tenant isolation, complete audit trail for pause/resume, zero data loss.

---

## Test Execution Commands & Tooling

```bash
# Run the entire E2E test suite
pytest backend/tests/test_e2e_suite.py -v

# Run with short summary output
pytest backend/tests/test_e2e_suite.py -q

# Run specific tier test cases
pytest backend/tests/test_e2e_suite.py -k "tier1" -v
pytest backend/tests/test_e2e_suite.py -k "tier2" -v
pytest backend/tests/test_e2e_suite.py -k "tier3" -v
pytest backend/tests/test_e2e_suite.py -k "tier4" -v

# Run negative and security tests
pytest backend/tests/test_e2e_suite.py -k "negative" -v
```
