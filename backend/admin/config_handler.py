"""
Platform Configuration Handler for Admin Panel
Handles platform settings and email template management.
"""

import json
import boto3
import os
import re
from datetime import datetime
from decimal import Decimal

# Initialize clients
dynamodb = boto3.resource('dynamodb')

# Environment variables
ANALYSIS_TABLE = os.environ.get('ANALYSIS_TABLE', '')

# Spanish error messages
ERROR_MESSAGES = {
    'INVALID_CONFIG': 'Valor de configuración inválido',
    'INVALID_TEMPLATE': 'Plantilla de correo inválida',
    'OPERATION_FAILED': 'La operación falló. Por favor, intente de nuevo',
    'NOT_FOUND': 'Configuración no encontrada',
}

# Default configuration values
DEFAULT_CONFIG = {
    'platformName': 'EduTech AI',
    'logoUrl': '',
    'analysisThreshold': 70,
    'supportEmail': 'soporte@edutech.ai',
    'defaultLanguage': 'es',
    'maxFileSize': 10,  # MB
    'allowedFileTypes': ['pdf', 'docx', 'txt']
}

# Default email templates
DEFAULT_TEMPLATES = {
    'welcome': {
        'templateId': 'welcome',
        'subject': 'Bienvenido a {platform_name}',
        'body': '''Hola {user_name},

¡Bienvenido a {platform_name}!

Tu cuenta ha sido creada exitosamente. Tu contraseña temporal es: {temporary_password}

Por favor, inicia sesión y cambia tu contraseña en tu primer acceso.

Saludos,
El equipo de {platform_name}'''
    },
    'password_reset': {
        'templateId': 'password_reset',
        'subject': 'Restablecimiento de contraseña - {platform_name}',
        'body': '''Hola {user_name},

Hemos recibido una solicitud para restablecer tu contraseña en {platform_name}.

Tu nueva contraseña temporal es: {temporary_password}

Por favor, inicia sesión y cambia tu contraseña inmediatamente.

Si no solicitaste este cambio, contacta a soporte.

Saludos,
El equipo de {platform_name}'''
    },
    'verification': {
        'templateId': 'verification',
        'subject': 'Verifica tu correo - {platform_name}',
        'body': '''Hola {user_name},

Gracias por registrarte en {platform_name}.

Tu código de verificación es: {verification_code}

Este código expira en 24 horas.

Saludos,
El equipo de {platform_name}'''
    }
}


def decimal_default(obj):
    """JSON serializer for Decimal objects"""
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError


def get_cors_headers():
    """Get CORS headers for responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }


def create_response(status_code, body):
    """Create standardized API response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps(body, default=decimal_default)
    }


def create_error_response(status_code, error_code, message=None):
    """Create standardized error response in Spanish"""
    return create_response(status_code, {
        'error': {
            'code': error_code,
            'message': message or ERROR_MESSAGES.get(error_code, 'Error desconocido')
        }
    })


def get_user_context(event):
    """Extract user context from API Gateway authorizer"""
    try:
        request_context = event.get('requestContext', {})
        authorizer = request_context.get('authorizer', {})
        user_id = authorizer.get('userId')
        email = authorizer.get('email', '')
        if user_id:
            return {'userId': user_id, 'email': email}
        return None
    except Exception as e:
        print(f"Error extracting user context: {e}")
        return None


