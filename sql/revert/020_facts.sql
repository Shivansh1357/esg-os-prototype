DROP TRIGGER IF EXISTS trg_facts_audit ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_before_upd ON esg.facts;
DROP TRIGGER IF EXISTS trg_facts_before_ins ON esg.facts;

DROP FUNCTION IF EXISTS esg.facts_audit_trg();
DROP FUNCTION IF EXISTS esg.facts_before_upd_trg();
DROP FUNCTION IF EXISTS esg.facts_before_ins_trg();
DROP FUNCTION IF EXISTS esg.ensure_facts_partition(date);
DROP FUNCTION IF EXISTS esg.q_next(date);
DROP FUNCTION IF EXISTS esg.q_start(date);

DROP TABLE IF EXISTS esg.facts_audit;
DROP TABLE IF EXISTS esg.facts CASCADE;
DROP TYPE IF EXISTS esg.fact_status;


