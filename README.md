# T&M Journal - FSM Mobile Integration App

A SAP Fiori mobile application for SAP Field Service Management (FSM), designed to run in FSM Mobile (Web Container), FSM Web UI (Shell Extension), or standalone browser. Features T&M (Time & Materials) reporting with automatic organization level resolution, context-aware activity highlighting, and configurable entry types.

> **Version:** 0.0.1  
> **Platform:** SAP BTP Cloud Foundry  
> **Last Updated:** February 2026

---

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — fresh deployment to a new BTP subaccount
- [docs/RENAME.md](docs/RENAME.md) — renaming an existing app to comply with naming conventions
- [docs/NAMING.md](docs/NAMING.md) — naming convention reference for all tns FSM extensions
- [docs/SECURITY.md](docs/SECURITY.md) — security architecture and threat model

---

## 📋 Table of Contents

- [Screenshots](#-screenshots)
- [Overview](#-overview)
- [Architecture](#-architecture)
- [Features](#-features)
- [Prerequisites](#-prerequisites)
- [Setup & Deployment](#-setup--deployment)
- [FSM Mobile Integration](#-fsm-mobile-integration)
- [FSM Web UI Integration](#-fsm-web-ui-integration)
- [Standalone / Development Mode](#-standalone--development-mode)
- [Expected Result](#-expected-result)
- [How It Works](#-how-it-works)
- [API Reference](#-api-reference)
- [Troubleshooting](#-troubleshooting)
- [Application Details](#-application-details)
- [Current Status](#-current-status)
- [Security Notes](#-security-notes)

---

## 📸 Screenshots

### 1. Main View - Session Context & Service Order

![Main View](docs/screenshots/01-main-view.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Session Context Button (ℹ️)** | Opens Session Context dialog showing User, Language, Account, Company, Organization, Object Type | `View1_controller.js` → `onShowContextInfo()`, `ContextInfoDialog_fragment.xml` |
| **Type Config Button (⚙️)** | Opens Type Configuration dialog | `View1_controller.js` → `onOpenTypeConfig()`, `TypeConfigDialog_fragment.xml` |
| **Service Order Panel** | Expandable panel with Service Order details | `ServiceCall_fragment.xml` |

---

### 2. Product Groups & Activities

![Product Groups](docs/screenshots/02-product-groups.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Product Group Headers** | Activities grouped by Service Product description | `ProductGroups_fragment.xml`, `ProductGroupService.js` |
| **Activity Panel** | Expandable panel with activity details (3-column CSS Grid layout) | `ProductGroups_fragment.xml` |
| **Context Highlighting** | Light blue border on entry activity | `style.css` → `.activityEntryPanel[data-highlighted="true"]` |
| **T&M Summary** | Reported hours (AZ/FZ/WZ) and Material qty vs planned | `ProductGroups_fragment.xml`, `TMDataService.js` |
| **T&M Tables** | Inline tables for Time/Material, Expense, Mileage (with sort, edit, delete) | `ProductGroups_fragment.xml` |
| **Add Entry Button** | Opens T&M Creation dialog | `TMDialogService.js` → `openTMCreationDialog()` |
| **Delete Selected Button** | Batch deletes selected PENDING or REVIEW entries | `TMTableMixin.js` → `onDeleteSelectedTM()` |

---

### 3. T&M Creation Dialog - Time & Material

![T&M Creation - Time & Material](docs/screenshots/03-tm-creation-time-material.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Activity Header** | Shows activity details (dates, duration, quantity) | `TMCreateDialog_fragment.xml` |
| **Material Section** | Technician, Item, Quantity, Date, Remarks | `TMCreateDialog_fragment.xml`, `TMMaterialMixin.js` |
| **Time Sections** | Arbeitszeit (AZ), Fahrzeit (FZ), Wartezeit (WZ) with Task dropdown | `TMCreateDialog_fragment.xml`, `TMTimeEntryMixin.js` |
| **Multi-Technician** | MultiInput with token-based selection from activity technicians | `TechnicianService.js`, `TechnicianMixin.js` |
| **Task Dropdown** | Filtered by category (AZ, FZ, WZ) | `TimeTaskService.js` |
| **Repeat Date Range** | Checkbox + end date to create entries across multiple days | `TMTimeEntryMixin.js` |
| **Save All** | Batch creates all Material + Time entries | `TMSaveMixin.js` |

**Visibility:** Shows when Service Product ID is NOT in Expense or Mileage type lists.

**Type Check:** `TypeConfigService.isTimeMaterialType(serviceProductId)`

---

### 4. T&M Creation Dialog - Expense

![T&M Creation - Expense](docs/screenshots/04-tm-creation-expense.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Expense Table** | Multi-row table for batch expense creation | `TMCreateDialog_fragment.xml` |
| **Expense Type** | Pre-populated from activity Service Product | `TMExpenseMileageMixin.js` |
| **External Amount** | Amount charged to customer (EUR) | `TMExpenseMileageMixin.js` |
| **Internal Amount** | Internal cost amount (EUR) | `TMExpenseMileageMixin.js` |
| **Technician Select** | Dropdown from activity technicians | `TMExpenseMileageMixin.js` |
| **Date** | DatePicker, defaults to Activity Planned Start | `TMCreateDialog_fragment.xml` |

**Visibility:** Shows when Service Product ID is in Expense type list.

**Default IDs:** Z40000001, Z40000007, Z50000000

**Type Check:** `TypeConfigService.isExpenseType(serviceProductId)`

---

### 5. T&M Creation Dialog - Mileage

![T&M Creation - Mileage](docs/screenshots/05-tm-creation-mileage.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Mileage Table** | Multi-row table for batch mileage creation | `TMCreateDialog_fragment.xml` |
| **Mileage Type** | Pre-populated from activity Service Product (Item) | `TMExpenseMileageMixin.js` |
| **Distance** | Kilometers, pre-populated from activity quantity | `TMExpenseMileageMixin.js` |
| **Travel Duration** | Minutes (default 30), used to calculate travelEnd from travelStart | `TMExpenseMileageMixin.js` |
| **Technician Select** | Dropdown from activity technicians | `TMExpenseMileageMixin.js` |
| **Date** | DatePicker, defaults to Activity Planned Start | `TMCreateDialog_fragment.xml` |

**Visibility:** Shows when Service Product ID is in Mileage type list.

**Default IDs:** Z40000038, Z40000008

**Type Check:** `TypeConfigService.isMileageType(serviceProductId)`

---

### 6. T&M Tables (Inline)

![T&M Tables](docs/screenshots/06-tm-tables.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Time/Material Table** | Combined table with type filter (All / Time Effort / Material) | `ProductGroups_fragment.xml` |
| **Expense Table** | Expense entries with amounts and type | `ProductGroups_fragment.xml` |
| **Mileage Table** | Mileage entries with distance and duration | `ProductGroups_fragment.xml` |
| **Approval Status** | Color-coded status (PENDING, APPROVED, DECLINED, REVIEW, REJECTED) | `ApprovalService.js` |
| **Decision Column** | Approver's decision remarks | `ApprovalService.js` → `getRemarksById()` |
| **Inline Edit** | Edit Selected → modify values → Save All (batch update) | `TMTableMixin.js` → `onSaveAllTM()` |
| **Batch Delete** | Select rows via checkbox → Delete Selected. Works for entries in PENDING or REVIEW status. | `TMTableMixin.js` → `onDeleteSelectedTM()` |
| **Sort** | Configurable sort dialog per table type | `TMSortDialog_fragment.xml` |

---

### 7. Type Configuration Dialog

![Type Configuration](docs/screenshots/07-type-config.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Info Message** | Explains how type configuration works | `TypeConfigDialog_fragment.xml` |
| **Expense Types List** | Service Product IDs treated as Expense | `TypeConfigDialog_fragment.xml` |
| **Mileage Types List** | Service Product IDs treated as Mileage | `TypeConfigDialog_fragment.xml` |
| **Add Input** | Input field to add new type ID | `View1_controller.js` → `onAddExpenseType()`, `onAddMileageType()` |
| **Remove Button** | Delete icon to remove type ID | `View1_controller.js` → `onRemoveExpenseType()`, `onRemoveMileageType()` |
| **Reset Button** | Resets to default configuration | `View1_controller.js` → `onResetTypeConfig()` |

**Backend:** `TypeConfigStore.js` (file storage), `/api/v1/*-type-config` endpoints (defined in `configRoutes.js`)

**Frontend:** `TypeConfigService.js` (API client, type checking)

---

### 8. Mobile Responsive View

![Mobile View](docs/screenshots/08-mobile-responsive.png)

| Element | Description | Key Files |
|---------|-------------|-----------|
| **Responsive Layout** | CSS Grid `auto-fit, minmax(280px, 1fr)` adapts columns to screen width | `style.css` |
| **Collapsed Panels** | Panels collapse to save space | All fragment XML files |
| **Touch-friendly** | 44px minimum tap targets on touch devices | `style.css` |

**Breakpoints:**
- Desktop: hover effects, lift animation (>1024px)
- Tablet: 2 columns, wrapped toolbars (601px–1024px)
- Mobile: 1 column, full-width dialogs (<600px)
- Extra small: hidden ID labels (<400px)

---

### Screenshot Checklist

| # | Screenshot | Status |
|---|------------|--------|
| 1 | Main View (Session Context + Service Order) | ⬜ TODO |
| 2 | Product Groups & Activities | ⬜ TODO |
| 3 | T&M Creation - Time & Material | ⬜ TODO |
| 4 | T&M Creation - Expense | ⬜ TODO |
| 5 | T&M Creation - Mileage | ⬜ TODO |
| 6 | T&M Tables (Inline) | ⬜ TODO |
| 7 | Type Configuration Dialog | ⬜ TODO |
| 8 | Mobile Responsive View | ⬜ TODO |

**Screenshot folder:** `docs/screenshots/`

---

## 🎯 Overview

This application provides a mobile-optimized interface for viewing and managing FSM activities with T&M (Time & Materials) reporting. It integrates with FSM Mobile (Web Container) and FSM Web UI (Shell Extension).

**Key Features:**
- ✅ Progressive disclosure UI (Service Order → Product Groups → Activities → T&M Tables)
- ✅ Organization level auto-resolution from logged-in user
- ✅ Activities grouped by Product Description
- ✅ Auto-loads activity data from FSM Mobile web container context or FSM Web UI Shell context
- ✅ Context activity highlighting (light blue SAP Fiori styling)
- ✅ T&M entry creation and management:
  - **Time & Material** — Material entries + Time entries (AZ/FZ/WZ) with multi-technician and repeat dates
  - **Expense** — Batch expense creation with type, amounts, and technician
  - **Mileage** — Batch mileage creation with distance, duration, and technician
- ✅ Inline T&M tables with edit, delete (PENDING/REVIEW), sort, and approval status tracking
- ✅ **Configurable Entry Types** — Expense and Mileage Service Product IDs can be configured via UI
- ✅ Session context display (User, Account, Company, Organization)
- ✅ Mobile-first responsive design (desktop, tablet, mobile)
- ✅ **Two-path inbound authentication** — FSM Authentication Key (Mobile) and FSM JWT signature verification (Web UI), both backed by server-issued session tokens
- ✅ **Outbound OAuth 2.0** to FSM APIs via SAP BTP Destination Service
- ✅ Direct FSM Data API and Query API integration

**Default Type Configuration:**
| Type | Default Service Product IDs |
|------|----------------------------|
| Expense | Z40000001, Z40000007, Z50000000 |
| Mileage | Z40000038, Z40000008 |
| Time & Material | All other IDs |

*Note: Type configuration can be modified at runtime via the "Type Config" button.*

**Technology Stack:**
- **Frontend:** SAP UI5 (Fiori)
- **Backend:** Node.js + Express
- **Deployment:** SAP Business Technology Platform (Cloud Foundry)
- **Inbound Authentication:** FSM Authentication Key (Mobile flow) + FSM JWT validation against JWKS (Web UI flow), with HttpOnly cookie or Authorization Bearer token session delivery. See [docs/SECURITY.md](docs/SECURITY.md).
- **Outbound Authentication:** OAuth 2.0 via BTP Destination Service

> **Note on standalone access:** Direct browser access via URL parameters (e.g., `?activityId=...`) was previously supported as a fallback mode. After the strict authentication implementation, standalone mode no longer authenticates and is treated as a development-only mode. Production access is through FSM Mobile or FSM Web UI.

---

## 🏗️ Architecture

The application supports **multiple deployment contexts**:

| Context | Description | How It Works |
|---------|-------------|--------------|
| **FSM Mobile** | Web Container in FSM Mobile app | POST context to `/web-container-access-point` with FSM Authentication Key |
| **FSM Web UI** | Extension in FSM Web application | fsm-shell SDK communicates via iframe; access_token JWT verified at `/api/v1/shell-session-init` |
| **Standalone** | Direct browser access (development-only) | URL parameters (`?activityId=...` or `?serviceCallId=...`); does not authenticate, all `/api/v1/*` calls return 401 |

**Context Detection Priority:** URL parameters → FSM Shell (if iframe) → Mobile Web Container (if not iframe) → Standalone mode

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ENTRY POINTS                                     │
├──────────────────┬───────────────────────┬───────────────────────────────┤
│   FSM Mobile     │     FSM Web UI        │     Standalone (dev only)     │
│   (Web Container)│     (Shell Extension) │     (URL Parameters)          │
│        │         │           │           │            │                  │
│  POST context    │   fsm-shell SDK       │   ?activityId=XXX             │
│  + Auth Key      │   (iframe postMessage)│   ?serviceCallId=XXX          │
│        │         │   + access_token JWT  │   (no auth — returns 401      │
│        │         │           │           │    on all /api/v1/* calls)    │
└────────┼─────────┴───────────┼───────────┴────────────┼──────────────────┘
         │                     │                        │
         ▼                     ▼                        │
┌──────────────────────────────────────────────────────┐│
│           INBOUND AUTHENTICATION LAYER               ││
│                                                      ││
│  Auth Key validation        JWT signature            ││
│  (constant-time)            verification             ││
│  ↓                          (against FSM JWKS)       ││
│  Issues HttpOnly cookie     ↓                        ││
│                             Returns Bearer token     ││
│                                                      ││
│  Both produce a session token in the same store;     ││
│  requireSession middleware accepts either source     ││
│  on every /api/v1/* request.                         ││
└──────────────────┬───────────────────┬───────────────┘│
                   │                   │                │
                   ▼                   ▼                │ (no token)
┌─────────────────────────────────────────────────────────────────────────┐
│                      SAP BTP (Cloud Foundry)                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                      UI5 App (Frontend)                           │  │
│  │                                                                   │  │
│  │  ContextService.js - Detects environment & unifies context        │  │
│  │   - In Web UI: POSTs JWT to /api/v1/shell-session-init,           │  │
│  │     stores returned session token on window.__fsmSessionToken     │  │
│  │   - Component.js fetch wrapper attaches Bearer header to          │  │
│  │     /api/v1/* calls when token is present                         │  │
│  │       ↓                                                           │  │
│  │  1. T&M Journal Page (Service Order header)                       │  │
│  │  2. Session Context Dialog (User, Org, Account, Company)          │  │
│  │  3. Organization Level (auto-resolved from user)                  │  │
│  │  4. Product Groups → Activities (grouped view)                    │  │
│  │  5. T&M Tables (inline view/edit/delete/sort)                     │  │
│  │  6. T&M Creation Dialog (create new entries)                      │  │
│  │  7. Type Config Dialog (configure entry types)                    │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
│                              │                                          │
│  ┌───────────────────────────▼───────────────────────────────────────┐  │
│  │                   Express Server (Backend)                        │  │
│  │                                                                   │  │
│  │  - WebContainer entry (Mobile): /web-container-access-point       │  │
│  │  - Shell session init (Web UI): /api/v1/shell-session-init        │  │
│  │  - Context store + session store (in-memory, 30 min TTL)          │  │
│  │  - requireSession middleware (cookie OR Bearer Authorization)     │  │
│  │  - FSM API Proxy under /api/v1/* (FSMService.js)                  │  │
│  │  - Type Config API: /api/v1/*-type-config (TypeConfigStore.js)    │  │
│  │  - JWT validation against FSM JWKS (FSMJwtValidator.js)           │  │
│  └───────────────────────────┬───────────────────────────────────────┘  │
└──────────────────────────────┼──────────────────────────────────────────┘
                               │ OAuth Token
                               ▼
                      ┌─────────────────┐
                      │ BTP Destination │  (FSM_S4E destination)
                      │    Service      │
                      └────────┬────────┘
                               │ Authenticated Request
                               ▼
                      ┌─────────────────┐
                      │     FSM API     │  (SAP Field Service Management)
                      │                 │
                      │  - User & Organization Data
                      │  - Service Calls (Composite Tree)
                      │  - Activities & T&M Reports
                      │  - Lookup Data (Tasks, Items, Expense Types, etc.)
                      └─────────────────┘
```

For the inbound authentication layer in detail (cookie vs Bearer rationale, JWT
validator safety properties, threat model, and rotation procedures), see
[docs/SECURITY.md](docs/SECURITY.md).

---

## ✨ Features

### UI Components

| Component | Description |
|-----------|-------------|
| **Session Context Dialog** | Opened from footer toolbar (ℹ️ button). Shows User, Language, Account, Company, Organization, Object Type/ID. |
| **Service Order Panel** | Expandable panel showing Service Order details (ID, External ID, Subject, Business Partner, Responsible, Dates) |
| **Organization Level** | Auto-resolved from logged-in user (no manual selection required) |
| **Product Groups** | Activities grouped by Product Description with activity count |
| **Activity Panels** | Expandable panels with context highlighting (blue border for entry activity), Address, Responsible, Org Level, Service Product, T&M Summary |
| **T&M Summary** | For T&M activities: Material qty (reported/planned), Arbeitszeit/Fahrzeit/Wartezeit hours reported |
| **T&M Tables** | Inline tables per activity: Time/Material (combined with type filter), Expense, Mileage — with edit, delete, sort, approval status, row highlighting |
| **T&M Creation Dialog** | Create new T&M entries based on Activity Service Product type |
| **Type Config Dialog** | Configure which Service Product IDs are treated as Expense, Mileage, or Time & Material |

### Lookup Services

The app resolves FSM IDs to human-readable names:

| Service | Resolves | Example |
|---------|----------|---------|
| **PersonService** | Person ID/ExternalId → Name | `A1B2C3D4...` → `Max Mustermann (ZZ00094912)` |
| **TechnicianService** | Technician suggestions | Large dataset handling with Input suggestions |
| **TimeTaskService** | Task ID → Name | `3010642C...` → `AZ - Arbeitszeit` |
| **ItemService** | Item ID/ExternalId → Name | `MATNR001` → `MATNR001 - Schrauben M8` |
| **ExpenseTypeService** | Expense Type ID → Name | `6DC882E6...` → `Z40000039 - Aktivierungs-/Einsatzpauschale` |
| **UdfMetaService** | UDF Meta ID → ExternalId | `EB1C5C15...` → `Z_Mileage_MatID` |
| **OrganizationService** | Org Level ID → Name + User Resolution | `2B6F7485...` → `2130_MPA - Service Unit _Team1` |
| **BusinessPartnerService** | BP ExternalId → Name | `55003748` → `Company Name (55003748)` |
| **ApprovalService** | Object ID → Decision Status + Remarks | `F1E2D3C4...` → `APPROVED` |
| **TypeConfigService** | Service Product ID → Entry Type | `Z40000001` → `Expense` |

### T&M Entry Types (Creation)

Entry type shown depends on Activity Service Product. **Types are configurable via Type Config Dialog.**

| Entry Type | Default Service Product IDs | Key Fields |
|------------|----------------------------|------------|
| **Expense** | Z40000001, Z40000007, Z50000000 | Expense Type, Technician, External Amount, Internal Amount, Date, Remarks |
| **Mileage** | Z40000038, Z40000008 | Mileage Type, Technician, Distance (km), Travel Duration (min), Date, Remarks |
| **Time & Material** | All other IDs | Material section (Item, Technician, Quantity, Date, Remarks) + Time sections (AZ/FZ/WZ with Task, Multi-Technician, Duration, Date, Repeat Date Range, Remarks) |

*Note: Default Service Product IDs can be modified at runtime via the "Type Config" button (⚙️) in the footer toolbar.*

### T&M Table Columns (Viewing)

| Table | Columns |
|-------|---------|
| **Time/Material** | Select, Type Icon, Description, Technician, Time (hrs), Qty, Date, Remarks, Status, Decision |
| **Expense** | Select, Expense Type, Technician, Ext. Amount, Int. Amount, Date, Remarks, Status, Decision |
| **Mileage** | Select, Mileage Type, Technician, Distance (km), Duration (min), Date, Remarks, Status, Decision |

All tables support: batch selection (checkbox), inline edit mode, sort dialog, row highlighting by approval status (Success/Error/Warning).

---

## ✅ Prerequisites

### Required Tools:
| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | v18.0.0+ | Backend runtime |
| **npm** | v8.0.0+ | Package management |
| **Cloud Foundry CLI** | Latest | `cf` command for deployment |
| **UI5 CLI** | v4.0.16+ | Build tooling (dev dependency) |

### SAP BTP Account:
- Cloud Foundry space with available quota
- Memory: 512MB (configurable in `manifest.yaml`)
- Disk: 512MB

### SAP BTP Services:

| Service | Instance Name | Purpose |
|---------|---------------|---------|
| **Destination Service** | `com.tns.fsm.timematerialext.app-destination` | FSM API connectivity (outbound OAuth) |

### Required Environment Variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `FSM_WEBCONTAINER_AUTH_KEY` | Yes — server refuses to start without it | Shared secret matching the FSM Web Container Authentication Key configured in FSM Admin. Used to validate inbound POSTs from FSM Mobile. Set via `cf set-env com.tns.fsm.timematerialext.app FSM_WEBCONTAINER_AUTH_KEY <value>` followed by `cf restage com.tns.fsm.timematerialext.app`. Recommended: 32+ chars from `openssl rand -base64 32`. |
| `FSM_JWKS_URL` | No (defaults to DE region) | URL of FSM's public JWKS endpoint, used to verify JWTs from the FSM Web UI Shell flow. Default: `https://de.fsm.cloud.sap/api/oauth2/v2/.well-known/jwks.json`. Override for non-DE regions. |

For full details on the inbound authentication model, see [docs/SECURITY.md](docs/SECURITY.md).

### Destination Configuration (FSM_S4E):

The destination `FSM_S4E` must be configured in BTP Cockpit with:

| Property | Description |
|----------|-------------|
| **URL** | FSM API base URL (e.g., `https://eu.coresystems.net`) |
| **Authentication** | OAuth2ClientCredentials |
| **Token Service URL** | FSM OAuth token endpoint (e.g., `https://de.fsm.cloud.sap/api/oauth2/v2/token`) |
| **Client ID** | FSM OAuth client ID |
| **Client Secret** | FSM OAuth client secret |

### FSM Configuration:

In addition to API access (above), the FSM tenant must be configured to enable inbound authentication from FSM Mobile:

| Setting | Where | Value |
|---------|-------|-------|
| **Web Container Authentication Key** | FSM Admin → Companies → [Company] → Web Containers → [Web Container Name] → Authentication Key | Must byte-exactly match the `FSM_WEBCONTAINER_AUTH_KEY` env var |

### FSM Access:
- SAP Field Service Management instance
- API access credentials (OAuth client) for outbound calls
- Web Container Authentication Key (above) for inbound Mobile auth
- User with appropriate permissions for:
  - Activities & Service Calls (read/write)
  - T&M entries: Time Effort, Material, Expense, Mileage (read/write/create)
  - Organization levels (read)
  - Lookup data (TimeTasks, Items, ExpenseTypes, Persons)

### Optional (for FSM Web UI Integration):
- FSM Shell SDK access (loaded dynamically from `https://unpkg.com/fsm-shell@1.20.0`)
- Extension configuration in FSM Admin
- Inbound JWT validation works automatically once `FSM_JWKS_URL` resolves to FSM's JWKS endpoint (the default points at the DE region)

---

## 🚀 Setup & Deployment

### 1. Clone & Install
```bash
git clone <repository-url>
cd com.tns.fsm.timematerialext.app
npm install
```

### 2. Configure Application (Optional)

#### 2.1 Type Configuration Defaults
Edit `typeconfig.json` to set default Service Product IDs:
```json
{
  "expenseTypes": ["Z40000001", "Z40000007", "Z50000000"],
  "mileageTypes": ["Z40000038", "Z40000008"],
  "lastModified": null,
  "modifiedBy": null
}
```
*Note: These can also be changed at runtime via the Type Config dialog.*

> **Account and company:** These are not configured here. They come from the BTP destination's additional properties (`account` and `company`) — see Step 3. The application throws a clear startup error if either value is missing from the destination, so configuration mistakes surface immediately instead of silently using wrong credentials.

### 3. Configure BTP Destination

Create a destination named **FSM_S4E** in SAP BTP Cockpit:
```
Name: FSM_S4E
Type: HTTP
URL: https://de.fsm.cloud.sap
Authentication: OAuth2ClientCredentials
Token Service URL: https://de.fsm.cloud.sap/api/oauth2/v2/token
Client ID: <your-fsm-client-id>
Client Secret: <your-fsm-client-secret>

Additional Properties:
  account: <your-account>
  company: <your-company>
  URL.headers.X-Account-ID: <your-account-id>
  URL.headers.X-Company-ID: <your-company-id>
  URL.headers.X-Client-ID: FSM_Extension
  URL.headers.X-Client-Version: 0.0.1
```

### 4. Create Destination Service Instance
```bash
cf create-service destination lite com.tns.fsm.timematerialext.app-destination
```

### 5. Configure FSM Web Container Authentication Key

Inbound POSTs from FSM Mobile must carry an Authentication Key matching the value the app expects. Configure it on both sides:

**FSM side** — In FSM Admin → Companies → [Your Company] → Web Containers → [Your Web Container]:
- Set the **Authentication Key** field to a strong random value
- Recommended: 32+ characters generated by `openssl rand -base64 32`
- Save the value somewhere secure — you'll need it again in Step 6

The same value will be configured as an environment variable in the next step. The two values must match byte-exactly.

### 6. Deploy and Set Environment Variables

The application requires `FSM_WEBCONTAINER_AUTH_KEY` to start; it refuses to start without it. The recommended sequence keeps the secret out of any committed file:

```bash
# Push without starting
cf push com.tns.fsm.timematerialext.app --no-start

# Set the auth key (use the value from Step 5)
cf set-env com.tns.fsm.timematerialext.app FSM_WEBCONTAINER_AUTH_KEY '<the-value-from-step-5>'

# Optional: override the default JWKS endpoint (used for FSM Web UI Shell auth).
# The default points at the DE region. Set this if your FSM tenant is in another region.
cf set-env com.tns.fsm.timematerialext.app FSM_JWKS_URL 'https://<region>.fsm.cloud.sap/api/oauth2/v2/.well-known/jwks.json'

# Start the app
cf start com.tns.fsm.timematerialext.app
```

After startup, verify the auth key was loaded:
```bash
cf logs com.tns.fsm.timematerialext.app --recent | grep "FSM_WEBCONTAINER_AUTH_KEY is set"
```
You should see `FSM_WEBCONTAINER_AUTH_KEY is set (N chars)` confirming the env var was picked up.

### 7. Get Application URL
```bash
cf app com.tns.fsm.timematerialext.app
```

Copy the URL (e.g., `https://com.tns.fsm.timematerialext.app-fsm-dev-op.cfapps.eu10-004.hana.ondemand.com`).

This URL is what you configure in FSM Admin as the Web Container URL so that FSM Mobile knows where to POST. Make sure the Web Container in FSM Admin points at this URL AND has the matching Authentication Key from Step 5.

### Rotation: Changing the Authentication Key Later

To rotate the Authentication Key after initial setup:

1. Update the value in FSM Admin → Web Containers → Authentication Key
2. `cf set-env com.tns.fsm.timematerialext.app FSM_WEBCONTAINER_AUTH_KEY '<new-value>'`
3. `cf restage com.tns.fsm.timematerialext.app`

Active Mobile WebContainer launches will return 401 during the brief window between the FSM-side update and the CF restage; users retap to relaunch with the new key.

---

## 📱 FSM Mobile Integration

### Configure FSM Web Container

Navigate to: **FSM Admin → Company → Web Containers**

#### 1. Create Web Container
| Field | Value |
|-------|-------|
| **Name** | `T&M Journal` |
| **External ID** | `Z_TMJournal` |
| **URL** | `https://com.tns.fsm.timematerialext.app-xxx.cfapps.eu10.hana.ondemand.com` |
| **Object Types** | `Activity` |
| **Authentication Key** | A strong random value (32+ chars). The same value MUST be set as the `FSM_WEBCONTAINER_AUTH_KEY` env var on the deployed app. See [docs/SECURITY.md](docs/SECURITY.md) for rotation procedure. |
| **Active** | ✓ Checked |

> **Important:** The Authentication Key is what protects `/web-container-access-point` from unauthenticated POSTs. If the values on the FSM side and the app side don't match byte-exactly, Mobile launches will return HTTP 401 and the app will not load.

#### 2. Web Container Context

When opened from FSM Mobile, the web container POSTs context data to `/web-container-access-point`:

| Field | Description |
|-------|-------------|
| `authenticationKey` | Shared secret from the Authentication Key field above. Validated server-side via constant-time comparison. Mismatches return HTTP 401. |
| `cloudId` | Activity/ServiceCall ID (used to load and highlight the entry) |
| `objectType` | Object type (`ACTIVITY` or `SERVICECALL`) |
| `userName` | Current user's name (for organization level auto-resolution) |
| `cloudAccount` | FSM account name |
| `companyName` | FSM company name |
| `language` | User's language preference |

On successful authentication, the server issues an HttpOnly session cookie (`fsm_session`) that authenticates all subsequent `/api/v1/*` calls from the WebView.

#### 3. Add to Mobile Screen Configuration
Navigate to: **FSM Admin → Companies → [Your Company] → Screen Configurations**

1. Select `Activity Mobile` (or your custom activity screen)
2. Click the pencil icon to edit
3. Add Web Container button to the activity screen
4. Configure button:
   - **Label:** `T&M Journal`
   - **Web Container:** Select `Z_TMJournal`
5. Click **Save**

---

## 🖥️ FSM Web UI Integration

The app can also run as an extension in FSM Web UI using the fsm-shell SDK.

### Configure FSM Extension

Navigate to: **FSM Admin → Company → Extensions**

#### 1. Create Extension
| Field | Value |
|-------|-------|
| **Name** | `T&M Journal` |
| **External ID** | `Z_TMJournal_Web` |
| **URL** | `https://com.tns.fsm.timematerialext.app-xxx.cfapps.eu10.hana.ondemand.com` |
| **Context** | `Activity` or `ServiceCall` |
| **Active** | ✓ Checked |

> **Note on authentication:** Unlike the FSM Mobile setup, no Authentication Key is needed here. The Web UI flow authenticates via the FSM-issued JWT (`access_token`) that the Shell SDK provides as part of the context handshake. The backend verifies the JWT signature against FSM's public JWKS endpoint — no shared secret involved on either side. See `FSM_JWKS_URL` in the Prerequisites section if your FSM tenant is in a non-DE region.

#### 2. Shell Context
When running in FSM Web UI, the app uses the fsm-shell SDK (loaded dynamically from `https://unpkg.com/fsm-shell@1.20.0`) to receive context via iframe postMessage. Context arrives in two stages:

**Stage 1 — REQUIRE_CONTEXT response (user/session data + auth token):**

| Shell Field | Mapped To | Description |
|-------------|-----------|-------------|
| `userId` | `shellContext.userId` | Current user ID |
| `user` | `shellContext.userName` | Current user name |
| `companyId` | `shellContext.companyId` | Company ID |
| `company` | `shellContext.companyName` | Company name |
| `accountId` | `shellContext.accountId` | Account ID |
| `account` | `shellContext.accountName` | Account name |
| `cloudHost` | `shellContext.cloudHost` | FSM cloud host URL |
| `selectedLocale` | `shellContext.locale` | User's locale |
| `auth.access_token` | `shellContext.authToken` | RS256-signed JWT issued by FSM. Used for backend authentication (see Stage 3). |

**Stage 2 — ViewState events (object context):**

| ViewState Key | Description |
|---------------|-------------|
| `activity` / `ACTIVITY` | Activity object with `id` — sets objectType to ACTIVITY |
| `serviceCall` / `SERVICECALL` | ServiceCall object with `id` — sets objectType to SERVICECALL (only if no activity) |

The app listens for both lowercase and uppercase ViewState keys. If a ViewState with an object ID arrives in the initial context, it resolves immediately. Otherwise it waits up to 3 seconds for ViewState events before resolving with basic session context only.

**Stage 3 — Backend session establishment:**

After Stages 1 and 2 resolve, the frontend POSTs the JWT from Stage 1 (`shellContext.authToken`) to `/api/v1/shell-session-init`. The backend:

1. Verifies the JWT signature against FSM's public JWKS endpoint (`FSM_JWKS_URL`)
2. Validates the token's expiration and algorithm (RS256 only)
3. Extracts the user identity from the validated payload
4. Issues a session token, returned in the JSON response body

The frontend stores the session token in memory (`window.__fsmSessionToken`) and the global fetch wrapper attaches it as `Authorization: Bearer <token>` on every subsequent `/api/v1/*` call. This is necessary because the FSM Web UI iframe runs in a third-party context where browsers refuse to store cookies — see [docs/SECURITY.md](docs/SECURITY.md) for the full rationale.

---

## 🧪 Standalone / Development Mode

For local UI testing without an FSM session, URL parameters can drive the initial context selection:

```
# Open with specific Activity
https://com.tns.fsm.timematerialext.app-xxx.cfapps.eu10.hana.ondemand.com?activityId=ABC123

# Open with specific Service Call
https://com.tns.fsm.timematerialext.app-xxx.cfapps.eu10.hana.ondemand.com?serviceCallId=XYZ789
```

> **Important — current limitation:** With strict authentication enabled on `/api/v1/*`, standalone mode loads the page but cannot fetch any data. All API calls return HTTP 401 because no auth path was established (the Mobile flow needs the Authentication Key POST; the Web UI flow needs the Shell SDK's JWT). The page renders with empty caches and broken data.
> 
> Standalone mode is therefore now a **page-load-only** development convenience. It's useful for iterating on pure-frontend UI work (CSS, layout, view structure) but not for any workflow that depends on FSM data. For full end-to-end testing, launch from FSM Mobile or FSM Web UI.
> 
> If a development bypass for backend auth becomes needed, it should be implemented as a clearly-named environment variable (e.g., `DEV_BYPASS_AUTH=true`) that is **never** set on production environments.

### Local Development
```bash
npm start              # Start Express server (backend + frontend) on port 3000
npm run start:dev      # Start Fiori tools dev server (frontend only, no backend API)
```

> **Local startup requires `FSM_WEBCONTAINER_AUTH_KEY`.** The Express server (`npm start`) refuses to start if this environment variable is not set, the same as on Cloud Foundry. For local dev, export it in your shell first:
> 
> ```bash
> export FSM_WEBCONTAINER_AUTH_KEY='<any-32-char-value-for-local-use>'
> npm start
> ```
> 
> The `npm run start:dev` Fiori dev server doesn't start the backend, so it doesn't need the env var — but `/api/v1/*` calls won't work in that mode either.

*Note: `npm start` runs the full app (Express serves both API and UI). `npm run start:dev` runs only the UI5 Fiori dev server — backend API endpoints will not be available.*

---

## ✅ Expected Result

### On FSM Mobile:
1. Technician opens an Activity
2. Sees **"T&M Journal"** button
3. Taps the button → Web Container POSTs to `/web-container-access-point` with the Authentication Key, server validates and issues an `fsm_session` cookie, app loads
4. App displays **"T&M Journal for Service Order: {ID}"** as page title
5. **Session Context Dialog** (opened via ℹ️ button in footer toolbar) shows:
   - User, Language, Account, Company
   - Organization (auto-resolved from user)
   - Object Type & ID
6. Organization level auto-resolved (no manual selection)
7. Context activity highlighted with **light blue SAP Fiori border** and auto-expanded
8. Product Groups show activities grouped by Service Product
9. **Type Config** button (⚙️) available in footer toolbar for configuring entry types

### On FSM Web UI:
1. User opens an Activity or Service Call
2. Clicks **"T&M Journal"** extension button
3. App opens in iframe within FSM Web UI
4. Frontend captures the FSM-issued JWT from the Shell SDK and POSTs it to `/api/v1/shell-session-init`; backend verifies the JWT signature against FSM's JWKS and returns a session token, which the frontend attaches as `Authorization: Bearer` on subsequent calls
5. Same functionality as Mobile:
   - Session Context from fsm-shell SDK
   - Auto-resolved organization level
   - Context highlighting
   - Full T&M viewing and creation

### In Standalone Mode:
1. Open app URL with parameter: `?activityId=XXX` or `?serviceCallId=XXX`
2. Page loads and the URL parameter selects the intended object
3. **All `/api/v1/*` calls return HTTP 401** because no auth path was established (no Authentication Key POST, no Shell JWT). Caches stay empty, no FSM data populates.
4. Standalone mode is now a page-load-only development convenience for pure-frontend UI work. For full functionality, launch from FSM Mobile or FSM Web UI.

### T&M Creation Flow:
1. Click **"Add Entry"** button on an Activity panel
2. Dialog opens based on Activity's Service Product type:
   - **Expense table** → for configured Expense type IDs
   - **Mileage table** → for configured Mileage type IDs
   - **Time & Material form** → for all other IDs (Material table + AZ/FZ/WZ time tables)
3. Fill required fields and click **Save All**
4. Dialog closes, entries created in FSM, and inline T&M table refreshes automatically

### T&M Edit Flow:
1. Click **"Edit Selected"** on a T&M table to enable inline edit mode for selected rows
2. Modify values directly in the table
3. Click **Save All** — batch-updates all edited entries via `/api/v1/batch-update`

### T&M Delete Flow:
1. Select rows via checkbox (entries with **PENDING** or **REVIEW** status are selectable)
2. Click **"Delete Selected"** — confirmation dialog appears
3. Confirm — entries are batch-deleted via `/api/v1/batch-delete`, table refreshes, count updates

---

## 🔄 How It Works

### User Flow:
```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER ENTRY                                    │
├─────────────────┬───────────────────────┬───────────────────────────────┤
│   FSM Mobile    │     FSM Web UI        │     Standalone (dev only)     │
│   Tap button    │   Click extension     │   Open URL with params        │
│        │        │          │            │            │                  │
│  POST context   │   Shell SDK context   │   URL parameters              │
│  + Auth Key     │   + access_token JWT  │   (no auth — /api/v1/*        │
│        │        │          │            │   returns 401)                │
└────────┼────────┴──────────┼────────────┴────────────┼──────────────────┘
         │                   │                         │
         ▼                   ▼                         │ (no token issued)
┌─────────────────────────────────────────────┐        │
│   INBOUND AUTHENTICATION                    │        │
│   Mobile: Auth Key validated → cookie set   │        │
│   Web UI: JWT verified → Bearer token       │        │
│   issued via /api/v1/shell-session-init     │        │
└──────────────────────┬──────────────────────┘        │
                       │                               │
                       ▼                               │
              ┌──────────────────────────────┐         │
              │   ContextService.js          │◄────────┘
              │   (Detects source, unifies)  │
              └──────────────┬───────────────┘
                             ▼
              ┌──────────────────────────────┐
              │   App Initialization         │
              │   1. Resolve user org level  │
              │   2. Load Service Call       │
              │   3. Load Activities         │
              │   4. Load T&M data           │
              │   5. Highlight context entry │
              └──────────────────────────────┘
```

### Detailed Steps:

| Step | Action | Result |
|------|--------|--------|
| 1 | User opens Activity in FSM | Activity screen displayed |
| 2 | User taps/clicks "T&M Journal" | App opens (web container/iframe) |
| 3 | Inbound authentication | Mobile: Auth Key validated, `fsm_session` cookie issued. Web UI: JWT verified against FSM JWKS, session token returned and stored as Bearer header in `window.__fsmSessionToken`. |
| 4 | Context received | `ContextService` detects source and extracts Activity/ServiceCall ID |
| 5 | User org resolved | `userName` → User API → Person Query → Org Level assignment |
| 6 | Session Context displayed | Available via ℹ️ button in footer toolbar (User, Language, Account, Company, Organization) |
| 7 | Service Order loaded | Composite-tree API fetches Service Call + Activities |
| 8 | Product Groups rendered | Activities grouped by Service Product description |
| 9 | Context entry highlighted | Light blue border, auto-expanded |
| 10 | T&M data loaded | Time Effort, Material, Expense, Mileage entries loaded into inline tables |
| 11 | User views/creates T&M | Entry type determined by Service Product (configurable) |

### Context Sources:

#### FSM Mobile (Web Container)
```
POST /web-container-access-point
{
  "authenticationKey": "<shared-secret-matching-FSM_WEBCONTAINER_AUTH_KEY>",
  "cloudId": "9D92E0B18FDC4A27A213401FEEA89FDA",
  "objectType": "ACTIVITY",
  "userName": "Max Mustermann",
  "cloudAccount": "company_account",
  "companyName": "Company Name",
  "language": "de"
}
```

The server validates `authenticationKey` via constant-time comparison. On success,
an HttpOnly `fsm_session` cookie is set on the response and the user is redirected
to the loaded app.

#### FSM Web UI (Shell SDK)
```javascript
// Stage 1: REQUIRE_CONTEXT response (session data + auth token)
{
  "userId": "USER-UUID",
  "user": "Max Mustermann",
  "company": "Company Name",
  "companyId": "COMPANY-UUID",
  "account": "account_name",
  "accountId": "ACCOUNT-UUID",
  "cloudHost": "https://eu.coresystems.net",
  "selectedLocale": "de",
  "auth": { "access_token": "<RS256-signed FSM JWT>" }
}

// Stage 2: ViewState events (received via onViewState listeners)
// Activity: { "id": "ACTIVITY-UUID" }
// ServiceCall: { "id": "SERVICECALL-UUID" }

// Stage 3: Backend session establishment
// Frontend POSTs the JWT to /api/v1/shell-session-init.
// Backend verifies signature against FSM JWKS, returns:
//   { "success": true, "sessionToken": "<opaque-token>", ... }
// Frontend stores sessionToken on window.__fsmSessionToken; the global fetch
// wrapper attaches it as Authorization: Bearer on all subsequent /api/v1/* calls.
```

#### Standalone (URL Parameters)
```
?activityId=9D92E0B18FDC4A27A213401FEEA89FDA
# or
?serviceCallId=ABC123DEF456...
```

> Standalone mode loads the page but does not authenticate. All `/api/v1/*` calls
> return 401, so no FSM data populates. Used only for pure-frontend UI iteration.

### Authentication Flow:

The application has two distinct authentication concerns: **inbound** (FSM/Web UI
→ your app) and **outbound** (your app → FSM API). The flows below cover each.

#### Inbound (FSM Mobile or Web UI → app)

```
┌─────────────────────────────────────────────────────────────────┐
│  Mobile: POST /web-container-access-point with Auth Key         │
│      OR                                                         │
│  Web UI: POST /api/v1/shell-session-init with access_token JWT  │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Mobile: constant-time compare against FSM_WEBCONTAINER_AUTH_KEY│
│  Web UI: verify JWT signature against FSM JWKS endpoint         │
│           (FSMJwtValidator.js, RS256 only, 24h key cache)       │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Generate 32-byte session token, store in sessionStore (30 min) │
│  Mobile: set as HttpOnly fsm_session cookie                     │
│  Web UI: return in JSON body, frontend stores in memory         │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Subsequent /api/v1/* calls authenticated via:                  │
│  - cookie (Mobile flow)                                         │
│  - Authorization: Bearer header (Web UI flow)                   │
│  requireSession middleware accepts either                       │
└─────────────────────────────────────────────────────────────────┘
```

For the full inbound auth model (threat model, rotation procedures, why not XSUAA),
see [docs/SECURITY.md](docs/SECURITY.md).

#### Outbound (app → FSM API)

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Read VCAP_SERVICES → Get Destination Service credentials    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. Call BTP Destination Service → Get OAuth token              │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. Fetch FSM_S4E destination → Get FSM URL + OAuth config      │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. Get FSM OAuth token → Authenticate with FSM API             │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. Token cached (TokenCache.js) → Reused until 5 min before    │
│     expiry (default token lifetime: 60 min)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. Make FSM API calls → Activities, T&M, Lookups, etc.         │
└─────────────────────────────────────────────────────────────────┘
```

### Type Configuration Flow:
```
┌─────────────────────────────────────────────────────────────────┐
│  User clicks "Add Entry" on Activity                            │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Get Activity's Service Product External ID                     │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  TypeConfigService.isExpenseType(id) ?                          │
│  TypeConfigService.isMileageType(id) ?                          │
│  Otherwise → Time & Material                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Open creation dialog with appropriate tab:                     │
│  • Expense table (Expense Type, Technician, Amounts, Date)      │
│  • Mileage table (Mileage Type, Technician, Distance, Duration) │
│  • T&M form (Material table + AZ/FZ/WZ time entry tables)       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure
```
com.tns.fsm.timematerialext.app/
│
├── # ─────────── ROOT LEVEL ───────────
├── index.js                             # Express server, inbound auth (Auth Key + JWT), session store, /api/v1 routes (~150 lines)
├── routes/
│   ├── activityRoutes.js                # Activity CRUD & reported items (~155 lines)
│   ├── configRoutes.js                  # Type configuration endpoints (~240 lines)
│   ├── entryRoutes.js                   # T&M entry batch & individual CRUD (~430 lines)
│   └── lookupRoutes.js                  # Person, org, lookup, approval, user (~275 lines)
├── package.json                         # Node.js dependencies (express, cookie-parser, jsonwebtoken, jwks-rsa)
├── package-lock.json                    # Dependency lock file
├── manifest.yaml                        # Cloud Foundry deployment
├── mta.yaml                             # Multi-Target Application descriptor
├── xs-app.json                          # App Router configuration
├── xs-security.json                     # Security configuration
├── ui5.yaml                             # UI5 tooling configuration
├── ui5-local.yaml                       # UI5 local development config
├── ui5-deploy.yaml                      # UI5 deployment config
├── config/
│   ├── TypeConfigStore.js                   # Backend type config storage (~280 lines)
│   └── typeconfig.json                      # Expense/Mileage type configuration
├── .gitignore                           # Git ignore rules
├── README.md                            # This file
│
├── # ─────────── DOCUMENTATION ───────────
├── docs/
│   ├── SECURITY.md                      # Inbound auth architecture, threat model, rotation procedures
│   └── screenshots/                     # App screenshots for documentation
│
├── # ─────────── BACKEND SERVICES ───────────
├── utils/
│   ├── DestinationService.js            # BTP Destination handling (~90 lines)
│   ├── FSMService.js                    # FSM API core: HTTP methods, CRUD, batch (~700 lines)
│   ├── FSMLookupService.js              # FSM lookup, approval, person, org, user (~475 lines)
│   ├── FSMQueryService.js               # FSM T&M entry retrieval queries (~255 lines)
│   ├── FSMJwtValidator.js               # FSM JWT signature verification against JWKS (Web UI auth) (~70 lines)
│   └── TokenCache.js                    # OAuth token caching (~110 lines)
│
└── # ─────────── FRONTEND (SAP UI5) ───────────
webapp/
│
├── # ─────────── ENTRY POINTS ───────────
├── index.html                       # App entry point
├── simple.html                      # Simple test page
├── manifest.json                    # UI5 app descriptor
├── Component.js                     # UI5 Component + global fetch wrapper (cookies, Bearer header) (~95 lines)
├── appconfig.json                   # App configuration
├── _appGenInfo.json                 # Generator info
│
├── # ─────────── VIEWS & FRAGMENTS ───────────
├── view/
│   ├── App.view.xml                 # Root view
│   ├── View1.view.xml               # Main view (T&M Journal page)
│   └── fragments/
│       ├── ContextInfoDialog.fragment.xml    # Session Context info dialog (~70 lines)
│       ├── ProductGroups.fragment.xml        # Activity panels with T&M tables (~370 lines)
│       ├── ServiceCall.fragment.xml          # Service Order header panel (~70 lines)
│       ├── StatusLegendDialog.fragment.xml   # Approval-status legend dialog
│       ├── TMCreateDialog.fragment.xml       # T&M Creation dialog (~680 lines)
│       ├── TMSortDialog.fragment.xml         # T&M Sort options dialog (~20 lines)
│       └── TypeConfigDialog.fragment.xml     # Type Configuration dialog (~120 lines)
│
├── # ─────────── CONTROLLERS & MIXINS ───────────
├── controller/
│   ├── App.controller.js            # Root controller
│   ├── View1.controller.js          # Main controller, sync onInit + async _initializeAsync sequencing (~725 lines)
│   └── mixin/
│       ├── DataLoadingMixin.js      # Data loading, batch T&M loading (~700 lines)
│       ├── TechnicianMixin.js       # Technician/task selection (~150 lines)
│       ├── TMDialogMixin.js         # T&M dialog open/enrichment (~405 lines)
│       ├── TMEditMixin.js           # Individual entry edit handlers (~750 lines)
│       ├── TMExpenseMileageMixin.js # Expense & Mileage creation (~525 lines)
│       ├── TMMaterialMixin.js       # Material entry creation (~195 lines)
│       ├── TMSaveMixin.js           # Batch save (new entries from creation dialog) (~470 lines)
│       ├── TMTableMixin.js          # Table filter/sort + Edit Selected/Save All + Delete Selected (~1175 lines)
│       └── TMTimeEntryMixin.js      # Time entry creation with repeat (~365 lines)
│
├── # ─────────── FRONTEND SERVICES ───────────
├── utils/
│   ├── helpers/
│   │   ├── DateTimeService.js       # Date/time utilities (~115 lines)
│   │   ├── ProductGroupService.js   # Activity grouping by product (~130 lines)
│   │   ├── ReportedItemsData.js     # T&M data fetching (~55 lines)
│   │   └── URLHelper.js             # Web container context handling (~230 lines)
│   │
│   ├── services/
│   │   ├── ActivityService.js       # Activity data management (~125 lines)
│   │   ├── ApprovalService.js       # Approval status & remarks lookup (~210 lines)
│   │   ├── BusinessPartnerService.js# Business partner lookup (~130 lines)
│   │   ├── CacheService.js          # Startup cache warming (~225 lines)
│   │   ├── ContextService.js        # Web container & Shell context detection, /api/v1/shell-session-init flow (~545 lines)
│   │   ├── ExpenseTypeService.js    # Expense type ID lookup (~170 lines)
│   │   ├── ItemService.js           # Item ID/ExternalId lookup (~260 lines)
│   │   ├── OrganizationService.js   # Organization level + user resolution (~270 lines)
│   │   ├── PersonService.js         # Person ID/name lookup (~280 lines)
│   │   ├── ServiceOrderService.js   # Service order/composite tree (~95 lines)
│   │   ├── TechnicianService.js     # Technician suggestions (~240 lines)
│   │   ├── TimeTaskService.js       # Time task ID lookup (~195 lines)
│   │   ├── TypeConfigService.js     # Expense/Mileage type config (~320 lines)
│   │   └── UdfMetaService.js        # UDF Meta ID lookup (~180 lines)
│   │
│   └── tm/
│       ├── TMCreationService.js     # T&M entry creation (~490 lines)
│       ├── TMDataService.js         # T&M data loading & model update (~155 lines)
│       ├── TMDialogService.js       # T&M dialog management (~485 lines)
│       ├── TMEditService.js         # T&M entry editing (~180 lines)
│       └── TMPayloadService.js      # T&M API payload building (~490 lines)
│
├── # ─────────── MODEL ───────────
├── model/
│   ├── formatter.js                 # Date/number/type formatting (~245 lines)
│   └── models.js                    # Device model
│
├── # ─────────── STYLES ───────────
├── css/
│   └── style.css                    # Custom styles (~785 lines)
│
├── # ─────────── IMAGES ───────────
├── images/
│   ├── favicon.png                      # Browser tab favicon (32x32, from logo)
│   └── TUEVNORD_Logo.png               # Customer logo
│
├── # ─────────── TEST ───────────
├── test/                            # Test files
│
└── # ─────────── I18N ───────────
└── i18n/
    ├── i18n.properties              # English translations (~900 lines)
    └── i18n_de.properties           # German translations (~900 lines)
```

---

## 🔌 API Reference

### Backend Endpoints

All `/api/v1/*` routes require an authenticated session — supplied via either the
`fsm_session` cookie (Mobile flow) or the `Authorization: Bearer <token>` header
(Web UI flow). Unauthenticated requests return HTTP 401. See
[docs/SECURITY.md](docs/SECURITY.md) for the full auth model.

#### Web Container & Session Establishment
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/web-container-access-point` | Receive context + Authentication Key from FSM Mobile. Validates the key, stores context, issues `fsm_session` cookie, redirects to app. |
| POST | `/` | Alternative web container entry point (same handler as above). |
| GET | `/web-container-context` | Retrieve stored web container context. Requires `fsm_session` cookie. |
| POST | `/api/v1/shell-session-init` | FSM Web UI Shell flow entry. Receives the Shell SDK's `access_token` JWT, verifies signature against FSM JWKS, returns session token in JSON body. **Excluded from `requireSession` middleware** (it's what establishes the session). |

#### Activity & Service Call
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/get-activity-by-id` | Fetch activity by ID |
| POST | `/api/v1/get-activity-by-code` | Fetch activity by code |
| POST | `/api/v1/get-activities-by-service-call` | Fetch composite tree for service call |
| PUT | `/api/v1/update-activity` | Update activity |

#### User & Organization
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/get-user-org-level` | Resolve user's organization level (userName → orgLevel) |
| GET | `/api/v1/get-organization-levels-full` | Fetch full organization hierarchy |

#### T&M Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/get-reported-items` | Fetch T&M entries for activity |
| POST | `/api/v1/get-approval-status` | Fetch approval status for T&M entries |

#### T&M Entry CRUD
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/batch-create` | Batch create multiple entries (Material, TimeEffort, Expense, Mileage) |
| PATCH | `/api/v1/batch-update` | Batch update multiple entries |
| DELETE | `/api/v1/batch-delete` | Batch delete multiple entries |
| POST | `/api/v1/create-expense` | Create individual Expense entry |
| PATCH | `/api/v1/update-expense/:id` | Update Expense entry |
| POST | `/api/v1/create-mileage` | Create individual Mileage entry |
| PATCH | `/api/v1/update-mileage/:id` | Update Mileage entry |
| POST | `/api/v1/create-material` | Create individual Material entry |
| PATCH | `/api/v1/update-material/:id` | Update Material entry |
| POST | `/api/v1/create-time-effort` | Create individual Time Effort entry |
| PATCH | `/api/v1/update-time-effort/:id` | Update Time Effort entry |
| POST | `/api/v1/create-time-material` | Create combined Time & Material (material + time efforts) |

#### Lookup Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/get-persons` | Fetch all persons (technicians) |
| POST | `/api/v1/get-person-by-id` | Fetch person by ID |
| POST | `/api/v1/get-person-by-external-id` | Fetch person by external ID |
| POST | `/api/v1/get-business-partner-by-external-id` | Fetch business partner by external ID |
| GET | `/api/v1/get-time-tasks` | Fetch time tasks for lookup |
| GET | `/api/v1/get-items` | Fetch items for lookup |
| GET | `/api/v1/get-expense-types` | Fetch expense types for lookup |
| POST | `/api/v1/get-udf-meta` | Resolve UDF Meta ID to externalId |

#### Type Configuration
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/get-type-config` | Get current type configuration |
| POST | `/api/v1/save-type-config` | Save full type configuration |
| POST | `/api/v1/add-expense-type` | Add expense type ID |
| POST | `/api/v1/remove-expense-type` | Remove expense type ID |
| POST | `/api/v1/add-mileage-type` | Add mileage type ID |
| POST | `/api/v1/remove-mileage-type` | Remove mileage type ID |
| POST | `/api/v1/reset-type-config` | Reset to default configuration |

> **API versioning policy:** All routes are mounted under `/api/v1/*` per the
> Programmierrichtlinie §7. When breaking changes are required in the future,
> they will be exposed as `/api/v2/*` alongside `/api/v1/*` — never replacing
> v1 in place.

### FSM APIs Used (Outbound)

| API | Endpoint | Purpose |
|-----|----------|---------|
| **Data API v4** | `/api/data/v4/Activity` | Activity CRUD |
| **Data API v4** | `/api/data/v4/TimeTask` | Time task lookup |
| **Data API v4** | `/api/data/v4/ExpenseType` | Expense type lookup |
| **Query API v1** | `/api/query/v1` | TimeEffort, Material, Expense, Mileage, Item, UdfMeta, Person, BusinessPartner, Approval queries |
| **Batch API v1** | `/api/data/batch/v1` | Batch create/update/delete operations |
| **Service Management v2** | `/api/service-management/v2/composite-tree` | Service call with activities |
| **User API** | `/api/user` | User data lookup (for org level resolution) |
| **Org Level Service v1** | `/cloud-org-level-service/api/v1/levels` | Organization hierarchy |
| **OAuth Token Endpoint** | `/api/oauth2/v2/token` | OAuth2 client credentials flow (via BTP Destination Service) |
| **JWKS Endpoint** | `/api/oauth2/v2/.well-known/jwks.json` | FSM public keys for inbound JWT verification (Web UI flow). Default region: DE. Override via `FSM_JWKS_URL`. |

### Key Files

#### Backend (Node.js/Express)

| File | Lines | Purpose |
|------|-------|---------|
| `index.js` | ~150 | Express server: middleware, inbound auth (Auth Key + JWT), session store, `requireSession`, `/api/v1` route mounting |
| `routes/activityRoutes.js` | ~155 | Activity & Service Call endpoints |
| `routes/entryRoutes.js` | ~430 | T&M entry CRUD: batch create/update/delete, individual CRUD |
| `routes/lookupRoutes.js` | ~275 | Person, org, lookup, approval, user endpoints |
| `routes/configRoutes.js` | ~240 | Type configuration endpoints |
| `utils/FSMService.js` | ~700 | FSM API core: HTTP methods, Data API, batch operations |
| `utils/FSMLookupService.js` | ~475 | FSM lookups: approval, person, org, user, business partner |
| `utils/FSMQueryService.js` | ~255 | FSM Query API: T&M entry retrieval queries |
| `utils/FSMJwtValidator.js` | ~70 | FSM JWT signature verification against JWKS endpoint (Web UI auth). Algorithm allow-list (RS256), 24h key cache, rate limited. |
| `utils/DestinationService.js` | ~90 | BTP Destination Service: reads VCAP_SERVICES, fetches destination config |
| `utils/TokenCache.js` | ~110 | OAuth token caching with 5 min pre-expiry buffer |
| `config/TypeConfigStore.js` | ~280 | Type configuration storage: file-based CRUD for expense/mileage type IDs |

#### Frontend (SAP UI5)

| File | Lines | Purpose |
|------|-------|---------|
| `Component.js` | ~95 | UI5 Component + global fetch wrapper that attaches `credentials: 'include'` and `Authorization: Bearer` (when `window.__fsmSessionToken` is set) on all `/api/v1/*` requests |
| `View1.controller.js` | ~725 | Main controller: sync `onInit` + async `_initializeAsync` (auth → type config → parallel data loading), mixin coordination |
| `ContextService.js` | ~545 | Context detection (Mobile / Shell SDK / URL params) + `/api/v1/shell-session-init` flow + Bearer token storage on `window.__fsmSessionToken` |
| `DataLoadingMixin.js` | ~700 | Data loading: service call, activities, user org resolution |
| `TMTableMixin.js` | ~1175 | Table filter/sort + Edit Selected/Save All + Delete Selected (PENDING/REVIEW) |
| `TMDialogMixin.js` | ~405 | T&M dialog event handlers: add/remove entries, validation |
| `TMDialogService.js` | ~485 | T&M dialog management: open/close dialogs, model binding |
| `TMCreationService.js` | ~490 | T&M entry creation: templates, type-specific field initialization |
| `TMPayloadService.js` | ~495 | FSM API payloads: request building, UDF field mapping |
| `TypeConfigService.js` | ~320 | Frontend type config: API client, type checking (isExpenseType, etc.) |

#### Lookup Services (Frontend)

| File | Lines | Purpose |
|------|-------|---------|
| `PersonService.js` | ~280 | Person ID → Name resolution |
| `TechnicianService.js` | ~240 | Technician suggestions for Input fields |
| `TimeTaskService.js` | ~195 | Task ID → Name resolution |
| `ItemService.js` | ~260 | Item ID/ExternalId → Name resolution |
| `ExpenseTypeService.js` | ~170 | Expense Type ID → Name resolution |
| `UdfMetaService.js` | ~180 | UDF Meta ID → ExternalId resolution |
| `OrganizationService.js` | ~270 | Org Level ID → Name, user org resolution |
| `BusinessPartnerService.js` | ~130 | BP ExternalId → Name resolution |
| `ApprovalService.js` | ~210 | Object ID → Approval decision status + remarks |

#### UI Fragments (XML)

| File | Size | Purpose |
|------|------|---------|
| `ContextInfoDialog.fragment.xml` | ~3KB | Session context info dialog (User, Account, Company, Organization) |
| `ServiceCall.fragment.xml` | ~3KB | Service Order details panel |
| `ProductGroups.fragment.xml` | ~38KB | Activity panels grouped by product, inline T&M tables |
| `StatusLegendDialog.fragment.xml` | ~2KB | Approval-status legend dialog |
| `TMCreateDialog.fragment.xml` | ~49KB | T&M creation dialog (Expense/Mileage/T&M tables) |
| `TMSortDialog.fragment.xml` | ~1KB | Sort options dialog |
| `TypeConfigDialog.fragment.xml` | ~6KB | Type configuration dialog (add/remove type IDs) |

---

## 💻 Development Guide

### Local Development
```bash
npm install

# The Express server requires FSM_WEBCONTAINER_AUTH_KEY to start.
# For local dev, export any 32+ character value (matching the FSM Admin
# side isn't needed unless you're testing the Mobile flow locally).
export FSM_WEBCONTAINER_AUTH_KEY='local-dev-key-not-used-against-real-fsm'

npm start
# App runs on http://localhost:3000
```

**Note:** Local development requires BTP Destination Service binding for outbound FSM API calls. For rapid UI iteration without backend access, use SAP Business Application Studio with port forwarding on port 3003, or `npm run start:dev` (Fiori dev server, frontend only — backend API endpoints will not be available).

### Testing Without FSM

URL parameters can drive the initial context selection:
```bash
# Test with Activity
http://localhost:3000?activityId=YOUR-ACTIVITY-UUID

# Test with Service Call  
http://localhost:3000?serviceCallId=YOUR-SERVICECALL-UUID
```

> **Important:** With strict authentication on `/api/v1/*`, this only loads the page and selects which object would be shown — **no FSM data populates** because no auth path was established (no Mobile Auth Key POST, no Web UI JWT). All `/api/v1/*` calls return 401.
> 
> Useful for: pure-frontend UI work (CSS, layout, view structure changes).
> 
> Not useful for: testing data flows, T&M creation/edit/delete, or anything that depends on FSM data. For full end-to-end testing, launch from FSM Mobile or FSM Web UI.

### Context Sources

The app supports 3 context sources (detected automatically by `ContextService.js`):

| Source | Detection | Auth Mechanism | How to Test |
|--------|-----------|----------------|-------------|
| **FSM Mobile** | POST to `/web-container-access-point` | Authentication Key → `fsm_session` cookie | Deploy and open from FSM Mobile app |
| **FSM Web UI** | Running in iframe + fsm-shell SDK available | Shell SDK JWT → `Authorization: Bearer` token | Configure as FSM Extension |
| **URL Parameters** | `?activityId=` or `?serviceCallId=` in URL | None (page loads but `/api/v1/*` returns 401) | Direct browser access (UI-only testing) |

### Web Container Context

The app receives context from FSM Mobile via POST request to `/web-container-access-point`:
```javascript
{
  "authenticationKey": "<shared-secret-matching-FSM_WEBCONTAINER_AUTH_KEY>",
  "cloudId": "9D92E0B18FDC4A27A213401FEEA89FDA",
  "objectType": "ACTIVITY",
  "userName": "Max Mustermann",
  "cloudAccount": "company_account",
  "companyName": "Company Name",
  "language": "de"
}
```

The server validates `authenticationKey` via constant-time comparison. On success, an HttpOnly `fsm_session` cookie is issued for subsequent `/api/v1/*` calls.

### Adding a New Lookup Service

1. **Create frontend service** in `webapp/utils/services/YourService.js`:
```javascript
sap.ui.define([], () => {
    "use strict";
    return {
        _cache: new Map(),
        
        async fetchData() {
            // Note the /api/v1/ prefix — all backend endpoints are versioned.
            // The global fetch wrapper in Component.js automatically attaches
            // credentials (cookie or Bearer header) to /api/v1/* calls.
            const response = await fetch("/api/v1/your-endpoint");
            const data = await response.json();
            data.items.forEach(item => {
                this._cache.set(item.id, item);
            });
        },
        
        getNameById(id) {
            const item = this._cache.get(id);
            return item ? item.name : id;
        }
    };
});
```

2. **Add backend method** in `utils/FSMService.js` (or `utils/FSMLookupService.js` for query-based lookups):
```javascript
async getYourData() {
    return this.makeRequest('/YourEntity', { dtos: 'YourEntity.version' });
}
```

3. **Add route handler** in `routes/lookupRoutes.js`. Paths inside route files are **bare** (no `/api/v1` prefix) — the `/api/v1` prefix is added by `app.use('/api/v1', ...)` in `index.js`:
```javascript
// This becomes /api/v1/your-endpoint when mounted
router.get("/your-endpoint", async (req, res) => {
    const data = await FSMService.getYourData();
    res.json({ items: data });
});
```

4. **Add to cache warming** in `webapp/utils/services/CacheService.js`:
```javascript
// Add to imports
"com.tns.fsm.timematerialext.app/utils/services/YourService"

// Add to _executeWarmup parallel loading
YourService.fetchData()
```

### Modifying Type Configuration

#### At Runtime (UI)
1. Click **Type Config** button (⚙️) in the footer toolbar
2. Add/remove Service Product IDs for Expense or Mileage types
3. Changes take effect immediately

#### At Development Time (Code)

**Default values** in `config/TypeConfigStore.js`:
```javascript
const DEFAULT_CONFIG = {
    expenseTypes: ["Z40000001", "Z40000007", "Z50000000"],
    mileageTypes: ["Z40000038", "Z40000008"],
    lastModified: null,
    modifiedBy: null
};
```

**Initial config file** `config/typeconfig.json`:
```json
{
  "expenseTypes": ["Z40000001", "Z40000007", "Z50000000"],
  "mileageTypes": ["Z40000038", "Z40000008"],
  "lastModified": null,
  "modifiedBy": null
}
```

#### Type Configuration API
```javascript
// Get current config
GET /api/v1/get-type-config
// Response: { success: true, data: { expenseTypes: [...], mileageTypes: [...] } }

// Add expense type
POST /api/v1/add-expense-type
Body: { "typeId": "Z40000099", "modifiedBy": "username" }

// Add mileage type
POST /api/v1/add-mileage-type
Body: { "typeId": "Z40000099", "modifiedBy": "username" }

// Remove types
POST /api/v1/remove-expense-type
POST /api/v1/remove-mileage-type
Body: { "typeId": "Z40000099", "modifiedBy": "username" }

// Reset to defaults
POST /api/v1/reset-type-config
Body: { "modifiedBy": "username" }
```

All these endpoints require an authenticated session (cookie or Bearer header) — see [docs/SECURITY.md](docs/SECURITY.md).

### Adding a New T&M Entry Type

To add a new entry type (e.g., "Travel"):

1. **Update `config/TypeConfigStore.js`** — Add new type array:
```javascript
const DEFAULT_CONFIG = {
    expenseTypes: [...],
    mileageTypes: [...],
    travelTypes: ["Z40000099"],  // New type
};
```

2. **Update `webapp/utils/services/TypeConfigService.js`** — Add type checking:
```javascript
isTravelType(serviceProductId) {
    return _config?.travelTypes?.includes(serviceProductId) || false;
}
```

3. **Update `webapp/utils/tm/TMDialogService.js`** — Add type flag to dialog model:
```javascript
const isTravelType = TypeConfigService.isTravelType(serviceProductExtId);
```

4. **Update `webapp/view/fragments/TMCreateDialog.fragment.xml`** — Add form section:
```xml
<Panel visible="{createTM>/isTravelType}" headerText="Travel Entry">
    <!-- Travel-specific fields -->
</Panel>
```

5. **Update `webapp/view/fragments/TypeConfigDialog.fragment.xml`** — Add UI section for configuring travel type IDs

---

## 🐛 Troubleshooting

### View Logs
```bash
cf logs com.tns.fsm.timematerialext.app --recent
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Server crashes immediately on startup with `FATAL: FSM_WEBCONTAINER_AUTH_KEY environment variable is not set` | Required env var missing | `cf set-env com.tns.fsm.timematerialext.app FSM_WEBCONTAINER_AUTH_KEY '<value>'` then `cf restage com.tns.fsm.timematerialext.app`. Locally: `export FSM_WEBCONTAINER_AUTH_KEY='...'` before `npm start`. |
| Mobile launch returns 401 (`WC-ACCESS-POINT: rejected POST — authenticationKey mismatch`) | FSM Admin Authentication Key doesn't match the `FSM_WEBCONTAINER_AUTH_KEY` env var | Both values must match byte-exactly. Compare FSM Admin → Web Containers → Authentication Key against the env var (`cf env com.tns.fsm.timematerialext.app`). |
| Web UI extension launches but all data is missing / 401s in console | Shell session init failed or JWKS validation failed | Check `cf logs` for `SHELL-INIT: rejected — JWT validation failed: ...`. If JWKS unreachable, verify `FSM_JWKS_URL` (default points at DE region; override for other regions). |
| Standalone URL access (`?activityId=...`) loads page but no data populates | Strict auth — no Mobile Auth Key POST and no Web UI JWT means no session token | Standalone is now page-load-only for pure UI work. Use FSM Mobile or FSM Web UI for full functionality. |
| 404 on app load | Static file path wrong | Verify `express.static` points to correct folder |
| Session Context Dialog shows nothing | Context not detected | Ensure opened from FSM Mobile/Web UI |
| Organization not resolved | User not assigned to org level in FSM | Verify user's Person record has orgLevelIds assigned |
| No activities shown | No EXECUTION/CLOSED activities or wrong org level | Check activity execution stages and org level assignments in FSM |
| T&M shows IDs instead of names | Lookup service not loaded (often caused by 401s during cache warm) | Check console for `CacheService: Cache warm complete` line — if it shows `{technicians: false, ...}`, auth wasn't established before cache warm fired. Check `_initializeAsync` sequencing in `View1.controller.js`. |
| Dialog shows "No data" | API timeout | Refresh and try again |
| "Context not available" message | Context lost or not provided | Re-open app from FSM Mobile/Web UI |
| Add Entry button not visible | Activity is cancelled/closed or read-only | Button hidden when `isReadOnly` is true |
| Activity not highlighted | cloudId doesn't match any activity | Verify context passes correct Activity ID |
| Type Config changes not persisting | File storage on Cloud Foundry is ephemeral | Changes persist during runtime but reset on app restart/redeploy |
| Wrong creation form showing | Service Product ID not in correct type list | Use Type Config dialog to add/remove IDs |
| Delete Selected toast says "0 entries deleted" but entries are gone | Multipart batch response parser drops bodyless 204 responses | Cosmetic — entries are actually deleted. Refresh the page to confirm. |
| Refresh button click crashes with `Cannot read properties of undefined (reading 'setProperty')` | View model not yet initialized | Should not happen with current code (sync `onInit` ensures model exists before view renders). If it appears, verify `View1.controller.js` `onInit` is **not** declared `async`. |
| `[FUTURE FATAL] com.tns.fsm.timematerialext.app.controller.View1: The registered Event Listener 'onInit' must not have a return value` | `onInit` declared as `async` (returns Promise) | Make `onInit` synchronous; delegate async work to a separate `_initializeAsync` method called fire-and-forget. |
| `fetch-wrapper: session readiness gate timed out after 10s` | Some `/api/v1/*` call fired before session was established | Defensive backstop in `Component.js`. Should not appear in normal operation — investigate which service is fetching outside the controlled bootstrap sequence in `_initializeAsync`. |
| Web UI extension works first time, then 401s after some idle | Session token expired (30 min TTL) or container restarted (in-memory `sessionStore` cleared) | Refresh the iframe; the Shell SDK will re-issue a JWT and the app will re-establish a session. |
| `class` assertion error in console | UI5 debug mode warning | Can be ignored — cosmetic only, doesn't affect functionality |

### Debug Console Logs

The app logs detailed information to browser console:

**Context Detection (`ContextService`):**
- `ContextService: URL parameters detected` — URL params found, highest priority
- `ContextService: Running in iframe, trying Shell SDK first...` — Iframe detected
- `ContextService: FSM Shell SDK loaded` — Shell SDK script loaded
- `ContextService: Raw shell context received:` — REQUIRE_CONTEXT response
- `ContextService: ViewState 'activity' received:` — Activity from shell
- `ContextService: FSM Shell context detected` — Shell context resolved
- `ContextService: Session token stored for Bearer auth (Web UI flow)` — JWT verified, session established
- `ContextService: Shell session initialized — cookie set` — Shell session init returned 200
- `ContextService: Mobile web container context detected` — Mobile POST context
- `ContextService: No context found - standalone mode` — No context, empty state
- `ContextService: Returning cached context from [source]` — Using cached context

**Type Configuration (`TypeConfigService`):**
- `TypeConfigService: Loaded config from server` — Config fetched successfully

**Data Loading (`CacheService`, `DataLoadingMixin`):**
- `CacheService: Starting parallel cache warm...` — Lookup data loading start
- `CacheService: Cache warm complete in Xms {technicians: true, ...}` — All caches loaded successfully (all `true` = healthy bootstrap)
- `CacheService: Cache warm complete in Xms {technicians: false, ...}` — Cache warm fired before auth was established (sequencing bug); check `_initializeAsync` order

**Services:**
- `ActivityService:` — Activity data operations
- `OrganizationService:` — Organization level lookups
- `TMDialogService:` — T&M dialog operations
- `TMCreationService:` — T&M entry creation

**Technician Selection:**
- `TechnicianSearch:` / `TechnicianLiveChange:` — Search input
- `TechnicianSelect:` / `TechnicianSuggestionSelect:` — Selection events

### Backend Logs

Server-side logs (visible via `cf logs`):

**Startup:**
```
Server running on port 3000
FSM_WEBCONTAINER_AUTH_KEY is set (N chars)
Session TTL: 30 minutes
Cookie: HttpOnly; Secure; SameSite=None; Path=/
API mounted at /api/v1 (strict auth — no Web UI carve-out)
FSMJwtValidator: using JWKS endpoint https://de.fsm.cloud.sap/api/oauth2/v2/.well-known/jwks.json
```

**Normal operation:**
```
WC-ACCESS-POINT: context stored, session issued (contextKey=..., sessionStoreSize=N)
SHELL-INIT: session issued (contextKey=..., userEmail=..., sessionStoreSize=N)
Batch create: 5 entries (transactional: false)
Batch update: 3 entries (transactional: false)
Batch delete: 2 entries (transactional: false)
```

**Auth-related rejections:**
- `WC-ACCESS-POINT: rejected POST — authenticationKey mismatch` — FSM Admin Auth Key doesn't match env var
- `WC-ACCESS-POINT: rejected POST — authenticationKey missing` — Mobile POST didn't include `authenticationKey` field
- `SHELL-INIT: rejected — JWT validation failed: ...` — Web UI JWT couldn't be verified (signature, expiration, or unknown key)
- `SHELL-INIT: rejected — missing authToken in body` — Frontend bug or tampering
- `AUTH: rejected ... missing-credential ... source=none` — `/api/v1/*` called without cookie or Bearer header — direct attack attempt or bootstrap sequencing bug
- `AUTH: rejected ... invalid-or-expired ... source=cookie` — Mobile cookie expired or tampered
- `AUTH: rejected ... invalid-or-expired ... source=bearer` — Web UI Bearer token expired or tampered

**Error patterns to watch for:**
- `Error fetching activity by ID:` — Activity fetch failed
- `Error fetching activities by service call:` — Composite tree failed
- `Error fetching reported items:` — T&M data fetch failed
- `Error fetching user org level:` — User/org resolution failed
- `Error in batch create:` — Batch entry creation failed
- `Error in batch update:` — Batch entry update failed
- `Error in batch delete:` — Batch entry deletion failed
- `Error creating expense/mileage/material/time effort:` — Individual entry creation failed
- `Error updating expense/mileage/material/time effort:` — Individual entry update failed
- `Error fetching persons:` — Person lookup failed
- `TypeConfigStore: Error saving config:` — Type config save failed

### Type Configuration Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't add type ID | Ensure ID is not empty; IDs are auto-uppercased and trimmed |
| Type ID already exists | Duplicate check prevents adding same ID twice to same list |
| Adding ID to Expense removes it from Mileage (or vice versa) | Expected behavior — IDs auto-move between lists to prevent conflicts |
| Reset doesn't restore all defaults | Refresh page after reset to reload from server |
| Changes lost after redeploy | Expected behavior — file storage is ephemeral on Cloud Foundry |

### Authentication Troubleshooting

| Issue | Diagnostic | Solution |
|-------|-----------|----------|
| Don't know if Mobile cookie is set | `document.cookie` in DevTools console | Should contain `fsm_session=...`. If absent in iframe (Web UI), this is expected — Web UI uses Bearer header, not cookie. |
| Don't know if Web UI Bearer token is set | `window.__fsmSessionToken` in DevTools console | Should be a 32+ char base64url string after Shell session init. If `undefined` or `null`, the init flow didn't complete — check console for ContextService errors. |
| Don't know which auth source is being used | `cf logs com.tns.fsm.timematerialext.app \| grep "AUTH:"` | Successful requests don't log; rejections include `source=cookie` or `source=bearer` so you can see which path the request came in on. |
| Want to verify JWKS endpoint is reachable from CF | `curl https://de.fsm.cloud.sap/api/oauth2/v2/.well-known/jwks.json` | Should return JSON with `"keys": [...]` array, HTTP 200. If unreachable, JWT validation will fail and Web UI auth breaks. |
| Want to inspect what FSM Mobile is sending | `cf logs com.tns.fsm.timematerialext.app \| grep "WC-ACCESS-POINT"` | Successful POSTs log `context stored, session issued` with the contextKey. Missing log = POST never arrived. Rejection log = key mismatch. |

For the full inbound auth model (threat model, rotation procedures, why not XSUAA), see [docs/SECURITY.md](docs/SECURITY.md).

---

## 📝 Application Details

|                                    |                                                          |
|------------------------------------|----------------------------------------------------------|
| **App Name**                       | T&M Journal                                              |
| **Module Name**                    | com.tns.fsm.timematerialext.app                                              |
| **Framework**                      | SAP UI5 (Fiori) + Node.js Express                        |
| **UI5 Theme**                      | sap_horizon                                              |
| **UI5 Version**                    | Latest (OpenUI5 from CDN)                                |
| **Deployment Platform**            | SAP Business Technology Platform (Cloud Foundry)         |
| **Node.js Version**                | 18+                                                      |
| **npm Version**                    | 8+                                                       |
| **Inbound Authentication**         | FSM Authentication Key (Mobile) + FSM JWT validation against JWKS (Web UI), with HttpOnly cookie or Bearer token session delivery |
| **Outbound Authentication**        | OAuth 2.0 via BTP Destination Service                    |
| **Supported Contexts**             | FSM Mobile (full), FSM Web UI (full), Standalone (page-load-only, no auth) |

---

## 🚀 Current Status

### ✅ Implemented:

**Context & Integration:**
- Multi-context support (FSM Mobile, FSM Web UI, Standalone via URL params — standalone now page-load-only after strict auth)
- Web container integration (receives context + Authentication Key from FSM Mobile)
- FSM Shell SDK integration (receives context + access_token JWT from FSM Web UI via iframe)
- URL parameter support (`?activityId=` or `?serviceCallId=`) for object selection
- Session Context Dialog (User, Language, Account, Company, Organization), opened from footer toolbar

**Inbound Authentication:**
- FSM Authentication Key validation on Mobile WebContainer entry POSTs (constant-time comparison)
- FSM JWT signature verification on Web UI Shell flow (RS256, against FSM JWKS endpoint)
- Server-issued opaque session tokens (32 bytes random, 30 min TTL)
- Two delivery mechanisms: HttpOnly cookie (Mobile, first-party WebView) and `Authorization: Bearer` header (Web UI, where browsers refuse to store third-party cookies)
- `requireSession` middleware on all `/api/v1/*` routes (no carve-out)
- API versioning at `/api/v1` per Programmierrichtlinie §7
- Full documentation in [docs/SECURITY.md](docs/SECURITY.md)

**Organization & Navigation:**
- Organization level auto-resolution from logged-in user (userName → User API → Person → orgLevel)
- Service Order panel (expandable, collapsed by default)
- Activities grouped by Product Description
- Context activity highlighting (light blue SAP Fiori styling, auto-expanded)

**Activity Display:**
- Activity panels with key fields (Address, Responsible, Org Level, Service Product)
- T&M Summary for T&M activities: Material qty (reported/planned), AZ/FZ/WZ hours reported

**Inline T&M Tables (per activity):**
- Time/Material combined table with type filter (All / Time Effort / Material)
- Expense table with type, amounts, technician
- Mileage table with distance, duration, technician
- Row highlighting by approval status (Success/Error/Warning)
- Approval status column (PENDING, APPROVED, DECLINED, CANCELLED, DECLINED_CLOSED → CHANGE, REVIEW, REJECTED)
- Decision column (approver's remarks)
- Batch selection via checkbox (PENDING and REVIEW entries selectable for delete)
- Inline edit mode (Edit Selected → modify values → Save All)
- Batch delete (Delete Selected) — works for PENDING or REVIEW status
- Sort dialog per table type
- Horizontal scroll for wide tables on mobile

**T&M Creation Dialog:**
- Entry type based on Activity Service Product (configurable via Type Config)
- Three creation forms:
  - **Expense** — Multi-row table: Expense Type, Technician, External/Internal Amount, Date, Remarks
  - **Mileage** — Multi-row table: Mileage Type, Technician, Distance (km), Duration (min), Date, Remarks
  - **Time & Material** — Material table (Item, Technician, Quantity, Date, Remarks) + Time entry tables (AZ/FZ/WZ with Task, Multi-Technician tokens, Duration, Date, Repeat Date Range, Remarks)
- Multi-technician selection (MultiInput with token-based picker)
- Repeat date range (checkbox + end date → creates entries for each day)
- Technician search with Input suggestions (4000+ records)
- Task dropdown filtered by category (AZ, FZ, WZ)
- Sequential time calculation (entries chain start/end times per date)
- Batch save with confirmation preview (shows entry count, technician × dates multipliers)

**T&M Entry Edit:**
- Individual entry editing via inline edit mode
- Batch update (Save All edited entries)
- Entry-type-specific field editing (Time Effort, Material, Expense, Mileage)

**T&M Entry Submission:**
- Full FSM API integration: batch create, batch update, batch delete
- Individual create/update endpoints for each entry type
- Dialog closes and inline tables auto-refresh after creation

**Bootstrap Sequencing:**
- Synchronous `onInit` (UI5 lifecycle compliance, view model exists before render)
- Async `_initializeAsync` chain: auth context → type config → parallel data loading
- Eliminates race conditions between auth establishment and `/api/v1/*` calls
- Documented in `View1.controller.js` and `docs/SECURITY.md`

**Type Configuration:**
- Configurable Expense/Mileage Service Product IDs
- Type Config Dialog (add/remove/reset type IDs)
- REST API for type configuration CRUD (under `/api/v1/*`)
- File-based storage (`config/typeconfig.json`)
- Auto-uppercase and trim on type IDs
- Auto-move between lists (adding to Expense removes from Mileage and vice versa)
- Default types:
  - Expense: Z40000001, Z40000007, Z50000000
  - Mileage: Z40000038, Z40000008
  - Time & Material: All others

**Internationalization:**
- English translations (`i18n.properties`, ~980 lines)
- German translations (`i18n_de.properties`, ~980 lines)

**Services & Infrastructure:**
- Lookup services for ID resolution (Person, Technician, Task, Item, ExpenseType, UdfMeta, Approval, Organization, BusinessPartner)
- Parallel cache warming at startup (CacheService) — runs after auth is established to avoid 401s
- Outbound OAuth 2.0 to FSM via BTP Destination Service (`FSM_S4E`)
- OAuth token caching with 5 min pre-expiry buffer (TokenCache.js)
- Inbound JWT key caching with 24h TTL (FSMJwtValidator.js)
- Responsive CSS with mobile-first design (CSS Grid auto-fit layout)

### 📋 Planned:
- Persistent type configuration (database storage instead of file)
- Persistent session storage (Redis or similar) for horizontal scaling — currently in-memory, requires `instances: 1`
- Multi-region JWKS configuration (currently defaults to DE; override via `FSM_JWKS_URL`)
- Offline support
- Restoration of standalone mode for development via opt-in `DEV_BYPASS_AUTH` env var (clearly named, never set in production)

---

## 🔐 Security Notes

- **Inbound authentication on all API paths.** All `/api/v1/*` routes require a valid session token via cookie (Mobile) or Bearer header (Web UI). Direct browser access without an established session returns 401. See [docs/SECURITY.md](docs/SECURITY.md) for the full model.
- **FSM Authentication Key** (Mobile flow) stored as env var (`FSM_WEBCONTAINER_AUTH_KEY`), validated server-side via constant-time comparison. Server refuses to start without it.
- **FSM JWT validation** (Web UI flow) uses RS256 algorithm allow-list, prevents `alg: none` and HS256-confusion attacks. Public keys cached for 24h, fetch rate-limited to 10/min.
- Session tokens generated via `crypto.randomBytes(32)`, stored in-memory only, 30-minute TTL.
- **Outbound OAuth tokens** cached in memory (not persisted to disk).
- **Destination credentials** stored securely in VCAP_SERVICES (BTP-managed).
- **Cookies** set with `HttpOnly; Secure; SameSite=None`. Cookie attribute applies to Mobile flow; Web UI uses Bearer token because browsers refuse to store cookies in cross-site iframe context.
- **Web container context** stored in memory (cleared on restart).
- **Type configuration** stored in file (no sensitive data).
- HTTPS enforced by Cloud Foundry.
- No sensitive data logged (auth tokens, session tokens, and JWTs excluded from console output).
- fsm-shell SDK loaded from trusted CDN (`https://unpkg.com/fsm-shell@1.20.0`).
- Documented compliance deviation from Programmierrichtlinie §10 (no XSUAA) approved per §12 — see [docs/SECURITY.md](docs/SECURITY.md).

---

## 📄 License

Internal use only — Company proprietary.

---

**Last Updated:** April 2026