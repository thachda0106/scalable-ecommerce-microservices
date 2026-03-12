import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  RequestTimeoutException,
} from "@nestjs/common";
import { Observable, throwError, TimeoutError } from "rxjs";
import { catchError, timeout } from "rxjs/operators";

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      // Aggressive 5 second timeout across all gateway endpoints
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () => new RequestTimeoutException("Gateway timeout downstream"),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
