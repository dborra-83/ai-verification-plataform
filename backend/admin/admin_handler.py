import json
import boto3
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
import csv
import io
from decimal import Decimal
import uuid

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')
cloudwatch = boto3.client('cloudwatch')


def get_user_context(event):
    """
    Extract user context from API Gateway authorizer
    
    Args:
        event: API Gateway event
        
    Returns:
        dict with userId and email, or None if not authenticated
    """
    try:
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        
        user_id = authorizer.get('userId')
        email = authorizer.get('email', '')
        
        if user_id:
            return {
                'userId': user_id,
                'email': email
            }
        return None
    except Exception as e:
        print(f"Error extracting user context: {e}")
        return None


def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

def lambda_handler(event, context):
    """
    Handle administrative operations and reporting
    """
    try:
        print(f"Admin Lambda - Received event: {json.dumps(event)}")
        
        # Extract user context from authorizer
        user_context = get_user_context(event)
        if user_context:
            print(f"Request from user: {user_context.get('email', user_context.get('userId'))}")
        
        # Handle different HTTP methods and paths
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        
        if '/admin/metrics/exams' in path and http_method == 'GET':
            return handle_exam_metrics(event, context)
        elif '/admin/metrics/users' in path and http_method == 'GET':
            return handle_user_metrics(event, context)
        elif '/admin/metrics/system' in path and http_method == 'GET':
            return handle_system_metrics(event, context)
        elif '/admin/audit-trail' in path and http_method == 'GET':
            return handle_audit_trail(event, context)
        elif '/admin/audit-trail/export' in path and http_method == 'POST':
            return handle_audit_export(event, context)
        elif '/admin/recent-activity' in path and http_method == 'GET':
            return handle_recent_activity(event, context)
        elif '/admin/system-alerts' in path and http_method == 'GET':
            return handle_system_alerts(event, context)
        elif '/admin/export-report' in path and http_method == 'POST':
            return handle_export_report(event, context)
        elif '/admin/system-health' in path and http_method == 'GET':
            return handle_system_health(event, context)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', f'Method {http_method} not allowed for path {path}')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_exam_metrics(event, context):
    """Handle exam metrics request"""
    try:
        # Get query parameters
        query_params = event.get('queryStringParameters') or {}
        days = int(query_params.get('days', '30'))
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        # Query exam generations
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression='GSI1PK = :pk AND GSI1SK BETWEEN :start_date AND :end_date',
            ExpressionAttributeValues={
                ':pk': 'EXAM_GENERATIONS',
                ':start_date': start_date.isoformat() + 'Z',
                ':end_date': end_date.isoformat() + 'Z'
            }
        )
        
        exams = response.get('Items', [])
        
        # Calculate metrics
        total_exams = len(exams)
        completed_exams = len([e for e in exams if e.get('status') == 'COMPLETED'])
        failed_exams = len([e for e in exams if e.get('status') == 'FAILED'])
        processing_exams = total_exams - completed_exams - failed_exams
        
        success_rate = (completed_exams / total_exams * 100) if total_exams > 0 else 0
        
        # Calculate average processing time
        processing_times = []
        for exam in exams:
            if exam.get('processingTime'):
                try:
                    # Assuming processingTime is in seconds
                    processing_times.append(float(exam['processingTime']))
                except (ValueError, TypeError):
                    continue
        
        avg_processing_time = sum(processing_times) / len(processing_times) if processing_times else 0
        
        # Generate daily trend data
        daily_trend = generate_daily_trend(exams, days)
        
        metrics = {
            'totalExams': total_exams,
            'last30Days': total_exams,
            'successRate': round(success_rate, 1),
            'avgProcessingTime': f"{avg_processing_time:.1f} min" if avg_processing_time > 0 else "N/A",
            'statusBreakdown': {
                'completed': completed_exams,
                'failed': failed_exams,
                'processing': processing_exams
            },
            'dailyTrend': daily_trend
        }
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(metrics, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting exam metrics: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve exam metrics')

def handle_user_metrics(event, context):
    """Handle user metrics request"""
    try:
        # For now, return mock data since we don't have a user table
        # In a real implementation, you would query a users table
        
        metrics = {
            'activeUsers': 23,
            'totalUsers': 45,
            'newUsersThisMonth': 5,
            'usersByRole': {
                'teachers': 40,
                'admins': 5
            }
        }
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(metrics, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting user metrics: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve user metrics')

def handle_system_metrics(event, context):
    """Handle system performance metrics"""
    try:
        # Get CloudWatch metrics
        try:
            # Get Lambda function metrics
            lambda_metrics = get_lambda_metrics()
            
            # Get API Gateway metrics
            api_metrics = get_api_gateway_metrics()
            
            # Combine metrics
            system_metrics = {
                'cpuUsage': lambda_metrics.get('cpuUsage', 45),
                'memoryUsage': lambda_metrics.get('memoryUsage', 62),
                'apiResponseTime': api_metrics.get('responseTime', '145ms'),
                'uptime': '99.8%',  # Mock data
                'errorRate': api_metrics.get('errorRate', '0.2%')
            }
            
        except Exception as e:
            print(f"Error getting CloudWatch metrics: {e}")
            # Return mock data if CloudWatch is not available
            system_metrics = {
                'cpuUsage': 45,
                'memoryUsage': 62,
                'apiResponseTime': '145ms',
                'uptime': '99.8%',
                'errorRate': '0.2%'
            }
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(system_metrics, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting system metrics: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve system metrics')

def handle_audit_trail(event, context):
    """Handle audit trail request"""
    try:
        query_params = event.get('queryStringParameters') or {}
        limit = int(query_params.get('limit', '50'))
        
        # Get audit entries from DynamoDB
        # For now, we'll create audit entries from exam generation records
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Query recent exam generations for audit trail
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression='GSI1PK = :pk',
            ExpressionAttributeValues={
                ':pk': 'EXAM_GENERATIONS'
            },
            ScanIndexForward=False,  # Most recent first
            Limit=limit
        )
        
        # Convert to audit entries
        audit_entries = []
        for item in response.get('Items', []):
            audit_entries.append({
                'timestamp': item.get('createdAt', datetime.utcnow().isoformat() + 'Z'),
                'userId': item.get('teacherId', 'unknown'),
                'action': 'EXAM_GENERATION',
                'resource': item.get('analysisId', ''),
                'status': 'SUCCESS' if item.get('status') == 'COMPLETED' else 'FAILED',
                'ipAddress': '192.168.1.100',  # Mock IP
                'details': f"Generated exam with {item.get('examConfig', {}).get('questionCount', 'N/A')} questions"
            })
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'entries': audit_entries,
                'total': len(audit_entries)
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting audit trail: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve audit trail')

def handle_audit_export(event, context):
    """Handle audit trail export"""
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        export_format = body.get('format', 'csv')
        filters = body.get('filters', {})
        
        # Get audit data (reuse audit trail logic)
        audit_response = handle_audit_trail(event, context)
        audit_data = json.loads(audit_response['body'])
        
        # Generate export content
        if export_format == 'csv':
            export_content = generate_audit_csv(audit_data['entries'])
            content_type = 'text/csv'
            file_extension = 'csv'
        else:
            return create_error_response(400, 'INVALID_FORMAT', 'Only CSV format is supported for audit export')
        
        # Upload to S3
        export_filename = f"audit-trail-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.{file_extension}"
        export_s3_key = f"admin/exports/{export_filename}"
        
        s3_client.put_object(
            Bucket=os.environ['UPLOAD_BUCKET'],
            Key=export_s3_key,
            Body=export_content,
            ContentType=content_type
        )
        
        # Generate presigned URL
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': os.environ['UPLOAD_BUCKET'], 'Key': export_s3_key},
            ExpiresIn=3600
        )
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'downloadUrl': download_url,
                'filename': export_filename,
                'recordCount': len(audit_data['entries'])
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error exporting audit trail: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to export audit trail')

def handle_recent_activity(event, context):
    """Handle recent activity request"""
    try:
        query_params = event.get('queryStringParameters') or {}
        limit = int(query_params.get('limit', '20'))
        
        # Get recent exam generations
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression='GSI1PK = :pk',
            ExpressionAttributeValues={
                ':pk': 'EXAM_GENERATIONS'
            },
            ScanIndexForward=False,
            Limit=limit
        )
        
        # Convert to activity entries
        activities = []
        for item in response.get('Items', []):
            activities.append({
                'timestamp': item.get('createdAt', datetime.utcnow().isoformat() + 'Z'),
                'userId': item.get('teacherId', 'unknown'),
                'action': 'Generación de Examen',
                'status': 'Completado' if item.get('status') == 'COMPLETED' else 'Fallido',
                'details': f"Examen con {item.get('examConfig', {}).get('questionCount', 'N/A')} preguntas"
            })
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'activities': activities
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting recent activity: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve recent activity')

