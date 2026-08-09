# Frontend — Angular 22 / TypeScript

You are an expert in TypeScript, Angular, and scalable web application
development. You write functional, maintainable, performant, and accessible code
following Angular and TypeScript best practices.

See §4 (Code Quality Standards) in `AGENTS.md` for general TypeScript quality
rules (no `any`, strict checking, precise types). This file covers
Angular-specific conventions.

---

## TypeScript Best Practices

- Use strict type checking.
- Prefer type inference when the type is obvious.
- Use `unknown` when type is uncertain (see §4 for the `any` prohibition).

## Angular Best Practices

- Always use standalone components over NgModules.
- Must NOT set `standalone: true` inside Angular decorators. It's the default in
  Angular v20+.
- Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly.
  `OnPush` is the default in Angular v22+.
- Use signals for state management.
- Implement lazy loading for feature routes.
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host
  bindings inside the `host` object of the `@Component` or `@Directive`
  decorator instead.
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color
  contrast, and ARIA attributes.

## Components

- Keep components small and focused on a single responsibility.
- Use `input()` and `output()` functions instead of decorators.
- Use `model()` for two-way bound properties with `[(prop)]` syntax instead of
  pairing `input()` with `output()`.
- Use `computed()` for derived state.
- Use `linkedSignal()` for state derived from multiple reactive sources that
  must stay synchronized.
- Prefer inline templates and styles when the combined template + styles total
  **70 lines or fewer**. Beyond that threshold, extract into separate
  `.component.html` and `.component.scss` files for better IDE support
  (syntax highlighting, Emmet, autocompletion) and readability.
- When using external templates/styles, use paths relative to the component TS
  file (`templateUrl: './foo.component.html'`, `styleUrl: './foo.component.scss'`).
- Prefer Signal Forms (`@angular/forms/signals`) for new forms. They are stable
  in Angular v22+ and provide signal-based state, type-safe field access, and
  schema-based validation.
- When not using Signal Forms, prefer Reactive forms instead of Template-driven
  ones.
- Do NOT use `ngClass`, use `class` bindings instead.
- Do NOT use `ngStyle`, use `style` bindings instead.

## State Management

- Use signals for local component state.
- Keep state transformations pure and predictable.
- Do NOT use `mutate` on signals, use `update` or `set` instead.

## Templates

- Keep templates simple and avoid complex logic.
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`,
  `*ngFor`, `*ngSwitch`.
- Use the async pipe to handle observables.
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility.
- Use the `@Service()` decorator for singleton services (Angular v22+). It
  replaces `@Injectable({ providedIn: 'root' })` and automatically provisions
  at the root level. Do NOT use `@Injectable` for new services.
- Use the `inject()` function instead of constructor injection.

## Scaffolding with `ng generate`

- **Always use `ng generate`** (or its alias `ng g`) to scaffold new components,
  services, pipes, guards, resolvers, and directives. Do not hand-write
  boilerplate files.
- The CLI generates correct defaults for Angular 22: `@Service()` for services,
  standalone components with no explicit `standalone: true` or `OnPush`, proper
  file naming conventions, and spec files.
- Common commands:
  - `ng g component <path>` — generates component with external template/styles
  - `ng g service <path>` — generates service with `@Service()` decorator
  - `ng g pipe <path>` — generates a pipe class
  - `ng g guard <path>` — generates a route guard
  - `ng g directive <path>` — generates a directive
- Use `--dry-run` to preview generated files before committing.
- Use `--skip-tests` only when explicitly told to skip test generation.
- Specify the full path relative to `src/app/` (e.g.,
  `ng g service core/services/upload` or `ng g component features/drive/components/file-preview`).
