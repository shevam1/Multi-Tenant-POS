-- Row-Level Security policies for OmniPOS multi-tenancy.
--
-- Strategy:
--   * Every tenant-scoped table FORCEs RLS (applies even to the table owner).
--   * The app runtime sets `app.current_tenant` per request (transaction-local)
--     and can only ever see rows for that tenant.
--   * Trusted scripts (migrations, seed, admin maintenance) set
--     `app.bypass_rls = 'on'` to operate across tenants. The app never sets it.
--
-- `current_setting(name, true)` returns NULL instead of erroring when unset,
-- so an unscoped connection sees nothing (fail-closed).
--
-- Re-runnable: drops and recreates the policy on each table.

DO $$
DECLARE
  -- All tenant-scoped tables keyed by their tenant column.
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('tenant',                 'id'),
      ('store',                  'tenantId'),
      ('app_user',               'tenantId'),
      ('audit_log',              'tenantId'),
      ('customer',               'tenantId'),
      ('pet',                    'tenantId'),
      ('vaccination_record',     'tenantId'),
      ('communication_consent',  'tenantId'),
      ('catalog_item',           'tenantId'),
      ('pricing_rule',           'tenantId'),
      ('booking',                'tenantId'),
      ('booking_line_item',      'tenantId'),
      ('workflow_event',         'tenantId'),
      ('consent_submission',     'tenantId'),
      ('invoice',                'tenantId'),
      ('invoice_line',           'tenantId'),
      ('invoice_tax_line',       'tenantId'),
      ('payment',                'tenantId'),
      ('inventory_item',         'tenantId'),
      ('shift_schedule',         'tenantId'),
      ('timeclock_entry',        'tenantId'),
      ('leave_request',          'tenantId'),
      ('form_template',          'tenantId'),
      ('membership_plan',        'tenantId'),
      ('membership',             'tenantId'),
      ('loyalty_transaction',    'tenantId'),
      ('customer_note',          'tenantId'),
      ('catalog_item_store',     'tenantId'),
      ('coupon',                 'tenantId'),
      ('booking_groomer',        'tenantId'),
      ('booking_pet',            'tenantId'),
      ('booking_photo',          'tenantId'),
      ('message_thread',         'tenantId'),
      ('message',                'tenantId'),
      ('automation_rule',        'tenantId'),
      ('reminder_log',           'tenantId'),
      ('supplier',               'tenantId'),
      ('product_category',       'tenantId'),
      ('product',                'tenantId'),
      ('expense',                'tenantId'),
      ('message_template',       'tenantId'),
      ('tenant_settings',        'tenantId'),
      ('store_hours',            'tenantId')
    ) AS v(table_name, tenant_col)
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t.table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING (current_setting(''app.bypass_rls'', true) = ''on'' '
      || '       OR %I = current_setting(''app.current_tenant'', true)) '
      || 'WITH CHECK (current_setting(''app.bypass_rls'', true) = ''on'' '
      || '       OR %I = current_setting(''app.current_tenant'', true));',
      t.table_name, t.tenant_col, t.tenant_col
    );
  END LOOP;
END $$;
