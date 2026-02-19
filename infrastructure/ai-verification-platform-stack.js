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
            resources: [
                "arn:aws:bedrock:*::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0",
            ],
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
        // API Resources and Methods
        const uploadsResource = api.root.addResource("uploads");
        const presignResource = uploadsResource.addResource("presign");
        presignResource.addMethod("POST", new apigateway.LambdaIntegration(uploadLambda));
        const analysisResource = api.root.addResource("analysis");
        const startResource = analysisResource.addResource("start");
        startResource.addMethod("POST", new apigateway.LambdaIntegration(analysisLambda));
        analysisResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda));
        const analysisIdResource = analysisResource.addResource("{analysisId}");
        analysisIdResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda));
        analysisIdResource.addMethod("DELETE", new apigateway.LambdaIntegration(queryLambda));
        const downloadsResource = api.root.addResource("downloads");
        const downloadPresignResource = downloadsResource.addResource("presign");
        downloadPresignResource.addMethod("GET", new apigateway.LambdaIntegration(queryLambda));
        // Exam API Resources and Methods
        const examResource = api.root.addResource("exam");
        // Topic extraction endpoints
        const topicsResource = examResource.addResource("topics");
        const extractResource = topicsResource.addResource("extract");
        extractResource.addMethod("POST", new apigateway.LambdaIntegration(examTopicExtractionLambda));
        const extractionIdResource = topicsResource.addResource("{extractionId}");
        extractionIdResource.addMethod("GET", new apigateway.LambdaIntegration(examTopicExtractionLambda));
        // Exam generation endpoints
        const generateResource = examResource.addResource("generate");
        const startGenerationResource = generateResource.addResource("start");
        startGenerationResource.addMethod("POST", new apigateway.LambdaIntegration(examGenerationLambda));
        const examIdResource = generateResource.addResource("{examId}");
        examIdResource.addMethod("GET", new apigateway.LambdaIntegration(examGenerationLambda));
        // Exam history endpoints
        const historyResource = examResource.addResource("history", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        historyResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda));
        const historyExamIdResource = historyResource.addResource("{examId}", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        historyExamIdResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda));
        historyExamIdResource.addMethod("DELETE", new apigateway.LambdaIntegration(examHistoryLambda));
        const exportResource = historyResource.addResource("export", {
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });
        exportResource.addMethod("POST", new apigateway.LambdaIntegration(examHistoryLambda));
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
        fileIdResource.addMethod("GET", new apigateway.LambdaIntegration(examHistoryLambda));
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLG1DQUFtQztBQUNuQyx5Q0FBeUM7QUFDekMsaURBQWlEO0FBQ2pELHlEQUF5RDtBQUN6RCxxREFBcUQ7QUFDckQsMkNBQTJDO0FBQzNDLHlEQUF5RDtBQUN6RCw4REFBOEQ7QUFDOUQsbURBQW1EO0FBR25ELE1BQWEsMkJBQTRCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDeEQsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjtRQUM5RCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4Qix1Q0FBdUM7UUFDdkMsTUFBTSxRQUFRLEdBQUcsSUFBSSxPQUFPLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUNwRSxZQUFZLEVBQUUsZ0NBQWdDO1lBQzlDLGlCQUFpQixFQUFFLElBQUk7WUFDdkIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELGNBQWMsRUFBRTtnQkFDZCxTQUFTLEVBQUUsQ0FBQztnQkFDWixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixnQkFBZ0IsRUFBRSxJQUFJO2dCQUN0QixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsY0FBYyxFQUFFLEtBQUs7YUFDdEI7WUFDRCxlQUFlLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxVQUFVO1lBQ25ELGFBQWEsRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sRUFBRSxvQkFBb0I7U0FDOUQsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLE1BQU0sY0FBYyxHQUFHLFFBQVEsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFO1lBQ3hELGtCQUFrQixFQUFFLGdCQUFnQjtZQUNwQyxTQUFTLEVBQUU7Z0JBQ1QsWUFBWSxFQUFFLElBQUk7Z0JBQ2xCLE9BQU8sRUFBRSxJQUFJO2FBQ2Q7WUFDRCxjQUFjLEVBQUUsS0FBSztZQUNyQiwwQkFBMEIsRUFBRSxJQUFJO1lBQ2hDLG1CQUFtQixFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUMxQyxvQkFBb0IsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUM7WUFDM0MsZUFBZSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztTQUN2QyxDQUFDLENBQUM7UUFFSCxpQ0FBaUM7UUFDakMsTUFBTSxjQUFjLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMzRCxVQUFVLEVBQUUsNEJBQTRCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNyRSxvQkFBb0IsRUFBRSxZQUFZO1lBQ2xDLG9CQUFvQixFQUFFLFlBQVk7WUFDbEMsZ0JBQWdCLEVBQUUsSUFBSTtZQUN0QixpQkFBaUIsRUFBRSxFQUFFLENBQUMsaUJBQWlCLENBQUMsVUFBVTtZQUNsRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsNEJBQTRCO1FBQzVCLE1BQU0sWUFBWSxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsY0FBYyxFQUFFO1lBQ3ZELFVBQVUsRUFBRSwyQkFBMkIsSUFBSSxDQUFDLE9BQU8sSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ3BFLElBQUksRUFBRTtnQkFDSjtvQkFDRSxjQUFjLEVBQUU7d0JBQ2QsRUFBRSxDQUFDLFdBQVcsQ0FBQyxHQUFHO3dCQUNsQixFQUFFLENBQUMsV0FBVyxDQUFDLEdBQUc7d0JBQ2xCLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSTtxQkFDcEI7b0JBQ0QsY0FBYyxFQUFFLENBQUMsR0FBRyxDQUFDO29CQUNyQixjQUFjLEVBQUUsQ0FBQyxHQUFHLENBQUM7b0JBQ3JCLE1BQU0sRUFBRSxJQUFJO2lCQUNiO2FBQ0Y7WUFDRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3hDLGlCQUFpQixFQUFFLElBQUk7U0FDeEIsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLE1BQU0sYUFBYSxHQUFHLElBQUksUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQzlELFNBQVMsRUFBRSx1QkFBdUI7WUFDbEMsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFlBQVksRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDekUsV0FBVyxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUMsZUFBZTtZQUNqRCxhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixhQUFhLENBQUMsdUJBQXVCLENBQUM7WUFDcEMsU0FBUyxFQUFFLE1BQU07WUFDakIsWUFBWSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7WUFDckUsT0FBTyxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsUUFBUSxDQUFDLGFBQWEsQ0FBQyxNQUFNLEVBQUU7U0FDakUsQ0FBQyxDQUFDO1FBRUgsZ0NBQWdDO1FBQ2hDLE1BQU0sVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ2xELFNBQVMsRUFBRSxJQUFJLEdBQUcsQ0FBQyxnQkFBZ0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUMzRCxlQUFlLEVBQUU7Z0JBQ2YsR0FBRyxDQUFDLGFBQWEsQ0FBQyx3QkFBd0IsQ0FDeEMsMENBQTBDLENBQzNDO2FBQ0Y7U0FDRixDQUFDLENBQUM7UUFFSCxnREFBZ0Q7UUFDaEQsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLGNBQWM7Z0JBQ2QsY0FBYztnQkFDZCxpQkFBaUI7Z0JBQ2pCLHFCQUFxQjthQUN0QjtZQUNELFNBQVMsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDO1NBQzNDLENBQUMsQ0FDSCxDQUFDO1FBRUYsVUFBVSxDQUFDLFdBQVcsQ0FDcEIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUs7WUFDeEIsT0FBTyxFQUFFO2dCQUNQLGtCQUFrQjtnQkFDbEIsa0JBQWtCO2dCQUNsQixxQkFBcUI7Z0JBQ3JCLHFCQUFxQjtnQkFDckIsZ0JBQWdCO2dCQUNoQixlQUFlO2FBQ2hCO1lBQ0QsU0FBUyxFQUFFO2dCQUNULGFBQWEsQ0FBQyxRQUFRO2dCQUN0QixhQUFhLENBQUMsUUFBUSxHQUFHLFVBQVU7YUFDcEM7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLFVBQVUsQ0FBQyxXQUFXLENBQ3BCLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixNQUFNLEVBQUUsR0FBRyxDQUFDLE1BQU0sQ0FBQyxLQUFLO1lBQ3hCLE9BQU8sRUFBRSxDQUFDLHFCQUFxQixDQUFDO1lBQ2hDLFNBQVMsRUFBRTtnQkFDVCwrRUFBK0U7YUFDaEY7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLGlDQUFpQztRQUNqQyxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRTtZQUM3RCxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSwrQkFBK0I7WUFDeEMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLGdCQUFnQixDQUFDO1lBQzdDLElBQUksRUFBRSxVQUFVO1lBQ2hCLFdBQVcsRUFBRTtnQkFDWCxhQUFhLEVBQUUsWUFBWSxDQUFDLFVBQVU7YUFDdkM7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILDJCQUEyQjtRQUMzQixNQUFNLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2pFLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVc7WUFDbkMsT0FBTyxFQUFFLGlDQUFpQztZQUMxQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsa0JBQWtCLENBQUM7WUFDL0MsSUFBSSxFQUFFLFVBQVU7WUFDaEIsV0FBVyxFQUFFO2dCQUNYLGFBQWEsRUFBRSxZQUFZLENBQUMsVUFBVTtnQkFDdEMsY0FBYyxFQUFFLGFBQWEsQ0FBQyxTQUFTO2FBQ3hDO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztZQUNoQyxVQUFVLEVBQUUsSUFBSTtTQUNqQixDQUFDLENBQUM7UUFFSCx3QkFBd0I7UUFDeEIsTUFBTSxXQUFXLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxhQUFhLEVBQUU7WUFDM0QsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsOEJBQThCO1lBQ3ZDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQUM7WUFDNUMsSUFBSSxFQUFFLFVBQVU7WUFDaEIsV0FBVyxFQUFFO2dCQUNYLGNBQWMsRUFBRSxhQUFhLENBQUMsU0FBUztnQkFDdkMsYUFBYSxFQUFFLFlBQVksQ0FBQyxVQUFVO2FBQ3ZDO1lBQ0QsT0FBTyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztTQUNsQyxDQUFDLENBQUM7UUFFSCx3Q0FBd0M7UUFDeEMsTUFBTSx5QkFBeUIsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQ25ELElBQUksRUFDSiwyQkFBMkIsRUFDM0I7WUFDRSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSx5Q0FBeUM7WUFDbEQsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLCtCQUErQixDQUFDO1lBQzVELElBQUksRUFBRSxVQUFVO1lBQ2hCLFdBQVcsRUFBRTtnQkFDWCxhQUFhLEVBQUUsWUFBWSxDQUFDLFVBQVU7Z0JBQ3RDLGNBQWMsRUFBRSxhQUFhLENBQUMsU0FBUzthQUN4QztZQUNELE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLElBQUk7U0FDakIsQ0FDRixDQUFDO1FBRUYsa0NBQWtDO1FBQ2xDLE1BQU0sb0JBQW9CLEdBQUcsSUFBSSxNQUFNLENBQUMsUUFBUSxDQUM5QyxJQUFJLEVBQ0osc0JBQXNCLEVBQ3RCO1lBQ0UsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUsd0NBQXdDO1lBQ2pELElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyx5QkFBeUIsQ0FBQztZQUN0RCxJQUFJLEVBQUUsVUFBVTtZQUNoQixXQUFXLEVBQUU7Z0JBQ1gsYUFBYSxFQUFFLFlBQVksQ0FBQyxVQUFVO2dCQUN0QyxjQUFjLEVBQUUsYUFBYSxDQUFDLFNBQVM7YUFDeEM7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLFVBQVUsRUFBRSxJQUFJO1NBQ2pCLENBQ0YsQ0FBQztRQUVGLCtCQUErQjtRQUMvQixNQUFNLGlCQUFpQixHQUFHLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDdkUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVztZQUNuQyxPQUFPLEVBQUUscUNBQXFDO1lBQzlDLElBQUksRUFBRSxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxzQkFBc0IsQ0FBQztZQUNuRCxJQUFJLEVBQUUsVUFBVTtZQUNoQixXQUFXLEVBQUU7Z0JBQ1gsY0FBYyxFQUFFLGFBQWEsQ0FBQyxTQUFTO2dCQUN2QyxhQUFhLEVBQUUsWUFBWSxDQUFDLFVBQVU7YUFDdkM7WUFDRCxPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUVILHVCQUF1QjtRQUN2QixNQUFNLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzVELFdBQVcsRUFBRSxxQkFBcUI7WUFDbEMsV0FBVyxFQUFFLDhCQUE4QjtZQUMzQywyQkFBMkIsRUFBRTtnQkFDM0IsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztnQkFDekMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztnQkFDekMsWUFBWSxFQUFFO29CQUNaLGNBQWM7b0JBQ2QsZUFBZTtvQkFDZixZQUFZO29CQUNaLFdBQVc7b0JBQ1gsc0JBQXNCO29CQUN0QixrQkFBa0I7aUJBQ25CO2dCQUNELGdCQUFnQixFQUFFLEtBQUs7YUFDeEI7U0FDRixDQUFDLENBQUM7UUFFSCw0QkFBNEI7UUFDNUIsTUFBTSxlQUFlLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDeEQsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvRCxlQUFlLENBQUMsU0FBUyxDQUN2QixNQUFNLEVBQ04sSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsWUFBWSxDQUFDLENBQy9DLENBQUM7UUFFRixNQUFNLGdCQUFnQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQzFELE1BQU0sYUFBYSxHQUFHLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1RCxhQUFhLENBQUMsU0FBUyxDQUNyQixNQUFNLEVBQ04sSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsY0FBYyxDQUFDLENBQ2pELENBQUM7UUFFRixnQkFBZ0IsQ0FBQyxTQUFTLENBQ3hCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLENBQUMsQ0FDOUMsQ0FBQztRQUVGLE1BQU0sa0JBQWtCLEdBQUcsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ3hFLGtCQUFrQixDQUFDLFNBQVMsQ0FDMUIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUM5QyxDQUFDO1FBQ0Ysa0JBQWtCLENBQUMsU0FBUyxDQUMxQixRQUFRLEVBQ1IsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsV0FBVyxDQUFDLENBQzlDLENBQUM7UUFFRixNQUFNLGlCQUFpQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzVELE1BQU0sdUJBQXVCLEdBQUcsaUJBQWlCLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ3pFLHVCQUF1QixDQUFDLFNBQVMsQ0FDL0IsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxDQUM5QyxDQUFDO1FBRUYsaUNBQWlDO1FBQ2pDLE1BQU0sWUFBWSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRWxELDZCQUE2QjtRQUM3QixNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzFELE1BQU0sZUFBZSxHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDOUQsZUFBZSxDQUFDLFNBQVMsQ0FDdkIsTUFBTSxFQUNOLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLHlCQUF5QixDQUFDLENBQzVELENBQUM7UUFFRixNQUFNLG9CQUFvQixHQUFHLGNBQWMsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMxRSxvQkFBb0IsQ0FBQyxTQUFTLENBQzVCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyx5QkFBeUIsQ0FBQyxDQUM1RCxDQUFDO1FBRUYsNEJBQTRCO1FBQzVCLE1BQU0sZ0JBQWdCLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM5RCxNQUFNLHVCQUF1QixHQUFHLGdCQUFnQixDQUFDLFdBQVcsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN0RSx1QkFBdUIsQ0FBQyxTQUFTLENBQy9CLE1BQU0sRUFDTixJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUN2RCxDQUFDO1FBRUYsTUFBTSxjQUFjLEdBQUcsZ0JBQWdCLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2hFLGNBQWMsQ0FBQyxTQUFTLENBQ3RCLEtBQUssRUFDTCxJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxvQkFBb0IsQ0FBQyxDQUN2RCxDQUFDO1FBRUYseUJBQXlCO1FBQ3pCLE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFO1lBQzFELDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO2FBQ2hEO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsZUFBZSxDQUFDLFNBQVMsQ0FDdkIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLENBQ3BELENBQUM7UUFFRixNQUFNLHFCQUFxQixHQUFHLGVBQWUsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFO1lBQ3BFLDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO2FBQ2hEO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gscUJBQXFCLENBQUMsU0FBUyxDQUM3QixLQUFLLEVBQ0wsSUFBSSxVQUFVLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCLENBQUMsQ0FDcEQsQ0FBQztRQUNGLHFCQUFxQixDQUFDLFNBQVMsQ0FDN0IsUUFBUSxFQUNSLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLENBQ3BELENBQUM7UUFFRixNQUFNLGNBQWMsR0FBRyxlQUFlLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRTtZQUMzRCwyQkFBMkIsRUFBRTtnQkFDM0IsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztnQkFDekMsWUFBWSxFQUFFLFVBQVUsQ0FBQyxJQUFJLENBQUMsV0FBVztnQkFDekMsWUFBWSxFQUFFLENBQUMsY0FBYyxFQUFFLGVBQWUsQ0FBQzthQUNoRDtTQUNGLENBQUMsQ0FBQztRQUNILGNBQWMsQ0FBQyxTQUFTLENBQ3RCLE1BQU0sRUFDTixJQUFJLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBaUIsQ0FBQyxDQUNwRCxDQUFDO1FBRUYsMEJBQTBCO1FBQzFCLE1BQU0sb0JBQW9CLEdBQUcsWUFBWSxDQUFDLFdBQVcsQ0FBQyxVQUFVLEVBQUU7WUFDaEUsMkJBQTJCLEVBQUU7Z0JBQzNCLFlBQVksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVc7Z0JBQ3pDLFlBQVksRUFBRSxVQUFVLENBQUMsSUFBSSxDQUFDLFdBQVc7Z0JBQ3pDLFlBQVksRUFBRSxDQUFDLGNBQWMsRUFBRSxlQUFlLENBQUM7YUFDaEQ7U0FDRixDQUFDLENBQUM7UUFDSCxNQUFNLGNBQWMsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsVUFBVSxFQUFFO1lBQ2xFLDJCQUEyQixFQUFFO2dCQUMzQixZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsVUFBVSxDQUFDLElBQUksQ0FBQyxXQUFXO2dCQUN6QyxZQUFZLEVBQUUsQ0FBQyxjQUFjLEVBQUUsZUFBZSxDQUFDO2FBQ2hEO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsY0FBYyxDQUFDLFNBQVMsQ0FDdEIsS0FBSyxFQUNMLElBQUksVUFBVSxDQUFDLGlCQUFpQixDQUFDLGlCQUFpQixDQUFDLENBQ3BELENBQUM7UUFFRix1Q0FBdUM7UUFDdkMsTUFBTSxZQUFZLEdBQUcsSUFBSSxVQUFVLENBQUMsWUFBWSxDQUM5QyxJQUFJLEVBQ0osc0JBQXNCLEVBQ3RCO1lBQ0UsZUFBZSxFQUFFO2dCQUNmLE1BQU0sRUFBRSxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDO2dCQUM1QyxvQkFBb0IsRUFDbEIsVUFBVSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQjtnQkFDbkQsY0FBYyxFQUFFLFVBQVUsQ0FBQyxjQUFjLENBQUMsc0JBQXNCO2dCQUNoRSxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWEsQ0FBQyxzQkFBc0I7Z0JBQzlELFFBQVEsRUFBRSxJQUFJO2dCQUNkLFdBQVcsRUFBRSxVQUFVLENBQUMsV0FBVyxDQUFDLGlCQUFpQjthQUN0RDtZQUNELG1CQUFtQixFQUFFO2dCQUNuQixTQUFTLEVBQUU7b0JBQ1QsTUFBTSxFQUFFLElBQUksT0FBTyxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUM7b0JBQ3RDLG9CQUFvQixFQUNsQixVQUFVLENBQUMsb0JBQW9CLENBQUMsaUJBQWlCO29CQUNuRCxjQUFjLEVBQUUsVUFBVSxDQUFDLGNBQWMsQ0FBQyxTQUFTO29CQUNuRCxhQUFhLEVBQUUsVUFBVSxDQUFDLGFBQWEsQ0FBQyxjQUFjO29CQUN0RCxXQUFXLEVBQUUsVUFBVSxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0I7b0JBQ3BELG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxtQkFBbUIsQ0FBQyxjQUFjO2lCQUNuRTthQUNGO1lBQ0QsaUJBQWlCLEVBQUUsWUFBWTtZQUMvQixjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsVUFBVSxFQUFFLEdBQUc7b0JBQ2Ysa0JBQWtCLEVBQUUsR0FBRztvQkFDdkIsZ0JBQWdCLEVBQUUsYUFBYTtvQkFDL0IsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztpQkFDOUI7Z0JBQ0Q7b0JBQ0UsVUFBVSxFQUFFLEdBQUc7b0JBQ2Ysa0JBQWtCLEVBQUUsR0FBRztvQkFDdkIsZ0JBQWdCLEVBQUUsYUFBYTtvQkFDL0IsR0FBRyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztpQkFDOUI7YUFDRjtZQUNELFVBQVUsRUFBRSxVQUFVLENBQUMsVUFBVSxDQUFDLGVBQWU7WUFDakQsT0FBTyxFQUFFLGtEQUFrRDtTQUM1RCxDQUNGLENBQUM7UUFFRixVQUFVO1FBQ1YsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxvQkFBb0IsRUFBRTtZQUM1QyxLQUFLLEVBQUUsY0FBYyxDQUFDLFVBQVU7WUFDaEMsV0FBVyxFQUFFLHFDQUFxQztTQUNuRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsV0FBVyxZQUFZLENBQUMsc0JBQXNCLEVBQUU7WUFDdkQsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsVUFBVSxjQUFjLENBQUMsdUJBQXVCLEVBQUU7WUFDekQsV0FBVyxFQUFFLGtDQUFrQztTQUNoRCxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLDBCQUEwQixFQUFFO1lBQ2xELEtBQUssRUFBRSxZQUFZLENBQUMsY0FBYztZQUNsQyxXQUFXLEVBQUUsNEJBQTRCO1NBQzFDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFFO1lBQ2hDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUMxQyxLQUFLLEVBQUUsWUFBWSxDQUFDLFVBQVU7WUFDOUIsV0FBVyxFQUFFLGdDQUFnQztTQUM5QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLFlBQVksRUFBRTtZQUNwQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7WUFDMUIsV0FBVyxFQUFFLHNCQUFzQjtTQUNwQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQzFDLEtBQUssRUFBRSxjQUFjLENBQUMsZ0JBQWdCO1lBQ3RDLFdBQVcsRUFBRSxpQ0FBaUM7U0FDL0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ2xCLFdBQVcsRUFBRSxZQUFZO1NBQzFCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9jRCxrRUErY0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XHJcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcclxuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtbGFtYmRhXCI7XHJcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XHJcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGJcIjtcclxuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XHJcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250XCI7XHJcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnNcIjtcclxuaW1wb3J0ICogYXMgY29nbml0byBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNvZ25pdG9cIjtcclxuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcclxuXHJcbmV4cG9ydCBjbGFzcyBBaVZlcmlmaWNhdGlvblBsYXRmb3JtU3RhY2sgZXh0ZW5kcyBjZGsuU3RhY2sge1xyXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcclxuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xyXG5cclxuICAgIC8vIENvZ25pdG8gVXNlciBQb29sIGZvciBhdXRoZW50aWNhdGlvblxyXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcIkFJVmVyaWZpY2F0aW9uVXNlclBvb2xcIiwge1xyXG4gICAgICB1c2VyUG9vbE5hbWU6IFwiYWktdmVyaWZpY2F0aW9uLXBsYXRmb3JtLXVzZXJzXCIsXHJcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiB0cnVlLFxyXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XHJcbiAgICAgICAgZW1haWw6IHRydWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIGF1dG9WZXJpZnk6IHtcclxuICAgICAgICBlbWFpbDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHtcclxuICAgICAgICBtaW5MZW5ndGg6IDgsXHJcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcclxuICAgICAgICByZXF1aXJlVXBwZXJjYXNlOiB0cnVlLFxyXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXHJcbiAgICAgICAgcmVxdWlyZVN5bWJvbHM6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiwgLy8gUHJvdGVjdCB1c2VyIGRhdGFcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIENvbmZpZ3VyZSB0b2tlbiBleHBpcmF0aW9uXHJcbiAgICBjb25zdCB1c2VyUG9vbENsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudChcIldlYkFwcENsaWVudFwiLCB7XHJcbiAgICAgIHVzZXJQb29sQ2xpZW50TmFtZTogXCJ3ZWItYXBwLWNsaWVudFwiLFxyXG4gICAgICBhdXRoRmxvd3M6IHtcclxuICAgICAgICB1c2VyUGFzc3dvcmQ6IHRydWUsXHJcbiAgICAgICAgdXNlclNycDogdHJ1ZSxcclxuICAgICAgfSxcclxuICAgICAgZ2VuZXJhdGVTZWNyZXQ6IGZhbHNlLFxyXG4gICAgICBwcmV2ZW50VXNlckV4aXN0ZW5jZUVycm9yczogdHJ1ZSxcclxuICAgICAgYWNjZXNzVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxyXG4gICAgICByZWZyZXNoVG9rZW5WYWxpZGl0eTogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxyXG4gICAgICBpZFRva2VuVmFsaWRpdHk6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIFMzIEJ1Y2tldCBmb3IgZnJvbnRlbmQgaG9zdGluZ1xyXG4gICAgY29uc3QgZnJvbnRlbmRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiRnJvbnRlbmRCdWNrZXRcIiwge1xyXG4gICAgICBidWNrZXROYW1lOiBgYWktdmVyaWZpY2F0aW9uLWZyb250ZW5kLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXHJcbiAgICAgIHdlYnNpdGVJbmRleERvY3VtZW50OiBcImluZGV4Lmh0bWxcIixcclxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6IFwibG9naW4uaHRtbFwiLFxyXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiB0cnVlLFxyXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUNMUyxcclxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcclxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBTMyBCdWNrZXQgZm9yIFBERiB1cGxvYWRzXHJcbiAgICBjb25zdCB1cGxvYWRCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiVXBsb2FkQnVja2V0XCIsIHtcclxuICAgICAgYnVja2V0TmFtZTogYGFpLXZlcmlmaWNhdGlvbi11cGxvYWRzLSR7dGhpcy5hY2NvdW50fS0ke3RoaXMucmVnaW9ufWAsXHJcbiAgICAgIGNvcnM6IFtcclxuICAgICAgICB7XHJcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xyXG4gICAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXHJcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcclxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcclxuICAgICAgICAgIF0sXHJcbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSxcclxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxyXG4gICAgICAgICAgbWF4QWdlOiAzMDAwLFxyXG4gICAgICAgIH0sXHJcbiAgICAgIF0sXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gRHluYW1vREIgdGFibGUgZm9yIGFuYWx5c2lzIHJlc3VsdHNcclxuICAgIGNvbnN0IGFuYWx5c2lzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgXCJBbmFseXNpc1RhYmxlXCIsIHtcclxuICAgICAgdGFibGVOYW1lOiBcIkFpVmVyaWZpY2F0aW9uUmVzdWx0c1wiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJhbmFseXNpc0lkXCIsIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HIH0sXHJcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXHJcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBHU0kgZm9yIHF1ZXJ5aW5nIGJ5IGRhdGVcclxuICAgIGFuYWx5c2lzVGFibGUuYWRkR2xvYmFsU2Vjb25kYXJ5SW5kZXgoe1xyXG4gICAgICBpbmRleE5hbWU6IFwiR1NJMVwiLFxyXG4gICAgICBwYXJ0aXRpb25LZXk6IHsgbmFtZTogXCJHU0kxUEtcIiwgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcgfSxcclxuICAgICAgc29ydEtleTogeyBuYW1lOiBcIkdTSTFTS1wiLCB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gSUFNIHJvbGUgZm9yIExhbWJkYSBmdW5jdGlvbnNcclxuICAgIGNvbnN0IGxhbWJkYVJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJMYW1iZGFSb2xlXCIsIHtcclxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJsYW1iZGEuYW1hem9uYXdzLmNvbVwiKSxcclxuICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXHJcbiAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxyXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCIsXHJcbiAgICAgICAgKSxcclxuICAgICAgXSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFkZCBwZXJtaXNzaW9ucyBmb3IgUzMsIER5bmFtb0RCLCBhbmQgQmVkcm9ja1xyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcInMzOkdldE9iamVjdFwiLFxyXG4gICAgICAgICAgXCJzMzpQdXRPYmplY3RcIixcclxuICAgICAgICAgIFwiczM6RGVsZXRlT2JqZWN0XCIsXHJcbiAgICAgICAgICBcInMzOkdldE9iamVjdFZlcnNpb25cIixcclxuICAgICAgICBdLFxyXG4gICAgICAgIHJlc291cmNlczogW3VwbG9hZEJ1Y2tldC5idWNrZXRBcm4gKyBcIi8qXCJdLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXHJcbiAgICAgICAgICBcImR5bmFtb2RiOlB1dEl0ZW1cIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6R2V0SXRlbVwiLFxyXG4gICAgICAgICAgXCJkeW5hbW9kYjpVcGRhdGVJdGVtXCIsXHJcbiAgICAgICAgICBcImR5bmFtb2RiOkRlbGV0ZUl0ZW1cIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6UXVlcnlcIixcclxuICAgICAgICAgIFwiZHluYW1vZGI6U2NhblwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcmVzb3VyY2VzOiBbXHJcbiAgICAgICAgICBhbmFseXNpc1RhYmxlLnRhYmxlQXJuLFxyXG4gICAgICAgICAgYW5hbHlzaXNUYWJsZS50YWJsZUFybiArIFwiL2luZGV4LypcIixcclxuICAgICAgICBdLFxyXG4gICAgICB9KSxcclxuICAgICk7XHJcblxyXG4gICAgbGFtYmRhUm9sZS5hZGRUb1BvbGljeShcclxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xyXG4gICAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcclxuICAgICAgICBhY3Rpb25zOiBbXCJiZWRyb2NrOkludm9rZU1vZGVsXCJdLFxyXG4gICAgICAgIHJlc291cmNlczogW1xyXG4gICAgICAgICAgXCJhcm46YXdzOmJlZHJvY2s6Kjo6Zm91bmRhdGlvbi1tb2RlbC9hbnRocm9waWMuY2xhdWRlLTMtNS1zb25uZXQtMjAyNDA2MjAtdjE6MFwiLFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBVcGxvYWQgcHJlc2lnbiBMYW1iZGEgZnVuY3Rpb25cclxuICAgIGNvbnN0IHVwbG9hZExhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJVcGxvYWRMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJ1cGxvYWRfaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJiYWNrZW5kL3VwbG9hZFwiKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBVUExPQURfQlVDS0VUOiB1cGxvYWRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgfSxcclxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQW5hbHlzaXMgTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBjb25zdCBhbmFseXNpc0xhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJBbmFseXNpc0xhbWJkYVwiLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICBoYW5kbGVyOiBcImFuYWx5c2lzX2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9hbmFseXNpc1wiKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBVUExPQURfQlVDS0VUOiB1cGxvYWRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxyXG4gICAgICBtZW1vcnlTaXplOiAxMDI0LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gUXVlcnkgTGFtYmRhIGZ1bmN0aW9uXHJcbiAgICBjb25zdCBxdWVyeUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJRdWVyeUxhbWJkYVwiLCB7XHJcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICBoYW5kbGVyOiBcInF1ZXJ5X2hhbmRsZXIubGFtYmRhX2hhbmRsZXJcIixcclxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9xdWVyeVwiKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEV4YW0gVG9waWMgRXh0cmFjdGlvbiBMYW1iZGEgZnVuY3Rpb25cclxuICAgIGNvbnN0IGV4YW1Ub3BpY0V4dHJhY3Rpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcIkV4YW1Ub3BpY0V4dHJhY3Rpb25MYW1iZGFcIixcclxuICAgICAge1xyXG4gICAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzExLFxyXG4gICAgICAgIGhhbmRsZXI6IFwidG9waWNfZXh0cmFjdGlvbl9oYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9leGFtLXRvcGljLWV4dHJhY3Rpb25cIiksXHJcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogMjA0OCxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gRXhhbSBHZW5lcmF0aW9uIExhbWJkYSBmdW5jdGlvblxyXG4gICAgY29uc3QgZXhhbUdlbmVyYXRpb25MYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKFxyXG4gICAgICB0aGlzLFxyXG4gICAgICBcIkV4YW1HZW5lcmF0aW9uTGFtYmRhXCIsXHJcbiAgICAgIHtcclxuICAgICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgICBoYW5kbGVyOiBcImV4YW1fZ2VuZXJhdGlvbl9oYW5kbGVyLmxhbWJkYV9oYW5kbGVyXCIsXHJcbiAgICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwiYmFja2VuZC9leGFtLWdlbmVyYXRpb25cIiksXHJcbiAgICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgICBlbnZpcm9ubWVudDoge1xyXG4gICAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgfSxcclxuICAgICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxMCksXHJcbiAgICAgICAgbWVtb3J5U2l6ZTogMjA0OCxcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gRXhhbSBIaXN0b3J5IExhbWJkYSBmdW5jdGlvblxyXG4gICAgY29uc3QgZXhhbUhpc3RvcnlMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiRXhhbUhpc3RvcnlMYW1iZGFcIiwge1xyXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM18xMSxcclxuICAgICAgaGFuZGxlcjogXCJleGFtX2hpc3RvcnlfaGFuZGxlci5sYW1iZGFfaGFuZGxlclwiLFxyXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJiYWNrZW5kL2V4YW0taGlzdG9yeVwiKSxcclxuICAgICAgcm9sZTogbGFtYmRhUm9sZSxcclxuICAgICAgZW52aXJvbm1lbnQ6IHtcclxuICAgICAgICBBTkFMWVNJU19UQUJMRTogYW5hbHlzaXNUYWJsZS50YWJsZU5hbWUsXHJcbiAgICAgICAgVVBMT0FEX0JVQ0tFVDogdXBsb2FkQnVja2V0LmJ1Y2tldE5hbWUsXHJcbiAgICAgIH0sXHJcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcclxuICAgIH0pO1xyXG5cclxuICAgIC8vIEFQSSBHYXRld2F5IFJFU1QgQVBJXHJcbiAgICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsIFwiQWlWZXJpZmljYXRpb25BcGlcIiwge1xyXG4gICAgICByZXN0QXBpTmFtZTogXCJhaS12ZXJpZmljYXRpb24tYXBpXCIsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFJIFZlcmlmaWNhdGlvbiBQbGF0Zm9ybSBBUElcIixcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXHJcbiAgICAgICAgICBcIkNvbnRlbnQtVHlwZVwiLFxyXG4gICAgICAgICAgXCJBdXRob3JpemF0aW9uXCIsXHJcbiAgICAgICAgICBcIlgtQW16LURhdGVcIixcclxuICAgICAgICAgIFwiWC1BcGktS2V5XCIsXHJcbiAgICAgICAgICBcIlgtQW16LVNlY3VyaXR5LVRva2VuXCIsXHJcbiAgICAgICAgICBcIlgtUmVxdWVzdGVkLVdpdGhcIixcclxuICAgICAgICBdLFxyXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IGZhbHNlLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8gQVBJIFJlc291cmNlcyBhbmQgTWV0aG9kc1xyXG4gICAgY29uc3QgdXBsb2Fkc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJ1cGxvYWRzXCIpO1xyXG4gICAgY29uc3QgcHJlc2lnblJlc291cmNlID0gdXBsb2Fkc1Jlc291cmNlLmFkZFJlc291cmNlKFwicHJlc2lnblwiKTtcclxuICAgIHByZXNpZ25SZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiUE9TVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1cGxvYWRMYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBhbmFseXNpc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJhbmFseXNpc1wiKTtcclxuICAgIGNvbnN0IHN0YXJ0UmVzb3VyY2UgPSBhbmFseXNpc1Jlc291cmNlLmFkZFJlc291cmNlKFwic3RhcnRcIik7XHJcbiAgICBzdGFydFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJQT1NUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGFuYWx5c2lzTGFtYmRhKSxcclxuICAgICk7XHJcblxyXG4gICAgYW5hbHlzaXNSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHF1ZXJ5TGFtYmRhKSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgYW5hbHlzaXNJZFJlc291cmNlID0gYW5hbHlzaXNSZXNvdXJjZS5hZGRSZXNvdXJjZShcInthbmFseXNpc0lkfVwiKTtcclxuICAgIGFuYWx5c2lzSWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHF1ZXJ5TGFtYmRhKSxcclxuICAgICk7XHJcbiAgICBhbmFseXNpc0lkUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkRFTEVURVwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihxdWVyeUxhbWJkYSksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGRvd25sb2Fkc1Jlc291cmNlID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJkb3dubG9hZHNcIik7XHJcbiAgICBjb25zdCBkb3dubG9hZFByZXNpZ25SZXNvdXJjZSA9IGRvd25sb2Fkc1Jlc291cmNlLmFkZFJlc291cmNlKFwicHJlc2lnblwiKTtcclxuICAgIGRvd25sb2FkUHJlc2lnblJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocXVlcnlMYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFeGFtIEFQSSBSZXNvdXJjZXMgYW5kIE1ldGhvZHNcclxuICAgIGNvbnN0IGV4YW1SZXNvdXJjZSA9IGFwaS5yb290LmFkZFJlc291cmNlKFwiZXhhbVwiKTtcclxuXHJcbiAgICAvLyBUb3BpYyBleHRyYWN0aW9uIGVuZHBvaW50c1xyXG4gICAgY29uc3QgdG9waWNzUmVzb3VyY2UgPSBleGFtUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ0b3BpY3NcIik7XHJcbiAgICBjb25zdCBleHRyYWN0UmVzb3VyY2UgPSB0b3BpY3NSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4dHJhY3RcIik7XHJcbiAgICBleHRyYWN0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbVRvcGljRXh0cmFjdGlvbkxhbWJkYSksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGV4dHJhY3Rpb25JZFJlc291cmNlID0gdG9waWNzUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ7ZXh0cmFjdGlvbklkfVwiKTtcclxuICAgIGV4dHJhY3Rpb25JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbVRvcGljRXh0cmFjdGlvbkxhbWJkYSksXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEV4YW0gZ2VuZXJhdGlvbiBlbmRwb2ludHNcclxuICAgIGNvbnN0IGdlbmVyYXRlUmVzb3VyY2UgPSBleGFtUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJnZW5lcmF0ZVwiKTtcclxuICAgIGNvbnN0IHN0YXJ0R2VuZXJhdGlvblJlc291cmNlID0gZ2VuZXJhdGVSZXNvdXJjZS5hZGRSZXNvdXJjZShcInN0YXJ0XCIpO1xyXG4gICAgc3RhcnRHZW5lcmF0aW9uUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUdlbmVyYXRpb25MYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBleGFtSWRSZXNvdXJjZSA9IGdlbmVyYXRlUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJ7ZXhhbUlkfVwiKTtcclxuICAgIGV4YW1JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJHRVRcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUdlbmVyYXRpb25MYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFeGFtIGhpc3RvcnkgZW5kcG9pbnRzXHJcbiAgICBjb25zdCBoaXN0b3J5UmVzb3VyY2UgPSBleGFtUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJoaXN0b3J5XCIsIHtcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJBdXRob3JpemF0aW9uXCJdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICBoaXN0b3J5UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleGFtSGlzdG9yeUxhbWJkYSksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGhpc3RvcnlFeGFtSWRSZXNvdXJjZSA9IGhpc3RvcnlSZXNvdXJjZS5hZGRSZXNvdXJjZShcIntleGFtSWR9XCIsIHtcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJBdXRob3JpemF0aW9uXCJdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICBoaXN0b3J5RXhhbUlkUmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIkdFVFwiLFxyXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihleGFtSGlzdG9yeUxhbWJkYSksXHJcbiAgICApO1xyXG4gICAgaGlzdG9yeUV4YW1JZFJlc291cmNlLmFkZE1ldGhvZChcclxuICAgICAgXCJERUxFVEVcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUhpc3RvcnlMYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBleHBvcnRSZXNvdXJjZSA9IGhpc3RvcnlSZXNvdXJjZS5hZGRSZXNvdXJjZShcImV4cG9ydFwiLCB7XHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiQXV0aG9yaXphdGlvblwiXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgZXhwb3J0UmVzb3VyY2UuYWRkTWV0aG9kKFxyXG4gICAgICBcIlBPU1RcIixcclxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24oZXhhbUhpc3RvcnlMYW1iZGEpLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBFeGFtIGRvd25sb2FkIGVuZHBvaW50c1xyXG4gICAgY29uc3QgZXhhbURvd25sb2FkUmVzb3VyY2UgPSBleGFtUmVzb3VyY2UuYWRkUmVzb3VyY2UoXCJkb3dubG9hZFwiLCB7XHJcbiAgICAgIGRlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xyXG4gICAgICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxyXG4gICAgICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxyXG4gICAgICAgIGFsbG93SGVhZGVyczogW1wiQ29udGVudC1UeXBlXCIsIFwiQXV0aG9yaXphdGlvblwiXSxcclxuICAgICAgfSxcclxuICAgIH0pO1xyXG4gICAgY29uc3QgZmlsZUlkUmVzb3VyY2UgPSBleGFtRG93bmxvYWRSZXNvdXJjZS5hZGRSZXNvdXJjZShcIntmaWxlSWR9XCIsIHtcclxuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XHJcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBhcGlnYXRld2F5LkNvcnMuQUxMX09SSUdJTlMsXHJcbiAgICAgICAgYWxsb3dNZXRob2RzOiBhcGlnYXRld2F5LkNvcnMuQUxMX01FVEhPRFMsXHJcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXCJDb250ZW50LVR5cGVcIiwgXCJBdXRob3JpemF0aW9uXCJdLFxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICBmaWxlSWRSZXNvdXJjZS5hZGRNZXRob2QoXHJcbiAgICAgIFwiR0VUXCIsXHJcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGV4YW1IaXN0b3J5TGFtYmRhKSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gZm9yIEZyb250ZW5kXHJcbiAgICBjb25zdCBkaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24oXHJcbiAgICAgIHRoaXMsXHJcbiAgICAgIFwiRnJvbnRlbmREaXN0cmlidXRpb25cIixcclxuICAgICAge1xyXG4gICAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xyXG4gICAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbihmcm9udGVuZEJ1Y2tldCksXHJcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTpcclxuICAgICAgICAgICAgY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcclxuICAgICAgICAgIGFsbG93ZWRNZXRob2RzOiBjbG91ZGZyb250LkFsbG93ZWRNZXRob2RzLkFMTE9XX0dFVF9IRUFEX09QVElPTlMsXHJcbiAgICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQURfT1BUSU9OUyxcclxuICAgICAgICAgIGNvbXByZXNzOiB0cnVlLFxyXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XHJcbiAgICAgICAgICBcIi9wcm9kLypcIjoge1xyXG4gICAgICAgICAgICBvcmlnaW46IG5ldyBvcmlnaW5zLlJlc3RBcGlPcmlnaW4oYXBpKSxcclxuICAgICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6XHJcbiAgICAgICAgICAgICAgY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcclxuICAgICAgICAgICAgYWxsb3dlZE1ldGhvZHM6IGNsb3VkZnJvbnQuQWxsb3dlZE1ldGhvZHMuQUxMT1dfQUxMLFxyXG4gICAgICAgICAgICBjYWNoZWRNZXRob2RzOiBjbG91ZGZyb250LkNhY2hlZE1ldGhvZHMuQ0FDSEVfR0VUX0hFQUQsXHJcbiAgICAgICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfRElTQUJMRUQsXHJcbiAgICAgICAgICAgIG9yaWdpblJlcXVlc3RQb2xpY3k6IGNsb3VkZnJvbnQuT3JpZ2luUmVxdWVzdFBvbGljeS5DT1JTX1MzX09SSUdJTixcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBkZWZhdWx0Um9vdE9iamVjdDogXCJpbmRleC5odG1sXCIsXHJcbiAgICAgICAgZXJyb3JSZXNwb25zZXM6IFtcclxuICAgICAgICAgIHtcclxuICAgICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxyXG4gICAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcclxuICAgICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogXCIvaW5kZXguaHRtbFwiLFxyXG4gICAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDMwKSxcclxuICAgICAgICAgIH0sXHJcbiAgICAgICAgICB7XHJcbiAgICAgICAgICAgIGh0dHBTdGF0dXM6IDQwMyxcclxuICAgICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXHJcbiAgICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6IFwiL2luZGV4Lmh0bWxcIixcclxuICAgICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24ubWludXRlcygzMCksXHJcbiAgICAgICAgICB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgICAgcHJpY2VDbGFzczogY2xvdWRmcm9udC5QcmljZUNsYXNzLlBSSUNFX0NMQVNTXzEwMCwgLy8gU29sbyBVUywgQ2FuYWRhIHkgRXVyb3BhXHJcbiAgICAgICAgY29tbWVudDogXCJBSSBWZXJpZmljYXRpb24gUGxhdGZvcm0gLSBGcm9udGVuZCBEaXN0cmlidXRpb25cIixcclxuICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gT3V0cHV0c1xyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJGcm9udGVuZEJ1Y2tldE5hbWVcIiwge1xyXG4gICAgICB2YWx1ZTogZnJvbnRlbmRCdWNrZXQuYnVja2V0TmFtZSxcclxuICAgICAgZGVzY3JpcHRpb246IFwiUzMgYnVja2V0IG5hbWUgZm9yIGZyb250ZW5kIGhvc3RpbmdcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRnJvbnRlbmRVcmxcIiwge1xyXG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJGcm9udGVuZCB3ZWJzaXRlIFVSTCAoQ2xvdWRGcm9udClcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiRnJvbnRlbmRTM1VybFwiLCB7XHJcbiAgICAgIHZhbHVlOiBgaHR0cDovLyR7ZnJvbnRlbmRCdWNrZXQuYnVja2V0V2Vic2l0ZURvbWFpbk5hbWV9YCxcclxuICAgICAgZGVzY3JpcHRpb246IFwiRnJvbnRlbmQgUzMgd2Vic2l0ZSBVUkwgKGRpcmVjdClcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQ2xvdWRGcm9udERpc3RyaWJ1dGlvbklkXCIsIHtcclxuICAgICAgdmFsdWU6IGRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZCxcclxuICAgICAgZGVzY3JpcHRpb246IFwiQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gSURcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiQXBpVXJsXCIsIHtcclxuICAgICAgdmFsdWU6IGFwaS51cmwsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFQSSBHYXRld2F5IGVuZHBvaW50IFVSTFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJVcGxvYWRCdWNrZXROYW1lXCIsIHtcclxuICAgICAgdmFsdWU6IHVwbG9hZEJ1Y2tldC5idWNrZXROYW1lLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJTMyBidWNrZXQgbmFtZSBmb3IgUERGIHVwbG9hZHNcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiVXNlclBvb2xJZFwiLCB7XHJcbiAgICAgIHZhbHVlOiB1c2VyUG9vbC51c2VyUG9vbElkLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJDb2duaXRvIFVzZXIgUG9vbCBJRFwiLFxyXG4gICAgfSk7XHJcblxyXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJVc2VyUG9vbENsaWVudElkXCIsIHtcclxuICAgICAgdmFsdWU6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXHJcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkNvZ25pdG8gVXNlciBQb29sIEFwcCBDbGllbnQgSURcIixcclxuICAgIH0pO1xyXG5cclxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiUmVnaW9uXCIsIHtcclxuICAgICAgdmFsdWU6IHRoaXMucmVnaW9uLFxyXG4gICAgICBkZXNjcmlwdGlvbjogXCJBV1MgUmVnaW9uXCIsXHJcbiAgICB9KTtcclxuICB9XHJcbn1cclxuIl19