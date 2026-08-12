<#
.SYNOPSIS
Bootstraps a Cognito User Pool and Client in cognito-local for local development.

.DESCRIPTION
Checks if the 'drive-lite-local' Cognito User Pool and 'drive-lite-local-client'
User Pool Client exist in the cognito-local emulator. If they exist, retrieves
their IDs; otherwise creates them with USER_PASSWORD_AUTH flow enabled.
Saves the resulting IDs to frontend/src/environments/cognito-local.json.

.PARAMETER Endpoint
The cognito-local endpoint URL. Defaults to 'http://localhost:9230'.

.EXAMPLE
.\setup-cognito.ps1
Bootstraps Cognito resources using default cognito-local endpoint.
#>

[CmdletBinding()]
param (
    [string]$Endpoint = 'http://localhost:9230'
)

$ErrorActionPreference = 'Stop'

# Configure dummy AWS credentials for cognito-local
$env:AWS_ACCESS_KEY_ID = 'test'
$env:AWS_SECRET_ACCESS_KEY = 'test'
$env:AWS_DEFAULT_REGION = 'us-east-1'
$EP = $Endpoint

Write-Host "Connecting to cognito-local at $EP..." -ForegroundColor Cyan

# --- 1. User Pool Setup (Idempotent) ---
Write-Host ""
Write-Host "[1/3] Checking existing Cognito User Pools..." -ForegroundColor Cyan

$UserPoolId = $null
try {
    $poolsRaw = aws --endpoint-url=$EP cognito-idp list-user-pools --max-results 10 --output json 2>&1
    $poolsStr = $poolsRaw -join ""
    if ($poolsStr -and $poolsStr.StartsWith("{")) {
        $pools = $poolsStr | ConvertFrom-Json
        $existingPool = $pools.UserPools | Where-Object { $_.Name -eq 'drive-lite-local' }
        if ($existingPool) {
            $UserPoolId = $existingPool.Id
            Write-Host "  Found existing User Pool 'drive-lite-local' (ID: $UserPoolId)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  Failed to query User Pools. Is cognito-local running at ${EP}?" -ForegroundColor Red
    throw $_
}

if (-not $UserPoolId) {
    Write-Host "  Creating User Pool 'drive-lite-local'..." -ForegroundColor Yellow

    # Use a temp file for the policies JSON to avoid PowerShell quote-stripping
    $policiesJson = '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":true,"RequireLowercase":true,"RequireNumbers":true,"RequireSymbols":false}}'
    $schemaJson = '[{"Name":"email","Required":true,"Mutable":true,"AttributeDataType":"String"}]'

    $policiesFile = Join-Path $env:TEMP "cognito-policies.json"
    $schemaFile = Join-Path $env:TEMP "cognito-schema.json"
    [System.IO.File]::WriteAllText($policiesFile, $policiesJson)
    [System.IO.File]::WriteAllText($schemaFile, $schemaJson)

    $policiesPath = $policiesFile -replace '\\', '/'
    $schemaPath = $schemaFile -replace '\\', '/'

    try {
        $poolRaw = aws --endpoint-url=$EP cognito-idp create-user-pool `
            --pool-name "drive-lite-local" `
            --auto-verified-attributes email `
            --username-attributes email `
            --policies "file://$policiesPath" `
            --schema "file://$schemaPath" `
            --output json 2>&1
        $poolStr = $poolRaw -join ""
        $poolResult = $poolStr | ConvertFrom-Json
        $UserPoolId = $poolResult.UserPool.Id
        Write-Host "  Created User Pool 'drive-lite-local' (ID: $UserPoolId)" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to create User Pool." -ForegroundColor Red
        throw $_
    } finally {
        Remove-Item -Path $policiesFile -ErrorAction SilentlyContinue
        Remove-Item -Path $schemaFile -ErrorAction SilentlyContinue
    }
}

if (-not $UserPoolId) {
    Write-Host "  ERROR: UserPoolId is empty. Cannot proceed." -ForegroundColor Red
    exit 1
}

# --- 2. User Pool Client Setup (Idempotent) ---
Write-Host ""
Write-Host "[2/3] Checking existing User Pool Clients for pool $UserPoolId..." -ForegroundColor Cyan

$ClientId = $null
try {
    $clientsRaw = aws --endpoint-url=$EP cognito-idp list-user-pool-clients --user-pool-id $UserPoolId --max-results 10 --output json 2>&1
    $clientsStr = $clientsRaw -join ""
    if ($clientsStr -and $clientsStr.StartsWith("{")) {
        $clients = $clientsStr | ConvertFrom-Json
        $existingClient = $clients.UserPoolClients | Where-Object { $_.ClientName -eq 'drive-lite-local-client' }
        if ($existingClient) {
            $ClientId = $existingClient.ClientId
            Write-Host "  Found existing Client 'drive-lite-local-client' (ID: $ClientId)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  Failed to query User Pool Clients." -ForegroundColor Red
    throw $_
}

if (-not $ClientId) {
    Write-Host "  Creating User Pool Client 'drive-lite-local-client'..." -ForegroundColor Yellow
    try {
        $clientRaw = aws --endpoint-url=$EP cognito-idp create-user-pool-client `
            --user-pool-id $UserPoolId `
            --client-name "drive-lite-local-client" `
            --explicit-auth-flows "ALLOW_USER_PASSWORD_AUTH" "ALLOW_REFRESH_TOKEN_AUTH" `
            --no-generate-secret `
            --output json 2>&1
        $clientStr = $clientRaw -join ""
        $clientResult = $clientStr | ConvertFrom-Json
        $ClientId = $clientResult.UserPoolClient.ClientId
        Write-Host "  Created Client 'drive-lite-local-client' (ID: $ClientId)" -ForegroundColor Green
    } catch {
        Write-Host "  Failed to create User Pool Client." -ForegroundColor Red
        throw $_
    }
}

if (-not $ClientId) {
    Write-Host "  ERROR: ClientId is empty. Cannot proceed." -ForegroundColor Red
    exit 1
}

# --- 3. Output Summary and Save Config ---
Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "        Cognito Setup Complete                        " -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  UserPoolId: $UserPoolId" -ForegroundColor Green
Write-Host "  ClientId:   $ClientId" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Cyan

# Save generated IDs to frontend configuration JSON
$envDir = Join-Path $PSScriptRoot '..\frontend\src\environments'
if (-not (Test-Path $envDir)) {
    New-Item -ItemType Directory -Path $envDir -Force | Out-Null
}
$envFile = Join-Path $envDir 'cognito-local.json'

$configJson = @{ userPoolId = $UserPoolId; clientId = $ClientId } | ConvertTo-Json
[System.IO.File]::WriteAllText($envFile, $configJson)
Write-Host ""
Write-Host "Wrote Cognito IDs to: $envFile" -ForegroundColor Yellow

# Display next steps
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Update frontend/src/environments/environment.ts:" -ForegroundColor White
Write-Host "     cognitoUserPoolId: '$UserPoolId'" -ForegroundColor White
Write-Host "     cognitoClientId:   '$ClientId'" -ForegroundColor White
Write-Host "  2. Restart the Angular dev server" -ForegroundColor White
