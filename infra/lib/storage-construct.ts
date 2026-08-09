import { Construct } from 'constructs';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';

/**
 * Properties for StorageConstruct
 */
export interface StorageConstructProps {
  /** Whether to set DESTROY removal policy (for dev environments) */
  isDevEnvironment?: boolean;
}

/**
 * Storage construct: S3 bucket for file storage + DynamoDB single-table.
 */
export class StorageConstruct extends Construct {
  /** The DynamoDB table for all metadata (single-table design) */
  public readonly table: dynamodb.TableV2;
  /** The S3 bucket for file storage */
  public readonly bucket: s3.Bucket;

  /**
   * Initialize StorageConstruct
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Construct properties
   */
  constructor(scope: Construct, id: string, props: StorageConstructProps = {}) {
    super(scope, id);
    const isDev = props.isDevEnvironment ?? false;

    // S3 Bucket
    this.bucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: undefined, // Let CDK generate a unique name
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,

      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ['http://localhost:4200'], // Dev origin
          maxAge: 3600,
        },
      ],
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(7),
          noncurrentVersionExpiration: Duration.days(30),
        },
      ],
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: isDev,
    });

    // DynamoDB Table — single-table design
    this.table = new dynamodb.TableV2(this, 'MetadataTable', {
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      timeToLiveAttribute: 'ttl',
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
        },
      ],
    });
  }
}
