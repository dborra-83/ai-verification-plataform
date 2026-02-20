import json
import boto3
import uuid
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock_client = boto3.client('bedrock-runtime')


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
    Generate exam versions based on selected topics and configuration using Claude 3.5 Sonnet
    Implements asynchronous processing pattern to avoid API Gateway timeouts
    """
    try:
        print(f"Exam Generation Lambda - Received event: {json.dumps(event)}")
        
        # Extract user context from authorizer
        user_context = get_user_context(event)
        if user_context:
            print(f"Request from user: {user_context.get('email', user_context.get('userId'))}")
        
        # Handle different HTTP methods
        http_method = event.get('httpMethod', 'POST')
        
        # Handle OPTIONS requests for CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': ''
            }
        elif http_method == 'POST':
            return handle_exam_generation_async(event, context)
        elif http_method == 'GET':
            return handle_get_generation_results(event, context)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', f'Method {http_method} not allowed')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_exam_generation_async(event, context):
    """Handle POST request to generate exam asynchronously"""
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
        selected_topics = body.get('selectedTopics', [])
        exam_config = body.get('examConfig', {})
        teacher_id = body.get('teacherId', 'admin')
        
        if not selected_topics:
            return create_error_response(400, 'MISSING_TOPICS', 'selectedTopics array is required')
        
        if not exam_config:
            return create_error_response(400, 'MISSING_CONFIG', 'examConfig is required')
        
        # Validate exam configuration
        validation_error = validate_exam_config(exam_config)
        if validation_error:
            return create_error_response(400, 'INVALID_CONFIG', validation_error)
        
        # Generate exam ID
        exam_id = str(uuid.uuid4())
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Create initial record in DynamoDB with progress tracking
        created_at = datetime.now(timezone.utc).isoformat()
        estimated_completion = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        
        initial_record = {
            'analysisId': f"exam-{exam_id}",
            'type': 'EXAM_GENERATION',
            'teacherId': teacher_id,
            'createdAt': created_at,
            'status': 'PROCESSING',
            'selectedTopics': selected_topics,
            'examConfig': exam_config,
            'sourceDocuments': body.get('sourceDocuments', []),
            'progress': {
                'currentStep': 'initializing',
                'completedVersions': 0,
                'totalVersions': exam_config.get('versions', 1),
                'percentage': 0,
                'estimatedCompletion': estimated_completion,
                'startedAt': created_at
            },
            'GSI1PK': 'EXAM_GENERATIONS',
            'GSI1SK': f"{created_at}#exam-{exam_id}"
        }
        
        table.put_item(Item=initial_record)
        
        # Start background processing in a separate thread
        # This allows the Lambda to return immediately while processing continues
        processing_thread = threading.Thread(
            target=process_exam_generation_background,
            args=(exam_id, selected_topics, exam_config, teacher_id, body.get('sourceDocuments', []))
        )
        processing_thread.daemon = True
        processing_thread.start()
        
        # Return immediate response with exam ID and processing status
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'examId': exam_id,
                'status': 'PROCESSING',
                'message': 'Exam generation started. Use the examId to poll for status updates.',
                'estimatedCompletion': estimated_completion,
                'progress': {
                    'currentStep': 'initializing',
                    'percentage': 0,
                    'completedVersions': 0,
                    'totalVersions': exam_config.get('versions', 1)
                }
            })
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'INVALID_JSON', 'Request body must be valid JSON')
    except Exception as e:
        print(f"Error in async exam generation: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', f'Failed to start exam generation: {str(e)}')

def process_exam_generation_background(exam_id, selected_topics, exam_config, teacher_id, source_documents):
    """Process exam generation in background thread"""
    try:
        print(f"Starting background processing for exam {exam_id}")
        
        # Get table and bucket references
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        total_versions = exam_config.get('versions', 1)
        include_self_assessment = exam_config.get('includeSelfAssessment', False)
        total_steps = total_versions + (1 if include_self_assessment else 0)
        
        # Update progress: Starting generation
        update_progress(table, exam_id, 'generating_questions', 0, total_versions, 5, 
                       'Starting question generation...', 
                       {'totalSteps': total_steps, 'estimatedDuration': total_versions * 45})
        
        generated_files = []
        
        # Generate exam versions
        for version in range(1, total_versions + 1):
            try:
                print(f"Generating version {version} of {total_versions}")
                
                # Update progress for this version
                step_progress = int((version - 1) / total_steps * 80) + 10
                update_progress(table, exam_id, f'generating_version_{version}', version - 1, total_versions, 
                              step_progress, f'Generating version {version} questions...',
                              {'currentVersion': version, 'questionCount': exam_config.get('questionCount', 10)})
                
                # Generate questions for this version
                questions = generate_questions_with_bedrock(selected_topics, exam_config, version)
                
                # Update progress: Formatting content
                format_progress = int((version - 0.5) / total_steps * 80) + 10
                update_progress(table, exam_id, f'formatting_version_{version}', version - 1, total_versions,
                              format_progress, f'Formatting version {version} content...',
                              {'currentVersion': version, 'filesGenerated': 0})
                
                # Generate student version (without answers)
                student_content = format_exam_content(questions, 'student', version, exam_config)
                student_s3_key = f"exams/exam-{exam_id}/v{version}-student.txt"
                upload_content_to_s3(bucket_name, student_s3_key, student_content)
                
                generated_files.append({
                    'type': 'student_version',
                    'version': version,
                    's3Key': student_s3_key,
                    'format': 'TXT'
                })
                
                # Generate teacher version (with answers)
                teacher_content = format_exam_content(questions, 'teacher', version, exam_config)
                teacher_s3_key = f"exams/exam-{exam_id}/v{version}-teacher.txt"
                upload_content_to_s3(bucket_name, teacher_s3_key, teacher_content)
                
                generated_files.append({
                    'type': 'teacher_version',
                    'version': version,
                    's3Key': teacher_s3_key,
                    'format': 'TXT'
                })
                
                # Update progress: Version completed
                version_progress = int(version / total_steps * 80) + 10
                update_progress(table, exam_id, f'completed_version_{version}', version, total_versions,
                              version_progress, f'Version {version} completed',
                              {'currentVersion': version, 'filesGenerated': 2, 'versionComplete': True})
                
            except Exception as version_error:
                print(f"Error generating version {version}: {version_error}")
                # Continue with other versions, but log the error
                update_progress(table, exam_id, f'error_version_{version}', version - 1, total_versions,
                              int((version - 1) / total_steps * 80) + 10, 
                              f'Error in version {version}: {str(version_error)}')
        
        # Generate self-assessment if requested
        if include_self_assessment:
            try:
                print("Generating self-assessment")
                update_progress(table, exam_id, 'generating_self_assessment', total_versions, total_versions,
                              90, 'Generating self-assessment...',
                              {'assessmentQuestions': 5, 'includesFeedback': True})
                
                self_assessment = generate_self_assessment_with_bedrock(selected_topics, exam_config)
                self_assessment_content = format_self_assessment_content(self_assessment)
                self_assessment_s3_key = f"exams/exam-{exam_id}/self-assessment.txt"
                upload_content_to_s3(bucket_name, self_assessment_s3_key, self_assessment_content)
                
                generated_files.append({
                    'type': 'self_assessment',
                    'version': 1,
                    's3Key': self_assessment_s3_key,
                    'format': 'TXT'
                })
                
            except Exception as self_assessment_error:
                print(f"Error generating self-assessment: {self_assessment_error}")
                # Self-assessment is optional, so continue without it
        
        # Final update: Completed
        completion_time = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={'analysisId': f"exam-{exam_id}"},
            UpdateExpression='SET #status = :status, generatedFiles = :files, completedAt = :completed, progress = :progress',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'COMPLETED',
                ':files': generated_files,
                ':completed': completion_time,
                ':progress': {
                    'currentStep': 'completed',
                    'completedVersions': total_versions,
                    'totalVersions': total_versions,
                    'percentage': 100,
                    'completedAt': completion_time,
                    'message': f'Successfully generated {len(generated_files)} files'
                }
            }
        )
        
        print(f"Background processing completed for exam {exam_id}")
        
    except Exception as processing_error:
        print(f"Background processing error for exam {exam_id}: {processing_error}")
        
        # Update record as FAILED
        error_time = datetime.now(timezone.utc).isoformat()
        table.update_item(
            Key={'analysisId': f"exam-{exam_id}"},
            UpdateExpression='SET #status = :status, errorMessage = :error, failedAt = :failed, progress = :progress',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'FAILED',
                ':error': str(processing_error),
                ':failed': error_time,
                ':progress': {
                    'currentStep': 'failed',
                    'completedVersions': 0,
                    'totalVersions': exam_config.get('versions', 1),
                    'percentage': 0,
                    'failedAt': error_time,
                    'message': f'Generation failed: {str(processing_error)}'
                }
            }
        )

def update_progress(table, exam_id, current_step, completed_versions, total_versions, percentage, message, step_details=None):
    """
    Enhanced progress tracking with improved time estimation and detailed step information
    """
    try:
        current_time = datetime.now(timezone.utc)
        
        # Get existing progress to calculate velocity
        try:
            existing_item = table.get_item(Key={'analysisId': f"exam-{exam_id}"})
            existing_progress = existing_item.get('Item', {}).get('progress', {})
            start_time_str = existing_item.get('Item', {}).get('createdAt')
            
            if start_time_str:
                start_time = datetime.fromisoformat(start_time_str.replace('Z', '+00:00'))
                elapsed_time = (current_time - start_time).total_seconds()
            else:
                elapsed_time = 0
                
            previous_percentage = existing_progress.get('percentage', 0)
            
        except Exception as e:
            print(f"Could not retrieve existing progress: {e}")
            elapsed_time = 0
            previous_percentage = 0
        
        # Enhanced time estimation based on actual progress velocity
        estimated_completion = calculate_estimated_completion(
            percentage, previous_percentage, elapsed_time, total_versions, current_step
        )
        
        # Create detailed step information
        step_info = create_step_details(current_step, completed_versions, total_versions, step_details)
        
        # Enhanced progress information
        progress_info = {
            'currentStep': current_step,
            'completedVersions': completed_versions,
            'totalVersions': total_versions,
            'percentage': min(max(percentage, 0), 100),  # Ensure 0-100 range
            'estimatedCompletion': estimated_completion,
            'message': message,
            'lastUpdated': current_time.isoformat(),
            'stepDetails': step_info,
            'elapsedTime': elapsed_time,
            'velocity': calculate_progress_velocity(percentage, previous_percentage, elapsed_time)
        }
        
        # Add version-specific progress if applicable
        if total_versions > 1:
            progress_info['versionProgress'] = {
                'current': completed_versions + 1 if completed_versions < total_versions else total_versions,
                'total': total_versions,
                'percentagePerVersion': 100 / total_versions,
                'currentVersionProgress': calculate_current_version_progress(
                    percentage, completed_versions, total_versions
                )
            }
        
        table.update_item(
            Key={'analysisId': f"exam-{exam_id}"},
            UpdateExpression='SET progress = :progress, lastProgressUpdate = :timestamp',
            ExpressionAttributeValues={
                ':progress': progress_info,
                ':timestamp': current_time.isoformat()
            }
        )
        
        print(f"Enhanced progress updated for exam {exam_id}: {percentage}% - {current_step} - {message}")
        
    except Exception as e:
        print(f"Error updating enhanced progress for exam {exam_id}: {e}")
        # Fallback to basic progress update
        try:
            basic_progress = {
                'currentStep': current_step,
                'completedVersions': completed_versions,
                'totalVersions': total_versions,
                'percentage': min(max(percentage, 0), 100),
                'message': message,
                'lastUpdated': datetime.now(timezone.utc).isoformat()
            }
            
            table.update_item(
                Key={'analysisId': f"exam-{exam_id}"},
                UpdateExpression='SET progress = :progress',
                ExpressionAttributeValues={':progress': basic_progress}
            )
            
        except Exception as fallback_error:
            print(f"Fallback progress update also failed for exam {exam_id}: {fallback_error}")

def calculate_estimated_completion(current_percentage, previous_percentage, elapsed_time, total_versions, current_step):
    """Calculate more accurate estimated completion time based on progress velocity"""
    try:
        current_time = datetime.now(timezone.utc)
        
        # Base time estimates per step type (in seconds)
        step_time_estimates = {
            'initializing': 5,
            'generating_questions': 45 * total_versions,  # 45 seconds per version
            'generating_version': 45,
            'formatting_version': 10,
            'generating_self_assessment': 30,
            'completed': 0,
            'failed': 0
        }
        
        # If we have progress velocity, use it for estimation
        if elapsed_time > 0 and current_percentage > previous_percentage:
            progress_rate = (current_percentage - previous_percentage) / elapsed_time  # percentage per second
            
            if progress_rate > 0:
                remaining_percentage = 100 - current_percentage
                estimated_seconds = remaining_percentage / progress_rate
                
                # Apply some smoothing and bounds
                estimated_seconds = max(10, min(estimated_seconds, 600))  # Between 10 seconds and 10 minutes
                
                return (current_time + timedelta(seconds=estimated_seconds)).isoformat()
        
        # Fallback to step-based estimation
        if current_step in step_time_estimates:
            base_estimate = step_time_estimates[current_step]
        else:
            # Default estimation based on remaining percentage
            base_estimate = ((100 - current_percentage) / 100) * (total_versions * 60)  # 1 minute per version
        
        # Add some buffer time
        estimated_seconds = base_estimate * 1.2  # 20% buffer
        estimated_seconds = max(30, min(estimated_seconds, 600))  # Between 30 seconds and 10 minutes
        
        return (current_time + timedelta(seconds=estimated_seconds)).isoformat()
        
    except Exception as e:
        print(f"Error calculating estimated completion: {e}")
        # Fallback to simple 5-minute estimate
        return (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()

def create_step_details(current_step, completed_versions, total_versions, step_details):
    """Create detailed information about the current step"""
    try:
        details = {
            'stepName': get_step_display_name(current_step),
            'stepType': get_step_type(current_step),
            'isVersionSpecific': 'version' in current_step.lower(),
            'completedVersions': completed_versions,
            'totalVersions': total_versions
        }
        
        # Add custom step details if provided
        if step_details:
            details.update(step_details)
        
        # Add step-specific information
        if current_step.startswith('generating_version_'):
            version_num = current_step.split('_')[-1]
            details['currentVersion'] = version_num
            details['versionStatus'] = 'generating'
        elif current_step.startswith('formatting_version_'):
            version_num = current_step.split('_')[-1]
            details['currentVersion'] = version_num
            details['versionStatus'] = 'formatting'
        elif current_step.startswith('completed_version_'):
            version_num = current_step.split('_')[-1]
            details['currentVersion'] = version_num
            details['versionStatus'] = 'completed'
        
        return details
        
    except Exception as e:
        print(f"Error creating step details: {e}")
        return {'stepName': current_step, 'error': str(e)}

def get_step_display_name(step):
    """Get user-friendly display name for step"""
    step_names = {
        'initializing': 'Inicializando generación',
        'generating_questions': 'Generando preguntas',
        'generating_self_assessment': 'Generando autoevaluación',
        'completed': 'Completado',
        'failed': 'Error'
    }
    
    if step.startswith('generating_version_'):
        return f'Generando versión {step.split("_")[-1]}'
    elif step.startswith('formatting_version_'):
        return f'Formateando versión {step.split("_")[-1]}'
    elif step.startswith('completed_version_'):
        return f'Versión {step.split("_")[-1]} completada'
    
    return step_names.get(step, step.replace('_', ' ').title())

def get_step_type(step):
    """Get the type category of the step"""
    if 'generating' in step:
        return 'generation'
    elif 'formatting' in step:
        return 'formatting'
    elif 'completed' in step:
        return 'completion'
    elif 'failed' in step or 'error' in step:
        return 'error'
    else:
        return 'processing'

def calculate_progress_velocity(current_percentage, previous_percentage, elapsed_time):
    """Calculate progress velocity (percentage per second)"""
    try:
        if elapsed_time > 0 and current_percentage > previous_percentage:
            return (current_percentage - previous_percentage) / elapsed_time
        return 0
    except:
        return 0

def calculate_current_version_progress(overall_percentage, completed_versions, total_versions):
    """Calculate progress within the current version being processed"""
    try:
        if total_versions <= 1:
            return overall_percentage
        
        percentage_per_version = 100 / total_versions
        completed_percentage = completed_versions * percentage_per_version
        
        if overall_percentage <= completed_percentage:
            return 0
        
        current_version_progress = overall_percentage - completed_percentage
        return min(current_version_progress / percentage_per_version * 100, 100)
        
    except:
        return 0

def handle_get_generation_results(event, context):
    """Handle GET request to retrieve generation results with progress information"""
    try:
        print(f"GET request received: {json.dumps(event, default=str)}")
        
        # Enhanced debugging for path parameters
        path_parameters = event.get('pathParameters')
        print(f"Raw pathParameters: {path_parameters}")
        print(f"pathParameters type: {type(path_parameters)}")
        
        # Get exam ID from path parameters with multiple fallback methods
        exam_id = None
        
        if path_parameters and isinstance(path_parameters, dict):
            exam_id = path_parameters.get('examId')
            print(f"Extracted examId from pathParameters: {exam_id}")
        
        # Fallback: try to extract from path directly
        if not exam_id:
            path = event.get('path', '')
            print(f"Trying to extract from path: {path}")
            # Path should be like /exam/generate/{examId}
            path_parts = path.split('/')
            if len(path_parts) >= 4 and path_parts[1] == 'exam' and path_parts[2] == 'generate':
                exam_id = path_parts[3]
                print(f"Extracted examId from path: {exam_id}")
        
        # Fallback: try resource path
        if not exam_id:
            resource = event.get('resource', '')
            print(f"Trying to extract from resource: {resource}")
            if '{examId}' in resource:
                # This is a template, try pathParameters again
                if path_parameters:
                    exam_id = path_parameters.get('examId') or path_parameters.get('id')
        
        print(f"Final extracted exam ID: {exam_id}")
        
        if not exam_id:
            print("Missing exam ID in request after all extraction attempts")
            print(f"Available event keys: {list(event.keys())}")
            return create_error_response(400, 'MISSING_EXAM_ID', 'examId is required')
        
        # Get table reference with error handling
        analysis_table_name = os.environ.get('ANALYSIS_TABLE')
        print(f"ANALYSIS_TABLE environment variable: {analysis_table_name}")
        
        if not analysis_table_name:
            print("ERROR: ANALYSIS_TABLE environment variable not set")
            return create_error_response(500, 'CONFIGURATION_ERROR', 'Database table not configured')
        
        try:
            table = dynamodb.Table(analysis_table_name)
            print(f"Successfully created table reference for: {analysis_table_name}")
        except Exception as table_error:
            print(f"ERROR: Failed to create table reference: {table_error}")
            return create_error_response(500, 'DATABASE_ERROR', f'Failed to access database: {str(table_error)}')
        
        print(f"Looking for exam record with key: exam-{exam_id}")
        
        # Retrieve exam record with enhanced error handling
        try:
            response = table.get_item(
                Key={'analysisId': f"exam-{exam_id}"}
            )
            print(f"DynamoDB get_item successful")
            print(f"DynamoDB response keys: {list(response.keys())}")
            print(f"DynamoDB response: {json.dumps(response, default=str)}")
        except Exception as dynamo_error:
            print(f"ERROR: DynamoDB get_item failed: {dynamo_error}")
            print(f"ERROR: DynamoDB error type: {type(dynamo_error)}")
            return create_error_response(500, 'DATABASE_QUERY_ERROR', f'Failed to query database: {str(dynamo_error)}')
        
        if 'Item' not in response:
            print(f"Exam not found in database: exam-{exam_id}")
            print(f"Searched for key: exam-{exam_id}")
            return create_error_response(404, 'EXAM_NOT_FOUND', f'Exam {exam_id} not found')
        
        item = response['Item']
        print(f"Found exam item: {json.dumps(item, default=str)}")
        
        # Prepare response data with safe access to nested objects
        response_data = {
            'examId': exam_id,
            'status': item.get('status', 'UNKNOWN'),
            'examConfig': item.get('examConfig', {}),
            'selectedTopics': item.get('selectedTopics', []),
            'createdAt': item.get('createdAt'),
            'progress': item.get('progress', {})
        }
        
        # Add completion-specific fields
        if item.get('status') == 'COMPLETED':
            response_data['generatedFiles'] = item.get('generatedFiles', [])
            response_data['completedAt'] = item.get('completedAt')
        elif item.get('status') == 'FAILED':
            response_data['errorMessage'] = item.get('errorMessage')
            response_data['failedAt'] = item.get('failedAt')
        
        # Add cache-control headers to prevent caching of status responses
        headers = get_cors_headers()
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        headers['Pragma'] = 'no-cache'
        headers['Expires'] = '0'
        
        print(f"Returning response data: {json.dumps(response_data, default=str)}")
        
        # Return exam results with progress information
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps(response_data, default=str)
        }
        
    except Exception as e:
        print(f"Error retrieving exam results: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return create_error_response(500, 'INTERNAL_ERROR', f'Failed to retrieve exam results: {str(e)}')

def validate_exam_config(config):
    """Validate exam configuration parameters"""
    try:
        question_count = config.get('questionCount', 0)
        if not isinstance(question_count, int) or question_count < 1 or question_count > 20:
            return "questionCount must be an integer between 1 and 20"
        
        question_types = config.get('questionTypes', [])
        valid_types = ['multiple_choice', 'true_false', 'mixed']
        if not question_types or not all(qt in valid_types for qt in question_types):
            return f"questionTypes must contain valid types: {valid_types}"
        
        difficulty = config.get('difficulty', '')
        valid_difficulties = ['easy', 'medium', 'hard']
        if difficulty not in valid_difficulties:
            return f"difficulty must be one of: {valid_difficulties}"
        
        versions = config.get('versions', 1)
        if not isinstance(versions, int) or versions < 1 or versions > 4:
            return "versions must be an integer between 1 and 4"
        
        return None  # No validation errors
        
    except Exception as e:
        return f"Invalid configuration format: {e}"

def generate_questions_with_bedrock(selected_topics, exam_config, version):
    """Generate exam questions using Claude 3.5 Sonnet"""
    try:
        # Prepare the prompt for question generation
        topics_text = ", ".join(selected_topics)
        question_count = exam_config.get('questionCount', 10)
        question_types = exam_config.get('questionTypes', ['multiple_choice'])
        difficulty = exam_config.get('difficulty', 'medium')
        language = exam_config.get('language', 'es')
        
        prompt = f"""Eres un experto en creación de exámenes académicos. Genera {question_count} preguntas de examen sobre los siguientes temas: {topics_text}

