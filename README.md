This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Curo CRM application

JWT-authenticated Next.js 16 dashboard built on the migrated Vtiger data
(`curo_next_db`: `customers`, `contacts`, `communications`, `users`).

### First-time setup

```bash
npm install
# Copy .env.example to .env and fill in the DB credentials + JWT_SECRET
npm run db:migrate-auth                       # adds the auth columns to `users`
npm run db:seed-password -- --email you@example.com --password "Str0ng!Pass"
npm run dev
```

Generate a signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Authentication

- `users.password_hash` stores a bcrypt (cost 12) hash. A `NULL` hash means
  "no password set" and that account cannot sign in.
- A successful login signs an HS256 JWT (`jose`) and stores it in the
  `curo_session` cookie: `HttpOnly`, `SameSite=Lax`, `Secure` in production,
  7 day TTL (`SESSION_TTL_DAYS`).
- `proxy.ts` — Next.js 16's replacement for `middleware.ts` — performs the
  optimistic check: unauthenticated page requests are redirected to
  `/login?next=…`, and `/api/*` returns `401` JSON.
- `lib/auth/dal.ts` is the authoritative check. Pages, Server Actions and Route
  Handlers re-verify the token against the database, including
  `users.token_version`, so a password change or administrator reset instantly
  invalidates previously issued tokens.
- Brute force protection: 5 failed attempts lock an account for 15 minutes
  (`failed_attempts` / `locked_until`).

### Customer data table

`/customers` is a flexible, server-driven data table built on **TanStack Table v9** (headless, so the
markup and styling stay Tailwind):

- **Columns are data, not markup.** Add or remove an entry in `CUSTOMER_COLUMNS`
  (`lib/customer-query.ts`) with a label, a filter kind (`text`, `select`, `number`) and — to make the cell
  editable in place — an `edit` block (`kind`, `required`/`nullable`, `maxLength`, `options`); the table,
  its header filters, the column picker and the inline editors all follow. The SQL side lives in
  `lib/data/customers.ts` (`SORT_SQL`, `TEXT_FILTER_SQL`, `ADDRESS_FILTER_SQL`, `NUMERIC_FILTER_SQL`).
- **Filtering, sorting and paging run in MySQL**, driven entirely by the URL, so every view is
  shareable and survives a refresh. Values within one column are OR'd, columns are AND'd. With no
  sort of your own the table opens **A→Z on Account** (`DEFAULT_SORT` in `lib/customer-query.ts`).
- **Filters live in a second header row**, directly under the column labels, inside one `next/form`
  GET form (native fields, client-side navigation on submit). Text columns take chips (type + Enter
  adds a value, × removes one), Status/Industry a multi-checkbox dropdown, Comms/Vtiger # a Min–Max
  range. **Search** applies the whole row (Enter in a text field adds a chip); **Clear** drops every
  filter while keeping your sort, columns, page size and active view. Both header rows stay pinned
  while the table body scrolls.
- **Whole-row click-through**: the Account cell carries an absolute overlay link, so the whole row
  navigates to the customer while remaining a single real link (keyboard, right-click, new tab).
- **Owner, from Vtiger**: `assigned_to` / `assigned_group_id` mirror `vtiger_crmentity.smownerid`, which is
  *either* a person or a group — hence one "Assigned to" cell that shows the name, a `group` tag, or `—`,
  a People/Groups picklist, and an "Unassigned" filter. Groups live in `assignment_groups` (imported from
  `vtiger_groups`; Vtiger's "Delete"/"Archived Contacts" style groups land `is_active = 0`, so they stay
  out of the pickers while their customers keep the real owner) and membership in
  `assignment_group_members`, derived from Vtiger's `vtiger_group2role` + `vtiger_user2role` as a
  best-effort snapshot (`source = 'VTIGER'`, maintained by hand afterwards — only Loop, Delete and
  RML SUPPLIES have roles to derive from). Backfilled by `npm run db:backfill-vtiger -- --assignment`,
  which only fills customers that have no owner yet, so an in-app reassignment survives a re-run.
