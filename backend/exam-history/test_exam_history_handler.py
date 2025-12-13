import pytest
import json
import boto3
import uuid
import os
from datetime import datetime, timedelta
from moto import mock_dynamodb, mock_s3
from hypothesis import given, strategies as st, settings
from hypothesis.strategies import composite
import csv
import io
from unittest.mock import patch, MagicMock

# Import the handler
from exam_history_handler import (
    lambda_handler,
    handle_list_exams,
    handle_get_exam_details,
    handle_export_history,
    handle_file_download,
    generate_csv_export,
    create_error_response,
    get_cors_headers
)

# Test configuration
TEST_TABLE_NAME = 'test-ai-verification-results'
TEST_BUCKET_NAME = 'test-ai-verification-uploads'

def setup_aws_credentials():
    """Set up mocked AWS Credentials for moto."""
    os.environ['AWS_ACCESS_KEY_ID'] = 'testing'
    os.environ['AWS_SECRET_ACCESS_KEY'] = 'testing'
    os.environ['AWS_SECURITY_TOKEN'] = 'testing'
    os.environ['AWS_SESSION_TOKEN'] = 'testing'
    os.environ['AWS_DEFAULT_REGION'] = 'us-east-1'

def create_test_dynamodb_table():
    """Create a mocked DynamoDB table for testing."""
    setup_aws_credentials()
    
    dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
    
    # Create table with GSI
    table = dynamodb.create_table(
        TableName=TEST_TABLE_NAME,
        KeySchema=[
            {'AttributeName': 'analysisId', 'KeyType': 'HASH'}
        ],
        AttributeDefinitions=[
            {'AttributeName': 'analysisId', 'AttributeType': 'S'},
            {'AttributeName': 'GSI1PK', 'AttributeType': 'S'},
            {'AttributeName': 'GSI1SK', 'AttributeType': 'S'}
        ],
        GlobalSecondaryIndexes=[
            {
                'IndexName': 'GSI1',
                'KeySchema': [
                    {'AttributeName': 'GSI1PK', 'KeyType': 'HASH'},
                    {'AttributeName': 'GSI1SK', 'KeyType': 'RANGE'}
                ],
                'Projection': {'ProjectionType': 'ALL'},
                'ProvisionedThroughput': {
                    'ReadCapacityUnits': 5,
                    'WriteCapacityUnits': 5
                }
            }
        ],
        ProvisionedThroughput={
            'ReadCapacityUnits': 5,
            'WriteCapacityUnits': 5
        }
    )
    
    os.environ['ANALYSIS_TABLE'] = TEST_TABLE_NAME
    return table

def create_test_s3_bucket():
    """Create a mocked S3 bucket for testing."""
    setup_aws_credentials()
    
    s3 = boto3.client('s3', region_name='us-east-1')
    s3.create_bucket(Bucket=TEST_BUCKET_NAME)
    os.environ['UPLOAD_BUCKET'] = TEST_BUCKET_NAME
    return s3

# Hypothesis strategies for generating test data

@composite
def exam_config_strategy(draw):
    """Generate valid exam configurations."""
    return {
        'questionCount': draw(st.integers(min_value=1, max_value=20)),
        'questionTypes': draw(st.lists(
            st.sampled_from(['multiple_choice', 'true_false', 'mixed']),
            min_size=1, max_size=3, unique=True
        )),
        'difficulty': draw(st.sampled_from(['easy', 'medium', 'hard'])),
        'versions': draw(st.integers(min_value=1, max_value=4)),
        'includeSelfAssessment': draw(st.booleans()),
        'language': draw(st.one_of(st.none(), st.sampled_from(['en', 'es', 'fr'])))
    }

