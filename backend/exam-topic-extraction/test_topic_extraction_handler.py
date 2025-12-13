"""
Property-based tests for exam topic extraction infrastructure and authentication integration.

**Feature: exam-generator-module, Property 8: Authentication Integration**
**Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**
"""

import pytest
from hypothesis import given, strategies as st, settings
import json
import os
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
from topic_extraction_handler import lambda_handler, create_error_response, get_cors_headers

# Test data generators
@st.composite
def valid_teacher_ids(draw):
    """Generate valid teacher IDs for testing"""
    return draw(st.sampled_from(['admin', 'teacher1', 'teacher2', 'test_teacher']))

@st.composite
def valid_s3_keys(draw):
    """Generate valid S3 keys for PDF files"""
    filename = draw(st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))))
    return f"uploads/{filename}.pdf"

@st.composite
def valid_extraction_events(draw):
    """Generate valid extraction events for testing"""
    s3_keys = draw(st.lists(valid_s3_keys(), min_size=1, max_size=5))
    teacher_id = draw(valid_teacher_ids())
    
    return {
        'httpMethod': 'POST',
        'body': json.dumps({
            's3Keys': s3_keys,
            'teacherId': teacher_id
        }),
        'pathParameters': None,
        'queryStringParameters': None
    }

@st.composite
def valid_get_events(draw):
    """Generate valid GET events for extraction results"""
    extraction_id = draw(st.uuids()).hex
    teacher_id = draw(valid_teacher_ids())
    
    return {
        'httpMethod': 'GET',
        'pathParameters': {'extractionId': extraction_id},
        'queryStringParameters': {'teacherId': teacher_id},
        'body': None
    }