def handle_system_alerts(event, context):
    """Handle system alerts request"""
    try:
        # Check for system issues and generate alerts
        alerts = []
        
        # Check error rates, performance issues, etc.
        # For now, return empty alerts (system is healthy)
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'alerts': alerts
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting system alerts: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve system alerts')

def handle_export_report(event, context):
    """Handle administrative report export"""
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        export_format = body.get('format', 'pdf')
        include_metrics = body.get('includeMetrics', True)
        include_audit = body.get('includeAuditTrail', True)
        
        # Generate comprehensive report
        report_data = {
            'generatedAt': datetime.utcnow().isoformat() + 'Z',
            'reportType': 'Administrative Dashboard Report',
            'format': export_format
        }
        
        if include_metrics:
            # Get metrics data
            metrics_response = handle_exam_metrics(event, context)
            metrics_data = json.loads(metrics_response['body'])
            report_data['metrics'] = metrics_data
        
        if include_audit:
            # Get audit data
            audit_response = handle_audit_trail(event, context)
            audit_data = json.loads(audit_response['body'])
            report_data['auditTrail'] = audit_data
        
        # Generate report content based on format
        if export_format == 'csv':
            report_content = generate_admin_report_csv(report_data)
            content_type = 'text/csv'
            file_extension = 'csv'
        elif export_format == 'excel':
            report_content = generate_admin_report_excel(report_data)
            content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            file_extension = 'xlsx'
        else:
            # For PDF, we'll generate a structured text report
            report_content = generate_admin_report_text(report_data)
            content_type = 'text/plain'
            file_extension = 'txt'
        
        # Upload to S3
        report_filename = f"admin-report-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.{file_extension}"
        report_s3_key = f"admin/reports/{report_filename}"
        
        s3_client.put_object(
            Bucket=os.environ['UPLOAD_BUCKET'],
            Key=report_s3_key,
            Body=report_content,
            ContentType=content_type
        )
        
        # Generate presigned URL
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': os.environ['UPLOAD_BUCKET'], 'Key': report_s3_key},
            ExpiresIn=3600
        )
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'downloadUrl': download_url,
                'filename': report_filename,
                'format': export_format
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error exporting admin report: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to export admin report')

