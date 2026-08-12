<#
.SYNOPSIS
Integration tests for Drive Lite Lambda handlers.

.DESCRIPTION
This script tests all 12 Drive Lite Lambda handlers against LocalStack by invoking them directly via AWS CLI.
It verifies correct handler implementation without needing API Gateway.

.PREREQUISITES
- LocalStack running
- DriveLiteStack deployed to LocalStack (cdklocal deploy)
- AWS CLI installed

.EXAMPLE
.\test-lambdas.ps1
#>

$ErrorActionPreference = 'Stop'

# --- Environment Setup ---
$env:AWS_ACCESS_KEY_ID = 'test'
$env:AWS_SECRET_ACCESS_KEY = 'test'
$env:AWS_DEFAULT_REGION = 'us-east-1'
$ENDPOINT = 'http://localhost:4566'
$TEST_USER = 'test-user-smoke'

# Setup temp dir
$TempDir = Join-Path $PSScriptRoot '.test-temp'
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir | Out-Null
}

Write-Host "Fetching Table Name..." -ForegroundColor Cyan
$tableName = $null
try {
    $stackOutputs = aws --endpoint-url=$ENDPOINT cloudformation describe-stacks --stack-name DriveLiteStack --query 'Stacks[0].Outputs' --output json | ConvertFrom-Json
    $tableName = ($stackOutputs | Where-Object OutputKey -eq 'TableName').OutputValue
} catch {
    # Ignore error
}

if ([string]::IsNullOrWhiteSpace($tableName) -or $tableName -eq 'unknown') {
    $tableName = (aws --endpoint-url=$ENDPOINT dynamodb list-tables --query 'TableNames[0]' --output text).Trim()
}

Write-Host "Using Table: $tableName" -ForegroundColor Green

Write-Host "Cleaning up DynamoDB table..." -ForegroundColor Cyan
try {
    $scanResult = aws --endpoint-url=$ENDPOINT dynamodb scan --table-name $tableName --projection-expression "PK, SK" --output json | ConvertFrom-Json
    if ($scanResult.Items -and $scanResult.Items.Count -gt 0) {
        # DynamoDB batch-write-item has a 25-item limit per call
        $items = $scanResult.Items
        for ($i = 0; $i -lt $items.Count; $i += 25) {
            $batchSlice = $items[$i..([Math]::Min($i + 24, $items.Count - 1))]
            $requests = @()
            foreach ($item in $batchSlice) {
                $requests += @{
                    DeleteRequest = @{
                        Key = @{
                            PK = @{ S = $item.PK.S }
                            SK = @{ S = $item.SK.S }
                        }
                    }
                }
            }
            $batch = @{}
            $batch[$tableName] = $requests
            $batchFile = Join-Path $TempDir "batch-delete-$i.json"
            [System.IO.File]::WriteAllText($batchFile, ($batch | ConvertTo-Json -Depth 10))
            $batchFilePath = $batchFile -replace '\\', '/'
            aws --endpoint-url=$ENDPOINT dynamodb batch-write-item --request-items "file://$batchFilePath" | Out-Null
        }
        Write-Host "Deleted $($items.Count) items." -ForegroundColor Green
    } else {
        Write-Host "Table already empty." -ForegroundColor Green
    }
} catch {
    Write-Host "Failed to clean table: $_ Continuing..." -ForegroundColor Yellow
}

Write-Host "Fetching Lambda functions..." -ForegroundColor Cyan
$functionNames = aws --endpoint-url=$ENDPOINT lambda list-functions --query 'Functions[].FunctionName' --output json | ConvertFrom-Json

$functions = @{}
foreach ($fn in $functionNames) {
    if ($fn -match "PostConfirmation") { $functions["PostConfirmation"] = $fn }
    elseif ($fn -match "CreateFolder") { $functions["CreateFolder"] = $fn }
    elseif ($fn -match "ListFolders") { $functions["ListFolders"] = $fn }
    elseif ($fn -match "RenameFolder") { $functions["RenameFolder"] = $fn }
    elseif ($fn -match "DeleteFolder") { $functions["DeleteFolder"] = $fn }
    elseif ($fn -match "GetUploadUrl") { $functions["GetUploadUrl"] = $fn }
    elseif ($fn -match "ConfirmUpload") { $functions["ConfirmUpload"] = $fn }
    elseif ($fn -match "ListFiles") { $functions["ListFiles"] = $fn }
    elseif ($fn -match "GetFile") { $functions["GetFile"] = $fn }
    elseif ($fn -match "RenameFile") { $functions["RenameFile"] = $fn }
    elseif ($fn -match "GetDownloadUrl") { $functions["GetDownloadUrl"] = $fn }
    elseif ($fn -match "DeleteFile") { $functions["DeleteFile"] = $fn }
}

