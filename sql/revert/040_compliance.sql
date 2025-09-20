DROP FUNCTION IF EXISTS esg.evaluate_brsr(uuid,date,date);
DROP FUNCTION IF EXISTS esg.findings_before_upd_trg();
DROP FUNCTION IF EXISTS esg.validate_evidence_url(text);

DROP TABLE IF EXISTS esg.compliance_findings;
DROP TABLE IF EXISTS esg.compliance_rules;
DROP TABLE IF EXISTS app.allowed_evidence_prefixes;
DROP TYPE  IF EXISTS esg.finding_status;


