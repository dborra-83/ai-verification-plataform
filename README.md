# AI Verification Platform

A comprehensive AWS-based platform for detecting AI-generated content in academic documents using Amazon Bedrock and modern web technologies.

## 🎯 Overview

This platform provides educators and institutions with powerful tools to identify AI-generated content in student submissions. Built entirely on AWS services, it offers real-time analysis, comprehensive analytics, and a modern, responsive interface.

## ✨ Features

### 🤖 AI Content Detection

- **Amazon Bedrock Integration**: Uses Claude 3.5 Sonnet for advanced AI detection
- **Real-time Analysis**: Immediate feedback with confidence scores
- **Spanish Language Support**: Optimized prompts and responses in Spanish
- **Comprehensive Scoring**: AI likelihood, originality, and confidence metrics

### 📊 Analytics Dashboard

- **Dynamic KPIs**: Configurable metrics and time periods
- **Risk Assessment**: Customizable thresholds for high-risk content
- **Historical Analysis**: Complete audit trail of all analyses
- **Export Capabilities**: Download results and reports

### 🎨 Modern Interface

- **Responsive Design**: Works seamlessly on desktop and mobile
- **Dark/Light Themes**: User-configurable appearance
- **Accessibility**: WCAG compliant with customizable font sizes
- **Intuitive UX**: Clean, professional interface built with Bootstrap 5

### ⚙️ Configuration

- **Flexible Settings**: Customizable thresholds and preferences
- **Local Storage**: Settings persist across sessions
- **Real-time Updates**: Changes apply immediately
- **System Information**: Transparent about model versions and status

## 🏗️ Architecture

### Frontend

- **HTML5/CSS3/JavaScript**: Modern web standards
- **Bootstrap 5**: Responsive UI framework
- **SweetAlert2**: Enhanced user interactions
- **Local Storage**: Client-side configuration persistence

### Backend

- **AWS Lambda**: Serverless Python 3.11 functions
- **Amazon API Gateway**: RESTful API endpoints
- **Amazon S3**: Secure file storage and static hosting
- **Amazon DynamoDB**: NoSQL database for results
- **Amazon Bedrock**: AI/ML inference service

### Infrastructure

- **AWS CDK**: Infrastructure as Code (TypeScript)
- **CloudFormation**: Automated resource management
- **IAM**: Fine-grained security permissions
- **CloudWatch**: Monitoring and logging

## 🚀 Quick Start

### Prerequisites

```bash
# Required tools
- AWS CLI (configured with appropriate permissions)
- Node.js 18+ and npm
- Python 3.11+
- AWS CDK CLI (npm install -g aws-cdk)
```

### Installation

```bash
# Clone the repository
git clone https://github.com/dborra-83/ai-verification-plataform.git
cd ai-verification-plataform

# Install dependencies
npm install

# Bootstrap CDK (first time only)
cdk bootstrap
```

### Deployment

```bash
# Deploy infrastructure and backend
npm run deploy

# Deploy frontend
npm run deploy:frontend
```

### Access

1. Open the provided frontend URL
2. Create a new account on the signup page
3. Verify your email with the confirmation code
4. Login with your credentials
5. Upload PDF documents for analysis
6. Configure settings as needed

## 🔐 Authentication

### Account Requirements

