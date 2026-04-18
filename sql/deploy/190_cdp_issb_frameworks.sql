-- 190_cdp_issb_frameworks.sql
-- Add CDP Climate Change 2024 and ISSB (IFRS S1/S2) framework rules
-- with cross-mappings to BRSR and GRI.

-- ═══════════════════════════════════════════════
-- CDP Climate Change 2024 Questionnaire
-- ═══════════════════════════════════════════════
DO $seed$
DECLARE
  cdp_rules jsonb := jsonb_build_array(
    -- C0: Introduction
    jsonb_build_object('code','CDP-C0.1','title','Organization profile and reporting year','category','General','severity',2,'principle','CDP-C0','brsr_section','C0.1','description','Legal name, main activity, reporting year, and boundary','metric_code',null,'requires_evidence',true),

    -- C1: Governance
    jsonb_build_object('code','CDP-C1.1','title','Board-level oversight of climate issues','category','Governance','severity',3,'principle','CDP-C1','brsr_section','C1.1','description','Board committee or position responsible for climate-related issues','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','CDP-C1.2','title','Management-level responsibility for climate','category','Governance','severity',2,'principle','CDP-C1','brsr_section','C1.2','description','Highest management-level position with responsibility for climate','metric_code',null,'requires_evidence',false),

    -- C2: Risks and Opportunities
    jsonb_build_object('code','CDP-C2.1','title','Climate risk/opportunity identification process','category','Risk','severity',3,'principle','CDP-C2','brsr_section','C2.1','description','Process for identifying, assessing, and responding to climate risks and opportunities','metric_code',null,'requires_evidence',true),

    -- C4: Targets and Performance
    jsonb_build_object('code','CDP-C4.1','title','Emissions reduction targets','category','Target','severity',3,'principle','CDP-C4','brsr_section','C4.1','description','Active emissions reduction targets and progress against base year','metric_code',null,'requires_evidence',true),

    -- C6: Emissions Data
    jsonb_build_object('code','CDP-C6.1','title','Scope 1 emissions reported','category','Emissions','severity',3,'principle','CDP-C6','brsr_section','C6.1','description','Gross global Scope 1 emissions in metric tons CO2e','metric_code','FUEL_KG','requires_evidence',false),
    jsonb_build_object('code','CDP-C6.3','title','Scope 2 emissions reported','category','Emissions','severity',3,'principle','CDP-C6','brsr_section','C6.3','description','Scope 2 location-based and market-based emissions','metric_code','ELEC_KWH','requires_evidence',false),
    jsonb_build_object('code','CDP-C6.5','title','Scope 3 emissions reported','category','Emissions','severity',2,'principle','CDP-C6','brsr_section','C6.5','description','Scope 3 emissions by category','metric_code',null,'requires_evidence',false),

    -- C7: Emissions Breakdown
    jsonb_build_object('code','CDP-C7.1','title','Scope 1 breakdown by GHG type','category','Emissions','severity',2,'principle','CDP-C7','brsr_section','C7.1','description','Scope 1 emissions broken down by greenhouse gas type','metric_code','FUEL_KG','requires_evidence',false),

    -- C8: Energy
    jsonb_build_object('code','CDP-C8.1','title','Total energy consumption','category','Energy','severity',3,'principle','CDP-C8','brsr_section','C8.1','description','Total energy consumption in MWh — fuel, electricity, heating, cooling, steam','metric_code','ELEC_KWH','requires_evidence',false),

    -- C9: Additional Metrics
    jsonb_build_object('code','CDP-C9.1','title','Emissions intensity per revenue','category','Intensity','severity',2,'principle','CDP-C9','brsr_section','C9.1','description','Emissions intensity per unit revenue','metric_code','ENERGY_INTENSITY','requires_evidence',false),

    -- C12: Engagement
    jsonb_build_object('code','CDP-C12.1','title','Value chain engagement on climate','category','Engagement','severity',2,'principle','CDP-C12','brsr_section','C12.1','description','Activities to influence suppliers, customers, or other value chain partners','metric_code','SUPPLIER_SCREEN','requires_evidence',false),

    -- W1: Water (CDP Water Security)
    jsonb_build_object('code','CDP-W1.2','title','Water accounting — withdrawals','category','Water','severity',3,'principle','CDP-W1','brsr_section','W1.2','description','Total water withdrawals by source','metric_code','WATER_KL','requires_evidence',false)
  );
  r jsonb;
