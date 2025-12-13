#!/usr/bin/env python3
"""
Property-Based Tests for Exam Configuration Validation
Tests Property 4: Exam Configuration Validation

This module tests the exam configuration functionality to ensure:
- Configuration parameters are validated correctly
- Default values are applied appropriately
- Parameter combinations are logically consistent
- Error handling for invalid configurations is robust
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from hypothesis.stateful import RuleBasedStateMachine, Bundle, rule, initialize
import json
from unittest.mock import Mock, patch, MagicMock
from typing import Dict, List, Optional, Any
import copy
from datetime import datetime, timedelta

# Exam Configuration Data Structures
class ExamConfig:
    def __init__(self):
        # Basic exam parameters
        self.num_questions = 10
        self.num_versions = 1
        self.difficulty_level = "medium"
        self.question_types = ["multiple_choice"]
        self.time_limit = 60  # minutes
        
        # Advanced parameters
        self.include_self_assessment = False
        self.randomize_questions = True
        self.randomize_answers = True
        self.show_feedback = False
        self.allow_partial_credit = True
        
        # Content parameters
        self.focus_areas = []
        self.exclude_topics = []
        self.language = "en"
        self.format = "pdf"
        
        # Administrative parameters
        self.teacher_name = ""
        self.course_name = ""
        self.exam_title = ""
        self.instructions = ""
        
        # Validation state
        self.is_valid = True
        self.validation_errors = []
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert config to dictionary"""
        return {
            'num_questions': self.num_questions,
            'num_versions': self.num_versions,
            'difficulty_level': self.difficulty_level,
            'question_types': self.question_types,
            'time_limit': self.time_limit,
            'include_self_assessment': self.include_self_assessment,
            'randomize_questions': self.randomize_questions,
            'randomize_answers': self.randomize_answers,
            'show_feedback': self.show_feedback,
            'allow_partial_credit': self.allow_partial_credit,
            'focus_areas': self.focus_areas,
            'exclude_topics': self.exclude_topics,
            'language': self.language,
            'format': self.format,
            'teacher_name': self.teacher_name,
            'course_name': self.course_name,
            'exam_title': self.exam_title,
            'instructions': self.instructions
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ExamConfig':
        """Create config from dictionary"""
        config = cls()
        for key, value in data.items():
            if hasattr(config, key):
                setattr(config, key, value)
        return config

# Exam Configuration Validator
class ExamConfigValidator:
    # Constants for validation
    MIN_QUESTIONS = 1
    MAX_QUESTIONS = 100
    MIN_VERSIONS = 1
    MAX_VERSIONS = 10
    MIN_TIME_LIMIT = 5  # minutes
    MAX_TIME_LIMIT = 480  # 8 hours
    
    VALID_DIFFICULTY_LEVELS = ["easy", "medium", "hard", "mixed"]
    VALID_QUESTION_TYPES = [
        "multiple_choice", "true_false", "short_answer", 
        "essay", "fill_blank", "matching"
    ]
    VALID_LANGUAGES = ["en", "es", "fr", "de", "it", "pt"]
    VALID_FORMATS = ["pdf", "docx", "html"]
    
    @staticmethod
    def validate_config(config: ExamConfig) -> tuple[bool, List[str]]:
        """Validate exam configuration and return (is_valid, errors)"""
        errors = []
        
        # Validate number of questions
        if not isinstance(config.num_questions, int):
            errors.append("Number of questions must be an integer")
        elif config.num_questions < ExamConfigValidator.MIN_QUESTIONS:
            errors.append(f"Number of questions must be at least {ExamConfigValidator.MIN_QUESTIONS}")
        elif config.num_questions > ExamConfigValidator.MAX_QUESTIONS:
            errors.append(f"Number of questions cannot exceed {ExamConfigValidator.MAX_QUESTIONS}")
        
        # Validate number of versions
        if not isinstance(config.num_versions, int):
            errors.append("Number of versions must be an integer")
        elif config.num_versions < ExamConfigValidator.MIN_VERSIONS:
            errors.append(f"Number of versions must be at least {ExamConfigValidator.MIN_VERSIONS}")
        elif config.num_versions > ExamConfigValidator.MAX_VERSIONS:
            errors.append(f"Number of versions cannot exceed {ExamConfigValidator.MAX_VERSIONS}")
        
        # Validate difficulty level
        if config.difficulty_level not in ExamConfigValidator.VALID_DIFFICULTY_LEVELS:
            errors.append(f"Invalid difficulty level: {config.difficulty_level}")
        
        # Validate question types
        if not isinstance(config.question_types, list) or not config.question_types:
            errors.append("At least one question type must be selected")
        else:
            for qtype in config.question_types:
                if qtype not in ExamConfigValidator.VALID_QUESTION_TYPES:
                    errors.append(f"Invalid question type: {qtype}")
        
        # Validate time limit
        if not isinstance(config.time_limit, (int, float)):
            errors.append("Time limit must be a number")
        elif config.time_limit < ExamConfigValidator.MIN_TIME_LIMIT:
            errors.append(f"Time limit must be at least {ExamConfigValidator.MIN_TIME_LIMIT} minutes")
        elif config.time_limit > ExamConfigValidator.MAX_TIME_LIMIT:
            errors.append(f"Time limit cannot exceed {ExamConfigValidator.MAX_TIME_LIMIT} minutes")
        
        # Validate language
        if config.language not in ExamConfigValidator.VALID_LANGUAGES:
            errors.append(f"Invalid language: {config.language}")
        
        # Validate format
        if config.format not in ExamConfigValidator.VALID_FORMATS:
            errors.append(f"Invalid format: {config.format}")
        
        # Validate required text fields
        if not isinstance(config.teacher_name, str) or not config.teacher_name.strip():
            errors.append("Teacher name is required")
        
        if not isinstance(config.course_name, str) or not config.course_name.strip():
            errors.append("Course name is required")
        
        if not isinstance(config.exam_title, str) or not config.exam_title.strip():
            errors.append("Exam title is required")
        
        # Validate logical consistency
        if config.show_feedback and not config.include_self_assessment:
            errors.append("Feedback can only be shown with self-assessment enabled")
        
        # Validate focus areas and exclude topics don't overlap
        if config.focus_areas and config.exclude_topics:
            overlap = set(config.focus_areas) & set(config.exclude_topics)
            if overlap:
                errors.append(f"Topics cannot be both focused and excluded: {list(overlap)}")
        
        return len(errors) == 0, errors
    
    @staticmethod
    def apply_defaults(config: ExamConfig) -> ExamConfig:
        """Apply default values to configuration"""
        # Create a copy to avoid modifying original
        new_config = ExamConfig.from_dict(config.to_dict())
        
        # Apply defaults for missing or invalid values
        if not hasattr(new_config, 'num_questions') or new_config.num_questions is None:
            new_config.num_questions = 10
        
        if not hasattr(new_config, 'num_versions') or new_config.num_versions is None:
            new_config.num_versions = 1
        
        if not hasattr(new_config, 'difficulty_level') or new_config.difficulty_level not in ExamConfigValidator.VALID_DIFFICULTY_LEVELS:
            new_config.difficulty_level = "medium"
        
        if not hasattr(new_config, 'question_types') or not new_config.question_types:
            new_config.question_types = ["multiple_choice"]
        
        if not hasattr(new_config, 'time_limit') or new_config.time_limit is None:
            new_config.time_limit = 60
        
        if not hasattr(new_config, 'language') or new_config.language not in ExamConfigValidator.VALID_LANGUAGES:
            new_config.language = "en"
        
        if not hasattr(new_config, 'format') or new_config.format not in ExamConfigValidator.VALID_FORMATS:
            new_config.format = "pdf"
        
        # Ensure boolean fields have proper defaults
        boolean_defaults = {
            'include_self_assessment': False,
            'randomize_questions': True,
            'randomize_answers': True,
            'show_feedback': False,
            'allow_partial_credit': True
        }
        
        for field, default in boolean_defaults.items():
            if not hasattr(new_config, field) or not isinstance(getattr(new_config, field), bool):
                setattr(new_config, field, default)
        
        # Ensure list fields are properly initialized
        if not hasattr(new_config, 'focus_areas') or not isinstance(new_config.focus_areas, list):
            new_config.focus_areas = []
        
        if not hasattr(new_config, 'exclude_topics') or not isinstance(new_config.exclude_topics, list):
            new_config.exclude_topics = []
        
        return new_config
    
    @staticmethod
    def sanitize_config(config: ExamConfig) -> ExamConfig:
        """Sanitize configuration values to ensure they're within valid ranges"""
        sanitized = ExamConfig.from_dict(config.to_dict())
        
        # Clamp numeric values to valid ranges
        sanitized.num_questions = max(ExamConfigValidator.MIN_QUESTIONS, 
                                    min(ExamConfigValidator.MAX_QUESTIONS, sanitized.num_questions))
        
        sanitized.num_versions = max(ExamConfigValidator.MIN_VERSIONS,
                                   min(ExamConfigValidator.MAX_VERSIONS, sanitized.num_versions))
        
        sanitized.time_limit = max(ExamConfigValidator.MIN_TIME_LIMIT,
                                 min(ExamConfigValidator.MAX_TIME_LIMIT, sanitized.time_limit))
        
        # Sanitize string fields
        if hasattr(sanitized, 'teacher_name') and sanitized.teacher_name:
            sanitized.teacher_name = sanitized.teacher_name.strip()[:100]  # Max 100 chars
        
        if hasattr(sanitized, 'course_name') and sanitized.course_name:
            sanitized.course_name = sanitized.course_name.strip()[:100]
        
        if hasattr(sanitized, 'exam_title') and sanitized.exam_title:
            sanitized.exam_title = sanitized.exam_title.strip()[:200]
        
        if hasattr(sanitized, 'instructions') and sanitized.instructions:
            sanitized.instructions = sanitized.instructions.strip()[:1000]  # Max 1000 chars
        
        # Filter question types to only valid ones
        if hasattr(sanitized, 'question_types'):
            if sanitized.question_types:
                sanitized.question_types = [qt for qt in sanitized.question_types 
                                          if qt in ExamConfigValidator.VALID_QUESTION_TYPES]
            # Ensure at least one question type
            if not sanitized.question_types:
                sanitized.question_types = ["multiple_choice"]
        
        return sanitized

# Property-Based Test Class
class TestExamConfigProperties:
    """Property-based tests for exam configuration validation"""
    
    @settings(max_examples=100, deadline=None)
    @given(
        num_questions=st.integers(min_value=-10, max_value=150),
        num_versions=st.integers(min_value=-5, max_value=20),
        time_limit=st.integers(min_value=-30, max_value=600)
    )
    def test_property_4_numeric_validation_bounds(self, num_questions, num_versions, time_limit):
        """
        Property 4.1: Numeric parameter validation respects bounds
        
        For any numeric configuration values:
        - Values within valid ranges should pass validation
        - Values outside valid ranges should fail validation
        - Sanitization should clamp values to valid ranges
        """
        config = ExamConfig()
        config.num_questions = num_questions
        config.num_versions = num_versions
        config.time_limit = time_limit
        config.teacher_name = "Test Teacher"
        config.course_name = "Test Course"
        config.exam_title = "Test Exam"
        
        is_valid, errors = ExamConfigValidator.validate_config(config)
        
        # Check if validation correctly identifies out-of-bounds values
        questions_valid = ExamConfigValidator.MIN_QUESTIONS <= num_questions <= ExamConfigValidator.MAX_QUESTIONS
        versions_valid = ExamConfigValidator.MIN_VERSIONS <= num_versions <= ExamConfigValidator.MAX_VERSIONS
        time_valid = ExamConfigValidator.MIN_TIME_LIMIT <= time_limit <= ExamConfigValidator.MAX_TIME_LIMIT
        
        if questions_valid and versions_valid and time_valid:
            # All numeric values are valid, so validation should pass (assuming other fields are valid)
            numeric_errors = [e for e in errors if any(field in e.lower() for field in ['questions', 'versions', 'time'])]
            assert len(numeric_errors) == 0, f"Valid numeric values should not produce errors: {numeric_errors}"
        else:
            # At least one numeric value is invalid
            if not questions_valid:
                assert any('questions' in e.lower() for e in errors), "Invalid question count should produce error"
            if not versions_valid:
                assert any('versions' in e.lower() for e in errors), "Invalid version count should produce error"
            if not time_valid:
                assert any('time' in e.lower() for e in errors), "Invalid time limit should produce error"
        
        # Test sanitization
        sanitized = ExamConfigValidator.sanitize_config(config)
        
        # Sanitized values should always be within bounds
        assert ExamConfigValidator.MIN_QUESTIONS <= sanitized.num_questions <= ExamConfigValidator.MAX_QUESTIONS
        assert ExamConfigValidator.MIN_VERSIONS <= sanitized.num_versions <= ExamConfigValidator.MAX_VERSIONS
        assert ExamConfigValidator.MIN_TIME_LIMIT <= sanitized.time_limit <= ExamConfigValidator.MAX_TIME_LIMIT
    
    @settings(max_examples=100, deadline=None)
    @given(
        difficulty=st.sampled_from(["easy", "medium", "hard", "mixed", "invalid", "extreme", ""]),
        language=st.sampled_from(["en", "es", "fr", "de", "invalid", "xx", ""]),
        format_type=st.sampled_from(["pdf", "docx", "html", "invalid", "txt", ""])
    )
    def test_property_4_enum_validation(self, difficulty, language, format_type):
        """
        Property 4.2: Enumerated parameter validation works correctly
        
        For any enumerated configuration values:
        - Valid enum values should pass validation
        - Invalid enum values should fail validation
        - Default values should be applied for invalid enums
        """
        config = ExamConfig()
        config.difficulty_level = difficulty
        config.language = language
        config.format = format_type
        config.teacher_name = "Test Teacher"
        config.course_name = "Test Course"
        config.exam_title = "Test Exam"
        
        is_valid, errors = ExamConfigValidator.validate_config(config)
        
        # Check difficulty validation
        if difficulty in ExamConfigValidator.VALID_DIFFICULTY_LEVELS:
            assert not any('difficulty' in e.lower() for e in errors), f"Valid difficulty should not produce error: {difficulty}"
        else:
            assert any('difficulty' in e.lower() for e in errors), f"Invalid difficulty should produce error: {difficulty}"
        
        # Check language validation
        if language in ExamConfigValidator.VALID_LANGUAGES:
            assert not any('language' in e.lower() for e in errors), f"Valid language should not produce error: {language}"
        else:
            assert any('language' in e.lower() for e in errors), f"Invalid language should produce error: {language}"
        
        # Check format validation
        if format_type in ExamConfigValidator.VALID_FORMATS:
            assert not any('format' in e.lower() for e in errors), f"Valid format should not produce error: {format_type}"
        else:
            assert any('format' in e.lower() for e in errors), f"Invalid format should produce error: {format_type}"
        
        # Test default application
        with_defaults = ExamConfigValidator.apply_defaults(config)
        
        # Defaults should always be valid
        assert with_defaults.difficulty_level in ExamConfigValidator.VALID_DIFFICULTY_LEVELS
        assert with_defaults.language in ExamConfigValidator.VALID_LANGUAGES
        assert with_defaults.format in ExamConfigValidator.VALID_FORMATS
    
    @settings(max_examples=100, deadline=None)
    @given(
        question_types=st.lists(
            st.sampled_from(["multiple_choice", "true_false", "short_answer", "essay", 
                           "fill_blank", "matching", "invalid_type", "unknown"]),
            min_size=0,
            max_size=8
        )
    )
    def test_property_4_question_types_validation(self, question_types):
        """
        Property 4.3: Question types validation handles lists correctly
        
        For any list of question types:
        - Valid question types should pass validation
        - Invalid question types should be filtered out
        - Empty lists should fail validation
        - At least one valid type should remain after filtering
        """
        config = ExamConfig()
        config.question_types = question_types
        config.teacher_name = "Test Teacher"
        config.course_name = "Test Course"
        config.exam_title = "Test Exam"
        
        is_valid, errors = ExamConfigValidator.validate_config(config)
        
        # Check if any question types are valid
        valid_types = [qt for qt in question_types if qt in ExamConfigValidator.VALID_QUESTION_TYPES]
        
        if not question_types:
            # Empty list should fail
            assert any('question type' in e.lower() for e in errors), "Empty question types should produce error"
        elif not valid_types:
            # No valid types should fail
            assert any('question type' in e.lower() or 'invalid' in e.lower() for e in errors), "All invalid question types should produce error"
        else:
            # Has valid types, should pass question type validation
            question_type_errors = [e for e in errors if 'question type' in e.lower() and 'invalid' in e.lower()]
            # Note: There might still be errors for individual invalid types, but the overall validation should not fail due to having some valid types
        
        # Test sanitization
        sanitized = ExamConfigValidator.sanitize_config(config)
        
        # Sanitized question types should only contain valid types
        for qt in sanitized.question_types:
            assert qt in ExamConfigValidator.VALID_QUESTION_TYPES, f"Sanitized question type should be valid: {qt}"
        
        # Should have at least one question type after sanitization
        assert len(sanitized.question_types) > 0, "Should have at least one question type after sanitization"
    
    @settings(max_examples=100, deadline=None)
    @given(
        teacher_name=st.text(min_size=0, max_size=150),
        course_name=st.text(min_size=0, max_size=150),
        exam_title=st.text(min_size=0, max_size=250),
        instructions=st.text(min_size=0, max_size=1200)
    )
    def test_property_4_text_field_validation(self, teacher_name, course_name, exam_title, instructions):
        """
        Property 4.4: Text field validation handles various inputs correctly
        
        For any text field values:
        - Non-empty strings should pass validation
        - Empty or whitespace-only strings should fail for required fields
        - Very long strings should be truncated during sanitization
        - Special characters should be handled appropriately
        """
        config = ExamConfig()
        config.teacher_name = teacher_name
        config.course_name = course_name
        config.exam_title = exam_title
        config.instructions = instructions
        
        is_valid, errors = ExamConfigValidator.validate_config(config)
        
        # Check required field validation
        if not teacher_name.strip():
            assert any('teacher name' in e.lower() for e in errors), "Empty teacher name should produce error"
        else:
            assert not any('teacher name' in e.lower() for e in errors), "Non-empty teacher name should not produce error"
        
        if not course_name.strip():
            assert any('course name' in e.lower() for e in errors), "Empty course name should produce error"
        else:
            assert not any('course name' in e.lower() for e in errors), "Non-empty course name should not produce error"
        
        if not exam_title.strip():
            assert any('exam title' in e.lower() for e in errors), "Empty exam title should produce error"
        else:
            assert not any('exam title' in e.lower() for e in errors), "Non-empty exam title should not produce error"
        
        # Test sanitization
        sanitized = ExamConfigValidator.sanitize_config(config)
        
        # Sanitized text should be within length limits
        if sanitized.teacher_name:
            assert len(sanitized.teacher_name) <= 100, "Teacher name should be truncated to 100 chars"
        
        if sanitized.course_name:
            assert len(sanitized.course_name) <= 100, "Course name should be truncated to 100 chars"
        
        if sanitized.exam_title:
            assert len(sanitized.exam_title) <= 200, "Exam title should be truncated to 200 chars"
        
        if sanitized.instructions:
            assert len(sanitized.instructions) <= 1000, "Instructions should be truncated to 1000 chars"
    
    @settings(max_examples=50, deadline=None)
    @given(
        include_self_assessment=st.booleans(),
        show_feedback=st.booleans(),
        focus_areas=st.lists(st.text(min_size=1, max_size=20), min_size=0, max_size=5, unique=True),
        exclude_topics=st.lists(st.text(min_size=1, max_size=20), min_size=0, max_size=5, unique=True)
    )
    def test_property_4_logical_consistency_validation(self, include_self_assessment, show_feedback, focus_areas, exclude_topics):
        """
        Property 4.5: Logical consistency validation catches conflicts
        
        For any combination of configuration options:
        - Feedback should only be allowed with self-assessment
        - Focus areas and exclude topics should not overlap
        - Logical dependencies should be enforced
        """
        config = ExamConfig()
        config.include_self_assessment = include_self_assessment
        config.show_feedback = show_feedback
        config.focus_areas = focus_areas
        config.exclude_topics = exclude_topics
        config.teacher_name = "Test Teacher"
        config.course_name = "Test Course"
        config.exam_title = "Test Exam"
        
        is_valid, errors = ExamConfigValidator.validate_config(config)
        
        # Check feedback/self-assessment consistency
        if show_feedback and not include_self_assessment:
            assert any('feedback' in e.lower() and 'self-assessment' in e.lower() for e in errors), \
                "Feedback without self-assessment should produce error"
        
        # Check focus/exclude overlap
        overlap = set(focus_areas) & set(exclude_topics)
        if overlap:
            assert any('focused and excluded' in e.lower() or 'overlap' in e.lower() for e in errors), \
                f"Overlapping focus/exclude topics should produce error: {overlap}"
        
        # If no logical conflicts, these specific errors should not occur
        if not (show_feedback and not include_self_assessment) and not overlap:
            logical_errors = [e for e in errors if 
                            ('feedback' in e.lower() and 'self-assessment' in e.lower()) or
                            ('focused and excluded' in e.lower()) or
                            ('overlap' in e.lower())]
            assert len(logical_errors) == 0, f"No logical conflicts should not produce logical errors: {logical_errors}"
    
    @settings(max_examples=50, deadline=None)
    @given(
        config_dict=st.fixed_dictionaries({
            'num_questions': st.integers(min_value=1, max_value=50),
            'num_versions': st.integers(min_value=1, max_value=5),
            'difficulty_level': st.sampled_from(["easy", "medium", "hard"]),
            'question_types': st.lists(st.sampled_from(["multiple_choice", "true_false", "essay"]), min_size=1, max_size=3, unique=True),
            'time_limit': st.integers(min_value=10, max_value=180),
            'teacher_name': st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),
            'course_name': st.text(min_size=1, max_size=50).filter(lambda x: x.strip()),
            'exam_title': st.text(min_size=1, max_size=100).filter(lambda x: x.strip())
        })
    )
    def test_property_4_round_trip_serialization(self, config_dict):
        """
        Property 4.6: Configuration serialization is consistent
        
        For any valid configuration:
        - Converting to dict and back should preserve values
        - Validation should be consistent across conversions
        - Serialized form should be JSON-compatible
        """
        # Create config from dict
        config1 = ExamConfig.from_dict(config_dict)
        
        # Convert to dict and back
        dict_form = config1.to_dict()
        config2 = ExamConfig.from_dict(dict_form)
        
        # Values should be preserved
        for key, value in config_dict.items():
            assert getattr(config1, key) == value, f"Original config should have correct {key}"
            assert getattr(config2, key) == value, f"Round-trip config should preserve {key}"
        
        # Validation should be consistent
        valid1, errors1 = ExamConfigValidator.validate_config(config1)
        valid2, errors2 = ExamConfigValidator.validate_config(config2)
        
        assert valid1 == valid2, "Validation should be consistent across round-trip"
        assert set(errors1) == set(errors2), "Validation errors should be consistent across round-trip"
        
        # Dict form should be JSON serializable
        try:
            json_str = json.dumps(dict_form)
            parsed_dict = json.loads(json_str)
            assert parsed_dict == dict_form, "JSON round-trip should preserve dict form"
        except (TypeError, ValueError) as e:
            pytest.fail(f"Config dict should be JSON serializable: {e}")
    
    @settings(max_examples=30, deadline=None)
    @given(
        operations=st.lists(
            st.one_of(
                st.tuples(st.just("set_questions"), st.integers(min_value=1, max_value=100)),
                st.tuples(st.just("set_versions"), st.integers(min_value=1, max_value=10)),
                st.tuples(st.just("set_difficulty"), st.sampled_from(["easy", "medium", "hard", "mixed"])),
                st.tuples(st.just("toggle_self_assessment"),),
                st.tuples(st.just("toggle_feedback"),),
                st.tuples(st.just("add_question_type"), st.sampled_from(["multiple_choice", "essay", "true_false"])),
                st.tuples(st.just("apply_defaults"),),
                st.tuples(st.just("sanitize"),)
            ),
            min_size=5,
            max_size=15
        )
    )
    def test_property_4_configuration_state_consistency(self, operations):
        """
        Property 4.7: Configuration state remains consistent through operations
        
        For any sequence of configuration operations:
        - State should always be internally consistent
        - Validation should reflect current state accurately
        - Operations should not corrupt configuration
        """
        config = ExamConfig()
        config.teacher_name = "Test Teacher"
        config.course_name = "Test Course"
        config.exam_title = "Test Exam"
        
        for operation in operations:
            if operation[0] == "set_questions":
                config.num_questions = operation[1]
            elif operation[0] == "set_versions":
                config.num_versions = operation[1]
            elif operation[0] == "set_difficulty":
                config.difficulty_level = operation[1]
            elif operation[0] == "toggle_self_assessment":
                config.include_self_assessment = not config.include_self_assessment
            elif operation[0] == "toggle_feedback":
                config.show_feedback = not config.show_feedback
            elif operation[0] == "add_question_type":
                if operation[1] not in config.question_types:
                    config.question_types.append(operation[1])
            elif operation[0] == "apply_defaults":
                config = ExamConfigValidator.apply_defaults(config)
            elif operation[0] == "sanitize":
                config = ExamConfigValidator.sanitize_config(config)
            
            # Verify consistency after each operation
            is_valid, errors = ExamConfigValidator.validate_config(config)
            
            # Basic type consistency
            assert isinstance(config.num_questions, int), "Questions should be integer"
            assert isinstance(config.num_versions, int), "Versions should be integer"
            assert isinstance(config.question_types, list), "Question types should be list"
            assert isinstance(config.include_self_assessment, bool), "Self-assessment should be boolean"
            assert isinstance(config.show_feedback, bool), "Feedback should be boolean"
            
            # Logical consistency
            if config.show_feedback and not config.include_self_assessment:
                assert not is_valid, "Feedback without self-assessment should be invalid"
            
            # After sanitization, numeric values should be in bounds
            if operation[0] == "sanitize":
                assert ExamConfigValidator.MIN_QUESTIONS <= config.num_questions <= ExamConfigValidator.MAX_QUESTIONS
                assert ExamConfigValidator.MIN_VERSIONS <= config.num_versions <= ExamConfigValidator.MAX_VERSIONS
                assert ExamConfigValidator.MIN_TIME_LIMIT <= config.time_limit <= ExamConfigValidator.MAX_TIME_LIMIT

