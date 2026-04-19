SELECT to_regclass('esg.report_schedules') IS NOT NULL;
SELECT has_function_privilege('esg.next_cron_run(text)', 'execute');
SELECT has_function_privilege('esg.enqueue_due_scheduled_reports()', 'execute');