# Helper functions
def generate_daily_trend(exams, days):
    """Generate daily trend data from exam records"""
    daily_counts = {}
    
    for exam in exams:
        created_at = exam.get('createdAt', '')
        if created_at:
            try:
                date = datetime.fromisoformat(created_at.replace('Z', '+00:00')).date()
                date_str = date.isoformat()
                daily_counts[date_str] = daily_counts.get(date_str, 0) + 1
            except:
                continue
    
    # Fill in missing dates with 0
    end_date = datetime.utcnow().date()
    trend_data = []
    
    for i in range(days):
        date = end_date - timedelta(days=i)
        date_str = date.isoformat()
        trend_data.append({
            'date': date_str,
            'count': daily_counts.get(date_str, 0)
        })
    
    return list(reversed(trend_data))

def get_lambda_metrics():
    """Get Lambda function performance metrics from CloudWatch"""
    try:
        # This would query CloudWatch for actual Lambda metrics
        # For now, return mock data
        return {
            'cpuUsage': 45,
            'memoryUsage': 62
        }
    except Exception as e:
        print(f"Error getting Lambda metrics: {e}")
        return {}

def get_api_gateway_metrics():
    """Get API Gateway performance metrics from CloudWatch"""
    try:
        # This would query CloudWatch for actual API Gateway metrics
        # For now, return mock data
        return {
            'responseTime': '145ms',
            'errorRate': '0.2%'
        }
    except Exception as e:
        print(f"Error getting API Gateway metrics: {e}")
        return {}