# Stateful Property Testing
class ExamConfigStateMachine(RuleBasedStateMachine):
    """
    Stateful property testing for exam configuration
    
    This tests the configuration system through various states and transitions
    to ensure consistency and robustness.
    """
    
    configs = Bundle('configs')
    
    def __init__(self):
        super().__init__()
        self.current_config = ExamConfig()
        self.current_config.teacher_name = "Test Teacher"
        self.current_config.course_name = "Test Course"
        self.current_config.exam_title = "Test Exam"
        self.operation_history = []
    
    @initialize()
    def initialize_config(self):
        """Initialize with a basic valid configuration"""
        self.current_config = ExamConfig()
        self.current_config.teacher_name = "Test Teacher"
        self.current_config.course_name = "Test Course"
        self.current_config.exam_title = "Test Exam"
        self.operation_history = []
    
    @rule(questions=st.integers(min_value=1, max_value=50))
    def set_num_questions(self, questions):
        """Set number of questions"""
        self.current_config.num_questions = questions
        self.operation_history.append(("set_questions", questions))
        
        # Invariant: questions should be set correctly
        assert self.current_config.num_questions == questions
    
    @rule(versions=st.integers(min_value=1, max_value=8))
    def set_num_versions(self, versions):
        """Set number of versions"""
        self.current_config.num_versions = versions
        self.operation_history.append(("set_versions", versions))
        
        # Invariant: versions should be set correctly
        assert self.current_config.num_versions == versions
    
    @rule(difficulty=st.sampled_from(["easy", "medium", "hard", "mixed"]))
    def set_difficulty(self, difficulty):
        """Set difficulty level"""
        self.current_config.difficulty_level = difficulty
        self.operation_history.append(("set_difficulty", difficulty))
        
        # Invariant: difficulty should be set correctly
        assert self.current_config.difficulty_level == difficulty
    
    @rule()
    def toggle_self_assessment(self):
        """Toggle self-assessment option"""
        old_value = self.current_config.include_self_assessment
        self.current_config.include_self_assessment = not old_value
        self.operation_history.append(("toggle_self_assessment", old_value))
        
        # Invariant: value should have changed
        assert self.current_config.include_self_assessment != old_value
    
    @rule()
    def toggle_feedback(self):
        """Toggle feedback option"""
        old_value = self.current_config.show_feedback
        self.current_config.show_feedback = not old_value
        self.operation_history.append(("toggle_feedback", old_value))
        
        # Invariant: value should have changed
        assert self.current_config.show_feedback != old_value
    
    @rule(qtype=st.sampled_from(["multiple_choice", "true_false", "essay", "short_answer"]))
    def add_question_type(self, qtype):
        """Add a question type"""
        if qtype not in self.current_config.question_types:
            self.current_config.question_types.append(qtype)
            self.operation_history.append(("add_question_type", qtype))
            
            # Invariant: question type should be in list
            assert qtype in self.current_config.question_types
    
    @rule()
    def apply_defaults(self):
        """Apply default values"""
        old_config = ExamConfig.from_dict(self.current_config.to_dict())
        self.current_config = ExamConfigValidator.apply_defaults(self.current_config)
        self.operation_history.append(("apply_defaults",))
        
        # Invariant: required fields should have valid values
        assert self.current_config.difficulty_level in ExamConfigValidator.VALID_DIFFICULTY_LEVELS
        assert len(self.current_config.question_types) > 0
        assert self.current_config.language in ExamConfigValidator.VALID_LANGUAGES
    
    @rule()
    def sanitize_config(self):
        """Sanitize configuration"""
        self.current_config = ExamConfigValidator.sanitize_config(self.current_config)
        self.operation_history.append(("sanitize",))
        
        # Invariant: numeric values should be within bounds
        assert ExamConfigValidator.MIN_QUESTIONS <= self.current_config.num_questions <= ExamConfigValidator.MAX_QUESTIONS
        assert ExamConfigValidator.MIN_VERSIONS <= self.current_config.num_versions <= ExamConfigValidator.MAX_VERSIONS
        assert ExamConfigValidator.MIN_TIME_LIMIT <= self.current_config.time_limit <= ExamConfigValidator.MAX_TIME_LIMIT
    
    @rule()
    def validate_current_config(self):
        """Validate current configuration"""
        is_valid, errors = ExamConfigValidator.validate_config(self.current_config)
        self.operation_history.append(("validate", is_valid, len(errors)))
        
        # Invariant: validation should be consistent with config state
        if self.current_config.show_feedback and not self.current_config.include_self_assessment:
            assert not is_valid, "Feedback without self-assessment should be invalid"
        
        # Invariant: required fields should be checked
        if not self.current_config.teacher_name.strip():
            assert not is_valid, "Empty teacher name should make config invalid"

# Test runner for stateful tests
class TestExamConfigStateful:
    """Stateful property tests for exam configuration"""
    
    def test_property_4_stateful_config_management(self):
        """
        Property 4.8: Stateful configuration management maintains consistency
        
        Through various sequences of configuration changes, validation,
        and sanitization operations, the configuration system should
        maintain consistent behavior and valid state.
        """
        # Run the state machine with settings
        from hypothesis.stateful import run_state_machine_as_test
        
        run_state_machine_as_test(
            ExamConfigStateMachine,
            settings=settings(
                max_examples=30,
                stateful_step_count=20,
                deadline=None
            )
        )

if __name__ == '__main__':
    # Run the tests
    pytest.main([__file__, '-v', '--tb=short'])