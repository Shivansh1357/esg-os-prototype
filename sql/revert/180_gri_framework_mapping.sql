DELETE FROM esg.framework_crossmap WHERE target_framework = 'GRI_2021' OR source_framework = 'GRI_2021';
DELETE FROM esg.compliance_rules WHERE framework = 'GRI_2021';
DROP TABLE IF EXISTS esg.framework_crossmap;
