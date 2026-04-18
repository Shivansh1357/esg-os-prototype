-- 180_gri_framework_mapping.sql
-- Add GRI Universal Standards 2021 framework mapping alongside BRSR.
-- Enables cross-framework compliance tracking and disclosure mapping.

-- Step 1: Framework cross-mapping table
CREATE TABLE IF NOT EXISTS esg.framework_crossmap (
  id           serial PRIMARY KEY,
  source_framework text NOT NULL,
  source_code      text NOT NULL,
  target_framework text NOT NULL,
  target_code      text NOT NULL,
  coverage         text NOT NULL CHECK (coverage IN ('full', 'partial', 'related')),
  notes            text,
  UNIQUE (source_framework, source_code, target_framework, target_code)
);

COMMENT ON TABLE esg.framework_crossmap IS 'Maps disclosures across frameworks (e.g., BRSR P6 → GRI 305)';

-- Step 2: Add GRI compliance rules (key GRI Universal Standards 2021)
DO $seed$
DECLARE
  gri_rules jsonb := jsonb_build_array(
    -- GRI 2: General Disclosures
    jsonb_build_object(
      'code','GRI-2-1','title','Organizational details','category','General',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-2',
      'brsr_section','GRI 2-1','description','Legal name, ownership, HQ location, countries of operation',
      'metric_code',null,'requires_evidence',true
    ),
    jsonb_build_object(
      'code','GRI-2-7','title','Employees reported','category','Social',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-2',
      'brsr_section','GRI 2-7','description','Total number of employees by contract type and gender',
      'metric_code','EMPLOYEE_COUNT','requires_evidence',false
    ),
    jsonb_build_object(
      'code','GRI-2-27','title','Compliance with laws and regulations','category','Governance',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-2',
      'brsr_section','GRI 2-27','description','Instances of non-compliance with laws and regulations',
      'metric_code',null,'requires_evidence',true
    ),

    -- GRI 302: Energy
    jsonb_build_object(
      'code','GRI-302-1','title','Energy consumption within the organization','category','Environment',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-302',
      'brsr_section','GRI 302-1','description','Total fuel and electricity consumption in joules or multiples',
      'metric_code','ELEC_KWH','requires_evidence',false
    ),
    jsonb_build_object(
      'code','GRI-302-3','title','Energy intensity','category','Environment',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-302',
      'brsr_section','GRI 302-3','description','Energy intensity ratio for the organization',
      'metric_code','ENERGY_INTENSITY','requires_evidence',false
    ),

    -- GRI 303: Water and Effluents
    jsonb_build_object(
      'code','GRI-303-3','title','Water withdrawal','category','Environment',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-303',
      'brsr_section','GRI 303-3','description','Total water withdrawal by source',
      'metric_code','WATER_KL','requires_evidence',false
    ),

    -- GRI 305: Emissions
    jsonb_build_object(
      'code','GRI-305-1','title','Direct (Scope 1) GHG emissions','category','Environment',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-305',
      'brsr_section','GRI 305-1','description','Gross direct GHG emissions in metric tons CO2 equivalent',
      'metric_code','FUEL_KG','requires_evidence',false
    ),
    jsonb_build_object(
      'code','GRI-305-2','title','Energy indirect (Scope 2) GHG emissions','category','Environment',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-305',
      'brsr_section','GRI 305-2','description','Gross location-based and market-based Scope 2 emissions',
      'metric_code','ELEC_KWH','requires_evidence',false
    ),
    jsonb_build_object(
      'code','GRI-305-3','title','Other indirect (Scope 3) GHG emissions','category','Environment',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-305',
      'brsr_section','GRI 305-3','description','Gross Scope 3 emissions by category',
      'metric_code',null,'requires_evidence',false
    ),

    -- GRI 306: Waste
    jsonb_build_object(
      'code','GRI-306-3','title','Waste generated','category','Environment',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-306',
      'brsr_section','GRI 306-3','description','Total weight of waste generated and composition',
      'metric_code','WASTE_MT','requires_evidence',false
    ),
    jsonb_build_object(
      'code','GRI-306-4','title','Waste diverted from disposal','category','Environment',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-306',
      'brsr_section','GRI 306-4','description','Total weight of waste diverted and breakdown by recovery operation',
      'metric_code','WASTE_RECYCLED','requires_evidence',false
    ),

    -- GRI 403: Occupational Health & Safety
    jsonb_build_object(
      'code','GRI-403-9','title','Work-related injuries','category','Social',
      'severity',3,'rule_type','REQUIRED_FACT','principle','GRI-403',
      'brsr_section','GRI 403-9','description','Number and rate of work-related injuries',
      'metric_code','SAFETY_INCIDENTS','requires_evidence',false
    ),

    -- GRI 405: Diversity and Equal Opportunity
    jsonb_build_object(
      'code','GRI-405-1','title','Diversity of governance bodies and employees','category','Social',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-405',
      'brsr_section','GRI 405-1','description','Percentage of individuals by gender, age group, and minority',
      'metric_code','FEMALE_PCT','requires_evidence',false
    ),

    -- GRI 418: Customer Privacy
    jsonb_build_object(
      'code','GRI-418-1','title','Substantiated complaints on customer privacy','category','Consumer',
      'severity',2,'rule_type','REQUIRED_FACT','principle','GRI-418',
      'brsr_section','GRI 418-1','description','Complaints from regulatory bodies and total identified leaks/thefts',
      'metric_code','CONSUMER_COMPLAINTS','requires_evidence',false
    )
  );
  r jsonb;
BEGIN
  FOR r IN SELECT jsonb_array_elements(gri_rules) LOOP
    INSERT INTO esg.compliance_rules(
      code, title, category, severity, rule_type, params, active,
      framework, description, metric_code, requires_evidence,
      severity_level, principle, brsr_section
    )
    VALUES (
      r->>'code', r->>'title', r->>'category', (r->>'severity')::smallint,
      r->>'rule_type', '{}'::jsonb, true,
      'GRI_2021', r->>'description',
      NULLIF(r->>'metric_code', ''),
      COALESCE((r->>'requires_evidence')::boolean, false),
      CASE
        WHEN (r->>'severity')::int >= 4 THEN 'HIGH'::esg.rule_severity
        WHEN (r->>'severity')::int >= 2 THEN 'MEDIUM'::esg.rule_severity
        ELSE 'LOW'::esg.rule_severity
      END,
      r->>'principle', r->>'brsr_section'
    )
    ON CONFLICT (code) DO UPDATE
      SET title = EXCLUDED.title, framework = EXCLUDED.framework,
          description = EXCLUDED.description, metric_code = EXCLUDED.metric_code,
          principle = EXCLUDED.principle, brsr_section = EXCLUDED.brsr_section;
  END LOOP;
END
$seed$;

-- Step 3: Cross-map BRSR to GRI disclosures
INSERT INTO esg.framework_crossmap (source_framework, source_code, target_framework, target_code, coverage, notes) VALUES
  -- P6 Environmental → GRI 300 series
  ('BRSR_CORE', 'BRSR-01',    'GRI_2021', 'GRI-302-1', 'full',    'Scope 2 electricity maps to GRI 302-1 energy consumption'),
  ('BRSR_CORE', 'BRSR-P6-01', 'GRI_2021', 'GRI-303-3', 'full',    'Water withdrawal maps directly'),
  ('BRSR_CORE', 'BRSR-P6-02', 'GRI_2021', 'GRI-306-3', 'full',    'Waste generated maps directly'),
  ('BRSR_CORE', 'BRSR-P6-02', 'GRI_2021', 'GRI-306-4', 'partial', 'Waste diverted is a subset of BRSR waste disclosure'),
  ('BRSR_CORE', 'BRSR-P6-03', 'GRI_2021', 'GRI-305-1', 'full',    'Scope 1 fuel consumption maps to GRI 305-1'),
  ('BRSR_CORE', 'BRSR-P6-04', 'GRI_2021', 'GRI-302-3', 'full',    'Energy intensity maps directly'),
  ('BRSR_CORE', 'BRSR-08',    'GRI_2021', 'GRI-305-2', 'partial', 'Scope 2 market-based maps to GRI 305-2'),
  ('BRSR_CORE', 'BRSR-09',    'GRI_2021', 'GRI-305-2', 'partial', 'Scope 2 location-based maps to GRI 305-2'),

  -- P3 Employee → GRI 400 series
  ('BRSR_CORE', 'BRSR-P3-01', 'GRI_2021', 'GRI-2-7',   'full',    'Employee headcount maps to GRI 2-7'),
  ('BRSR_CORE', 'BRSR-P3-01', 'GRI_2021', 'GRI-405-1', 'partial', 'Gender diversity maps to GRI 405-1'),
  ('BRSR_CORE', 'BRSR-P3-02', 'GRI_2021', 'GRI-403-9', 'full',    'Safety incidents map to GRI 403-9'),

  -- P1 Governance → GRI 2
  ('BRSR_CORE', 'BRSR-P1-01', 'GRI_2021', 'GRI-2-27',  'partial', 'Anti-corruption relates to GRI 2-27 compliance'),

  -- P9 Consumer → GRI 418
  ('BRSR_CORE', 'BRSR-P9-02', 'GRI_2021', 'GRI-418-1', 'full',    'Data privacy maps to GRI 418-1 customer privacy')
ON CONFLICT DO NOTHING;
