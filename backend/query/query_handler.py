import json
import boto3
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
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
        
        # Extract user context from authorizer
        user_context = get_user_context(event)
        if user_context:
            print(f"Request from user: {user_context.get('email', user_context.get('userId'))}")
        
        # Determine the operation based on path and method
        # For REST API, use different path extraction
        path = event.get('path', event.get('rawPath', ''))
        method = event.get('httpMethod', event.get('requestContext', {}).get('http', {}).get('method', 'GET'))
        path_parameters = event.get('pathParameters') or {}
        
        print(f"Path: {path}, Method: {method}, PathParams: {path_parameters}")
        
        if path == '/analysis' and method == 'GET':
            return handle_list_analyses(event)
        elif path == '/analysis/student' and method == 'GET':
            return handle_get_student_history(event)
        elif '/analysis/' in path and path.endswith('/notes') and method in ('PUT', 'PATCH'):
            return handle_update_notes(event)
        elif '/analysis/' in path and path.endswith('/reanalyze') and method == 'POST':
            return handle_reanalyze(event)
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
            
            print(f"Raw items from GSI1 RESULTS query: {len(items)}")
            if items:
                print(f"Sample item: {items[0]}")
            
            # Enhanced filtering to only include AI detection analysis records
            # More permissive approach - include records that are likely AI detection analyses
            filtered_items = []
            for item in items:
                analysis_id = item.get('analysisId', '')
                item_type = item.get('type', '')
                
                # Primary exclusion: Skip obvious exam/topic records first
                has_exam_prefix = analysis_id.startswith('exam-')
                has_topic_prefix = analysis_id.startswith('topic-extraction-')
                is_exam_type = item_type in ['TOPIC_EXTRACTION', 'EXAM_GENERATION']
                
                # Skip if it has obvious exam/topic identifiers
                if has_exam_prefix or has_topic_prefix or is_exam_type:
                    print(f"❌ EXCLUDED - Exam/Topic record: analysisId={analysis_id}, type={item_type}")
                    continue
                
                # Secondary exclusion: Skip records with exam-specific fields
                has_exam_config = 'examConfig' in item
                has_topic_outline = 'topicOutline' in item
                has_selected_topics = 'selectedTopics' in item
                has_generated_files = 'generatedFiles' in item
                
                # Skip if it has exam-specific fields
                if has_exam_config or has_topic_outline or has_selected_topics or has_generated_files:
                    print(f"❌ EXCLUDED - Has exam fields: analysisId={analysis_id}")
                    continue
                
                # More permissive inclusion: Include if it looks like an AI detection record
                # Check for AI detection indicators (but don't require all)
                has_ai_score = 'aiLikelihoodScore' in item
                has_originality_score = 'originalityScore' in item
                has_student_metadata = bool(item.get('metadata', {}).get('studentName') or item.get('studentName'))
                has_analysis_fields = any([
                    'summary' in item,
                    'signals' in item,
                    'recommendations' in item,
                    'confidence' in item
                ])
                
                # Include if it has AI detection characteristics
                if has_ai_score or has_originality_score or (has_student_metadata and has_analysis_fields):
                    print(f"✅ INCLUDED AI DETECTION: analysisId={analysis_id}, "
                          f"aiScore={item.get('aiLikelihoodScore')}, "
                          f"originalityScore={item.get('originalityScore')}, "
                          f"status={item.get('status')}, "
                          f"studentName={item.get('metadata', {}).get('studentName') or item.get('studentName')}")
                    filtered_items.append(item)
                else:
                    print(f"❌ EXCLUDED - No AI detection indicators: analysisId={analysis_id}")
                    continue
            
            items = filtered_items
            print(f"Filtered items count: {len(items)}")
            
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
                'errorMessage': item.get('errorMessage'),
                'teacherNotes': item.get('teacherNotes', ''),
                'notesUpdatedAt': item.get('notesUpdatedAt')
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


