import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Functional HTTP interceptor that attaches a Bearer authorization token to outgoing API requests.
 *
 * Skips token attachment for:
 * - Presigned S3 URLs (would corrupt the S3 signature)
 * - LocalStack Cognito endpoint (auth operations before sign-in)
 * - Requests where no token is available (user not authenticated)
 *
 * @param req Outgoing HTTP request.
 * @param next Next HTTP handler in the chain.
 * @returns Observable emitting HTTP event stream.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const url = req.url;

  // Skip presigned S3 URLs — adding auth headers corrupts the signature
  if (
    url.includes('.s3.amazonaws.com') ||
    url.includes('.s3.us-east-1.amazonaws.com')
  ) {
    return next(req);
  }

  // Skip LocalStack Cognito calls — these are auth operations themselves
  if (environment.cognitoEndpoint && url.startsWith(environment.cognitoEndpoint)) {
    return next(req);
  }

  // Attach Bearer token to API requests when available
  if (url.startsWith(environment.apiUrl)) {
    const token = authService.getIdToken();
    if (token) {
      const clonedReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      });
      return next(clonedReq);
    }
  }

  return next(req);
};
