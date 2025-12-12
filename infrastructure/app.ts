#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AiVerificationPlatformStack } from './ai-verification-platform-stack';

const app = new cdk.App();
new AiVerificationPlatformStack(app, 'AiVerificationPlatformStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});