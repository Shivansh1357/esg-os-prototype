-- 220_scheduled_reports.sql
-- Scheduled report generation: schedules table, RLS, enqueue function.

-- ============================================================
-- Table: esg.report_schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS esg.report_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES esg.tenants(id) ON DELETE CASCADE,
  report_id       uuid NOT NULL REFERENCES esg.reports(id) ON DELETE CASCADE,
  cron_expression text NOT NULL,
  format          text NOT NULL CHECK (format IN ('pdf', 'xlsx', 'brsr')),
  active          boolean NOT NULL DEFAULT true,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_report_schedule UNIQUE (tenant_id, report_id, format)
);

ALTER TABLE esg.report_schedules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'esg'
       AND tablename  = 'report_schedules'
       AND policyname = 'report_schedules_rls'
  ) THEN
    CREATE POLICY report_schedules_rls ON esg.report_schedules FOR ALL
      USING  (tenant_id = app.current_tenant())
      WITH CHECK (tenant_id = app.current_tenant());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_report_schedules_active_next
  ON esg.report_schedules (next_run_at ASC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_report_schedules_tenant
  ON esg.report_schedules (tenant_id);

-- ============================================================
-- Function: esg.next_cron_run(cron_expression text)
--   Lightweight cron-to-next-timestamp helper.
--   Supports common patterns: daily, weekly, monthly.
--   Falls back to +24h for unrecognised expressions.
-- ============================================================
CREATE OR REPLACE FUNCTION esg.next_cron_run(
  _cron text
) RETURNS timestamptz
LANGUAGE plpgsql STABLE AS $$
DECLARE
  parts text[];
  minute_part text;
  hour_part text;
  dom_part text;
  dow_part text;
  base timestamptz := date_trunc('minute', now());
  candidate timestamptz;
BEGIN
  parts := string_to_array(trim(_cron), ' ');

  -- Require 5-field cron
  IF array_length(parts, 1) IS DISTINCT FROM 5 THEN
    RETURN base + interval '24 hours';
  END IF;

  minute_part := parts[1];
  hour_part   := parts[2];
  dom_part    := parts[3];
  dow_part    := parts[5];

  -- Build next candidate from hour + minute (daily baseline)
  IF hour_part ~ '^\d+$' AND minute_part ~ '^\d+$' THEN
    candidate := date_trunc('day', base)
                 + (hour_part::int * interval '1 hour')
                 + (minute_part::int * interval '1 minute');
    -- If the candidate has already passed today, jump to tomorrow
    IF candidate <= base THEN
      candidate := candidate + interval '1 day';
    END IF;
  ELSE
    -- Fallback for complex expressions
    RETURN base + interval '24 hours';
  END IF;

  -- Day-of-week constraint (0=Sun, 1=Mon, ...)
  IF dow_part ~ '^\d+$' THEN
    WHILE extract(dow FROM candidate)::int <> dow_part::int LOOP
      candidate := candidate + interval '1 day';
    END LOOP;
  END IF;

  -- Day-of-month constraint
  IF dom_part ~ '^\d+$' THEN
    -- Jump to next occurrence of that day
    candidate := date_trunc('day', candidate)
                 + (hour_part::int * interval '1 hour')
                 + (minute_part::int * interval '1 minute');
    -- Move to the correct day-of-month
    IF extract(day FROM candidate)::int <> dom_part::int THEN
      candidate := date_trunc('month', candidate)
                   + ((dom_part::int - 1) * interval '1 day')
                   + (hour_part::int * interval '1 hour')
                   + (minute_part::int * interval '1 minute');
      IF candidate <= base THEN
        candidate := (date_trunc('month', candidate) + interval '1 month')
                     + ((dom_part::int - 1) * interval '1 day')
                     + (hour_part::int * interval '1 hour')
                     + (minute_part::int * interval '1 minute');
      END IF;
    END IF;
  END IF;

  RETURN candidate;
END $$;

-- ============================================================
-- Function: esg.enqueue_due_scheduled_reports()
--   Called periodically (e.g., by a cron Graphile Worker job)
--   to find schedules that are due and enqueue report.scheduled tasks.
--   Returns the number of jobs enqueued.
-- ============================================================
CREATE OR REPLACE FUNCTION esg.enqueue_due_scheduled_reports()
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  rec record;
  cnt int := 0;
  job_key text;
BEGIN
  FOR rec IN
    SELECT rs.id, rs.tenant_id, rs.report_id, rs.format, rs.cron_expression
      FROM esg.report_schedules rs
     WHERE rs.active = true
       AND (rs.next_run_at IS NULL OR rs.next_run_at <= now())
     ORDER BY rs.next_run_at ASC NULLS FIRST
     FOR UPDATE SKIP LOCKED
  LOOP
    job_key := rec.tenant_id || ':' || rec.report_id || ':' || rec.format;

    -- Enqueue into Graphile Worker
    PERFORM graphile_worker.add_job(
      'report.scheduled',
      json_build_object(
        'tenantId',   rec.tenant_id,
        'reportId',   rec.report_id,
        'format',     rec.format,
        'scheduleId', rec.id
      )::text::json,
      queue_name   => 'reports',
      max_attempts => 3,
      job_key      => job_key,
      job_key_mode => 'preserve_run_at'
    );

    -- Optimistically set next_run_at so we don't double-enqueue
    UPDATE esg.report_schedules
       SET next_run_at = esg.next_cron_run(rec.cron_expression),
           updated_at  = now()
     WHERE id = rec.id;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END $$;

-- ============================================================
-- Set initial next_run_at on INSERT if not provided
-- ============================================================
CREATE OR REPLACE FUNCTION esg.report_schedules_set_next_run()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.next_run_at IS NULL AND NEW.active THEN
    NEW.next_run_at := esg.next_cron_run(NEW.cron_expression);
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_report_schedules_before_upsert ON esg.report_schedules;
CREATE TRIGGER trg_report_schedules_before_upsert
  BEFORE INSERT OR UPDATE ON esg.report_schedules
  FOR EACH ROW EXECUTE FUNCTION esg.report_schedules_set_next_run();
