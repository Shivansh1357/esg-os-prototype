-- Verify BRSR NGRBC principles migration
SELECT 1 FROM esg.compliance_rules WHERE code = 'BRSR-P1-01' AND principle = 'P1';
SELECT 1 FROM esg.compliance_rules WHERE code = 'BRSR-P9-02' AND principle = 'P9';
SELECT 1 FROM esg.brsr_core_kpis WHERE kpi_code = 'BRSR-KPI-1';
SELECT 1 FROM esg.metrics WHERE code = 'WATER_KL';
