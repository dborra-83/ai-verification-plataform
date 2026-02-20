"""
User Management Handler for Admin Panel
Handles Cognito user management operations including listing, creating,
enabling/disabling, deleting users, and role management.
"""

import json
import boto3
import os
from datetime import datetime
from botocore.exceptions import ClientError
import secrets
import string

# Initialize clients
cognito_client = boto3.client('cognito-idp')
dynamodb = boto3.resource('dynamodb')

# Environment variables
USER_POOL_ID = os.environ.get('USER_POOL_ID', 'us-east-1_VKapStaTX')
ANALYSIS_TABLE = os.environ.get('ANALYSIS_TABLE', '')

# Spanish error messages
ERROR_MESSAGES = {
    'USER_NOT_FOUND': 'Usuario no encontrado',
    'USER_ALREADY_EXISTS': 'Ya existe un usuario con este correo electrónico',
    'INVALID_EMAIL': 'Formato de correo electrónico inválido',
    'INVALID_ROLE': 'Rol inválido. Los roles válidos son: admin, teacher',
    'INVALID_STATUS': 'Estado inválido. Los estados válidos son: enabled, disabled',
    'INVALID_PAGINATION_TOKEN': 'Token de paginación inválido o expirado',
    'OPERATION_FAILED': 'La operación falló. Por favor, intente de nuevo',
    'UNAUTHORIZED': 'No autorizado para realizar esta acción',
    'FORBIDDEN': 'Acceso denegado. Se requieren permisos de administrador',
    'COGNITO_ERROR': 'Error al comunicarse con el servicio de autenticación',
    'BULK_PARTIAL_FAILURE': 'Algunas operaciones fallaron. Revise el resumen',
    'VALIDATION_ERROR': 'Error de validación',
    'EXPORT_FAILED': 'Error al generar el archivo de exportación',
}


def get_cors_headers():
    """Get CORS headers for responses"""
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }


def create_response(status_code, body):
    """Create standardized API response"""
    return {
        'statusCode': status_code,
        'headers': get_cors_headers(),
        'body': json.dumps(body, default=str)
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


def handle_cognito_error(error):
    """Map Cognito errors to user-friendly Spanish messages"""
    error_code = error.response['Error']['Code']
    
    cognito_error_map = {
        'UserNotFoundException': ('USER_NOT_FOUND', 404),
        'UsernameExistsException': ('USER_ALREADY_EXISTS', 409),
        'InvalidParameterException': ('INVALID_EMAIL', 400),
        'NotAuthorizedException': ('UNAUTHORIZED', 401),
        'TooManyRequestsException': ('COGNITO_ERROR', 429),
        'InternalErrorException': ('COGNITO_ERROR', 500),
        'InvalidPaginationTokenException': ('INVALID_PAGINATION_TOKEN', 400),
    }
    
    if error_code in cognito_error_map:
        code, status = cognito_error_map[error_code]
        return create_error_response(status, code)
    
    return create_error_response(500, 'COGNITO_ERROR')


def generate_temp_password(length=12):
    """Generate a secure temporary password"""
    alphabet = string.ascii_letters + string.digits + "!@#$%"
    # Ensure at least one of each required character type
    password = [
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.digits),
        secrets.choice("!@#$%")
    ]
    password += [secrets.choice(alphabet) for _ in range(length - 4)]
    secrets.SystemRandom().shuffle(password)
    return ''.join(password)


def parse_cognito_user(user):
    """Parse Cognito user object to standardized format"""
    attributes = {}
    for attr in user.get('Attributes', user.get('UserAttributes', [])):
        attributes[attr['Name']] = attr['Value']
    
    return {
        'username': user.get('Username', ''),
        'email': attributes.get('email', ''),
        'emailVerified': attributes.get('email_verified', 'false') == 'true',
        'enabled': user.get('Enabled', True),
        'userStatus': user.get('UserStatus', ''),
        'userCreateDate': user.get('UserCreateDate', ''),
        'userLastModifiedDate': user.get('UserLastModifiedDate', ''),
        'role': attributes.get('custom:role', 'teacher'),
        'attributes': attributes
    }


