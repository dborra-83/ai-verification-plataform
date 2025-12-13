import json
import boto3
import uuid
import os
import base64
from datetime import datetime
from botocore.exceptions import ClientError
import io

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
bedrock_client = boto3.client('bedrock-runtime')

def lambda_handler(event, context):
    """
    Extract hierarchical topic outline from uploaded PDFs using Claude 3.5 Sonnet
    """
    try:
        print(f"Topic Extraction Lambda - Received event: {json.dumps(event)}")
        
        # Handle different HTTP methods
        http_method = event.get('httpMethod', 'POST')
        
        if http_method == 'POST':
            return handle_topic_extraction(event, context)
        elif http_method == 'GET':
            return handle_get_extraction_results(event, context)
        elif http_method == 'OPTIONS':
            # Handle CORS preflight request
            return {
                'statusCode': 200,
                'headers': get_cors_headers(),
                'body': json.dumps({'message': 'CORS preflight successful'})
            }
        else:
            return create_error_response(405, 'METHOD_NOT_ALLOWED', f'Method {http_method} not allowed')
            
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

def handle_topic_extraction(event, context):
    """Handle POST request to extract topics from PDFs"""
    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields - support both s3Keys and files formats
        s3_keys = body.get('s3Keys', [])
        files = body.get('files', [])
        teacher_id = body.get('teacherId', 'admin')
        
        # Check if we have either s3Keys or files
        if not s3_keys and not files:
            return create_error_response(400, 'MISSING_FILES', 'Either s3Keys or files array is required')
        
        # Validate file count
        file_count = len(s3_keys) if s3_keys else len(files)
        if file_count > 5:
            return create_error_response(400, 'TOO_MANY_FILES', 'Maximum 5 PDF files allowed')
        
        if file_count == 0:
            return create_error_response(400, 'NO_FILES', 'At least one file is required')
        
        # Generate extraction ID
        extraction_id = str(uuid.uuid4())
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        # Create initial record in DynamoDB
        created_at = datetime.utcnow().isoformat()
        source_documents = s3_keys if s3_keys else [f['name'] for f in files]
        initial_record = {
            'analysisId': f"topic-extraction-{extraction_id}",
            'type': 'TOPIC_EXTRACTION',
            'teacherId': teacher_id,
            'createdAt': created_at,
            'status': 'PROCESSING',
            'sourceDocuments': source_documents,
            'GSI1PK': 'TOPIC_EXTRACTIONS',
            'GSI1SK': f"{created_at}#topic-extraction-{extraction_id}"
        }
        
        table.put_item(Item=initial_record)
        
        try:
            # Process each PDF and extract topics
            all_topics = []
            
            if s3_keys:
                # Process S3 files
                for s3_key in s3_keys:
                    # Download and extract text from PDF
                    pdf_content = download_pdf_from_s3(bucket_name, s3_key)
                    extracted_text = extract_text_from_pdf(pdf_content)
                    
                    # Extract topics using Bedrock
                    topics = extract_topics_with_bedrock(extracted_text, s3_key)
                    all_topics.extend(topics)
            else:
                # Process base64 files
                for file_info in files:
                    # Decode base64 content
                    pdf_content = base64.b64decode(file_info['content'])
                    extracted_text = extract_text_from_pdf(pdf_content)
                    
                    # Extract topics using Bedrock
                    topics = extract_topics_with_bedrock(extracted_text, file_info['name'])
                    all_topics.extend(topics)
            
            # Consolidate and organize topics
            consolidated_outline = consolidate_topic_outline(all_topics)
            
            # Update DynamoDB record with results
            table.update_item(
                Key={'analysisId': f"topic-extraction-{extraction_id}"},
                UpdateExpression='SET #status = :status, topicOutline = :outline',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'COMPLETED',
                    ':outline': consolidated_outline
                }
            )
            
        except Exception as processing_error:
            print(f"Processing error: {processing_error}")
            # Update record as FAILED
            table.update_item(
                Key={'analysisId': f"topic-extraction-{extraction_id}"},
                UpdateExpression='SET #status = :status, errorMessage = :error',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'FAILED',
                    ':error': str(processing_error)
                }
            )
            
            return create_error_response(500, 'PROCESSING_ERROR', 'Failed to extract topics from documents')
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'extractionId': extraction_id,
                'status': 'COMPLETED',
                'topicOutline': consolidated_outline
            })
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'INVALID_JSON', 'Request body must be valid JSON')

