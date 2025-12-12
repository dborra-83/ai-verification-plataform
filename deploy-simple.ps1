# AI Verification Platform Deployment Script for Windows

Write-Host "🚀 Starting AI Verification Platform deployment..." -ForegroundColor Green

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "❌ AWS CLI is not installed. Please install it first." -ForegroundColor Red
    exit 1
}

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed. Please install it first." -ForegroundColor Red
    exit 1
}

# Check CDK
if (-not (Get-Command cdk -ErrorAction SilentlyContinue)) {
    Write-Host "❌ AWS CDK is not installed. Installing..." -ForegroundColor Yellow
    npm install -g aws-cdk
}

# Check AWS credentials
try {
    aws sts get-caller-identity | Out-Null
    Write-Host "✅ AWS credentials verified" -ForegroundColor Green
}
catch {
    Write-Host "❌ AWS credentials not configured. Please run 'aws configure' first." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Prerequisites check passed" -ForegroundColor Green

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Bootstrap CDK (if needed)
Write-Host "🏗️  Bootstrapping CDK..." -ForegroundColor Yellow
try {
    cdk bootstrap
    Write-Host "✅ CDK bootstrapped successfully" -ForegroundColor Green
}
catch {
    Write-Host "⚠️  CDK already bootstrapped or bootstrap failed" -ForegroundColor Yellow
}

# Deploy infrastructure
Write-Host "🏗️  Deploying infrastructure..." -ForegroundColor Yellow
npm run deploy

# Wait for deployment to complete
Write-Host "⏳ Waiting for deployment to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Deploy frontend
Write-Host "🌐 Deploying frontend..." -ForegroundColor Yellow
npm run deploy:frontend

# Get deployment URLs
Write-Host "📋 Getting deployment information..." -ForegroundColor Yellow
$FRONTEND_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' --output text
$API_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text

Write-Host ""
Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Deployment Information:" -ForegroundColor Cyan
Write-Host "   Frontend URL: $FRONTEND_URL" -ForegroundColor White
Write-Host "   API URL: $API_URL" -ForegroundColor White
Write-Host ""
Write-Host "🔐 Login Credentials:" -ForegroundColor Cyan
Write-Host "   Username: admin" -ForegroundColor White
Write-Host "   Password: admin" -ForegroundColor White
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Open the Frontend URL in your browser" -ForegroundColor White
Write-Host "   2. Login with the credentials above" -ForegroundColor White
Write-Host "   3. Upload a PDF document to test the analysis" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  Important Notes:" -ForegroundColor Yellow
Write-Host "   - Make sure you have access to Amazon Bedrock (Claude 3 Haiku model)" -ForegroundColor White
Write-Host "   - The first analysis might take a few minutes to initialize" -ForegroundColor White
Write-Host "   - Check CloudWatch logs if you encounter any issues" -ForegroundColor White
Write-Host ""
Write-Host "🗑️  To clean up resources later, run: npm run destroy" -ForegroundColor Yellow