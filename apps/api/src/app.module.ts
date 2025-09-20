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

@Module({ imports: [GraphModule], controllers: [UploadController, ReportsController, SuppliersController, PublicController, AuditorController, AuditorPublicController, ExecController] })
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(WithTenantMiddleware).forRoutes('*');
  }
}