CONFIGURACIÓN DEL EXAMEN:
- Número de preguntas: {question_count}
- Tipos de preguntas: {', '.join(question_types)}
- Dificultad: {difficulty}
- Versión: {version} (asegúrate de que las preguntas sean diferentes a otras versiones)
- Idioma: {language}

INSTRUCCIONES:
- Crea preguntas claras y específicas sobre los temas indicados
- Para preguntas de opción múltiple, incluye 4 opciones (A, B, C, D)
- Para preguntas verdadero/falso, formula declaraciones claras
- Asegúrate de que las preguntas sean de dificultad {difficulty}
- Distribuye las preguntas equitativamente entre los temas
- Incluye la respuesta correcta para cada pregunta

Responde ÚNICAMENTE con JSON válido en este formato exacto:

{{
  "questions": [
    {{
      "id": 1,
      "type": "multiple_choice",
      "topic": "Tema específico",
      "question": "Texto de la pregunta",
      "options": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
      "correctAnswer": "A",
      "explanation": "Explicación de por qué esta es la respuesta correcta"
    }},
    {{
      "id": 2,
      "type": "true_false",
      "topic": "Tema específico",
      "question": "Declaración verdadera o falsa",
      "correctAnswer": "true",
      "explanation": "Explicación de la respuesta"
    }}
  ]
}}"""

        # Call Bedrock with Claude 3.5 Sonnet
        response = bedrock_client.invoke_model(
            modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 4000,
                'temperature': 0.3,
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ]
            })
        )
        
        # Parse response
        response_body = json.loads(response['body'].read())
        content = response_body['content'][0]['text']
        
        print(f"Bedrock question generation response: {content}")
        
        # Parse JSON response from Claude
        try:
            # Clean the response to extract JSON
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_content = content[json_start:json_end]
                questions_result = json.loads(json_content)
            else:
                raise ValueError("No valid JSON found in response")
            
            return questions_result.get('questions', [])
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Invalid JSON response from Bedrock: {content}")
            raise Exception(f"Failed to parse Bedrock response: {e}")
            
    except Exception as e:
        print(f"Bedrock question generation error: {e}")
        raise Exception(f"Question generation failed: {e}")

def generate_self_assessment_with_bedrock(selected_topics, exam_config):
    """Generate self-assessment questions with feedback using Claude 3.5 Sonnet"""
    try:
        topics_text = ", ".join(selected_topics)
        difficulty = exam_config.get('difficulty', 'medium')
        language = exam_config.get('language', 'es')
        
        prompt = f"""Eres un experto en creación de autoevaluaciones educativas. Genera exactamente 5 preguntas de autoevaluación sobre los siguientes temas: {topics_text}