BEGIN
  FOR r IN SELECT jsonb_array_elements(cdp_rules) LOOP
    INSERT INTO esg.compliance_rules(code, title, category, severity, rule_type, params, active, framework, description, metric_code, requires_evidence, severity_level, principle, brsr_section)
    VALUES (
      r->>'code', r->>'title', r->>'category', (r->>'severity')::smallint,
      'REQUIRED_FACT', '{}'::jsonb, true, 'CDP_CLIMATE',
      r->>'description', NULLIF(r->>'metric_code',''),
      COALESCE((r->>'requires_evidence')::boolean, false),
      CASE WHEN (r->>'severity')::int >= 4 THEN 'HIGH'::esg.rule_severity WHEN (r->>'severity')::int >= 2 THEN 'MEDIUM'::esg.rule_severity ELSE 'LOW'::esg.rule_severity END,
      r->>'principle', r->>'brsr_section'
    ) ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, framework=EXCLUDED.framework, description=EXCLUDED.description, metric_code=EXCLUDED.metric_code, principle=EXCLUDED.principle, brsr_section=EXCLUDED.brsr_section;
  END LOOP;
END $seed$;

-- ═══════════════════════════════════════════════
-- ISSB — IFRS S1 (General) + S2 (Climate)
-- ═══════════════════════════════════════════════
DO $seed$
DECLARE
  issb_rules jsonb := jsonb_build_array(
    -- IFRS S1: General Requirements
    jsonb_build_object('code','ISSB-S1-1','title','Governance over sustainability risks','category','Governance','severity',3,'principle','IFRS-S1','brsr_section','IFRS S1.26','description','Governance body oversight of sustainability-related risks and opportunities','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','ISSB-S1-2','title','Strategy — sustainability risks impact on business model','category','Strategy','severity',3,'principle','IFRS-S1','brsr_section','IFRS S1.28','description','How sustainability risks and opportunities affect business model, value chain, and financial position','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','ISSB-S1-3','title','Risk management process disclosed','category','Risk','severity',3,'principle','IFRS-S1','brsr_section','IFRS S1.38','description','Processes used to identify, assess, prioritize, and monitor sustainability risks','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','ISSB-S1-4','title','Metrics and targets for sustainability performance','category','Metrics','severity',3,'principle','IFRS-S1','brsr_section','IFRS S1.43','description','Metrics used to measure and monitor sustainability-related risks, including targets','metric_code',null,'requires_evidence',false),

    -- IFRS S2: Climate-related Disclosures
    jsonb_build_object('code','ISSB-S2-1','title','Scope 1 GHG emissions disclosed','category','Emissions','severity',3,'principle','IFRS-S2','brsr_section','IFRS S2.29(a)','description','Absolute gross Scope 1 greenhouse gas emissions in tCO2e','metric_code','FUEL_KG','requires_evidence',false),
    jsonb_build_object('code','ISSB-S2-2','title','Scope 2 GHG emissions disclosed','category','Emissions','severity',3,'principle','IFRS-S2','brsr_section','IFRS S2.29(b)','description','Absolute gross location-based Scope 2 GHG emissions in tCO2e','metric_code','ELEC_KWH','requires_evidence',false),
    jsonb_build_object('code','ISSB-S2-3','title','Scope 3 GHG emissions disclosed','category','Emissions','severity',2,'principle','IFRS-S2','brsr_section','IFRS S2.29(c)','description','Absolute gross Scope 3 GHG emissions by category','metric_code',null,'requires_evidence',false),
    jsonb_build_object('code','ISSB-S2-4','title','Climate transition plan disclosed','category','Strategy','severity',2,'principle','IFRS-S2','brsr_section','IFRS S2.14','description','Transition plan for a lower-carbon economy, targets, and progress','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','ISSB-S2-5','title','Climate scenario analysis performed','category','Strategy','severity',2,'principle','IFRS-S2','brsr_section','IFRS S2.22','description','Climate-related scenario analysis including resilience assessment','metric_code',null,'requires_evidence',true),
    jsonb_build_object('code','ISSB-S2-6','title','GHG emissions intensity disclosed','category','Intensity','severity',2,'principle','IFRS-S2','brsr_section','IFRS S2.29(e)','description','GHG emissions intensity per unit of physical or economic output','metric_code','ENERGY_INTENSITY','requires_evidence',false),
    jsonb_build_object('code','ISSB-S2-7','title','Internal carbon pricing disclosed','category','Metrics','severity',1,'principle','IFRS-S2','brsr_section','IFRS S2.29(g)','description','Internal carbon price and how it is applied in decision-making','metric_code',null,'requires_evidence',false),
    jsonb_build_object('code','ISSB-S2-8','title','Climate-related targets and progress','category','Target','severity',3,'principle','IFRS-S2','brsr_section','IFRS S2.33','description','Climate-related targets, base year, milestones, and progress','metric_code',null,'requires_evidence',true)
  );
  r jsonb;
