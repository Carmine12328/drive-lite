import { Construct } from 'constructs';
import { RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';

/**
 * Properties for AuthConstruct
 */
export interface AuthConstructProps {
  /** Whether to set DESTROY removal policy (for dev environments) */
  isDevEnvironment?: boolean;
  /** Callback URLs for OAuth (e.g., http://localhost:4200/auth/callback) */
  callbackUrls?: string[];
  /** Logout URLs (e.g., http://localhost:4200) */
  logoutUrls?: string[];
}

/**
 * Authentication construct: Cognito User Pool + Client.
 * Post-confirmation trigger is wired separately via addPostConfirmationTrigger().
 */
export class AuthConstruct extends Construct {
  /** The Cognito User Pool */
  public readonly userPool: cognito.UserPool;
  /** The User Pool Client (SPA-friendly, no client secret) */
  public readonly userPoolClient: cognito.UserPoolClient;

  /**
   * Initialize AuthConstruct
   * @param scope - Parent construct
   * @param id - Construct ID
   * @param props - Construct properties
   */
  constructor(scope: Construct, id: string, props: AuthConstructProps = {}) {
    super(scope, id);

    const isDev = props.isDevEnvironment ?? false;
    const callbackUrls = props.callbackUrls ?? ['http://localhost:4200/auth/callback'];
    const logoutUrls = props.logoutUrls ?? ['http://localhost:4200'];

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'drive-lite-user-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: 'drive-lite-web-client',
      authFlows: {
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
      },
      generateSecret: false, // Required for SPAs — no client secret
    });
  }

  /**
   * Wire a Lambda function as the Cognito Post-Confirmation trigger.
   * Called from the main stack after the API construct creates the handler.
   * @param fn - The Lambda function to use as the trigger
   */
  public addPostConfirmationTrigger(fn: lambda.IFunction): void {
    this.userPool.addTrigger(cognito.UserPoolOperation.POST_CONFIRMATION, fn);
  }
}
