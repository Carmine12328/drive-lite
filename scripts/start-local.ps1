<#
.SYNOPSIS
Boots the entire Drive Lite local development stack.

.DESCRIPTION
Starts all services in dependency order:
  1. Docker Compose  -- LocalStack (:4566) + cognito-local (:9230)
  2. Backend build   -- TypeScript to JavaScript
  3. CDK Local deploy -- provisions DynamoDB, S3, Lambda, API Gateway in LocalStack
  4. Cognito setup   -- creates User Pool + Client in cognito-local
  5. Backend proxy   -- Express server on :3001 (background job)
  6. Angular server  -- ng serve on :4200 (foreground, Ctrl+C to stop)

On exit (Ctrl+C), the script stops the background backend job.
Docker containers are left running by default for faster restarts.

.PARAMETER SkipDocker
Skip 'docker compose up'. Use when containers are already running.

.PARAMETER SkipDeploy
Skip 'cdklocal deploy'. Use when the stack is already deployed to LocalStack.

.PARAMETER SkipCognito
Skip Cognito User Pool/Client setup. Use when the pool already exists.

.PARAMETER KeepDocker
Leave Docker containers running on exit. This is the default behavior.
Pass -KeepDocker:$false to stop containers on Ctrl+C.

.EXAMPLE
.\scripts\start-local.ps1
Full cold start -- boots everything from scratch.

.EXAMPLE
.\scripts\start-local.ps1 -SkipDocker -SkipDeploy -SkipCognito
Fast restart -- containers and stack already running, just (re)start FE + BE.
#>

