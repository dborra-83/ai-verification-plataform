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

    // Add Cognito admin permissions for user management
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cognito-idp:AdminListUsers",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminResetUserPassword",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:ListUsers",
          "cognito-idp:DescribeUserPool",
        ],
        resources: [userPool.userPoolArn],
      }),
    );

    // Add CloudWatch permissions for system health monitoring
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "cloudwatch:ListMetrics",
        ],
        resources: ["*"],
      }),
    );

    // Add DynamoDB describe table permission for health checks
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["dynamodb:DescribeTable"],
        resources: [analysisTable.tableArn],
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

    // Admin Lambda function (existing metrics and reports)
    const adminLambda = new lambda.Function(this, "AdminLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "admin_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/admin"),
      role: lambdaRole,
      environment: {
        ANALYSIS_TABLE: analysisTable.tableName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
        USER_POOL_ID: userPool.userPoolId,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // User Management Lambda function
    const userManagementLambda = new lambda.Function(
      this,
      "UserManagementLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "user_management_handler.lambda_handler",
        code: lambda.Code.fromAsset("backend/admin"),
        role: lambdaRole,
        environment: {
          ANALYSIS_TABLE: analysisTable.tableName,
          UPLOAD_BUCKET: uploadBucket.bucketName,
          USER_POOL_ID: userPool.userPoolId,
        },
        timeout: cdk.Duration.minutes(2),
        memorySize: 512,
      },
    );

    // Audit Handler Lambda function
    const auditLambda = new lambda.Function(this, "AuditLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "audit_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/admin"),
      role: lambdaRole,
      environment: {
        ANALYSIS_TABLE: analysisTable.tableName,
        UPLOAD_BUCKET: uploadBucket.bucketName,
      },
      timeout: cdk.Duration.seconds(30),
    });

    // Config Handler Lambda function
    const configLambda = new lambda.Function(this, "ConfigLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "config_handler.lambda_handler",
      code: lambda.Code.fromAsset("backend/admin"),
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

    // Add Gateway Responses for CORS on errors (401, 403, 500)
    api.addGatewayResponse("UnauthorizedResponse", {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers":
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
      templates: {
        "application/json": '{"message": "Unauthorized", "statusCode": 401}',
      },
    });

    api.addGatewayResponse("AccessDeniedResponse", {
      type: apigateway.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers":
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
      templates: {
        "application/json": '{"message": "Access Denied", "statusCode": 403}',
      },
    });

    api.addGatewayResponse("DefaultError", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers":
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
      },
    });

    api.addGatewayResponse("Default5XXError", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers":
          "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
        "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
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

    // Admin API Resources
    const adminResource = api.root.addResource("admin");

    // Admin metrics endpoints (existing)
    const metricsResource = adminResource.addResource("metrics");
    const examsMetricsResource = metricsResource.addResource("exams");
    examsMetricsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(adminLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const usersMetricsResource = metricsResource.addResource("users");
    usersMetricsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(adminLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const systemMetricsResource = metricsResource.addResource("system");
    systemMetricsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(adminLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // System health endpoint
    const systemHealthResource = adminResource.addResource("system-health");
    systemHealthResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(adminLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // User management endpoints
    const usersResource = adminResource.addResource("users");
    usersResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    usersResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // User statistics endpoint
    const userStatsResource = usersResource.addResource("statistics");
    userStatsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Bulk operations endpoint
    const bulkResource = usersResource.addResource("bulk");
    bulkResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // User export endpoint
    const userExportResource = usersResource.addResource("export");
    userExportResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Individual user endpoints
    const userIdResource = usersResource.addResource("{userId}");
    userIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    userIdResource.addMethod(
      "DELETE",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // User status endpoint
    const userStatusResource = userIdResource.addResource("status");
    userStatusResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // User role endpoint
    const userRoleResource = userIdResource.addResource("role");
    userRoleResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Password reset endpoint
    const resetPasswordResource = userIdResource.addResource("reset-password");
    resetPasswordResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Resend verification endpoint
    const resendVerificationResource = userIdResource.addResource(
      "resend-verification",
    );
    resendVerificationResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(userManagementLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Audit endpoints
    const auditResource = adminResource.addResource("audit");
    auditResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(auditLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const loginHistoryResource = auditResource.addResource("login-history");
    loginHistoryResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(auditLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const failedLoginsResource = auditResource.addResource("failed-logins");
    failedLoginsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(auditLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const securityAlertsResource = auditResource.addResource("security-alerts");
    securityAlertsResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(auditLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const auditExportResource = auditResource.addResource("export");
    auditExportResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(auditLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Config endpoints
    const configResource = adminResource.addResource("config");
    configResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(configLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    configResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(configLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Email templates endpoints
    const emailTemplatesResource =
      configResource.addResource("email-templates");
    emailTemplatesResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(configLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    const templateIdResource =
      emailTemplatesResource.addResource("{templateId}");
    templateIdResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(configLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );
    templateIdResource.addMethod(
      "PUT",
      new apigateway.LambdaIntegration(configLambda),
      {
        authorizer: authorizer,
        authorizationType: apigateway.AuthorizationType.CUSTOM,
      },
    );

    // Template preview endpoint
    const previewTemplateResource =
      configResource.addResource("preview-template");
    previewTemplateResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(configLambda),
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
