DROP TRIGGER IF EXISTS trg_report_schedules_before_upsert ON esg.report_schedules;
DROP FUNCTION IF EXISTS esg.report_schedules_set_next_run();
DROP FUNCTION IF EXISTS esg.enqueue_due_scheduled_reports();
DROP FUNCTION IF EXISTS esg.next_cron_run(text);
DROP TABLE IF EXISTS esg.report_schedules;
