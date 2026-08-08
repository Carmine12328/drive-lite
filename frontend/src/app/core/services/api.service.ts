import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Root-injectable API service providing generic HTTP request methods
 * with centralized error handling and environment-aware request logging.
 */
@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Sends an HTTP GET request to the specified endpoint.
   *
   * @template T The expected response data type.
   * @param path Relative path for the API endpoint (e.g. '/files').
   * @param params Optional HTTP parameters to append to the request URL.
   * @returns An Observable emitting the response payload of type T.
   */
  public get<T>(path: string, params?: HttpParams): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    if (!environment.production) {
      console.debug(`[ApiService] GET ${url}`, params);
    }
    return this.http.get<T>(url, { params }).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Sends an HTTP POST request to the specified endpoint.
   *
   * @template T The expected response data type.
   * @param path Relative path for the API endpoint (e.g. '/files').
   * @param body Payload data to send in the request body.
   * @returns An Observable emitting the response payload of type T.
   */
  public post<T>(path: string, body: unknown): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    if (!environment.production) {
      console.debug(`[ApiService] POST ${url}`, body);
    }
    return this.http.post<T>(url, body).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Sends an HTTP PATCH request to the specified endpoint.
   *
   * @template T The expected response data type.
   * @param path Relative path for the API endpoint (e.g. '/files/123').
   * @param body Payload data containing updates to send in the request body.
   * @returns An Observable emitting the response payload of type T.
   */
  public patch<T>(path: string, body: unknown): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    if (!environment.production) {
      console.debug(`[ApiService] PATCH ${url}`, body);
    }
    return this.http.patch<T>(url, body).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Sends an HTTP DELETE request to the specified endpoint.
   *
   * @template T The expected response data type.
   * @param path Relative path for the API endpoint (e.g. '/files/123').
   * @returns An Observable emitting the response payload of type T.
   */
  public delete<T>(path: string): Observable<T> {
    const url = `${this.baseUrl}${path}`;
    if (!environment.production) {
      console.debug(`[ApiService] DELETE ${url}`);
    }
    return this.http.delete<T>(url).pipe(
      catchError(this.handleError)
    );
  }

  /**
   * Centralized error handler that inspects HttpErrorResponse, maps status
   * codes to user-friendly messages, logs errors to console, and re-throws.
   *
   * @param error The HTTP error response.
   * @returns An Observable that emits an error.
   */
  private handleError = (error: HttpErrorResponse): Observable<never> => {
    let errorMessage: string;

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Network error: ${error.error.message}`;
    } else {
      switch (error.status) {
        case 0:
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        case 400:
          errorMessage = 'Bad request. Please check your submission.';
          break;
        case 401:
          errorMessage = 'Unauthorized. Please log in again.';
          break;
        case 403:
          errorMessage = 'Forbidden. You do not have permission to access this resource.';
          break;
        case 404:
          errorMessage = 'Resource not found.';
          break;
        case 409:
          errorMessage = 'Conflict. The resource already exists or is in a conflicting state.';
          break;
        case 500:
          errorMessage = 'Internal server error. Please try again later.';
          break;
        default:
          errorMessage = error.error?.message || `An error occurred (HTTP ${error.status}).`;
          break;
      }
    }

    console.error(`[ApiService] Request failed (${error.status}): ${errorMessage}`, error);
    return throwError(() => new Error(errorMessage));
  };
}