- **Inline editing**: hover a cell and a pencil appears (also on keyboard focus, and always on touch
  devices). Text columns (`name`, `account_no`, `email`, `phone`, `town`, `county`, `postcode`) open a
  field; the picklists (`status`, `industry`) open a dropdown of the active lookups. Enter or ✓ saves,
  Escape or ✕ cancels, and clicking away saves only when something changed. The server re-validates
  against the column registry (`edit` in `lib/customer-query.ts`) — required fields, lengths, email
  shape, live lookup ids and the unique account number — and writes the change plus its
  `customer_activity` audit row in one transaction, so every edit shows up in the customer page's
  activity trail. `town`/`county`/`postcode` update the customer's default address and are stamped
  `source = 'MANUAL'`, which keeps a `npm run db:backfill-vtiger` re-run from overwriting them.
  `Comms` (a computed count) and `Vtiger #` (the legacy CRM's unique account id) stay read-only.
- **Archive & permanent delete**: every row carries a checkbox, and the **Archive** button next to the
  filters stays disabled until something is selected (select-all covers the current page). Archiving is a
  **soft delete** any signed-in user can do: the customer leaves the table, the dashboard, the picklists
  and its own page, nothing is destroyed, and the change is recorded in `customer_deletion_log`
  (`ARCHIVED`) with the child counts. Administrators get a **Archived** nav link to `/customers/archived`
  where they can restore a customer or delete it permanently — the only irreversible step, which cascades
  into contacts, addresses, quotes, documents, communications and the activity trail and writes a `PURGED`
  log row (counts + actor) that outlives the customer.
- **Who is an administrator** is `users.is_admin`, copied from Vtiger's `vtiger_users.is_admin`
  (`'on'`/`'off'`) by `npm run db:backfill-vtiger -- --admins` — 6 users today. The flag only gates the
  Archived page and its actions; everything else stays open to any signed-in user.
- **Creating and editing**: `New customer` in the table toolbar opens `/customers/new`, and every
  record has an `Edit customer` button leading to `/customers/[id]/edit`. Both use the same form —
  account name (the only required field), email, phone, status, industry, owner and a primary-address
  block. There is **no account-number field**: numbers are internal bookkeeping (the legacy
  `account_no` column stays valid), so the next free one is allocated automatically. Address line is
  required as soon as any other address field is filled (the column is `NOT NULL`), the first save
  creates the customer's default address (`source = 'MANUAL'`), and every change is written to the
  activity trail — `CREATED` on create, one row per changed field on edit, with lookup ids resolved to
  names.
- **Customer record page** (`/customers/[id]`): a horizontal tab strip — **Details · Contacts ·
  Quotes · Jobs · Updates · Comments · Documents** — driven by `?tab=…`, so every tab is a shareable
  deep link and only the active tab's data is fetched. **Details** shows every customer field
  (including the address lines) with the same inline pencil as the table, plus the addresses list;
  **Updates** is the audit trail and **Comments** the communication timeline, which carries the composer:
  write an update, type `@` (or press *Tag person or contact*) and pick from the **People** (colleagues) and
  **Contacts** (this customer's) list — the tag becomes an `@Name` token plus a removable chip, and is stored in
  `communication_mentions` (one row per tagged target, indexed for later queries) rather than only in the text.
  Tags are re-validated server-side (a contact must belong to that customer, a colleague must exist), the
  comment, its tags and a `COMMENT_ADDED` audit row land in one transaction, and a saved comment is confirmed by
  appearing at the top of the timeline. The person who **wrote** a comment — and only they — can delete it: the
  row and its tags go, and the trail keeps a `COMMENT_DELETED` entry with a snippet of what was removed and who
  it had tagged. Contacts are edited on their own record (`/contacts/[id]`), while Quotes/Documents are read-only
  for now, and **Jobs** is a placeholder until that module exists.
- **Saved views** live in `user_saved_views` — columns, filters, sort and page size per user. A view
  flagged `is_default` loads automatically when `/customers` is opened with no state of your own.
  Views are private to their owner and names are unique per user + entity. Sorting stays yours: while
  a view is open the URL pins `sort`/`dir`, so clicking a header always beats the view's stored sort.

| URL parameter | Meaning |
| --- | --- |
| `f.<column>=<value>` (repeatable) | text `LIKE %value%` or a lookup id; repeat the key to OR values |
| `n.<column>.min` / `n.<column>.max` | numeric range (e.g. `n.communications.min=5`) |
| `sort` / `dir` | sort column and direction (always written while a view is open) |
| `cols` | comma-separated visible columns, in order |
| `size` / `page` | page size (10/25/50/100) and page number |
| `view` | saved view id to apply |

### Contacts data table

`/contacts` is the same registry-driven table as `/customers` — `lib/table-query.ts` holds the shared machinery
(registry types, URL ⇄ state, saved-view expansion) and `lib/contact-query.ts` holds the contacts registry — so it
filters, sorts and pages in MySQL and keeps every bit of its state in the URL:

- **Columns are data.** `CONTACT_COLUMNS` (`lib/contact-query.ts`) drives the table, its header filters and the
  column picker; the matching SQL lives in `lib/data/contacts.ts` (`SORT_SQL`, `TEXT_FILTER_SQL`,
  `NUMERIC_FILTER_SQL`). Visible by default: **Contact** (first + last, and the row's link), **Account** — the
  customer the contact is attached to, linking through to `/customers/[id]` — **Email** and **Phone**; First name,
  Last name, Account # and Vtiger # are one click away. Nothing is inline-editable (a contact is changed on its
  form), so no column carries an `edit` block.
- **The URL contract is identical** to `/customers`: `f.<column>=<value>`, `n.<column>.min|max`, `sort`, `dir`,
  `cols`, `size`, `page` — minus `view`, because this table has no saved views.
- A contact of an **archived customer** is hidden with its customer: the query joins `customers` and requires
  `deleted_at IS NULL`, exactly like the customers table.
- `/contacts/new` and `/contacts/[id]/edit` share `components/contact-form.tsx`. A contact must belong to a
  customer and there are ~4,700 of them, so the attach field is a debounced search combobox
  (`components/customer-picker.tsx` → `searchCustomersAction`, matching name or account number 20 at a time) that
  submits a plain hidden `customerId` and re-checks it server-side. `?customer=<id>` pre-attaches an account, which
  is how the customer's Contacts tab links here.
- `/contacts/[id]` shows the contact and, first thing, **the customer it is attached to**.
- **A checkbox column with a bulk delete.** Selecting rows (or *select all on this page*) and pressing **Delete**
  asks for a `window.confirm` naming the count first; the action refuses a selection over 500 ids and re-checks every
  id server-side, so a stale selection cannot remove the wrong row. Each removal is recorded on its owner's trail,
  exactly like the single delete on the edit page, and the selection clears itself because the row set changed.
- **Contact changes are recorded on the customer's trail**, not one of their own: `customer_activity` rows with
  `entity_type = 'CONTACT'` and the contact's id — `CONTACT_CREATED`, one `CONTACT_UPDATED` per changed field
  (old → new value), `CONTACT_MOVED` on *both* customers when a contact is re-attached, and `CONTACT_DELETED` when
  it is removed (its comment tags cascade away through `communication_mentions`). They show on that customer's
  Updates tab — the change and its trail row are always written in one transaction.

### Screens

| Route | Description |
| --- | --- |
| `/login` | Email + password sign-in (Server Action; works without JavaScript) |
| `/dashboard` | KPI cards, customer counts by status, top industries, a compliance/pipeline watchlist, and the 10 most recent communications |
| `/customers` | Flexible data table (TanStack Table v9): per-column filters, sortable headers, whole-row click-through, column picker, bulk archive and per-user saved views |
| `/customers/new` | Create a customer (shared form; the account number is allocated automatically) |
| `/customers/[id]` | Customer record with tabs — Details (inline-editable), Contacts (linking to each contact), Quotes, Jobs, Updates, Comments, Documents |
| `/customers/[id]/edit` | Edit the customer and its primary address with the same form |
| `/customers/archived` | **Administrators only**: review archived customers, restore them or delete them permanently |
| `/contacts` | Contacts table (same registry as `/customers`): per-column filters, sortable headers, whole-row click-through, column picker and a checkbox column with bulk delete — every row shows the customer it is attached to |
| `/contacts/new` | Create a contact and attach it to a customer (`?customer=<id>` pre-attaches one) |
| `/contacts/[id]` | Contact record: its details and the customer it is attached to |
| `/contacts/[id]/edit` | Edit the contact (including re-attaching it) or delete it |
| `/settings` | Settings hub: a styled card per area of reference data — Industries, **Customer statuses** and **Users** (administrators only) are live, Quote types and Assignment groups are badged **Coming soon** until their pages exist |
| `/settings/industries` | The industry picklist: sort order, active flag, and how many live customers hold each value. Anyone can add one; only an administrator can change, switch off or remove one |
| `/settings/customer-statuses` | The customer status picklist: code, name, the badge colour, sort order and how many live customers hold each value. Anyone can add one (colour included); only an administrator can change, switch off or remove one |
| `/settings/users` | **Administrators only**: the accounts that can sign in, with add / edit / delete in modals, temporary passwords, the admin flag, lockouts and who last signed in |
| `/account/password` | Change your own password (forced prompt after an admin reset) |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | JSON endpoints |

Every route except `/login` and `POST /api/auth/login` requires a valid session.

### Settings

`/settings` is the hub for the reference data behind the picklists: one styled card per area, each counting its own
values live (`getSettingsOverview()`, one query of scalar subqueries). A card becomes a link once its page exists
and renders as a dashed, non-clickable card badged **Coming soon** until then, so the hub can never lead to a 404; an
area whose page is administrator-only is rendered for administrators alone, the same way the Archived nav link is.
Adding an area is one more entry in the `areas` array on the page.

`/settings/industries` is the first of those pages. It lists every industry — active or switched off, with how many
live customers hold each value — and every signed-in user may **add** one: the form lives in a modal over the list,
and a non-administrator's entry is always active and appended to the end, because the data layer *ignores* the sort
order and the active flag for them rather than merely hiding the fields. Changing, reordering, switching off or
removing an industry is administrator-only — `verifyAdminPage()` 404s the edit screen and `lib/data/industries.ts`
re-checks `isAdmin` for direct POSTs, since a 404 cannot stop one. Deleting never touches a customer
(`customers.industry_id` is `ON DELETE SET NULL`): the confirmation modal says how many customers will be left with
no industry, and switching an industry off is the reversible alternative — it leaves the picklist while the customers
already using it keep its name.

`/settings/customer-statuses` is the same shape, for the status picklist: the list shows each status's code, name, the
colour its badge uses, its position, whether it is switched off, and how many live customers hold it. Everyone signed
in may add a status — code, name and colour; the sort order and the active flag are ignored for non-administrators
exactly as on the industries screen, so their entry is appended and switched on — while changing, recolouring,
reordering, switching off or removing one is administrator-only, re-checked in `lib/data/statuses.ts`. The colour is
optional hex (`#f59e0b`), previewed live in the form against the same badge the customers table uses, and blank means
the badge's default grey. Deleting a status never touches a customer
(`customers.customer_id_status_id` is `ON DELETE SET NULL`): the confirmation says how many will be left with no
status, and switching one off is the reversible alternative.

`/settings/users` is **administrators only** (`verifyAdminPage()` 404s everyone else), and it is the one screen that
needs no separate page per action: the list shows each account's role, its state — *Locked out* after five failed
attempts, *No password* (`password_hash` NULL cannot sign in), *Must change password* — and when it last signed in,
with **New user**, **Edit** and **Delete** all opening modals over the list. Two things an administrator does here
are deliberately indirect, so nobody locks themselves out: the account you are signed in with cannot be deleted (its
Delete button is disabled and `deleteUser` refuses the id anyway), and the **last** administrator can be neither
demoted nor deleted. A password typed here is always a *temporary* one — it is stored with
`must_change_password = 1` so the account is asked to choose its own at the next sign-in — and issuing it clears any
lockout and bumps `token_version`, which signs that account out everywhere. Leaving the password blank on the create
form is allowed on purpose: the account exists, cannot sign in, and can be given a password later. Deleting a user
never deletes a customer (`customers.assigned_to` is `ON DELETE SET NULL`) and never strips the text out of the audit
trail (the actor links are nulled): only their saved views, comment tags and group memberships cascade away — the
confirmation lists exactly that, from the same counts the row already carries.

### Customer data model

| Table | Purpose |
| --- | --- |
| `customer_id_statuses` | Lookup of customer statuses (17 values, seeded from the Vtiger picklist) |
| `industries` | Lookup of industries (42 values) |
| `quote_types` | Lookup for `quotes.quote_type_id` — **empty until you add your own types** |
| `quotes` | Quotes per customer (`quote_no` unique, `status`, `amount`, `valid_until`, `created_by`/`modified_by`) |
| `customer_addresses` | Addresses per customer (`BILLING` / `DELIVERY` / `SITE`, `is_default`, `county`, `source` = `VTIGER`/`MANUAL`) |
| `documents` | Documents per customer — `storage_type` is `FILE` (path) or `URL` (link), plus optional `document_expiry_date` |
| `customer_activity` | Audit trail: action, entity, field name, old/new value, actor, description |
| `communication_mentions` | Tags on a comment: `contact_id` (a contact of the customer) **or** `user_id` (a colleague), never both — written only by `addCustomerComment`, because MySQL refuses a `CHECK` on a column carrying a foreign-key action and both targets cascade |
| `assignment_groups` | Customer owner groups from Vtiger (`vtiger_group_id`; `is_active = 0` for "Delete" style groups) |
| `assignment_group_members` | Which users belong to a group (`source` = `VTIGER`/`MANUAL`) |
| `customer_deletion_log` | Archive / restore / permanent-delete trail (`ARCHIVED`, `RESTORED`, `PURGED`) with the child counts — no FKs, so it outlives the customer and the actor |

`customers` gained two nullable columns so each customer holds **one status and one industry**:
`customer_id_status_id` → `customer_id_statuses` and `industry_id` → `industries`. Ownership is two more
nullable columns — `assigned_to` → `users` and `assigned_group_id` → `assignment_groups` — with the app
keeping at most one of them set, because Vtiger stores a person *or* a group in a single field.

Every table except the three lookups references `customers` — `ON DELETE CASCADE` for `customer_id`,
`ON DELETE SET NULL` for creator/actor references. Deleting a lookup never breaks a customer (set to
`NULL`), but prefer `is_active = 0` to retire a value.

Tags are stored as data rather than parsed back out of the comment text: the composer keeps the two in step
(deleting an `@Name` token drops its tag, so the hidden fields always match what the comment says), and the
Server Action re-checks that every tagged contact belongs to that customer and every tagged colleague exists
before anything is written.

Status, industry and addresses were backfilled from Vtiger by `npm run db:backfill-vtiger`:
4,650 of 4,656 customers now have a status — including **598 set to `Unknown`**, because their stored
Vtiger value no longer exists in the picklist (it renders as `????` there) — 3,515 have an industry,
and 4,304 addresses were imported (3,832 billing + 472 delivery, all `source = 'VTIGER'`).

Vtiger address parts map as: `bill_street → address`, `bill_pobox → address_line2` (it actually holds a
locality, e.g. "Oadby"), `bill_city → town`, `bill_state → county`, `bill_code → postcode`,
`bill_country → country`. Multi-line streets are flattened to comma-separated text.

Quotes and documents start **empty** — nothing was migrated for them.
Uploaded documents should live in a git-ignored `private/customer-documents/<customer_id>/` folder and
be served through an authenticated route — never from `public/`.

### Database scripts

| Command | Purpose |
| --- | --- |
| `npm run db:migrate-auth` | Idempotently add the auth columns to `users` |
| `npm run db:seed-password -- --email <address> --password <value> [--force]` | Set one user's password |
| `npm run db:seed-password -- --all --password <value>` | Set the same temporary password for every user |
| `node migration_plan.js` | Re-run the Vtiger data migration (users and passwords are preserved) |
| `npm run db:migrate-extras` | Idempotently create the customer extras tables + `customers` columns (reads `scripts/sql/002_customer_extras.sql`) |
| `npm run db:migrate-mentions` | Idempotently create `communication_mentions` — the contacts and colleagues tagged in a comment (reads `scripts/sql/003_communication_mentions.sql`) |
| `npm run db:seed-lookups` | Upsert the customer status, industry and quote-type lookups by `code` — never deletes, never re-enables a value you deactivated |
| `npm run db:backfill-vtiger` | Fill status/industry/addresses/assignment/admins from Vtiger (`--status`, `--industry`, `--addresses`, `--assignment`, `--admins`, `--dry-run`). Re-runnable, and the repair tool to run after `node migration_plan.js` recreates customers |

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
