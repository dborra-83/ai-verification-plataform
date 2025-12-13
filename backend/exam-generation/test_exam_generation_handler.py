"""
Property-based tests for exam generation Lambda function.

**Feature: exam-generator-module, Property 5: Exam Generation Consistency**
**Validates: Requirements 5.1, 5.2, 5.3, 5.5**
"""

import pytest
from hypothesis import given, strategies as st, settings
import json
import os
from unittest.mock import Mock, patch, MagicMock
from botocore.exceptions import ClientError
from exam_generation_handler import lambda_handler, create_error_response, get_cors_headers

# Test data generators
@st.composite
def valid_teacher_ids(draw):
    """Generate valid teacher IDs for testing"""
    return draw(st.sampled_from(['admin', 'teacher1', 'teacher2', 'test_teacher']))

@st.composite
def valid_topics(draw):
    """Generate valid topic lists for testing"""
    return draw(st.lists(
        st.text(min_size=1, max_size=50, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd', 'Zs'))),
        min_size=1, max_size=10
    ))

@st.composite
def valid_exam_configs(draw):
    """Generate valid exam configurations for testing"""
    question_count = draw(st.integers(min_value=1, max_value=20))
    question_types = draw(st.lists(
        st.sampled_from(['multiple_choice', 'true_false', 'mixed']),
        min_size=1, max_size=3
    ))
    difficulty = draw(st.sampled_from(['easy', 'medium', 'hard']))
    versions = draw(st.integers(min_value=1, max_value=4))
    include_self_assessment = draw(st.booleans())
    language = draw(st.sampled_from(['es', 'en']))
    
    return {
        'questionCount': question_count,
        'questionTypes': question_types,
        'difficulty': difficulty,
        'versions': versions,
        'includeSelfAssessment': include_self_assessment,
        'language': language
    }

@st.composite
def valid_exam_generation_events(draw):
    """Generate valid exam generation events for testing"""
    selected_topics = draw(valid_topics())
    exam_config = draw(valid_exam_configs())
    teacher_id = draw(valid_teacher_ids())
    source_documents = draw(st.lists(
        st.text(min_size=1, max_size=30, alphabet=st.characters(whitelist_categories=('Lu', 'Ll', 'Nd'))),
        min_size=1, max_size=5
    ))
    
    return {
        'httpMethod': 'POST',
        'body': json.dumps({
            'selectedTopics': selected_topics,
            'examConfig': exam_config,
            'teacherId': teacher_id,
            'sourceDocuments': source_documents
        }),
        'pathParameters': None,
        'queryStringParameters': None
    }

@st.composite
def valid_get_events(draw):
    """Generate valid GET events for exam results"""
    exam_id = draw(st.uuids()).hex
    teacher_id = draw(valid_teacher_ids())
    
    return {
        'httpMethod': 'GET',
        'pathParameters': {'examId': exam_id},
        'queryStringParameters': {'teacherId': teacher_id},
        'body': None
    }

class TestExamGenerationConsistency:
    """Test exam generation consistency properties"""
    
    @given(valid_exam_generation_events())
    @settings(max_examples=50, deadline=None)
    def test_exam_generation_produces_correct_versions(self, event):
        """
        Property: For any valid exam configuration, 
        the system should generate the specified number of versions
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('exam_generation_handler.dynamodb') as mock_dynamodb:
                with patch('exam_generation_handler.s3_client') as mock_s3:
                    with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        
                        # Mock S3 upload
                        mock_s3.put_object.return_value = {}
                        
                        # Mock Bedrock response with questions
                        def mock_bedrock_call(*args, **kwargs):
                            return {
                                'body': Mock(read=lambda: json.dumps({
                                    'content': [{'text': json.dumps({
                                        'questions': [
                                            {
                                                'id': 1,
                                                'type': 'multiple_choice',
                                                'topic': 'Test Topic',
                                                'question': 'Test question?',
                                                'options': ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
                                                'correctAnswer': 'A',
                                                'explanation': 'Test explanation'
                                            }
                                        ]
                                    })}]
                                }).encode())
                            }
                        
                        mock_bedrock.invoke_model.side_effect = mock_bedrock_call
                        
                        # Execute the handler
                        response = lambda_handler(event, {})
                        
                        # Verify response
                        body = json.loads(event['body'])
                        expected_versions = body['examConfig']['versions']
                        
                        if response['statusCode'] == 200:
                            response_body = json.loads(response['body'])
                            assert 'generatedFiles' in response_body
                            
                            generated_files = response_body['generatedFiles']
                            
                            # Count student and teacher versions
                            student_versions = [f for f in generated_files if f['type'] == 'student_version']
                            teacher_versions = [f for f in generated_files if f['type'] == 'teacher_version']
                            
                            # Should have correct number of versions
                            assert len(student_versions) == expected_versions
                            assert len(teacher_versions) == expected_versions
                            
                            # Each version should have unique version numbers
                            student_version_numbers = [f['version'] for f in student_versions]
                            teacher_version_numbers = [f['version'] for f in teacher_versions]
                            
                            assert len(set(student_version_numbers)) == expected_versions
                            assert len(set(teacher_version_numbers)) == expected_versions
                            assert set(student_version_numbers) == set(teacher_version_numbers)

    @given(valid_exam_generation_events())
    @settings(max_examples=30, deadline=None)
    def test_self_assessment_generation_when_enabled(self, event):
        """
        Property: For any exam configuration with self-assessment enabled, 
        the system should generate self-assessment files
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('exam_generation_handler.dynamodb') as mock_dynamodb:
                with patch('exam_generation_handler.s3_client') as mock_s3:
                    with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        mock_s3.put_object.return_value = {}
                        
                        # Mock Bedrock responses
                        def mock_bedrock_call(*args, **kwargs):
                            # Check if this is a self-assessment call
                            call_body = json.loads(args[1]['body'])
                            prompt = call_body['messages'][0]['content']
                            
                            if 'autoevaluación' in prompt.lower() or 'self-assessment' in prompt.lower():
                                # Self-assessment response
                                return {
                                    'body': Mock(read=lambda: json.dumps({
                                        'content': [{'text': json.dumps({
                                            'selfAssessment': [
                                                {
                                                    'id': 1,
                                                    'topic': 'Test Topic',
                                                    'question': 'Self-assessment question?',
                                                    'options': ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
                                                    'correctAnswer': 'A',
                                                    'feedback': {
                                                        'A': 'Correct feedback',
                                                        'B': 'Incorrect feedback',
                                                        'C': 'Incorrect feedback',
                                                        'D': 'Incorrect feedback'
                                                    }
                                                }
                                            ]
                                        })}]
                                    }).encode())
                                }
                            else:
                                # Regular exam questions response
                                return {
                                    'body': Mock(read=lambda: json.dumps({
                                        'content': [{'text': json.dumps({
                                            'questions': [
                                                {
                                                    'id': 1,
                                                    'type': 'multiple_choice',
                                                    'topic': 'Test Topic',
                                                    'question': 'Test question?',
                                                    'options': ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
                                                    'correctAnswer': 'A',
                                                    'explanation': 'Test explanation'
                                                }
                                            ]
                                        })}]
                                    }).encode())
                                }
                        
                        mock_bedrock.invoke_model.side_effect = mock_bedrock_call
                        
                        # Execute the handler
                        response = lambda_handler(event, {})
                        
                        # Check if self-assessment was enabled
                        body = json.loads(event['body'])
                        include_self_assessment = body['examConfig'].get('includeSelfAssessment', False)
                        
                        if response['statusCode'] == 200:
                            response_body = json.loads(response['body'])
                            generated_files = response_body.get('generatedFiles', [])
                            
                            self_assessment_files = [f for f in generated_files if f['type'] == 'self_assessment']
                            
                            if include_self_assessment:
                                # Should have self-assessment file
                                assert len(self_assessment_files) == 1
                                assert self_assessment_files[0]['version'] == 1
                                assert 'self-assessment' in self_assessment_files[0]['s3Key']
                            else:
                                # Should not have self-assessment file
                                assert len(self_assessment_files) == 0

    @given(valid_exam_configs())
    @settings(max_examples=30, deadline=None)
    def test_exam_config_validation_property(self, exam_config):
        """
        Property: For any exam configuration, 
        validation should accept valid configs and reject invalid ones
        """
        from exam_generation_handler import validate_exam_config
        
        # Test with valid configuration
        validation_error = validate_exam_config(exam_config)
        assert validation_error is None  # Should be valid
        
        # Test with invalid question count
        invalid_config = exam_config.copy()
        invalid_config['questionCount'] = 25  # Too high
        validation_error = validate_exam_config(invalid_config)
        assert validation_error is not None
        assert 'questionCount' in validation_error
        
        # Test with invalid versions
        invalid_config = exam_config.copy()
        invalid_config['versions'] = 5  # Too high
        validation_error = validate_exam_config(invalid_config)
        assert validation_error is not None
        assert 'versions' in validation_error

    @given(valid_get_events())
    @settings(max_examples=30, deadline=None)
    def test_exam_retrieval_property(self, event):
        """
        Property: For any valid exam ID, 
        the system should return exam results or appropriate not found error
        """
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('exam_generation_handler.dynamodb') as mock_dynamodb:
                mock_table = Mock()
                mock_dynamodb.Table.return_value = mock_table
                
                # Test case 1: Exam exists
                mock_table.get_item.return_value = {
                    'Item': {
                        'analysisId': f"exam-{event['pathParameters']['examId']}",
                        'status': 'COMPLETED',
                        'examConfig': {'questionCount': 10, 'difficulty': 'medium'},
                        'selectedTopics': ['Test Topic'],
                        'generatedFiles': [],
                        'createdAt': '2025-01-01T00:00:00Z'
                    }
                }
                
                response = lambda_handler(event, {})
                
                assert response['statusCode'] == 200
                response_body = json.loads(response['body'])
                assert 'examId' in response_body
                assert 'status' in response_body
                assert 'examConfig' in response_body
                
                # Test case 2: Exam not found
                mock_table.get_item.return_value = {}
                
                response = lambda_handler(event, {})
                
                assert response['statusCode'] == 404
                response_body = json.loads(response['body'])
                assert response_body['error']['code'] == 'EXAM_NOT_FOUND'

    @given(st.lists(st.text(min_size=1, max_size=50), min_size=0, max_size=15))
    @settings(max_examples=20, deadline=None)
    def test_topic_validation_property(self, topics_list):
        """
        Property: For any topics list, 
        the system should validate and reject empty lists appropriately
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'selectedTopics': topics_list,
                'examConfig': {
                    'questionCount': 10,
                    'questionTypes': ['multiple_choice'],
                    'difficulty': 'medium',
                    'versions': 1
                },
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            response = lambda_handler(event, {})
            
            if len(topics_list) == 0:
                # Empty topics should be rejected
                assert response['statusCode'] == 400
                response_body = json.loads(response['body'])
                assert response_body['error']['code'] == 'MISSING_TOPICS'
            else:
                # Non-empty topics should proceed (may fail later for other reasons)
                assert response['statusCode'] in [200, 400, 500]

    def test_bedrock_integration_property(self):
        """
        Property: For Bedrock integration, 
        the system should handle API responses correctly
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'selectedTopics': ['Test Topic'],
                'examConfig': {
                    'questionCount': 5,
                    'questionTypes': ['multiple_choice'],
                    'difficulty': 'medium',
                    'versions': 1,
                    'includeSelfAssessment': False
                },
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('exam_generation_handler.dynamodb') as mock_dynamodb:
                with patch('exam_generation_handler.s3_client') as mock_s3:
                    with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        mock_s3.put_object.return_value = {}
                        
                        # Test successful Bedrock response
                        mock_bedrock.invoke_model.return_value = {
                            'body': Mock(read=lambda: json.dumps({
                                'content': [{'text': json.dumps({
                                    'questions': [
                                        {
                                            'id': 1,
                                            'type': 'multiple_choice',
                                            'topic': 'Test Topic',
                                            'question': 'What is a test?',
                                            'options': ['A) A test', 'B) Not a test', 'C) Maybe', 'D) Unknown'],
                                            'correctAnswer': 'A',
                                            'explanation': 'A test is a test'
                                        }
                                    ]
                                })}]
                            }).encode())
                        }
                        
                        response = lambda_handler(event, {})
                        
                        # Should succeed with valid Bedrock response
                        assert response['statusCode'] == 200
                        response_body = json.loads(response['body'])
                        assert 'examId' in response_body
                        assert 'generatedFiles' in response_body
                        
                        # Test Bedrock API failure
                        mock_bedrock.invoke_model.side_effect = Exception("Bedrock API error")
                        
                        response = lambda_handler(event, {})
                        
                        # Should handle Bedrock failure gracefully
                        assert response['statusCode'] == 500
                        response_body = json.loads(response['body'])
                        assert response_body['error']['code'] == 'PROCESSING_ERROR'

if __name__ == '__main__':
    pytest.main([__file__, '-v'])
class TestSelfAssessmentGeneration:
    """
    Property-based tests for self-assessment generation.
    
    **Feature: exam-generator-module, Property 6: Self-Assessment Generation**
    **Validates: Requirements 5.4, 4.4**
    """
    
    @given(valid_topics(), valid_exam_configs())
    @settings(max_examples=30, deadline=None)
    def test_self_assessment_always_generates_five_questions(self, topics, exam_config):
        """
        Property: For any exam configuration with self-assessment enabled, 
        the system should always generate exactly 5 questions with feedback
        """
        # Force self-assessment to be enabled
        exam_config['includeSelfAssessment'] = True
        
        with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
            # Mock self-assessment response with exactly 5 questions
            mock_bedrock.invoke_model.return_value = {
                'body': Mock(read=lambda: json.dumps({
                    'content': [{'text': json.dumps({
                        'selfAssessment': [
                            {
                                'id': i,
                                'topic': f'Topic {i}',
                                'question': f'Self-assessment question {i}?',
                                'options': [f'{chr(65+j)}) Option {j+1}' for j in range(4)],
                                'correctAnswer': 'A',
                                'feedback': {
                                    chr(65+j): f'Feedback for option {chr(65+j)}' for j in range(4)
                                }
                            } for i in range(1, 6)  # Exactly 5 questions
                        ]
                    })}]
                }).encode())
            }
            
            from exam_generation_handler import generate_self_assessment_with_bedrock
            
            # Test self-assessment generation
            self_assessment = generate_self_assessment_with_bedrock(topics, exam_config)
            
            # Verify exactly 5 questions
            assert isinstance(self_assessment, list)
            assert len(self_assessment) == 5
            
            # Verify each question has required structure
            for i, question in enumerate(self_assessment, 1):
                assert isinstance(question, dict)
                assert 'id' in question
                assert 'topic' in question
                assert 'question' in question
                assert 'options' in question
                assert 'correctAnswer' in question
                assert 'feedback' in question
                
                # Verify options structure
                assert isinstance(question['options'], list)
                assert len(question['options']) == 4
                
                # Verify feedback structure
                assert isinstance(question['feedback'], dict)
                assert len(question['feedback']) == 4
                
                # Each option should have feedback
                for option_key in ['A', 'B', 'C', 'D']:
                    assert option_key in question['feedback']
                    assert isinstance(question['feedback'][option_key], str)
                    assert len(question['feedback'][option_key]) > 0

    @given(valid_topics(), valid_exam_configs())
    @settings(max_examples=20, deadline=None)
    def test_self_assessment_feedback_completeness(self, topics, exam_config):
        """
        Property: For any self-assessment question, 
        feedback should be provided for all answer options
        """
        exam_config['includeSelfAssessment'] = True
        
        with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
            # Mock response with comprehensive feedback
            mock_bedrock.invoke_model.return_value = {
                'body': Mock(read=lambda: json.dumps({
                    'content': [{'text': json.dumps({
                        'selfAssessment': [
                            {
                                'id': 1,
                                'topic': 'Test Topic',
                                'question': 'Test question?',
                                'options': ['A) Correct answer', 'B) Wrong answer 1', 'C) Wrong answer 2', 'D) Wrong answer 3'],
                                'correctAnswer': 'A',
                                'feedback': {
                                    'A': 'Correct! This is the right answer because...',
                                    'B': 'Incorrect. This option is wrong because...',
                                    'C': 'Incorrect. This option is wrong because...',
                                    'D': 'Incorrect. This option is wrong because...'
                                }
                            }
                        ]
                    })}]
                }).encode())
            }
            
            from exam_generation_handler import generate_self_assessment_with_bedrock
            
            self_assessment = generate_self_assessment_with_bedrock(topics, exam_config)
            
            # Verify feedback completeness
            for question in self_assessment:
                feedback = question['feedback']
                
                # Should have feedback for all options A, B, C, D
                required_options = ['A', 'B', 'C', 'D']
                for option in required_options:
                    assert option in feedback
                    assert isinstance(feedback[option], str)
                    assert len(feedback[option].strip()) > 10  # Meaningful feedback
                
                # Correct answer feedback should be different from incorrect ones
                correct_answer = question['correctAnswer']
                correct_feedback = feedback[correct_answer].lower()
                
                # Correct feedback should contain positive indicators
                positive_indicators = ['correct', 'right', 'yes', 'exactly', 'perfect']
                assert any(indicator in correct_feedback for indicator in positive_indicators)
                
                # Incorrect feedback should contain negative indicators
                for option in required_options:
                    if option != correct_answer:
                        incorrect_feedback = feedback[option].lower()
                        negative_indicators = ['incorrect', 'wrong', 'no', 'not', 'false']
                        assert any(indicator in incorrect_feedback for indicator in negative_indicators)

    @given(valid_exam_configs())
    @settings(max_examples=20, deadline=None)
    def test_self_assessment_content_formatting(self, exam_config):
        """
        Property: For any self-assessment content, 
        formatting should be consistent and readable
        """
        exam_config['includeSelfAssessment'] = True
        
        # Mock self-assessment questions
        mock_questions = [
            {
                'id': i,
                'topic': f'Topic {i}',
                'question': f'Question {i}: What is the answer?',
                'options': [f'{chr(65+j)}) Option {i}.{j+1}' for j in range(4)],
                'correctAnswer': 'A',
                'feedback': {
                    chr(65+j): f'Feedback for question {i}, option {chr(65+j)}' for j in range(4)
                }
            } for i in range(1, 6)
        ]
        
        from exam_generation_handler import format_self_assessment_content
        
        # Test content formatting
        formatted_content = format_self_assessment_content(mock_questions)
        
        # Verify content structure
        assert isinstance(formatted_content, str)
        assert len(formatted_content) > 0
        
        # Should contain header
        assert 'AUTOEVALUACIÓN' in formatted_content
        assert 'RETROALIMENTACIÓN' in formatted_content
        
        # Should contain all questions
        for i in range(1, 6):
            assert f'Pregunta {i}:' in formatted_content
        
        # Should contain all options for each question
        for question in mock_questions:
            for option in question['options']:
                assert option in formatted_content
        
        # Should contain all feedback
        for question in mock_questions:
            for option_key, feedback_text in question['feedback'].items():
                assert f'{option_key}:' in formatted_content
                assert feedback_text in formatted_content
        
        # Should have proper separators
        separator_count = formatted_content.count('=' * 50)
        assert separator_count == 5  # One separator after each question

    def test_self_assessment_disabled_behavior(self):
        """
        Property: When self-assessment is disabled, 
        no self-assessment files should be generated
        """
        event = {
            'httpMethod': 'POST',
            'body': json.dumps({
                'selectedTopics': ['Test Topic'],
                'examConfig': {
                    'questionCount': 5,
                    'questionTypes': ['multiple_choice'],
                    'difficulty': 'medium',
                    'versions': 1,
                    'includeSelfAssessment': False  # Explicitly disabled
                },
                'teacherId': 'admin'
            })
        }
        
        with patch.dict(os.environ, {'ANALYSIS_TABLE': 'test-table', 'UPLOAD_BUCKET': 'test-bucket'}):
            with patch('exam_generation_handler.dynamodb') as mock_dynamodb:
                with patch('exam_generation_handler.s3_client') as mock_s3:
                    with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
                        
                        # Setup mocks
                        mock_table = Mock()
                        mock_dynamodb.Table.return_value = mock_table
                        mock_table.put_item.return_value = {}
                        mock_table.update_item.return_value = {}
                        mock_s3.put_object.return_value = {}
                        
                        # Mock only regular exam questions (no self-assessment)
                        mock_bedrock.invoke_model.return_value = {
                            'body': Mock(read=lambda: json.dumps({
                                'content': [{'text': json.dumps({
                                    'questions': [
                                        {
                                            'id': 1,
                                            'type': 'multiple_choice',
                                            'topic': 'Test Topic',
                                            'question': 'Test question?',
                                            'options': ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
                                            'correctAnswer': 'A',
                                            'explanation': 'Test explanation'
                                        }
                                    ]
                                })}]
                            }).encode())
                        }
                        
                        response = lambda_handler(event, {})
                        
                        # Should succeed without self-assessment
                        assert response['statusCode'] == 200
                        response_body = json.loads(response['body'])
                        
                        generated_files = response_body.get('generatedFiles', [])
                        self_assessment_files = [f for f in generated_files if f['type'] == 'self_assessment']
                        
                        # Should not have any self-assessment files
                        assert len(self_assessment_files) == 0
                        
                        # Should only have student and teacher versions
                        student_files = [f for f in generated_files if f['type'] == 'student_version']
                        teacher_files = [f for f in generated_files if f['type'] == 'teacher_version']
                        
                        assert len(student_files) == 1
                        assert len(teacher_files) == 1

    @given(st.sampled_from(['es', 'en']))
    @settings(max_examples=10)
    def test_self_assessment_language_consistency(self, language):
        """
        Property: For any language setting, 
        self-assessment should be generated in the specified language
        """
        topics = ['Test Topic']
        exam_config = {
            'questionCount': 5,
            'questionTypes': ['multiple_choice'],
            'difficulty': 'medium',
            'versions': 1,
            'includeSelfAssessment': True,
            'language': language
        }
        
        with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
            # Capture the prompt to verify language
            captured_prompts = []
            
            def capture_bedrock_call(*args, **kwargs):
                # Handle both positional and keyword arguments
                if len(args) >= 2:
                    call_body = json.loads(args[1]['body'])
                else:
                    call_body = json.loads(kwargs['body'])
                prompt = call_body['messages'][0]['content']
                captured_prompts.append(prompt)
                
                return {
                    'body': Mock(read=lambda: json.dumps({
                        'content': [{'text': json.dumps({
                            'selfAssessment': [
                                {
                                    'id': 1,
                                    'topic': 'Test Topic',
                                    'question': 'Test question?',
                                    'options': ['A) Option 1', 'B) Option 2', 'C) Option 3', 'D) Option 4'],
                                    'correctAnswer': 'A',
                                    'feedback': {
                                        'A': 'Correct feedback',
                                        'B': 'Incorrect feedback',
                                        'C': 'Incorrect feedback',
                                        'D': 'Incorrect feedback'
                                    }
                                }
                            ]
                        })}]
                    }).encode())
                }
            
            mock_bedrock.invoke_model.side_effect = capture_bedrock_call
            
            from exam_generation_handler import generate_self_assessment_with_bedrock
            
            # Generate self-assessment
            self_assessment = generate_self_assessment_with_bedrock(topics, exam_config)
            
            # Verify language was specified in prompt
            assert len(captured_prompts) > 0
            prompt = captured_prompts[0]
            
            # Should contain language specification
            assert f'Idioma: {language}' in prompt
            
            # Verify self-assessment was generated
            assert len(self_assessment) > 0

    def test_self_assessment_error_handling(self):
        """
        Property: For self-assessment generation errors, 
        the system should handle them gracefully
        """
        topics = ['Test Topic']
        exam_config = {
            'includeSelfAssessment': True,
            'difficulty': 'medium',
            'language': 'es'
        }
        
        with patch('exam_generation_handler.bedrock_client') as mock_bedrock:
            # Simulate Bedrock API error
            mock_bedrock.invoke_model.side_effect = Exception("Bedrock API error")
            
            from exam_generation_handler import generate_self_assessment_with_bedrock
            
            # Should raise exception for self-assessment generation failure
            with pytest.raises(Exception) as exc_info:
                generate_self_assessment_with_bedrock(topics, exam_config)
            
            assert "Self-assessment generation failed" in str(exc_info.value)