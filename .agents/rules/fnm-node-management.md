# fnm Node Version Management

This workspace uses **fnm** (Fast Node Manager) for Node.js version management.
**Never use nvm** — it is not installed.

## fnm Location

fnm is installed via winget at:
```
C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe
```

This path is NOT on the shell PATH by default in this tool's context.

## Required Preamble for Node/Angular Commands

Before running any command that depends on Node.js (e.g., `ng serve`, `ng build`,
`npm run`, `npx`), prepend this activation block:

```powershell
$fnmDir = "C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe"
$env:PATH = "$fnmDir;$env:PATH"
fnm use 22.22.3
fnm env --use-on-cd | Out-String | Invoke-Expression
```

## Key Facts

- The `.nvmrc` file pins Node **22.22.3**.
- The system default Node is **v22.16.0**, which is too old for Angular 22.
- Angular CLI will refuse to run on Node < 22.22.3 with a hard error.
- fnm already has Node 22.22.3 installed — no download needed.
