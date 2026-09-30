import mysql from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';

const vtigerConfig = {
  host: process.env.VTIGER_DB_HOST || '',
  user: process.env.VTIGER_DB_USER || '',
  password: process.env.VTIGER_DB_PASSWORD || '',
  database: process.env.VTIGER_DB_NAME || '',
  port: 3307,
};

const newDbConfig = {
  host: process.env.NEW_DB_HOST || '',
  user: process.env.NEW_DB_USER || '',
  password: process.env.NEW_DB_PASSWORD || '',
  database: process.env.NEW_DB_NAME || '',
  port: 3307,
};

async function masterMigrationPipeline() {
  console.log('🚀 Starting Automated Master Migration Pipeline...');
  
  let vtigerConn;
  let newDbConn;

  try {
    vtigerConn = await mysql.createConnection(vtigerConfig);
    newDbConn = await mysql.createConnection(newDbConfig);
    console.log('✅ Connected to both databases.');
// Optional: Clean slate before migration
    await newDbConn.query('SET FOREIGN_KEY_CHECKS = 0;');
    await newDbConn.query('TRUNCATE TABLE communications;');
    await newDbConn.query('TRUNCATE TABLE contacts;');
    await newDbConn.query('TRUNCATE TABLE customers;');
    // NOTE: `users` is intentionally NOT truncated anymore. It now stores
    // password_hash + login activity (added by scripts/migrate-auth.mjs), and rows are
    // upserted below keyed on the unique `vtiger_user_id`, so credentials survive a re-run.
    await newDbConn.query('SET FOREIGN_KEY_CHECKS = 1;');
    console.log('🧹 Cleaned communications/contacts/customers (users preserved).');
    // ==========================================
    // STEP 1: MIGRATE USERS / STAFF
    // ==========================================
    console.log('\n--- Step 1: Migrating Users ---');
    // Fetch ALL users (including inactive ones who authored comments historically)
    const [vtigerUsers] = await vtigerConn.query(`
      SELECT id, user_name, email1 FROM vtiger_users
    `);
    console.log(`📥 Found ${vtigerUsers.length} total Vtiger users.`);

    const userInsertRows = [];
    const seenEmails = new Set();

    for (const u of vtigerUsers) {
      const userUuid = uuidv4();
      
      // Deduplicate emails to prevent constraint conflicts on users table
      let email = u.email1 && u.email1.trim() !== '' ? u.email1.trim().toLowerCase() : `${u.user_name}@internal.local`;
      if (seenEmails.has(email)) {
        email = `${u.user_name}_${u.id}@internal.local`;
      }
      seenEmails.add(email);

      userInsertRows.push([userUuid, u.user_name, email, u.id]);
    }

    if (userInsertRows.length > 0) {
      // Only `name` is refreshed on conflict. `password_hash`, `token_version` and the
      // login counters are left untouched so existing credentials keep working.
      await newDbConn.query(`
        INSERT INTO users (id, name, email, vtiger_user_id) 
        VALUES ? 
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [userInsertRows]);
    }

    // Populate userMap directly from the database table to guarantee Foreign Key validity
    const [dbUsers] = await newDbConn.query(`SELECT id, vtiger_user_id FROM users WHERE vtiger_user_id IS NOT NULL`);
    const userMap = new Map(dbUsers.map(u => [String(u.vtiger_user_id), u.id]));
    console.log(`💾 Successfully verified ${userMap.size} migrated users in destination database.`);

    // ==========================================
    // STEP 2: MIGRATE CUSTOMERS (ACCOUNTS)
    // ==========================================
    console.log('\n--- Step 2: Migrating Customers ---');
    const [vtigerAccounts] = await vtigerConn.query(`
      SELECT acc.accountid, acc.account_no, acc.accountname, acc.email1, acc.phone 
      FROM vtiger_account acc
      INNER JOIN vtiger_crmentity ent ON acc.accountid = ent.crmid
      WHERE ent.deleted = 0
    `);
    console.log(`📥 Found ${vtigerAccounts.length} customers to migrate.`);

    const customerInsertRows = [];
    for (const acc of vtigerAccounts) {
      const customerUuid = uuidv4();
      customerInsertRows.push([
        customerUuid, 
        acc.account_no, 
        acc.accountname || 'Unnamed Account', 
        acc.email1 || null, 
        acc.phone || null, 
        acc.accountid
      ]);
    }

    const batchSize = 1000;
    for (let i = 0; i < customerInsertRows.length; i += batchSize) {
      const batch = customerInsertRows.slice(i, i + batchSize);
      await newDbConn.query(`
        INSERT INTO customers (id, account_no, name, email, phone, vtiger_account_id) 
        VALUES ? 
        ON DUPLICATE KEY UPDATE name = VALUES(name)
      `, [batch]);
    }

    // Populate customerMap directly from DB
    const [dbCustomers] = await newDbConn.query(`SELECT id, vtiger_account_id FROM customers WHERE vtiger_account_id IS NOT NULL`);
    const customerMap = new Map(dbCustomers.map(c => [String(c.vtiger_account_id), c.id]));
    console.log(`💾 Verified ${customerMap.size} customers in destination database.`);

    // ==========================================
    // STEP 2b: MIGRATE CONTACTS & MAP TO CUSTOMERS
    // ==========================================
    console.log('\n--- Step 2b: Migrating Contacts & Mapping to Customers ---');
    const [vtigerContacts] = await vtigerConn.query(`
      SELECT con.contactid, con.accountid, con.firstname, con.lastname, con.email, con.phone
      FROM vtiger_contactdetails con
      INNER JOIN vtiger_crmentity ent ON con.contactid = ent.crmid
      WHERE ent.deleted = 0 AND con.accountid IS NOT NULL AND con.accountid != 0
    `);
    console.log(`📥 Found ${vtigerContacts.length} linked contacts to migrate.`);

    const contactToCustomerMap = new Map(); // { String(vtiger_contact_id): new_customer_uuid }
    const contactNamesMap = new Map();      // { String(vtiger_contact_id): "First Last" }
    const contactInsertRows = [];

    for (const con of vtigerContacts) {
      const parentCustomerUuid = customerMap.get(String(con.accountid));
      if (!parentCustomerUuid) continue;

      const contactUuid = uuidv4();
      const contactIdStr = String(con.contactid);

      contactToCustomerMap.set(contactIdStr, parentCustomerUuid);
      contactNamesMap.set(contactIdStr, `${con.firstname || ''} ${con.lastname}`.trim());

      contactInsertRows.push([
        contactUuid,
        parentCustomerUuid,
        con.firstname || null,
        con.lastname,
        con.email || null,
        con.phone || null,
        con.contactid
      ]);
    }

    for (let i = 0; i < contactInsertRows.length; i += batchSize) {
      const batch = contactInsertRows.slice(i, i + batchSize);
      await newDbConn.query(`
        INSERT INTO contacts (id, customer_id, first_name, last_name, email, phone, vtiger_contact_id) 
        VALUES ? 
        ON DUPLICATE KEY UPDATE first_name = VALUES(first_name)
      `, [batch]);
    }
    console.log(`💾 Migrated ${contactInsertRows.length} contacts.`);

    // ==========================================
    // STEP 3: MIGRATE RELEVANT TIMELINE ENTRIES
    // ==========================================
    console.log('\n--- Step 3: Migrating Unified History (including Contact Rollups) ---');

    const unifiedVtigerQuery = `
      -- 1. Account Comments
      SELECT 
          acc.accountid AS parent_record_id,
          'ACCOUNT' AS parent_module,
          'COMMENT' AS communication_type,
          mc.modcommentsid AS original_source_id,
          mc.commentcontent AS comment_text,
          comm_entity.createdtime AS created_at,
          comm_entity.smownerid AS author_id
      FROM vtiger_account acc
      INNER JOIN vtiger_crmentity acc_entity ON acc.accountid = acc_entity.crmid AND acc_entity.deleted = 0
      INNER JOIN vtiger_modcomments mc ON mc.related_to = acc.accountid
      INNER JOIN vtiger_crmentity comm_entity ON mc.modcommentsid = comm_entity.crmid AND comm_entity.deleted = 0

      UNION ALL

      -- 2. Contact Comments
      SELECT 
          con.contactid AS parent_record_id,
          'CONTACT' AS parent_module,
          'COMMENT' AS communication_type,
          mc.modcommentsid AS original_source_id,
          mc.commentcontent AS comment_text,
          comm_entity.createdtime AS created_at,
          comm_entity.smownerid AS author_id
      FROM vtiger_contactdetails con
      INNER JOIN vtiger_crmentity con_entity ON con.contactid = con_entity.crmid AND con_entity.deleted = 0
      INNER JOIN vtiger_modcomments mc ON mc.related_to = con.contactid
      INNER JOIN vtiger_crmentity comm_entity ON mc.modcommentsid = comm_entity.crmid AND comm_entity.deleted = 0

      UNION ALL

      -- 3. Account Mentions
      SELECT 
          acc.accountid AS parent_record_id,
          'ACCOUNT' AS parent_module,
          'MENTION' AS communication_type,
          m.id AS original_source_id,
          m.context AS comment_text,
          m.commenttime AS created_at,
          m.commentedby AS author_id
      FROM asmb_mention_detail m
      INNER JOIN vtiger_modcomments mc ON m.commentid = mc.modcommentsid
      INNER JOIN vtiger_account acc ON mc.related_to = acc.accountid
      INNER JOIN vtiger_crmentity acc_entity ON acc.accountid = acc_entity.crmid AND acc_entity.deleted = 0
      WHERE m.deleted = 0

      UNION ALL

      -- 4. Contact Mentions
      SELECT 
          con.contactid AS parent_record_id,
          'CONTACT' AS parent_module,
          'MENTION' AS communication_type,
          m.id AS original_source_id,
          m.context AS comment_text,
          m.commenttime AS created_at,
          m.commentedby AS author_id
      FROM asmb_mention_detail m
      INNER JOIN vtiger_modcomments mc ON m.commentid = mc.modcommentsid
      INNER JOIN vtiger_contactdetails con ON mc.related_to = con.contactid
      INNER JOIN vtiger_crmentity con_entity ON mc.modcommentsid = con_entity.crmid AND con_entity.deleted = 0
      WHERE m.deleted = 0

      ORDER BY created_at DESC;
    `;

    const [legacyRecords] = await vtigerConn.query(unifiedVtigerQuery);
    console.log(`📥 Found ${legacyRecords.length} historical communications to process.`);

    const communicationInsertRows = [];
    let skippedCount = 0;
for (const record of legacyRecords) {
      let targetCustomerUuid = null;
      let finalCommentText = record.comment_text || '[No Content]';

      const parentIdStr = String(record.parent_record_id);

      if (record.parent_module === 'ACCOUNT' || record.parent_module === 'Accounts') {
        targetCustomerUuid = customerMap.get(parentIdStr);
      } else if (record.parent_module === 'CONTACT' || record.parent_module === 'Contacts') {
        targetCustomerUuid = contactToCustomerMap.get(parentIdStr);
        
        const contactName = contactNamesMap.get(parentIdStr) || 'Unknown Contact';
        finalCommentText = `[Contact: ${contactName}] ${finalCommentText}`;
      }

      if (!targetCustomerUuid) {
        skippedCount++;
        continue;
      }

      // Safely map author ID
      const authorIdStr = record.author_id ? String(record.author_id) : null;
      const newAuthorId = (authorIdStr && userMap.has(authorIdStr)) ? userMap.get(authorIdStr) : null;
      const type = record.communication_type;

      // Ensure zero / missing IDs strictly resolve to JavaScript null
      const rawCommentId = type === 'COMMENT' ? record.original_source_id : null;
      const rawMentionId = type === 'MENTION' ? record.original_source_id : null;

      const vtigerCommentId = (rawCommentId && Number(rawCommentId) !== 0) ? Number(rawCommentId) : null;
      const vtigerMentionId = (rawMentionId && Number(rawMentionId) !== 0) ? Number(rawMentionId) : null;

      communicationInsertRows.push([
        uuidv4(),
        targetCustomerUuid,
        newAuthorId,
        finalCommentText,
        type,
        record.created_at ? new Date(record.created_at) : new Date(),
        vtigerCommentId,
        vtigerMentionId
      ]);
    }

    console.log(`⚠️ Skipped ${skippedCount} items due to deleted/unlinked parent structures.`);

    let insertedComms = 0;
    for (let i = 0; i < communicationInsertRows.length; i += batchSize) {
      const batch = communicationInsertRows.slice(i, i + batchSize);
      if (batch.length === 0) continue;

      const [result] = await newDbConn.query(`
        INSERT INTO communications 
        (id, customer_id, author_id, content, communication_type, created_at, vtiger_comment_id, vtiger_mention_id) 
        VALUES ?
      `, [batch]);

      insertedComms += result.affectedRows;
    }

    console.log(`💾 Successfully migrated ${insertedComms} comments/mentions (including Contact-specific entries).`);
    console.log('\n🎉 ENTIRE CRM HISTORICAL PIPELINE FULLY MIGRATED! 🎉');

  } catch (err) {
    console.error('❌ Pipeline failed:', err);
  } finally {
    if (vtigerConn) await vtigerConn.end();
    if (newDbConn) await newDbConn.end();
  }
}

masterMigrationPipeline();
