#!/usr/bin/env python3
"""
Test script for admin handler functionality
"""

import json
import os
from unittest.mock import Mock, patch, MagicMock
import pytest
from datetime import datetime, timedelta

# Import the handler functions
from admin_handler import (
    lambda_handler,
    handle_exam_metrics,
    handle_user_metrics,
    handle_system_metrics,
    handle_audit_trail,
    handle_recent_activity,
    handle_system_alerts,
    generate_daily_trend,
    generate_audit_csv
)

def test_exam_metrics():
    """Test exam metrics functionality"""
    
    # Mock DynamoDB
    with patch('admin_handler.dynamodb') as mock_dynamodb:
        # Setup mock table
        mock_table = Mock()
        mock_table.query.return_value = {
            'Items': [
                {
                    'analysisId': 'exam-123',
                    'status': 'COMPLETED',
                    'createdAt': '2024-01-01T10:00:00Z',
                    'processingTime': '120',  # 2 minutes
                    'examConfig': {'questionCount': 10}
                },
                {
                    'analysisId': 'exam-124',
                    'status': 'COMPLETED',
                    'createdAt': '2024-01-02T11:00:00Z',
                    'processingTime': '180',  # 3 minutes
                    'examConfig': {'questionCount': 15}
                },
                {
                    'analysisId': 'exam-125',
                    'status': 'FAILED',
                    'createdAt': '2024-01-03T12:00:00Z',
                    'examConfig': {'questionCount': 8}
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_table
        
        # Mock environment variables
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table'}):
            # Test event
            event = {
                'httpMethod': 'GET',
                'path': '/admin/metrics/exams',
                'queryStringParameters': {'days': '30'}
            }
            
            # Call the function
            response = handle_exam_metrics(event, {})
            
            # Verify response
            assert response['statusCode'] == 200
            
            body = json.loads(response['body'])
            assert body['totalExams'] == 3
            assert body['successRate'] == 66.7  # 2 out of 3 completed
            assert 'statusBreakdown' in body
            assert body['statusBreakdown']['completed'] == 2
            assert body['statusBreakdown']['failed'] == 1
            assert 'dailyTrend' in body

def test_user_metrics():
    """Test user metrics functionality"""
    
    event = {
        'httpMethod': 'GET',
        'path': '/admin/metrics/users'
    }
    
    response = handle_user_metrics(event, {})
    
    assert response['statusCode'] == 200
    
    body = json.loads(response['body'])
    assert 'activeUsers' in body
    assert 'totalUsers' in body
    assert 'newUsersThisMonth' in body

def test_system_metrics():
    """Test system metrics functionality"""
    
    event = {
        'httpMethod': 'GET',
        'path': '/admin/metrics/system'
    }
    
    response = handle_system_metrics(event, {})
    
    assert response['statusCode'] == 200
    
    body = json.loads(response['body'])
    assert 'cpuUsage' in body
    assert 'memoryUsage' in body
    assert 'apiResponseTime' in body
    assert 'uptime' in body
    assert 'errorRate' in body

def test_audit_trail():
    """Test audit trail functionality"""
    
    # Mock DynamoDB
    with patch('admin_handler.dynamodb') as mock_dynamodb:
        # Setup mock table
        mock_table = Mock()
        mock_table.query.return_value = {
            'Items': [
                {
                    'analysisId': 'exam-123',
                    'teacherId': 'teacher1',
                    'createdAt': '2024-01-01T10:00:00Z',
                    'status': 'COMPLETED',
                    'examConfig': {'questionCount': 10}
                },
                {
                    'analysisId': 'exam-124',
                    'teacherId': 'teacher2',
                    'createdAt': '2024-01-02T11:00:00Z',
                    'status': 'FAILED',
                    'examConfig': {'questionCount': 15}
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_table
        
        # Mock environment variables
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table'}):
            # Test event
            event = {
                'httpMethod': 'GET',
                'path': '/admin/audit-trail',
                'queryStringParameters': {'limit': '10'}
            }
            
            # Call the function
            response = handle_audit_trail(event, {})
            
            # Verify response
            assert response['statusCode'] == 200
            
            body = json.loads(response['body'])
            assert 'entries' in body
            assert len(body['entries']) == 2
            
            # Check audit entry structure
            entry = body['entries'][0]
            assert 'timestamp' in entry
            assert 'userId' in entry
            assert 'action' in entry
            assert 'resource' in entry
            assert 'status' in entry
            assert 'ipAddress' in entry
            assert 'details' in entry

def test_recent_activity():
    """Test recent activity functionality"""
    
    # Mock DynamoDB
    with patch('admin_handler.dynamodb') as mock_dynamodb:
        # Setup mock table
        mock_table = Mock()
        mock_table.query.return_value = {
            'Items': [
                {
                    'analysisId': 'exam-123',
                    'teacherId': 'teacher1',
                    'createdAt': '2024-01-01T10:00:00Z',
                    'status': 'COMPLETED',
                    'examConfig': {'questionCount': 10}
                }
            ]
        }
        mock_dynamodb.Table.return_value = mock_table
        
        # Mock environment variables
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table'}):
            # Test event
            event = {
                'httpMethod': 'GET',
                'path': '/admin/recent-activity',
                'queryStringParameters': {'limit': '20'}
            }
            
            # Call the function
            response = handle_recent_activity(event, {})
            
            # Verify response
            assert response['statusCode'] == 200
            
            body = json.loads(response['body'])
            assert 'activities' in body
            assert len(body['activities']) == 1
            
            # Check activity structure
            activity = body['activities'][0]
            assert 'timestamp' in activity
            assert 'userId' in activity
            assert 'action' in activity
            assert 'status' in activity
            assert 'details' in activity

def test_system_alerts():
    """Test system alerts functionality"""
    
    event = {
        'httpMethod': 'GET',
        'path': '/admin/system-alerts'
    }
    
    response = handle_system_alerts(event, {})
    
    assert response['statusCode'] == 200
    
    body = json.loads(response['body'])
    assert 'alerts' in body
    # Should be empty for healthy system
    assert len(body['alerts']) == 0

def test_generate_daily_trend():
    """Test daily trend generation"""
    
    # Sample exam data
    exams = [
        {'createdAt': '2024-01-01T10:00:00Z'},
        {'createdAt': '2024-01-01T11:00:00Z'},
        {'createdAt': '2024-01-02T10:00:00Z'},
        {'createdAt': '2024-01-03T10:00:00Z'},
        {'createdAt': '2024-01-03T11:00:00Z'},
        {'createdAt': '2024-01-03T12:00:00Z'}
    ]
    
    trend_data = generate_daily_trend(exams, 7)
    
    # Should return 7 days of data
    assert len(trend_data) == 7
    
    # Each entry should have date and count
    for entry in trend_data:
        assert 'date' in entry
        assert 'count' in entry
        assert isinstance(entry['count'], int)

def test_generate_audit_csv():
    """Test audit CSV generation"""
    
    audit_entries = [
        {
            'timestamp': '2024-01-01T10:00:00Z',
            'userId': 'teacher1',
            'action': 'EXAM_GENERATION',
            'resource': 'exam-123',
            'status': 'SUCCESS',
            'ipAddress': '192.168.1.100',
            'details': 'Generated exam with 10 questions'
        },
        {
            'timestamp': '2024-01-02T11:00:00Z',
            'userId': 'teacher2',
            'action': 'FILE_UPLOAD',
            'resource': 'document.pdf',
            'status': 'SUCCESS',
            'ipAddress': '192.168.1.101',
            'details': 'Uploaded PDF document'
        }
    ]
    
    csv_content = generate_audit_csv(audit_entries)
    
    # Should be bytes
    assert isinstance(csv_content, bytes)
    
    # Convert to string for checking
    csv_text = csv_content.decode('utf-8')
    
    # Should contain headers
    assert 'Timestamp' in csv_text
    assert 'User ID' in csv_text
    assert 'Action' in csv_text
    
    # Should contain data
    assert 'teacher1' in csv_text
    assert 'EXAM_GENERATION' in csv_text
    assert 'exam-123' in csv_text

def test_lambda_handler_routing():
    """Test lambda handler routing"""
    
    # Test exam metrics route
    event = {
        'httpMethod': 'GET',
        'path': '/admin/metrics/exams'
    }
    
    with patch('admin_handler.handle_exam_metrics') as mock_handler:
        mock_handler.return_value = {'statusCode': 200, 'body': '{}'}
        
        response = lambda_handler(event, {})
        
        assert response['statusCode'] == 200
        mock_handler.assert_called_once()
    
    # Test invalid route
    event = {
        'httpMethod': 'GET',
        'path': '/admin/invalid'
    }
    
    response = lambda_handler(event, {})
    assert response['statusCode'] == 405

def test_error_handling():
    """Test error handling in admin functions"""
    
    # Test with invalid DynamoDB response
    with patch('admin_handler.dynamodb') as mock_dynamodb:
        mock_table = Mock()
        mock_table.query.side_effect = Exception("DynamoDB error")
        mock_dynamodb.Table.return_value = mock_table
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table'}):
            event = {
                'httpMethod': 'GET',
                'path': '/admin/metrics/exams'
            }
            
            response = handle_exam_metrics(event, {})
            
            assert response['statusCode'] == 500
            body = json.loads(response['body'])
            assert 'error' in body

if __name__ == '__main__':
    # Run the tests
    test_exam_metrics()
    test_user_metrics()
    test_system_metrics()
    test_audit_trail()
    test_recent_activity()
    test_system_alerts()
    test_generate_daily_trend()
    test_generate_audit_csv()
    test_lambda_handler_routing()
    test_error_handling()
    print("All admin functionality tests passed!")