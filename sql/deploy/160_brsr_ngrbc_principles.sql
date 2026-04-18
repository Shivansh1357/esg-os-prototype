-- 160_brsr_ngrbc_principles.sql
-- Add NGRBC principle mapping and BRSR Core KPIs per SEBI circular.
-- Covers all 9 NGRBC principles with compliance rules for MVP pilot.

-- Step 1: Add principle column to compliance_rules
ALTER TABLE esg.compliance_rules
  ADD COLUMN IF NOT EXISTS principle text,
  ADD COLUMN IF NOT EXISTS brsr_section text;

COMMENT ON COLUMN esg.compliance_rules.principle IS 'NGRBC Principle number (P1-P9)';
COMMENT ON COLUMN esg.compliance_rules.brsr_section IS 'BRSR report section reference';

-- Step 2: Add BRSR-relevant metrics
INSERT INTO esg.metrics (code, name, unit, scope) VALUES
  ('FUEL_KG',        'Fuel consumption (stationary + mobile)', 'kg',     1),
  ('PROCESS_EMIS',   'Process emissions',                      'kgCO2e', 1),
  ('WATER_KL',       'Water withdrawal',                       'kL',     2),
  ('WASTE_MT',       'Waste generated',                        'MT',     2),
  ('WASTE_RECYCLED',  'Waste recycled/reused',                 'MT',     2),
  ('EMPLOYEE_COUNT',  'Total employees',                       'count',  1),
  ('FEMALE_PCT',      'Female employees percentage',           'pct',    1),
  ('SAFETY_INCIDENTS','Safety incidents (LTI)',                'count',  1),
  ('TRAINING_HRS',    'Safety training hours',                 'hours',  1),
  ('MINIMUM_WAGE_PCT','Employees above minimum wage',          'pct',    1),
  ('CSR_SPEND',       'CSR expenditure',                       'INR',    1),
  ('ENERGY_INTENSITY','Energy intensity ratio',                'kWh/cr', 2),
  ('SUPPLIER_SCREEN', 'Suppliers screened on ESG criteria',    'count',  3),
  ('CONSUMER_COMPLAINTS','Consumer complaints received',       'count',  1)
ON CONFLICT (code) DO NOTHING;

-- Step 3: Tag existing rules with NGRBC principles
UPDATE esg.compliance_rules SET principle = 'P6', brsr_section = 'Section A.III' WHERE code IN ('BRSR-01','BRSR-02','BRSR-03','BRSR-08','BRSR-09','BRSR-11','BRSR-12','BRSR-14');
UPDATE esg.compliance_rules SET principle = 'P1', brsr_section = 'Section A.I'   WHERE code IN ('BRSR-04','BRSR-05','BRSR-06','BRSR-07','BRSR-10','BRSR-13','BRSR-15');

-- Step 4: Seed rules for ALL 9 NGRBC Principles
-- P1: Ethics, Transparency, Accountability
-- P2: Sustainable and Safe Products
-- P3: Employee Well-being
-- P4: Stakeholder Engagement
-- P5: Human Rights
-- P6: Environmental Protection (already covered by BRSR-01 to BRSR-15)
-- P7: Responsible Policy Advocacy
-- P8: Inclusive Growth
-- P9: Consumer Responsibility

