import { Module, MiddlewareConsumer } from '@nestjs/common';
import { GraphModule } from './graphql/schema.gql';
import { WithTenantMiddleware } from './tenancy';
import { UploadController } from './upload/upload.controller';
import { ReportsController } from './reports/reports.controller';
import { SuppliersController } from './suppliers/suppliers.controller';
import { PublicController } from './public/public.controller';
import { AuditorController } from './auditor/auditor.controller';
import { AuditorPublicController } from './public/auditorPublic.controller';
import { ExecController } from './exec/exec.controller';
import { HealthController } from './health.controller';
import { AuditController } from './audit/audit.controller';
import { ActivityController } from './audit/activity.controller';
import { MetricsController } from './observability/metrics.controller';
import { JwtAuthMiddleware } from './auth/jwt.middleware';
import { RequestContextMiddleware } from './observability/request.middleware';
import { PilotController } from './pilot/pilot.controller';
import { FeedbackController } from './pilot/feedback.controller';
import { NotificationsController } from './notifications/notifications.controller';

@Module({ imports: [GraphModule], controllers: [UploadController, ReportsController, SuppliersController, PublicController, AuditorController, AuditorPublicController, ExecController, HealthController, AuditController, ActivityController, MetricsController, PilotController, FeedbackController, NotificationsController] })
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware, JwtAuthMiddleware, WithTenantMiddleware).forRoutes('*');
  }
}


