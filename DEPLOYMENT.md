# Guía de Deployment - AI Verification Platform

## Prerrequisitos

### 1. Software Requerido
- **Node.js** 18+ y npm
- **AWS CLI** configurado con credenciales válidas
- **Python** 3.11+ (para las Lambda functions)
- **AWS CDK** 2.100.0+ (se instala automáticamente si no está presente)

### 2. Configuración de AWS

#### Configurar AWS CLI
```bash
aws configure
```

Proporciona:
- AWS Access Key ID
- AWS Secret Access Key  
- Default region (ej: us-east-1)
- Default output format (json)

#### Verificar Acceso a Bedrock
Asegúrate de tener acceso al modelo Claude 3 Haiku:

1. Ve a la consola de Amazon Bedrock
2. Navega a "Model access" 
3. Solicita acceso a `anthropic.claude-3-haiku-20240307-v1:0`
4. Espera la aprobación (puede tomar unos minutos)

## Deployment

### Opción 1: Script Automático (Recomendado)

**Windows:**
```powershell
.\deploy.ps1
```

**Linux/macOS:**
```bash
chmod +x deploy.sh
./deploy.sh
```

### Opción 2: Comandos Manuales

```bash
# 1. Instalar dependencias
npm install

# 2. Bootstrap CDK (solo primera vez)
npx cdk bootstrap

# 3. Desplegar infraestructura
npm run deploy

# 4. Desplegar frontend
npm run deploy:frontend
```

### Opción 3: Deployment Completo
```bash
npm run deploy:all
```

## Verificación del Deployment

### 1. Obtener URLs
Después del deployment, obtendrás:
- **Frontend URL**: Para acceder a la aplicación web
- **API URL**: Endpoint de la API (usado internamente)

### 2. Probar la Aplicación
1. Abre la Frontend URL en tu navegador
2. Login con credenciales: `admin` / `admin`
3. Sube un PDF de prueba
4. Verifica que el análisis se complete correctamente

## Estructura de Recursos AWS

### Recursos Creados
- **S3 Buckets**: 
  - Frontend hosting
  - PDF uploads
- **Lambda Functions**:
  - Upload presign handler
  - Analysis processor
  - Query handler
- **API Gateway**: HTTP API con CORS
- **DynamoDB**: Tabla de resultados con GSI
- **IAM Roles**: Permisos mínimos para Lambda

### Costos Estimados
Para 100 análisis/mes:
- S3: ~$1-2/mes
- Lambda: ~$1-3/mes  
- DynamoDB: ~$1-2/mes
- API Gateway: ~$1/mes
- Bedrock: ~$5-10/mes
- **Total: $9-18/mes**

## Troubleshooting

### Error: "Access Denied" en Bedrock
**Solución**: Verifica acceso al modelo Claude 3 Haiku en la consola de Bedrock

### Error: "Bucket already exists"
**Solución**: Los nombres incluyen account-id y region para evitar conflictos. Si persiste, cambia el nombre en el stack.

### Frontend no carga
**Soluciones**:
- Verifica que el bucket S3 tiene public read access
- Revisa la configuración de CORS en API Gateway
- Verifica que config.js tiene la URL correcta de la API

### Lambda timeout
**Soluciones**:
- PDFs muy grandes pueden causar timeout
- Considera aumentar el timeout en el stack CDK
- Verifica los logs de CloudWatch

### Error de CORS
**Soluciones**:
- Verifica que la URL del frontend está en la configuración de CORS
- Asegúrate de que el frontend usa la URL correcta de la API

## Logs y Monitoreo

### CloudWatch Logs
Cada Lambda function tiene su grupo de logs:
- `/aws/lambda/AiVerificationPlatformStack-UploadLambda-*`
- `/aws/lambda/AiVerificationPlatformStack-AnalysisLambda-*`
- `/aws/lambda/AiVerificationPlatformStack-QueryLambda-*`

### Monitoreo de Costos
- Configura alertas de billing en CloudWatch
- Monitorea el uso de Bedrock tokens
- Revisa el almacenamiento de S3 regularmente

## Limpieza de Recursos

### Eliminar Todo
```bash
npm run destroy
```

### Eliminar Solo el Frontend
```bash
aws s3 rm s3://BUCKET-NAME --recursive
```

### Verificar Eliminación
```bash
aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack
```

## Actualizaciones

### Actualizar Código
```bash
# Actualizar backend
npm run deploy

# Actualizar frontend
npm run deploy:frontend
```

### Actualizar Dependencias
```bash
npm update
npm run deploy:all
```

## Seguridad

### Mejores Prácticas Implementadas
- IAM roles con permisos mínimos
- CORS configurado correctamente
- Pre-signed URLs para uploads seguros
- Validación de tipos de archivo

### Para Producción (Fase 2)
- Implementar Amazon Cognito para autenticación real
- Agregar rate limiting
- Configurar WAF para protección adicional
- Implementar logging de auditoría

## Soporte

### Recursos Útiles
- [Documentación de AWS CDK](https://docs.aws.amazon.com/cdk/)
- [Amazon Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)

### Contacto
Este es un proyecto demo. Para uso en producción, considera contratar soporte profesional de AWS.