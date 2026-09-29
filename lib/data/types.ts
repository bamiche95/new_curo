/**
 * Shared shapes for the read-only data layer (no server-only imports here, so the
 * types can be used from anywhere).
 */

export type PagedResult<TRow> = {
  rows: TRow[];
  total: number;
  page: number;
  pageCount: number;
};

/** A tag on a comment: a contact of the customer, or a colleague (a signed-in user). */
export type MentionRef = {
  kind: 'contact' | 'user';
  id: string;
  name: string;
};

export type CommunicationListItem = {
  id: string;
  content: string;
  communication_type: string;
  created_at: Date;
  customer_id: string;
  customer_name: string;
  account_no: string;
  author_name: string | null;
  /** Who wrote it — the only person who may delete it (null for unowned imports). */
  author_id: string | null;
  /** Who was tagged in this comment (empty for the rows imported from Vtiger). */
  mentions: MentionRef[];
};

export type CustomerListItem = {
  id: string;
  account_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  communication_count: number;
  status_id: string | null;
  status_name: string | null;
  status_colour: string | null;
  industry_id: string | null;
  industry_name: string | null;
};

export type CustomerDetail = {
  id: string;
  account_no: string;
  name: string;
  email: string | null;
  phone: string | null;
  vtiger_account_id: number | null;
  status_id: string | null;
  status_name: string | null;
  status_colour: string | null;
  industry_id: string | null;
  industry_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_group_id: string | null;
  assigned_group_name: string | null;
  /** Set while the customer is archived (soft deleted) and pending a decision. */
  deleted_at: Date | null;
  deleted_by: string | null;
  /** The customer's primary address row (the one the address fields come from). */
  address_id: string | null;
  address: string | null;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
};

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export type AddressRow = {
  id: string;
  address_type: string;
  address: string;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  is_default: number;
  source: string;
};

export type DocumentRow = {
  id: string;
  title: string | null;
  document_path: string;
  storage_type: string;
  document_type: string | null;
  mime_type: string | null;
  file_size: number | null;
  document_expiry_date: Date | null;
  created_at: Date;
};

export type QuoteRow = {
  id: string;
  quote_no: string | null;
  quote_name: string;
  quote_date: Date;
  valid_until: Date | null;
  status: string;
  amount: string | null;
  currency: string;
  notes: string | null;
  quote_type_name: string | null;
  created_by_name: string | null;
};

export type ActivityRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  actor_name: string | null;
  created_at: Date;
};

export type LookupOption = {
  id: string;
  name: string;
  colour: string | null;
  customer_count: number;
  /** Set for the mixed people/groups list that fills the Assigned to picklist. */
  kind?: 'user' | 'group';
};

/**
 * One row of the industry lookup, plus how many live customers point at it.
 * Archived customers are not counted: they are pending a decision, and a delete
 * only unlinks the customers still in the book.
 */
export type IndustryRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: number;
  created_at: Date;
  /** How many customers a delete would leave with no industry. */
  customer_count: number;
};

/**
 * One row of the customer status lookup, plus how many live customers hold it.
 * Archived customers are not counted: a delete only unlinks the customers still
 * in the book.
 */
export type CustomerStatusRow = {
  id: string;
  code: string;
  name: string;
  /** CSS hex colour, or null for the badge's default grey. */
  colour: string | null;
  sort_order: number;
  is_active: number;
  created_at: Date;
  /** How many customers a delete would leave without a status. */
  customer_count: number;
};

/**
 * One row of the users screen, plus what deleting it would leave behind. The
 * counts come from the same foreign keys the delete triggers: the cascading ones
 * (saved views, comment tags, group memberships) are removed outright, and
 * `customers.assigned_to` is nulled — so a delete never destroys a customer.
 */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  is_admin: number;
  must_change_password: number;
  /** True once a password has been set; a NULL hash means the account cannot sign in. */
  has_password: number;
  /** Set while the account is locked out after repeated failed sign-ins. */
  locked_until: Date | null;
  /** Resolved in SQL (`locked_until > NOW()`) so the server and the browser agree. */
  is_locked: number;
  last_login_at: Date | null;
  password_changed_at: Date | null;
  vtiger_user_id: number | null;
  /** Customers they own: a delete leaves those customers unassigned. */
  customers_owned: number;
  /** Fields below are destroyed by a delete (ON DELETE CASCADE). */
  saved_views: number;
  comment_tags: number;
  group_memberships: number;
};

/** One row of the administrator-only Archived customers review screen. */
export type ArchivedCustomerRow = {
  id: string;
  name: string;
  account_no: string;
  deleted_at: Date;
  deleted_by_name: string | null;
  /** What a permanent delete would take with it. */
  contacts: number;
  communications: number;
  addresses: number;
  quotes: number;
  documents: number;
};

/** A permanent deletion, read back from `customer_deletion_log`. */
export type PurgedCustomerRow = {
  id: string;
  name: string;
  account_no: string | null;
  actor_name: string | null;
  created_at: Date;
  contacts: number;
  communications: number;
  addresses: number;
  quotes: number;
  documents: number;
};

/** One row of the flexible customer data table (every column the registry can show). */
export type CustomerTableRow = {
  id: string;
  name: string;
  account_no: string;
  status_id: string | null;
  status_name: string | null;
  status_colour: string | null;
  industry_id: string | null;
  industry_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_group_id: string | null;
  assigned_group_name: string | null;
  address: string | null;
  address_line2: string | null;
  town: string | null;
  city: string | null;
  county: string | null;
  postcode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  communications: number;
  vtiger: number | null;
};

/** A saved table view, already parsed out of its JSON columns. */
export type SavedViewRow = {
  id: string;
  name: string;
  is_default: number;
  page_size: number;
  columns: string[];
  filters: Record<string, string[]>;
  ranges: Record<string, { min?: number; max?: number }>;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  updated_at: Date;
};


/** One row of the flexible contacts data table (every column the registry can show). */
export type ContactTableRow = {
  id: string;
  first_name: string | null;
  last_name: string;
  email: string | null;
  phone: string | null;
  /** The customer this contact is attached to. */
  customer_id: string;
  customer_name: string;
  customer_account_no: string;
  vtiger: number | null;
};

/** A contact on its own record page (the same fields as a table row). */
export type ContactDetail = ContactTableRow;

/** One choice in the "attach to customer" picker. */
export type ContactOption = {
  id: string;
  name: string;
  account_no: string;
};

export type CustomerFilters = {
  search?: string;
  /** A customer_id_statuses id, or the literal `none` for "no status set". */
  statusId?: string;
  industryId?: string;
};