BEGIN
  FOR r IN SELECT jsonb_array_elements(issb_rules) LOOP
    INSERT INTO esg.compliance_rules(code, title, category, severity, rule_type, params, active, framework, description, metric_code, requires_evidence, severity_level, principle, brsr_section)
    VALUES (
      r->>'code', r->>'title', r->>'category', (r->>'severity')::smallint,
      'REQUIRED_FACT', '{}'::jsonb, true, 'ISSB_2023',
      r->>'description', NULLIF(r->>'metric_code',''),
      COALESCE((r->>'requires_evidence')::boolean, false),
      CASE WHEN (r->>'severity')::int >= 4 THEN 'HIGH'::esg.rule_severity WHEN (r->>'severity')::int >= 2 THEN 'MEDIUM'::esg.rule_severity ELSE 'LOW'::esg.rule_severity END,
      r->>'principle', r->>'brsr_section'
    ) ON CONFLICT (code) DO UPDATE SET title=EXCLUDED.title, framework=EXCLUDED.framework, description=EXCLUDED.description, metric_code=EXCLUDED.metric_code, principle=EXCLUDED.principle, brsr_section=EXCLUDED.brsr_section;
  END LOOP;
END $seed$;

-- ═══════════════════════════════════════════════
-- Cross-mappings: BRSR ↔ CDP, BRSR ↔ ISSB, GRI ↔ CDP
-- ═══════════════════════════════════════════════
INSERT INTO esg.framework_crossmap (source_framework, source_code, target_framework, target_code, coverage, notes) VALUES
  -- BRSR → CDP
  ('BRSR_CORE','BRSR-01',    'CDP_CLIMATE','CDP-C8.1',   'full',    'Scope 2 electricity → CDP total energy'),
  ('BRSR_CORE','BRSR-P6-03', 'CDP_CLIMATE','CDP-C6.1',   'full',    'Scope 1 fuel → CDP Scope 1 emissions'),
  ('BRSR_CORE','BRSR-P6-01', 'CDP_CLIMATE','CDP-W1.2',   'full',    'Water withdrawal → CDP water accounting'),
  ('BRSR_CORE','BRSR-P6-04', 'CDP_CLIMATE','CDP-C9.1',   'partial', 'Energy intensity → CDP emissions intensity'),
  ('BRSR_CORE','BRSR-P1-01', 'CDP_CLIMATE','CDP-C1.1',   'partial', 'Ethics/governance → CDP board oversight'),

  -- BRSR → ISSB
  ('BRSR_CORE','BRSR-P6-03', 'ISSB_2023','ISSB-S2-1',   'full',    'Scope 1 fuel → ISSB S2 Scope 1'),
  ('BRSR_CORE','BRSR-01',    'ISSB_2023','ISSB-S2-2',   'full',    'Scope 2 electricity → ISSB S2 Scope 2'),
  ('BRSR_CORE','BRSR-P6-04', 'ISSB_2023','ISSB-S2-6',   'full',    'Energy intensity → ISSB S2 GHG intensity'),
  ('BRSR_CORE','BRSR-P1-01', 'ISSB_2023','ISSB-S1-1',   'partial', 'Governance → ISSB S1 governance'),

  -- GRI → CDP
  ('GRI_2021','GRI-305-1',   'CDP_CLIMATE','CDP-C6.1',   'full',    'GRI Scope 1 → CDP C6.1'),
  ('GRI_2021','GRI-305-2',   'CDP_CLIMATE','CDP-C6.3',   'full',    'GRI Scope 2 → CDP C6.3'),
  ('GRI_2021','GRI-305-3',   'CDP_CLIMATE','CDP-C6.5',   'full',    'GRI Scope 3 → CDP C6.5'),
  ('GRI_2021','GRI-302-1',   'CDP_CLIMATE','CDP-C8.1',   'full',    'GRI energy → CDP energy'),
  ('GRI_2021','GRI-303-3',   'CDP_CLIMATE','CDP-W1.2',   'full',    'GRI water → CDP water'),

  -- GRI → ISSB
  ('GRI_2021','GRI-305-1',   'ISSB_2023','ISSB-S2-1',   'full',    'GRI Scope 1 → ISSB S2 Scope 1'),
  ('GRI_2021','GRI-305-2',   'ISSB_2023','ISSB-S2-2',   'full',    'GRI Scope 2 → ISSB S2 Scope 2'),
  ('GRI_2021','GRI-302-3',   'ISSB_2023','ISSB-S2-6',   'partial', 'GRI energy intensity → ISSB S2 GHG intensity'),

  -- CDP → ISSB
  ('CDP_CLIMATE','CDP-C6.1',  'ISSB_2023','ISSB-S2-1',  'full',    'CDP Scope 1 → ISSB S2 Scope 1'),
  ('CDP_CLIMATE','CDP-C6.3',  'ISSB_2023','ISSB-S2-2',  'full',    'CDP Scope 2 → ISSB S2 Scope 2'),
  ('CDP_CLIMATE','CDP-C1.1',  'ISSB_2023','ISSB-S1-1',  'full',    'CDP governance → ISSB S1 governance'),
  ('CDP_CLIMATE','CDP-C4.1',  'ISSB_2023','ISSB-S2-8',  'full',    'CDP targets → ISSB S2 targets')
ON CONFLICT DO NOTHING;