- Valid email address (for verification)
- Password with minimum 8 characters including:
  - Uppercase letter
  - Lowercase letter
  - Number
  - Special character (!@#$%^&\*)

### Features

- Email verification for new accounts
- Secure JWT token-based authentication
- Automatic token refresh
- Password recovery via email

## 📖 Usage Guide

### Document Analysis

1. **Upload**: Drag & drop or select PDF files
2. **Metadata**: Fill in student and assignment information
3. **Analyze**: Click "Iniciar Análisis" to process
4. **Results**: View detailed analysis with scores and recommendations

### Dashboard Features

- **KPI Cards**: Total analyses, average scores, risk metrics
- **Recent Activity**: Latest analysis results
- **Historical Data**: Complete analysis history with filters
- **Export Options**: Download individual results or reports

### Configuration Options

- **Dashboard Settings**: KPI periods, items per page, auto-refresh
- **Interface Settings**: Theme, font size, animations
- **Analysis Settings**: Risk thresholds, confidence levels

## 🔧 Configuration

### Environment Variables

The platform uses AWS service discovery and doesn't require manual environment configuration.

### Customization

- **Thresholds**: Adjust AI detection sensitivity in settings
- **Branding**: Modify CSS variables for custom colors
- **Prompts**: Update analysis prompts in `backend/analysis/analysis_handler.py`

## 📁 Project Structure

```
ai-verification-platform/
├── frontend/                 # Web interface
│   ├── css/                 # Stylesheets (styles.css + doc-automation.css)
│   ├── js/                  # JavaScript modules
│   └── *.html              # HTML pages
├── backend/                 # Lambda functions
│   ├── analysis/           # AI detection service
│   ├── query/              # Data retrieval service
│   ├── upload/             # File upload service
│   ├── exam-generation/    # Exam generator service
│   ├── exam-history/       # Exam history service
│   ├── exam-topic-extraction/ # Topic extraction service
│   ├── admin/              # Admin & audit service
│   ├── authorizer/         # Cognito JWT authorizer
│   └── document_automation/ # Document Automation module (NEW)
│       ├── handler.py      # Main Lambda: Textract + Bedrock orchestration
│       ├── prompts.py      # All Bedrock prompts (editable)
│       └── validators.py   # Institutional validation rules
├── infrastructure/         # AWS CDK code
├── scripts/               # Deployment utilities
│   ├── generate_demo_docs.py      # Generates 4 sample PDFs
│   └── setup-doc-automation.ps1  # Setup script for the new module
└── package.json          # Project configuration
```

## 🆕 Módulo: Automatización Inteligente de Documentos

Nuevo módulo para universidades que automatiza la revisión de documentos en procesos de admisión.

### Flujo

1. El documento (PDF/JPG/PNG) se sube a S3 vía URL pre-firmada
2. Amazon Textract extrae el texto con OCR
3. Amazon Bedrock (Claude 3.5 Sonnet) clasifica el tipo de documento
4. Bedrock extrae campos estructurados según el tipo
5. Se aplican reglas de validación institucionales configurables
6. Bedrock detecta hallazgos y recomienda la acción operativa
7. El resultado se guarda en DynamoDB y se retorna al frontend

### Endpoints

| Método | Path                        | Descripción                            |
| ------ | --------------------------- | -------------------------------------- |
| POST   | `/doc-automation/upload`    | Genera URL pre-firmada para subir a S3 |
| POST   | `/doc-automation/analyze`   | Ejecuta el flujo completo de análisis  |
| GET    | `/doc-automation/history`   | Lista documentos procesados            |
| GET    | `/doc-automation/demo-docs` | Lista documentos de ejemplo en S3      |

### Setup del módulo

```bash
# Después de hacer cdk deploy, ejecutar:
npm run setup:doc-automation

# O manualmente:
pip install fpdf2
python scripts/generate_demo_docs.py
aws s3 cp scripts/demo_docs/ s3://[BUCKET]/demo-docs/ --recursive
```

### Páginas frontend

- `doc-automation-landing.html` — Landing page explicativa
- `doc-automation.html` — Interfaz principal de procesamiento
- `doc-generator.html` — Generador de documentos de ejemplo (jsPDF, sin Lambda)

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Run tests (if available)
npm test

# Deploy to development environment
npm run deploy
```

### Adding Features

1. Update infrastructure in `infrastructure/`
2. Implement backend logic in `backend/`
3. Update frontend in `frontend/`
4. Test thoroughly before deployment

## 🔒 Security

- **IAM Roles**: Least privilege access principles
- **API Security**: CORS configured for specific origins
- **Data Encryption**: At rest and in transit
- **Input Validation**: Comprehensive sanitization
- **Audit Logging**: Complete activity tracking

## 📊 Monitoring

- **CloudWatch Logs**: Detailed application logging
- **Error Tracking**: Comprehensive error handling
- **Performance Metrics**: Response times and success rates
- **Usage Analytics**: Built-in dashboard metrics

## 💰 Cost Estimation

### AWS Services Used (Optimized for Low Cost)

- **S3**: Static hosting + PDF storage
- **API Gateway**: RESTful API endpoints
- **Lambda**: Serverless compute
- **DynamoDB**: NoSQL database (on-demand)
- **Bedrock**: AI inference (Claude 3.5 Sonnet)

### Estimated Monthly Costs (100 analyses/month)

- S3: ~$1-2
- Lambda: ~$1-3
- DynamoDB: ~$1-2
- API Gateway: ~$1
- Bedrock: ~$5-10 (depends on document size)

**Total: $9-18/month**

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Diego Borra**  
Email: diego.borra@cloudhesive.com  
Company: CloudHesive

## 🙏 Acknowledgments

- Amazon Web Services for the robust cloud platform
- Anthropic for the Claude AI models
- Bootstrap team for the excellent UI framework
- Open source community for various tools and libraries

## 📞 Support

For questions, issues, or feature requests:

- Create an issue in this repository
- Contact: diego.borra@cloudhesive.com

## 🔄 Cleanup

To remove all AWS resources:

```bash
npm run destroy
```

---

**Built with ❤️ using AWS and modern web technologies**
