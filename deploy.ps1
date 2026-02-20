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

# Get deployment outputs
Write-Host "Getting deployment information..." -ForegroundColor Yellow
$FRONTEND_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text
$API_URL = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text
$USER_POOL_ID = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text
$APP_CLIENT_ID = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='UserPoolClientId'].OutputValue" --output text
$REGION = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='Region'].OutputValue" --output text

# Update frontend config with Cognito values
Write-Host "Updating frontend configuration..." -ForegroundColor Yellow
node scripts/update-frontend-config.js

# Deploy frontend
Write-Host "Deploying frontend..." -ForegroundColor Yellow
npm run deploy:frontend

Write-Host ""
Write-Host "Deployment completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Frontend URL: $FRONTEND_URL" -ForegroundColor White
Write-Host "API URL: $API_URL" -ForegroundColor White
Write-Host "User Pool ID: $USER_POOL_ID" -ForegroundColor White
Write-Host "App Client ID: $APP_CLIENT_ID" -ForegroundColor White
Write-Host ""
Write-Host "Create a new account at the signup page to get started!" -ForegroundColor Cyan