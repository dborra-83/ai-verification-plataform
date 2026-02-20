import json
import boto3
import uuid
import os
from datetime import datetime
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')


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


def lambda_handler(event, context):
    """
    Generate pre-signed URLs for PDF uploads to S3
    """
    try:
        # Extract user context from authorizer
        user_context = get_user_context(event)
        if user_context:
            print(f"Request from user: {user_context.get('email', user_context.get('userId'))}")
        
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        # Validate required fields
        filename = body.get('filename')
        content_type = body.get('contentType')
        
        if not filename or not content_type:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps({
                    'error': {
                        'code': 'MISSING_FIELDS',
                        'message': 'filename and contentType are required'
                    }
                })
            }
        
        # Validate PDF content type
        if content_type != 'application/pdf':
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps({
                    'error': {
                        'code': 'INVALID_FILE_TYPE',
                        'message': 'Only PDF files are allowed'
                    }
                })
            }
        
        # Generate S3 key with date structure
        now = datetime.utcnow()
        file_uuid = str(uuid.uuid4())
        s3_key = f"uploads/{now.year:04d}/{now.month:02d}/{now.day:02d}/{file_uuid}-{filename}"
        
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        # Generate pre-signed URL for PUT operation
        try:
            presigned_url = s3_client.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket': bucket_name,
                    'Key': s3_key,
                    'ContentType': content_type
                },
                ExpiresIn=3600  # 1 hour
            )
        except ClientError as e:
            print(f"Error generating presigned URL: {e}")
            return {
                'statusCode': 500,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
                },
                'body': json.dumps({
                    'error': {
                        'code': 'PRESIGN_ERROR',
                        'message': 'Failed to generate upload URL'
                    }
                })
            }
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                'uploadUrl': presigned_url,
                's3Key': s3_key,
                'bucket': bucket_name
            })
        }
        
    except json.JSONDecodeError:
        return {
            'statusCode': 400,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                'error': {
                    'code': 'INVALID_JSON',
                    'message': 'Request body must be valid JSON'
                }
            })
        }
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            },
            'body': json.dumps({
                'error': {
                    'code': 'INTERNAL_ERROR',
                    'message': 'Internal server error'
                }
            })
        }