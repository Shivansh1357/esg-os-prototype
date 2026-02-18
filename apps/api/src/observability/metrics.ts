const counters: Record<string, number> = {
  requests_total: 0,
  recalc_total: 0,
  freeze_total: 0,
};

export function incMetric(name: keyof typeof counters, delta = 1) {
  counters[name] = (counters[name] || 0) + delta;
}

export function renderPrometheusMetrics() {
  return [
    '# HELP requests_total Total API requests',
    '# TYPE requests_total counter',
    `requests_total ${counters.requests_total}`,
    '# HELP recalc_total Total recalc operations',
    '# TYPE recalc_total counter',
    `recalc_total ${counters.recalc_total}`,
    '# HELP freeze_total Total freeze operations',
    '# TYPE freeze_total counter',
    `freeze_total ${counters.freeze_total}`,
    '',
  ].join('\n');
}