# Helper Function
function Invoke-Lambda {
    param (
        [string]$FunctionName,
        [hashtable]$Event,
        [switch]$IsApiGateway = $true
    )

    $payloadFile = Join-Path $TempDir "payload-$([guid]::NewGuid()).json"
    $outputFile = Join-Path $TempDir "output-$([guid]::NewGuid()).json"

    # API Gateway event wrapper
    if ($IsApiGateway) {
        $apiEvent = @{
            requestContext = @{
                authorizer = @{
                    jwt = @{
                        claims = @{
                            sub = $TEST_USER
                        }
                    }
                }
            }
            body = "{}"
        }
        if ($Event.ContainsKey("body")) {
            $apiEvent.body = ($Event.body | ConvertTo-Json -Depth 10 -Compress)
        }
        if ($Event.ContainsKey("pathParameters")) {
            $apiEvent.pathParameters = $Event.pathParameters
        }
        if ($Event.ContainsKey("queryStringParameters")) {
            $apiEvent.queryStringParameters = $Event.queryStringParameters
        }
        $Event = $apiEvent
    }

    # Write payload without BOM — PowerShell's Set-Content -Encoding utf8 adds BOM which breaks AWS CLI
    [System.IO.File]::WriteAllText($payloadFile, ($Event | ConvertTo-Json -Depth 10 -Compress))
    # AWS CLI file:// protocol requires forward slashes on Windows
    $payloadFilePath = $payloadFile -replace '\\', '/'
    $outputFilePath = $outputFile -replace '\\', '/'

    try {
        aws --endpoint-url=$ENDPOINT lambda invoke --function-name $FunctionName --cli-binary-format raw-in-base64-out --payload "file://$payloadFilePath" $outputFilePath | Out-Null
    } catch {
        throw "aws lambda invoke failed: $_"
    }

    $resultText = Get-Content $outputFile -Raw
    $result = $resultText | ConvertFrom-Json

    if ($IsApiGateway) {
        if (-not $result.PSObject.Properties.Match('statusCode').Count) {
            throw "Lambda response missing statusCode. Response: $resultText"
        }
        $parsedBody = $null
        if ($result.body) {
            try {
                $parsedBody = $result.body | ConvertFrom-Json
            } catch {
                $parsedBody = $result.body
            }
        }
        return @{
            statusCode = $result.statusCode
            body = $parsedBody
        }
    } else {
        return $result
    }
}

$TestResults = @()

function Run-Test {
    param (
        [string]$Name,
        [scriptblock]$Action
    )
    Write-Host "Running Test: $Name..." -NoNewline
    try {
        & $Action
        Write-Host " PASS" -ForegroundColor Green
        $script:TestResults += @{ Name = $Name; Status = "PASS" }
    } catch {
        Write-Host " FAIL" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Red
        $script:TestResults += @{ Name = $Name; Status = "FAIL" }
    }
}

# Variables to carry over
$folderAId = $null
$folderBId = $null
$fileId = $null
$uploadUrl = $null

Write-Host "`nStarting Tests...`n" -ForegroundColor Cyan

Run-Test "1: PostConfirmation" {
    $fn = $functions["PostConfirmation"]
    if (-not $fn) { throw "Function not found" }
    $payload = @{
        version = "1"
        triggerSource = "PostConfirmation_ConfirmSignUp"
        region = "us-east-1"
        userPoolId = "local_pool"
        userName = $TEST_USER
        callerContext = @{ awsSdkVersion = "test"; clientId = "test" }
        request = @{
            userAttributes = @{
                sub = $TEST_USER
                email = "smoke@test.com"
                email_verified = "true"
            }
        }
        response = @{}
    }
    $res = Invoke-Lambda -FunctionName $fn -Event $payload -IsApiGateway:$false
    if ($res.triggerSource -ne "PostConfirmation_ConfirmSignUp") {
        throw "Expected triggerSource PostConfirmation_ConfirmSignUp, got $($res.triggerSource)"
    }
}

Run-Test "2: CreateFolder (root)" {
    $fn = $functions["CreateFolder"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ body = @{ folderName = "Test Folder A"; parentFolderId = "ROOT" } }
    if ($res.statusCode -ne 201) { throw "Expected 201, got $($res.statusCode)" }
    if ($res.body.folderName -ne "Test Folder A") { throw "Expected folderName 'Test Folder A'" }
    $script:folderAId = $res.body.folderId
    if (-not $script:folderAId) { throw "No folderId returned" }
}

Run-Test "3: CreateFolder (nested)" {
    $fn = $functions["CreateFolder"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ body = @{ folderName = "Subfolder B"; parentFolderId = $script:folderAId } }
    if ($res.statusCode -ne 201) { throw "Expected 201, got $($res.statusCode)" }
    if ($res.body.parentFolderId -ne $script:folderAId) { throw "Expected parentFolderId $($script:folderAId)" }
    $script:folderBId = $res.body.folderId
}

Run-Test "4: ListFolders" {
    $fn = $functions["ListFolders"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ queryStringParameters = @{ parentFolderId = "ROOT" } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    $folders = $res.body.folders
    if ($folders.Count -lt 1) { throw "Expected at least 1 folder" }
    $found = $folders | Where-Object { $_.folderName -eq "Test Folder A" }
    if (-not $found) { throw "Did not find 'Test Folder A' in list" }
}

Run-Test "5: RenameFolder" {
    $fn = $functions["RenameFolder"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:folderBId }; body = @{ name = "Renamed Subfolder" } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.folderName -ne "Renamed Subfolder") { throw "Expected folderName 'Renamed Subfolder'" }
}

Run-Test "6: GetUploadUrl" {
    $fn = $functions["GetUploadUrl"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ body = @{ fileName = "test-doc.txt"; mimeType = "text/plain"; fileSize = 13; folderId = $script:folderAId } }
    if ($res.statusCode -ne 201) { throw "Expected 201, got $($res.statusCode)" }
    $script:fileId = $res.body.fileId
    $script:uploadUrl = $res.body.uploadUrl
    if (-not $script:fileId -or -not $script:uploadUrl) { throw "Missing fileId or uploadUrl" }
}

Run-Test "7: Upload file to S3" {
    if (-not $script:uploadUrl) { throw "Upload URL is missing" }
    
    # S3 presigned URLs in LocalStack use Docker-internal IPs (e.g. 172.18.0.2:4566)
    # or hostnames like s3.localhost.localstack.cloud which may not resolve from Windows.
    # Replace any host pointing to port 4566 with localhost:4566.
    $fixUrl = $script:uploadUrl -replace '(https?://)[^/:]+(:4566)', '${1}localhost${2}'
    
    $response = Invoke-WebRequest -Uri $fixUrl -Method Put -Body "Hello, Drive!" -ContentType "text/plain" -UseBasicParsing
    if ($response.StatusCode -ne 200) { throw "Expected 200 from S3, got $($response.StatusCode)" }
}

Run-Test "8: ConfirmUpload" {
    $fn = $functions["ConfirmUpload"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ body = @{ fileId = $script:fileId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.message -notmatch "confirmed") { throw "Message didn't contain 'confirmed'" }
}

Run-Test "9: ListFiles" {
    $fn = $functions["ListFiles"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ queryStringParameters = @{ folderId = $script:folderAId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    $files = $res.body.files
    if ($files.Count -lt 1) { throw "Expected at least 1 file" }
}

Run-Test "10: GetFile" {
    $fn = $functions["GetFile"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:fileId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.fileName -ne "test-doc.txt") { throw "Expected fileName 'test-doc.txt'" }
}

Run-Test "11: RenameFile" {
    $fn = $functions["RenameFile"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:fileId }; body = @{ name = "renamed-doc.txt" } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.fileName -ne "renamed-doc.txt") { throw "Expected fileName 'renamed-doc.txt'" }
}

Run-Test "12: GetDownloadUrl" {
    $fn = $functions["GetDownloadUrl"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:fileId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if (-not $res.body.downloadUrl) { throw "Missing downloadUrl" }
}

Run-Test "13: DeleteFile" {
    $fn = $functions["DeleteFile"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:fileId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.message -notmatch "deleted") { throw "Message didn't contain 'deleted'" }
}

Run-Test "14: GetFile (after delete - soft deleted)" {
    # DeleteFile does a SOFT delete for COMPLETED files (moves to TRASH# PK).
    # GetFile queries via GSI1 which still indexes the trashed item, so it returns 200.
    # The item should now have a deletedAt field indicating it was soft-deleted.
    $fn = $functions["GetFile"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:fileId } }
    if ($res.statusCode -ne 200) { throw "Expected 200 (soft-deleted item still in GSI1), got $($res.statusCode)" }
    if (-not $res.body.deletedAt) { throw "Expected deletedAt to be set on soft-deleted file" }
}

Run-Test "15: DeleteFolder" {
    $fn = $functions["DeleteFolder"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ pathParameters = @{ id = $script:folderAId } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    if ($res.body.message -notmatch "deleted") { throw "Message didn't contain 'deleted'" }
}

Run-Test "16: ListFolders (after delete)" {
    $fn = $functions["ListFolders"]
    $res = Invoke-Lambda -FunctionName $fn -Event @{ queryStringParameters = @{ parentFolderId = "ROOT" } }
    if ($res.statusCode -ne 200) { throw "Expected 200, got $($res.statusCode)" }
    $found = $res.body.folders | Where-Object { $_.folderName -eq "Test Folder A" }
    if ($found) { throw "Expected 'Test Folder A' to be gone" }
}

Write-Host "`n--- SUMMARY ---" -ForegroundColor Cyan
$passes = ($TestResults | Where-Object Status -eq "PASS").Count
$fails = ($TestResults | Where-Object Status -eq "FAIL").Count

$TestResults | ForEach-Object {
    $color = if ($_.Status -eq "PASS") { "Green" } else { "Red" }
    Write-Host "$($_.Status.PadRight(5)) - $($_.Name)" -ForegroundColor $color
}

Write-Host "`nTotal: $($TestResults.Count) | Pass: $passes | Fail: $fails" -ForegroundColor Cyan

# Cleanup
if (Test-Path $TempDir) {
    Remove-Item -Recurse -Force $TempDir
}

if ($fails -gt 0) {
    exit 1
} else {
    exit 0
}
