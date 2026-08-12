import * as path from 'path';
import { fileURLToPath } from 'url';
import { Construct } from 'constructs';
import { Duration, Stack } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

// For ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Properties for ApiConstruct
 */
export interface ApiConstructProps {
  /** DynamoDB table for metadata */
  table: dynamodb.ITableV2;
  /** S3 bucket for file storage */
  bucket: s3.IBucket;
  /** Cognito User Pool for JWT authorization */
  userPool: cognito.IUserPool;
  /** Cognito User Pool Client */
  userPoolClient: cognito.IUserPoolClient;
}

/**
 * API construct: API Gateway HTTP API, Lambda functions, integrations.
 */
export class ApiConstruct extends Construct {
  /** The HTTP API Gateway */
  public readonly api: HttpApi;
  /** The post-confirmation Lambda (to be wired as Cognito trigger) */
  public readonly postConfirmationHandler: lambda.Function;

  /**
   * Initialize ApiConstruct
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Construct properties
   */
  constructor(scope: Construct, id: string, props: ApiConstructProps) {
    super(scope, id);

    // JWT Authorizer
    const authorizer = new HttpJwtAuthorizer('CognitoAuthorizer',
      `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.userPoolClient.userPoolClientId],
      }
    );

    // HTTP API
    this.api = new HttpApi(this, 'HttpApi', {
      apiName: 'drive-lite-api',
      corsPreflight: {
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: [
          CorsHttpMethod.GET, CorsHttpMethod.POST,
          CorsHttpMethod.PUT, CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE, CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ['http://localhost:4200'],
        maxAge: Duration.hours(1),
      },
    });

    // Shared Lambda environment
    const lambdaEnvironment: Record<string, string> = {
      TABLE_NAME: props.table.tableName,
      BUCKET_NAME: props.bucket.bucketName,
      REGION: Stack.of(this).region,
      ALLOWED_ORIGINS: 'http://localhost:4200',
    };

    // Helper to create Lambda functions
    const createHandler = (name: string, entry: string, timeout = 30): NodejsFunction => {
      return new NodejsFunction(this, name, {
        entry: path.join(__dirname, entry),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 256,
        timeout: Duration.seconds(timeout),
        environment: lambdaEnvironment,
        bundling: {
          format: OutputFormat.ESM,
          mainFields: ['module', 'main'],
          banner: "import { createRequire } from 'module';const require = createRequire(import.meta.url);",
          // Externalize SDK for Lambda runtime (reduces bundle size)
          externalModules: ['@aws-sdk/*'],
        },
      });
    };

    // NOTE: Entry paths are relative to __dirname (infra/lib/)
    // Handlers are at ../../backend/src/handlers/<domain>/<name>.ts

    // --- Folder Handlers ---
    const createFolder = createHandler('CreateFolderFn', '../../backend/src/handlers/folders/create-folder.ts');
    const listFolders = createHandler('ListFoldersFn', '../../backend/src/handlers/folders/list-folders.ts');
    const renameFolder = createHandler('RenameFolderFn', '../../backend/src/handlers/folders/rename-folder.ts');
    const deleteFolder = createHandler('DeleteFolderFn', '../../backend/src/handlers/folders/delete-folder.ts');

    // --- File Handlers ---
    const getUploadUrl = createHandler('GetUploadUrlFn', '../../backend/src/handlers/files/get-upload-url.ts');
    const confirmUpload = createHandler('ConfirmUploadFn', '../../backend/src/handlers/files/confirm-upload.ts');
    const getDownloadUrl = createHandler('GetDownloadUrlFn', '../../backend/src/handlers/files/get-download-url.ts');
    const listFiles = createHandler('ListFilesFn', '../../backend/src/handlers/files/list-files.ts');
    const getFile = createHandler('GetFileFn', '../../backend/src/handlers/files/get-file.ts');
    const renameFile = createHandler('RenameFileFn', '../../backend/src/handlers/files/rename-file.ts');
    const deleteFile = createHandler('DeleteFileFn', '../../backend/src/handlers/files/delete-file.ts');
    const recentFiles = createHandler('RecentFilesFn', '../../backend/src/handlers/files/recent-files.ts');

    // --- Auth Handler (Cognito trigger, not an API route) ---
    this.postConfirmationHandler = createHandler(
      'PostConfirmationFn',
      '../../backend/src/handlers/auth/post-confirmation.ts'
    );

    // --- IAM Permissions ---
    // All handlers get DynamoDB read/write
    const allHandlers = [
      createFolder, listFolders, renameFolder, deleteFolder,
      getUploadUrl, confirmUpload, getDownloadUrl,
      listFiles, getFile, renameFile, deleteFile, recentFiles,
      this.postConfirmationHandler,
    ];
    for (const fn of allHandlers) {
      props.table.grantReadWriteData(fn);
    }

    // S3 permissions (only handlers that need them)
    props.bucket.grantPut(getUploadUrl);     // PutObject for presigned URLs
    props.bucket.grantRead(getDownloadUrl);  // GetObject for presigned URLs
    props.bucket.grantRead(confirmUpload);   // HeadObject to verify upload
    props.bucket.grantDelete(deleteFile);    // DeleteObject for cleanup

    // --- API Routes (all behind JWT authorizer) ---
    // Folders
    this.api.addRoutes({
      path: '/folders',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('CreateFolderIntegration', createFolder),
      authorizer,
    });
    this.api.addRoutes({
      path: '/folders',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListFoldersIntegration', listFolders),
      authorizer,
    });
    this.api.addRoutes({
      path: '/folders/{id}',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFolderIntegration', renameFolder),
      authorizer,
    });
    this.api.addRoutes({
      path: '/folders/{id}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteFolderIntegration', deleteFolder),
      authorizer,
    });

    // Files
    this.api.addRoutes({
      path: '/files/recent',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('RecentFilesIntegration', recentFiles),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/upload-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('GetUploadUrlIntegration', getUploadUrl),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/confirm-upload',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ConfirmUploadIntegration', confirmUpload),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/{id}/download-url',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('GetDownloadUrlIntegration', getDownloadUrl),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('ListFilesIntegration', listFiles),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/{id}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetFileIntegration', getFile),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/{id}',
      methods: [HttpMethod.PATCH],
      integration: new HttpLambdaIntegration('RenameFileIntegration', renameFile),
      authorizer,
    });
    this.api.addRoutes({
      path: '/files/{id}',
      methods: [HttpMethod.DELETE],
      integration: new HttpLambdaIntegration('DeleteFileIntegration', deleteFile),
      authorizer,
    });
  }
}
