"""
Audit Handler for Admin Panel
Handles audit logging, login history, and security alerts.
"""

import json
import boto3
import os
from datetime import datetime, timedelta
from botocore.exceptions import ClientError
import csv
import io
from decimal import Decimal

# Initialize clients
dynamodb = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# Environment variables
ANALYSIS_TABLE = os.environ.get('ANALYSIS_TABLE', '')
UPLOAD_BUCKET = os.environ.get('UPLOAD_BUCKET', '')

# Spanish error messages
ERROR_MESSAGES = {
    'INVALID_DATE_RANGE': 'Rango de fechas inválido',
    'INVALID_ACTION_TYPE': 'Tipo de acción inválido',
    'EXPORT_FAILED': 'Error al generar el archivo de exportación',
    'OPERATION_FAILED': 'La operación falló. Por favor, intente de nuevo',
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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


def lambda_handler(event, context):
    """Main Lambda handler for audit operations"""
    try:
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        
        admin_context = get_user_context(event)
        
        # Route to appropriate handler
        if '/admin/audit/login-history' in path and http_method == 'GET':
            return handle_login_history(event)
        elif '/admin/audit/failed-logins' in path and http_method == 'GET':
            return handle_failed_logins(event)
        elif '/admin/audit/security-alerts' in path and http_method == 'GET':
            return handle_security_alerts(event)
        elif '/admin/audit/export' in path and http_method == 'POST':
            return handle_export_audit_logs(event, admin_context)
        elif '/admin/audit' in path and http_method == 'GET':
            return handle_get_audit_logs(event)
        
        return create_error_response(405, 'OPERATION_FAILED',
            f'Método {http_method} no permitido para la ruta {path}')
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def record_audit_entry(admin_id, admin_email, action_type, target_user_id=None, 
                       target_email=None, details=None, result='SUCCESS', 
                       error_message=None, ip_address=None):
    """
    Record an audit log entry in DynamoDB
    
    Args:
        admin_id: ID of the admin performing the action
        admin_email: Email of the admin
        action_type: Type of action (USER_CREATE, USER_DELETE, etc.)
        target_user_id: ID of the affected user (if applicable)
        target_email: Email of the affected user
        details: Additional details about the action
        result: SUCCESS or FAILURE
        error_message: Error message if result is FAILURE
        ip_address: IP address of the request
    """
    if not ANALYSIS_TABLE:
        print("No ANALYSIS_TABLE configured, skipping audit log")
        return None
    
    try:
        table = dynamodb.Table(ANALYSIS_TABLE)
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        audit_entry = {
            'PK': f'AUDIT#{timestamp}',
            'SK': f'{action_type}#{admin_id}',
            'GSI1PK': 'AUDIT_LOGS',
            'GSI1SK': timestamp,
            'timestamp': timestamp,
            'adminId': admin_id,
            'adminEmail': admin_email,
            'actionType': action_type,
            'targetUserId': target_user_id,
            'targetUserEmail': target_email,
            'details': details or {},
            'result': result,
            'errorMessage': error_message,
            'ipAddress': ip_address
        }
        
        table.put_item(Item=audit_entry)
        return audit_entry
        
    except Exception as e:
        print(f"Error recording audit log: {e}")
        return None


def handle_get_audit_logs(event):
    """
    Get audit logs with filtering
    GET /admin/audit?startDate=xxx&endDate=xxx&userId=xxx&actionType=xxx&limit=50
    """
    try:
        if not ANALYSIS_TABLE:
            return create_response(200, {'entries': [], 'total': 0})
        
        query_params = event.get('queryStringParameters') or {}
        start_date = query_params.get('startDate')
        end_date = query_params.get('endDate')
        user_filter = query_params.get('userId')
        action_type = query_params.get('actionType')
        limit = min(int(query_params.get('limit', '50')), 100)
        pagination_token = query_params.get('paginationToken')
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Build query
        key_condition = 'GSI1PK = :pk'
        expression_values = {':pk': 'AUDIT_LOGS'}
        filter_expressions = []
        
        # Date range filter
        if start_date and end_date:
            key_condition += ' AND GSI1SK BETWEEN :start AND :end'
            expression_values[':start'] = start_date
            expression_values[':end'] = end_date
        elif start_date:
            key_condition += ' AND GSI1SK >= :start'
            expression_values[':start'] = start_date
        elif end_date:
            key_condition += ' AND GSI1SK <= :end'
            expression_values[':end'] = end_date
        
        # Additional filters
        if user_filter:
            filter_expressions.append('(adminId = :userId OR targetUserId = :userId)')
            expression_values[':userId'] = user_filter
        
        if action_type:
            filter_expressions.append('actionType = :actionType')
            expression_values[':actionType'] = action_type
        
        # Build query params
        query_params_db = {
            'IndexName': 'GSI1',
            'KeyConditionExpression': key_condition,
            'ExpressionAttributeValues': expression_values,
            'ScanIndexForward': False,  # Most recent first
            'Limit': limit
        }
        
        if filter_expressions:
            query_params_db['FilterExpression'] = ' AND '.join(filter_expressions)
        
        if pagination_token:
            query_params_db['ExclusiveStartKey'] = json.loads(pagination_token)
        
        response = table.query(**query_params_db)
        
        entries = response.get('Items', [])
        
        # Format entries for response
        formatted_entries = []
        for entry in entries:
            formatted_entries.append({
                'timestamp': entry.get('timestamp'),
                'adminId': entry.get('adminId'),
                'adminEmail': entry.get('adminEmail'),
                'actionType': entry.get('actionType'),
                'targetUserId': entry.get('targetUserId'),
                'targetUserEmail': entry.get('targetUserEmail'),
                'details': entry.get('details', {}),
                'result': entry.get('result'),
                'ipAddress': entry.get('ipAddress')
            })
        
        result = {
            'entries': formatted_entries,
            'total': len(formatted_entries)
        }
        
        if response.get('LastEvaluatedKey'):
            result['paginationToken'] = json.dumps(response['LastEvaluatedKey'])
        
        return create_response(200, result)
        
    except Exception as e:
        print(f"Error getting audit logs: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_login_history(event):
    """
    Get login history for a user or all users
    GET /admin/audit/login-history?userId=xxx&days=30
    """
    try:
        if not ANALYSIS_TABLE:
            return create_response(200, {'entries': [], 'total': 0})
        
        query_params = event.get('queryStringParameters') or {}
        user_id = query_params.get('userId')
        days = int(query_params.get('days', '30'))
        limit = min(int(query_params.get('limit', '100')), 500)
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        if user_id:
            # Query specific user's login history
            response = table.query(
                KeyConditionExpression='PK = :pk AND SK BETWEEN :start AND :end',
                ExpressionAttributeValues={
                    ':pk': f'USER#{user_id}',
                    ':start': f'LOGIN#{start_date.isoformat()}Z',
                    ':end': f'LOGIN#{end_date.isoformat()}Z'
                },
                ScanIndexForward=False,
                Limit=limit
            )
        else:
            # Query all login history using GSI
            response = table.query(
                IndexName='GSI1',
                KeyConditionExpression='GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end',
                ExpressionAttributeValues={
                    ':pk': 'LOGIN_HISTORY',
                    ':start': start_date.isoformat() + 'Z',
                    ':end': end_date.isoformat() + 'Z'
                },
                ScanIndexForward=False,
                Limit=limit
            )
        
        entries = response.get('Items', [])
        
        # Format entries
        formatted_entries = []
        for entry in entries:
            formatted_entries.append({
                'timestamp': entry.get('timestamp'),
                'userId': entry.get('userId'),
                'userEmail': entry.get('userEmail'),
                'ipAddress': entry.get('ipAddress'),
                'userAgent': entry.get('userAgent'),
                'success': entry.get('success', True)
            })
        
        return create_response(200, {
            'entries': formatted_entries,
            'total': len(formatted_entries),
            'dateRange': {
                'start': start_date.isoformat() + 'Z',
                'end': end_date.isoformat() + 'Z'
            }
        })
        
    except Exception as e:
        print(f"Error getting login history: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_failed_logins(event):
    """
    Get failed login attempts
    GET /admin/audit/failed-logins?userId=xxx&days=7
    """
    try:
        if not ANALYSIS_TABLE:
            return create_response(200, {'entries': [], 'total': 0})
        
        query_params = event.get('queryStringParameters') or {}
        user_id = query_params.get('userId')
        days = int(query_params.get('days', '7'))
        limit = min(int(query_params.get('limit', '100')), 500)
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Calculate date range
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        
        if user_id:
            # Query specific user's failed logins
            response = table.query(
                KeyConditionExpression='PK = :pk AND SK BETWEEN :start AND :end',
                ExpressionAttributeValues={
                    ':pk': f'USER#{user_id}',
                    ':start': f'FAILED_LOGIN#{start_date.isoformat()}Z',
                    ':end': f'FAILED_LOGIN#{end_date.isoformat()}Z'
                },
                ScanIndexForward=False,
                Limit=limit
            )
        else:
            # Query all failed logins using GSI
            response = table.query(
                IndexName='GSI1',
                KeyConditionExpression='GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end',
                ExpressionAttributeValues={
                    ':pk': 'FAILED_LOGINS',
                    ':start': start_date.isoformat() + 'Z',
                    ':end': end_date.isoformat() + 'Z'
                },
                ScanIndexForward=False,
                Limit=limit
            )
        
        entries = response.get('Items', [])
        
        # Format entries
        formatted_entries = []
        for entry in entries:
            formatted_entries.append({
                'timestamp': entry.get('timestamp'),
                'userId': entry.get('userId'),
                'userEmail': entry.get('userEmail'),
                'ipAddress': entry.get('ipAddress'),
                'failureReason': entry.get('failureReason', 'Credenciales inválidas'),
                'userAgent': entry.get('userAgent')
            })
        
        return create_response(200, {
            'entries': formatted_entries,
            'total': len(formatted_entries),
            'dateRange': {
                'start': start_date.isoformat() + 'Z',
                'end': end_date.isoformat() + 'Z'
            }
        })
        
    except Exception as e:
        print(f"Error getting failed logins: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_security_alerts(event):
    """
    Get users with suspicious login patterns (>5 failed logins in 15 minutes)
    GET /admin/audit/security-alerts
    """
    try:
        if not ANALYSIS_TABLE:
            return create_response(200, {'alerts': [], 'total': 0})
        
        table = dynamodb.Table(ANALYSIS_TABLE)
        
        # Get failed logins from last 24 hours
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(hours=24)
        
        response = table.query(
            IndexName='GSI1',
            KeyConditionExpression='GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end',
            ExpressionAttributeValues={
                ':pk': 'FAILED_LOGINS',
                ':start': start_date.isoformat() + 'Z',
                ':end': end_date.isoformat() + 'Z'
            },
            ScanIndexForward=False
        )
        
        failed_logins = response.get('Items', [])
        
        # Group by user and check for suspicious patterns
        user_failures = {}
        for login in failed_logins:
            user_id = login.get('userId', 'unknown')
            if user_id not in user_failures:
                user_failures[user_id] = {
                    'userId': user_id,
                    'userEmail': login.get('userEmail', ''),
                    'attempts': [],
                    'ipAddresses': set()
                }
            
            user_failures[user_id]['attempts'].append({
                'timestamp': login.get('timestamp'),
                'ipAddress': login.get('ipAddress')
            })
            if login.get('ipAddress'):
                user_failures[user_id]['ipAddresses'].add(login.get('ipAddress'))
        
        # Identify suspicious users (>5 failed attempts in 15 minutes)
        alerts = []
        for user_id, data in user_failures.items():
            attempts = data['attempts']
            
            # Sort by timestamp
            attempts.sort(key=lambda x: x['timestamp'], reverse=True)
            
            # Check for 5+ failures in 15 minute windows
            for i in range(len(attempts)):
                window_start = datetime.fromisoformat(attempts[i]['timestamp'].replace('Z', '+00:00'))
                window_end = window_start - timedelta(minutes=15)
                
                count_in_window = sum(
                    1 for a in attempts 
                    if datetime.fromisoformat(a['timestamp'].replace('Z', '+00:00')) >= window_end
                )
                
                if count_in_window >= 5:
                    alerts.append({
                        'userId': user_id,
                        'userEmail': data['userEmail'],
                        'failedAttempts': len(attempts),
                        'uniqueIpAddresses': len(data['ipAddresses']),
                        'ipAddresses': list(data['ipAddresses']),
                        'lastAttempt': attempts[0]['timestamp'],
                        'alertType': 'MULTIPLE_FAILED_LOGINS',
                        'severity': 'HIGH' if count_in_window >= 10 else 'MEDIUM',
                        'message': f'{count_in_window} intentos fallidos en 15 minutos'
                    })
                    break  # Only one alert per user
        
        # Sort by severity and last attempt
        alerts.sort(key=lambda x: (x['severity'] == 'HIGH', x['lastAttempt']), reverse=True)
        
        return create_response(200, {
            'alerts': alerts,
            'total': len(alerts),
            'analyzedPeriod': {
                'start': start_date.isoformat() + 'Z',
                'end': end_date.isoformat() + 'Z'
            }
        })
        
    except Exception as e:
        print(f"Error getting security alerts: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_export_audit_logs(event, admin_context):
    """
    Export audit logs to CSV
    POST /admin/audit/export
    Body: { startDate, endDate, filters, format }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        start_date = body.get('startDate')
        end_date = body.get('endDate')
        filters = body.get('filters', {})
        export_format = body.get('format', 'csv')
        
        if export_format != 'csv':
            return create_error_response(400, 'OPERATION_FAILED', 
                'Solo se soporta formato CSV para exportación de auditoría')
        
        # Get audit logs
        mock_event = {
            'queryStringParameters': {
                'startDate': start_date,
                'endDate': end_date,
                'actionType': filters.get('actionType'),
                'userId': filters.get('userId'),
                'limit': '1000'
            }
        }
        
        audit_response = handle_get_audit_logs(mock_event)
        audit_data = json.loads(audit_response['body'])
        entries = audit_data.get('entries', [])
        
        # Generate CSV with Spanish headers
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Spanish headers
        writer.writerow([
            'Fecha/Hora',
            'Administrador',
            'Email Administrador',
            'Tipo de Acción',
            'Usuario Afectado',
            'Email Usuario',
            'Detalles',
            'Resultado',
            'Dirección IP'
        ])
        
        # Action type translations
        action_translations = {
            'USER_CREATE': 'Creación de Usuario',
            'USER_DELETE': 'Eliminación de Usuario',
            'USER_ENABLE': 'Habilitación de Usuario',
            'USER_DISABLE': 'Deshabilitación de Usuario',
            'USER_ROLE_CHANGE': 'Cambio de Rol',
            'PASSWORD_RESET': 'Restablecimiento de Contraseña',
            'VERIFICATION_RESEND': 'Reenvío de Verificación',
            'CONFIG_UPDATE': 'Actualización de Configuración',
            'TEMPLATE_UPDATE': 'Actualización de Plantilla',
            'USER_EXPORT': 'Exportación de Usuarios',
            'AUDIT_EXPORT': 'Exportación de Auditoría',
            'BULK_ENABLE': 'Habilitación Masiva',
            'BULK_DISABLE': 'Deshabilitación Masiva'
        }
        
        for entry in entries:
            # Format timestamp as DD/MM/YYYY HH:MM:SS
            timestamp = entry.get('timestamp', '')
            if timestamp:
                try:
                    dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    timestamp = dt.strftime('%d/%m/%Y %H:%M:%S')
                except:
                    pass
            
            action_type = entry.get('actionType', '')
            action_text = action_translations.get(action_type, action_type)
            
            details = entry.get('details', {})
            details_text = json.dumps(details, ensure_ascii=False) if details else ''
            
            writer.writerow([
                timestamp,
                entry.get('adminId', ''),
                entry.get('adminEmail', ''),
                action_text,
                entry.get('targetUserId', ''),
                entry.get('targetUserEmail', ''),
                details_text,
                'Éxito' if entry.get('result') == 'SUCCESS' else 'Fallo',
                entry.get('ipAddress', '')
            ])
        
        csv_content = output.getvalue()
        
        # Upload to S3
        if UPLOAD_BUCKET:
            filename = f"exports/auditoria-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
            s3_client.put_object(
                Bucket=UPLOAD_BUCKET,
                Key=filename,
                Body=csv_content.encode('utf-8'),
                ContentType='text/csv; charset=utf-8'
            )
            
            # Generate presigned URL
            download_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': UPLOAD_BUCKET, 'Key': filename},
                ExpiresIn=3600
            )
            
            # Record audit log for export
            if admin_context:
                record_audit_entry(
                    admin_context.get('userId'),
                    admin_context.get('email'),
                    'AUDIT_EXPORT',
                    details={'recordCount': len(entries), 'format': export_format}
                )
            
            return create_response(200, {
                'downloadUrl': download_url,
                'filename': filename,
                'recordCount': len(entries),
                'message': f'Exportación completada: {len(entries)} registros'
            })
        else:
            # Return CSV content directly
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': f'attachment; filename="auditoria-{datetime.utcnow().strftime("%Y%m%d")}.csv"',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': csv_content
            }
        
    except Exception as e:
        print(f"Error exporting audit logs: {e}")
        return create_error_response(500, 'EXPORT_FAILED')


def record_login_attempt(user_id, user_email, success, ip_address=None, 
                         user_agent=None, failure_reason=None):
    """
    Record a login attempt (success or failure) in DynamoDB
    """
    if not ANALYSIS_TABLE:
        return None
    
    try:
        table = dynamodb.Table(ANALYSIS_TABLE)
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        if success:
            entry = {
                'PK': f'USER#{user_id}',
                'SK': f'LOGIN#{timestamp}',
                'GSI1PK': 'LOGIN_HISTORY',
                'GSI1SK': timestamp,
                'userId': user_id,
                'userEmail': user_email,
                'timestamp': timestamp,
                'ipAddress': ip_address,
                'userAgent': user_agent,
                'success': True
            }
        else:
            entry = {
                'PK': f'USER#{user_id}',
                'SK': f'FAILED_LOGIN#{timestamp}',
                'GSI1PK': 'FAILED_LOGINS',
                'GSI1SK': timestamp,
                'userId': user_id,
                'userEmail': user_email,
                'timestamp': timestamp,
                'ipAddress': ip_address,
                'userAgent': user_agent,
                'success': False,
                'failureReason': failure_reason or 'Credenciales inválidas'
            }
        
        table.put_item(Item=entry)
        return entry
        
    except Exception as e:
        print(f"Error recording login attempt: {e}")
        return None
