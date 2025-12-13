import json
import boto3
import uuid
import os
from datetime import datetime
from botocore.exceptions import ClientError
import csv
import io
from decimal import Decimal
import base64
from urllib.parse import unquote

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError

def lambda_handler(event, context):
    """
    Manage exam history queries, exports, and file downloads
    """
    try:
        print(f"Exam History Lambda - Received event: {json.dumps(event)}")
        
        # Handle different HTTP methods and paths
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        
        if '/history/export' in path and http_method == 'POST':
            return handle_export_history(event, context)
        elif '/download/' in path and http_method == 'GET':
            return handle_file_download(event, context)
        elif '/history/' in path and http_method == 'GET':
            return handle_get_exam_details(event, context)
        elif '/history' in path and http_method == 'GET':
            return handle_list_exams(event, context)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', f'Method {http_method} not allowed for path {path}')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_list_exams(event, context):
    """Handle GET request to list exam history"""
    try:
        # Get query parameters for filtering
        query_params = event.get('queryStringParameters') or {}
        teacher_id = query_params.get('teacherId', 'admin')
        start_date = query_params.get('startDate')
        end_date = query_params.get('endDate')
        topic_filter = query_params.get('topic')
        try:
            # Support both 'limit' and 'pageSize' parameters for compatibility
            limit = int(query_params.get('limit') or query_params.get('pageSize', '50'))
        except ValueError:
            return create_error_response(400, 'INVALID_LIMIT', 'Limit/pageSize parameter must be a valid integer')
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Query exam generations for the teacher
        query_params_ddb = {
            'IndexName': 'GSI1',
            'KeyConditionExpression': 'GSI1PK = :pk',
            'ExpressionAttributeValues': {
                ':pk': 'EXAM_GENERATIONS'
            },
            'ScanIndexForward': False,  # Most recent first
            'Limit': limit
        }
        
        # Add date filtering if provided
        if start_date and end_date:
            query_params_ddb['KeyConditionExpression'] += ' AND GSI1SK BETWEEN :start_date AND :end_date'
            query_params_ddb['ExpressionAttributeValues'][':start_date'] = start_date
            query_params_ddb['ExpressionAttributeValues'][':end_date'] = end_date
        
        # Add teacher filtering
        if teacher_id != 'all':
            query_params_ddb['FilterExpression'] = 'teacherId = :teacher_id'
            query_params_ddb['ExpressionAttributeValues'][':teacher_id'] = teacher_id
        
        response = table.query(**query_params_ddb)
        

        exams = []
        for item in response.get('Items', []):
            exam_config = item.get('examConfig', {})
            exam_data = {
                'examId': item['analysisId'].replace('exam-', ''),
                'teacherId': item.get('teacherId'),
                'createdAt': item.get('createdAt'),
                'status': item.get('status'),
                'examConfig': exam_config,
                'selectedTopics': item.get('selectedTopics', []),
                'sourceDocuments': item.get('sourceDocuments', []),
                'generatedFiles': item.get('generatedFiles', []),
                # Add flattened fields for easier access in frontend
                'questionCount': exam_config.get('questionCount'),
                'difficulty': exam_config.get('difficulty'),
                'versions': exam_config.get('versions'),
                'questionTypes': exam_config.get('questionTypes', []),
                'includeSelfAssessment': exam_config.get('includeSelfAssessment', False)
            }
            
            # Apply topic filtering if specified
            if topic_filter:
                if topic_filter.lower() in [topic.lower() for topic in exam_data['selectedTopics']]:
                    exams.append(exam_data)
            else:
                exams.append(exam_data)
        
        # Calculate summary statistics
        total_exams = len(exams)
        completed_exams = len([e for e in exams if e['status'] == 'COMPLETED'])
        failed_exams = len([e for e in exams if e['status'] == 'FAILED'])
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'items': exams,  # Changed from 'exams' to 'items' for consistency
                'exams': exams,  # Keep both for backward compatibility
                'summary': {
                    'totalExams': total_exams,
                    'completedExams': completed_exams,
                    'failedExams': failed_exams,
                    'processingExams': total_exams - completed_exams - failed_exams
                },
                'filters': {
                    'teacherId': teacher_id,
                    'startDate': start_date,
                    'endDate': end_date,
                    'topic': topic_filter,
                    'limit': limit
                }
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error listing exams: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve exam history')

