import { Controller, Get, Header } from '@nestjs/common';
import { renderPrometheusMetrics } from './metrics';

@Controller()
export class MetricsController {
  @Get('/metrics')
  @Header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
  metrics() {
    return renderPrometheusMetrics();
  }
}

