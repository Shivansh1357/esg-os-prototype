type CounterName =
  | 'requests_total'
  | 'recalc_total'
  | 'freeze_total'
  | 'recalc_enqueue_total'
  | 'recalc_enqueue_dedup_total'
  | 'recalc_inline_total'
  | 'list_facts_total';

type HistogramName = 'recalc_duration_ms' | 'list_facts_duration_ms';

const counters: Record<CounterName, number> = {
  requests_total: 0,
  recalc_total: 0,
  freeze_total: 0,
  recalc_enqueue_total: 0,
  recalc_enqueue_dedup_total: 0,
  recalc_inline_total: 0,
  list_facts_total: 0,
};

const histogramConfig: Record<HistogramName, number[]> = {
  recalc_duration_ms: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
  list_facts_duration_ms: [5, 10, 25, 50, 100, 250, 500, 1000],
};

type HistogramState = { buckets: number[]; counts: number[]; count: number; sum: number };

const histograms: Record<HistogramName, HistogramState> = {
  recalc_duration_ms: {
    buckets: histogramConfig.recalc_duration_ms,
    counts: histogramConfig.recalc_duration_ms.map(() => 0),
    count: 0,
    sum: 0,
  },
  list_facts_duration_ms: {
    buckets: histogramConfig.list_facts_duration_ms,
    counts: histogramConfig.list_facts_duration_ms.map(() => 0),
    count: 0,
    sum: 0,
  },
};

export function incMetric(name: CounterName, delta = 1) {
  counters[name] = (counters[name] || 0) + delta;
}

export function observeMetric(name: HistogramName, value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  const histogram = histograms[name];
  histogram.count += 1;
  histogram.sum += value;
  for (let i = 0; i < histogram.buckets.length; i += 1) {
    if (value <= histogram.buckets[i]) histogram.counts[i] += 1;
  }
}

function renderCounters(): string[] {
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
    '# HELP recalc_enqueue_total Total recalc enqueue attempts',
    '# TYPE recalc_enqueue_total counter',
    `recalc_enqueue_total ${counters.recalc_enqueue_total}`,
    '# HELP recalc_enqueue_dedup_total Recalc enqueue attempts that found an existing queued job key',
    '# TYPE recalc_enqueue_dedup_total counter',
    `recalc_enqueue_dedup_total ${counters.recalc_enqueue_dedup_total}`,
    '# HELP recalc_inline_total Recalc requests executed inline because worker schema was unavailable',
    '# TYPE recalc_inline_total counter',
    `recalc_inline_total ${counters.recalc_inline_total}`,
    '# HELP list_facts_total listFacts query calls served',
    '# TYPE list_facts_total counter',
    `list_facts_total ${counters.list_facts_total}`,
  ];
}

function renderHistogram(name: HistogramName, help: string): string[] {
  const histogram = histograms[name];
  const out: string[] = [
    `# HELP ${name} ${help}`,
    `# TYPE ${name} histogram`,
  ];
  histogram.buckets.forEach((bucket, idx) => {
    out.push(`${name}_bucket{le="${bucket}"} ${histogram.counts[idx]}`);
  });
  out.push(`${name}_bucket{le="+Inf"} ${histogram.count}`);
  out.push(`${name}_sum ${histogram.sum}`);
  out.push(`${name}_count ${histogram.count}`);
  return out;
}

export function renderPrometheusMetrics() {
  return [
    ...renderCounters(),
    ...renderHistogram('recalc_duration_ms', 'Duration of recalc lifecycle in milliseconds'),
    ...renderHistogram('list_facts_duration_ms', 'Duration of listFacts query in milliseconds'),
    '',
  ].join('\n');
}
