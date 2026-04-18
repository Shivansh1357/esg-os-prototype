-- 210_notifications.sql
-- Add notification system for pending approvals, compliance gaps, and report readiness.

CREATE TABLE IF NOT EXISTS esg.notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  user_id       uuid,
  type          text NOT NULL CHECK (type IN ('PENDING_APPROVAL','COMPLIANCE_GAP','REPORT_READY','SUPPLIER_RESPONSE','FREEZE_COMPLETE')),
  title         text NOT NULL,
  body          text NOT NULL,
  link          text,
  read          boolean NOT NULL DEFAULT false,
  email_sent    boolean NOT NULL DEFAULT false,
  email_address text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE esg.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='esg' AND tablename='notifications' AND policyname='notif_rls') THEN
    CREATE POLICY notif_rls ON esg.notifications FOR ALL
      USING (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread
  ON esg.notifications (tenant_id, read, created_at DESC)
  WHERE read = false;

-- Function to create approval notifications for all DRAFT facts
CREATE OR REPLACE FUNCTION esg.notify_pending_approvals(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  ctx uuid := app.current_tenant();
  cnt int := 0;
  draft_count int;
BEGIN
  IF ctx IS NULL OR ctx <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT count(*) INTO draft_count
  FROM esg.facts
  WHERE tenant_id = _tenant AND period_start = _pstart AND period_end = _pend AND status = 'DRAFT';

  IF draft_count > 0 THEN
    INSERT INTO esg.notifications (tenant_id, type, title, body, link)
    VALUES (
      _tenant,
      'PENDING_APPROVAL',
      format('%s facts pending approval', draft_count),
      format('There are %s draft facts for period %s to %s that need review and approval before the report can be frozen.', draft_count, _pstart, _pend),
      format('/data?periodStart=%s&periodEnd=%s&status=DRAFT', _pstart, _pend)
    );
    cnt := cnt + 1;
  END IF;

  RETURN cnt;
END $$;

-- Function to create compliance gap notifications
CREATE OR REPLACE FUNCTION esg.notify_compliance_gaps(
  _tenant uuid,
  _pstart date,
  _pend date
) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  ctx uuid := app.current_tenant();
  fail_count int;
BEGIN
  IF ctx IS NULL OR ctx <> _tenant THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '28000';
  END IF;

  SELECT count(*) INTO fail_count
  FROM esg.compliance_findings
  WHERE tenant_id = _tenant AND period_start = _pstart AND period_end = _pend AND status = 'FAIL';

  IF fail_count > 0 THEN
    INSERT INTO esg.notifications (tenant_id, type, title, body, link)
    VALUES (
      _tenant,
      'COMPLIANCE_GAP',
      format('%s compliance gaps remaining', fail_count),
      format('There are %s FAIL findings for period %s to %s. Attach evidence or resolve gaps to improve completeness.', fail_count, _pstart, _pend),
      format('/compliance?periodStart=%s&periodEnd=%s', _pstart, _pend)
    );
    RETURN 1;
  END IF;

  RETURN 0;
END $$;
