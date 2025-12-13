import json
import boto3
import uuid
import os
from datetime import datetime
from botocore.exceptions import ClientError

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock_client = boto3.client('bedrock-runtime')

def lambda_handler(event, context):
    """
    Generate exam versions based on selected topics and configuration using Claude 3.5 Sonnet
    """
    try:
        print(f"Exam Generation Lambda - Received event: {json.dumps(event)}")
        
        # Handle different HTTP methods
        http_method = event.get('httpMethod', 'POST')
        
        if http_method == 'POST':
            return handle_exam_generation(event, context)
        elif http_method == 'GET':
            return handle_get_generation_results(event, context)
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', f'Method {http_method} not allowed')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_exam_generation(event, context):
    """Handle POST request to generate exam"""
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
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        # Create initial record in DynamoDB
        created_at = datetime.utcnow().isoformat()
        initial_record = {
            'analysisId': f"exam-{exam_id}",
            'type': 'EXAM_GENERATION',
            'teacherId': teacher_id,
            'createdAt': created_at,
            'status': 'PROCESSING',
            'selectedTopics': selected_topics,
            'examConfig': exam_config,
            'sourceDocuments': body.get('sourceDocuments', []),
            'GSI1PK': 'EXAM_GENERATIONS',
            'GSI1SK': f"{created_at}#exam-{exam_id}"
        }
        
        table.put_item(Item=initial_record)
        
        try:
            # Generate exam versions
            generated_files = []
            
            for version in range(1, exam_config.get('versions', 1) + 1):
                # Generate questions for this version
                questions = generate_questions_with_bedrock(selected_topics, exam_config, version)
                
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
            
            # Generate self-assessment if requested
            if exam_config.get('includeSelfAssessment', False):
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
            
            # Update DynamoDB record with results
            table.update_item(
                Key={'analysisId': f"exam-{exam_id}"},
                UpdateExpression='SET #status = :status, generatedFiles = :files',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'COMPLETED',
                    ':files': generated_files
                }
            )
            
        except Exception as processing_error:
            print(f"Processing error: {processing_error}")
            # Update record as FAILED
            table.update_item(
                Key={'analysisId': f"exam-{exam_id}"},
                UpdateExpression='SET #status = :status, errorMessage = :error',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'FAILED',
                    ':error': str(processing_error)
                }
            )
            
            return create_error_response(500, 'PROCESSING_ERROR', 'Failed to generate exam')
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'examId': exam_id,
                'status': 'COMPLETED',
                'generatedFiles': generated_files
            })
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'INVALID_JSON', 'Request body must be valid JSON')

def handle_get_generation_results(event, context):
    """Handle GET request to retrieve generation results"""
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
        
        # Return exam results
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'examId': exam_id,
                'status': item.get('status'),
                'examConfig': item.get('examConfig', {}),
                'selectedTopics': item.get('selectedTopics', []),
                'generatedFiles': item.get('generatedFiles', []),
                'createdAt': item.get('createdAt'),
                'errorMessage': item.get('errorMessage')
            })
        }
        
    except Exception as e:
        print(f"Error retrieving exam results: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve exam results')

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
        content += f"Fecha: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC\n\n"
        
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
        content += f"Fecha: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')} UTC\n\n"
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }