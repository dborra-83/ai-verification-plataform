import json
import boto3
import uuid
import os
from datetime import datetime
from botocore.exceptions import ClientError
import io

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
    Process uploaded PDFs and generate AI analysis using Amazon Bedrock - v2.3
    """
    try:
        print(f"Analysis Lambda v2.4 - Received event: {json.dumps(event)}")
        
        # Extract user context from authorizer
        user_context = get_user_context(event)
        if user_context:
            print(f"Request from user: {user_context.get('email', user_context.get('userId'))}")
        
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        print(f"Parsed body: {json.dumps(body)}")
        
        # Validate required fields
        s3_key = body.get('s3Key')
        metadata = body.get('metadata', {})
        
        if not s3_key:
            return create_error_response(400, 'MISSING_S3_KEY', 's3Key is required')
        
        # Validate required metadata
        required_fields = ['studentName', 'course', 'assignmentName']
        for field in required_fields:
            if not metadata.get(field):
                return create_error_response(400, 'MISSING_METADATA', f'{field} is required in metadata')
        
        # Generate analysis ID
        analysis_id = str(uuid.uuid4())
        
        # Get table reference
        table = dynamodb.Table(os.environ['ANALYSIS_TABLE'])
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        # Create initial record in DynamoDB
        created_at = datetime.utcnow().isoformat()
        initial_record = {
            'analysisId': analysis_id,
            'createdAt': created_at,
            'status': 'STARTED',
            'teacher': 'admin',  # Mock teacher for demo
            's3Bucket': bucket_name,
            's3Key': s3_key,
            'metadata': metadata,
            'GSI1PK': 'RESULTS',
            'GSI1SK': f"{created_at}#{analysis_id}"
        }
        
        table.put_item(Item=initial_record)
        
        try:
            # Download PDF from S3
            pdf_content = download_pdf_from_s3(bucket_name, s3_key)
            
            # Extract text from PDF first, then analyze with Bedrock
            extracted_text = extract_text_from_pdf(pdf_content)
            
            # Use Bedrock to analyze the extracted text
            analysis_result = analyze_with_bedrock(extracted_text)
            print("Successfully used Bedrock for text analysis")
            
            # Update DynamoDB record with results - ensure numbers are integers/floats, not Decimals
            update_record = {
                'status': 'COMPLETED',
                'aiLikelihoodScore': int(analysis_result.get('aiLikelihoodScore', 0)),
                'originalityScore': int(analysis_result.get('originalityScore', 0)),
                'confidence': int(analysis_result.get('confidence', 0)),
                'summary': analysis_result.get('summary', ''),
                'signals': analysis_result.get('signals', []),
                'recommendations': analysis_result.get('recommendations', []),
                'limitations': analysis_result.get('limitations', []),
                'modelUsed': analysis_result.get('modelUsed', 'claude-3-haiku'),
                'promptVersion': 'v2.0-spanish-enhanced'
            }
            
            table.update_item(
                Key={'analysisId': analysis_id},
                UpdateExpression='SET #status = :status, aiLikelihoodScore = :ail, originalityScore = :os, confidence = :conf, summary = :sum, signals = :sig, recommendations = :rec, limitations = :lim, modelUsed = :model, promptVersion = :pv',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': update_record['status'],
                    ':ail': update_record['aiLikelihoodScore'],
                    ':os': update_record['originalityScore'],
                    ':conf': update_record['confidence'],
                    ':sum': update_record['summary'],
                    ':sig': update_record['signals'],
                    ':rec': update_record['recommendations'],
                    ':lim': update_record['limitations'],
                    ':model': update_record['modelUsed'],
                    ':pv': update_record['promptVersion']
                }
            )
            
        except Exception as processing_error:
            print(f"Processing error: {processing_error}")
            # Update record as FAILED
            table.update_item(
                Key={'analysisId': analysis_id},
                UpdateExpression='SET #status = :status, errorMessage = :error',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'FAILED',
                    ':error': str(processing_error)
                }
            )
            
            return create_error_response(500, 'PROCESSING_ERROR', 'Failed to process document')
        
        # Return success response
        return {
            'statusCode': 200,
            'headers': get_cors_headers(),
            'body': json.dumps({
                'analysisId': analysis_id
            })
        }
        
    except json.JSONDecodeError:
        return create_error_response(400, 'INVALID_JSON', 'Request body must be valid JSON')
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'INTERNAL_ERROR', 'Internal server error')

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

# Mock functions removed - using only real Bedrock analysis

def analyze_with_bedrock(text):
    """Analyze text using Amazon Bedrock Claude model"""
    try:
        # Prepare the improved prompt in Spanish for better AI detection
        prompt = f"""Eres un sistema experto en detección de contenido generado por IA, especializado en analizar textos académicos en español. Tu tarea es identificar patrones que sugieran el uso de herramientas de IA como ChatGPT, Claude, Gemini, etc.

