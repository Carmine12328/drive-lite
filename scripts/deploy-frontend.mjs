import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const envAwsPath = join(rootDir, 'frontend', 'src', 'environments', 'environment.aws.ts');
const profile = process.env.AWS_PROFILE || 'drive-lite';

console.log('🚀 Starting Drive Lite Frontend Deployment...');

let hostingBucket = '';
let websiteUrl = '';

// 1. Read hosting bucket and website URL from environment.aws.ts if available
if (existsSync(envAwsPath)) {
  const envContent = readFileSync(envAwsPath, 'utf-8');
  const bucketMatch = envContent.match(/hostingBucket:\s*['"]([^'"]+)['"]/);
  const urlMatch = envContent.match(/websiteUrl:\s*['"]([^'"]+)['"]/);
  if (bucketMatch) hostingBucket = bucketMatch[1];
  if (urlMatch) websiteUrl = urlMatch[1];
}

// 2. Fallback: Query CloudFormation stack outputs directly from AWS
if (!hostingBucket) {
  try {
    console.log(`🔍 Fetching HostingBucketName from CloudFormation stack (profile: ${profile})...`);
    const stdout = execSync(
      `aws cloudformation describe-stacks --stack-name DriveLiteStack --query "Stacks[0].Outputs[?OutputKey=='HostingBucketName'].OutputValue" --output text --profile ${profile}`,
      { encoding: 'utf-8' }
    ).trim();
    if (stdout && stdout !== 'None') {
      hostingBucket = stdout;
    }
  } catch (err) {
    console.warn('⚠️ Could not query CloudFormation outputs automatically.');
  }
}

if (!hostingBucket) {
  console.error('❌ Error: Could not determine hosting bucket name.');
  console.error('Please ensure environment.aws.ts contains hostingBucket or your CDK stack is deployed.');
  process.exit(1);
}

// 3. Build Angular app for AWS
console.log('\n📦 Building Angular frontend for AWS production...');
execSync('npm run build:aws -w frontend', {
  cwd: rootDir,
  stdio: 'inherit',
});

// 4. Sync files to S3 hosting bucket
console.log(`\n☁️ Uploading build to S3 bucket: ${hostingBucket}...`);
execSync(
  `aws s3 sync frontend/dist/drive-lite/browser/ s3://${hostingBucket} --delete --profile ${profile}`,
  {
    cwd: rootDir,
    stdio: 'inherit',
  }
);

console.log('\n✨ Frontend deployment successful!');
if (websiteUrl) {
  console.log(`🌐 Live Website: ${websiteUrl}\n`);
}
