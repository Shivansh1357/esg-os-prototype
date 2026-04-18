DELETE FROM esg.framework_crossmap WHERE source_framework IN ('CDP_CLIMATE','ISSB_2023') OR target_framework IN ('CDP_CLIMATE','ISSB_2023');
DELETE FROM esg.compliance_rules WHERE framework IN ('CDP_CLIMATE','ISSB_2023');
