"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiVerificationPlatformStack = void 0;
const cdk = require("aws-cdk-lib");
const s3 = require("aws-cdk-lib/aws-s3");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const iam = require("aws-cdk-lib/aws-iam");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const cognito = require("aws-cdk-lib/aws-cognito");
class AiVerificationPlatformStack extends cdk.Stack {
    constructor(scope, id, props) {
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
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
        });
        // Add permissions for S3, DynamoDB, and Bedrock
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:GetObjectVersion",
            ],
            resources: [uploadBucket.bucketArn + "/*"],
        }));
        lambdaRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["bedrock:InvokeModel"],
            resources: ["*"],
        }));
        // Add Cognito admin permissions for user management
        lambdaRole.addToPolicy(new iam.PolicyStatement({
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
        }));
        // Add CloudWatch permissions for system health monitoring
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "cloudwatch:GetMetricStatistics",
                "cloudwatch:GetMetricData",
                "cloudwatch:ListMetrics",
            ],
            resources: ["*"],
        }));
        // Add DynamoDB describe table permission for health checks
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:DescribeTable"],
            resources: [analysisTable.tableArn],
        }));
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
        const examTopicExtractionLambda = new lambda.Function(this, "ExamTopicExtractionLambda", {
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
        });
        // Exam Generation Lambda function
        const examGenerationLambda = new lambda.Function(this, "ExamGenerationLambda", {
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
        });
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
        const userManagementLambda = new lambda.Function(this, "UserManagementLambda", {
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
        });
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
        authorizerFunction.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["cognito-idp:DescribeUserPool"],
            resources: [userPool.userPoolArn],
        }));
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
                "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
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
                "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
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
                "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
                "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
            },
        });
        api.addGatewayResponse("Default5XXError", {
            type: apigateway.ResponseType.DEFAULT_5XX,
            responseHeaders: {
                "Access-Control-Allow-Origin": "'*'",
                "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token'",
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
        presignResource.addMethod("POST", new apigateway.LambdaIntegration(uploadLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const analysisResource = api.root.addResource("analysis");
        const startResource = analysisResource.addResource("start");
        startResource.addMethod("POST", new apigateway.LambdaIntegration(analysisLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        analysisResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const analysisIdResource = analysisResource.addResource("{analysisId}");
        analysisIdResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        analysisIdResource.addMethod("DELETE", new apigateway.LambdaIntegration(queryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const downloadsResource = api.root.addResource("downloads");
        const downloadPresignResource = downloadsResource.addResource("presign");
        downloadPresignResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Exam API Resources and Methods
        const examResource = api.root.addResource("exam");
        // Topic extraction endpoints
        const topicsResource = examResource.addResource("topics");
        const extractResource = topicsResource.addResource("extract");
        extractResource.addMethod("POST", new apigateway.LambdaIntegration(examTopicExtractionLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const extractionIdResource = topicsResource.addResource("{extractionId}");
        extractionIdResource.addMethod("GET", new apigateway.LambdaIntegration(examTopicExtractionLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Exam generation endpoints
        const generateResource = examResource.addResource("generate");
        const startGenerationResource = generateResource.addResource("start");
        startGenerationResource.addMethod("POST", new apigateway.LambdaIntegration(examGenerationLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const examIdResource = generateResource.addResource("{examId}");
        examIdResource.addMethod("GET", new apigateway.LambdaIntegration(examGenerationLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Exam history endpoints
        const historyResource = examResource.addResource("history", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        historyResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const historyExamIdResource = historyResource.addResource("{examId}", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        historyExamIdResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        historyExamIdResource.addMethod("DELETE", new apigateway.LambdaIntegration(examHistoryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const exportResource = historyResource.addResource("export", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        exportResource.addMethod("POST", new apigateway.LambdaIntegration(examHistoryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
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
        fileIdResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Admin API Resources
        const adminResource = api.root.addResource("admin");
        // Admin metrics endpoints (existing)
        const metricsResource = adminResource.addResource("metrics");
        const examsMetricsResource = metricsResource.addResource("exams");
        examsMetricsResource.addMethod("GET", new apigateway.LambdaIntegration(adminLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const usersMetricsResource = metricsResource.addResource("users");
        usersMetricsResource.addMethod("GET", new apigateway.LambdaIntegration(adminLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const systemMetricsResource = metricsResource.addResource("system");
        systemMetricsResource.addMethod("GET", new apigateway.LambdaIntegration(adminLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // System health endpoint
        const systemHealthResource = adminResource.addResource("system-health");
        systemHealthResource.addMethod("GET", new apigateway.LambdaIntegration(adminLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // User management endpoints
        const usersResource = adminResource.addResource("users");
        usersResource.addMethod("GET", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        usersResource.addMethod("POST", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // User statistics endpoint
        const userStatsResource = usersResource.addResource("statistics");
        userStatsResource.addMethod("GET", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Bulk operations endpoint
        const bulkResource = usersResource.addResource("bulk");
        bulkResource.addMethod("POST", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // User export endpoint
        const userExportResource = usersResource.addResource("export");
        userExportResource.addMethod("POST", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Individual user endpoints
        const userIdResource = usersResource.addResource("{userId}");
        userIdResource.addMethod("GET", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        userIdResource.addMethod("DELETE", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // User status endpoint
        const userStatusResource = userIdResource.addResource("status");
        userStatusResource.addMethod("PUT", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // User role endpoint
        const userRoleResource = userIdResource.addResource("role");
        userRoleResource.addMethod("PUT", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Password reset endpoint
        const resetPasswordResource = userIdResource.addResource("reset-password");
        resetPasswordResource.addMethod("POST", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Resend verification endpoint
        const resendVerificationResource = userIdResource.addResource("resend-verification");
        resendVerificationResource.addMethod("POST", new apigateway.LambdaIntegration(userManagementLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Audit endpoints
        const auditResource = adminResource.addResource("audit");
        auditResource.addMethod("GET", new apigateway.LambdaIntegration(auditLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const loginHistoryResource = auditResource.addResource("login-history");
        loginHistoryResource.addMethod("GET", new apigateway.LambdaIntegration(auditLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const failedLoginsResource = auditResource.addResource("failed-logins");
        failedLoginsResource.addMethod("GET", new apigateway.LambdaIntegration(auditLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const securityAlertsResource = auditResource.addResource("security-alerts");
        securityAlertsResource.addMethod("GET", new apigateway.LambdaIntegration(auditLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const auditExportResource = auditResource.addResource("export");
        auditExportResource.addMethod("POST", new apigateway.LambdaIntegration(auditLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Config endpoints
        const configResource = adminResource.addResource("config");
        configResource.addMethod("GET", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        configResource.addMethod("PUT", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Email templates endpoints
        const emailTemplatesResource = configResource.addResource("email-templates");
        emailTemplatesResource.addMethod("GET", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const templateIdResource = emailTemplatesResource.addResource("{templateId}");
        templateIdResource.addMethod("GET", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        templateIdResource.addMethod("PUT", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // Template preview endpoint
        const previewTemplateResource = configResource.addResource("preview-template");
        previewTemplateResource.addMethod("POST", new apigateway.LambdaIntegration(configLambda), {
            authorizer: authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        // CloudFront Distribution for Frontend
        const distribution = new cloudfront.Distribution(this, "FrontendDistribution", {
            defaultBehavior: {
                origin: new origins.S3Origin(frontendBucket),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
                compress: true,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
            },
            additionalBehaviors: {
                "/prod/*": {
                    origin: new origins.RestApiOrigin(api),
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
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
            priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
            comment: "AI Verification Platform - Frontend Distribution",
        });
        // ══════════════════════════════════════════════════════════════
        // MÓDULO: Document Automation
        // ══════════════════════════════════════════════════════════════
        // DynamoDB — historial de documentos procesados
        const docHistoryTable = new dynamodb.Table(this, "DocAutomationHistory", {
            tableName: "DocAutomationHistory",
            partitionKey: {
                name: "document_id",
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: { name: "processed_at", type: dynamodb.AttributeType.STRING },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // Lambda — Document Automation Handler
        const docAutomationLambda = new lambda.Function(this, "DocAutomationHandler", {
            runtime: lambda.Runtime.PYTHON_3_11,
            handler: "handler.lambda_handler",
            code: lambda.Code.fromAsset("backend/document_automation"),
            role: lambdaRole,
            timeout: cdk.Duration.seconds(120),
            memorySize: 1024,
            environment: {
                S3_BUCKET: uploadBucket.bucketName,
                BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID ||
                    "anthropic.claude-3-5-sonnet-20241022-v2:0",
                DYNAMO_TABLE: docHistoryTable.tableName,
                TEXTRACT_MODE: process.env.TEXTRACT_MODE || "sync",
                DEMO_DOCS_S3_PREFIX: process.env.DEMO_DOCS_S3_PREFIX || "demo-docs/",
            },
        });
        // Permisos adicionales: Textract + DynamoDB nueva tabla
        docAutomationLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "textract:DetectDocumentText",
                "textract:AnalyzeDocument",
                "textract:StartDocumentTextDetection",
                "textract:GetDocumentTextDetection",
            ],
            resources: ["*"],
        }));
        docAutomationLambda.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:Scan",
            ],
            resources: [docHistoryTable.tableArn],
        }));
        // API Gateway — recursos bajo /doc-automation
        const docAutomationResource = api.root.addResource("doc-automation");
        const docUploadResource = docAutomationResource.addResource("upload");
        docUploadResource.addMethod("POST", new apigateway.LambdaIntegration(docAutomationLambda), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const docAnalyzeResource = docAutomationResource.addResource("analyze");
        docAnalyzeResource.addMethod("POST", new apigateway.LambdaIntegration(docAutomationLambda), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const docHistoryResource = docAutomationResource.addResource("history");
        docHistoryResource.addMethod("GET", new apigateway.LambdaIntegration(docAutomationLambda), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        const docDemoDocsResource = docAutomationResource.addResource("demo-docs");
        docDemoDocsResource.addMethod("GET", new apigateway.LambdaIntegration(docAutomationLambda), {
            authorizer,
            authorizationType: apigateway.AuthorizationType.CUSTOM,
        });
        new cdk.CfnOutput(this, "DocAutomationTableName", {
            value: docHistoryTable.tableName,
            description: "DynamoDB table for Document Automation history",
        });
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
exports.AiVerificationPlatformStack = AiVerificationPlatformStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsbURBQW1EO0FBR25ELE1BQWEsMkJBQTRCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix1Q0FBdUM7UUFDdkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNwRSxZQUFZLEVBQUUsZ0NBQWdDO1lBQzlDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsQ0FBQztnQkFDWixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsY0FBYyxFQUFFLEtBQUs7YUFDdEI7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBQ25ELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxvQkFBb0I7U0FDOUQsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsY0FBYyxF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aEQsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNsRCxLQUFLLEVBQUUsWUFBWSxDQUFDLGNBQWM7WUFDbEMsV0FBVyxFQUFFLDRCQUE0QjtTQUMxQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFFBQVEsRUFBRTtZQUNoQyxLQUFLLEVBQUUsR0FBRyxDQUFDLEdBQUc7WUFDZCxXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsa0JBQWtCLEVBQUU7WUFDMUMsS0FBSyxFQUFFLFlBQVksQ0FBQyxVQUFVO1lBQzlCLFdBQVcsRUFBRSxnQ0FBZ0M7U0FDOUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUU7WUFDcEMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxVQUFVO1lBQzFCLFdBQVcsRUFBRSxzQkFBc0I7U0FDcEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsY0FBYyxDQUFDLGdCQUFnQjtZQUN0QyxXQUFXLEVBQUUsaUNBQWlDO1NBQy9DLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixXQUFXLEVBQUUsWUFBWTtTQUMxQixDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUE5akNELGtFQThqQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XHJcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250XCI7XHJcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNvZ25pdG9cIjtcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBBaVZlcmlmaWNhdGlvblBsYXRmb3JtU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIGZvciBhdXRoZW50aWNhdGlvblxyXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIkFJVmVyaWZpY2F0aW9uVXNlclBvb2xcIiwge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IFwiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXVzZXJzXCIsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGF1dG9WZXJpZnk6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiwgLy8gUHJvdGVjdCB1c2VyIGRhdGFcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyZSB0b2tlbiBleHBpcmF0aW9uXHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudChcIldlYkFwcENsaWVudFwiLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogXCJ3ZWItYXBwLWNsaWVudFwiLFxyXG4gICAgICBhdXRoRmxvd3M6IHtcclxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxyXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcclxuICAgICAgYWNjZXNzVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxyXG4gICAgICByZWZyZXNoVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxyXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZnJvbnRlbmQgaG9zdGluZ1xyXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiRnJvbnRlbmRCdWNrZXRcIiwge1xyXG4gICAgICBidWNrZXROYW1lOiBgYWktdmVyaWZpY2F0aW9uLWZyb250ZW5kLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXHJcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcclxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6IFwibG9naW4uaHRtbFwiLFxyXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxyXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUNMUyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTMyBCdWNrZXQgZm9yIFBERiB1cGxvYWRzXHJcbiAgICBjb25zdCB1cGxvYWRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiVXBsb2FkQnVja2V0XCIsIHtcclxuICAgICAgYnVja2V0TmFtZTogYGFpLXZlcmlmaWNhdGlvbi11cGxvYWRzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXHJcbiAgICAgIGNvcnM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xyXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXHJcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcclxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcclxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxyXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIGFuYWx5c2lzIHJlc3VsdHNcclxuICAgIGNvbnN0IGFuYWx5c2lzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJBbmFseXNpc1RhYmxlXCIsIHtcclxuICAgICAgdGFibGVOYW1lOiBcIkFpVmVyaWZpY2F0aW9uUmVzdWx0c1wiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJhbmFseXNpc0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0kgZm9yIHF1ZXJ5aW5nIGJ5IGRhdGVcclxuICAgIGFuYWx5c2lzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6IFwiR1NJMVwiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJHU0kxUEtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIkdTSTFTS1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSUFNIHJvbGUgZm9yIExhbWJkYSBmdW5jdGlvbnNcclxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJMYW1iZGFSb2xlXCIsIHtcclxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcclxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXHJcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxyXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXHJcbiAgICAgICAgKSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyBmb3IgUzMsIER5bmFtb0RCLCBhbmQgQmVkcm9ja1xyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcInMzOkdldE9iamVjdFwiLFxyXG4gICAgICAgICAgXCJzMzpQdXRPYmplY3RcIixcclxuICAgICAgICAgIFwiczM6RGVsZXRlT2JqZWN0XCIsXHJcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25cIixcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogW3VwbG9hZEJ1Y2tldC5idWNrZXRBcm4gKyBcIi8qXCJdLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcImR5bmFtb2RiOlB1dEl0ZW1cIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6R2V0SXRlbVwiLFxyXG4gICAgICAgICAgXCJkeW5hbW9kYjpVcGRhdGVJdGVtXCIsXHJcbiAgICAgICAgICBcImR5bmFtb2RiOkRlbGV0ZUl0ZW1cIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6UXVlcnlcIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6U2NhblwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBhbmFseXNpc1RhYmxlLnRhYmxlQXJuLFxyXG4gICAgICAgICAgYW5hbHlzaXNUYWJsZS50YWJsZUFybiArIFwiL2luZGV4LypcIixcclxuICAgICAgICBdLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrOkludm9rZU1vZGVsXCJdLFxyXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcclxuICAgICAgfSksXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEFkZCBDb2duaXRvIGFkbWluIHBlcm1pc3Npb25zIGZvciB1c2VyIG1hbmFnZW1lbnRcclxuICAgIGxhbWJkYVJvbGUuYWRkVG9Qb2xpY3koXHJcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcclxuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXHJcbiAgICAgICAgYWN0aW9uczogW1xyXG4gICAgICAgICAgXCJjb2duaXRvLWlkcDpBZG1pbkxpc3RVc2Vyc1wiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkcDpBZG1pbkdldFVzZXJcIixcclxuICAgICAgICAgIFwiY29nbml0by1pZHA6QWRtaW5DcmVhdGVVc2VyXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRwOkFkbWluRGVsZXRlVXNlclwiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkcDpBZG1pbkRpc2FibGVVc2VyXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRwOkFkbWluRW5hYmxlVXNlclwiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkcDpBZG1pblVwZGF0ZVVzZXJBdHRyaWJ1dGVzXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRwOkFkbWluUmVzZXRVc2VyUGFzc3dvcmRcIixcclxuICAgICAgICAgIFwiY29nbml0by1pZHA6QWRtaW5SZXNwb25kVG9BdXRoQ2hhbGxlbmdlXCIsXHJcbiAgICAgICAgICBcImNvZ25pdG8taWRwOkxpc3RVc2Vyc1wiLFxyXG4gICAgICAgICAgXCJjb2duaXRvLWlkcDpEZXNjcmliZVVzZXJQb29sXCIsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFt1c2VyUG9vbC51c2VyUG9vbEFybl0sXHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBZGQgQ2xvdWRXYXRjaCBwZXJtaXNzaW9ucyBmb3Igc3lzdGVtIGhlYWx0aCBtb25pdG9yaW5nXHJcbiAgICBsYW1iZGFSb2xlLmFkZFRvUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcclxuICAgICAgICAgIFwiY2xvdWR3YXRjaDpHZXRNZXRyaWNTdGF0aXN0aWNzXCIsXHJcbiAgICAgICAgICBcImNsb3Vkd2F0Y2g6R2V0TWV0cmljRGF0YVwiLFxyXG4gICAgICAgICAgXCJjbG91ZHdhdGNoOkxpc3RNZXRyaWNzXCIsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBZGQgRHluYW1vREIgZGVzY3JpYmUgdGFibGUgcGVybWlzc2lvbiBmb3IgaGVhbHRoIGNoZWNrc1xyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXCJkeW5hbW9kYjpEZXNjcmliZVRhYmxlXCJdLFxyXG4gICAgICAgIHJlc291cmNlczogW2FuYWx5c2lzVGFibGUudGFibGVBcm5dLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gVXBsb2FkIHByZXNpZ24gTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBjb25zdCB1cGxvYWRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiVXBsb2FkTGFtYmRhXCIsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXHJcbiAgICAgIGhhbmRsZXI6IFwidXBsb2FkX2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC91cGxvYWRcIiksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFuYWx5c2lzIExhbWJkYSBmdW5jdGlvblxyXG4gICAgY29uc3QgYW5hbHlzaXNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQW5hbHlzaXNMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJhbmFseXNpc19oYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvYW5hbHlzaXNcIiksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICB9LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcclxuICAgICAgbWVtb3J5U2l6ZTogMTAyNCxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFF1ZXJ5IExhbWJkYSBmdW5jdGlvblxyXG4gICAgY29uc3QgcXVlcnlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiUXVlcnlMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJxdWVyeV9oYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvcXVlcnlcIiksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICB9LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBFeGFtIFRvcGljIEV4dHJhY3Rpb24gTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBjb25zdCBleGFtVG9waWNFeHRyYWN0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJFeGFtVG9waWNFeHRyYWN0aW9uTGFtYmRhXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgICBoYW5kbGVyOiBcInRvcGljX2V4dHJhY3Rpb25faGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvZXhhbS10b3BpYy1leHRyYWN0aW9uXCIpLFxyXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxyXG4gICAgICAgIG1lbW9yeVNpemU6IDIwNDgsXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEV4YW0gR2VuZXJhdGlvbiBMYW1iZGEgZnVuY3Rpb25cclxuICAgIGNvbnN0IGV4YW1HZW5lcmF0aW9uTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbihcclxuICAgICAgdGhpcyxcclxuICAgICAgXCJFeGFtR2VuZXJhdGlvbkxhbWJkYVwiLFxyXG4gICAgICB7XHJcbiAgICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXHJcbiAgICAgICAgaGFuZGxlcjogXCJleGFtX2dlbmVyYXRpb25faGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxyXG4gICAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvZXhhbS1nZW5lcmF0aW9uXCIpLFxyXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxyXG4gICAgICAgIG1lbW9yeVNpemU6IDIwNDgsXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEV4YW0gSGlzdG9yeSBMYW1iZGEgZnVuY3Rpb25cclxuICAgIGNvbnN0IGV4YW1IaXN0b3J5TGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkV4YW1IaXN0b3J5TGFtYmRhXCIsIHtcclxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfMTEsXHJcbiAgICAgIGhhbmRsZXI6IFwiZXhhbV9oaXN0b3J5X2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9leGFtLWhpc3RvcnlcIiksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICB9LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZG1pbiBMYW1iZGEgZnVuY3Rpb24gKGV4aXN0aW5nIG1ldHJpY3MgYW5kIHJlcG9ydHMpXHJcbiAgICBjb25zdCBhZG1pbkxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJBZG1pbkxhbWJkYVwiLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICBoYW5kbGVyOiBcImFkbWluX2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9hZG1pblwiKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICB9LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBVc2VyIE1hbmFnZW1lbnQgTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBjb25zdCB1c2VyTWFuYWdlbWVudExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24oXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwiVXNlck1hbmFnZW1lbnRMYW1iZGFcIixcclxuICAgICAge1xyXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICAgIGhhbmRsZXI6IFwidXNlcl9tYW5hZ2VtZW50X2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJiYWNrZW5kL2FkbWluXCIpLFxyXG4gICAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIEFOQUxZU0lTX1RBQkxFOiBhbmFseXNpc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICAgICAgVVNFUl9QT09MX0lEOiB1c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMiksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogNTEyLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBBdWRpdCBIYW5kbGVyIExhbWJkYSBmdW5jdGlvblxyXG4gICAgY29uc3QgYXVkaXRMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQXVkaXRMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJhdWRpdF9oYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvYWRtaW5cIiksXHJcbiAgICAgIHJvbGU6IGxhbWJkYVJvbGUsXHJcbiAgICAgIGVudmlyb25tZW50OiB7XHJcbiAgICAgICAgQU5BTFlTSVNfVEFCTEU6IGFuYWx5c2lzVGFibGUudGFibGVOYW1lLFxyXG4gICAgICAgIFVQTE9BRF9CVUNLRVQ6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICB9LFxyXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBDb25maWcgSGFuZGxlciBMYW1iZGEgZnVuY3Rpb25cclxuICAgIGNvbnN0IGNvbmZpZ0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJDb25maWdMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJjb25maWdfaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJiYWNrZW5kL2FkbWluXCIpLFxyXG4gICAgICByb2xlOiBsYW1iZGFSb2xlLFxyXG4gICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgIEFOQUxZU0lTX1RBQkxFOiBhbmFseXNpc1RhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICBVUExPQURfQlVDS0VUOiB1cGxvYWRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgfSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTGFtYmRhIEF1dGhvcml6ZXIgZm9yIEFQSSBHYXRld2F5XHJcbiAgICBjb25zdCBhdXRob3JpemVyRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiQ29nbml0b0F1dGhvcml6ZXJcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJhdXRob3JpemVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImJhY2tlbmQvYXV0aG9yaXplclwiKSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBVU0VSX1BPT0xfSUQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDEwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEdyYW50IGF1dGhvcml6ZXIgcGVybWlzc2lvbiB0byBkZXNjcmliZSBVc2VyIFBvb2wgKGZvciBKV0tTIHZhbGlkYXRpb24pXHJcbiAgICBhdXRob3JpemVyRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxyXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XHJcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxyXG4gICAgICAgIGFjdGlvbnM6IFtcImNvZ25pdG8taWRwOkRlc2NyaWJlVXNlclBvb2xcIl0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbdXNlclBvb2wudXNlclBvb2xBcm5dLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQVBJIEdhdGV3YXkgUkVTVCBBUElcclxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJBaVZlcmlmaWNhdGlvbkFwaVwiLCB7XHJcbiAgICAgIHJlc3RBcGlOYW1lOiBcImFpLXZlcmlmaWNhdGlvbi1hcGlcIixcclxuICAgICAgZGVzY3JpcHRpb246IFwiQUkgVmVyaWZpY2F0aW9uIFBsYXRmb3JtIEFQSVwiLFxyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcclxuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCIsXHJcbiAgICAgICAgICBcIkF1dGhvcml6YXRpb25cIixcclxuICAgICAgICAgIFwiWC1BbXotRGF0ZVwiLFxyXG4gICAgICAgICAgXCJYLUFwaS1LZXlcIixcclxuICAgICAgICAgIFwiWC1BbXotU2VjdXJpdHktVG9rZW5cIixcclxuICAgICAgICAgIFwiWC1SZXF1ZXN0ZWQtV2l0aFwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogZmFsc2UsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBBZGQgR2F0ZXdheSBSZXNwb25zZXMgZm9yIENPUlMgb24gZXJyb3JzICg0MDEsIDQwMywgNTAwKVxyXG4gICAgYXBpLmFkZEdhdGV3YXlSZXNwb25zZShcIlVuYXV0aG9yaXplZFJlc3BvbnNlXCIsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuVU5BVVRIT1JJWkVELFxyXG4gICAgICByZXNwb25zZUhlYWRlcnM6IHtcclxuICAgICAgICBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpblwiOiBcIicqJ1wiLFxyXG4gICAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVyc1wiOlxyXG4gICAgICAgICAgXCInQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24sWC1BbXotRGF0ZSxYLUFwaS1LZXksWC1BbXotU2VjdXJpdHktVG9rZW4nXCIsXHJcbiAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzXCI6IFwiJ0dFVCxQT1NULFBVVCxERUxFVEUsT1BUSU9OUydcIixcclxuICAgICAgfSxcclxuICAgICAgdGVtcGxhdGVzOiB7XHJcbiAgICAgICAgXCJhcHBsaWNhdGlvbi9qc29uXCI6ICd7XCJtZXNzYWdlXCI6IFwiVW5hdXRob3JpemVkXCIsIFwic3RhdHVzQ29kZVwiOiA0MDF9JyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoXCJBY2Nlc3NEZW5pZWRSZXNwb25zZVwiLCB7XHJcbiAgICAgIHR5cGU6IGFwaWdhdGV3YXkuUmVzcG9uc2VUeXBlLkFDQ0VTU19ERU5JRUQsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IFwiJyonXCIsXHJcbiAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6XHJcbiAgICAgICAgICBcIidDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbixYLUFtei1EYXRlLFgtQXBpLUtleSxYLUFtei1TZWN1cml0eS1Ub2tlbidcIixcclxuICAgICAgICBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHNcIjogXCInR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgICB0ZW1wbGF0ZXM6IHtcclxuICAgICAgICBcImFwcGxpY2F0aW9uL2pzb25cIjogJ3tcIm1lc3NhZ2VcIjogXCJBY2Nlc3MgRGVuaWVkXCIsIFwic3RhdHVzQ29kZVwiOiA0MDN9JyxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG5cclxuICAgIGFwaS5hZGRHYXRld2F5UmVzcG9uc2UoXCJEZWZhdWx0RXJyb3JcIiwge1xyXG4gICAgICB0eXBlOiBhcGlnYXRld2F5LlJlc3BvbnNlVHlwZS5ERUZBVUxUXzRYWCxcclxuICAgICAgcmVzcG9uc2VIZWFkZXJzOiB7XHJcbiAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW5cIjogXCInKidcIixcclxuICAgICAgICBcIkFjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnNcIjpcclxuICAgICAgICAgIFwiJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uLFgtQW16LURhdGUsWC1BcGktS2V5LFgtQW16LVNlY3VyaXR5LVRva2VuJ1wiLFxyXG4gICAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kc1wiOiBcIidHRVQsUE9TVCxQVVQsREVMRVRFLE9QVElPTlMnXCIsXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICBhcGkuYWRkR2F0ZXdheVJlc3BvbnNlKFwiRGVmYXVsdDVYWEVycm9yXCIsIHtcclxuICAgICAgdHlwZTogYXBpZ2F0ZXdheS5SZXNwb25zZVR5cGUuREVGQVVMVF81WFgsXHJcbiAgICAgIHJlc3BvbnNlSGVhZGVyczoge1xyXG4gICAgICAgIFwiQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luXCI6IFwiJyonXCIsXHJcbiAgICAgICAgXCJBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzXCI6XHJcbiAgICAgICAgICBcIidDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbixYLUFtei1EYXRlLFgtQXBpLUtleSxYLUFtei1TZWN1cml0eS1Ub2tlbidcIixcclxuICAgICAgICBcIkFjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHNcIjogXCInR0VULFBPU1QsUFVULERFTEVURSxPUFRJT05TJ1wiLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQ3JlYXRlIFRva2VuIEF1dGhvcml6ZXIgd2l0aCA1LW1pbnV0ZSBjYWNoZSBUVExcclxuICAgIGNvbnN0IGF1dGhvcml6ZXIgPSBuZXcgYXBpZ2F0ZXdheS5Ub2tlbkF1dGhvcml6ZXIodGhpcywgXCJBUElBdXRob3JpemVyXCIsIHtcclxuICAgICAgaGFuZGxlcjogYXV0aG9yaXplckZ1bmN0aW9uLFxyXG4gICAgICByZXN1bHRzQ2FjaGVUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQVBJIFJlc291cmNlcyBhbmQgTWV0aG9kc1xyXG4gICAgY29uc3QgdXBsb2Fkc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ1cGxvYWRzXCIpO1xyXG4gICAgY29uc3QgcHJlc2lnblJlc291cmNlID0gdXBsb2Fkc1Jlc291cmNlLmFkZFJlc291cmNlKFwicHJlc2lnblwiKTtcclxuICAgIHByZXNpZ25SZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1cGxvYWRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGFuYWx5c2lzUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcImFuYWx5c2lzXCIpO1xyXG4gICAgY29uc3Qgc3RhcnRSZXNvdXJjZSA9IGFuYWx5c2lzUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJzdGFydFwiKTtcclxuICAgIHN0YXJ0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYW5hbHlzaXNMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGFuYWx5c2lzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihxdWVyeUxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYW5hbHlzaXNJZFJlc291cmNlID0gYW5hbHlzaXNSZXNvdXJjZS5hZGRSZXNvdXJjZShcInthbmFseXNpc0lkfVwiKTtcclxuICAgIGFuYWx5c2lzSWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHF1ZXJ5TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuICAgIGFuYWx5c2lzSWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiREVMRVRFXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHF1ZXJ5TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBkb3dubG9hZHNSZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwiZG93bmxvYWRzXCIpO1xyXG4gICAgY29uc3QgZG93bmxvYWRQcmVzaWduUmVzb3VyY2UgPSBkb3dubG9hZHNSZXNvdXJjZS5hZGRSZXNvdXJjZShcInByZXNpZ25cIik7XHJcbiAgICBkb3dubG9hZFByZXNpZ25SZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHF1ZXJ5TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFeGFtIEFQSSBSZXNvdXJjZXMgYW5kIE1ldGhvZHNcclxuICAgIGNvbnN0IGV4YW1SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwiZXhhbVwiKTtcclxuXHJcbiAgICAvLyBUb3BpYyBleHRyYWN0aW9uIGVuZHBvaW50c1xyXG4gICAgY29uc3QgdG9waWNzUmVzb3VyY2UgPSBleGFtUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ0b3BpY3NcIik7XHJcbiAgICBjb25zdCBleHRyYWN0UmVzb3VyY2UgPSB0b3BpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4dHJhY3RcIik7XHJcbiAgICBleHRyYWN0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbVRvcGljRXh0cmFjdGlvbkxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZXh0cmFjdGlvbklkUmVzb3VyY2UgPSB0b3BpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZShcIntleHRyYWN0aW9uSWR9XCIpO1xyXG4gICAgZXh0cmFjdGlvbklkUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleGFtVG9waWNFeHRyYWN0aW9uTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFeGFtIGdlbmVyYXRpb24gZW5kcG9pbnRzXHJcbiAgICBjb25zdCBnZW5lcmF0ZVJlc291cmNlID0gZXhhbVJlc291cmNlLmFkZFJlc291cmNlKFwiZ2VuZXJhdGVcIik7XHJcbiAgICBjb25zdCBzdGFydEdlbmVyYXRpb25SZXNvdXJjZSA9IGdlbmVyYXRlUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJzdGFydFwiKTtcclxuICAgIHN0YXJ0R2VuZXJhdGlvblJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGV4YW1HZW5lcmF0aW9uTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBleGFtSWRSZXNvdXJjZSA9IGdlbmVyYXRlUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ7ZXhhbUlkfVwiKTtcclxuICAgIGV4YW1JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUdlbmVyYXRpb25MYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEV4YW0gaGlzdG9yeSBlbmRwb2ludHNcclxuICAgIGNvbnN0IGhpc3RvcnlSZXNvdXJjZSA9IGV4YW1SZXNvdXJjZS5hZGRSZXNvdXJjZShcImhpc3RvcnlcIiwge1xyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkNvbnRlbnQtVHlwZVwiLCBcIkF1dGhvcml6YXRpb25cIl0sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIGhpc3RvcnlSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGV4YW1IaXN0b3J5TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBoaXN0b3J5RXhhbUlkUmVzb3VyY2UgPSBoaXN0b3J5UmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ7ZXhhbUlkfVwiLCB7XHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiQXV0aG9yaXphdGlvblwiXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgaGlzdG9yeUV4YW1JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUhpc3RvcnlMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG4gICAgaGlzdG9yeUV4YW1JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJERUxFVEVcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUhpc3RvcnlMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGV4cG9ydFJlc291cmNlID0gaGlzdG9yeVJlc291cmNlLmFkZFJlc291cmNlKFwiZXhwb3J0XCIsIHtcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJBdXRob3JpemF0aW9uXCJdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICBleHBvcnRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleGFtSGlzdG9yeUxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gRXhhbSBkb3dubG9hZCBlbmRwb2ludHNcclxuICAgIGNvbnN0IGV4YW1Eb3dubG9hZFJlc291cmNlID0gZXhhbVJlc291cmNlLmFkZFJlc291cmNlKFwiZG93bmxvYWRcIiwge1xyXG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcclxuICAgICAgICBhbGxvd09yaWdpbnM6IGFwaWdhdGV3YXkuQ29ycy5BTExfT1JJR0lOUyxcclxuICAgICAgICBhbGxvd01ldGhvZHM6IGFwaWdhdGV3YXkuQ29ycy5BTExfTUVUSE9EUyxcclxuICAgICAgICBhbGxvd0hlYWRlcnM6IFtcIkNvbnRlbnQtVHlwZVwiLCBcIkF1dGhvcml6YXRpb25cIl0sXHJcbiAgICAgIH0sXHJcbiAgICB9KTtcclxuICAgIGNvbnN0IGZpbGVJZFJlc291cmNlID0gZXhhbURvd25sb2FkUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ7ZmlsZUlkfVwiLCB7XHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiQXV0aG9yaXphdGlvblwiXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgZmlsZUlkUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleGFtSGlzdG9yeUxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQWRtaW4gQVBJIFJlc291cmNlc1xyXG4gICAgY29uc3QgYWRtaW5SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwiYWRtaW5cIik7XHJcblxyXG4gICAgLy8gQWRtaW4gbWV0cmljcyBlbmRwb2ludHMgKGV4aXN0aW5nKVxyXG4gICAgY29uc3QgbWV0cmljc1Jlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZShcIm1ldHJpY3NcIik7XHJcbiAgICBjb25zdCBleGFtc01ldHJpY3NSZXNvdXJjZSA9IG1ldHJpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4YW1zXCIpO1xyXG4gICAgZXhhbXNNZXRyaWNzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhZG1pbkxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdXNlcnNNZXRyaWNzUmVzb3VyY2UgPSBtZXRyaWNzUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ1c2Vyc1wiKTtcclxuICAgIHVzZXJzTWV0cmljc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYWRtaW5MYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHN5c3RlbU1ldHJpY3NSZXNvdXJjZSA9IG1ldHJpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZShcInN5c3RlbVwiKTtcclxuICAgIHN5c3RlbU1ldHJpY3NSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFkbWluTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBTeXN0ZW0gaGVhbHRoIGVuZHBvaW50XHJcbiAgICBjb25zdCBzeXN0ZW1IZWFsdGhSZXNvdXJjZSA9IGFkbWluUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJzeXN0ZW0taGVhbHRoXCIpO1xyXG4gICAgc3lzdGVtSGVhbHRoUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhZG1pbkxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gVXNlciBtYW5hZ2VtZW50IGVuZHBvaW50c1xyXG4gICAgY29uc3QgdXNlcnNSZXNvdXJjZSA9IGFkbWluUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ1c2Vyc1wiKTtcclxuICAgIHVzZXJzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1c2VyTWFuYWdlbWVudExhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcbiAgICB1c2Vyc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBVc2VyIHN0YXRpc3RpY3MgZW5kcG9pbnRcclxuICAgIGNvbnN0IHVzZXJTdGF0c1Jlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZShcInN0YXRpc3RpY3NcIik7XHJcbiAgICB1c2VyU3RhdHNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBCdWxrIG9wZXJhdGlvbnMgZW5kcG9pbnRcclxuICAgIGNvbnN0IGJ1bGtSZXNvdXJjZSA9IHVzZXJzUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJidWxrXCIpO1xyXG4gICAgYnVsa1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBVc2VyIGV4cG9ydCBlbmRwb2ludFxyXG4gICAgY29uc3QgdXNlckV4cG9ydFJlc291cmNlID0gdXNlcnNSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4cG9ydFwiKTtcclxuICAgIHVzZXJFeHBvcnRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1c2VyTWFuYWdlbWVudExhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gSW5kaXZpZHVhbCB1c2VyIGVuZHBvaW50c1xyXG4gICAgY29uc3QgdXNlcklkUmVzb3VyY2UgPSB1c2Vyc1Jlc291cmNlLmFkZFJlc291cmNlKFwie3VzZXJJZH1cIik7XHJcbiAgICB1c2VySWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuICAgIHVzZXJJZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJERUxFVEVcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odXNlck1hbmFnZW1lbnRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFVzZXIgc3RhdHVzIGVuZHBvaW50XHJcbiAgICBjb25zdCB1c2VyU3RhdHVzUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZShcInN0YXR1c1wiKTtcclxuICAgIHVzZXJTdGF0dXNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUFVUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBVc2VyIHJvbGUgZW5kcG9pbnRcclxuICAgIGNvbnN0IHVzZXJSb2xlUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZShcInJvbGVcIik7XHJcbiAgICB1c2VyUm9sZVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQVVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24odXNlck1hbmFnZW1lbnRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFBhc3N3b3JkIHJlc2V0IGVuZHBvaW50XHJcbiAgICBjb25zdCByZXNldFBhc3N3b3JkUmVzb3VyY2UgPSB1c2VySWRSZXNvdXJjZS5hZGRSZXNvdXJjZShcInJlc2V0LXBhc3N3b3JkXCIpO1xyXG4gICAgcmVzZXRQYXNzd29yZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHVzZXJNYW5hZ2VtZW50TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBSZXNlbmQgdmVyaWZpY2F0aW9uIGVuZHBvaW50XHJcbiAgICBjb25zdCByZXNlbmRWZXJpZmljYXRpb25SZXNvdXJjZSA9IHVzZXJJZFJlc291cmNlLmFkZFJlc291cmNlKFxyXG4gICAgICBcInJlc2VuZC12ZXJpZmljYXRpb25cIixcclxuICAgICk7XHJcbiAgICByZXNlbmRWZXJpZmljYXRpb25SZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1c2VyTWFuYWdlbWVudExhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQXVkaXQgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBhdWRpdFJlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZShcImF1ZGl0XCIpO1xyXG4gICAgYXVkaXRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGF1ZGl0TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBsb2dpbkhpc3RvcnlSZXNvdXJjZSA9IGF1ZGl0UmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJsb2dpbi1oaXN0b3J5XCIpO1xyXG4gICAgbG9naW5IaXN0b3J5UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihhdWRpdExhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZmFpbGVkTG9naW5zUmVzb3VyY2UgPSBhdWRpdFJlc291cmNlLmFkZFJlc291cmNlKFwiZmFpbGVkLWxvZ2luc1wiKTtcclxuICAgIGZhaWxlZExvZ2luc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXVkaXRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHNlY3VyaXR5QWxlcnRzUmVzb3VyY2UgPSBhdWRpdFJlc291cmNlLmFkZFJlc291cmNlKFwic2VjdXJpdHktYWxlcnRzXCIpO1xyXG4gICAgc2VjdXJpdHlBbGVydHNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGF1ZGl0TGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBhdWRpdEV4cG9ydFJlc291cmNlID0gYXVkaXRSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4cG9ydFwiKTtcclxuICAgIGF1ZGl0RXhwb3J0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oYXVkaXRMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENvbmZpZyBlbmRwb2ludHNcclxuICAgIGNvbnN0IGNvbmZpZ1Jlc291cmNlID0gYWRtaW5SZXNvdXJjZS5hZGRSZXNvdXJjZShcImNvbmZpZ1wiKTtcclxuICAgIGNvbmZpZ1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY29uZmlnTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuICAgIGNvbmZpZ1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQVVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY29uZmlnTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFbWFpbCB0ZW1wbGF0ZXMgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBlbWFpbFRlbXBsYXRlc1Jlc291cmNlID1cclxuICAgICAgY29uZmlnUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJlbWFpbC10ZW1wbGF0ZXNcIik7XHJcbiAgICBlbWFpbFRlbXBsYXRlc1Jlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY29uZmlnTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB0ZW1wbGF0ZUlkUmVzb3VyY2UgPVxyXG4gICAgICBlbWFpbFRlbXBsYXRlc1Jlc291cmNlLmFkZFJlc291cmNlKFwie3RlbXBsYXRlSWR9XCIpO1xyXG4gICAgdGVtcGxhdGVJZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oY29uZmlnTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXI6IGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuICAgIHRlbXBsYXRlSWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUFVUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGNvbmZpZ0xhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyOiBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gVGVtcGxhdGUgcHJldmlldyBlbmRwb2ludFxyXG4gICAgY29uc3QgcHJldmlld1RlbXBsYXRlUmVzb3VyY2UgPVxyXG4gICAgICBjb25maWdSZXNvdXJjZS5hZGRSZXNvdXJjZShcInByZXZpZXctdGVtcGxhdGVcIik7XHJcbiAgICBwcmV2aWV3VGVtcGxhdGVSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihjb25maWdMYW1iZGEpLFxyXG4gICAgICB7XHJcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aG9yaXplcixcclxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DVVNUT00sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIGZvciBGcm9udGVuZFxyXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcIkZyb250ZW5kRGlzdHJpYnV0aW9uXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcclxuICAgICAgICAgIG9yaWdpbjogbmV3IG9yaWdpbnMuUzNPcmlnaW4oZnJvbnRlbmRCdWNrZXQpLFxyXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6XHJcbiAgICAgICAgICAgIGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXHJcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogY2xvdWRmcm9udC5BbGxvd2VkTWV0aG9kcy5BTExPV19HRVRfSEVBRF9PUFRJT05TLFxyXG4gICAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFEX09QVElPTlMsXHJcbiAgICAgICAgICBjb21wcmVzczogdHJ1ZSxcclxuICAgICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVELFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xyXG4gICAgICAgICAgXCIvcHJvZC8qXCI6IHtcclxuICAgICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5SZXN0QXBpT3JpZ2luKGFwaSksXHJcbiAgICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OlxyXG4gICAgICAgICAgICAgIGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXHJcbiAgICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0FMTCxcclxuICAgICAgICAgICAgY2FjaGVkTWV0aG9kczogY2xvdWRmcm9udC5DYWNoZWRNZXRob2RzLkNBQ0hFX0dFVF9IRUFELFxyXG4gICAgICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX0RJU0FCTEVELFxyXG4gICAgICAgICAgICBvcmlnaW5SZXF1ZXN0UG9saWN5OiBjbG91ZGZyb250Lk9yaWdpblJlcXVlc3RQb2xpY3kuQ09SU19TM19PUklHSU4sXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6IFwiaW5kZXguaHRtbFwiLFxyXG4gICAgICAgIGVycm9yUmVzcG9uc2VzOiBbXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcclxuICAgICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXHJcbiAgICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6IFwiL2luZGV4Lmh0bWxcIixcclxuICAgICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygzMCksXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgICAge1xyXG4gICAgICAgICAgICBodHRwU3RhdHVzOiA0MDMsXHJcbiAgICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxyXG4gICAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiBcIi9pbmRleC5odG1sXCIsXHJcbiAgICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMzApLFxyXG4gICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIHByaWNlQ2xhc3M6IGNsb3VkZnJvbnQuUHJpY2VDbGFzcy5QUklDRV9DTEFTU18xMDAsIC8vIFNvbG8gVVMsIENhbmFkYSB5IEV1cm9wYVxyXG4gICAgICAgIGNvbW1lbnQ6IFwiQUkgVmVyaWZpY2F0aW9uIFBsYXRmb3JtIC0gRnJvbnRlbmQgRGlzdHJpYnV0aW9uXCIsXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkOKVkFxyXG4gICAgLy8gTcOTRFVMTzogRG9jdW1lbnQgQXV0b21hdGlvblxyXG4gICAgLy8g4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQ4pWQXHJcblxyXG4gICAgLy8gRHluYW1vREIg4oCUIGhpc3RvcmlhbCBkZSBkb2N1bWVudG9zIHByb2Nlc2Fkb3NcclxuICAgIGNvbnN0IGRvY0hpc3RvcnlUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCBcIkRvY0F1dG9tYXRpb25IaXN0b3J5XCIsIHtcclxuICAgICAgdGFibGVOYW1lOiBcIkRvY0F1dG9tYXRpb25IaXN0b3J5XCIsXHJcbiAgICAgIHBhcnRpdGlvbktleToge1xyXG4gICAgICAgIG5hbWU6IFwiZG9jdW1lbnRfaWRcIixcclxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcclxuICAgICAgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiBcInByb2Nlc3NlZF9hdFwiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxyXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gTGFtYmRhIOKAlCBEb2N1bWVudCBBdXRvbWF0aW9uIEhhbmRsZXJcclxuICAgIGNvbnN0IGRvY0F1dG9tYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcIkRvY0F1dG9tYXRpb25IYW5kbGVyXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgICBoYW5kbGVyOiBcImhhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJiYWNrZW5kL2RvY3VtZW50X2F1dG9tYXRpb25cIiksXHJcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygxMjApLFxyXG4gICAgICAgIG1lbW9yeVNpemU6IDEwMjQsXHJcbiAgICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICAgIFMzX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgICBCRURST0NLX01PREVMX0lEOlxyXG4gICAgICAgICAgICBwcm9jZXNzLmVudi5CRURST0NLX01PREVMX0lEIHx8XHJcbiAgICAgICAgICAgIFwiYW50aHJvcGljLmNsYXVkZS0zLTUtc29ubmV0LTIwMjQxMDIyLXYyOjBcIixcclxuICAgICAgICAgIERZTkFNT19UQUJMRTogZG9jSGlzdG9yeVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgICAgIFRFWFRSQUNUX01PREU6IHByb2Nlc3MuZW52LlRFWFRSQUNUX01PREUgfHwgXCJzeW5jXCIsXHJcbiAgICAgICAgICBERU1PX0RPQ1NfUzNfUFJFRklYOiBwcm9jZXNzLmVudi5ERU1PX0RPQ1NfUzNfUFJFRklYIHx8IFwiZGVtby1kb2NzL1wiLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFBlcm1pc29zIGFkaWNpb25hbGVzOiBUZXh0cmFjdCArIER5bmFtb0RCIG51ZXZhIHRhYmxhXHJcbiAgICBkb2NBdXRvbWF0aW9uTGFtYmRhLmFkZFRvUm9sZVBvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcInRleHRyYWN0OkRldGVjdERvY3VtZW50VGV4dFwiLFxyXG4gICAgICAgICAgXCJ0ZXh0cmFjdDpBbmFseXplRG9jdW1lbnRcIixcclxuICAgICAgICAgIFwidGV4dHJhY3Q6U3RhcnREb2N1bWVudFRleHREZXRlY3Rpb25cIixcclxuICAgICAgICAgIFwidGV4dHJhY3Q6R2V0RG9jdW1lbnRUZXh0RGV0ZWN0aW9uXCIsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtcIipcIl0sXHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICBkb2NBdXRvbWF0aW9uTGFtYmRhLmFkZFRvUm9sZVBvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcImR5bmFtb2RiOlB1dEl0ZW1cIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6R2V0SXRlbVwiLFxyXG4gICAgICAgICAgXCJkeW5hbW9kYjpRdWVyeVwiLFxyXG4gICAgICAgICAgXCJkeW5hbW9kYjpTY2FuXCIsXHJcbiAgICAgICAgXSxcclxuICAgICAgICByZXNvdXJjZXM6IFtkb2NIaXN0b3J5VGFibGUudGFibGVBcm5dLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQVBJIEdhdGV3YXkg4oCUIHJlY3Vyc29zIGJham8gL2RvYy1hdXRvbWF0aW9uXHJcbiAgICBjb25zdCBkb2NBdXRvbWF0aW9uUmVzb3VyY2UgPSBhcGkucm9vdC5hZGRSZXNvdXJjZShcImRvYy1hdXRvbWF0aW9uXCIpO1xyXG5cclxuICAgIGNvbnN0IGRvY1VwbG9hZFJlc291cmNlID0gZG9jQXV0b21hdGlvblJlc291cmNlLmFkZFJlc291cmNlKFwidXBsb2FkXCIpO1xyXG4gICAgZG9jVXBsb2FkUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZG9jQXV0b21hdGlvbkxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZG9jQW5hbHl6ZVJlc291cmNlID0gZG9jQXV0b21hdGlvblJlc291cmNlLmFkZFJlc291cmNlKFwiYW5hbHl6ZVwiKTtcclxuICAgIGRvY0FuYWx5emVSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihkb2NBdXRvbWF0aW9uTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBkb2NIaXN0b3J5UmVzb3VyY2UgPSBkb2NBdXRvbWF0aW9uUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJoaXN0b3J5XCIpO1xyXG4gICAgZG9jSGlzdG9yeVJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZG9jQXV0b21hdGlvbkxhbWJkYSksXHJcbiAgICAgIHtcclxuICAgICAgICBhdXRob3JpemVyLFxyXG4gICAgICAgIGF1dGhvcml6YXRpb25UeXBlOiBhcGlnYXRld2F5LkF1dGhvcml6YXRpb25UeXBlLkNVU1RPTSxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZG9jRGVtb0RvY3NSZXNvdXJjZSA9IGRvY0F1dG9tYXRpb25SZXNvdXJjZS5hZGRSZXNvdXJjZShcImRlbW8tZG9jc1wiKTtcclxuICAgIGRvY0RlbW9Eb2NzUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihkb2NBdXRvbWF0aW9uTGFtYmRhKSxcclxuICAgICAge1xyXG4gICAgICAgIGF1dGhvcml6ZXIsXHJcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ1VTVE9NLFxyXG4gICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcIkRvY0F1dG9tYXRpb25UYWJsZU5hbWVcIiwge1xyXG4gICAgICB2YWx1ZTogZG9jSGlzdG9yeVRhYmxlLnRhYmxlTmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IFwiRHluYW1vREIgdGFibGUgZm9yIERvY3VtZW50IEF1dG9tYXRpb24gaGlzdG9yeVwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJGcm9udGVuZEJ1Y2tldE5hbWVcIiwge1xyXG4gICAgICB2YWx1ZTogZnJvbnRlbmRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IFwiUzMgYnVja2V0IG5hbWUgZm9yIGZyb250ZW5kIGhvc3RpbmdcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRnJvbnRlbmRVcmxcIiwge1xyXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJGcm9udGVuZCB3ZWJzaXRlIFVSTCAoQ2xvdWRGcm9udClcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRnJvbnRlbmRTM1VybFwiLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cDovLyR7ZnJvbnRlbmRCdWNrZXQuYnVja2V0V2Vic2l0ZURvbWFpbk5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246IFwiRnJvbnRlbmQgUzMgd2Vic2l0ZSBVUkwgKGRpcmVjdClcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQ2xvdWRGcm9udERpc3RyaWJ1dGlvbklkXCIsIHtcclxuICAgICAgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcclxuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSURcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQXBpVXJsXCIsIHtcclxuICAgICAgdmFsdWU6IGFwaS51cmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFQSSBHYXRld2F5IGVuZHBvaW50IFVSTFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJVcGxvYWRCdWNrZXROYW1lXCIsIHtcclxuICAgICAgdmFsdWU6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJTMyBidWNrZXQgbmFtZSBmb3IgUERGIHVwbG9hZHNcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xJZFwiLCB7XHJcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJDb2duaXRvIFVzZXIgUG9vbCBJRFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJVc2VyUG9vbENsaWVudElkXCIsIHtcclxuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNvZ25pdG8gVXNlciBQb29sIEFwcCBDbGllbnQgSURcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiUmVnaW9uXCIsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVnaW9uLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJBV1MgUmVnaW9uXCIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19