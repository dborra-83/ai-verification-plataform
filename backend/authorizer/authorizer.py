"""
Lambda Authorizer for API Gateway
Validates JWT tokens from AWS Cognito User Pool
"""
import json
import os
import time
from typing import Dict, Any, Optional
from urllib.request import urlopen
from jose import jwt, JWTError

# Environment variables
USER_POOL_ID = os.environ.get('USER_POOL_ID')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Construct JWKS URL
JWKS_URL = f'https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}/.well-known/jwks.json'
ISSUER = f'https://cognito-idp.{AWS_REGION}.amazonaws.com/{USER_POOL_ID}'

# Cache for JWKS keys (in-memory, persists across warm Lambda invocations)
JWKS_CACHE: Optional[Dict[str, Any]] = None
JWKS_CACHE_TIMESTAMP: float = 0
JWKS_CACHE_TTL: int = 3600  # 1 hour


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Lambda Authorizer handler
    
    Args:
        event: API Gateway authorizer event containing authorizationToken and methodArn
        context: Lambda context object
        
    Returns:
        IAM policy document with Allow/Deny decision and user context
    """
    try:
        # Extract token from Authorization header
        token = extract_token(event.get('authorizationToken', ''))
        
        if not token:
            print("Authorization token missing or invalid format")
            return generate_policy('user', 'Deny', event['methodArn'])
        
        # Get JWKS keys
        keys = get_jwks_keys()
        
        if not keys:
            print("Failed to retrieve JWKS keys")
            return generate_policy('user', 'Deny', event['methodArn'])
        
        # Verify and decode token
        claims = verify_token(token, keys)
        
        if not claims:
            print("Token verification failed")
            return generate_policy('user', 'Deny', event['methodArn'])
        
        # Extract user information
        user_id = claims.get('sub')
        email = claims.get('email')
        
        if not user_id:
            print("Token missing required claims (sub)")
            return generate_policy('user', 'Deny', event['methodArn'])
        
        # Generate Allow policy with user context
        policy = generate_policy(user_id, 'Allow', event['methodArn'])
        policy['context'] = {
            'userId': user_id,
            'email': email or ''
        }
        
        return policy
        
    except Exception as e:
        print(f"Authorization error: {str(e)}")
        return generate_policy('user', 'Deny', event['methodArn'])


def extract_token(authorization_header: str) -> Optional[str]:
    """
    Extract JWT token from Authorization header
    
    Args:
        authorization_header: Authorization header value (e.g., "Bearer <token>")
        
    Returns:
        JWT token string or None if invalid format
    """
    if not authorization_header:
        return None
    
    parts = authorization_header.split()
    
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    
    return parts[1]


def get_jwks_keys() -> Optional[Dict[str, Any]]:
    """
    Fetch JWKS keys from Cognito with caching
    
    Returns:
        JWKS keys dictionary or None if fetch fails
    """
    global JWKS_CACHE, JWKS_CACHE_TIMESTAMP
    
    # Check if cache is valid
    current_time = time.time()
    if JWKS_CACHE and (current_time - JWKS_CACHE_TIMESTAMP) < JWKS_CACHE_TTL:
        return JWKS_CACHE
    
    # Fetch fresh keys
    try:
        with urlopen(JWKS_URL) as response:
            jwks_data = json.loads(response.read().decode('utf-8'))
            JWKS_CACHE = jwks_data
            JWKS_CACHE_TIMESTAMP = current_time
            return jwks_data
    except Exception as e:
        print(f"Failed to fetch JWKS keys: {str(e)}")
        # Return cached keys if available, even if expired
        return JWKS_CACHE


def verify_token(token: str, jwks: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Verify JWT token signature and claims
    
    Args:
        token: JWT token string
        jwks: JWKS keys dictionary
        
    Returns:
        Token claims dictionary or None if verification fails
    """
    try:
        # Get the key ID from token header
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get('kid')
        
        if not kid:
            print("Token missing kid in header")
            return None
        
        # Find the matching key
        key = None
        for jwk_key in jwks.get('keys', []):
            if jwk_key.get('kid') == kid:
                key = jwk_key
                break
        
        if not key:
            print(f"No matching key found for kid: {kid}")
            return None
        
        # Verify token signature and decode claims
        claims = jwt.decode(
            token,
            key,
            algorithms=['RS256'],
            issuer=ISSUER,
            options={
                'verify_signature': True,
                'verify_exp': True,
                'verify_iss': True,
                'verify_aud': False  # Access tokens don't have aud claim
            }
        )
        
        # Validate token_use claim
        token_use = claims.get('token_use')
        if token_use != 'access':
            print(f"Invalid token_use: {token_use}")
            return None
        
        return claims
        
    except JWTError as e:
        print(f"JWT verification error: {str(e)}")
        return None
    except Exception as e:
        print(f"Token verification error: {str(e)}")
        return None


def generate_policy(principal_id: str, effect: str, resource: str) -> Dict[str, Any]:
    """
    Generate IAM policy document
    
    Args:
        principal_id: User identifier
        effect: 'Allow' or 'Deny'
        resource: API Gateway method ARN
        
    Returns:
        IAM policy document
    """
    # Extract API Gateway ARN parts to create wildcard resource
    # Format: arn:aws:execute-api:region:account-id:api-id/stage/method/resource
    # We need to keep the api-id in the resource ARN
    arn_parts = resource.split(':')
    
    # Get the api-id/stage/method/resource part
    api_path = arn_parts[5] if len(arn_parts) > 5 else ''
    api_id = api_path.split('/')[0] if api_path else ''
    
    # Construct the base ARN with api-id
    base_arn = ':'.join(arn_parts[:5])
    
    # Allow/Deny all methods in the API
    resource_arn = f"{base_arn}:{api_id}/*"
    
    policy = {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Action': 'execute-api:Invoke',
                    'Effect': effect,
                    'Resource': resource_arn
                }
            ]
        }
    }
    
    return policy