CONFIGURACIÓN:
- Número de preguntas: 5 (exactamente)
- Dificultad: {difficulty}
- Idioma: {language}
- Incluir retroalimentación detallada para cada respuesta

INSTRUCCIONES:
- Crea 5 preguntas de opción múltiple con 4 opciones cada una
- Incluye retroalimentación educativa detallada para cada opción
- Las preguntas deben ayudar al estudiante a autoevaluar su comprensión
- Proporciona explicaciones que refuercen el aprendizaje

Responde ÚNICAMENTE con JSON válido en este formato exacto:

{{
  "selfAssessment": [
    {{
      "id": 1,
      "topic": "Tema específico",
      "question": "Texto de la pregunta",
      "options": ["A) Opción 1", "B) Opción 2", "C) Opción 3", "D) Opción 4"],
      "correctAnswer": "A",
      "feedback": {{
        "A": "Correcto! Explicación detallada de por qué esta es correcta...",
        "B": "Incorrecto. Explicación de por qué esta opción no es correcta...",
        "C": "Incorrecto. Explicación de por qué esta opción no es correcta...",
        "D": "Incorrecto. Explicación de por qué esta opción no es correcta..."
      }}
    }}
  ]
}}"""

        # Call Bedrock with Claude 3.5 Sonnet
        response = bedrock_client.invoke_model(
            modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 3000,
                'temperature': 0.2,
                'messages': [
                    {
                        'role': 'user',
                        'content': prompt
                    }
                ]
            })
        )
        
        # Parse response
        response_body = json.loads(response['body'].read())
        content = response_body['content'][0]['text']
        
        print(f"Bedrock self-assessment generation response: {content}")
        
        # Parse JSON response from Claude
        try:
            # Clean the response to extract JSON
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_content = content[json_start:json_end]
                self_assessment_result = json.loads(json_content)
            else:
                raise ValueError("No valid JSON found in response")
            
            return self_assessment_result.get('selfAssessment', [])
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Invalid JSON response from Bedrock: {content}")
            raise Exception(f"Failed to parse Bedrock response: {e}")
            
    except Exception as e:
        print(f"Bedrock self-assessment generation error: {e}")
        raise Exception(f"Self-assessment generation failed: {e}")

def format_exam_content(questions, version_type, version_number, exam_config):
    """Format exam content for student or teacher version"""
    try:
        content = f"EXAMEN - Versión {version_number}\n"
        content += f"Configuración: {exam_config.get('questionCount', 0)} preguntas, "
        content += f"Dificultad: {exam_config.get('difficulty', 'medium')}\n"
        content += f"Fecha: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC\n\n"
        
        if version_type == 'teacher':
            content += "=== VERSIÓN DOCENTE (CON RESPUESTAS) ===\n\n"
        else:
            content += "=== VERSIÓN ESTUDIANTE ===\n\n"
        
        for i, question in enumerate(questions, 1):
            content += f"Pregunta {i}: {question.get('question', '')}\n"
            
            if question.get('type') == 'multiple_choice' and question.get('options'):
                for option in question['options']:
                    content += f"  {option}\n"
            
            if version_type == 'teacher':
                content += f"  RESPUESTA CORRECTA: {question.get('correctAnswer', '')}\n"
                content += f"  EXPLICACIÓN: {question.get('explanation', '')}\n"
            
            content += "\n"
        
        return content
        
    except Exception as e:
        print(f"Error formatting exam content: {e}")
        return f"Error formatting exam content: {e}"

def format_self_assessment_content(self_assessment_questions):
    """Format self-assessment content"""
    try:
        content = "AUTOEVALUACIÓN\n"
        content += f"Fecha: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')} UTC\n\n"
        content += "=== PREGUNTAS DE AUTOEVALUACIÓN CON RETROALIMENTACIÓN ===\n\n"
        
        for i, question in enumerate(self_assessment_questions, 1):
            content += f"Pregunta {i}: {question.get('question', '')}\n"
            
            if question.get('options'):
                for option in question['options']:
                    content += f"  {option}\n"
            
            content += "\nRETROALIMENTACIÓN:\n"
            feedback = question.get('feedback', {})
            for option_key, feedback_text in feedback.items():
                content += f"  {option_key}: {feedback_text}\n"
            
            content += "\n" + "="*50 + "\n\n"
        
        return content
        
    except Exception as e:
        print(f"Error formatting self-assessment content: {e}")
        return f"Error formatting self-assessment content: {e}"

def upload_content_to_s3(bucket_name, s3_key, content):
    """Upload content to S3"""
    try:
        s3_client.put_object(
            Bucket=bucket_name,
            Key=s3_key,
            Body=content.encode('utf-8'),
            ContentType='text/plain; charset=utf-8'
        )
        print(f"Successfully uploaded content to s3://{bucket_name}/{s3_key}")
        
    except ClientError as e:
        raise Exception(f"Failed to upload content to S3: {e}")

def create_error_response(status_code, error_code, message):
    """Create standardized error response with comprehensive CORS headers"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps({
            'error': {
                'code': error_code,
                'message': message,
                'timestamp': datetime.now(timezone.utc).isoformat()
            }
        })
    }

def get_cors_headers():
    """Get comprehensive CORS headers for responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Amz-Date, X-Api-Key, X-Amz-Security-Token, X-Requested-With',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Max-Age': '86400'
    }