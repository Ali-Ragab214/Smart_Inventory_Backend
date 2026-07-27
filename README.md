# StockSavvy Backend — ERP Flow Summary

> AI-Powered Inventory Management Platform | NestJS · TypeORM · PostgreSQL · BullMQ · Redis

---

## 🏗️ Architecture Overview

The backend follows a **modular monolith** architecture built with NestJS. Each business domain lives in its own module with its own entities, services, controllers, DTOs, and mappers.

All endpoints except `POST /auth/register` and `POST /auth/login` are protected by **JWT Bearer authentication**.

---

## 🔐 Authentication Flow

```
POST /auth/register  →  Creates tenant owner + main warehouse  →  Returns user + access_token
POST /auth/login     →  Validates credentials                  →  Returns access_token
```

- Passwords are **bcrypt-hashed** via a `@BeforeInsert` TypeORM hook — never stored in plain text.
- The JWT payload carries `{ sub: userId, username }`.
- Every protected route reads `req.user.id` from the decoded token (via Passport JWT strategy).

---

## 👤 User Roles

| Role | Description |
|---|---|
| `tenant_owner` | Business owner. Created via registration. Owns one or more warehouses. |
| `warehouse_manager` | Manages a specific branch warehouse. |
| `branch_manager` | Manages day-to-day operations of a branch. |
| `inventory_clerk` | Records stock movements. |
| `super_admin` | Platform-level admin (internal). |

---

## 🏢 Multi-Branch Tenant Model

A **Tenant** is a `User` with the role `tenant_owner`. They can own multiple `Warehouse` records (branches).

```
User (tenant_owner)
 ├── Warehouse [isMain: true]   ← auto-created on registration (main branch)
 ├── Warehouse [isMain: false]  ← additional branches created via POST /warehouses
 └── Warehouse [isMain: false]
```

**Key rules:**
- `isMain: true` is set **only** by the registration flow — it cannot be set through the API.
- `POST /warehouses` automatically reads the authenticated user's ID from the JWT and sets it as `tenantId`.
- A `User` also has a `warehouseId` — the branch they are **assigned to work at**.

---

## 📦 Modules & API Endpoints

### Auth — `/auth`
| Method | Route | Description |
|---|---|---|
| POST | `/auth/register` | Register a new tenant owner + auto-create main warehouse |
| POST | `/auth/login` | Log in and receive a JWT token |

### Users — `/users`
| Method | Route | Description |
|---|---|---|
| GET | `/users` | List all users (paginated) |
| GET | `/users/:id` | Get a user by ID |
| POST | `/users` | Create a new sub-user (e.g. warehouse manager) |
| PATCH | `/users/:id` | Update a user |
| DELETE | `/users/:id` | Soft-delete a user |

### Warehouses — `/warehouses`
| Method | Route | Description |
|---|---|---|
| POST | `/warehouses` | Create a new branch warehouse (tenantId from JWT) |
| GET | `/warehouses` | List all warehouses |
| GET | `/warehouses/:id` | Get a warehouse by ID |
| PATCH | `/warehouses/:id` | Update a warehouse |
| DELETE | `/warehouses/:id` | Soft-delete a warehouse |

### SKUs — `/sku`
| Method | Route | Description |
|---|---|---|
| POST | `/sku` | Create a single SKU |
| POST | `/sku/import` | Bulk import SKUs from CSV |
| GET | `/sku` | List all SKUs (paginated, searchable) |
| GET | `/sku/:id` | Get a SKU by ID |
| PATCH | `/sku/:id` | Update a SKU |
| DELETE | `/sku/:id` | Delete a SKU |

### Inventory — `/inventory`
| Method | Route | Description |
|---|---|---|
| GET | `/inventory/skus/low-stock` | List SKUs below their reorder threshold |
| POST | `/inventory/skus/:id/movements` | Record a stock movement (IN / OUT / ADJUSTMENT) |

### Stock Movements — `/inventory/stock-movements`
| Method | Route | Description |
|---|---|---|
| GET | `/inventory/stock-movements/sku/:skuId` | Movement history for a SKU |
| GET | `/inventory/stock-movements/sku/:skuId/reconcile` | Reconcile stock for a SKU |
| GET | `/inventory/stock-movements/sku/:skuId/consumption` | Consumption report for a SKU |

### Purchase Orders — `/purchase-orders`
| Method | Route | Description |
|---|---|---|
| POST | `/purchase-orders` | Create a new purchase order |
| GET | `/purchase-orders` | List all purchase orders |
| GET | `/purchase-orders/:id` | Get a purchase order by ID |
| POST | `/purchase-orders/:id/transition` | Transition a PO status (e.g. draft → approved) |

**PO Status lifecycle:**
```
draft → pending_approval → approved → sent → received
                       ↘ rejected
```

### Vendors — `/vendors`
| Method | Route | Description |
|---|---|---|
| POST | `/vendors` | Create a vendor |
| GET | `/vendors` | List vendors |
| GET | `/vendors/:id` | Get a vendor by ID |
| PATCH | `/vendors/:id` | Update a vendor |
| DELETE | `/vendors/:id` | Delete a vendor |

### AI Agents — `/agents` & `/approvals`
| Method | Route | Description |
|---|---|---|
| POST | `/agents/test-queue` | Trigger an AI agent run (forecasting / reorder / negotiation / anomaly) |
| GET | `/approvals` | List pending AI-generated approval requests |
| POST | `/approvals/:id/approve` | Approve an AI recommendation |
| POST | `/approvals/:id/reject` | Reject an AI recommendation |

---

## 🗄️ Core Data Model (simplified)

```
User ─────────────── owns ──────────────► Warehouse(s)
  │                                            │
  └─ assigned to ──────────────────────────────┘
                                               │
                              ┌────────────────┤
                              ▼                ▼
                         StockLevel      PurchaseOrder
                              │                │
                              ▼                ▼
                             SKU           LineItem → SKU
                              │
                              ▼
                         Category / Vendor
```

---

## ⚙️ Infrastructure

| Concern | Technology |
|---|---|
| Framework | NestJS |
| Database | PostgreSQL via TypeORM |
| Auth | Passport JWT + bcrypt |
| Job Queue | BullMQ + Redis |
| API Docs | Swagger (`/api`) |
| Validation | `class-validator` + `class-transformer` |
| Soft Deletes | TypeORM `softRemove` / `deletedAt` |

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env

# Run the development server
npm run dev

# View Swagger API docs
open http://localhost:3000/api
```

> **Environment variables needed:** `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `REDIS_HOST`, `REDIS_PORT`
