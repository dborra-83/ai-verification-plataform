import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export class AiVerificationPlatformStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cognito User Pool for authentication
    const userPool = new cognito.UserPool(this, "AIVerificationUserPool", {
      userPoolName: "ai-verification-platform-users",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // Protect user data
    });

    // Configure token expiration
    const userPoolClient = userPool.addClient("WebAppClient", {
      userPoolClientName: "web-app-client",
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false,
      preventUserExistenceErrors: true,
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      idTokenValidity: cdk.Duration.hours(1),
    });

    // S3 Bucket for frontend hosting
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      bucketName: `ai-verification-frontend-${this.account}-${this.region}`,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "login.html",
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3 Bucket for PDF uploads
    const uploadBucket = new s3.Bucket(this, "UploadBucket", {
      bucketName: `ai-verification-uploads-${this.account}-${this.region}`,
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // DynamoDB table for analysis results
    const analysisTable = new dynamodb.Table(this, "AnalysisTable", {
      tableName: "AiVerificationResults",
      partitionKey: { name: "analysisId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI for querying by date
    analysisTable.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    // IAM role for Lambda functions
    const lambdaRole = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });

    // Add permissions for S3, DynamoDB, and Bedrock
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectVersion",
        ],
        resources: [uploadBucket.bucketArn + "/*"],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
        ],
        resources: [
          analysisTable.tableArn,
          analysisTable.tableArn + "/index/*",
        ],
      }),
    );

    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock:InvokeModel"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
        ],
      }),
    );

    // Upload presign Lambda function
    const uploadLambda = new lambda.Function(this, "UploadLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "upload_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/upload"),
      role: lambdaRole,
      environment: {
        UPLOAD_BUCKET: uploadBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Analysis Lambda function
    const analysisLambda = new lambda.Function(this, "AnalysisLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "analysis_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/analysis"),
      role: lambdaRole,
      environment: {
        UPLOAD_BUCKET: uploadBucket.bucketName,
        ANALYSIS_TABLE: analysisTable.tableName,
      },
      timeout: cdk.Duration.minutes(5),
      memorySize: 1024,
    });

    // Query Lambda function
    const queryLambda = new lambda.Function(this, "QueryLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "query_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/query"),
      role: lambdaRole,
      environment: {
        ANALYSIS_TABLE: analysisTable.tableName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Exam Topic Extraction Lambda function
    const examTopicExtractionLambda = new lambda.Function(
      this,
      "ExamTopicExtractionLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "topic_extraction_handler.lambda_handler",
        code: lambda.Code.fromAsset("backend/exam-topic-extraction"),
        role: lambdaRole,
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName,
          ANALYSIS_TABLE: analysisTable.tableName,
        },
        timeout: cdk.Duration.minutes(10),
        memorySize: 2048,
      },
    );

    // Exam Generation Lambda function
    const examGenerationLambda = new lambda.Function(
      this,
      "ExamGenerationLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "exam_generation_handler.lambda_handler",
        code: lambda.Code.fromAsset("backend/exam-generation"),
        role: lambdaRole,
        environment: {
          UPLOAD_BUCKET: uploadBucket.bucketName,
          ANALYSIS_TABLE: analysisTable.tableName,
        },
        timeout: cdk.Duration.minutes(10),
        memorySize: 2048,
      },
    );

    // Exam History Lambda function
    const examHistoryLambda = new lambda.Function(this, "ExamHistoryLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "exam_history_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/exam-history"),
      role: lambdaRole,
      environment: {
        ANALYSIS_TABLE: analysisTable.tableName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Lambda Authorizer for API Gateway
    const authorizerFunction = new lambda.Function(this, "CognitoAuthorizer", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "authorizer.lambda_handler",
      code: lambda.Code.fromAsset("backend/authorizer"),
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
      timeout: cdk.Duration.seconds(10),
    });

    // Grant authorizer permission to describe User Pool (for JWKS validation)
    authorizerFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["cognito-idp:DescribeUserPool"],
        resources: [userPool.userPoolArn],
      }),
    );

    // API Gateway REST API
    const api = new apigateway.RestApi(this, "AiVerificationApi", {
      restApiName: "ai-verification-api",
      description: "AI Verification Platform API",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "Authorization",
          "X-Amz-Date",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "X-Requested-With",
        ],
        allowCredentials: false,
      },
    });

    // Create Token Authorizer with 5-minute cache TTL
    const authorizer = new apigateway.TokenAuthorizer(this, "APIAuthorizer", {
      handler: authorizerFunction,
      resultsCacheTtl: cdk.Duration.minutes(5),
    });

    // API Resources and Methods
    const uploadsResource = api.root.addResource("uploads");
    const presignResource = uploadsResource.addResource("presign");
    presignResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(uploadLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const analysisResource = api.root.addResource("analysis");
    const startResource = analysisResource.addResource("start");
    startResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(analysisLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    analysisResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(queryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const analysisIdResource = analysisResource.addResource("{analysisId}");
    analysisIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(queryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    analysisIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(queryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const downloadsResource = api.root.addResource("downloads");
    const downloadPresignResource = downloadsResource.addResource("presign");
    downloadPresignResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(queryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Exam API Resources and Methods
    const examResource = api.root.addResource("exam");

    // Topic extraction endpoints
    const topicsResource = examResource.addResource("topics");
    const extractResource = topicsResource.addResource("extract");
    extractResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(examTopicExtractionLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const extractionIdResource = topicsResource.addResource("{extractionId}");
    extractionIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(examTopicExtractionLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Exam generation endpoints
    const generateResource = examResource.addResource("generate");
    const startGenerationResource = generateResource.addResource("start");
    startGenerationResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(examGenerationLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const examIdResource = generateResource.addResource("{examId}");
    examIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(examGenerationLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Exam history endpoints
    const historyResource = examResource.addResource("history", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    historyResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(examHistoryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const historyExamIdResource = historyResource.addResource("{examId}", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    historyExamIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(examHistoryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    historyExamIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(examHistoryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const exportResource = historyResource.addResource("export", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    exportResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(examHistoryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Exam download endpoints
    const examDownloadResource = examResource.addResource("download", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    const fileIdResource = examDownloadResource.addResource("{fileId}", {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
    });
    fileIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(examHistoryLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // CloudFront Distribution for Frontend
    const distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultBehavior: {
          origin: new origins.S3Origin(frontendBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
          cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          compress: true,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        additionalBehaviors: {
          "/prod/*": {
            origin: new origins.RestApiOrigin(api),
            viewerProtocolPolicy:
              cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
            originRequestPolicy: cloudfront.OriginRequestPolicy.CORS_S3_ORIGIN,
          },
        },
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(30),
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
            ttl: cdk.Duration.minutes(30),
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Solo US, Canada y Europa
        comment: "AI Verification Platform - Frontend Distribution",
      },
    );

    // Outputs
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
      description: "S3 bucket name for frontend hosting",
    });

    new cdk.CfnOutput(this, "FrontendUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "Frontend website URL (CloudFront)",
    });

    new cdk.CfnOutput(this, "FrontendS3Url", {
      value: `http://${frontendBucket.bucketWebsiteDomainName}`,
      description: "Frontend S3 website URL (direct)",
    });

    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID",
    });

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "API Gateway endpoint URL",
    });

    new cdk.CfnOutput(this, "UploadBucketName", {
      value: uploadBucket.bucketName,
      description: "S3 bucket name for PDF uploads",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito User Pool App Client ID",
    });

    new cdk.CfnOutput(this, "Region", {
      value: this.region,
      description: "AWS Region",
    });
  }
}
