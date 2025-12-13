#!/usr/bin/env python3
"""
Test script for enhanced download and export functionality
"""

import json
import os
from unittest.mock import Mock, patch, MagicMock
import pytest

# Import the handler functions
from exam_history_handler import (
    handle_file_download,
    handle_export_history,
    generate_csv_export,
    generate_excel_export
)

def test_enhanced_file_download():
    """Test the enhanced file download functionality"""
    
    # Mock S3 client
    with patch('exam_history_handler.s3_client') as mock_s3:
        # Setup mock responses
        mock_s3.generate_presigned_url.return_value = "https://example.com/download/test-file.pdf"
        from datetime import datetime
        mock_s3.head_object.return_value = {
            'ContentLength': 1024000,
            'ContentType': 'application/pdf',
            'LastModified': datetime(2024, 1, 1, 0, 0, 0)
        }
        
        # Mock environment variables
        with patch.dict(os.environ, {'UPLOAD_BUCKET': 'test-bucket'}):
            # Test event
            event = {
                'pathParameters': {'fileId': 'exams/test-exam/student-v1.pdf'},
                'queryStringParameters': {'format': 'pdf', 'inline': 'false'}
            }
            
            # Call the function
            response = handle_file_download(event, {})
            
            # Verify response
            assert response['statusCode'] == 200
            
            body = json.loads(response['body'])
            assert 'downloadUrl' in body
            assert body['fileId'] == 'exams/test-exam/student-v1.pdf'
            assert body['format'] == 'pdf'
            assert body['expiresIn'] == 3600
            assert 'metadata' in body

def test_enhanced_csv_export():
    """Test the enhanced CSV export functionality"""
    
    # Sample exam data
    exam_items = [
        {
            'analysisId': 'exam-123',
            'teacherId': 'teacher1',
            'createdAt': '2024-01-01T10:00:00Z',
            'status': 'COMPLETED',
            'examConfig': {
                'questionCount': 10,
                'questionTypes': ['multiple_choice', 'essay'],
                'difficulty': 'medium',
                'versions': 2,
                'includeSelfAssessment': True
            },
            'selectedTopics': ['Math', 'Algebra'],
            'sourceDocuments': ['doc1.pdf', 'doc2.pdf'],
            'generatedFiles': [
                {'type': 'student_version', 'version': 1, 'format': 'PDF'},
                {'type': 'teacher_version', 'version': 1, 'format': 'PDF'}
            ]
        }
    ]
    
    # Generate CSV
    csv_content = generate_csv_export(exam_items)
    
    # Verify CSV content
    assert isinstance(csv_content, bytes)
    csv_text = csv_content.decode('utf-8')
    
    # Check headers
    assert 'Exam ID' in csv_text
    assert 'Teacher ID' in csv_text
    assert 'Status' in csv_text
    
    # Check data
    assert '123' in csv_text  # Exam ID without 'exam-' prefix
    assert 'teacher1' in csv_text
    assert 'COMPLETED' in csv_text
    assert 'multiple_choice, essay' in csv_text

def test_enhanced_excel_export():
    """Test the enhanced Excel export functionality"""
    
    # Sample exam data
    exam_items = [
        {
            'analysisId': 'exam-456',
            'teacherId': 'teacher2',
            'createdAt': '2024-01-02T15:30:00Z',
            'status': 'COMPLETED',
            'examConfig': {
                'questionCount': 15,
                'questionTypes': ['true_false'],
                'difficulty': 'easy',
                'versions': 1,
                'includeSelfAssessment': False
            },
            'selectedTopics': ['Science', 'Physics'],
            'sourceDocuments': ['physics.pdf'],
            'generatedFiles': [
                {'type': 'student_version', 'version': 1, 'format': 'PDF'}
            ]
        }
    ]
    
    # Generate Excel export
    excel_content = generate_excel_export(exam_items)
    
    # Verify Excel content
    assert isinstance(excel_content, bytes)
    excel_text = excel_content.decode('utf-8')
    
    # Check enhanced features
    assert 'Exam Generation History Report' in excel_text
    assert 'Generated on:' in excel_text
    assert 'Total Records:,1' in excel_text  # CSV format uses comma separator
    assert 'Summary Statistics:' in excel_text
    assert 'Success Rate:' in excel_text

def test_export_history_with_formats():
    """Test the export history function with different formats"""
    
    # Mock DynamoDB
    with patch('exam_history_handler.dynamodb') as mock_dynamodb:
        # Mock S3 client
        with patch('exam_history_handler.s3_client') as mock_s3:
            # Setup mocks
            mock_table = Mock()
            mock_table.query.return_value = {'Items': []}
            mock_dynamodb.Table.return_value = mock_table
            
            mock_s3.put_object.return_value = {}
            mock_s3.generate_presigned_url.return_value = "https://example.com/export.csv"
            
            # Mock environment variables
            with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
                # Test CSV export
                event_csv = {
                    'body': json.dumps({
                        'format': 'csv',
                        'teacherId': 'all',
                        'startDate': '2024-01-01',
                        'endDate': '2024-01-31'
                    })
                }
                
                response_csv = handle_export_history(event_csv, {})
                assert response_csv['statusCode'] == 200
                
                body_csv = json.loads(response_csv['body'])
                assert body_csv['format'] == 'csv'
                assert 'exportUrl' in body_csv
                
                # Test Excel export
                event_excel = {
                    'body': json.dumps({
                        'format': 'excel',
                        'teacherId': 'teacher1'
                    })
                }
                
                response_excel = handle_export_history(event_excel, {})
                assert response_excel['statusCode'] == 200
                
                body_excel = json.loads(response_excel['body'])
                assert body_excel['format'] == 'excel'

if __name__ == '__main__':
    # Run the tests
    test_enhanced_file_download()
    test_enhanced_csv_export()
    test_enhanced_excel_export()
    test_export_history_with_formats()
    print("All download functionality tests passed!")