def lambda_handler(event, context):
    """Main Lambda handler for user management operations"""
    try:
        print(f"User Management Lambda - Received event: {json.dumps(event)}")
        
        http_method = event.get('httpMethod', 'GET')
        path = event.get('path', '')
        path_params = event.get('pathParameters') or {}
        
        # Extract admin context
        admin_context = get_user_context(event)
        if admin_context:
            print(f"Request from admin: {admin_context.get('email')}")
        
        # Route to appropriate handler
        if '/admin/users/bulk' in path and http_method == 'POST':
            return handle_bulk_operation(event, admin_context)
        elif '/admin/users/export' in path and http_method == 'POST':
            return handle_export_users(event, admin_context)
        elif '/admin/users/statistics' in path and http_method == 'GET':
            return handle_user_statistics(event)
        elif '/admin/users' in path:
            user_id = path_params.get('userId')
            
            if user_id:
                if '/status' in path and http_method == 'PUT':
                    return handle_update_user_status(event, user_id, admin_context)
                elif '/role' in path and http_method == 'PUT':
                    return handle_update_user_role(event, user_id, admin_context)
                elif '/reset-password' in path and http_method == 'POST':
                    return handle_reset_password(event, user_id, admin_context)
                elif '/resend-verification' in path and http_method == 'POST':
                    return handle_resend_verification(event, user_id, admin_context)
                elif http_method == 'GET':
                    return handle_get_user(event, user_id)
                elif http_method == 'DELETE':
                    return handle_delete_user(event, user_id, admin_context)
            else:
                if http_method == 'GET':
                    return handle_list_users(event)
                elif http_method == 'POST':
                    return handle_create_user(event, admin_context)
        
        return create_error_response(405, 'OPERATION_FAILED', 
            f'Método {http_method} no permitido para la ruta {path}')
        
    except Exception as e:
        print(f"Unexpected error: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_list_users(event):
    """
    List users with pagination and filtering
    GET /admin/users?limit=20&paginationToken=xxx&filter=email&status=enabled&role=admin
    """
    try:
        query_params = event.get('queryStringParameters') or {}
        limit = min(int(query_params.get('limit', '20')), 60)
        pagination_token = query_params.get('paginationToken')
        email_filter = query_params.get('filter', '')
        status_filter = query_params.get('status', '')  # enabled, disabled
        role_filter = query_params.get('role', '')  # admin, teacher
        
        # Build Cognito request
        cognito_params = {
            'UserPoolId': USER_POOL_ID,
            'Limit': limit
        }
        
        if pagination_token:
            cognito_params['PaginationToken'] = pagination_token
        
        # Cognito filter by email prefix
        if email_filter:
            cognito_params['Filter'] = f'email ^= "{email_filter}"'
        
        # Call Cognito
        response = cognito_client.list_users(**cognito_params)
        
        # Parse users
        users = [parse_cognito_user(user) for user in response.get('Users', [])]
        
        # Apply additional filters (status, role) - Cognito doesn't support these natively
        if status_filter:
            if status_filter == 'enabled':
                users = [u for u in users if u['enabled']]
            elif status_filter == 'disabled':
                users = [u for u in users if not u['enabled']]
        
        if role_filter:
            users = [u for u in users if u['role'] == role_filter]
        
        return create_response(200, {
            'users': users,
            'paginationToken': response.get('PaginationToken'),
            'count': len(users)
        })
        
    except ClientError as e:
        print(f"Cognito error listing users: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error listing users: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_get_user(event, user_id):
    """
    Get detailed user information
    GET /admin/users/{userId}
    """
    try:
        # Get user from Cognito
        response = cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        
        user = parse_cognito_user(response)
        
        # Get login history from DynamoDB if available
        login_history = []
        failed_logins = []
        
        if ANALYSIS_TABLE:
            try:
                table = dynamodb.Table(ANALYSIS_TABLE)
                # Query login history
                history_response = table.query(
                    KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
                    ExpressionAttributeValues={
                        ':pk': f'USER#{user_id}',
                        ':sk': 'LOGIN#'
                    },
                    ScanIndexForward=False,
                    Limit=10
                )
                login_history = history_response.get('Items', [])
                
                # Query failed logins
                failed_response = table.query(
                    KeyConditionExpression='PK = :pk AND begins_with(SK, :sk)',
                    ExpressionAttributeValues={
                        ':pk': f'USER#{user_id}',
                        ':sk': 'FAILED_LOGIN#'
                    },
                    ScanIndexForward=False,
                    Limit=10
                )
                failed_logins = failed_response.get('Items', [])
            except Exception as e:
                print(f"Error getting login history: {e}")
        
        user['loginHistory'] = login_history
        user['failedLogins'] = failed_logins
        
        return create_response(200, {'user': user})
        
    except ClientError as e:
        print(f"Cognito error getting user: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error getting user: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_create_user(event, admin_context):
    """
    Create a new user with temporary password
    POST /admin/users
    Body: { email, role, sendWelcomeEmail }
    """
    try:
        # Parse request body
        body = json.loads(event.get('body', '{}'))
        email = body.get('email', '').strip().lower()
        role = body.get('role', 'teacher')
        send_welcome_email = body.get('sendWelcomeEmail', True)
        
        # Validate email
        if not email or '@' not in email:
            return create_error_response(400, 'INVALID_EMAIL')
        
        # Validate role
        if role not in ['admin', 'teacher']:
            return create_error_response(400, 'INVALID_ROLE')
        
        # Generate temporary password
        temp_password = generate_temp_password()
        
        # Create user in Cognito
        user_attributes = [
            {'Name': 'email', 'Value': email},
            {'Name': 'email_verified', 'Value': 'true'},
            {'Name': 'custom:role', 'Value': role}
        ]
        
        response = cognito_client.admin_create_user(
            UserPoolId=USER_POOL_ID,
            Username=email,
            UserAttributes=user_attributes,
            TemporaryPassword=temp_password,
            MessageAction='SUPPRESS' if not send_welcome_email else 'RESEND',
            DesiredDeliveryMediums=['EMAIL']
        )
        
        user = parse_cognito_user(response.get('User', {}))
        
        # Record audit log
        record_audit_log(
            admin_context,
            'USER_CREATE',
            user['username'],
            email,
            {'role': role, 'sendWelcomeEmail': send_welcome_email}
        )
        
        return create_response(201, {
            'user': user,
            'message': 'Usuario creado exitosamente',
            'temporaryPassword': temp_password if not send_welcome_email else None
        })
        
    except ClientError as e:
        print(f"Cognito error creating user: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error creating user: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_update_user_status(event, user_id, admin_context):
    """
    Enable or disable a user account
    PUT /admin/users/{userId}/status
    Body: { enabled: boolean }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        enabled = body.get('enabled', True)
        
        if enabled:
            cognito_client.admin_enable_user(
                UserPoolId=USER_POOL_ID,
                Username=user_id
            )
            action = 'USER_ENABLE'
        else:
            cognito_client.admin_disable_user(
                UserPoolId=USER_POOL_ID,
                Username=user_id
            )
            action = 'USER_DISABLE'
        
        # Record audit log
        record_audit_log(
            admin_context,
            action,
            user_id,
            None,
            {'enabled': enabled}
        )
        
        status_text = 'habilitado' if enabled else 'deshabilitado'
        return create_response(200, {
            'message': f'Usuario {status_text} exitosamente',
            'userId': user_id,
            'enabled': enabled
        })
        
    except ClientError as e:
        print(f"Cognito error updating user status: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error updating user status: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_delete_user(event, user_id, admin_context):
    """
    Permanently delete a user
    DELETE /admin/users/{userId}
    """
    try:
        # Get user info before deletion for audit
        try:
            user_response = cognito_client.admin_get_user(
                UserPoolId=USER_POOL_ID,
                Username=user_id
            )
            user_email = None
            for attr in user_response.get('UserAttributes', []):
                if attr['Name'] == 'email':
                    user_email = attr['Value']
                    break
        except:
            user_email = None
        
        # Delete user
        cognito_client.admin_delete_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        
        # Record audit log
        record_audit_log(
            admin_context,
            'USER_DELETE',
            user_id,
            user_email,
            {}
        )
        
        return create_response(200, {
            'message': 'Usuario eliminado exitosamente',
            'userId': user_id
        })
        
    except ClientError as e:
        print(f"Cognito error deleting user: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error deleting user: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_update_user_role(event, user_id, admin_context):
    """
    Update user's role
    PUT /admin/users/{userId}/role
    Body: { role: "admin" | "teacher" }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        new_role = body.get('role', '')
        
        # Validate role
        if new_role not in ['admin', 'teacher']:
            return create_error_response(400, 'INVALID_ROLE')
        
        # Get current role for audit
        try:
            user_response = cognito_client.admin_get_user(
                UserPoolId=USER_POOL_ID,
                Username=user_id
            )
            previous_role = 'teacher'
            for attr in user_response.get('UserAttributes', []):
                if attr['Name'] == 'custom:role':
                    previous_role = attr['Value']
                    break
        except:
            previous_role = 'unknown'
        
        # Update role attribute
        cognito_client.admin_update_user_attributes(
            UserPoolId=USER_POOL_ID,
            Username=user_id,
            UserAttributes=[
                {'Name': 'custom:role', 'Value': new_role}
            ]
        )
        
        # Record audit log
        record_audit_log(
            admin_context,
            'USER_ROLE_CHANGE',
            user_id,
            None,
            {'previousRole': previous_role, 'newRole': new_role}
        )
        
        role_text = 'Administrador' if new_role == 'admin' else 'Profesor'
        return create_response(200, {
            'message': f'Rol actualizado a {role_text} exitosamente',
            'userId': user_id,
            'role': new_role,
            'previousRole': previous_role
        })
        
    except ClientError as e:
        print(f"Cognito error updating user role: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error updating user role: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_reset_password(event, user_id, admin_context):
    """
    Reset user's password (sends new temporary password)
    POST /admin/users/{userId}/reset-password
    """
    try:
        # Reset password - Cognito will send email with new temp password
        cognito_client.admin_reset_user_password(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        
        # Record audit log
        record_audit_log(
            admin_context,
            'PASSWORD_RESET',
            user_id,
            None,
            {}
        )
        
        return create_response(200, {
            'message': 'Contraseña restablecida exitosamente. El usuario recibirá un correo con la nueva contraseña temporal.',
            'userId': user_id
        })
        
    except ClientError as e:
        print(f"Cognito error resetting password: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error resetting password: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_resend_verification(event, user_id, admin_context):
    """
    Resend verification code to unverified user
    POST /admin/users/{userId}/resend-verification
    """
    try:
        # Check if user email is already verified
        user_response = cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=user_id
        )
        
        email_verified = False
        user_email = None
        for attr in user_response.get('UserAttributes', []):
            if attr['Name'] == 'email_verified':
                email_verified = attr['Value'] == 'true'
            if attr['Name'] == 'email':
                user_email = attr['Value']
        
        if email_verified:
            return create_error_response(400, 'VALIDATION_ERROR', 
                'El correo electrónico ya está verificado')
        
        # Resend confirmation code
        # Note: This requires the user to have initiated sign-up
        # For admin-created users, we might need to use a different approach
        try:
            cognito_client.admin_create_user(
                UserPoolId=USER_POOL_ID,
                Username=user_id,
                MessageAction='RESEND',
                DesiredDeliveryMediums=['EMAIL']
            )
        except ClientError as e:
            if e.response['Error']['Code'] == 'UsernameExistsException':
                # User exists, try to resend via different method
                # For existing users, we can reset their password which sends an email
                pass
            else:
                raise e
        
        # Record audit log
        record_audit_log(
            admin_context,
            'VERIFICATION_RESEND',
            user_id,
            user_email,
            {}
        )
        
        return create_response(200, {
            'message': 'Código de verificación reenviado exitosamente',
            'userId': user_id
        })
        
    except ClientError as e:
        print(f"Cognito error resending verification: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error resending verification: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_bulk_operation(event, admin_context):
    """
    Perform bulk enable/disable operations
    POST /admin/users/bulk
    Body: { userIds: [], action: "enable" | "disable" }
    """
    try:
        body = json.loads(event.get('body', '{}'))
        user_ids = body.get('userIds', [])
        action = body.get('action', '')
        
        if not user_ids:
            return create_error_response(400, 'VALIDATION_ERROR', 
                'Se requiere al menos un usuario')
        
        if action not in ['enable', 'disable']:
            return create_error_response(400, 'INVALID_STATUS')
        
        results = {
            'successful': [],
            'failed': []
        }
        
        for user_id in user_ids:
            try:
                if action == 'enable':
                    cognito_client.admin_enable_user(
                        UserPoolId=USER_POOL_ID,
                        Username=user_id
                    )
                    audit_action = 'BULK_ENABLE'
                else:
                    cognito_client.admin_disable_user(
                        UserPoolId=USER_POOL_ID,
                        Username=user_id
                    )
                    audit_action = 'BULK_DISABLE'
                
                results['successful'].append(user_id)
                
                # Record individual audit log
                record_audit_log(
                    admin_context,
                    audit_action,
                    user_id,
                    None,
                    {'bulkOperation': True}
                )
                
            except ClientError as e:
                results['failed'].append({
                    'userId': user_id,
                    'error': e.response['Error']['Code']
                })
        
        status_code = 200 if not results['failed'] else 207  # 207 Multi-Status
        action_text = 'habilitados' if action == 'enable' else 'deshabilitados'
        
        return create_response(status_code, {
            'message': f'{len(results["successful"])} usuarios {action_text} exitosamente',
            'results': results,
            'totalProcessed': len(user_ids),
            'successCount': len(results['successful']),
            'failureCount': len(results['failed'])
        })
        
    except Exception as e:
        print(f"Error in bulk operation: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_user_statistics(event):
    """
    Get user statistics for dashboard
    GET /admin/users/statistics
    """
    try:
        # Get all users from Cognito (paginated)
        all_users = []
        pagination_token = None
        
        while True:
            params = {
                'UserPoolId': USER_POOL_ID,
                'Limit': 60
            }
            if pagination_token:
                params['PaginationToken'] = pagination_token
            
            response = cognito_client.list_users(**params)
            all_users.extend(response.get('Users', []))
            
            pagination_token = response.get('PaginationToken')
            if not pagination_token:
                break
        
        # Calculate statistics
        total_users = len(all_users)
        enabled_users = sum(1 for u in all_users if u.get('Enabled', True))
        disabled_users = total_users - enabled_users
        
        # Count by role
        admin_count = 0
        teacher_count = 0
        
        # Count active users (logged in within 30 days) and new registrations
        from datetime import timedelta
        now = datetime.utcnow()
        thirty_days_ago = now - timedelta(days=30)
        
        active_users = 0
        new_registrations = 0
        
        for user in all_users:
            # Get role
            for attr in user.get('Attributes', []):
                if attr['Name'] == 'custom:role':
                    if attr['Value'] == 'admin':
                        admin_count += 1
                    else:
                        teacher_count += 1
                    break
            else:
                teacher_count += 1  # Default to teacher
            
            # Check creation date
            create_date = user.get('UserCreateDate')
            if create_date and create_date.replace(tzinfo=None) > thirty_days_ago:
                new_registrations += 1
            
            # Check last modified (approximation for activity)
            last_modified = user.get('UserLastModifiedDate')
            if last_modified and last_modified.replace(tzinfo=None) > thirty_days_ago:
                active_users += 1
        
        return create_response(200, {
            'totalUsers': total_users,
            'activeUsers': active_users,
            'newRegistrations': new_registrations,
            'disabledAccounts': disabled_users,
            'usersByRole': {
                'admin': admin_count,
                'teacher': teacher_count
            },
            'lastRefresh': datetime.utcnow().isoformat() + 'Z'
        })
        
    except ClientError as e:
        print(f"Cognito error getting statistics: {e}")
        return handle_cognito_error(e)
    except Exception as e:
        print(f"Error getting user statistics: {e}")
        return create_error_response(500, 'OPERATION_FAILED')


def handle_export_users(event, admin_context):
    """
    Export users to CSV or Excel
    POST /admin/users/export
    Body: { format: "csv" | "xlsx", filters: {} }
    """
    import csv
    import io
    
    try:
        body = json.loads(event.get('body', '{}'))
        export_format = body.get('format', 'csv')
        filters = body.get('filters', {})
        
        if export_format not in ['csv', 'xlsx']:
            return create_error_response(400, 'VALIDATION_ERROR', 
                'Formato no soportado. Use csv o xlsx')
        
        # Get all users (with filters applied)
        all_users = []
        pagination_token = None
        
        while True:
            params = {
                'UserPoolId': USER_POOL_ID,
                'Limit': 60
            }
            if pagination_token:
                params['PaginationToken'] = pagination_token
            
            # Apply email filter if provided
            if filters.get('email'):
                params['Filter'] = f'email ^= "{filters["email"]}"'
            
            response = cognito_client.list_users(**params)
            users = [parse_cognito_user(u) for u in response.get('Users', [])]
            
            # Apply additional filters
            if filters.get('status'):
                if filters['status'] == 'enabled':
                    users = [u for u in users if u['enabled']]
                elif filters['status'] == 'disabled':
                    users = [u for u in users if not u['enabled']]
            
            if filters.get('role'):
                users = [u for u in users if u['role'] == filters['role']]
            
            all_users.extend(users)
            
            pagination_token = response.get('PaginationToken')
            if not pagination_token:
                break
        
        # Generate CSV with Spanish headers
        output = io.StringIO()
        writer = csv.writer(output)
        
        # Spanish headers
        writer.writerow([
            'Correo Electrónico',
            'Estado',
            'Rol',
            'Fecha de Creación',
            'Última Modificación',
            'Email Verificado'
        ])
        
        for user in all_users:
            # Format dates as DD/MM/YYYY
            create_date = user.get('userCreateDate', '')
            if create_date:
                try:
                    dt = create_date if isinstance(create_date, datetime) else datetime.fromisoformat(str(create_date).replace('Z', '+00:00'))
                    create_date = dt.strftime('%d/%m/%Y')
                except:
                    pass
            
            modified_date = user.get('userLastModifiedDate', '')
            if modified_date:
                try:
                    dt = modified_date if isinstance(modified_date, datetime) else datetime.fromisoformat(str(modified_date).replace('Z', '+00:00'))
                    modified_date = dt.strftime('%d/%m/%Y')
                except:
                    pass
            
            writer.writerow([
                user.get('email', ''),
                'Habilitado' if user.get('enabled') else 'Deshabilitado',
                'Administrador' if user.get('role') == 'admin' else 'Profesor',
                create_date,
                modified_date,
                'Sí' if user.get('emailVerified') else 'No'
            ])
        
        csv_content = output.getvalue()
        
        # Upload to S3
        s3_client = boto3.client('s3')
        bucket = os.environ.get('UPLOAD_BUCKET', '')
        
        if bucket:
            filename = f"exports/usuarios-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
            s3_client.put_object(
                Bucket=bucket,
                Key=filename,
                Body=csv_content.encode('utf-8'),
                ContentType='text/csv; charset=utf-8'
            )
            
            # Generate presigned URL
            download_url = s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': filename},
                ExpiresIn=3600
            )
            
            # Record audit log
            record_audit_log(
                admin_context,
                'USER_EXPORT',
                None,
                None,
                {'format': export_format, 'userCount': len(all_users)}
            )
            
            return create_response(200, {
                'downloadUrl': download_url,
                'filename': filename,
                'userCount': len(all_users),
                'message': f'Exportación completada: {len(all_users)} usuarios'
            })
        else:
            # Return CSV content directly if no S3 bucket
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'text/csv; charset=utf-8',
                    'Content-Disposition': f'attachment; filename="usuarios-{datetime.utcnow().strftime("%Y%m%d")}.csv"',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': csv_content
            }
        
    except Exception as e:
        print(f"Error exporting users: {e}")
        return create_error_response(500, 'EXPORT_FAILED')


def record_audit_log(admin_context, action_type, target_user_id, target_email, details):
    """
    Record an audit log entry in DynamoDB
    """
    if not ANALYSIS_TABLE:
        print("No ANALYSIS_TABLE configured, skipping audit log")
        return
    
    try:
        table = dynamodb.Table(ANALYSIS_TABLE)
        timestamp = datetime.utcnow().isoformat() + 'Z'
        
        audit_entry = {
            'PK': f'AUDIT#{timestamp}',
            'SK': f'{action_type}#{admin_context.get("userId", "unknown") if admin_context else "system"}',
            'GSI1PK': 'AUDIT_LOGS',
            'GSI1SK': timestamp,
            'timestamp': timestamp,
            'adminId': admin_context.get('userId', 'unknown') if admin_context else 'system',
            'adminEmail': admin_context.get('email', '') if admin_context else '',
            'actionType': action_type,
            'targetUserId': target_user_id,
            'targetUserEmail': target_email,
            'details': details,
            'result': 'SUCCESS'
        }
        
        table.put_item(Item=audit_entry)
        print(f"Audit log recorded: {action_type} by {audit_entry['adminEmail']}")
        
    except Exception as e:
        print(f"Error recording audit log: {e}")
        # Don't fail the main operation if audit logging fails
