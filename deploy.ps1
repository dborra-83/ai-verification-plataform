Write-Host "Starting AI Verification Platform deployment..." -ForegroundColor Green

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

# Bootstrap CDK
Write-Host "Bootstrapping CDK..." -ForegroundColor Yellow
cdk bootstrap

# Deploy infrastructure
Write-Host "Deploying infrastructure..." -ForegroundColor Yellow
npm run deploy

# Wait for deployment
Write-Host "Waiting for deployment to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Deploy frontend
Write-Host "Deploying frontend..." -ForegroundColor Yellow
npm run deploy:frontend

# Get URLs
Write-Host "Getting deployment information..." -ForegroundColor Yellow
$FRONTEND_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text
$API_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text

Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URL: $FRONTEND_URL" -ForegroundColor White
Write-Host "API URL: $API_URL" -ForegroundColor White
Write-Host ""
Write-Host "Login: admin / admin" -ForegroundColor Cyan