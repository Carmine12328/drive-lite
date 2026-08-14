/**
 * Local API proxy for Drive Lite.
 *
 * Imports Lambda handlers directly and maps them to Express routes,
 * bypassing API Gateway and Cognito. This enables full FE + BE local
 * development without LocalStack Pro.
 *
 * Usage:
 *   npm run dev:api          (from backend/)
 *   # or from repo root:
 *   npm run dev:api -w backend
 *
 * Prerequisites:
 *   - LocalStack running (docker compose up -d)
 *   - DriveLiteStack deployed (cdklocal deploy)
 *   - Environment variables set (see below)
 *
 * Auth:
 *   The proxy extracts userId (sub) and email from the JWT in the
 *   Authorization header. If no token is present (e.g. curl without
 *   auth), falls back to 'local-dev-user' for backward compatibility.
 *
 * Environment:
 *   AWS_ENDPOINT_URL  — auto-set to http://localhost:4566
 *   TABLE_NAME        — resolved from LocalStack or override via env
 *   BUCKET_NAME       — resolved from LocalStack or override via env
 *   PORT              — server port (default: 3001)
 */

import express from 'express';
import type { Request, Response } from 'express';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  PostConfirmationConfirmSignUpTriggerEvent,
} from 'aws-lambda';


// ---------------------------------------------------------------------------
// Resolve infrastructure names from LocalStack before importing handlers.
// Handlers import config.ts at module scope, which reads TABLE_NAME/BUCKET_NAME
// from process.env — so these must be set before any handler import.
// ---------------------------------------------------------------------------

