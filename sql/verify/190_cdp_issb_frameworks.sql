SELECT 1 FROM esg.compliance_rules WHERE code = 'CDP-C6.1' AND framework = 'CDP_CLIMATE';
SELECT 1 FROM esg.compliance_rules WHERE code = 'ISSB-S2-1' AND framework = 'ISSB_2023';
SELECT 1 FROM esg.framework_crossmap WHERE source_framework = 'CDP_CLIMATE' AND target_framework = 'ISSB_2023';