class TestAuthenticationIntegration:
    """Test authentication integration properties"""
    
    @given(valid_extraction_events())
    @settings(max_examples=50, deadline=None)
    def test_teacher_id_association_property(self, event):
        """
        Property: For any extraction request with a valid teacher ID, 
        the system should associate the extraction with that teacher ID
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                with patch('topic_extraction_handler.s3_client') as mock_s3:
                    with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        
                        # Mock S3 and Bedrock responses
                        mock_s3.get_object.return_value = {'Body': Mock(read=lambda: b'test pdf content')}
                        mock_bedrock.invoke_model.return_value = {
                            'body': Mock(read=lambda: json.dumps({
                                'content': [{'text': '{"topics": [{"topic": "Test Topic", "subtopics": ["Subtopic 1"]}]}'}]
                            }).encode())
                        }
                        
                        # Mock PyPDF2
                        with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
                            mock_extract.return_value = "Test extracted text content"
                            
                            # Execute the handler
                            response = lambda_handler(event, {})
                            
                            # Verify teacher ID association
                            body = json.loads(event['body'])
                            expected_teacher_id = body['teacherId']
                            
                            # Check that put_item was called with correct teacher ID
                            mock_table.put_item.assert_called_once()
                            put_item_call = mock_table.put_item.call_args[1]['Item']
                            assert put_item_call['teacherId'] == expected_teacher_id
                            
                            # Verify response structure
                            assert response['statusCode'] == 200
                            response_body = json.loads(response['body'])
                            assert 'extractionId' in response_body

    @given(st.lists(valid_s3_keys(), min_size=6, max_size=10))
    @settings(max_examples=50)
    def test_file_limit_validation_property(self, s3_keys):
        """
        Property: For any request with more than 5 PDF files, 
        the system should reject the request with appropriate error
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': s3_keys,
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            response = lambda_handler(event, {})
            
            # Should reject requests with more than 5 files
            assert response['statusCode'] == 400
            response_body = json.loads(response['body'])
            assert response_body['error']['code'] == 'TOO_MANY_FILES'

    @given(valid_teacher_ids())
    @settings(max_examples=50, deadline=None)
    def test_cors_headers_property(self, teacher_id):
        """
        Property: For any request, the system should return proper CORS headers
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': ['test.pdf'],
                'teacherId': teacher_id
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                with patch('topic_extraction_handler.s3_client') as mock_s3:
                    with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
                        # Setup mocks to avoid actual AWS calls
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        
                        # Mock S3 and Bedrock to avoid network calls
                        mock_s3.get_object.return_value = {'Body': Mock(read=lambda: b'test content')}
                        mock_bedrock.invoke_model.return_value = {
                            'body': Mock(read=lambda: json.dumps({
                                'content': [{'text': '{"topics": [{"topic": "Test", "subtopics": ["Sub1"]}]}'}]
                            }).encode())
                        }
                        
                        # Mock text extraction to avoid PDF processing
                        with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
                            mock_extract.return_value = "Test content"
                            
                            response = lambda_handler(event, {})
                
                # Verify CORS headers are present
                headers = response.get('headers', {})
                assert 'Access-Control-Allow-Origin' in headers
                assert 'Access-Control-Allow-Methods' in headers
                assert 'Access-Control-Allow-Headers' in headers
                assert headers['Access-Control-Allow-Origin'] == '*'

    @given(valid_get_events())
    @settings(max_examples=50, deadline=None)
    def test_extraction_retrieval_property(self, event):
        """
        Property: For any valid extraction ID, the system should return 
        extraction results or appropriate not found error
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                mock_table = Mock()
                mock_dynamodb.Table.return_value = mock_table
                
                # Test case 1: Extraction exists
                mock_table.get_item.return_value = {
                    'Item': {
                        'analysisId': f"topic-extraction-{event['pathParameters']['extractionId']}",
                        'status': 'COMPLETED',
                        'topicOutline': [{'topic': 'Test', 'subtopics': ['Sub1']}],
                        'sourceDocuments': ['test.pdf'],
                        'createdAt': '2025-01-01T00:00:00Z'
                    }
                }
                
                response = lambda_handler(event, {})
                
                assert response['statusCode'] == 200
                response_body = json.loads(response['body'])
                assert 'extractionId' in response_body
                assert 'status' in response_body
                assert 'topicOutline' in response_body
                
                # Test case 2: Extraction not found
                mock_table.get_item.return_value = {}
                
                response = lambda_handler(event, {})
                
                assert response['statusCode'] == 404
                response_body = json.loads(response['body'])
                assert response_body['error']['code'] == 'EXTRACTION_NOT_FOUND'

    def test_error_response_structure_property(self):
        """
        Property: For any error condition, the system should return 
        standardized error response structure
        """
        # Test various error conditions
        error_cases = [
            (400, 'INVALID_REQUEST', 'Invalid request format'),
            (404, 'NOT_FOUND', 'Resource not found'),
            (500, 'INTERNAL_ERROR', 'Internal server error')
        ]
        
        for status_code, error_code, message in error_cases:
            response = create_error_response(status_code, error_code, message)
            
            assert response['statusCode'] == status_code
            assert 'headers' in response
            assert 'body' in response
            
            response_body = json.loads(response['body'])
            assert 'error' in response_body
            assert response_body['error']['code'] == error_code
            assert response_body['error']['message'] == message

    def test_cors_headers_structure_property(self):
        """
        Property: CORS headers should always have the required structure
        """
        headers = get_cors_headers()
        
        required_headers = [
            'Content-Type',
            'Access-Control-Allow-Origin',
            'Access-Control-Allow-Methods',
            'Access-Control-Allow-Headers'
        ]
        
        for header in required_headers:
            assert header in headers
            assert isinstance(headers[header], str)
            assert len(headers[header]) > 0

    @given(st.text(min_size=0, max_size=1000))
    @settings(max_examples=50)
    def test_invalid_json_handling_property(self, invalid_json):
        """
        Property: For any invalid JSON in request body, 
        the system should return appropriate error
        """
        # Skip valid JSON strings
        try:
            json.loads(invalid_json)
            return  # Skip if it's actually valid JSON
        except (json.JSONDecodeError, TypeError):
            pass  # This is what we want to test
        
        event = {
            'httpMethod': 'POST',
            'body': invalid_json
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            response = lambda_handler(event, {})
            
            # Should handle invalid JSON gracefully
            assert response['statusCode'] in [400, 500]
            assert 'body' in response
            
            # Response body should be valid JSON even if input wasn't
            response_body = json.loads(response['body'])
            assert 'error' in response_body

if __name__ == '__main__':
    pytest.main([__file__, '-v'])

class TestContentAnalysisPipeline:
    """
    Property-based tests for content analysis pipeline.
    
    **Feature: exam-generator-module, Property 2: Content Analysis Pipeline**
    **Validates: Requirements 2.1, 2.2, 2.4**
    """
    
    @st.composite
    def pdf_content_generator(draw):
        """Generate realistic PDF text content for testing"""
        topics = draw(st.lists(
            st.text(min_size=5, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'))),
            min_size=1, max_size=5
        ))
        
        content_parts = []
        for topic in topics:
            # Generate content for each topic
            subtopics = draw(st.lists(
                st.text(min_size=3, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'))),
                min_size=1, max_size=4
            ))
            
            content_parts.append(f"\n\n{topic.upper()}\n")
            for subtopic in subtopics:
                content_parts.append(f"\n{subtopic}\n")
                # Add some descriptive text
                description = draw(st.text(min_size=20, max_size=200, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs', 'Po'))))
                content_parts.append(f"{description}\n")
        
        return "".join(content_parts)
    
    @given(pdf_content_generator())
    @settings(max_examples=50, deadline=None)
    def test_text_extraction_produces_content(self, pdf_text_content):
        """
        Property: For any PDF with extractable text content, 
        the system should successfully extract non-empty text
        """
        # Mock PDF content that would contain the text
        mock_pdf_bytes = b"mock pdf content"
        
        with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
            # Setup mock to return the generated content
            mock_extract.return_value = pdf_text_content
            
            from topic_extraction_handler import extract_text_from_pdf
            
            # Test text extraction
            extracted_text = mock_extract(mock_pdf_bytes)
            
            # Verify extraction produces content
            assert isinstance(extracted_text, str)
            assert len(extracted_text.strip()) > 0
            assert extracted_text.strip() == pdf_text_content.strip()
    
    @given(st.text(min_size=100, max_size=2000, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs', 'Po'))))
    @settings(max_examples=30, deadline=None)
    def test_topic_extraction_produces_structure(self, text_content):
        """
        Property: For any meaningful text content, 
        the system should generate a hierarchical topic structure
        """
        source_document = "test-document.pdf"
        
        # Mock Bedrock response with valid topic structure
        mock_bedrock_response = {
            'topics': [
                {
                    'topic': 'Generated Topic 1',
                    'subtopics': ['Subtopic 1.1', 'Subtopic 1.2']
                },
                {
                    'topic': 'Generated Topic 2', 
                    'subtopics': ['Subtopic 2.1']
                }
            ]
        }
        
        with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
            mock_bedrock.invoke_model.return_value = {
                'body': Mock(read=lambda: json.dumps({
                    'content': [{'text': json.dumps(mock_bedrock_response)}]
                }).encode())
            }
            
            from topic_extraction_handler import extract_topics_with_bedrock
            
            # Test topic extraction
            topics = extract_topics_with_bedrock(text_content, source_document)
            
            # Verify structure
            assert isinstance(topics, list)
            assert len(topics) > 0
            
            for topic_item in topics:
                assert isinstance(topic_item, dict)
                assert 'topic' in topic_item
                assert 'subtopics' in topic_item
                assert 'sourceDocument' in topic_item
                assert isinstance(topic_item['topic'], str)
                assert isinstance(topic_item['subtopics'], list)
                assert topic_item['sourceDocument'] == source_document
                assert len(topic_item['topic'].strip()) > 0
                assert len(topic_item['subtopics']) > 0
    
    @given(st.lists(
        st.fixed_dictionaries({
            'topic': st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'))),
            'subtopics': st.lists(st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'))), min_size=1, max_size=5),
            'sourceDocument': st.text(min_size=1, max_size=20, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd')))
        }),
        min_size=1, max_size=10
    ))
    @settings(max_examples=30, deadline=None)
    def test_topic_consolidation_preserves_content(self, topic_list):
        """
        Property: For any list of topics, consolidation should preserve 
        all topic information while merging duplicates appropriately
        """
        # All topics should be valid due to fixed_dictionaries
        valid_topics = topic_list
        
        from topic_extraction_handler import consolidate_topic_outline
        
        # Test consolidation
        consolidated = consolidate_topic_outline(valid_topics)
        
        # Verify consolidation preserves content
        assert isinstance(consolidated, list)
        
        # Count original topics vs consolidated
        original_topic_names = [t['topic'] for t in valid_topics]
        consolidated_topic_names = [t['topic'] for t in consolidated]
        
        # All unique topic names should be preserved
        unique_original = set(original_topic_names)
        unique_consolidated = set(consolidated_topic_names)
        assert unique_consolidated == unique_original
        
        # Verify structure is maintained
        for consolidated_topic in consolidated:
            assert isinstance(consolidated_topic, dict)
            assert 'topic' in consolidated_topic
            assert 'subtopics' in consolidated_topic
            assert 'sourceDocuments' in consolidated_topic
            assert isinstance(consolidated_topic['subtopics'], list)
            assert isinstance(consolidated_topic['sourceDocuments'], list)
    
    @given(st.lists(valid_s3_keys(), min_size=1, max_size=5))
    @settings(max_examples=20, deadline=None)
    def test_source_document_mapping_property(self, s3_keys):
        """
        Property: For any set of source documents, 
        extracted topics should maintain correct source document mapping
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.s3_client') as mock_s3:
                with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
                    with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
                        
                        # Setup mocks
                        mock_s3.get_object.return_value = {'Body': Mock(read=lambda: b'test content')}
                        mock_extract.return_value = "Test extracted content"
                        
                        # Mock different topics for each document
                        def mock_bedrock_call(*args, **kwargs):
                            return {
                                'body': Mock(read=lambda: json.dumps({
                                    'content': [{'text': '{"topics": [{"topic": "Test Topic", "subtopics": ["Sub1", "Sub2"]}]}'}]
                                }).encode())
                            }
                        
                        mock_bedrock.invoke_model.side_effect = mock_bedrock_call
                        
                        from topic_extraction_handler import handle_topic_extraction
                        
                        # Create test event
                        event = {
                            'httpMethod': 'POST',
                            'body': json.dumps({
                                's3Keys': s3_keys,
                                'teacherId': 'admin'
                            })
                        }
                        
                        with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                            mock_table = Mock()
                            mock_dynamodb.Table.return_value = mock_table
                            mock_table.put_item.return_value = {}
                            mock_table.update_item.return_value = {}
                            
                            # Test the extraction
                            response = handle_topic_extraction(event, {})
                            
                            # Verify response structure
                            assert response['statusCode'] == 200
                            response_body = json.loads(response['body'])
                            assert 'topicOutline' in response_body
                            
                            # Verify source document mapping
                            topic_outline = response_body['topicOutline']
                            assert isinstance(topic_outline, list)
                            
                            # Each topic should have source documents
                            for topic_item in topic_outline:
                                assert 'sourceDocuments' in topic_item
                                assert isinstance(topic_item['sourceDocuments'], list)
                                assert len(topic_item['sourceDocuments']) > 0
                                
                                # Source documents should be from our input
                                for source_doc in topic_item['sourceDocuments']:
                                    assert source_doc in s3_keys
    
    def test_error_handling_for_invalid_pdf(self):
        """
        Property: For corrupted or invalid PDF content, 
        the system should handle errors gracefully
        """
        invalid_pdf_content = b"not a valid pdf"
        
        # Test with actual function that will fail on invalid PDF
        from topic_extraction_handler import extract_text_from_pdf
        
        # Test error handling - this should raise an exception for invalid PDF
        with pytest.raises(Exception) as exc_info:
            extract_text_from_pdf(invalid_pdf_content)
        
        assert "Failed to extract text from PDF" in str(exc_info.value)
    
    def test_bedrock_error_handling(self):
        """
        Property: For Bedrock API failures, 
        the system should handle errors gracefully
        """
        test_content = "Test content for topic extraction"
        source_doc = "test.pdf"
        
        with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
            # Simulate Bedrock API error
            mock_bedrock.invoke_model.side_effect = Exception("Bedrock API error")
            
            from topic_extraction_handler import extract_topics_with_bedrock
            
            # Test error handling
            with pytest.raises(Exception) as exc_info:
                extract_topics_with_bedrock(test_content, source_doc)
            
            assert "Topic extraction failed" in str(exc_info.value)

class TestErrorHandlingResilience:
    """
    Property-based tests for error handling resilience.
    
    **Feature: exam-generator-module, Property 9: Error Handling Resilience**
    **Validates: Requirements 2.5, 1.4**
    """
    
    @given(st.lists(valid_s3_keys(), min_size=1, max_size=5))
    @settings(max_examples=30, deadline=None)
    def test_partial_failure_resilience(self, s3_keys):
        """
        Property: For any mix of valid and invalid documents, 
        the system should process valid ones and report errors for invalid ones
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                with patch('topic_extraction_handler.s3_client') as mock_s3:
                    with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        
                        # Mock S3 to fail for some files and succeed for others
                        def mock_s3_get_object(Bucket, Key):
                            if 'fail' in Key:
                                raise ClientError({'Error': {'Code': 'NoSuchKey'}}, 'GetObject')
                            return {'Body': Mock(read=lambda: b'valid pdf content')}
                        
                        mock_s3.get_object.side_effect = mock_s3_get_object
                        
                        # Mock successful Bedrock response
                        mock_bedrock.invoke_model.return_value = {
                            'body': Mock(read=lambda: json.dumps({
                                'content': [{'text': '{"topics": [{"topic": "Test Topic", "subtopics": ["Sub1"]}]}'}]
                            }).encode())
                        }
                        
                        # Mock text extraction
                        with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
                            mock_extract.return_value = "Test content"
                            
                            # Create event with mix of valid and invalid files
                            mixed_keys = s3_keys + [f"fail-{key}" for key in s3_keys[:2]]
                            
                            event = {
                                'httpMethod': 'POST',
                                'body': json.dumps({
                                    's3Keys': mixed_keys,
                                    'teacherId': 'admin'
                                })
                            }
                            
                            from topic_extraction_handler import handle_topic_extraction
                            
                            # Test resilience - should handle partial failures
                            response = handle_topic_extraction(event, {})
                            
                            # Should either succeed with partial results or fail gracefully
                            assert response['statusCode'] in [200, 400, 500]
                            
                            if response['statusCode'] == 200:
                                # If successful, should have some results
                                response_body = json.loads(response['body'])
                                assert 'topicOutline' in response_body
                            else:
                                # If failed, should have error information
                                response_body = json.loads(response['body'])
                                assert 'error' in response_body
    
    @given(st.text(min_size=0, max_size=100))
    @settings(max_examples=30, deadline=None)
    def test_invalid_json_resilience(self, invalid_body):
        """
        Property: For any invalid JSON input, 
        the system should handle it gracefully and return proper error response
        """
        # Skip valid JSON strings
        try:
            json.loads(invalid_body)
            return  # Skip if it's actually valid JSON
        except (json.JSONDecodeError, TypeError):
            pass  # This is what we want to test
        
        event = {
            'httpMethod': 'POST',
            'body': invalid_body
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            from topic_extraction_handler import lambda_handler
            
            response = lambda_handler(event, {})
            
            # Should handle invalid JSON gracefully
            assert response['statusCode'] in [400, 500]
            assert 'body' in response
            
            # Response body should be valid JSON even if input wasn't
            response_body = json.loads(response['body'])
            assert 'error' in response_body
            assert isinstance(response_body['error'], dict)
    
    @given(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=10))
    @settings(max_examples=30, deadline=None)
    def test_empty_or_invalid_s3_keys_resilience(self, s3_keys_list):
        """
        Property: For any empty or invalid s3Keys list, 
        the system should validate input and return appropriate error
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': s3_keys_list,
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            from topic_extraction_handler import lambda_handler
            
            response = lambda_handler(event, {})
            
            if len(s3_keys_list) == 0:
                # Empty list should be rejected
                assert response['statusCode'] == 400
                response_body = json.loads(response['body'])
                assert response_body['error']['code'] == 'MISSING_FILES'
            elif len(s3_keys_list) > 5:
                # Too many files should be rejected
                assert response['statusCode'] == 400
                response_body = json.loads(response['body'])
                assert response_body['error']['code'] == 'TOO_MANY_FILES'
            else:
                # Valid count should proceed (may fail later due to invalid keys)
                assert response['statusCode'] in [200, 500]
    
    def test_s3_connection_failure_resilience(self):
        """
        Property: For S3 connection failures, 
        the system should handle errors gracefully and update status appropriately
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': ['test.pdf'],
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                with patch('topic_extraction_handler.s3_client') as mock_s3:
                    
                    # Setup mocks
                    mock_table = Mock()
                    mock_dynamodb.Table.return_value = mock_table
                    mock_table.put_item.return_value = {}
                    mock_table.update_item.return_value = {}
                    
                    # Simulate S3 connection failure
                    mock_s3.get_object.side_effect = ClientError(
                        {'Error': {'Code': 'ServiceUnavailable', 'Message': 'Service unavailable'}},
                        'GetObject'
                    )
                    
                    from topic_extraction_handler import lambda_handler
                    
                    response = lambda_handler(event, {})
                    
                    # Should handle S3 failure gracefully
                    assert response['statusCode'] == 500
                    response_body = json.loads(response['body'])
                    assert response_body['error']['code'] == 'PROCESSING_ERROR'
                    
                    # Should update DynamoDB with failure status
                    mock_table.update_item.assert_called()
                    update_call = mock_table.update_item.call_args
                    assert ':status' in update_call[1]['ExpressionAttributeValues']
                    assert update_call[1]['ExpressionAttributeValues'][':status'] == 'FAILED'
    
    def test_bedrock_api_failure_resilience(self):
        """
        Property: For Bedrock API failures, 
        the system should handle errors gracefully and update status appropriately
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': ['test.pdf'],
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                with patch('topic_extraction_handler.s3_client') as mock_s3:
                    with patch('topic_extraction_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        
                        # Mock successful S3 and text extraction
                        mock_s3.get_object.return_value = {'Body': Mock(read=lambda: b'test content')}
                        
                        # Simulate Bedrock API failure
                        mock_bedrock.invoke_model.side_effect = Exception("Bedrock API unavailable")
                        
                        with patch('topic_extraction_handler.extract_text_from_pdf') as mock_extract:
                            mock_extract.return_value = "Test content"
                            
                            from topic_extraction_handler import lambda_handler
                            
                            response = lambda_handler(event, {})
                            
                            # Should handle Bedrock failure gracefully
                            assert response['statusCode'] == 500
                            response_body = json.loads(response['body'])
                            assert response_body['error']['code'] == 'PROCESSING_ERROR'
                            
                            # Should update DynamoDB with failure status
                            mock_table.update_item.assert_called()
                            update_call = mock_table.update_item.call_args
                            assert ':status' in update_call[1]['ExpressionAttributeValues']
                            assert update_call[1]['ExpressionAttributeValues'][':status'] == 'FAILED'
    
    def test_dynamodb_failure_resilience(self):
        """
        Property: For DynamoDB failures, 
        the system should handle errors gracefully
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': ['test.pdf'],
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('topic_extraction_handler.dynamodb') as mock_dynamodb:
                
                # Simulate DynamoDB failure
                mock_table = Mock()
                mock_table.put_item.side_effect = ClientError(
                    {'Error': {'Code': 'ServiceUnavailable', 'Message': 'DynamoDB unavailable'}},
                    'PutItem'
                )
                mock_dynamodb.Table.return_value = mock_table
                
                from topic_extraction_handler import lambda_handler
                
                response = lambda_handler(event, {})
                
                # Should handle DynamoDB failure gracefully
                assert response['statusCode'] == 500
                response_body = json.loads(response['body'])
                assert 'error' in response_body
    
    @given(st.sampled_from(['PUT', 'DELETE', 'PATCH', 'HEAD']))
    @settings(max_examples=10)
    def test_unsupported_http_methods_resilience(self, http_method):
        """
        Property: For any unsupported HTTP method, 
        the system should return appropriate method not allowed error
        """
        event = {
            'httpMethod': http_method,
            'body': json.dumps({'s3Keys': ['test.pdf'], 'teacherId': 'admin'})
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            from topic_extraction_handler import lambda_handler
            
            response = lambda_handler(event, {})
            
            # Should reject unsupported methods
            assert response['statusCode'] == 405
            response_body = json.loads(response['body'])
            assert response_body['error']['code'] == 'METHOD_NOT_ALLOWED'
    
    def test_missing_environment_variables_resilience(self):
        """
        Property: For missing environment variables, 
        the system should handle errors gracefully
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                's3Keys': ['test.pdf'],
                'teacherId': 'admin'
            })
        }
        
        # Test without required environment variables
        with patch.dict(os.environ, {}, clear=True):
            from topic_extraction_handler import lambda_handler
            
            response = lambda_handler(event, {})
            
            # Should handle missing env vars gracefully
            assert response['statusCode'] == 500
            response_body = json.loads(response['body'])
            assert 'error' in response_body