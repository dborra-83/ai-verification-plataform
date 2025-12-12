#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function updateFrontendConfig() {
    try {
        console.log('🔧 Updating frontend configuration...');
        
        // Get API URL directly
        const apiUrlCommand = `aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text`;
        const apiUrl = execSync(apiUrlCommand, { encoding: 'utf8' }).trim();
        
        const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
        
        if (!apiUrl || apiUrl === 'None') {
            throw new Error('API URL not found in CloudFormation outputs');
        }
        
        // Update config.js (remove trailing slash from API URL)
        const cleanApiUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
        const configPath = path.join(__dirname, '../frontend/config.js');
        const configContent = `// Configuration file - updated automatically after deployment
const CONFIG = {
    API_BASE_URL: '${cleanApiUrl}',
    AWS_REGION: '${region}'
};

// This file is automatically updated by the deployment script
// with the actual API Gateway URL from CloudFormation outputs`;
        
        fs.writeFileSync(configPath, configContent);
        
        console.log('✅ Frontend configuration updated successfully');
        console.log(`   API URL: ${apiUrl}`);
        console.log(`   Region: ${region}`);
        
    } catch (error) {
        console.error('❌ Error updating frontend configuration:', error.message);
        process.exit(1);
    }
}

updateFrontendConfig();