[CmdletBinding()]
param (
    [switch]$SkipDocker,
    [switch]$SkipDeploy,
    [switch]$SkipCognito,
    [switch]$KeepDocker = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Resolve repo root (script lives in <root>/scripts/)
# ---------------------------------------------------------------------------
$RepoRoot = Split-Path -Parent $PSScriptRoot
if (-not $RepoRoot) {
    # Fallback: if invoked from repo root directly
    $RepoRoot = $PSScriptRoot
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Phase {
    <#
    .SYNOPSIS
    Prints a phase header with consistent formatting.
    #>
    param (
        [Parameter(Mandatory)][int]$Number,
        [Parameter(Mandatory)][string]$Title
    )
    Write-Host ''
    Write-Host ('=' * 56) -ForegroundColor DarkCyan
    Write-Host "  Phase $Number -- $Title" -ForegroundColor Cyan
    Write-Host ('=' * 56) -ForegroundColor DarkCyan
}

function Write-Ok {
    <#
    .SYNOPSIS
    Prints a success message.
    #>
    param ([Parameter(Mandatory)][string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Skip {
    <#
    .SYNOPSIS
    Prints a skip message.
    #>
    param ([Parameter(Mandatory)][string]$Message)
    Write-Host "  [SKIP] $Message" -ForegroundColor Yellow
}

function Write-Err {
    <#
    .SYNOPSIS
    Prints an error message.
    #>
    param ([Parameter(Mandatory)][string]$Message)
    Write-Host "  [ERR] $Message" -ForegroundColor Red
}

function Wait-ForEndpoint {
    <#
    .SYNOPSIS
    Polls an HTTP endpoint until it returns a success status code.

    .PARAMETER Uri
    The URL to poll.

    .PARAMETER Label
    Human-readable name for the service (used in log messages).

    .PARAMETER TimeoutSeconds
    Maximum seconds to wait before failing.

    .PARAMETER IntervalSeconds
    Seconds between poll attempts.
    #>
    param (
        [Parameter(Mandatory)][string]$Uri,
        [Parameter(Mandatory)][string]$Label,
        [int]$TimeoutSeconds = 60,
        [int]$IntervalSeconds = 3
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0

    while ((Get-Date) -lt $deadline) {
        $attempt++
        try {
            $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) {
                Write-Ok "$Label is ready (attempt $attempt)"
                return
            }
        } catch {
            # Swallow -- service not up yet
        }
        Write-Host "    Waiting for $Label... (attempt $attempt)" -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSeconds
    }

    throw "$Label did not become ready within ${TimeoutSeconds}s at $Uri"
}

function Wait-ForTcpPort {
    <#
    .SYNOPSIS
    Polls a TCP port until a connection can be established.
    Use for services that don't expose an HTTP health endpoint.

    .PARAMETER Port
    TCP port number to check.

    .PARAMETER Label
    Human-readable name for the service.

    .PARAMETER TimeoutSeconds
    Maximum seconds to wait.

    .PARAMETER IntervalSeconds
    Seconds between attempts.
    #>
    param (
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][string]$Label,
        [int]$TimeoutSeconds = 30,
        [int]$IntervalSeconds = 3
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0

    while ((Get-Date) -lt $deadline) {
        $attempt++
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $tcp.Connect('127.0.0.1', $Port)
            $tcp.Close()
            Write-Ok "$Label is ready on port $Port (attempt $attempt)"
            return
        } catch {
            # Port not open yet
        }
        Write-Host "    Waiting for $Label... (attempt $attempt)" -ForegroundColor DarkGray
        Start-Sleep -Seconds $IntervalSeconds
    }

    throw "$Label did not become ready within ${TimeoutSeconds}s on port $Port"
}

# ---------------------------------------------------------------------------
# 0. Environment preamble
# ---------------------------------------------------------------------------

Write-Host ''
Write-Host '+----------------------------------------------------------+' -ForegroundColor Magenta
Write-Host '|        Drive Lite -- Local Development Stack             |' -ForegroundColor Magenta
Write-Host '+----------------------------------------------------------+' -ForegroundColor Magenta
Write-Host ''

# Activate fnm so all subsequent Node commands use the pinned version
$fnmDir = 'C:\Users\User\AppData\Local\Microsoft\WinGet\Packages\Schniz.fnm_Microsoft.Winget.Source_8wekyb3d8bbwe'
if (Test-Path $fnmDir) {
    $env:PATH = "$fnmDir;$env:PATH"
    fnm use 22.22.3 2>$null
    fnm env --use-on-cd | Out-String | Invoke-Expression
    $nv = node --version
    Write-Ok "Node $nv activated via fnm"
} else {
    # fnm not at expected path -- check if node is already correct version
    try {
        $nodeVersion = node --version 2>$null
        if ($nodeVersion -match '22\.22') {
            Write-Ok "Node $nodeVersion already active"
        } else {
            Write-Err "Node $nodeVersion is active but 22.22.x is required. Install fnm or activate the correct version."
            exit 1
        }
    } catch {
        Write-Err 'Node.js not found. Install fnm and Node 22.22.3.'
        exit 1
    }
}

# Source .env for LOCALSTACK_AUTH_TOKEN (docker compose reads it automatically,
# but we set it in-process so the variable is available if needed).
$envFile = Join-Path $RepoRoot '.env'
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+?)\s*=\s*(.+)\s*$') {
            [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], 'Process')
        }
    }
    Write-Ok 'Loaded .env'
} else {
    Write-Host '  [WARN] No .env file found -- LOCALSTACK_AUTH_TOKEN may be missing' -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# Track background jobs for cleanup
# ---------------------------------------------------------------------------
$backendJob = $null

try {
    # -----------------------------------------------------------------------
    # 1. Docker Compose
    # -----------------------------------------------------------------------
    Write-Phase -Number 1 -Title 'Docker Compose (LocalStack + Cognito)'

    if ($SkipDocker) {
        Write-Skip 'Docker Compose (containers assumed running)'
    } else {
        # Verify docker is available
        $dockerPath = Get-Command docker -ErrorAction SilentlyContinue
        if (-not $dockerPath) {
            Write-Err 'docker not found on PATH. Is Docker Desktop / Rancher Desktop running?'
            exit 1
        }

        Write-Host '  Starting containers...' -ForegroundColor Gray
        docker compose -f (Join-Path $RepoRoot 'docker-compose.yml') up -d
        if ($LASTEXITCODE -ne 0) {
            throw "docker compose up failed (exit code $LASTEXITCODE)"
        }
        Write-Ok 'Containers started'

        # Wait for LocalStack
        Wait-ForEndpoint `
            -Uri 'http://localhost:4566/_localstack/health' `
            -Label 'LocalStack' `
            -TimeoutSeconds 60

        # Wait for cognito-local (no HTTP health endpoint -- use TCP port check)
        Wait-ForTcpPort `
            -Port 9230 `
            -Label 'cognito-local' `
            -TimeoutSeconds 30
    }

    # -----------------------------------------------------------------------
    # 2. Backend build
    # -----------------------------------------------------------------------
    Write-Phase -Number 2 -Title 'Backend Build (TypeScript)'

    Write-Host '  Compiling backend...' -ForegroundColor Gray
    Push-Location $RepoRoot
    try {
        npm run build -w backend
        if ($LASTEXITCODE -ne 0) {
            throw "Backend build failed (exit code $LASTEXITCODE)"
        }
        Write-Ok 'Backend compiled'
    } finally {
        Pop-Location
    }

    # -----------------------------------------------------------------------
    # 3. CDK Local Deploy
    # -----------------------------------------------------------------------
    Write-Phase -Number 3 -Title 'CDK Local Deploy'

    if ($SkipDeploy) {
        Write-Skip 'CDK deploy (stack assumed deployed)'
    } else {
        Write-Host '  Deploying stack to LocalStack...' -ForegroundColor Gray
        Push-Location (Join-Path $RepoRoot 'infra')
        try {
            # Set dummy AWS credentials for cdklocal
            $env:AWS_ACCESS_KEY_ID = 'test'
            $env:AWS_SECRET_ACCESS_KEY = 'test'
            $env:AWS_DEFAULT_REGION = 'us-east-1'

            # Bootstrap the CDK environment in LocalStack (idempotent -- safe to re-run)
            Write-Host '  Bootstrapping CDK in LocalStack...' -ForegroundColor Gray
            npx cdklocal bootstrap aws://000000000000/us-east-1 --require-approval never
            if ($LASTEXITCODE -ne 0) {
                throw "cdklocal bootstrap failed (exit code $LASTEXITCODE)"
            }
            Write-Ok 'CDK bootstrap complete'

            # Deploy the stack (--require-approval never avoids interactive prompts
            # from runtime deprecation warnings)
            npx cdklocal deploy --require-approval never
            if ($LASTEXITCODE -ne 0) {
                throw "cdklocal deploy failed (exit code $LASTEXITCODE)"
            }
            Write-Ok 'Stack deployed to LocalStack'
        } finally {
            Pop-Location
        }
    }

    # -----------------------------------------------------------------------
    # 4. Cognito Setup
    # -----------------------------------------------------------------------
    Write-Phase -Number 4 -Title 'Cognito Setup'

    if ($SkipCognito) {
        Write-Skip 'Cognito setup (pool assumed exists)'
    } else {
        $cognitoScript = Join-Path (Join-Path $RepoRoot 'scripts') 'setup-cognito.ps1'
        if (Test-Path $cognitoScript) {
            Write-Host '  Running setup-cognito.ps1...' -ForegroundColor Gray
            powershell -ExecutionPolicy Bypass -File $cognitoScript
            if ($LASTEXITCODE -ne 0) {
                throw "Cognito setup failed (exit code $LASTEXITCODE)"
            }
            Write-Ok 'Cognito User Pool + Client ready'
        } else {
            Write-Err "scripts/setup-cognito.ps1 not found at $cognitoScript"
            exit 1
        }
    }

    # -----------------------------------------------------------------------
    # 5. Backend Express Proxy (background)
    # -----------------------------------------------------------------------
    Write-Phase -Number 5 -Title 'Backend API Proxy (:3001)'

    Write-Host '  Starting Express proxy in background...' -ForegroundColor Gray

    # Build the command that runs inside the background job.
    # The job needs its own fnm activation since it is a separate process.
    $beRoot = $RepoRoot -replace '\\', '\\'
    $beFnm = $fnmDir -replace '\\', '\\'
    $backendCmd = @"
Set-Location '$beRoot'
`$fd = '$beFnm'
if (Test-Path `$fd) {
    `$env:PATH = "`$fd;`$env:PATH"
    fnm use 22.22.3 2>`$null
    fnm env --use-on-cd | Out-String | Invoke-Expression
}
`$env:AWS_ACCESS_KEY_ID = 'test'
`$env:AWS_SECRET_ACCESS_KEY = 'test'
`$env:AWS_DEFAULT_REGION = 'us-east-1'
`$env:AWS_ENDPOINT_URL = 'http://localhost:4566'
npm run dev:api -w backend
"@

    $backendJob = Start-Job -ScriptBlock ([ScriptBlock]::Create($backendCmd))
    $bjId = $backendJob.Id
    Write-Host "  Backend job started (ID: $bjId)" -ForegroundColor DarkGray

    # Give the Express server a moment to bind
    Write-Host '  Waiting for backend to bind...' -ForegroundColor DarkGray
    $backendReady = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 2
        try {
            $resp = Invoke-WebRequest -Uri 'http://localhost:3001/health' -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                $backendReady = $true
                break
            }
        } catch {
            # Not ready yet -- check if the job failed
            if ($backendJob.State -eq 'Failed') {
                $jobOutput = Receive-Job $backendJob -ErrorAction SilentlyContinue
                Write-Err "Backend job failed: $jobOutput"
                throw 'Backend proxy failed to start'
            }
        }
    }

    if ($backendReady) {
        Write-Ok 'Backend proxy listening on http://localhost:3001'
    } else {
        # Dump whatever output the job has produced for debugging
        $jobOutput = Receive-Job $backendJob -ErrorAction SilentlyContinue
        Write-Err 'Backend proxy did not respond within 40s'
        if ($jobOutput) {
            Write-Host "  Job output: $jobOutput" -ForegroundColor DarkGray
        }
        throw 'Backend proxy did not become ready'
    }

    # -----------------------------------------------------------------------
    # 6. Angular Dev Server (foreground)
    # -----------------------------------------------------------------------
    Write-Phase -Number 6 -Title 'Angular Dev Server (:4200)'

    Write-Host ''
    Write-Host '+----------------------------------------------------------+' -ForegroundColor Green
    Write-Host '|  All services started!                                   |' -ForegroundColor Green
    Write-Host '|                                                          |' -ForegroundColor Green
    Write-Host '|  LocalStack:    http://localhost:4566                     |' -ForegroundColor Green
    Write-Host '|  Cognito:       http://localhost:9230                     |' -ForegroundColor Green
    Write-Host '|  Backend API:   http://localhost:3001                     |' -ForegroundColor Green
    Write-Host '|  Frontend:      http://localhost:4200  (starting...)      |' -ForegroundColor Green
    Write-Host '|                                                          |' -ForegroundColor Green
    Write-Host '|  Press Ctrl+C to stop                                    |' -ForegroundColor Green
    Write-Host '+----------------------------------------------------------+' -ForegroundColor Green
    Write-Host ''

    # Run ng serve in the foreground so the user sees live output
    Push-Location $RepoRoot
    try {
        npm run dev -w frontend
    } finally {
        Pop-Location
    }

} finally {
    # -------------------------------------------------------------------
    # Cleanup
    # -------------------------------------------------------------------
    Write-Host ''
    Write-Host 'Shutting down...' -ForegroundColor Yellow

    # Stop backend background job
    if ($backendJob) {
        $bjId = $backendJob.Id
        Write-Host "  Stopping backend proxy (Job $bjId)..." -ForegroundColor Gray
        Stop-Job $backendJob -ErrorAction SilentlyContinue
        Remove-Job $backendJob -Force -ErrorAction SilentlyContinue
        Write-Ok 'Backend proxy stopped'
    }

    # Optionally stop Docker containers
    if (-not $KeepDocker) {
        Write-Host '  Stopping Docker containers...' -ForegroundColor Gray
        docker compose -f (Join-Path $RepoRoot 'docker-compose.yml') down
        Write-Ok 'Docker containers stopped'
    } else {
        Write-Host '  Docker containers left running (use -KeepDocker:$false to stop)' -ForegroundColor DarkGray
    }

    Write-Host ''
    Write-Host 'Done.' -ForegroundColor Cyan
}
