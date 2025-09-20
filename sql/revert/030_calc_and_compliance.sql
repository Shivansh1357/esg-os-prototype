DROP FUNCTION IF EXISTS esg.totals_before_upd_trg();
DROP FUNCTION IF EXISTS esg.recalc_emissions(uuid,uuid,date,date,uuid);
DROP FUNCTION IF EXISTS esg.calc_lock_keys(uuid,uuid,date,date);

DROP TABLE IF EXISTS esg.tenant_defaults;
DROP TABLE IF EXISTS esg.emission_totals;
DROP TABLE IF EXISTS esg.emission_factors;
DROP TABLE IF EXISTS esg.factor_sets;