DO $seed$
DECLARE
  new_rules jsonb := jsonb_build_array(
    -- P1: Ethics, Transparency, Accountability
    jsonb_build_object(
      'code','BRSR-P1-01','title','Anti-corruption/anti-bribery policy disclosed','category','Governance','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P1','brsr_section','Section B.P1',
      'description','Organization must disclose its policy on anti-corruption and anti-bribery','metric_code',null,'requires_evidence',true
    ),
    jsonb_build_object(
      'code','BRSR-P1-02','title','Complaints on ethics/bribery/conflicts reported','category','Governance','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P1','brsr_section','Section B.P1',
      'description','Number of complaints received regarding ethics violations, bribery, or conflicts of interest','metric_code',null,'requires_evidence',false
    ),

    -- P2: Sustainable and Safe Products/Services
    jsonb_build_object(
      'code','BRSR-P2-01','title','Products designed for reuse/recycle percentage reported','category','Product','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P2','brsr_section','Section B.P2',
      'description','Percentage of R&D and capital expenditure on sustainable products','metric_code',null,'requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P2-02','title','Extended Producer Responsibility (EPR) plan disclosed','category','Product','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P2','brsr_section','Section B.P2',
      'description','Disclose EPR plan and waste collection targets','metric_code',null,'requires_evidence',true
    ),

    -- P3: Employee Well-being
    jsonb_build_object(
      'code','BRSR-P3-01','title','Employee headcount and diversity reported','category','Social','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','EMPLOYEE_COUNT'),'principle','P3','brsr_section','Section B.P3',
      'description','Total employees including permanent, temporary, differently abled, and gender breakdown','metric_code','EMPLOYEE_COUNT','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P3-02','title','Safety incidents (LTI) reported','category','Social','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','SAFETY_INCIDENTS'),'principle','P3','brsr_section','Section B.P3',
      'description','Lost Time Injury frequency rate and safety incidents for reporting period','metric_code','SAFETY_INCIDENTS','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P3-03','title','Safety training hours reported','category','Social','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','TRAINING_HRS'),'principle','P3','brsr_section','Section B.P3',
      'description','Health and safety training hours provided to employees','metric_code','TRAINING_HRS','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P3-04','title','Minimum wage compliance reported','category','Social','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','MINIMUM_WAGE_PCT'),'principle','P3','brsr_section','Section B.P3',
      'description','Percentage of employees receiving equal to or above minimum wage','metric_code','MINIMUM_WAGE_PCT','requires_evidence',false
    ),

    -- P4: Stakeholder Engagement
    jsonb_build_object(
      'code','BRSR-P4-01','title','Key stakeholder groups identified and engagement process disclosed','category','Governance','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P4','brsr_section','Section B.P4',
      'description','Identification of key stakeholder groups and process for engagement','metric_code',null,'requires_evidence',true
    ),

    -- P5: Human Rights
    jsonb_build_object(
      'code','BRSR-P5-01','title','Human rights policy and due diligence disclosed','category','Social','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P5','brsr_section','Section B.P5',
      'description','Policy on human rights and due diligence process','metric_code',null,'requires_evidence',true
    ),
    jsonb_build_object(
      'code','BRSR-P5-02','title','Child/forced labor checks completed','category','Social','severity',4,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P5','brsr_section','Section B.P5',
      'description','Disclosure on measures to prevent child and forced labor in operations and supply chain','metric_code',null,'requires_evidence',true
    ),

    -- P6: Environmental Protection (supplement existing rules)
    jsonb_build_object(
      'code','BRSR-P6-01','title','Water withdrawal reported','category','Environment','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','WATER_KL'),'principle','P6','brsr_section','Section B.P6',
      'description','Total water withdrawal by source for reporting period','metric_code','WATER_KL','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P6-02','title','Waste generated and diverted reported','category','Environment','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','WASTE_MT'),'principle','P6','brsr_section','Section B.P6',
      'description','Total waste generated and waste diverted from disposal','metric_code','WASTE_MT','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P6-03','title','Scope 1 fuel consumption reported','category','Environment','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','FUEL_KG'),'principle','P6','brsr_section','Section B.P6',
      'description','Total fuel consumption from non-renewable and renewable sources','metric_code','FUEL_KG','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P6-04','title','Energy intensity ratio disclosed','category','Environment','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','ENERGY_INTENSITY'),'principle','P6','brsr_section','Section B.P6',
      'description','Energy intensity per rupee of turnover','metric_code','ENERGY_INTENSITY','requires_evidence',false
    ),

    -- P7: Responsible Policy Advocacy
    jsonb_build_object(
      'code','BRSR-P7-01','title','Membership in trade/industry bodies disclosed','category','Governance','severity',1,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P7','brsr_section','Section B.P7',
      'description','List of trade and industry chambers/associations the company is a member of','metric_code',null,'requires_evidence',false
    ),

    -- P8: Inclusive Growth
    jsonb_build_object(
      'code','BRSR-P8-01','title','CSR expenditure reported','category','Social','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','CSR_SPEND'),'principle','P8','brsr_section','Section B.P8',
      'description','CSR expenditure as percentage of average net profit','metric_code','CSR_SPEND','requires_evidence',true
    ),
    jsonb_build_object(
      'code','BRSR-P8-02','title','Community development program disclosed','category','Social','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P8','brsr_section','Section B.P8',
      'description','Details of Social Impact Assessments and community programs','metric_code',null,'requires_evidence',true
    ),

    -- P9: Consumer Responsibility
    jsonb_build_object(
      'code','BRSR-P9-01','title','Consumer complaints tracking reported','category','Consumer','severity',2,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object('metricCode','CONSUMER_COMPLAINTS'),'principle','P9','brsr_section','Section B.P9',
      'description','Number of consumer complaints received and percentage resolved','metric_code','CONSUMER_COMPLAINTS','requires_evidence',false
    ),
    jsonb_build_object(
      'code','BRSR-P9-02','title','Data privacy policy and practices disclosed','category','Consumer','severity',3,
      'rule_type','REQUIRED_FACT','params',jsonb_build_object(),'principle','P9','brsr_section','Section B.P9',
      'description','Disclosure on personal data management policy and any data breaches','metric_code',null,'requires_evidence',true
    )
  );
  r jsonb;
