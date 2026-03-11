#!/usr/bin/env pwsh
# setup-doc-automation.ps1
# Configura el módulo Document Automation: genera PDFs de ejemplo y los sube a S3

param(
    [string]$BucketName = "",
    [string]$DemoPrefix = "demo-docs/"
)

Write-Host "📄 Configurando módulo Document Automation..." -ForegroundColor Cyan

# Obtener bucket name si no se pasó como parámetro
if (-not $BucketName) {
    $BucketName = aws cloudformation describe-stacks `
        --stack-name AiVerificationPlatformStack `
        --query "Stacks[0].Outputs[?OutputKey=='UploadBucketName'].OutputValue" `
        --output text
}

if (-not $BucketName -or $BucketName -eq "None") {
    Write-Host "❌ No se encontró el bucket. Asegúrate de haber desplegado el stack primero." -ForegroundColor Red
    exit 1
}

Write-Host "🪣 Bucket: $BucketName" -ForegroundColor Green

# Verificar Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Python no encontrado. Instala Python 3.8+ primero." -ForegroundColor Red
    exit 1
}

# Instalar fpdf2 si no está disponible
Write-Host "📦 Verificando dependencia fpdf2..." -ForegroundColor Yellow
python -c "import fpdf" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "📦 Instalando fpdf2..." -ForegroundColor Yellow
    pip install fpdf2 --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error instalando fpdf2" -ForegroundColor Red
        exit 1
    }
}
Write-Host "✅ fpdf2 disponible" -ForegroundColor Green

# Generar PDFs de ejemplo
Write-Host "📝 Generando documentos de ejemplo..." -ForegroundColor Yellow
python scripts/generate_demo_docs.py
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error generando documentos" -ForegroundColor Red
    exit 1
}

# Subir a S3
Write-Host "☁️  Subiendo documentos a S3..." -ForegroundColor Yellow
aws s3 cp scripts/demo_docs/ "s3://$BucketName/$DemoPrefix" --recursive --content-type "application/pdf"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error subiendo documentos a S3" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Módulo Document Automation configurado correctamente" -ForegroundColor Green
Write-Host "   Bucket: $BucketName" -ForegroundColor White
Write-Host "   Prefijo S3: $DemoPrefix" -ForegroundColor White
Write-Host "   Documentos subidos:" -ForegroundColor White
Write-Host "     - certificado_notas_ejemplo.pdf" -ForegroundColor Gray
Write-Host "     - documento_identidad_ejemplo.pdf" -ForegroundColor Gray
Write-Host "     - formulario_inscripcion_ejemplo.pdf" -ForegroundColor Gray
Write-Host "     - carta_motivacion_ejemplo.pdf" -ForegroundColor Gray
Write-Host ""
Write-Host "🌐 Abre doc-automation.html para probar el módulo" -ForegroundColor Cyan