def handle_update_notes(event):
    """
    PATCH /analysis/{analysisId}/notes
    Body: { notes: "texto libre del docente" }
    """
    try:
        path_parameters = event.get('pathParameters') or {}
        analysis_id = path_parameters.get('analysisId')
        if not analysis_id:
            path = event.get('path', '')
            parts = path.split('/')
            analysis_id = parts[-2] if len(parts) >= 2 else None

        if not analysis_id:
            return create_error_response(400, 'MISSING_ID', 'Analysis ID is required')

        body = json.loads(event.get('body', '{}'))
        notes = body.get('notes', '').strip()

        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])

        # Verify analysis exists
        resp = table.get_item(Key={'analysisId': analysis_id})
        if 'Item' not in resp:
            return create_error_response(404, 'NOT_FOUND', 'Analysis not found')

        table.update_item(
            Key={'analysisId': analysis_id},
            UpdateExpression='SET teacherNotes = :notes, notesUpdatedAt = :ts',
            ExpressionAttributeValues={
                ':notes': notes,
                ':ts': datetime.utcnow().isoformat() + 'Z'
            }
        )

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': 'Notas guardadas exitosamente', 'analysisId': analysis_id})
        }

    except Exception as e:
        print(f"Error updating notes: {e}")
        return create_error_response(500, 'UPDATE_ERROR', 'Failed to update notes')


def handle_reanalyze(event):
    """
    POST /analysis/{analysisId}/reanalyze
    Re-triggers Bedrock analysis for an existing record using the same S3 key.
    """
    try:
        path_parameters = event.get('pathParameters') or {}
        analysis_id = path_parameters.get('analysisId')
        if not analysis_id:
            path = event.get('path', '')
            parts = path.split('/')
            analysis_id = parts[-2] if len(parts) >= 2 else None

        if not analysis_id:
            return create_error_response(400, 'MISSING_ID', 'Analysis ID is required')

        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])

        resp = table.get_item(Key={'analysisId': analysis_id})
        if 'Item' not in resp:
            return create_error_response(404, 'NOT_FOUND', 'Analysis not found')

        item = resp['Item']
        s3_key = item.get('s3Key')
        s3_bucket = item.get('s3Bucket')
        metadata = item.get('metadata', {})

        if not s3_key or not s3_bucket:
            return create_error_response(400, 'MISSING_S3_INFO', 'Original file not found for this analysis')

        # Mark as re-processing
        table.update_item(
            Key={'analysisId': analysis_id},
            UpdateExpression='SET #status = :status, reanalyzedAt = :ts',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'STARTED',
                ':ts': datetime.utcnow().isoformat() + 'Z'
            }
        )

        # Invoke analysis lambda asynchronously via direct call
        # We reuse the same analysis lambda by calling it synchronously here
        import boto3 as _boto3
        lambda_client = _boto3.client('lambda')
        analysis_fn = os.environ.get('ANALYSIS_FUNCTION_NAME', '')

        if analysis_fn:
            payload = {
                'body': json.dumps({'s3Key': s3_key, 'metadata': metadata}),
                'requestContext': event.get('requestContext', {})
            }
            lambda_client.invoke(
                FunctionName=analysis_fn,
                InvocationType='Event',  # async
                Payload=json.dumps(payload)
            )
            message = 'Re-análisis iniciado. Los resultados estarán disponibles en unos momentos.'
        else:
            # Fallback: do it inline (slower but works without env var)
            import io
            s3_client_local = boto3.client('s3')
            bedrock_client_local = boto3.client('bedrock-runtime')

            pdf_content = s3_client_local.get_object(Bucket=s3_bucket, Key=s3_key)['Body'].read()

            try:
                import PyPDF2
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
                extracted_text = ''.join(p.extract_text() + '\n' for p in pdf_reader.pages).strip()
            except Exception:
                extracted_text = ''

            if len(extracted_text) < 100:
                table.update_item(
                    Key={'analysisId': analysis_id},
                    UpdateExpression='SET #status = :status, errorMessage = :err',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={':status': 'FAILED', ':err': 'Texto insuficiente para re-análisis'}
                )
                return create_error_response(422, 'INSUFFICIENT_TEXT', 'Not enough text to reanalyze')

            prompt = f"""Eres un sistema experto en detección de contenido generado por IA en textos académicos en español.
Analiza el siguiente texto y responde ÚNICAMENTE con JSON válido:
{{
  "aiLikelihoodScore": <0-100>,
  "originalityScore": <0-100>,
  "confidence": <0-100>,
  "summary": "<resumen en español>",
  "signals": [{{"type": "<tipo>", "description": "<desc>", "evidenceSnippet": "<fragmento>"}}],
  "recommendations": ["<recomendación>"],
  "limitations": ["<limitación>"]
}}
Texto: {extracted_text[:4000]}"""

            response = bedrock_client_local.invoke_model(
                modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
                body=json.dumps({
                    'anthropic_version': 'bedrock-2023-05-31',
                    'max_tokens': 1000,
                    'temperature': 0.3,
                    'messages': [{'role': 'user', 'content': prompt}]
                })
            )
            content = json.loads(response['body'].read())['content'][0]['text']
            js = json.loads(content[content.find('{'):content.rfind('}') + 1])

            table.update_item(
                Key={'analysisId': analysis_id},
                UpdateExpression='SET #status=:s, aiLikelihoodScore=:ail, originalityScore=:os, confidence=:c, summary=:sum, signals=:sig, recommendations=:rec, limitations=:lim, modelUsed=:m, promptVersion=:pv',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':s': 'COMPLETED',
                    ':ail': int(js.get('aiLikelihoodScore', 0)),
                    ':os': int(js.get('originalityScore', 0)),
                    ':c': int(js.get('confidence', 0)),
                    ':sum': js.get('summary', ''),
                    ':sig': js.get('signals', []),
                    ':rec': js.get('recommendations', []),
                    ':lim': js.get('limitations', []),
                    ':m': 'anthropic.claude-3-5-sonnet-20240620-v1:0',
                    ':pv': 'v2.0-reanalysis'
                }
            )
            message = 'Re-análisis completado exitosamente.'

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({'message': message, 'analysisId': analysis_id})
        }

    except Exception as e:
        print(f"Error in reanalyze: {e}")
        return create_error_response(500, 'REANALYZE_ERROR', f'Failed to reanalyze: {str(e)}')


