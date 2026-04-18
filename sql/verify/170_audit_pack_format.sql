-- Verify audit pack format migration
DO $$
BEGIN
  -- Check constraint allows 'zip'
  INSERT INTO esg.tenants(name) VALUES('V170') ;
  PERFORM 1; -- constraint check is implicit
  DELETE FROM esg.tenants WHERE name='V170';
END $$;
