import json
import boto3
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

def decimal_default(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, Decimal):
        # Convert decimal to float for JSON serialization
        return float(obj)
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

def convert_decimals(obj):
    """Recursively convert Decimal objects to float in nested structures"""
    if isinstance(obj, list):
        return [convert_decimals(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: convert_decimals(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

def lambda_handler(event, context):
    """
    Handle query requests for analysis data and PDF downloads
    """
    try:
        print(f"Query Lambda - Received event: {json.dumps(event)}")
        
        # Determine the operation based on path and method
        # For REST API, use different path extraction
        path = event.get('path', event.get('rawPath', ''))
        method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        path_parameters = event.get('pathParameters') or {}
        
        print(f"Path: {path}, Method: {method}, PathParams: {path_parameters}")
        
        if path == '/analysis' and method == 'GET':
            return handle_list_analyses(event)
        elif path.startswith('/analysis/') and method == 'GET':
            return handle_get_analysis_detail(event)
        elif path.startswith('/analysis/') and method == 'DELETE':
            return handle_delete_analysis(event)
        elif path == '/downloads/presign' and method == 'GET':
            return handle_download_presign(event)
        else:
            return create_error_response(404, 'NOT_FOUND', f'Endpoint not found: {method} {path}')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_list_analyses(event):
    """Handle GET /analysis - List AI detection analyses with filtering and pagination"""
    try:
        print("Handling list AI detection analyses request")
        
        # Parse query parameters
        query_params = event.get('queryStringParameters') or {}
        
        from_date = query_params.get('from')
        to_date = query_params.get('to')
        course = query_params.get('course')
        page_size = int(query_params.get('pageSize', '20'))
        next_token = query_params.get('nextToken')
        
        print(f"Query params: pageSize={page_size}, course={course}")
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        try:
            # Query GSI1 to get only AI detection results (not exam generations)
            query_params_ddb = {
                'IndexName': 'GSI1',
                'KeyConditionExpression': Key('GSI1PK').eq('RESULTS'),
                'ScanIndexForward': False,  # Most recent first
                'Limit': page_size
            }
            
            # Add pagination token if provided
            if next_token:
                try:
                    import base64
                    token_data = json.loads(base64.b64decode(next_token.encode()).decode())
                    query_params_ddb['ExclusiveStartKey'] = token_data
                except Exception as e:
                    print(f"Invalid next token: {e}")
            
            response = table.query(**query_params_ddb)
            items = response.get('Items', [])
            
            # Filter out exam generation records (they should not be in RESULTS GSI1PK, but double-check)
            items = [item for item in items if not item.get('analysisId', '').startswith('exam-')]
            
            print(f"Found {len(items)} analyses in DynamoDB")
            
            # Filter by course if specified
            if course:
                items = [item for item in items if item.get('metadata', {}).get('course') == course]
            
            # Filter by date range if specified
            if from_date or to_date:
                filtered_items = []
                for item in items:
                    item_date = item.get('createdAt')
                    if item_date:
                        try:
                            item_datetime = datetime.fromisoformat(item_date.replace('Z', '+00:00'))
                            
                            if from_date:
                                from_datetime = datetime.fromisoformat(from_date + 'T00:00:00+00:00')
                                if item_datetime < from_datetime:
                                    continue
                            
                            if to_date:
                                to_datetime = datetime.fromisoformat(to_date + 'T23:59:59+00:00')
                                if item_datetime > to_datetime:
                                    continue
                            
                            filtered_items.append(item)
                        except Exception as e:
                            print(f"Error parsing date {item_date}: {e}")
                            # Include item if date parsing fails
                            filtered_items.append(item)
                
                items = filtered_items
            
            # Sort by creation date (newest first)
            items.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
            
            # Format response items and convert Decimals
            formatted_items = []
            for item in items:
                formatted_item = {
                    'analysisId': item.get('analysisId'),
                    'createdAt': item.get('createdAt'),
                    'status': item.get('status'),
                    'studentName': item.get('metadata', {}).get('studentName'),
                    'course': item.get('metadata', {}).get('course'),
                    'assignmentName': item.get('metadata', {}).get('assignmentName'),
                    'aiLikelihoodScore': convert_decimals(item.get('aiLikelihoodScore')),
                    'originalityScore': convert_decimals(item.get('originalityScore')),
                    'confidence': convert_decimals(item.get('confidence')),
                    'metadata': convert_decimals(item.get('metadata', {}))
                }
                formatted_items.append(formatted_item)
            
            # Prepare next token
            response_next_token = None
            if 'LastEvaluatedKey' in response:
                import base64
                # Convert Decimals in LastEvaluatedKey too
                converted_key = convert_decimals(response['LastEvaluatedKey'])
                token_data = json.dumps(converted_key)
                response_next_token = base64.b64encode(token_data.encode()).decode()
            
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'items': formatted_items,
                    'nextToken': response_next_token
                })
            }
            
        except Exception as db_error:
            print(f"Database error in list analyses: {db_error}")
            # Return empty list instead of error for better UX
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'items': [],
                    'nextToken': None
                })
            }
        
    except Exception as e:
        print(f"Error listing analyses: {e}")
        return create_error_response(500, 'QUERY_ERROR', 'Failed to retrieve analyses')

def handle_get_analysis_detail(event):
    """Handle GET /analysis/{analysisId} - Get specific analysis details"""
    try:
        # Extract analysis ID from path parameters (REST API) or path
        path_parameters = event.get('pathParameters') or {}
        analysis_id = path_parameters.get('analysisId')
        
        if not analysis_id:
            # Fallback to extracting from path
            path = event.get('path', event.get('rawPath', ''))
            analysis_id = path.split('/')[-1]
        
        print(f"Extracted analysis_id: {analysis_id}")
        
        if not analysis_id or analysis_id == 'analysis':
            return create_error_response(400, 'MISSING_ID', 'Analysis ID is required')
        
        # Get table reference
        table_name = os.environ.get('ANALYSIS_TABLE')
        if not table_name:
            print("ERROR: ANALYSIS_TABLE environment variable not set")
            return create_error_response(500, 'CONFIG_ERROR', 'Database configuration error')
        
        print(f"Using DynamoDB table: {table_name}")
        table = dynamodb.Table(table_name)
        
        try:
            # Query for the specific analysis
            print(f"Querying DynamoDB for analysisId: {analysis_id}")
            response = table.get_item(Key={'analysisId': analysis_id})
            
            print(f"DynamoDB response: {response}")
            
            if 'Item' not in response:
                print(f"Analysis not found in DynamoDB: {analysis_id}")
                return create_error_response(404, 'NOT_FOUND', 'Analysis not found')
            
            item = response['Item']
            print(f"Found analysis item: {item}")
            
            # Format the complete analysis record and convert Decimals
            formatted_item = {
                'analysisId': item.get('analysisId'),
                'createdAt': item.get('createdAt'),
                'status': item.get('status'),
                'teacher': item.get('teacher'),
                's3Bucket': item.get('s3Bucket'),
                's3Key': item.get('s3Key'),
                'metadata': convert_decimals(item.get('metadata', {})),
                'aiLikelihoodScore': convert_decimals(item.get('aiLikelihoodScore')),
                'originalityScore': convert_decimals(item.get('originalityScore')),
                'confidence': convert_decimals(item.get('confidence')),
                'summary': item.get('summary'),
                'signals': convert_decimals(item.get('signals', [])),
                'recommendations': convert_decimals(item.get('recommendations', [])),
                'limitations': convert_decimals(item.get('limitations', [])),
                'modelUsed': item.get('modelUsed'),
                'promptVersion': item.get('promptVersion'),
                'errorMessage': item.get('errorMessage')
            }
            
            print(f"Returning formatted item: {formatted_item}")
            
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({'item': formatted_item})
            }
        
        except ClientError as db_error:
            print(f"DynamoDB ClientError: {db_error}")
            error_code = db_error.response.get('Error', {}).get('Code', 'Unknown')
            error_message = db_error.response.get('Error', {}).get('Message', str(db_error))
            print(f"DynamoDB error code: {error_code}, message: {error_message}")
            return create_error_response(500, 'DATABASE_ERROR', f'Database access failed: {error_code}')
        
        except Exception as db_error:
            print(f"Database error: {db_error}")
            print(f"Database error type: {type(db_error)}")
            import traceback
            print(f"Database error traceback: {traceback.format_exc()}")
            return create_error_response(500, 'DATABASE_ERROR', f'Database access failed: {str(db_error)}')
        
    except Exception as e:
        print(f"Error getting analysis detail: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Error traceback: {traceback.format_exc()}")
        return create_error_response(500, 'QUERY_ERROR', f'Failed to retrieve analysis details: {str(e)}')

