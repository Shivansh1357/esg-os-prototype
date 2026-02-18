import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { getCtx } from '../tenancy/als';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly allowed: Array<'ADMIN'|'MEMBER'|'AUDITOR'|'SUPPLIER'>) {}
  canActivate(_: ExecutionContext): boolean {
    const { role } = getCtx();
    return this.allowed.includes(role);
  }
}


