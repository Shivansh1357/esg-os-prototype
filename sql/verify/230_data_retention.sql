SELECT to_regclass('esg.retention_policies') IS NOT NULL;
SELECT has_function_privilege('esg.apply_retention_policies(uuid)', 'execute');
