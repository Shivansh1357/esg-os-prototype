DROP FUNCTION IF EXISTS esg.suppliers_category_rollup(uuid,date,date);
DROP FUNCTION IF EXISTS esg.suppliers_coverage(uuid,date,date);

DROP TRIGGER IF EXISTS trg_suppliers_touch ON esg.suppliers;
DROP FUNCTION IF EXISTS esg.touch_updated_at();

DROP TABLE IF EXISTS esg.supplier_responses;
DROP TABLE IF EXISTS esg.supplier_invites;
DROP TABLE IF EXISTS esg.suppliers;

DROP TYPE IF EXISTS esg.response_status;
DROP TYPE IF EXISTS esg.supplier_status;


