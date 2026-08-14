# auth — Feature README

## What this module does

Provides all public (unauthenticated) UI for sign-in, registration, and the
Cognito Hosted UI OAuth callback. All routes in this feature are accessible
without a JWT — they live under `/auth/*` and are intentionally placed before
the `authGuard`-wrapped shell in `app.routes.ts`.

## Key components and their responsibilities

| File | Responsibility |
|:-----|:---------------|
| `landing/landing.component.ts` | Entry page: "Sign in with Google" (Hosted UI) and "Sign in with email" buttons |
| `login/login.component.ts` | Email/password form; calls `AuthService.signIn()`; redirects to `/dashboard` on success |
| `register/register.component.ts` | Two-step flow: form → 6-digit confirmation code; calls `AuthService.signUp()` + `AuthService.confirmSignUp()` |
| `cognito-callback/cognito-callback.component.ts` | OAuth redirect handler; exchanges the `code` param for tokens via `AuthService`; redirects to `/dashboard` |

## External dependencies

- `core/auth/auth.service.ts` — all Cognito SDK calls (signIn, signUp, confirmSignUp, Hosted UI exchange)
- `shared/components/` — Toast notifications for errors

## Entry point

`/auth` redirects to `/auth/landing` (see `app.routes.ts`). Each sub-route
lazy-loads its own component.

## Auth state after login

`AuthService` stores JWTs in **memory** (primary) and **sessionStorage**
(persistence across page refresh). The `sub` claim is extracted as `userId`.
State is exposed as signals: `currentUser`, `isAuthenticated`, `isLoading`.
