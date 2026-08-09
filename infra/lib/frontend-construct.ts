import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

/**
 * Properties for FrontendConstruct
 */
export interface FrontendConstructProps {
  /** Whether to set DESTROY removal policy (for dev environments) */
  isDevEnvironment?: boolean;
}

/**
 * Frontend hosting construct: S3 bucket + CloudFront distribution.
 * Hosts the Angular SPA build output.
 */
export class FrontendConstruct extends Construct {
  /** The S3 bucket containing Angular build output */
  public readonly hostingBucket: s3.Bucket;
  /** The CloudFront distribution */
  public readonly distribution: cloudfront.Distribution;

  /**
   * Initialize FrontendConstruct
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Construct properties
   */
  constructor(scope: Construct, id: string, props: FrontendConstructProps = {}) {
    super(scope, id);

    const isDev = props.isDevEnvironment ?? false;

    this.hostingBucket = new s3.Bucket(this, 'FrontendBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: isDev,
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.hostingBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
    });
  }
}
