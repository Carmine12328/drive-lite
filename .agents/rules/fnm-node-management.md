# fnm — Node.js Version Management

This project uses **fnm** (Fast Node Manager) for Node.js version management.
nvm-windows is installed but must NOT be used — it hangs in non-interactive
shells and requires admin elevation.

## Shell Initialization

Before running any `node`, `npm`, `npx`, or `ng` command, initialize fnm
in the current shell:

```powershell
# Refresh PATH (needed if fnm was recently installed via winget)
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "User") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "Machine")

# Activate fnm with auto-switching on directory change
fnm env --use-on-cd | Out-String | Invoke-Expression
```

After initialization, fnm reads `.nvmrc` and activates the correct Node.js
version automatically.

## Rules

1. **Never call `nvm` directly** — it hangs in non-interactive PowerShell.
   Use `fnm` for all version management.
2. **Always initialize fnm env** before running Node.js commands. Without it,
   the shell falls back to the system Node.js (which may be the wrong version).
3. **Check `.nvmrc`** in the project root for the required version (currently
   `22.22.3`).
4. **If a version isn't installed**, run `fnm install <version>` — fnm does
   not require admin elevation.
5. **After `winget install`**, refresh `$env:PATH` before using the new tool.