def handle_get_exam_details(event, context):
    """Handle GET request to retrieve specific exam details"""
    try:
        # Get exam ID from path parameters
        exam_id = event.get('pathParameters', {}).get('examId')
        
        if not exam_id:
            return create_error_response(400, 'MISSING_EXAM_ID', 'examId is required')
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Retrieve exam record
        response = table.get_item(
            Key={'analysisId': f"exam-{exam_id}"}
        )
        
        if 'Item' not in response:
            return create_error_response(404, 'EXAM_NOT_FOUND', 'Exam not found')
        
        item = response['Item']
        
        # Generate presigned URLs for file downloads
        generated_files = item.get('generatedFiles', [])
        for file_info in generated_files:
            if 's3Key' in file_info:
                try:
                    presigned_url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': os.environ['UPLOAD_BUCKET'], 'Key': file_info['s3Key']},
                        ExpiresIn=3600  # 1 hour
                    )
                    file_info['downloadUrl'] = presigned_url
                except Exception as e:
                    print(f"Error generating presigned URL for {file_info['s3Key']}: {e}")
                    file_info['downloadUrl'] = None
        
        # Return detailed exam information
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'examId': exam_id,
                'teacherId': item.get('teacherId'),
                'createdAt': item.get('createdAt'),
                'status': item.get('status'),
                'examConfig': item.get('examConfig', {}),
                'selectedTopics': item.get('selectedTopics', []),
                'sourceDocuments': item.get('sourceDocuments', []),
                'generatedFiles': generated_files,
                'errorMessage': item.get('errorMessage')
            }, default=decimal_default)
        }
        
    except Exception as e:
        print(f"Error retrieving exam details: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve exam details')

def handle_export_history(event, context):
    """Handle POST request to export exam history"""
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        export_format = body.get('format', 'csv').lower()
        teacher_id = body.get('teacherId', 'admin')
        start_date = body.get('startDate')
        end_date = body.get('endDate')
        
        if export_format not in ['csv', 'excel']:
            return create_error_response(400, 'INVALID_FORMAT', 'Export format must be csv or excel')
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Query all exam generations for export
        query_params = {
            'IndexName': 'GSI1',
            'KeyConditionExpression': 'GSI1PK = :pk',
            'ExpressionAttributeValues': {
                ':pk': 'EXAM_GENERATIONS'
            }
        }
        
        # Add date filtering if provided
        if start_date and end_date:
            query_params['KeyConditionExpression'] += ' AND GSI1SK BETWEEN :start_date AND :end_date'
            query_params['ExpressionAttributeValues'][':start_date'] = start_date
            query_params['ExpressionAttributeValues'][':end_date'] = end_date
        
        # Add teacher filtering
        if teacher_id != 'all':
            query_params['FilterExpression'] = 'teacherId = :teacher_id'
            query_params['ExpressionAttributeValues'][':teacher_id'] = teacher_id
        
        response = table.query(**query_params)
        
        # Generate export content
        if export_format == 'csv':
            export_content = generate_csv_export(response.get('Items', []))
            content_type = 'text/csv'
            file_extension = 'csv'
        else:
            export_content = generate_excel_export(response.get('Items', []))
            content_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            file_extension = 'xlsx'
        
        # Upload export file to S3
        export_filename = f"exam-history-export-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.{file_extension}"
        export_s3_key = f"exams/exports/{export_filename}"
        
        s3_client.put_object(
            Bucket=os.environ['UPLOAD_BUCKET'],
            Key=export_s3_key,
            Body=export_content,
            ContentType=content_type
        )
        
        # Generate presigned URL for download
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': os.environ['UPLOAD_BUCKET'], 'Key': export_s3_key},
            ExpiresIn=3600  # 1 hour
        )
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'exportUrl': download_url,
                'filename': export_filename,
                'format': export_format,
                'recordCount': len(response.get('Items', []))
            }, default=decimal_default)
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'INVALID_JSON', 'Request body must be valid JSON')
    except Exception as e:
        print(f"Error exporting history: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to export exam history')

def handle_file_download(event, context):
    """Handle GET request to download exam files with enhanced format support"""
    try:
        # Get file ID from path parameters
        file_id = event.get('pathParameters', {}).get('fileId')
        query_params = event.get('queryStringParameters') or {}
        
        if not file_id:
            return create_error_response(400, 'MISSING_FILE_ID', 'fileId is required')
        
        # URL decode the file_id in case it contains special characters
        file_id = unquote(file_id)
        
        # Get optional parameters
        download_format = query_params.get('format', 'original')  # original, pdf, docx
        inline = query_params.get('inline', 'false').lower() == 'true'
        
        # Determine the S3 bucket based on file type
        bucket_name = os.environ.get('UPLOAD_BUCKET')
        
        # If it's an exam file, it might be in a different location
        if file_id.startswith('exams/'):
            bucket_name = os.environ.get('UPLOAD_BUCKET')  # Same bucket for now
        
        # Generate presigned URL for file download
        try:
            # Set content disposition based on inline parameter
            response_content_disposition = 'inline' if inline else 'attachment'
            
            # Generate presigned URL with appropriate parameters
            presigned_params = {
                'Bucket': bucket_name,
                'Key': file_id
            }
            
            # Add response parameters for content disposition
            if not inline:
                # Extract filename from S3 key
                filename = file_id.split('/')[-1]
                presigned_params['ResponseContentDisposition'] = f'attachment; filename="{filename}"'
            
            download_url = s3_client.generate_presigned_url(
                'get_object',
                Params=presigned_params,
                ExpiresIn=3600  # 1 hour
            )
            
            # Get file metadata
            try:
                head_response = s3_client.head_object(Bucket=bucket_name, Key=file_id)
                file_size = head_response.get('ContentLength', 0)
                content_type = head_response.get('ContentType', 'application/octet-stream')
                last_modified = head_response.get('LastModified')
                
                file_metadata = {
                    'size': file_size,
                    'contentType': content_type,
                    'lastModified': last_modified.isoformat() if last_modified else None
                }
            except ClientError:
                file_metadata = {}
            
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'downloadUrl': download_url,
                    'fileId': file_id,
                    'format': download_format,
                    'expiresIn': 3600,
                    'metadata': file_metadata
                }, default=decimal_default)
            }
            
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == 'NoSuchKey':
                return create_error_response(404, 'FILE_NOT_FOUND', f'File not found: {file_id}')
            elif error_code == 'NoSuchBucket':
                return create_error_response(404, 'BUCKET_NOT_FOUND', 'Storage bucket not found')
            elif error_code == 'AccessDenied':
                return create_error_response(403, 'ACCESS_DENIED', 'Access denied to file')
            else:
                print(f"S3 ClientError: {e}")
                raise e
        
    except Exception as e:
        print(f"Error generating download URL: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to generate download URL')

def generate_csv_export(exam_items):
    """Generate CSV export content"""
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'Exam ID',
            'Teacher ID',
            'Created At',
            'Status',
            'Question Count',
            'Question Types',
            'Difficulty',
            'Versions',
            'Self Assessment',
            'Selected Topics',
            'Source Documents',
            'Generated Files Count'
        ])
        
        # Write data rows
        for item in exam_items:
            exam_config = item.get('examConfig', {})
            writer.writerow([
                item['analysisId'].replace('exam-', ''),
                item.get('teacherId', ''),
                item.get('createdAt', ''),
                item.get('status', ''),
                exam_config.get('questionCount', ''),
                ', '.join(exam_config.get('questionTypes', [])),
                exam_config.get('difficulty', ''),
                exam_config.get('versions', ''),
                exam_config.get('includeSelfAssessment', False),
                ', '.join(item.get('selectedTopics', [])),
                ', '.join(item.get('sourceDocuments', [])),
                len(item.get('generatedFiles', []))
            ])
        
        return output.getvalue().encode('utf-8')
        
    except Exception as e:
        print(f"Error generating CSV export: {e}")
        raise Exception(f"Failed to generate CSV export: {e}")