def handle_delete_analysis(event):
    """Handle DELETE /analysis/{analysisId} - Delete specific analysis"""
    try:
        # Extract analysis ID from path parameters (REST API) or path
        path_parameters = event.get('pathParameters') or {}
        analysis_id = path_parameters.get('analysisId')
        
        if not analysis_id:
            # Fallback to extracting from path
            path = event.get('path', event.get('rawPath', ''))
            analysis_id = path.split('/')[-1]
        
        print(f"Deleting analysis_id: {analysis_id}")
        
        if not analysis_id or analysis_id == 'analysis':
            return create_error_response(400, 'MISSING_ID', 'Analysis ID is required')
        
        # Get table reference
        table_name = os.environ.get('ANALYSIS_TABLE')
        if not table_name:
            print("ERROR: ANALYSIS_TABLE environment variable not set")
            return create_error_response(500, 'CONFIG_ERROR', 'Database configuration error')
        
        table = dynamodb.Table(table_name)
        
        try:
            # First, get the analysis to find S3 information
            print(f"Getting analysis for deletion: {analysis_id}")
            response = table.get_item(Key={'analysisId': analysis_id})
            
            if 'Item' not in response:
                print(f"Analysis not found for deletion: {analysis_id}")
                return create_error_response(404, 'NOT_FOUND', 'Analysis not found')
            
            item = response['Item']
            s3_bucket = item.get('s3Bucket')
            s3_key = item.get('s3Key')
            
            # Delete from DynamoDB first
            print(f"Deleting from DynamoDB: {analysis_id}")
            table.delete_item(Key={'analysisId': analysis_id})
            
            # Delete from S3 if exists
            if s3_bucket and s3_key:
                try:
                    print(f"Deleting from S3: {s3_bucket}/{s3_key}")
                    s3_client.delete_object(Bucket=s3_bucket, Key=s3_key)
                    print(f"Successfully deleted S3 object: {s3_bucket}/{s3_key}")
                except ClientError as s3_error:
                    print(f"Warning: Failed to delete S3 object {s3_bucket}/{s3_key}: {s3_error}")
                    # Continue even if S3 deletion fails - DynamoDB record is already deleted
            
            print(f"Successfully deleted analysis: {analysis_id}")
            
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({
                    'message': 'Analysis deleted successfully',
                    'analysisId': analysis_id
                })
            }
        
        except ClientError as db_error:
            print(f"DynamoDB ClientError during deletion: {db_error}")
            error_code = db_error.response.get('Error', {}).get('Code', 'Unknown')
            error_message = db_error.response.get('Error', {}).get('Message', str(db_error))
            print(f"DynamoDB error code: {error_code}, message: {error_message}")
            return create_error_response(500, 'DATABASE_ERROR', f'Failed to delete analysis: {error_code}')
        
        except Exception as db_error:
            print(f"Database error during deletion: {db_error}")
            print(f"Database error type: {type(db_error)}")
            import traceback
            print(f"Database error traceback: {traceback.format_exc()}")
            return create_error_response(500, 'DATABASE_ERROR', f'Failed to delete analysis: {str(db_error)}')
        
    except Exception as e:
        print(f"Error deleting analysis: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Error traceback: {traceback.format_exc()}")
        return create_error_response(500, 'DELETE_ERROR', f'Failed to delete analysis: {str(e)}')

def handle_download_presign(event):
    """Handle GET /downloads/presign?analysisId= - Generate pre-signed download URL"""
    try:
        # Parse query parameters
        query_params = event.get('queryStringParameters') or {}
        analysis_id = query_params.get('analysisId')
        
        if not analysis_id:
            return create_error_response(400, 'MISSING_ID', 'analysisId parameter is required')
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Get analysis record to find S3 key
        response = table.get_item(Key={'analysisId': analysis_id})
        
        if 'Item' not in response:
            return create_error_response(404, 'NOT_FOUND', 'Analysis not found')
        
        item = response['Item']
        s3_bucket = item.get('s3Bucket')
        s3_key = item.get('s3Key')
        
        if not s3_bucket or not s3_key:
            return create_error_response(400, 'MISSING_S3_INFO', 'S3 information not found for this analysis')
        
        # Generate pre-signed URL for download
        try:
            presigned_url = s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': s3_bucket,
                    'Key': s3_key
                },
                ExpiresIn=3600  # 1 hour
            )
        except ClientError as e:
            print(f"Error generating download presigned URL: {e}")
            return create_error_response(500, 'PRESIGN_ERROR', 'Failed to generate download URL')
        
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'downloadUrl': presigned_url,
                'expiresIn': 3600
            })
        }
        
    except Exception as e:
        print(f"Error generating download URL: {e}")
        return create_error_response(500, 'DOWNLOAD_ERROR', 'Failed to generate download URL')

def get_dashboard_kpis():
    """Calculate KPIs for dashboard (last 30 days)"""
    try:
        # Calculate date range (last 30 days)
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=30)
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Query for analyses in the last 30 days
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression=Key('GSI1PK').eq('RESULTS') & Key('GSI1SK').between(
                f"{start_date.isoformat()}#",
                f"{end_date.isoformat()}#ZZZZ"
            )
        )
        
        items = response.get('Items', [])
        completed_items = [item for item in items if item.get('status') == 'COMPLETED']
        
        # Calculate KPIs
        total_analyses = len(items)
        
        # Calculate average AI score
        ai_scores = [item.get('aiLikelihoodScore', 0) for item in completed_items if item.get('aiLikelihoodScore') is not None]
        avg_ai_score = sum(ai_scores) / len(ai_scores) if ai_scores else 0
        
        # Get recent analyses (last 5)
        recent_analyses = sorted(items, key=lambda x: x.get('createdAt', ''), reverse=True)[:5]
        
        return {
            'totalAnalyses': total_analyses,
            'avgAiScore': round(avg_ai_score, 1),
            'recentAnalyses': [
                {
                    'analysisId': item.get('analysisId'),
                    'studentName': item.get('metadata', {}).get('studentName'),
                    'course': item.get('metadata', {}).get('course'),
                    'createdAt': item.get('createdAt'),
                    'status': item.get('status'),
                    'aiLikelihoodScore': item.get('aiLikelihoodScore')
                }
                for item in recent_analyses
            ]
        }
        
    except Exception as e:
        print(f"Error calculating KPIs: {e}")
        return {
            'totalAnalyses': 0,
            'avgAiScore': 0,
            'recentAnalyses': []
        }

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
        })
    }

def get_cors_headers():
    """Get CORS headers for responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }