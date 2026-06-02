# UTPSync - Gestión de Monitores y Salas de Cómputo (UTP)

![UTPSync Logo](assets/logo-utp.webp)

UTPSync es una plataforma web integral diseñada para la Universidad Tecnológica de Pereira (UTP). Su principal propósito es gestionar, coordinar y sincronizar eficientemente la infraestructura física (salas de cómputo) con el equipo humano de soporte (monitores) a través de un ecosistema seguro y escalable.

---

## 📑 Tabla de Contenidos

1. [Arquitectura del Sistema](#-arquitectura-del-sistema)
2. [Estructura del Proyecto](#-estructura-del-proyecto)
3. [Módulos y Características Core](#-módulos-y-características-core)
4. [Diseño de la Base de Datos](#-diseño-de-la-base-de-datos)
5. [Documentación de la API](#-documentación-de-la-api)
6. [Instalación y Despliegue](#-instalación-y-despliegue)
7. [Credenciales de Acceso](#-credenciales-de-acceso)
8. [UML y Diagramas](#-uml-y-diagramas)

---

## 🏛️ Arquitectura del Sistema

El proyecto está diseñado bajo un modelo **Cliente-Servidor (SPA - Single Page Application)** impulsado completamente por tecnologías Vanilla, lo que garantiza tiempos de carga mínimos y alta flexibilidad sin depender de pesados frameworks externos (como React o Angular).

*   **Frontend (Cliente):** 
    *   Implementado con HTML5 semántico.
    *   **CSS Vanilla** estructurado con un sistema de variables globales (CSS Custom Properties) para soportar temas dinámicos (Glassmorphism / "Ultra Premium Light Mode").
    *   **JavaScript Vanilla (`app.js`):** Actúa como el controlador principal, manipulando el DOM de forma dinámica, interceptando eventos y renderizando "Vistas" (Router simulado) usando la API Fetch para interactuar con el backend de forma asíncrona.
*   **Backend (Servidor):**
    *   **PHP 8+ (Single Endpoint):** Todo el tráfico y lógica de negocio se centraliza en `api.php`. El backend recibe solicitudes vía `POST` mediante la variable `action` e implementa un patrón "Switch-Case Router" para derivar la ejecución.
    *   Uso de **PDO (PHP Data Objects)** con sentencias preparadas para mitigar inyecciones SQL.
*   **Base de Datos:** MySQL / MariaDB Relacional.

---

## 📂 Estructura del Proyecto

A continuación se detalla la estructura física del repositorio:

```text
📁 frontend/
├── 📄 index.html               # Entry Point único. Contiene los esqueletos modales, layout SPA y Navbar.
├── 📄 styles.css               # Hoja de estilos principal. Incluye variables CSS, UI tokens y media queries.
├── 📄 app.js                   # Lógica de cliente, enrutamiento, fetch a la API y renderizado dinámico.
├── 📄 api.php                  # API REST (Single Endpoint). Controlador maestro del backend y consultas PDO.
├── 📄 config.json              # Estado de configuración global (ej. habilitar/deshabilitar inscripciones).
├── 📄 detodop8_gestion_monitores.sql # Script SQL oficial: Estructura, triggers y semillas de prueba (mock data).
├── 📁 assets/                  # Recursos estáticos (Imágenes, logos de la UTP, íconos).
├── 📁 diagramas_exportados/    # Diagramas UML y de flujo (Casos de Uso, Secuencia, Dominio) en .mmd y .png.
├── 📄 create_mmd.py            # Script Python para generar/exportar diagramas Mermaid automatizados.
└── 📄 README.md                # Documentación oficial del proyecto (Este archivo).
```

---

## 🚀 Módulos y Características Core

El sistema se divide en **5 Módulos Principales** con controles de acceso por Rol (RBAC):

1. **Módulo de Autenticación & Registro (Público)**
   *   Login cifrado y validación de sesiones en `localStorage`.
   *   Formulario de registro avanzado para monitores, que incluye un **Grid Selector de Disponibilidad Horaria** interactivo (procesado en JSON).
2. **Módulo de Panel de Control (Dashboard)**
   *   **Monitores:** Verificación de turnos del día actual (Timeline UI) y resumen estadístico de horas cumplidas.
   *   **Administradores:** Visión global de salas activas, usuarios registrados y notificaciones de aprobaciones pendientes.
3. **Módulo de Infraestructura (Administrativo)**
   *   **CRUD completo de Salas:** Gestión de ubicaciones físicas, limitación de aforos y definición estricta de **horas de apertura y cierre** operativas.
4. **Módulo de Asignación y Control Horario**
   *   **Motor de Resolución de Conflictos:** El backend (`api.php`) valida transversalmente que no existan colisiones de tiempo entre la disponibilidad de un monitor y el horario de apertura de una sala.
5. **Módulo de Reemplazos de Turno (Workflow Asíncrono)**
   *   Un ecosistema transaccional de 3 vías: 
       *   *Monitor Titular* solicita reemplazo indicando motivo.
       *   *Monitor Sustituto* revisa la oferta y Acepta/Rechaza en su sesión.
       *   *Administrador* valida la transacción final y el frontend se re-dibuja para el día estipulado asignando al sustituto (Re-Render Dinámico).

---

## 🗄️ Diseño de la Base de Datos

El motor relacional consta de 5 tablas principales fuertemente vinculadas mediante llaves foráneas y eliminación en cascada (`ON DELETE CASCADE`):

1.  **`usuarios`**: Entidad central (Administradores y Monitores). Almacena credenciales, estado (`pendiente`, `aprobado`, `rechazado`), promedio académico y el objeto JSON de disponibilidad horaria.
2.  **`salas`**: Metadatos de la infraestructura física (Capacidad, Ubicación, horarios permitidos).
3.  **`horarios`**: Bloques de tiempo estrictos fragmentados por día de la semana (Lunes-Domingo) e intervalo `hora_inicio` - `hora_fin` ligados a una `sala_id`.
4.  **`asignaciones`**: Tabla de ruptura que conecta un `monitor_id` (`usuarios`) hacia un `horario_id` específico. Representa el turno real que le toca a un monitor.
5.  **`solicitudes_cambio`**: Historial transaccional de los reemplazos. Lleva el control de máquina de estados: (`estado`: pendiente -> aprobada -> rechazada), `reemplazo_acepto` (booleano), y `fecha_reemplazo`.

---

## 🔌 Documentación de la API (Endpoints)

Todas las solicitudes se dirigen a `api.php`. El controlador discrimina la operación basándose en el parámetro `POST['action']` o `GET['action']`.

| Action (`action`) | Roles Permitidos | Funcionalidad |
| :--- | :---: | :--- |
| `login` | Todos | Verifica cédula/contraseña y devuelve el objeto JSON de sesión. |
| `register_monitor` | Público | Crea una cuenta temporal (estado `pendiente`). |
| `get_state` | Monitor / Admin | Retorna el árbol de datos de toda la plataforma según los permisos (Dashboard Hydration). |
| `add_user` / `delete_user` | Admin | Modificación y revocación de credenciales. |
| `update_user_status` | Admin | Transición de estado de usuario (`aprobado` / `rechazado`). |
| `add_room` / `delete_room` | Admin | Gestión física de la infraestructura. |
| `add_assignment` | Admin | Vincula un usuario a un horario y sala validando conflictos temporales. |
| `add_shift_request` | Monitor | Inicia la fase 1 del Workflow de Reemplazos. |
| `accept_replacement` | Monitor | Fase 2 del Workflow (Confirmación del sustituto). |
| `update_request_status`| Admin | Fase 3 (Veredicto Administrativo del cambio de turno). |

---

## ⚙️ Instalación y Despliegue

1.  **Prerrequisitos:** Servidor Web con soporte para **PHP 8.0+** y **MySQL 5.7+ / MariaDB** (XAMPP, WAMP, Laragon, o Docker).
2.  **Clonación del Proyecto:** 
    ```bash
    git clone https://github.com/TU_USUARIO/UTPSync.git
    ```
3.  **Configuración de Base de Datos:**
    *   Ejecuta tu manejador SQL (ej. phpMyAdmin).
    *   Crea una base de datos nueva llamada `detodop8_gestion_monitores`.
    *   Importa el archivo `detodop8_gestion_monitores.sql` provisto, el cual creará las tablas y sembrará los datos de prueba pre-poblados.
4.  **Enlace Backend-DB:**
    *   Abre el archivo `api.php` (líneas 7 a 10).
    *   Ajusta las variables de entorno de conexión PDO según tu entorno local:
        ```php
        $host = 'localhost';
        $db   = 'detodop8_gestion_monitores';
        $user = 'root'; // Usuario por defecto en XAMPP local
        $pass = '';     // Contraseña por defecto en XAMPP local
        ```
5.  **Ejecución:**
    *   Coloca el directorio del proyecto dentro de la carpeta `htdocs` (si utilizas XAMPP).
    *   Inicia los módulos de Apache y MySQL.
    *   Accede desde el navegador a `http://localhost/nombre-del-repositorio`.

---

## 👥 Credenciales de Acceso (Sandbox)

La base de datos importada viene sembrada con los siguientes usuarios listos para pruebas locales:

| Rol | Cédula | Contraseña | Descripción |
| :--- | :--- | :--- | :--- |
| **Administrador Principal** | `123456789` | `admin123` | Control total del sistema y salas. |
| **Admin Demo** | `987654321` | `demo1` | Rol administrativo de solo lectura/vista parcial. |
| **Monitor Activo** | `00000` | `12345` | Monitor aprobado (Camilo Chavarro) con turnos asignados. |
| **Monitor Secundario** | `44444` | `12345` | Monitor para probar el ciclo de "reemplazo de turnos". |

---

## 📊 UML y Diagramas

La ingeniería de software aplicada incluye diagramas UML que detallan la infraestructura subyacente. Se encuentran en el directorio `/diagramas_exportados/`.

*   **Casos de Uso**: Interacciones de Actores vs. Sistema.
*   **Modelo de Dominio (Clases)**: Comportamiento y propiedades de las entidades backend.
*   **Diagramas de Secuencia**: Detallan meticulosamente el flujo temporal para funciones complejas, como la `secuencia_cambio_turno.mmd` y `secuencia_asignacion_turno.mmd`.

---
*Plataforma desarrollada para el entorno académico de la **Universidad Tecnológica de Pereira (UTP)**.*
