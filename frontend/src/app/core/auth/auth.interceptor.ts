import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Functional HTTP interceptor that attaches a Bearer authorization token to outgoing API requests.
 *
 * Requests targeting presigned S3 URLs (containing `.s3.amazonaws.com` or `.s3.us-east-1.amazonaws.com`)
 * are forwarded without modification to avoid corrupting S3 signature headers.
 * Requests starting with `environment.apiUrl` are cloned with an added `Authorization: Bearer <token>` header.
 * All other outgoing requests are forwarded unchanged.
 *
 * @param req Outgoing HTTP request.
 * @param next Next HTTP handler in the chain.
 * @returns Observable emitting HTTP event stream.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const url = req.url;

  if (
    url.includes('.s3.amazonaws.com') ||
    url.includes('.s3.us-east-1.amazonaws.com')
  ) {
    return next(req);
  }

  if (url.startsWith(environment.apiUrl)) {
    const token = authService.getIdToken();
    const clonedReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
    return next(clonedReq);
  }

  return next(req);
};