def generate_excel_export(exam_items):
    """Generate Excel export content using openpyxl-compatible format"""
    try:
        # For now, we'll create a more structured CSV that can be easily imported to Excel
        # In a production environment, you would install openpyxl and create actual Excel files
        
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Write title and metadata
        writer.writerow(['Exam Generation History Report'])
        writer.writerow(['Generated on:', datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')])
        writer.writerow(['Total Records:', len(exam_items)])
        writer.writerow([])  # Empty row
        
        # Write detailed header with descriptions
        writer.writerow([
            'Exam ID',
            'Teacher ID', 
            'Created Date',
            'Created Time',
            'Status',
            'Question Count',
            'Question Types',
            'Difficulty Level',
            'Number of Versions',
            'Self Assessment Enabled',
            'Selected Topics',
            'Source Documents',
            'Generated Files',
            'File Count',
            'Processing Time (if available)',
            'Error Message (if any)'
        ])
        
        # Write data rows with enhanced formatting
        for item in exam_items:
            exam_config = item.get('examConfig', {})
            created_at = item.get('createdAt', '')
            
            # Parse date and time if available
            try:
                if created_at:
                    dt = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    created_date = dt.strftime('%Y-%m-%d')
                    created_time = dt.strftime('%H:%M:%S')
                else:
                    created_date = ''
                    created_time = ''
            except:
                created_date = created_at
                created_time = ''
            
            # Format generated files info
            generated_files = item.get('generatedFiles', [])
            files_info = []
            for file_info in generated_files:
                file_desc = f"{file_info.get('type', 'unknown')} (v{file_info.get('version', 1)}, {file_info.get('format', 'PDF')})"
                files_info.append(file_desc)
            
            writer.writerow([
                item['analysisId'].replace('exam-', ''),
                item.get('teacherId', ''),
                created_date,
                created_time,
                item.get('status', ''),
                exam_config.get('questionCount', ''),
                ', '.join(exam_config.get('questionTypes', [])),
                exam_config.get('difficulty', ''),
                exam_config.get('versions', ''),
                'Yes' if exam_config.get('includeSelfAssessment', False) else 'No',
                ', '.join(item.get('selectedTopics', [])),
                ', '.join(item.get('sourceDocuments', [])),
                '; '.join(files_info),
                len(generated_files),
                item.get('processingTime', ''),
                item.get('errorMessage', '')
            ])
        
        # Add summary statistics at the end
        writer.writerow([])  # Empty row
        writer.writerow(['Summary Statistics:'])
        
        total_exams = len(exam_items)
        completed_exams = len([e for e in exam_items if e.get('status') == 'COMPLETED'])
        failed_exams = len([e for e in exam_items if e.get('status') == 'FAILED'])
        processing_exams = total_exams - completed_exams - failed_exams
        
        writer.writerow(['Total Exams:', total_exams])
        writer.writerow(['Completed:', completed_exams])
        writer.writerow(['Failed:', failed_exams])
        writer.writerow(['Processing:', processing_exams])
        
        if total_exams > 0:
            writer.writerow(['Success Rate:', f'{(completed_exams/total_exams)*100:.1f}%'])
        
        return output.getvalue().encode('utf-8')
        
    except Exception as e:
        print(f"Error generating Excel export: {e}")
        raise Exception(f"Failed to generate Excel export: {e}")

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