# Contributing to AI Verification Platform

Thank you for your interest in contributing to the AI Verification Platform! This document provides guidelines and information for contributors.

## 🤝 How to Contribute

### Reporting Issues
- Use the GitHub issue tracker to report bugs
- Provide detailed information about the issue
- Include steps to reproduce the problem
- Specify your environment (OS, Node.js version, AWS region)

### Suggesting Features
- Open an issue with the "enhancement" label
- Describe the feature and its benefits
- Explain the use case and expected behavior
- Consider the impact on existing functionality

### Code Contributions

#### Getting Started
1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature/fix
4. Make your changes
5. Test thoroughly
6. Submit a pull request

#### Development Setup
```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/ai-verification-plataform.git
cd ai-verification-plataform

# Install dependencies
npm install

# Set up AWS credentials
aws configure

# Deploy to development environment
npm run deploy
```

#### Code Style
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Ensure TypeScript types are properly defined
- Follow Python PEP 8 for backend code

#### Testing
- Test your changes thoroughly
- Verify both frontend and backend functionality
- Test with different PDF types and sizes
- Ensure configuration changes work correctly

#### Pull Request Process
1. Update documentation if needed
2. Add tests for new functionality
3. Ensure all existing tests pass
4. Update the README if necessary
5. Submit a pull request with a clear description

## 🏗️ Architecture Guidelines

### Frontend Development
- Use modern JavaScript (ES6+)
- Follow Bootstrap 5 conventions
- Maintain responsive design principles
- Ensure accessibility compliance
- Use SweetAlert2 for user interactions

### Backend Development
- Write clean, maintainable Python code
- Use proper error handling
- Follow AWS Lambda best practices
- Implement proper logging
- Validate all inputs

### Infrastructure Changes
- Use AWS CDK best practices
- Follow least privilege principles for IAM
- Document any new AWS services used
- Consider cost implications
- Test infrastructure changes thoroughly

## 📋 Development Guidelines

### Commit Messages
Use clear, descriptive commit messages:
```
feat: add dark theme support
fix: resolve PDF parsing issue
docs: update installation instructions
refactor: improve error handling
```

### Branch Naming
Use descriptive branch names:
```
feature/dark-theme
bugfix/pdf-parsing
enhancement/dashboard-kpis
```

### Code Review
- All changes require code review
- Address reviewer feedback promptly
- Ensure CI/CD checks pass
- Maintain backward compatibility when possible

## 🔒 Security Considerations

- Never commit AWS credentials or secrets
- Follow AWS security best practices
- Validate and sanitize all user inputs
- Use HTTPS for all communications
- Implement proper error handling without exposing sensitive information

## 📚 Documentation

- Update README.md for significant changes
- Document new configuration options
- Add inline code comments for complex logic
- Update API documentation if applicable
- Include examples for new features

## 🐛 Bug Reports

When reporting bugs, please include:
- Clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, browser, AWS region)
- Screenshots or logs if applicable

## 💡 Feature Requests

For feature requests, please provide:
- Clear description of the feature
- Use case and benefits
- Proposed implementation approach
- Potential impact on existing functionality

## 📞 Getting Help

- Check existing issues and documentation first
- Join discussions in GitHub issues
- Contact the maintainer: diego.borra@cloudhesive.com

## 🎯 Roadmap

Current priorities:
1. Enhanced AI detection accuracy
2. Multi-language support
3. Batch processing capabilities
4. Advanced analytics features
5. Mobile app development

## 📄 License

By contributing to this project, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to the AI Verification Platform! 🚀