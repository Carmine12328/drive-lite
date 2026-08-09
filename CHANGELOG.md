# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Audit & Housekeeping

#### Changed

- **Service decorator migration** — All 6 Angular services migrated from
  `@Injectable({ providedIn: 'root' })` to `@Service()` (Angular 22 standard)
- **AGENTS.md §6** — Consolidated step-completion workflow with explicit user
  verification gate; removed dead `npm run lint` reference
- **AGENTS.md §8** — Strengthened `@Service()` mandate; added `ng generate`
  scaffolding rules
- **TypeScript alignment** — Backend and infra upgraded from `^5.5.0` to
  `~6.0.2` to match frontend
- **`package.json` engines** — Fixed `engines.node` from `>=20.0.0` to
  `>=22.22.3`

#### Removed

- `.agents/rules/phase-completion-checklist.md` — Contradicted AGENTS.md §6;
  content consolidated into the Step-Completion Workflow subsection

#### Added

- JSDoc comments on drive feature components (`FileBrowserComponent`,
  `FileListComponent`, `FolderTreeComponent`) and auth lifecycle hooks
- Cross-reference to `fnm-node-management.md` in AGENTS.md §6
- Explicit references to both `FE_IMPLEMENTATION_PLAN.md` and
  `IMPLEMENTATION_PLAN.md` in AGENTS.md §6

---

### Frontend Step 6 — File Browser ✅

**Commit**: `e46b9f0` — `feat(frontend): implement Step 6 — File Browser`

#### Added

- `FileBrowserComponent` — Split sidebar/content layout, drag-and-drop overlay,
  context menus for files and folders
- `FolderTreeComponent` — `mat-tree` with `childrenAccessor` API, active folder
  highlight, right-click context menu
- `FileListComponent` — Grid/list toggle, sortable columns, empty state, file
  action menu (download, rename, delete)
- `TrashComponent` placeholder route

---

### Frontend Step 5 — Dashboard & App Shell ✅

**Commit**: `53c4255` — `feat(dashboard): implement Step 5 — Dashboard & App Shell`

#### Added

- `ShellComponent` wrapping authenticated routes with navbar
- `DashboardComponent` — Welcome banner, stats cards (total files, storage
  used, folders), recent files list, quick action buttons
- `FileService` and `FolderService` stubs with mock data via signals

---

### Frontend Step 4 — Auth Feature ✅

**Commit**: `4f8a74f` — `feat(auth): implement Step 4 — Auth Feature`

#### Added

- `LandingComponent` — Auth landing page with sign-in options
- `LoginComponent` — Email/password form with Cognito Hosted UI option
- `RegisterComponent` — Two-step registration with 6-digit code verification
- `CognitoCallbackComponent` — OAuth redirect handler
- Auth routing with guards

---

### Frontend Step 3 — Shared Components ✅

**Commit**: `e161d5b` — `feat(frontend): implement Step 3 — shared components`

#### Added

- `NavbarComponent` — Search bar, theme toggle, view mode toggle, user menu
- `BreadcrumbComponent` — Folder path navigation
- `ToastService` — Material snackbar wrapper (success/error/info/warning)
- `ProgressBarComponent` — Status-based progress indicator
- `ContextMenuComponent` — Right-click floating menu
- `FileIconPipe` and `FileSizePipe`

---

### Frontend Steps 1 & 2 — Design System + Core Layer ✅

**Commit**: `2b9bdf8` — `feat(frontend): implement Step 1 & 2 — design system + core layer`

#### Added

- SCSS design system — Custom properties, dark/light theming, glassmorphism
  utilities, responsive breakpoints
- `FileItem` and `Folder` models
- `ApiService` — HTTP wrapper with centralized error handling
- `AuthService` — Stub implementation with localStorage + signals
- `authGuard` and `authInterceptor`
- `ViewStateService` — View mode and search query state

---

### Phase 0 — Environment Setup ✅

**Commit**: `61ade8e` — `chore: Phase 0 — initialize monorepo, Angular 22
frontend, CDK infra, LocalStack config`

#### Added

- **Monorepo structure** — npm workspaces with three packages:
  - `frontend/` — Angular 22 SPA (`@drive-lite/frontend`)
  - `backend/` — AWS Lambda handlers (`@drive-lite/backend`)
  - `infra/` — AWS CDK infrastructure (`@drive-lite/infra`)
- **Frontend scaffolding** — Angular 22.1.0 with standalone components, Vitest
- **Backend scaffolding** — ESM, AWS SDK v3 dependencies, `.gitkeep` placeholder
- **Infrastructure scaffolding** — CDK v2 with `.gitkeep` placeholders
- **LocalStack** — `docker-compose.yml` for local AWS services
- **Root configuration** — `.nvmrc`, `.editorconfig`, `.gitignore`, `README.md`
- **Documentation** — `docs/architecture.md`, `IMPLEMENTATION_PLAN.md`
- **Agent rules** — `.agents/AGENTS.md`

