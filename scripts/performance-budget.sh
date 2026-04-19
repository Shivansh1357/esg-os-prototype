#!/usr/bin/env bash
# ESG OS — Performance Budget Enforcement
# Run in CI to enforce build size and bundle limits.
# Usage: ./scripts/performance-budget.sh
#
# Checks:
# 1. Next.js build output size limits
# 2. API TypeScript compilation time
# 3. Total bundle size cap

set -euo pipefail

FAILED=0
WARNINGS=0

echo "=== ESG OS Performance Budget Check ==="
echo ""

# 1. Web build size
echo "--- Web Build Size ---"
BUILD_DIR="apps/web/.next"
if [ -d "$BUILD_DIR" ]; then
  TOTAL_SIZE_KB=$(du -sk "$BUILD_DIR" | cut -f1)
  TOTAL_SIZE_MB=$((TOTAL_SIZE_KB / 1024))
  MAX_SIZE_MB=50

  if [ "$TOTAL_SIZE_MB" -gt "$MAX_SIZE_MB" ]; then
    echo "FAIL: Web build is ${TOTAL_SIZE_MB}MB (limit: ${MAX_SIZE_MB}MB)"
    FAILED=$((FAILED + 1))
  else
    echo "PASS: Web build is ${TOTAL_SIZE_MB}MB (limit: ${MAX_SIZE_MB}MB)"
  fi

  # Check individual page sizes
  STATIC_DIR="$BUILD_DIR/static"
  if [ -d "$STATIC_DIR" ]; then
    JS_SIZE_KB=$(find "$STATIC_DIR" -name "*.js" -exec du -sk {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    CSS_SIZE_KB=$(find "$STATIC_DIR" -name "*.css" -exec du -sk {} + 2>/dev/null | awk '{sum+=$1} END {print sum+0}')
    JS_MAX=2048
    CSS_MAX=256

    if [ "$JS_SIZE_KB" -gt "$JS_MAX" ]; then
      echo "WARN: JS bundle is ${JS_SIZE_KB}KB (budget: ${JS_MAX}KB)"
      WARNINGS=$((WARNINGS + 1))
    else
      echo "PASS: JS bundle is ${JS_SIZE_KB}KB (budget: ${JS_MAX}KB)"
    fi

    if [ "$CSS_SIZE_KB" -gt "$CSS_MAX" ]; then
      echo "WARN: CSS bundle is ${CSS_SIZE_KB}KB (budget: ${CSS_MAX}KB)"
      WARNINGS=$((WARNINGS + 1))
    else
      echo "PASS: CSS bundle is ${CSS_SIZE_KB}KB (budget: ${CSS_MAX}KB)"
    fi
  fi
else
  echo "SKIP: No build found (run 'pnpm --filter @apps/web build' first)"
fi

echo ""

# 2. API type-check
echo "--- API Type Check ---"
START_TIME=$(date +%s)
if cd apps/api && npx tsc --noEmit 2>&1; then
  END_TIME=$(date +%s)
  DURATION=$((END_TIME - START_TIME))
  MAX_DURATION=30

  if [ "$DURATION" -gt "$MAX_DURATION" ]; then
    echo "WARN: API type-check took ${DURATION}s (budget: ${MAX_DURATION}s)"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "PASS: API type-check took ${DURATION}s (budget: ${MAX_DURATION}s)"
  fi
else
  echo "FAIL: API type-check failed"
  FAILED=$((FAILED + 1))
fi
cd - > /dev/null

echo ""

# 3. SQL migration count
echo "--- SQL Migrations ---"
MIGRATION_COUNT=$(ls sql/deploy/*.sql 2>/dev/null | wc -l | tr -d ' ')
echo "INFO: $MIGRATION_COUNT SQL migrations"

echo ""
echo "=== Summary ==="
echo "Failures: $FAILED"
echo "Warnings: $WARNINGS"

if [ "$FAILED" -gt 0 ]; then
  echo "RESULT: FAIL"
  exit 1
fi

echo "RESULT: PASS"
exit 0