@composite
def exam_record_strategy(draw):
    """Generate complete exam records for testing."""
    exam_id = f"exam-{uuid.uuid4()}"
    created_at = draw(st.datetimes(
        min_value=datetime(2024, 1, 1),
        max_value=datetime(2025, 12, 31)
    )).isoformat() + 'Z'
    
    teacher_id = draw(st.sampled_from(['admin', 'teacher1', 'teacher2', 'teacher3']))
    status = draw(st.sampled_from(['COMPLETED', 'PROCESSING', 'FAILED']))
    
    exam_config = draw(exam_config_strategy())
    
    selected_topics = draw(st.lists(
        st.text(min_size=3, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Pc', 'Pd', 'Zs'))),
        min_size=1, max_size=10, unique=True
    ))
    
    source_documents = draw(st.lists(
        st.text(min_size=5, max_size=100).map(lambda x: f"documents/{x}.pdf"),
        min_size=1, max_size=5, unique=True
    ))
    
    # Generate files only for completed exams
    generated_files = []
    if status == 'COMPLETED':
        for version in range(1, exam_config['versions'] + 1):
            generated_files.extend([
                {
                    'type': 'student_version',
                    'version': version,
                    's3Key': f"exams/{exam_id.replace('exam-', '')}/v{version}-student.pdf",
                    'format': 'PDF'
                },
                {
                    'type': 'teacher_version',
                    'version': version,
                    's3Key': f"exams/{exam_id.replace('exam-', '')}/v{version}-teacher.pdf",
                    'format': 'PDF'
                }
            ])
    
    return {
        'analysisId': exam_id,
        'type': 'EXAM_GENERATION',
        'teacherId': teacher_id,
        'createdAt': created_at,
        'status': status,
        'examConfig': exam_config,
        'selectedTopics': selected_topics,
        'sourceDocuments': source_documents,
        'generatedFiles': generated_files,
        'GSI1PK': 'EXAM_GENERATIONS',
        'GSI1SK': f"{created_at}#{exam_id}",
        'errorMessage': None if status != 'FAILED' else 'Test error message'
    }

@composite
def api_event_strategy(draw, method='GET', path='/exam/history', include_body=False):
    """Generate API Gateway events for testing."""
    event = {
        'httpMethod': method,
        'path': path,
        'headers': {'Content-Type': 'application/json'},
        'queryStringParameters': None,
        'pathParameters': None,
        'body': None
    }
    
    if method == 'GET' and '/history' in path:
        # Generate query parameters for history listing
        query_params = {}
        if draw(st.booleans()):
            query_params['teacherId'] = draw(st.sampled_from(['admin', 'teacher1', 'all']))
        if draw(st.booleans()):
            start_date = draw(st.datetimes(min_value=datetime(2024, 1, 1), max_value=datetime(2025, 6, 1)))
            end_date = draw(st.datetimes(min_value=start_date, max_value=datetime(2025, 12, 31)))
            query_params['startDate'] = start_date.isoformat() + 'Z'
            query_params['endDate'] = end_date.isoformat() + 'Z'
        if draw(st.booleans()):
            query_params['topic'] = draw(st.text(min_size=3, max_size=20))
        if draw(st.booleans()):
            query_params['limit'] = str(draw(st.integers(min_value=1, max_value=100)))
        
        if query_params:
            event['queryStringParameters'] = query_params
    
    if include_body and method == 'POST':
        if '/export' in path:
            event['body'] = json.dumps({
                'format': draw(st.sampled_from(['csv', 'excel'])),
                'teacherId': draw(st.sampled_from(['admin', 'teacher1', 'all'])),
                'startDate': draw(st.one_of(st.none(), st.datetimes().map(lambda d: d.isoformat() + 'Z'))),
                'endDate': draw(st.one_of(st.none(), st.datetimes().map(lambda d: d.isoformat() + 'Z')))
            })
    
    return event

# Property-based tests

class TestExamHistoryProperties:
    """
    Feature: exam-generator-module
    Property-based tests for exam history functionality
    """

    @given(st.lists(exam_record_strategy(), min_size=1, max_size=20))
    @settings(max_examples=100, deadline=None)
    def test_property_7_history_record_completeness(self, exam_records):
        """
        Feature: exam-generator-module
        Property 7: History Record Completeness
        
        For any generated exam, a complete history record should be created with all metadata 
        and be retrievable through the history interface with proper filtering and export capabilities.
        
        Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5
        """
        with mock_dynamodb(), mock_s3():
            # Set up test environment
            dynamodb_table = create_test_dynamodb_table()
            s3_bucket = create_test_s3_bucket()
            
            # Store exam records in DynamoDB
            for record in exam_records:
                dynamodb_table.put_item(Item=record)
            
            # Test 1: All exam records should be retrievable
            event = {
                'httpMethod': 'GET',
                'path': '/exam/history',
                'queryStringParameters': {'teacherId': 'all'}  # Query all teachers
            }
            
            response = lambda_handler(event, {})
            assert response['statusCode'] == 200
            
            response_body = json.loads(response['body'])
            retrieved_exams = response_body['exams']
            
            # Verify all records are present and complete
            assert len(retrieved_exams) >= len(exam_records)
            
            for exam in retrieved_exams:
                # Verify required fields are present
                required_fields = ['examId', 'teacherId', 'createdAt', 'status', 'examConfig', 'selectedTopics', 'sourceDocuments']
                for field in required_fields:
                    assert field in exam, f"Required field {field} missing from exam record"
                
                # Verify exam configuration completeness
                config = exam['examConfig']
                config_fields = ['questionCount', 'questionTypes', 'difficulty', 'versions', 'includeSelfAssessment']
                for field in config_fields:
                    assert field in config, f"Required config field {field} missing"
                
                # Verify data types and ranges
                assert isinstance(exam['examConfig']['questionCount'], int)
                assert 1 <= exam['examConfig']['questionCount'] <= 20
                assert 1 <= exam['examConfig']['versions'] <= 4
                assert exam['examConfig']['difficulty'] in ['easy', 'medium', 'hard']
                assert isinstance(exam['selectedTopics'], list)
                assert isinstance(exam['sourceDocuments'], list)
                assert len(exam['selectedTopics']) > 0
                assert len(exam['sourceDocuments']) > 0
            
            # Test 2: Individual exam details should be retrievable
            if retrieved_exams:
                exam_id = retrieved_exams[0]['examId']
                detail_event = {
                    'httpMethod': 'GET',
                    'path': f'/exam/history/{exam_id}',
                    'pathParameters': {'examId': exam_id}
                }
                
                detail_response = lambda_handler(detail_event, {})
                assert detail_response['statusCode'] == 200
                
                detail_body = json.loads(detail_response['body'])
                assert detail_body['examId'] == exam_id
                assert 'examConfig' in detail_body
                assert 'selectedTopics' in detail_body
                assert 'generatedFiles' in detail_body
            
            # Test 3: History filtering should work correctly
            unique_teachers = list(set(record['teacherId'] for record in exam_records))
            if len(unique_teachers) > 1:
                teacher_filter_event = {
                    'httpMethod': 'GET',
                    'path': '/exam/history',
                    'queryStringParameters': {'teacherId': unique_teachers[0]}
                }
                
                filter_response = lambda_handler(teacher_filter_event, {})
                assert filter_response['statusCode'] == 200
                
                filter_body = json.loads(filter_response['body'])
                filtered_exams = filter_body['exams']
                
                # All returned exams should match the filter
                for exam in filtered_exams:
                    assert exam['teacherId'] == unique_teachers[0]
            
            # Test 4: Summary statistics should be accurate
            summary = response_body['summary']
            assert 'totalExams' in summary
            assert 'completedExams' in summary
            assert 'failedExams' in summary
            assert summary['totalExams'] >= 0
            assert summary['completedExams'] >= 0
            assert summary['failedExams'] >= 0
            assert summary['totalExams'] >= summary['completedExams'] + summary['failedExams']

    @given(st.lists(exam_record_strategy(), min_size=5, max_size=50))
    @settings(max_examples=100, deadline=None)
    def test_property_10_administrative_oversight(self, exam_records):
        """
        Feature: exam-generator-module
        Property 10: Administrative Oversight
        
        For any exam generation activity, administrators should be able to access comprehensive 
        reports, audit trails, and performance metrics with proper export capabilities.
        
        Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
        """
        with mock_dynamodb(), mock_s3():
            # Set up test environment
            dynamodb_table = create_test_dynamodb_table()
            s3_bucket = create_test_s3_bucket()
            
            # Store exam records in DynamoDB
            for record in exam_records:
                dynamodb_table.put_item(Item=record)
            
            # Test 1: Administrative access to all teacher data
            admin_event = {
                'httpMethod': 'GET',
                'path': '/exam/history',
                'queryStringParameters': {'teacherId': 'all'}
            }
            
            admin_response = lambda_handler(admin_event, {})
            assert admin_response['statusCode'] == 200
            
            admin_body = json.loads(admin_response['body'])
            all_exams = admin_body['exams']
            
            # Verify comprehensive data access
            unique_teachers = set(exam['teacherId'] for exam in all_exams)
            record_teachers = set(record['teacherId'] for record in exam_records)
            assert len(unique_teachers.intersection(record_teachers)) > 0
            
            # Test 2: Usage statistics and metrics
            summary = admin_body['summary']
            
            # Verify statistical completeness
            assert summary['totalExams'] > 0
            assert isinstance(summary['completedExams'], int)
            assert isinstance(summary['failedExams'], int)
            assert isinstance(summary.get('processingExams', 0), int)
            
            # Verify metrics accuracy
            completed_count = len([e for e in all_exams if e['status'] == 'COMPLETED'])
            failed_count = len([e for e in all_exams if e['status'] == 'FAILED'])
            assert summary['completedExams'] == completed_count
            assert summary['failedExams'] == failed_count
            
            # Test 3: Audit trail completeness
            for exam in all_exams:
                # Verify audit trail fields
                audit_fields = ['examId', 'teacherId', 'createdAt', 'status']
                for field in audit_fields:
                    assert field in exam, f"Audit field {field} missing"
                
                # Verify timestamp format for audit trails
                assert exam['createdAt'].endswith('Z'), "Timestamp should be in ISO format with Z"
                
                # Verify activity traceability
                assert exam['examConfig'] is not None, "Exam configuration should be traceable"
                assert exam['selectedTopics'] is not None, "Selected topics should be traceable"
                assert exam['sourceDocuments'] is not None, "Source documents should be traceable"
            
            # Test 4: Export functionality for compliance reporting
            export_event = {
                'httpMethod': 'POST',
                'path': '/exam/history/export',
                'body': json.dumps({
                    'format': 'csv',
                    'teacherId': 'all',
                    'startDate': None,
                    'endDate': None
                })
            }
            
            with patch('exam_history_handler.s3_client') as mock_s3_client:
                # Mock S3 operations
                mock_s3_client.put_object.return_value = {}
                mock_s3_client.generate_presigned_url.return_value = 'https://test-export-url.com'
                
                export_response = lambda_handler(export_event, {})
                assert export_response['statusCode'] == 200
                
                export_body = json.loads(export_response['body'])
                assert 'exportUrl' in export_body
                assert 'filename' in export_body
                assert 'recordCount' in export_body
                assert export_body['format'] == 'csv'
                assert export_body['recordCount'] > 0
                
                # Verify S3 upload was called for export
                mock_s3_client.put_object.assert_called_once()
                put_call = mock_s3_client.put_object.call_args
                assert 'Body' in put_call.kwargs
                assert 'ContentType' in put_call.kwargs
            
            # Test 5: Performance monitoring data
            # Verify response times are reasonable (under 30 seconds for large datasets)
            import time
            start_time = time.time()
            
            large_query_event = {
                'httpMethod': 'GET',
                'path': '/exam/history',
                'queryStringParameters': {'limit': '100'}
            }
            
            perf_response = lambda_handler(large_query_event, {})
            end_time = time.time()
            
            assert perf_response['statusCode'] == 200
            assert (end_time - start_time) < 30, "Query should complete within reasonable time"
            
            # Test 6: Date range filtering for compliance periods
            if len(exam_records) > 1:
                # Sort records by date
                sorted_records = sorted(exam_records, key=lambda x: x['createdAt'])
                mid_point = len(sorted_records) // 2
                
                start_date = sorted_records[0]['createdAt']
                end_date = sorted_records[mid_point]['createdAt']
                
                date_filter_event = {
                    'httpMethod': 'GET',
                    'path': '/exam/history',
                    'queryStringParameters': {
                        'startDate': start_date,
                        'endDate': end_date,
                        'teacherId': 'all'
                    }
                }
                
                date_response = lambda_handler(date_filter_event, {})
                assert date_response['statusCode'] == 200
                
                date_body = json.loads(date_response['body'])
                filtered_exams = date_body['exams']
                
                # Verify date filtering works correctly
                for exam in filtered_exams:
                    assert start_date <= exam['createdAt'] <= end_date

    @given(api_event_strategy())
    @settings(max_examples=100, deadline=None)
    def test_property_9_error_handling_resilience_history(self, event):
        """
        Feature: exam-generator-module
        Property 9: Error Handling Resilience (History Component)
        
        For any processing failure in history operations, the system should handle errors gracefully,
        provide appropriate user feedback, and continue processing other valid operations.
        
        Validates: Requirements 2.5, 1.4 (applied to history functionality)
        """
        with mock_dynamodb(), mock_s3():
            # Set up test environment
            dynamodb_table = create_test_dynamodb_table()
            s3_bucket = create_test_s3_bucket()
            
            # Test 1: Invalid exam ID handling
            if event['path'].startswith('/exam/history/') and event['httpMethod'] == 'GET':
                # Test with non-existent exam ID
                invalid_event = event.copy()
                invalid_event['pathParameters'] = {'examId': 'non-existent-exam-id'}
                
                response = lambda_handler(invalid_event, {})
                assert response['statusCode'] == 404
                
                error_body = json.loads(response['body'])
                assert 'error' in error_body
                assert error_body['error']['code'] == 'EXAM_NOT_FOUND'
            
            # Test 2: Invalid query parameters handling
            if event['path'] == '/exam/history' and event['httpMethod'] == 'GET':
                # Test with invalid limit parameter
                invalid_event = event.copy()
                invalid_event['queryStringParameters'] = {'limit': 'invalid-number'}
                
                # Should handle gracefully and use default
                response = lambda_handler(invalid_event, {})
                # Should either succeed with default or return appropriate error
                assert response['statusCode'] in [200, 400]
            
            # Test 3: Malformed export request handling
            if event['path'] == '/exam/history/export' and event['httpMethod'] == 'POST':
                # Test with invalid JSON body
                invalid_event = event.copy()
                invalid_event['body'] = 'invalid-json'
                
                response = lambda_handler(invalid_event, {})
                assert response['statusCode'] == 400
                
                error_body = json.loads(response['body'])
                assert 'error' in error_body
                assert error_body['error']['code'] == 'INVALID_JSON'
            
            # Test 4: Unsupported method handling
            unsupported_event = event.copy()
            unsupported_event['httpMethod'] = 'DELETE'
            
            response = lambda_handler(unsupported_event, {})
            assert response['statusCode'] == 405
            
            error_body = json.loads(response['body'])
            assert 'error' in error_body
            assert error_body['error']['code'] == 'METHOD_NOT_ALLOWED'
            
            # Test 5: CORS headers are always present
            assert 'headers' in response
            headers = response['headers']
            assert 'Access-Control-Allow-Origin' in headers
            assert 'Access-Control-Allow-Methods' in headers
            assert 'Content-Type' in headers

# Unit tests for specific functionality

class TestExamHistoryUnit:
    """Unit tests for specific exam history functionality"""

    def test_csv_export_generation(self):
        """Test CSV export generation with sample data"""
        sample_items = [
            {
                'analysisId': 'exam-test-1',
                'teacherId': 'admin',
                'createdAt': '2025-12-13T10:00:00Z',
                'status': 'COMPLETED',
                'examConfig': {
                    'questionCount': 10,
                    'questionTypes': ['multiple_choice'],
                    'difficulty': 'medium',
                    'versions': 2,
                    'includeSelfAssessment': True
                },
                'selectedTopics': ['Topic 1', 'Topic 2'],
                'sourceDocuments': ['doc1.pdf', 'doc2.pdf'],
                'generatedFiles': [{'type': 'student'}, {'type': 'teacher'}]
            }
        ]
        
        csv_content = generate_csv_export(sample_items)
        assert isinstance(csv_content, bytes)
        
        # Parse CSV to verify structure
        csv_text = csv_content.decode('utf-8')
        lines = csv_text.strip().split('\n')
        assert len(lines) == 2  # Header + 1 data row
        
        # Verify header
        header = lines[0]
        expected_fields = ['Exam ID', 'Teacher ID', 'Created At', 'Status']
        for field in expected_fields:
            assert field in header

    def test_cors_headers(self):
        """Test CORS headers are properly set"""
        headers = get_cors_headers()
        
        required_headers = [
            'Content-Type',
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'Access-Control-Allow-Headers'
        ]
        
        for header in required_headers:
            assert header in headers
        
        assert headers['Access-Control-Allow-Origin'] == '*'
        assert 'GET' in headers['Access-Control-Allow-Methods']
        assert 'POST' in headers['Access-Control-Allow-Methods']

    def test_error_response_format(self):
        """Test error response format consistency"""
        response = create_error_response(400, 'TEST_ERROR', 'Test message')
        
        assert response['statusCode'] == 400
        assert 'headers' in response
        assert 'body' in response
        
        body = json.loads(response['body'])
        assert 'error' in body
        assert body['error']['code'] == 'TEST_ERROR'
        assert body['error']['message'] == 'Test message'

if __name__ == '__main__':
    pytest.main([__file__, '-v'])