INDICADORES CLAVE DE CONTENIDO GENERADO POR IA:
- Estructura muy uniforme y predecible
- Uso excesivo de conectores como "además", "por otro lado", "en conclusión"
- Párrafos de longitud muy similar
- Vocabulario demasiado formal o rebuscado para el nivel académico
- Falta de errores menores típicos de escritura humana
- Transiciones demasiado perfectas entre ideas
- Uso de frases genéricas o clichés
- Estructura de "introducción-desarrollo-conclusión" muy rígida
- Repetición de patrones sintácticos
- Ausencia de estilo personal o voz única

Analiza el siguiente texto y responde ÚNICAMENTE con JSON válido en este formato exacto:

{{
  "aiLikelihoodScore": <0-100 entero>,
  "originalityScore": <0-100 entero>, 
  "confidence": <0-100 entero>,
  "summary": "<resumen breve del análisis en español>",
  "signals": [
    {{
      "type": "<categoría_señal>",
      "description": "<explicación en español>", 
      "evidenceSnippet": "<fragmento_corto_del_texto>"
    }}
  ],
  "recommendations": ["<recomendación_accionable_en_español>"],
  "limitations": ["<limitación_del_análisis_en_español>"]
}}

INSTRUCCIONES CRÍTICAS:
- Si detectas 3 o más indicadores de IA, asigna aiLikelihoodScore > 70
- Si el texto es muy genérico o estructurado, aumenta el score
- Si hay patrones repetitivos o lenguaje demasiado perfecto, es probable que sea IA
- Todas las respuestas deben estar en español
- Sé más estricto en la detección - es mejor ser precavido
- Incluye 3-5 señales específicas
- Responde SOLO con JSON válido, sin texto adicional

Texto a analizar:
{text[:4000]}"""  # Limit text to avoid token limits

        # Call Bedrock with Claude 3.5 Sonnet
        response = bedrock_client.invoke_model(
            modelId='anthropic.claude-3-5-sonnet-20240620-v1:0',
            body=json.dumps({
                'anthropic_version': 'bedrock-2023-05-31',
                'max_tokens': 1000,
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
        
        print(f"Bedrock response: {content}")
        
        # Parse JSON response from Claude
        try:
            # Clean the response to extract JSON
            json_start = content.find('{')
            json_end = content.rfind('}') + 1
            
            if json_start != -1 and json_end != -1:
                json_content = content[json_start:json_end]
                analysis_result = json.loads(json_content)
            else:
                raise ValueError("No valid JSON found in response")
            
            # Validate required fields
            required_fields = ['aiLikelihoodScore', 'originalityScore', 'confidence', 'summary', 'signals', 'recommendations', 'limitations']
            for field in required_fields:
                if field not in analysis_result:
                    raise ValueError(f"Missing required field: {field}")
            
            # Add model information
            analysis_result['modelUsed'] = 'anthropic.claude-3-5-sonnet-20240620-v1:0'
            
            return analysis_result
            
        except (json.JSONDecodeError, ValueError) as e:
            print(f"Invalid JSON response from Bedrock: {content}")
            raise Exception(f"Failed to parse Bedrock response: {e}")
            
    except Exception as e:
        print(f"Bedrock analysis error: {e}")
        raise Exception(f"Bedrock analysis failed: {e}")

# All mock functions removed - using only real Bedrock analysis with direct PDF processing

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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }