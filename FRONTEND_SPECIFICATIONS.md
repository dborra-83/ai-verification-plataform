# Especificaciones de Frontend - EduTech AI Platform

## 1. Stack Tecnológico

### Frameworks y Librerías

- **Bootstrap 5.3.2** - Framework CSS principal
- **Bootstrap Icons 1.11.1** - Iconografía
- **Google Fonts (Inter)** - Tipografía
- **SweetAlert2** - Alertas y modales
- **Chart.js** - Gráficos (opcional)

### CDN Links

```html
<!-- Bootstrap 5 CSS -->
<link
  href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css"
  rel="stylesheet"
/>
<!-- Bootstrap Icons -->
<link
  href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css"
  rel="stylesheet"
/>
<!-- Google Fonts -->
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
  rel="stylesheet"
/>
<!-- SweetAlert2 -->
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<!-- Bootstrap 5 JS -->
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
```

---

## 2. Paleta de Colores (CSS Variables)

```css
:root {
  /* Colores Principales */
  --ch-navy: #000024; /* Azul marino oscuro - Fondos principales */
  --ch-petrol: #0a1732; /* Azul petróleo - Sidebar gradient */
  --ch-blue: #008fd0; /* Azul principal - Botones, links, acciones */
  --ch-ice: #e9f3fa; /* Azul hielo - Fondo general */
  --ch-white: #ffffff; /* Blanco - Cards, contenido */

  /* Colores de Acento */
  --ch-teal: #08bdba; /* Verde azulado - Éxito, positivo */
  --ch-violet: #a56eff; /* Violeta - Info, destacados */
  --ch-pink: #ee5396; /* Rosa - Alertas especiales */
  --ch-gold: #f1c21b; /* Dorado - Advertencias */
  --ch-coral: #ed4739; /* Coral - Errores, peligro */
}
```

### Uso de Colores

| Color          | Variable               | Uso                                         |
| -------------- | ---------------------- | ------------------------------------------- |
| Azul Principal | `--ch-blue` (#008FD0)  | Botones primarios, links, elementos activos |
| Verde Teal     | `--ch-teal` (#08BDBA)  | Éxito, estados positivos, badges success    |
| Dorado         | `--ch-gold` (#F1C21B)  | Advertencias, estados pendientes            |
| Coral          | `--ch-coral` (#ED4739) | Errores, eliminación, peligro               |
| Navy           | `--ch-navy` (#000024)  | Textos principales, headers                 |
| Ice            | `--ch-ice` (#E9F3FA)   | Fondo de página, áreas secundarias          |

---

## 3. Tipografía

```css
body {
  font-family:
    "Inter",
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
}
```

### Tamaños de Fuente

- **Headers (h1)**: 1.4rem - 1.8rem
- **Headers (h2)**: 1.5rem
- **Texto normal**: 1rem (16px base)
- **Texto pequeño**: 0.85rem - 0.9rem
- **Labels**: 0.75rem - 0.8rem
- **KPI Values**: 2.5rem

### Pesos de Fuente

- **Light**: 300
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700

---

## 4. Layout Principal

### Estructura de Página

```html
<div class="app-container">
  <!-- Sidebar (280px fijo) -->
  <nav class="sidebar">
    <div class="sidebar-header">...</div>
    <div class="sidebar-nav">...</div>
  </nav>

  <!-- Contenido Principal -->
  <main class="main-content">
    <div class="topbar">...</div>
    <div class="content-area">...</div>
  </main>
</div>
```

### Dimensiones

- **Sidebar**: 280px ancho fijo
- **Content Area Padding**: 2rem
- **Card Border Radius**: 16px
- **Button Border Radius**: 8px
- **Badge Border Radius**: 20px

---

## 5. Componentes de Sidebar

```css
.sidebar {
  width: 280px;
  background: linear-gradient(180deg, var(--ch-navy) 0%, var(--ch-petrol) 100%);
  color: var(--ch-white);
  position: fixed;
  height: 100vh;
}

.nav-item {
  padding: 0.75rem 1.5rem;
  color: var(--ch-white);
  transition: all 0.3s ease;
}

.nav-item:hover {
  background: rgba(255, 255, 255, 0.1);
  box-shadow: 0 0 20px rgba(0, 143, 208, 0.3);
}

.nav-item.active {
  background: var(--ch-blue);
  border-radius: 25px;
  margin: 0 1rem;
}

.nav-section-header {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
```

---

## 6. Cards y Contenedores

```css
.card {
  background: var(--ch-white);
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: none;
  margin-bottom: 1.5rem;
}

.card-header {
  background: transparent;
  border-bottom: 1px solid #f0f0f0;
  padding: 1.5rem;
}

.card-body {
  padding: 1.5rem;
}
```

### KPI Cards

```css
.kpi-card {
  text-align: center;
  padding: 2rem 1rem;
}

.kpi-value {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--ch-navy);
}

.kpi-label {
  font-size: 0.9rem;
  color: var(--ch-petrol);
  opacity: 0.8;
}
```

---

## 7. Botones

```css
.btn-primary {
  background-color: var(--ch-blue);
  border-color: var(--ch-blue);
  border-radius: 8px;
  padding: 0.75rem 1.5rem;
  font-weight: 500;
}

.btn-primary:hover {
  background-color: #007bb8;
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(0, 143, 208, 0.3);
}

.btn-secondary {
  background-color: var(--ch-teal);
  border-color: var(--ch-teal);
  color: var(--ch-white);
}

.btn-success {
  background-color: var(--ch-teal);
}
.btn-warning {
  background-color: var(--ch-gold);
  color: var(--ch-navy);
}
.btn-danger {
  background-color: var(--ch-coral);
}
```

---

## 8. Formularios

```css
.form-control {
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  padding: 0.75rem 1rem;
}

.form-control:focus {
  border-color: var(--ch-blue);
  box-shadow: 0 0 0 0.2rem rgba(0, 143, 208, 0.25);
}

.form-label {
  color: var(--ch-navy);
  font-weight: 500;
  margin-bottom: 0.5rem;
}
```

---

## 9. Tablas

```css
.table thead th {
  background-color: var(--ch-ice);
  border: none;
  color: var(--ch-navy);
  font-weight: 600;
  padding: 1rem;
}

.table tbody td {
  padding: 1rem;
  border-color: #f0f0f0;
}

.table tbody tr:hover {
  background-color: rgba(0, 143, 208, 0.05);
}
```

---

## 10. Badges y Estados

```css
.badge {
  border-radius: 20px;
  padding: 0.4rem 0.8rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.badge-success {
  background-color: var(--ch-teal);
}
.badge-warning {
  background-color: var(--ch-gold);
  color: var(--ch-navy);
}
.badge-danger {
  background-color: var(--ch-coral);
}
.badge-primary {
  background-color: var(--ch-blue);
}
.badge-info {
  background-color: var(--ch-violet);
}
```

---

## 11. Alertas

```css
.alert {
  border-radius: 12px;
  border: none;
  padding: 1rem 1.5rem;
  border-left: 4px solid;
}

.alert-success {
  background-color: rgba(8, 189, 186, 0.1);
  color: var(--ch-teal);
  border-left-color: var(--ch-teal);
}

.alert-warning {
  background-color: rgba(241, 194, 27, 0.1);
  color: #b8860b;
  border-left-color: var(--ch-gold);
}

.alert-danger {
  background-color: rgba(237, 71, 57, 0.1);
  color: var(--ch-coral);
  border-left-color: var(--ch-coral);
}

.alert-info {
  background-color: rgba(0, 143, 208, 0.1);
  color: var(--ch-blue);
  border-left-color: var(--ch-blue);
}
```

---

## 12. Zona de Upload

```css
.upload-zone {
  border: 2px dashed var(--ch-blue);
  border-radius: 16px;
  padding: 3rem 2rem;
  text-align: center;
  background: rgba(0, 143, 208, 0.05);
  cursor: pointer;
}

.upload-zone:hover,
.upload-zone.dragover {
  border-color: var(--ch-teal);
  background: rgba(8, 189, 186, 0.1);
  transform: translateY(-2px);
}

.upload-icon {
  font-size: 3rem;
  color: var(--ch-blue);
}
```

---

## 13. Login Page

```css
.login-hero {
  min-height: 100vh;
  background: linear-gradient(135deg, var(--ch-navy) 0%, var(--ch-petrol) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  background: var(--ch-white);
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 36, 0.1);
  padding: 3rem;
  width: 100%;
  max-width: 400px;
}
```

---

## 14. Tema Oscuro (Dark Mode)

```css
[data-theme="dark"] {
  --ch-bg: #1a1a1a;
  --ch-surface: #2d2d2d;
  --ch-text: #ffffff;
  --ch-text-muted: #b0b0b0;
  --ch-border: #404040;
  --ch-sidebar-bg: #252525;
}

[data-theme="dark"] body {
  background-color: var(--ch-bg);
  color: var(--ch-text);
}

[data-theme="dark"] .card {
  background-color: var(--ch-surface);
  border-color: var(--ch-border);
}
```

---

## 15. Responsive Design

```css
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
  }

  .sidebar.show {
    transform: translateX(0);
  }

  .main-content {
    margin-left: 0;
  }

  .content-area {
    padding: 1rem;
  }
}
```

---

## 16. SweetAlert2 Configuración

```javascript
// Colores para SweetAlert2
Swal.fire({
  confirmButtonColor: "#008FD0", // --ch-blue
  cancelButtonColor: "#6c757d",
  // Para éxito
  icon: "success",
  // Para error
  icon: "error",
  // Para advertencia
  icon: "warning",
  // Para pregunta
  icon: "question",
});
```

---

## 17. Idioma y Localización

- **Idioma**: Español (es-ES)
- **Formato de Fecha**: DD/MM/YYYY
- **Formato DateTime**: DD/MM/YYYY HH:mm

```javascript
// Formato de fecha
new Date().toLocaleDateString("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

// Formato datetime
new Date().toLocaleDateString("es-ES", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
```

---

## 18. Estructura de Archivos

```
frontend/
├── css/
│   └── styles.css          # Estilos personalizados
├── js/
│   ├── auth.js             # Autenticación Cognito
│   ├── platform-config.js  # Configuración de plataforma
│   ├── app.js              # Lógica principal
│   └── [module].js         # Módulos específicos
├── index.html              # Dashboard principal
├── login.html              # Página de login
├── signup.html             # Registro
└── config.js               # Configuración API
```

---

## 19. Autenticación

```javascript
// Almacenamiento de auth
localStorage.setItem(
  "ai_verification_auth",
  JSON.stringify({
    accessToken: "token",
    idToken: "token",
    refreshToken: "token",
    email: "user@email.com",
  }),
);

// Verificación de auth
const authData = localStorage.getItem("ai_verification_auth");
if (!authData) {
  window.location.href = "login.html";
}
```

---

## 20. Configuración de API

```javascript
// config.js
window.CONFIG = {
  API_URL: "https://your-api-gateway-url.execute-api.region.amazonaws.com/prod",
  REGION: "us-east-1",
};
```

---

## Resumen de Colores Principales

| Elemento        | Color       | Hex             |
| --------------- | ----------- | --------------- |
| Botón Primario  | Azul        | #008FD0         |
| Éxito/Positivo  | Teal        | #08BDBA         |
| Advertencia     | Dorado      | #F1C21B         |
| Error/Peligro   | Coral       | #ED4739         |
| Fondo Página    | Ice         | #E9F3FA         |
| Sidebar         | Navy→Petrol | #000024→#0A1732 |
| Texto Principal | Navy        | #000024         |
| Cards           | Blanco      | #FFFFFF         |