def handle_get_student_history(event):
    """
    GET /analysis/student?studentName=xxx
    Returns all analyses for a given student, sorted by date, with trend data.
    """
    try:
        query_params = event.get('queryStringParameters') or {}
        student_name = query_params.get('studentName', '').strip()

        if not student_name:
            return create_error_response(400, 'MISSING_PARAM', 'studentName query parameter is required')

        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])

        # Scan GSI1 for all RESULTS and filter by studentName
        # (small dataset — acceptable for demo scale)
        all_items = []
        last_key = None
        while True:
            params = {
                'IndexName': 'GSI1',
                'KeyConditionExpression': Key('GSI1PK').eq('RESULTS'),
                'ScanIndexForward': False,
                'Limit': 100
            }
            if last_key:
                params['ExclusiveStartKey'] = last_key
            resp = table.query(**params)
            all_items.extend(resp.get('Items', []))
            last_key = resp.get('LastEvaluatedKey')
            if not last_key:
                break

        # Filter by student name (case-insensitive)
        student_lower = student_name.lower()
        student_items = [
            i for i in all_items
            if (i.get('metadata', {}).get('studentName', '') or '').lower() == student_lower
            and i.get('status') == 'COMPLETED'
            and 'aiLikelihoodScore' in i
        ]

        # Sort by date ascending for trend
        student_items.sort(key=lambda x: x.get('createdAt', ''))

        formatted = []
        for item in student_items:
            formatted.append({
                'analysisId': item.get('analysisId'),
                'createdAt': item.get('createdAt'),
                'course': item.get('metadata', {}).get('course', ''),
                'assignmentName': item.get('metadata', {}).get('assignmentName', ''),
                'aiLikelihoodScore': convert_decimals(item.get('aiLikelihoodScore', 0)),
                'originalityScore': convert_decimals(item.get('originalityScore', 0)),
                'confidence': convert_decimals(item.get('confidence', 0)),
                'teacherNotes': item.get('teacherNotes', ''),
                'status': item.get('status')
            })

        # Compute trend summary
        scores = [f['aiLikelihoodScore'] for f in formatted]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0
        trend = 'stable'
        if len(scores) >= 2:
            if scores[-1] > scores[0] + 10:
                trend = 'increasing'
            elif scores[-1] < scores[0] - 10:
                trend = 'decreasing'

        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'studentName': student_name,
                'analyses': formatted,
                'summary': {
                    'totalAnalyses': len(formatted),
                    'avgAiScore': avg_score,
                    'trend': trend,
                    'maxScore': max(scores) if scores else 0,
                    'minScore': min(scores) if scores else 0
                }
            })
        }

    except Exception as e:
        print(f"Error getting student history: {e}")
        return create_error_response(500, 'QUERY_ERROR', f'Failed to get student history: {str(e)}')
