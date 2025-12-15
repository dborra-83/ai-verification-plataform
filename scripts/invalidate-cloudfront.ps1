#!/usr/bin/env pwsh

# Script para invalidar el cache de CloudFront
# Útil cuando se hacen cambios solo al frontend

Write-Host "☁️ Invalidating CloudFront cache..." -ForegroundColor Yellow

# Obtener el Distribution ID
$distributionId = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue" --output text

if (-not $distributionId -or $distributionId -eq "None") {
    Write-Host "❌ CloudFront distribution not found" -ForegroundColor Red
    exit 1
}

Write-Host "🔍 Distribution ID: $distributionId" -ForegroundColor Cyan

# Crear invalidación
$invalidationResult = aws cloudfront create-invalidation --distribution-id $distributionId --paths "/*" --output json | ConvertFrom-Json

if ($invalidationResult) {
    $invalidationId = $invalidationResult.Invalidation.Id
    Write-Host "✅ CloudFront invalidation created successfully" -ForegroundColor Green
    Write-Host "🆔 Invalidation ID: $invalidationId" -ForegroundColor Cyan
    Write-Host "⏳ Cache invalidation may take 5-15 minutes to complete" -ForegroundColor Yellow
    
    # Mostrar URL actualizada
    $frontendUrl = aws cloudformation describe-stacks --stack-name AiVerificationPlatformStack --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text
    Write-Host "🌐 Frontend URL: $frontendUrl" -ForegroundColor Green
} else {
    Write-Host "❌ Failed to create CloudFront invalidation" -ForegroundColor Red
    exit 1
}