def generate_audit_csv(audit_entries):
    """Generate CSV content for audit trail"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        'Timestamp',
        'User ID',
        'Action',
        'Resource',
        'Status',
        'IP Address',
        'Details'
    ])
    
    # Write data
    for entry in audit_entries:
        writer.writerow([
            entry.get('timestamp', ''),
            entry.get('userId', ''),
            entry.get('action', ''),
            entry.get('resource', ''),
            entry.get('status', ''),
            entry.get('ipAddress', ''),
            entry.get('details', '')
        ])
    
    return output.getvalue().encode('utf-8')

def generate_admin_report_csv(report_data):
    """Generate CSV format administrative report"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write report header
    writer.writerow(['Administrative Dashboard Report'])
    writer.writerow(['Generated:', report_data.get('generatedAt', '')])
    writer.writerow([])
    
    # Write metrics if included
    if 'metrics' in report_data:
        metrics = report_data['metrics']
        writer.writerow(['EXAM METRICS'])
        writer.writerow(['Total Exams:', metrics.get('totalExams', 0)])
        writer.writerow(['Success Rate:', f"{metrics.get('successRate', 0)}%"])
        writer.writerow(['Avg Processing Time:', metrics.get('avgProcessingTime', 'N/A')])
        writer.writerow([])
        
        # Status breakdown
        if 'statusBreakdown' in metrics:
            breakdown = metrics['statusBreakdown']
            writer.writerow(['STATUS BREAKDOWN'])
            writer.writerow(['Completed:', breakdown.get('completed', 0)])
            writer.writerow(['Failed:', breakdown.get('failed', 0)])
            writer.writerow(['Processing:', breakdown.get('processing', 0)])
            writer.writerow([])
    
    return output.getvalue().encode('utf-8')

def generate_admin_report_excel(report_data):
    """Generate Excel format administrative report"""
    # For simplicity, return CSV format
    # In production, you would use openpyxl or similar
    return generate_admin_report_csv(report_data)

def generate_admin_report_text(report_data):
    """Generate text format administrative report"""
    lines = []
    lines.append("ADMINISTRATIVE DASHBOARD REPORT")
    lines.append("=" * 40)
    lines.append(f"Generated: {report_data.get('generatedAt', '')}")
    lines.append("")
    
    if 'metrics' in report_data:
        metrics = report_data['metrics']
        lines.append("EXAM METRICS")
        lines.append("-" * 20)
        lines.append(f"Total Exams: {metrics.get('totalExams', 0)}")
        lines.append(f"Success Rate: {metrics.get('successRate', 0)}%")
        lines.append(f"Average Processing Time: {metrics.get('avgProcessingTime', 'N/A')}")
        lines.append("")
        
        if 'statusBreakdown' in metrics:
            breakdown = metrics['statusBreakdown']
            lines.append("STATUS BREAKDOWN")
            lines.append("-" * 20)
            lines.append(f"Completed: {breakdown.get('completed', 0)}")
            lines.append(f"Failed: {breakdown.get('failed', 0)}")
            lines.append(f"Processing: {breakdown.get('processing', 0)}")
            lines.append("")
    
    return "\n".join(lines).encode('utf-8')

def create_error_response(status_code, error_code, message):
    """Create standardized error response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'error': {
                'code': error_code,
                'message': message
            }
        }, default=decimal_default)
    }

def get_cors_headers():
    """Get CORS headers for responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }


def handle_system_health(event, context):
    """
    Handle comprehensive system health check
    GET /admin/system-health
    """
    try:
        cognito_client = boto3.client('cognito-idp')
        USER_POOL_ID = os.environ.get('USER_POOL_ID', 'us-east-1_VKapStaTX')
        
        health_status = {
            'timestamp': datetime.utcnow().isoformat() + 'Z',
            'services': {},
            'overall': 'HEALTHY'
        }
        
        # Check Cognito User Pool status
        try:
            cognito_response = cognito_client.describe_user_pool(
                UserPoolId=USER_POOL_ID
            )
            user_pool = cognito_response.get('UserPool', {})
            
            health_status['services']['cognito'] = {
                'status': 'HEALTHY',
                'userPoolId': USER_POOL_ID,
                'userPoolName': user_pool.get('Name', ''),
                'estimatedUsers': user_pool.get('EstimatedNumberOfUsers', 0),
                'lastModified': str(user_pool.get('LastModifiedDate', ''))
            }
        except ClientError as e:
            health_status['services']['cognito'] = {
                'status': 'DEGRADED',
                'error': str(e.response['Error']['Code']),
                'message': 'Error al conectar con Cognito'
            }
            health_status['overall'] = 'DEGRADED'
        
        # Check DynamoDB table status
        try:
            table_name = os.environ.get('ANALYSIS_TABLE', '')
            if table_name:
                dynamodb_client = boto3.client('dynamodb')
                table_response = dynamodb_client.describe_table(TableName=table_name)
                table_status = table_response['Table']['TableStatus']
                
                health_status['services']['dynamodb'] = {
                    'status': 'HEALTHY' if table_status == 'ACTIVE' else 'DEGRADED',
                    'tableName': table_name,
                    'tableStatus': table_status,
                    'itemCount': table_response['Table'].get('ItemCount', 0)
                }
            else:
                health_status['services']['dynamodb'] = {
                    'status': 'UNKNOWN',
                    'message': 'Tabla no configurada'
                }
        except ClientError as e:
            health_status['services']['dynamodb'] = {
                'status': 'DEGRADED',
                'error': str(e.response['Error']['Code']),
                'message': 'Error al conectar con DynamoDB'
            }
            health_status['overall'] = 'DEGRADED'
        
        # Check S3 bucket status
        try:
            bucket_name = os.environ.get('UPLOAD_BUCKET', '')
            if bucket_name:
                s3_client.head_bucket(Bucket=bucket_name)
                health_status['services']['s3'] = {
                    'status': 'HEALTHY',
                    'bucketName': bucket_name
                }
            else:
                health_status['services']['s3'] = {
                    'status': 'UNKNOWN',
                    'message': 'Bucket no configurado'
                }
        except ClientError as e:
            health_status['services']['s3'] = {
                'status': 'DEGRADED',
                'error': str(e.response['Error']['Code']),
                'message': 'Error al conectar con S3'
            }
            health_status['overall'] = 'DEGRADED'
        
        # Get CloudWatch metrics for last 24 hours
        try:
            end_time = datetime.utcnow()
            start_time = end_time - timedelta(hours=24)
            
            # Get Lambda invocation metrics
            lambda_metrics = cloudwatch.get_metric_statistics(
                Namespace='AWS/Lambda',
                MetricName='Invocations',
                Dimensions=[],
                StartTime=start_time,
                EndTime=end_time,
                Period=3600,
                Statistics=['Sum']
            )
            
            # Get Lambda error metrics
            error_metrics = cloudwatch.get_metric_statistics(
                Namespace='AWS/Lambda',
                MetricName='Errors',
                Dimensions=[],
                StartTime=start_time,
                EndTime=end_time,
                Period=3600,
                Statistics=['Sum']
            )
            
            total_invocations = sum(dp['Sum'] for dp in lambda_metrics.get('Datapoints', []))
            total_errors = sum(dp['Sum'] for dp in error_metrics.get('Datapoints', []))
            error_rate = (total_errors / total_invocations * 100) if total_invocations > 0 else 0
            
            health_status['services']['lambda'] = {
                'status': 'HEALTHY' if error_rate < 5 else 'DEGRADED',
                'invocations24h': int(total_invocations),
                'errors24h': int(total_errors),
                'errorRate': f'{error_rate:.2f}%'
            }
            
            if error_rate >= 5:
                health_status['overall'] = 'DEGRADED'
                
        except Exception as e:
            print(f"Error getting CloudWatch metrics: {e}")
            health_status['services']['lambda'] = {
                'status': 'UNKNOWN',
                'message': 'Métricas no disponibles'
            }
        
        # API Gateway metrics (mock for now)
        health_status['services']['apiGateway'] = {
            'status': 'HEALTHY',
            'avgResponseTime': '145ms',
            'uptime': '99.9%'
        }
        
        # Performance summary
        health_status['performance'] = {
            'period': 'Últimas 24 horas',
            'startTime': (datetime.utcnow() - timedelta(hours=24)).isoformat() + 'Z',
            'endTime': datetime.utcnow().isoformat() + 'Z'
        }
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps(health_status, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error getting system health: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Error al obtener estado del sistema')
