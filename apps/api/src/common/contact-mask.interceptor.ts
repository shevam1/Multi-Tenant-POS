import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { map, type Observable } from 'rxjs';

/** Fields hidden from groomers to prevent client poaching / list theft. */
const MASKED_FIELDS = new Set(['phone', 'email', 'emergencyContact']);

/**
 * Client-poaching protection (spec section 2): users with the GROOMER role
 * cannot see customer contact details. This interceptor scrubs those fields
 * from every response payload for groomers, regardless of the endpoint.
 */
@Injectable()
export class ContactMaskInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => (this.cls.get<string>('role') === 'GROOMER' ? scrub(data) : data)),
    );
  }
}

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = MASKED_FIELDS.has(k) ? null : scrub(v);
    }
    return out;
  }
  return value;
}
