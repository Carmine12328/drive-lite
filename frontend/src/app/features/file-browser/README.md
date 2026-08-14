# file-browser — Feature README

## What this module does

The core authenticated feature of Drive Lite. Renders the two-pane Drive UI:
a **folder tree sidebar** on the left and a **file list** on the right.
Handles file upload, preview, rename, delete, trash, and folder navigation.

## Key components and their responsibilities

| File | Responsibility |
|:-----|:---------------|
| `file-browser.component.ts` | Root shell: folder routing, drag-and-drop overlay, context menu coordination |
| `file-list/file-list.component.ts` | Grid/list toggle, skeleton loading, file action menu (download, rename, delete) |
| `folder-tree/folder-tree.component.ts` | `mat-tree` sidebar, active-folder highlight, trash badge, right-click rename/delete |
| `file-preview/file-preview.component.ts` | MIME-type-aware preview dialog: images, PDFs, text; keyboard gallery navigation |
| `upload-dialog/upload-dialog.component.ts` | Drag-and-drop + file picker upload UI; reads `Upload` service queue/progress signals |
| `trash/trash.component.ts` | Trash view: list, restore, permanent delete, empty trash |

## External dependencies (imports from outside this feature)

- `core/services/file.service.ts` — file CRUD, soft-delete, restore
- `core/services/folder.service.ts` — folder tree data
- `core/services/upload.ts` — 3-phase presigned upload queue
- `core/services/search.service.ts` — cross-folder search results
- `core/services/view-state.service.ts` — grid/list view mode
- `core/auth/auth.service.ts` — current userId for scoping requests
- `core/models/file-item.model.ts`, `core/models/folder.model.ts` — data shapes
- `shared/components/` — Navbar, Breadcrumb, ContextMenu, ConfirmDialog, InputDialog, Toast

## Entry point

Route `/drive` and `/drive/folder/:folderId` load `FileBrowserComponent` via
lazy import in `app.routes.ts`. The component reads `folderId` from route
params as an Angular input binding.

## Skill to read for new patterns

| Task | Skill |
|:-----|:------|
| Adding a dialog | `.agents/skills/angular-material-dialogs/SKILL.md` |
| Adding drag-and-drop | `.agents/skills/angular-drag-drop/SKILL.md` |
| Adding file preview | `.agents/skills/file-preview-rendering/SKILL.md` |
| Adding upload progress | `.agents/skills/s3-presigned-upload/SKILL.md` |
| Adding animations | `.agents/skills/angular-animations/SKILL.md` |