def handle_get_extraction_results(event, context):
    """Handle GET request to retrieve extraction results"""
    try:
        # Get extraction ID from path parameters
        extraction_id = event.get('pathParameters', {}).get('extractionId')
        
        if not extraction_id:
            return create_error_response(400, 'MISSING_EXTRACTION_ID', 'extractionId is required')
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        
        # Retrieve extraction record
        response = table.get_item(
            Key={'analysisId': f"topic-extraction-{extraction_id}"}
        )
        
        if 'Item' not in response:
            return create_error_response(404, 'EXTRACTION_NOT_FOUND', 'Extraction not found')
        
        item = response['Item']
        
        # Return extraction results
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'extractionId': extraction_id,
                'status': item.get('status'),
                'topicOutline': item.get('topicOutline', []),
                'sourceDocuments': item.get('sourceDocuments', []),
                'createdAt': item.get('createdAt'),
                'errorMessage': item.get('errorMessage')
            })
        }
        
    except Exception as e:
        print(f"Error retrieving extraction results: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Failed to retrieve extraction results')

def download_pdf_from_s3(bucket_name, s3_key):
    """Download PDF content from S3"""
    try:
        response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
        return response['Body'].read()
    except ClientError as e:
        raise Exception(f"Failed to download PDF from S3: {e}")

def extract_text_from_pdf(pdf_content):
    """Extract text from PDF using PyPDF2"""
    try:
        print(f"PDF content size: {len(pdf_content)} bytes")
        
        # Try to extract text using PyPDF2
        try:
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            
            extracted_text = ""
            for page_num in range(len(pdf_reader.pages)):
                page = pdf_reader.pages[page_num]
                page_text = page.extract_text()
                extracted_text += page_text + "\n"
            
            # Clean up the text
            extracted_text = extracted_text.strip()
            
            if len(extracted_text) > 100:  # If we got meaningful text
                print(f"Successfully extracted {len(extracted_text)} characters from PDF")
                return extracted_text
            else:
                print("PyPDF2 extraction returned insufficient text")
                raise Exception("Insufficient text extracted")
                
        except ImportError:
            print("PyPDF2 not available")
            raise Exception("PyPDF2 not installed")
        except Exception as pdf_error:
            print(f"PyPDF2 extraction failed: {pdf_error}")
            raise Exception(f"PDF extraction failed: {pdf_error}")
        
    except Exception as e:
        print(f"Error in extract_text_from_pdf: {e}")
        raise Exception(f"Failed to extract text from PDF: {e}")

def extract_topics_with_bedrock(text, source_document):
    """Extract hierarchical topic outline using Claude 3.5 Sonnet"""
    try:
        # Prepare the prompt for topic extraction
        prompt = f"""Eres un experto en análisis de contenido educativo. Tu tarea es extraer un temario jerárquico estructurado del siguiente texto académico.

INSTRUCCIONES:
- Identifica los temas principales y subtemas del contenido
- Organiza la información en una estructura jerárquica clara
- Usa nombres descriptivos y específicos para cada tema
- Incluye solo temas que tengan suficiente contenido para generar preguntas
- Limita a máximo 8 temas principales con 3-5 subtemas cada uno

Responde ÚNICAMENTE con JSON válido en este formato exacto:

{{
  "topics": [
    {{
      "topic": "Nombre del Tema Principal",
      "subtopics": ["Subtema 1", "Subtema 2", "Subtema 3"]
    }}
  ]
}}

TEXTO A ANALIZAR:
{text[:6000]}"""  # Limit text to avoid token limits

        # Call Bedrock with Claude 3.5 Sonnet
        response = bedrock_client.invoke_model(
            modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 2000,
                'temperature': 0.1,
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
        
        print(f"Bedrock topic extraction response: {content}")
        
        # Parse JSON response from Claude
        try:
            # Clean the response to extract JSON
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_content = content[json_start:json_end]
                topic_result = json.loads(json_content)
            else:
                raise ValueError("No valid JSON found in response")
            
            # Add source document to each topic
            topics_with_source = []
            for topic_item in topic_result.get('topics', []):
                topic_with_source = {
                    'topic': topic_item['topic'],
                    'subtopics': topic_item['subtopics'],
                    'sourceDocument': source_document
                }
                topics_with_source.append(topic_with_source)
            
            return topics_with_source
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Invalid JSON response from Bedrock: {content}")
            raise Exception(f"Failed to parse Bedrock response: {e}")
            
    except Exception as e:
        print(f"Bedrock topic extraction error: {e}")
        raise Exception(f"Topic extraction failed: {e}")

def consolidate_topic_outline(all_topics):
    """Consolidate topics from multiple documents into a unified outline"""
    try:
        # Group topics by similarity and merge subtopics
        consolidated = {}
        
        for topic_item in all_topics:
            topic_name = topic_item['topic']
            subtopics = topic_item['subtopics']
            source_doc = topic_item['sourceDocument']
            
            # Simple consolidation - group by exact topic name
            if topic_name in consolidated:
                # Merge subtopics, avoiding duplicates
                existing_subtopics = set(consolidated[topic_name]['subtopics'])
                new_subtopics = set(subtopics)
                consolidated[topic_name]['subtopics'] = list(existing_subtopics.union(new_subtopics))
                
                # Add source document if not already present
                if source_doc not in consolidated[topic_name]['sourceDocuments']:
                    consolidated[topic_name]['sourceDocuments'].append(source_doc)
            else:
                consolidated[topic_name] = {
                    'topic': topic_name,
                    'subtopics': subtopics,
                    'sourceDocuments': [source_doc]
                }
        
        # Convert back to list format
        return list(consolidated.values())
        
    except Exception as e:
        print(f"Error consolidating topics: {e}")
        return all_topics  # Return original if consolidation fails

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