/** Query LocalStack for deployed stack resource names. */
async function resolveStackOutputs(): Promise<void> {
  // Set endpoint for SDK clients used by handlers
  process.env['AWS_ENDPOINT_URL'] ??= 'http://localhost:4566';
  process.env['AWS_ACCESS_KEY_ID'] ??= 'test';
  process.env['AWS_SECRET_ACCESS_KEY'] ??= 'test';
  process.env['AWS_REGION'] ??= 'us-east-1';
  process.env['ALLOWED_ORIGINS'] ??= 'http://localhost:4200';

  if (!process.env['TABLE_NAME'] || !process.env['BUCKET_NAME']) {
    console.log('Resolving TABLE_NAME and BUCKET_NAME from LocalStack...');
    const { DynamoDBClient, ListTablesCommand } = await import('@aws-sdk/client-dynamodb');
    const { S3Client, ListBucketsCommand } = await import('@aws-sdk/client-s3');

    const ddb = new DynamoDBClient({ region: 'us-east-1' });
    const s3 = new S3Client({ region: 'us-east-1', forcePathStyle: true });

    if (!process.env['TABLE_NAME']) {
      const tables = await ddb.send(new ListTablesCommand({}));
      const tableName = tables.TableNames?.find(t => t.includes('MetadataTable'));
      if (!tableName) throw new Error('Could not find DynamoDB table in LocalStack');
      process.env['TABLE_NAME'] = tableName;
      console.log(`  TABLE_NAME = ${tableName}`);
    }

    if (!process.env['BUCKET_NAME']) {
      const buckets = await s3.send(new ListBucketsCommand({}));
      const bucket = buckets.Buckets?.find(b => b.Name?.includes('filesbucket'));
      if (!bucket?.Name) throw new Error('Could not find S3 bucket in LocalStack');
      process.env['BUCKET_NAME'] = bucket.Name;
      console.log(`  BUCKET_NAME = ${bucket.Name}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Express ↔ Lambda adapter
// ---------------------------------------------------------------------------

/**
 * Extract the user ID from a JWT.
 */
function extractUserIdFromJwt(authHeader?: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return 'local-dev-user';
  }
  try {
    const payloadB64 = authHeader.split('.')[1];
    if (!payloadB64) return 'local-dev-user';
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString();
    const payload = JSON.parse(payloadJson);
    return payload.sub || 'local-dev-user';
  } catch {
    return 'local-dev-user';
  }
}

/**
 * Extract the email from a JWT.
 */
function extractEmailFromJwt(authHeader?: string): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return 'unknown@local.dev';
  }
  try {
    const payloadB64 = authHeader.split('.')[1];
    if (!payloadB64) return 'unknown@local.dev';
    const payloadJson = Buffer.from(payloadB64, 'base64url').toString();
    const payload = JSON.parse(payloadJson);
    return payload.email || 'unknown@local.dev';
  } catch {
    return 'unknown@local.dev';
  }
}


/**
 * Build an API Gateway v2 event from an Express request.
 * Injects mock JWT claims so handlers see an authenticated user.
 */
function toApiGatewayEvent(req: Request): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${req.method} ${req.route?.path ?? req.path}`,
    rawPath: req.path,
    rawQueryString: req.url.includes('?') ? req.url.split('?')[1]! : '',
    headers: req.headers as Record<string, string>,
    queryStringParameters: Object.keys(req.query).length > 0
      ? req.query as Record<string, string>
      : undefined,
    pathParameters: Object.keys(req.params).length > 0
      ? req.params as Record<string, string>
      : undefined,
    body: req.body ? JSON.stringify(req.body) : undefined,
    isBase64Encoded: false,
    requestContext: {
      accountId: '000000000000',
      apiId: 'local',
      authorizer: {
        jwt: {
          claims: {
            sub: extractUserIdFromJwt(req.headers.authorization),
            email: extractEmailFromJwt(req.headers.authorization),
            email_verified: 'true',
          },
          scopes: [],
        },
      },
      domainName: 'localhost',
      domainPrefix: 'local',
      http: {
        method: req.method,
        path: req.path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: req.get('user-agent') ?? '',
      },
      requestId: crypto.randomUUID(),
      routeKey: `${req.method} ${req.path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    // Required by the type but not used by our handlers
    stageVariables: undefined,
  } as unknown as APIGatewayProxyEventV2;
}

/**
 * Wrap a Lambda handler as an Express route handler.
 * Converts the Express request into an API Gateway event, invokes the handler,
 * and writes the Lambda response back to Express.
 */
function lambdaRoute(
  handler: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2>
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const event = toApiGatewayEvent(req);
      const result = await handler(event);

      // API Gateway response → Express response
      const lambdaResult = typeof result === 'string'
        ? { statusCode: 200, body: result }
        : result as { statusCode: number; headers?: Record<string, string>; body?: string };

      // Set response headers (skip CORS — Express middleware handles it)
      if (lambdaResult.headers) {
        for (const [key, value] of Object.entries(lambdaResult.headers)) {
          if (!key.toLowerCase().startsWith('access-control-')) {
            res.setHeader(key, value);
          }
        }
      }

      res.status(lambdaResult.statusCode);
      if (lambdaResult.body) {
        // Rewrite Docker-internal IPs in presigned S3 URLs so the browser
        // can reach LocalStack. Container IPs like 172.18.0.2:4566 are
        // unreachable from the host — replace with localhost:4566.
        const rewrittenBody = lambdaResult.body.replace(
          /https?:\/\/[^/:"\s]+:4566/g,
          'http://localhost:4566'
        );
        res.send(rewrittenBody);
      } else {
        res.end();
      }
    } catch (err) {
      console.error('Unhandled proxy error:', err);
      res.status(500).json({ message: 'Proxy error', error: String(err) });
    }
  };
}

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // 1. Resolve env vars from LocalStack BEFORE importing handlers
  await resolveStackOutputs();

  // 2. Dynamic imports — handlers read config at module scope
  const { handler: createFolder }   = await import('./handlers/folders/create-folder.js');
  const { handler: listFolders }    = await import('./handlers/folders/list-folders.js');
  const { handler: renameFolder }   = await import('./handlers/folders/rename-folder.js');
  const { handler: deleteFolder }   = await import('./handlers/folders/delete-folder.js');
  const { handler: getUploadUrl }   = await import('./handlers/files/get-upload-url.js');
  const { handler: confirmUpload }  = await import('./handlers/files/confirm-upload.js');
  const { handler: getDownloadUrl } = await import('./handlers/files/get-download-url.js');
  const { handler: listFiles }      = await import('./handlers/files/list-files.js');
  const { handler: getFile }        = await import('./handlers/files/get-file.js');
  const { handler: renameFile }     = await import('./handlers/files/rename-file.js');
  const { handler: deleteFile }     = await import('./handlers/files/delete-file.js');
  const { handler: recentFiles }    = await import('./handlers/files/recent-files.js');
  const { handler: listTrash }      = await import('./handlers/files/list-trash.js');
  const { handler: restoreFile }    = await import('./handlers/files/restore-file.js');
  const { handler: permanentDeleteFile } = await import('./handlers/files/permanent-delete-file.js');
  const { handler: emptyTrash }     = await import('./handlers/files/empty-trash.js');
  const { handler: createShare }    = await import('./handlers/shares/create-share.js');
  const { handler: getShare }       = await import('./handlers/shares/get-share.js');
  const { handler: downloadShare }  = await import('./handlers/shares/download-share.js');
  const { handler: listShares }     = await import('./handlers/shares/list-shares.js');
  const { handler: revokeShare }    = await import('./handlers/shares/revoke-share.js');
  const { handler: listVersions }   = await import('./handlers/files/list-versions.js');
  const { handler: rollbackVersion } = await import('./handlers/files/rollback-version.js');
  const { handler: summarizeFile }  = await import('./handlers/files/summarize-file.js');
  const { handler: postConfirmation } = await import('./handlers/auth/post-confirmation.js');

  // 3. Express app
  const app = express();
  app.use(express.json());

  // CORS — allow Angular dev server
  app.use((_req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env['ALLOWED_ORIGINS'] ?? 'http://localhost:4200');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    if (_req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // 4. Route mapping — mirrors api-construct.ts exactly
  // Folders
  app.post('/folders',      lambdaRoute(createFolder));
  app.get('/folders',       lambdaRoute(listFolders));
  app.patch('/folders/:id', lambdaRoute(renameFolder));
  app.delete('/folders/:id', lambdaRoute(deleteFolder));

  // Shares (specific routes before parameterized files)
  app.post('/files/:id/share',       lambdaRoute(createShare));
  app.get('/files/:id/shares',       lambdaRoute(listShares));
  app.get('/share/:token',           lambdaRoute(getShare));
  app.post('/share/:token/download', lambdaRoute(downloadShare));
  app.delete('/share/:token',        lambdaRoute(revokeShare));

  // Versions & Summarization (specific routes before parameterized files)
  app.get('/files/:id/versions',     lambdaRoute(listVersions));
  app.post('/files/:id/rollback',    lambdaRoute(rollbackVersion));
  app.post('/files/:id/summarize',   lambdaRoute(summarizeFile));

  // Files — specific routes BEFORE parameterized routes
  app.post('/files/upload-url',       lambdaRoute(getUploadUrl));
  app.post('/files/confirm-upload',   lambdaRoute(confirmUpload));
  app.post('/files/:id/download-url', lambdaRoute(getDownloadUrl));
  app.post('/files/:id/restore',      lambdaRoute(restoreFile));

  app.get('/files/recent',            lambdaRoute(recentFiles));
  app.get('/files',                   lambdaRoute(listFiles));
  app.get('/files/:id',               lambdaRoute(getFile));
  app.patch('/files/:id',             lambdaRoute(renameFile));
  app.delete('/files/:id',            lambdaRoute(deleteFile));


  // Trash
  app.get('/trash/files',             lambdaRoute(listTrash));
  app.delete('/trash/files/:id',      lambdaRoute(permanentDeleteFile));
  app.delete('/trash/files',          lambdaRoute(emptyTrash));


  // Auth — profile initialization after sign-up confirmation
  app.post('/auth/init-profile', async (req: Request, res: Response) => {
    try {
      const { userId, email } = req.body as { userId: string; email: string };
      if (!userId || !email) {
        res.status(400).json({ message: 'userId and email are required' });
        return;
      }

      // Construct a Cognito PostConfirmation trigger event
      const event = {
        version: '1',
        triggerSource: 'PostConfirmation_ConfirmSignUp' as const,
        region: 'us-east-1',
        userPoolId: 'local',
        userName: userId,
        callerContext: { awsSdkVersion: 'local-proxy', clientId: 'local' },
        request: {
          userAttributes: {
            sub: userId,
            email,
            email_verified: 'true',
          },
        },
        response: {},
      };

      await postConfirmation(event as unknown as PostConfirmationConfirmSignUpTriggerEvent);
      console.log(`Profile initialized for user ${userId} (${email})`);

      res.json({ message: 'Profile initialized', userId });
    } catch (err) {
      console.error('init-profile error:', err);
      res.status(500).json({ message: 'Failed to initialize profile', error: String(err) });
    }
  });

  // Auth — dev-only: retrieve the confirmation code from cognito-local's data file.
  // cognito-local stores user data in .cognito/db/<poolId>.json on the host filesystem.
  // This endpoint reads that file so the frontend can log the code to the console,
  // giving developers a near-real signup experience without digging through JSON files.
  app.get('/auth/confirmation-code', async (req: Request, res: Response) => {
    try {
      const email = req.query['email'] as string;
      if (!email) {
        res.status(400).json({ message: 'email query parameter is required' });
        return;
      }

      const { readdir, readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');

      // The .cognito/db/ directory is at the repo root, one level up from
      // backend/ where the Express proxy runs (process.cwd() = backend/).
      const cognitoDbDir = join(process.cwd(), '..', '.cognito', 'db');
      const files = await readdir(cognitoDbDir);
      const poolFiles = files.filter(f => f.endsWith('.json') && f !== 'clients.json');

      for (const poolFile of poolFiles) {
        const raw = await readFile(join(cognitoDbDir, poolFile), 'utf-8');
        const pool = JSON.parse(raw);
        const users = pool.Users ?? {};

        for (const user of Object.values(users) as Array<Record<string, unknown>>) {
          const attrs = (user['Attributes'] ?? []) as Array<{ Name: string; Value: string }>;
          const emailAttr = attrs.find(a => a.Name === 'email');
          if (emailAttr?.Value === email && user['ConfirmationCode']) {
            res.json({ code: user['ConfirmationCode'] });
            return;
          }
        }
      }

      res.status(404).json({ message: 'No pending confirmation code found for this email' });
    } catch (err) {
      console.error('confirmation-code error:', err);
      res.status(500).json({ message: 'Failed to read confirmation code', error: String(err) });
    }
  });

  // Health check
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      user: 'JWT-based',
      table: process.env['TABLE_NAME'],
      bucket: process.env['BUCKET_NAME'],
    });
  });

  // 5. Start
  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  app.listen(port, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║          Drive Lite — Local API Proxy               ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  URL:       http://localhost:${port}                    ║`);
    console.log(`║  User:      ${'JWT-based (fallback: local-dev-user)'.padEnd(40)}║`);
    console.log(`║  Table:     ${(process.env['TABLE_NAME'] ?? '').substring(0, 40).padEnd(40)}║`);
    console.log(`║  Bucket:    ${(process.env['BUCKET_NAME'] ?? '').substring(0, 40).padEnd(40)}║`);
    console.log(`║  Endpoint:  ${(process.env['AWS_ENDPOINT_URL'] ?? '').padEnd(40)}║`);
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log('║  Routes:                                            ║');
    console.log('║    POST   /auth/init-profile                        ║');
    console.log('║    GET    /auth/confirmation-code?email=             ║');
    console.log('║    POST   /folders                                  ║');
    console.log('║    GET    /folders                                  ║');
    console.log('║    PATCH  /folders/:id                              ║');
    console.log('║    DELETE /folders/:id                              ║');
    console.log('║    POST   /files/:id/share                          ║');
    console.log('║    GET    /files/:id/shares                         ║');
    console.log('║    GET    /share/:token                             ║');
    console.log('║    POST   /share/:token/download                    ║');
    console.log('║    DELETE /share/:token                             ║');
    console.log('║    POST   /files/upload-url                        ║');

    console.log('║    POST   /files/confirm-upload                    ║');
    console.log('║    POST   /files/:id/download-url                  ║');
    console.log('║    GET    /files                                    ║');
    console.log('║    GET    /files/:id                                ║');
    console.log('║    PATCH  /files/:id                                ║');
    console.log('║    DELETE /files/:id                                ║');
    console.log('║    GET    /health                                   ║');
    console.log('║    GET    /trash/files                               ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');
  });
}

main().catch((err) => {
  console.error('Failed to start local API proxy:', err);
  process.exit(1);
});