def is_valid_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def lambda_handler(event, context):
    """Main Lambda handler for configuration operations"""
    try:
        print(f"Config Lambda - Received event: {json.dumps(event)}")
        
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_params = event.get('pathParameters') or {}
        
        admin_context = get_user_context(event)
        
        # Route to appropriate handler
        if '/admin/config/email-templates' in path:
            template_id = path_params.get('templateId')
            if template_id:
                if http_method == 'GET':
                    return handle_get_email_template(template_id)
                elif http_method == 'PUT':
                    return handle_update_email_template(event, template_id, admin_context)
            else:
                if http_method == 'GET':
                    return handle_get_email_templates()
        elif '/admin/config/preview-template' in path and http_method == 'POST':
            return handle_preview_template(event)
        elif '/admin/config' in path:
            if http_method == 'GET':
                return handle_get_config()
            elif http_method == 'PUT':
                return handle_update_config(event, admin_context)
        
        return create_error_response(405, 'OPERATION_FAILED',
            f'Método {http_method} no permitido para la ruta {path}')
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_get_config():
    """
    Get all platform configuration
    GET /admin/config
    """
    try:
        config = DEFAULT_CONFIG.copy()
        
        if ANALYSIS_TABLE:
            table = dynamodb.Table(ANALYSIS_TABLE)
            
            try:
                response = table.get_item(
                    Key={
                        'PK': 'CONFIG',
                        'SK': 'PLATFORM'
                    }
                )
                
                if 'Item' in response:
                    stored_config = response['Item']
                    # Merge stored config with defaults
                    for key in DEFAULT_CONFIG.keys():
                        if key in stored_config:
                            config[key] = stored_config[key]
                    
                    config['updatedAt'] = stored_config.get('updatedAt')
                    config['updatedBy'] = stored_config.get('updatedBy')
            except Exception as e:
                print(f"Error reading config from DynamoDB: {e}")
        
        return create_response(200, {'config': config})
        
    except Exception as e:
        print(f"Error getting config: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_update_config(event, admin_context):
    """
    Update platform configuration
    PUT /admin/config
    Body: { platformName, logoUrl, analysisThreshold, supportEmail, ... }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        
        # Validate configuration values
        validation_errors = []
        
        if 'analysisThreshold' in body:
            threshold = body['analysisThreshold']
            if not isinstance(threshold, (int, float)) or threshold < 0 or threshold > 100:
                validation_errors.append('El umbral de análisis debe ser un número entre 0 y 100')
        
        if 'supportEmail' in body and body['supportEmail']:
            if not is_valid_email(body['supportEmail']):
                validation_errors.append('Formato de correo de soporte inválido')
        
        if 'platformName' in body:
            if not body['platformName'] or len(body['platformName']) > 100:
                validation_errors.append('El nombre de la plataforma debe tener entre 1 y 100 caracteres')
        
        if 'maxFileSize' in body:
            max_size = body['maxFileSize']
            if not isinstance(max_size, (int, float)) or max_size < 1 or max_size > 50:
                validation_errors.append('El tamaño máximo de archivo debe ser entre 1 y 50 MB')
        
        if validation_errors:
            return create_error_response(400, 'INVALID_CONFIG', '; '.join(validation_errors))
        
        if not ANALYSIS_TABLE:
            return create_error_response(500, 'OPERATION_FAILED', 
                'Tabla de configuración no disponible')
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Get current config for audit
        current_config = {}
        try:
            response = table.get_item(Key={'PK': 'CONFIG', 'SK': 'PLATFORM'})
            if 'Item' in response:
                current_config = response['Item']
        except:
            pass
        
        # Build update expression
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        config_item = {
            'PK': 'CONFIG',
            'SK': 'PLATFORM',
            'updatedAt': timestamp,
            'updatedBy': admin_context.get('userId') if admin_context else 'system'
        }
        
        # Add all config values
        allowed_keys = ['platformName', 'logoUrl', 'analysisThreshold', 'supportEmail', 
                       'defaultLanguage', 'maxFileSize', 'allowedFileTypes']
        
        for key in allowed_keys:
            if key in body:
                config_item[key] = body[key]
            elif key in current_config:
                config_item[key] = current_config[key]
            elif key in DEFAULT_CONFIG:
                config_item[key] = DEFAULT_CONFIG[key]
        
        # Save to DynamoDB
        table.put_item(Item=config_item)
        
        # Record audit log
        record_config_audit(admin_context, current_config, config_item)
        
        return create_response(200, {
            'message': 'Configuración actualizada exitosamente',
            'config': config_item
        })
        
    except Exception as e:
        print(f"Error updating config: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_get_email_templates():
    """
    Get all email templates
    GET /admin/config/email-templates
    """
    try:
        templates = []
        
        for template_id, default_template in DEFAULT_TEMPLATES.items():
            template = default_template.copy()
            
            # Try to get stored template
            if ANALYSIS_TABLE:
                try:
                    table = dynamodb.Table(ANALYSIS_TABLE)
                    response = table.get_item(
                        Key={
                            'PK': 'CONFIG',
                            'SK': f'EMAIL_TEMPLATE#{template_id}'
                        }
                    )
                    
                    if 'Item' in response:
                        stored = response['Item']
                        template['subject'] = stored.get('subject', template['subject'])
                        template['body'] = stored.get('body', template['body'])
                        template['updatedAt'] = stored.get('updatedAt')
                        template['updatedBy'] = stored.get('updatedBy')
                except Exception as e:
                    print(f"Error reading template {template_id}: {e}")
            
            templates.append(template)
        
        return create_response(200, {
            'templates': templates,
            'availablePlaceholders': [
                '{user_name}',
                '{platform_name}',
                '{verification_code}',
                '{temporary_password}'
            ]
        })
        
    except Exception as e:
        print(f"Error getting email templates: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_get_email_template(template_id):
    """
    Get a specific email template
    GET /admin/config/email-templates/{templateId}
    """
    try:
        if template_id not in DEFAULT_TEMPLATES:
            return create_error_response(404, 'NOT_FOUND', 
                f'Plantilla "{template_id}" no encontrada')
        
        template = DEFAULT_TEMPLATES[template_id].copy()
        
        # Try to get stored template
        if ANALYSIS_TABLE:
            try:
                table = dynamodb.Table(ANALYSIS_TABLE)
                response = table.get_item(
                    Key={
                        'PK': 'CONFIG',
                        'SK': f'EMAIL_TEMPLATE#{template_id}'
                    }
                )
                
                if 'Item' in response:
                    stored = response['Item']
                    template['subject'] = stored.get('subject', template['subject'])
                    template['body'] = stored.get('body', template['body'])
                    template['updatedAt'] = stored.get('updatedAt')
                    template['updatedBy'] = stored.get('updatedBy')
            except Exception as e:
                print(f"Error reading template {template_id}: {e}")
        
        return create_response(200, {'template': template})
        
    except Exception as e:
        print(f"Error getting email template: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_update_email_template(event, template_id, admin_context):
    """
    Update an email template
    PUT /admin/config/email-templates/{templateId}
    Body: { subject, body }
    """
    try:
        if template_id not in DEFAULT_TEMPLATES:
            return create_error_response(404, 'NOT_FOUND', 
                f'Plantilla "{template_id}" no encontrada')
        
        body = json.loads(event.get('body', '{}'))
        subject = body.get('subject', '').strip()
        template_body = body.get('body', '').strip()
        
        # Validate
        if not subject:
            return create_error_response(400, 'INVALID_TEMPLATE', 
                'El asunto de la plantilla es requerido')
        
        if not template_body:
            return create_error_response(400, 'INVALID_TEMPLATE', 
                'El cuerpo de la plantilla es requerido')
        
        if len(subject) > 200:
            return create_error_response(400, 'INVALID_TEMPLATE', 
                'El asunto no puede exceder 200 caracteres')
        
        if len(template_body) > 10000:
            return create_error_response(400, 'INVALID_TEMPLATE', 
                'El cuerpo no puede exceder 10000 caracteres')
        
        if not ANALYSIS_TABLE:
            return create_error_response(500, 'OPERATION_FAILED', 
                'Tabla de configuración no disponible')
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Get current template for audit
        current_template = DEFAULT_TEMPLATES[template_id].copy()
        try:
            response = table.get_item(
                Key={'PK': 'CONFIG', 'SK': f'EMAIL_TEMPLATE#{template_id}'}
            )
            if 'Item' in response:
                current_template = response['Item']
        except:
            pass
        
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        template_item = {
            'PK': 'CONFIG',
            'SK': f'EMAIL_TEMPLATE#{template_id}',
            'templateId': template_id,
            'subject': subject,
            'body': template_body,
            'updatedAt': timestamp,
            'updatedBy': admin_context.get('userId') if admin_context else 'system'
        }
        
        table.put_item(Item=template_item)
        
        # Record audit log
        record_template_audit(admin_context, template_id, current_template, template_item)
        
        return create_response(200, {
            'message': 'Plantilla actualizada exitosamente',
            'template': template_item
        })
        
    except Exception as e:
        print(f"Error updating email template: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_preview_template(event):
    """
    Preview an email template with sample data
    POST /admin/config/preview-template
    Body: { templateId, subject, body, sampleData }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        template_id = body.get('templateId')
        subject = body.get('subject', '')
        template_body = body.get('body', '')
        sample_data = body.get('sampleData', {})
        
        # If no subject/body provided, get from stored template
        if not subject or not template_body:
            if template_id and template_id in DEFAULT_TEMPLATES:
                default = DEFAULT_TEMPLATES[template_id]
                subject = subject or default['subject']
                template_body = template_body or default['body']
                
                # Try to get stored version
                if ANALYSIS_TABLE:
                    try:
                        table = dynamodb.Table(ANALYSIS_TABLE)
                        response = table.get_item(
                            Key={'PK': 'CONFIG', 'SK': f'EMAIL_TEMPLATE#{template_id}'}
                        )
                        if 'Item' in response:
                            subject = response['Item'].get('subject', subject)
                            template_body = response['Item'].get('body', template_body)
                    except:
                        pass
        
        # Default sample data
        default_sample = {
            'user_name': 'Juan Pérez',
            'platform_name': 'EduTech AI',
            'verification_code': '123456',
            'temporary_password': 'TempPass123!'
        }
        
        # Merge with provided sample data
        for key, value in default_sample.items():
            if key not in sample_data:
                sample_data[key] = value
        
        # Replace placeholders
        rendered_subject = subject
        rendered_body = template_body
        
        for key, value in sample_data.items():
            placeholder = '{' + key + '}'
            rendered_subject = rendered_subject.replace(placeholder, str(value))
            rendered_body = rendered_body.replace(placeholder, str(value))
        
        return create_response(200, {
            'preview': {
                'subject': rendered_subject,
                'body': rendered_body
            },
            'sampleData': sample_data
        })
        
    except Exception as e:
        print(f"Error previewing template: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def record_config_audit(admin_context, previous_config, new_config):
    """Record configuration change in audit log"""
    if not ANALYSIS_TABLE or not admin_context:
        return
    
    try:
        table = dynamodb.Table(ANALYSIS_TABLE)
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        # Find changed values
        changes = {}
        for key in new_config:
            if key in ['PK', 'SK', 'updatedAt', 'updatedBy']:
                continue
            old_value = previous_config.get(key)
            new_value = new_config.get(key)
            if old_value != new_value:
                changes[key] = {'previous': old_value, 'new': new_value}
        
        audit_entry = {
            'PK': f'AUDIT#{timestamp}',
            'SK': f'CONFIG_UPDATE#{admin_context.get("userId")}',
            'GSI1PK': 'AUDIT_LOGS',
            'GSI1SK': timestamp,
            'timestamp': timestamp,
            'adminId': admin_context.get('userId'),
            'adminEmail': admin_context.get('email'),
            'actionType': 'CONFIG_UPDATE',
            'details': {'changes': changes},
            'result': 'SUCCESS'
        }
        
        table.put_item(Item=audit_entry)
    except Exception as e:
        print(f"Error recording config audit: {e}")


def record_template_audit(admin_context, template_id, previous_template, new_template):
    """Record template change in audit log"""
    if not ANALYSIS_TABLE or not admin_context:
        return
    
    try:
        table = dynamodb.Table(ANALYSIS_TABLE)
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        audit_entry = {
            'PK': f'AUDIT#{timestamp}',
            'SK': f'TEMPLATE_UPDATE#{admin_context.get("userId")}',
            'GSI1PK': 'AUDIT_LOGS',
            'GSI1SK': timestamp,
            'timestamp': timestamp,
            'adminId': admin_context.get('userId'),
            'adminEmail': admin_context.get('email'),
            'actionType': 'TEMPLATE_UPDATE',
            'details': {
                'templateId': template_id,
                'previousSubject': previous_template.get('subject'),
                'newSubject': new_template.get('subject')
            },
            'result': 'SUCCESS'
        }
        
        table.put_item(Item=audit_entry)
    except Exception as e:
        print(f"Error recording template audit: {e}")