BEGIN
  FOR r IN SELECT jsonb_array_elements(new_rules) LOOP
    INSERT INTO esg.compliance_rules(
      code, title, category, severity, rule_type, params, active,
      framework, description, metric_code, requires_evidence,
      severity_level, principle, brsr_section
    )
    VALUES (
      r->>'code', r->>'title', r->>'category', (r->>'severity')::smallint,
      r->>'rule_type', r->'params', true,
      'BRSR_CORE', r->>'description',
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
      SET title = EXCLUDED.title,
          category = EXCLUDED.category,
          severity = EXCLUDED.severity,
          rule_type = EXCLUDED.rule_type,
          params = EXCLUDED.params,
          framework = EXCLUDED.framework,
          description = EXCLUDED.description,
          metric_code = EXCLUDED.metric_code,
          requires_evidence = EXCLUDED.requires_evidence,
          severity_level = EXCLUDED.severity_level,
          principle = EXCLUDED.principle,
          brsr_section = EXCLUDED.brsr_section,
          active = true;
  END LOOP;
END
$seed$;

-- Step 5: Create BRSR Core KPI reference table
CREATE TABLE IF NOT EXISTS esg.brsr_core_kpis (
  id         serial PRIMARY KEY,
  kpi_code   text NOT NULL UNIQUE,
  name       text NOT NULL,
  principle  text NOT NULL,
  metric_code text REFERENCES esg.metrics(code),
  unit       text NOT NULL,
  mandatory  boolean NOT NULL DEFAULT true,
  description text
);

COMMENT ON TABLE esg.brsr_core_kpis IS 'SEBI BRSR Core mandatory KPIs for value chain reporting';

INSERT INTO esg.brsr_core_kpis (kpi_code, name, principle, metric_code, unit, mandatory, description) VALUES
  ('BRSR-KPI-1', 'GHG Emissions (Scope 1+2)',           'P6', 'ELEC_KWH',         'tCO2e',  true,  'Total Scope 1 and Scope 2 GHG emissions'),
  ('BRSR-KPI-2', 'Water Consumption',                    'P6', 'WATER_KL',         'kL',     true,  'Total water consumption'),
  ('BRSR-KPI-3', 'Waste Generated',                      'P6', 'WASTE_MT',         'MT',     true,  'Total waste generated'),
  ('BRSR-KPI-4', 'Gender Diversity (Board)',              'P3', 'FEMALE_PCT',       'pct',    true,  'Female representation at board and workforce level'),
  ('BRSR-KPI-5', 'Gross Wages (minimum wage compliance)', 'P3', 'MINIMUM_WAGE_PCT', 'pct',   true,  'Employees receiving minimum wage or above'),
  ('BRSR-KPI-6', 'Open Cases (fines/penalties)',          'P1', null,               'count',  true,  'Pending fines, penalties, or settlement amounts'),
  ('BRSR-KPI-7', 'Energy Intensity',                     'P6', 'ENERGY_INTENSITY', 'kWh/cr', true,  'Energy consumed per crore of turnover'),
  ('BRSR-KPI-8', 'Workplace Safety (LTIFR)',             'P3', 'SAFETY_INCIDENTS', 'rate',   true,  'Lost Time Injury Frequency Rate'),
  ('BRSR-KPI-9', 'Value Chain Scope 3 Emissions',        'P6', null,               'tCO2e',  true,  'Scope 3 GHG emissions from value chain')
ON CONFLICT (kpi_code) DO NOTHING;
