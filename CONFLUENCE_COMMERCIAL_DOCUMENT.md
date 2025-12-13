# Plataforma de Verificación de IA - Documento Comercial

## 🎯 Resumen Ejecutivo

La **Plataforma de Verificación de IA** es una solución integral desarrollada 100% en AWS que permite a instituciones educativas detectar contenido generado por inteligencia artificial en documentos académicos. Utilizando Amazon Bedrock con Claude 3.5 Sonnet, la plataforma ofrece análisis en tiempo real con alta precisión y una interfaz moderna y fácil de usar.

### Valor de Negocio
- **Integridad Académica**: Mantiene los estándares de calidad educativa
- **Eficiencia Operativa**: Automatiza el proceso de revisión de documentos
- **Escalabilidad**: Arquitectura serverless que crece con la demanda
- **Costo Optimizado**: Modelo de pago por uso, estimado en $9-18/mes para 100 análisis

---

## 🚀 Características Principales

### 🤖 Detección Avanzada de IA
- **Motor de IA**: Amazon Bedrock con Claude 3.5 Sonnet
- **Análisis Multilingüe**: Optimizado para contenido en español
- **Métricas Precisas**: 
  - Probabilidad de IA (0-100%)
  - Puntaje de Originalidad (0-100%)
  - Nivel de Confianza (0-100%)
- **Detección de Patrones**: Identifica estructuras típicas de contenido generado por IA

### 📊 Dashboard Analítico
- **7 KPIs en Tiempo Real**:
  - Total de Análisis (período configurable)
  - Promedio de Score de IA
  - Estado del Sistema
  - Análisis de Alto Riesgo (>70% IA)
  - Promedio de Originalidad
  - Análisis del Día
  - Confianza Promedio
- **Filtros Avanzados**: Por fecha, curso, estado
- **Exportación**: Descarga de reportes en PDF

### 🎨 Interfaz Moderna
- **Diseño Responsivo**: Compatible con desktop y móvil
- **Temas Personalizables**: Claro, oscuro y automático
- **Accesibilidad**: Cumple estándares WCAG
- **UX Intuitiva**: Interfaz limpia construida con Bootstrap 5

### ⚙️ Configuración Flexible
- **Umbrales Personalizables**: Ajuste de sensibilidad de detección
- **Períodos de KPI**: 7, 15, 30, 60, 90 días
- **Preferencias de Usuario**: Tamaño de fuente, animaciones, sonidos
- **Persistencia Local**: Configuraciones guardadas automáticamente

---

## 🏗️ Arquitectura Técnica

### Frontend
- **Tecnologías**: HTML5, CSS3, JavaScript ES6+
- **Framework UI**: Bootstrap 5
- **Interacciones**: SweetAlert2
- **Almacenamiento**: LocalStorage para configuraciones

### Backend
- **Compute**: AWS Lambda (Python 3.11)
- **API**: Amazon API Gateway (REST)
- **Storage**: Amazon S3 (archivos y hosting estático)
- **Database**: Amazon DynamoDB (NoSQL)
- **IA**: Amazon Bedrock (Claude 3.5 Sonnet)

### Infraestructura
- **IaC**: AWS CDK (TypeScript)
- **Deployment**: CloudFormation
- **Security**: IAM con principio de menor privilegio
- **Monitoring**: CloudWatch

---

## 💰 Modelo de Costos

### Estructura de Precios (Estimación mensual para 100 análisis)
| Servicio | Costo Estimado | Descripción |
|----------|----------------|-------------|
| Amazon S3 | $1-2 | Almacenamiento de archivos y hosting |
| AWS Lambda | $1-3 | Procesamiento serverless |
| DynamoDB | $1-2 | Base de datos NoSQL |
| API Gateway | $1 | Endpoints REST |
| Amazon Bedrock | $5-10 | Análisis de IA (variable por tamaño) |
| **TOTAL** | **$9-18** | **Costo total mensual** |

### Ventajas del Modelo
- ✅ **Pago por Uso**: Solo pagas por lo que consumes
- ✅ **Sin Infraestructura**: No hay servidores que mantener
- ✅ **Escalabilidad Automática**: Crece con la demanda
- ✅ **Alta Disponibilidad**: 99.9% uptime garantizado por AWS

---

## 🎯 Casos de Uso

### Instituciones Educativas
- **Universidades**: Verificación de tesis y trabajos de grado
- **Colegios**: Análisis de ensayos y proyectos
- **Centros de Formación**: Evaluación de contenido académico

### Beneficios por Rol
- **Docentes**: Herramienta de apoyo para evaluación
- **Administradores**: Métricas y reportes institucionales
- **Estudiantes**: Transparencia en el proceso de evaluación

---

## 🔒 Seguridad y Cumplimiento

### Medidas de Seguridad
- **Encriptación**: Datos en tránsito y en reposo
- **Autenticación**: Sistema de login seguro
- **Autorización**: Roles y permisos granulares
- **Auditoría**: Logs completos de actividad
- **CORS**: Configuración restrictiva de orígenes

### Cumplimiento
- **GDPR**: Manejo responsable de datos personales
- **SOC 2**: Infraestructura AWS certificada
- **ISO 27001**: Estándares de seguridad de información

---

## 🚀 Demo en Vivo

### Acceso a la Plataforma
**URL**: http://ai-verification-frontend-520754296204-us-east-1.amazonaws.com

**Credenciales de Demo**:
- Usuario: `admin`
- Contraseña: `admin`

### API Endpoint
**Base URL**: https://9o3urlbyuc.execute-api.us-east-1.amazonaws.com/prod/

---

## 📖 Guía de Uso Paso a Paso

### 1. Acceso al Sistema
1. Abrir la URL de la plataforma en el navegador
2. Ingresar credenciales: `admin` / `admin`
3. Hacer clic en "Iniciar Sesión"

### 2. Dashboard Principal
- **Vista General**: 7 KPIs principales actualizados en tiempo real
- **Análisis Recientes**: Tabla con los últimos documentos procesados
- **Estado del Sistema**: Indicador de operatividad

### 3. Nuevo Análisis
1. Hacer clic en "Nuevo Análisis" en el menú lateral
2. **Subir Documento**:
   - Arrastrar archivo PDF o hacer clic para seleccionar
   - Tamaño máximo: 10MB
   - Formato soportado: PDF únicamente
3. **Completar Metadatos**:
   - Nombre del Estudiante (obligatorio)
   - Curso (obligatorio)
   - Nombre de la Tarea (obligatorio)
   - ID del Estudiante (opcional)
   - Materia (opcional)
4. Hacer clic en "Iniciar Análisis"
5. **Esperar Procesamiento**: 30-60 segundos aproximadamente

### 4. Visualización de Resultados
- **Scores Principales**:
  - Probabilidad de IA: 0-100% (rojo >70%, amarillo 40-70%, verde <40%)
  - Originalidad: 0-100%
  - Confianza: 0-100%
- **Análisis Detallado**:
  - Resumen del análisis
  - Señales detectadas con evidencia
  - Recomendaciones específicas
  - Limitaciones del análisis

### 5. Historial y Gestión
1. Ir a "Historial" en el menú lateral
2. **Filtros Disponibles**:
   - Rango de fechas
   - Curso específico
   - Estado del análisis
3. **Acciones por Documento**:
   - Ver detalle completo
   - Descargar reporte PDF
   - Eliminar análisis

### 6. Configuración
1. Acceder a "Configuración" en el menú lateral
2. **Configuración del Dashboard**:
   - Período de KPIs: 7, 15, 30, 60, 90 días
   - Elementos por página: 5, 10, 20, 50
   - Umbral de alto riesgo: 50-90%
   - Auto-actualización: activar/desactivar
3. **Configuración de Interfaz**:
   - Tema: claro, oscuro, automático
   - Tamaño de fuente: pequeño, normal, grande
   - Animaciones: activar/desactivar
   - Sonidos: activar/desactivar
4. Hacer clic en "Guardar Configuración"

---

## 📊 Interpretación de Resultados

### Puntajes de IA
- **0-39%**: ✅ **Bajo Riesgo** - Probablemente contenido humano
- **40-69%**: ⚠️ **Riesgo Medio** - Requiere revisión manual
- **70-100%**: 🚨 **Alto Riesgo** - Muy probable contenido de IA

### Señales Detectadas
- **Estructura Uniforme**: Párrafos de longitud similar
- **Conectores Excesivos**: Uso repetitivo de transiciones
- **Vocabulario Formal**: Lenguaje demasiado elaborado
- **Patrones Sintácticos**: Repetición de estructuras
- **Ausencia de Errores**: Perfección no natural

### Recomendaciones
- **Revisión Manual**: Para casos de riesgo medio-alto
- **Entrevista Personal**: Verificar conocimiento del tema
- **Análisis Comparativo**: Contrastar con trabajos previos
- **Herramientas Adicionales**: Usar múltiples métodos de verificación

---

## 🔧 Soporte Técnico

### Información del Desarrollador
**Autor**: Diego Borra  
**Email**: diego.borra@cloudhesive.com  
**Empresa**: CloudHesive  

### Repositorio del Proyecto
**GitHub**: https://github.com/dborra-83/ai-verification-plataform

### Documentación Técnica
- **README**: Guía completa de instalación y desarrollo
- **CONTRIBUTING**: Guías para contribuir al proyecto
- **LICENSE**: MIT License para uso comercial

---

## 🚀 Próximos Pasos

### Funcionalidades Planificadas
- **Integración con LMS**: Moodle, Canvas, Blackboard
- **API Pública**: Para integraciones personalizadas
- **Análisis Batch**: Procesamiento masivo de documentos
- **Reportes Avanzados**: Analytics institucionales
- **Múltiples Idiomas**: Soporte para inglés y otros idiomas

### Escalabilidad
- **Multi-tenant**: Soporte para múltiples instituciones
- **SSO Integration**: Active Directory, SAML, OAuth
- **Custom Branding**: Personalización por institución
- **Advanced Analytics**: Machine Learning para mejores insights

---

## 📞 Contacto y Ventas

Para más información, demos personalizadas o implementación:

**Email**: diego.borra@cloudhesive.com  
**Empresa**: CloudHesive  
**Disponibilidad**: Lunes a Viernes, 9:00 AM - 6:00 PM  

### Proceso de Implementación
1. **Demo Personalizada**: Presentación adaptada a sus necesidades
2. **Análisis de Requerimientos**: Evaluación de casos de uso específicos
3. **Propuesta Técnica**: Arquitectura y costos detallados
4. **Implementación**: Despliegue en su cuenta AWS
5. **Capacitación**: Entrenamiento para usuarios finales
6. **Soporte Continuo**: Mantenimiento y actualizaciones

---

*Documento generado el 12 de diciembre de 2025 - Versión 1.0*