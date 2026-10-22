# Sistema Nacional de Gestión de Recursos y Riesgos -

API externa de **RescueSync** — Desarrollo de Software en Sistemas Distribuidos, curso 2026.
**Entrega 3**: API con autenticación JWT, dockerizada y desplegada en la nube.

| Entregable | Ubicación |
|---|---|
| URL del servicio | `https://<url-del-servicio>/api/v1` |
| Documentación Swagger | `https://<url-del-servicio>/api/docs` |
| Repositorio | `https://github.com/<organizacion>/<repositorio>` |
| Dockerfile | [`Dockerfile`](Dockerfile) |
| Colección de Postman | [`postman/`](postman/), con entornos local y Railway |

---

## Índice

1. [Rol dentro de RescueSync](#1-rol-dentro-de-rescuesync)
2. [Comunicación con Bonita y la aplicación web](#2-comunicación-con-bonita-y-la-aplicación-web)
3. [Autenticación con JWT](#3-autenticación-con-jwt)
4. [Esquema de la base de datos](#4-esquema-de-la-base-de-datos)
5. [Control de concurrencia y bloqueo de recursos](#5-control-de-concurrencia-y-bloqueo-de-recursos)
6. [Endpoints de la entrega](#6-endpoints-de-la-entrega)
7. [Endpoints previstos para próximas entregas](#7-endpoints-previstos-para-próximas-entregas)
8. [Stack técnico y estructura](#8-stack-técnico-y-estructura)
9. [Ejecución local](#9-ejecución-local)
10. [Despliegue](#10-despliegue)

---

## 1. Rol dentro de RescueSync

RescueSync está compuesto por cuatro componentes. El Sistema Nacional es la **autoridad central**: sabe qué ONGs están habilitadas, qué certificaciones tienen y qué recursos tienen comprometidos en todo el país.

| Componente | Responsabilidad |
|---|---|
| Aplicación web (local) | Emergencias, lotes y ofertas de ayuda, incluidas sus versiones y los consorcios. RBAC de los 4 perfiles. |
| Bonita BPM | Orquesta el ciclo de vida de la emergencia, administra la ventana de convocatoria e invoca a los demás sistemas. |
| **Sistema Nacional (esta API)** | Registro de ONGs, certificaciones, inventario de recursos, validación por competencias, compromiso y liberación de recursos. |
| Dashboard | Indicadores para el personal directivo. |

**Responsabilidades del Sistema Nacional** (requisitos de la consigna):

| # | Requisito | Cómo se cubre |
|---|---|---|
| 1 | Autenticación y gestión de cuentas | `POST /auth/login` con JWT y `POST /onboarding/ong` |
| 2 | Catálogo y consulta | ONGs habilitadas con sus certificaciones, e inventario por ONG |
| 3 | Validación por niveles de competencia | `POST /validaciones` devuelve perfiles de competencia y **nunca rechaza** una oferta |
| 4 | Control de concurrencia y bloqueo | `POST /proyectos/:ref/compromisos` con `SELECT ... FOR UPDATE` en PostgreSQL |
| 5 | Liberación y cierre | `POST /proyectos/:ref/cerrar` libera todos los recursos del proyecto |

**Lo que el Sistema Nacional no hace**, por directiva de la consigna:

- **No almacena ofertas** ni sus borradores. Viven en la base local de la aplicación web.
- **No inicia la comunicación.** Lo invoca Bonita durante el proceso, y la aplicación web solo para consultas y para administrar el inventario.

---

## 2. Comunicación con Bonita y la aplicación web

### 2.1 Llamadas dentro del proceso

Las operaciones que cambian el estado del proceso (validar, comprometer y liberar) las ejecuta **Bonita** mediante conectores HTTP. La aplicación web no llama directamente a esos endpoints: completa las tareas humanas de Bonita y es Bonita quien invoca al Sistema Nacional.

```mermaid
sequenceDiagram
    autonumber
    actor M as Municipio / ONGs
    participant W as Aplicación web
    participant B as Bonita BPM
    participant N as Sistema Nacional

    Note over B: Vence el timer de la convocatoria
    B->>W: GET /api/v1/emergencias/:id/ofertas/consolidado
    W-->>B: Ofertas presentadas (JSON)
    B->>N: POST /api/v1/auth/login (cuenta de servicio)
    N-->>B: accessToken
    B->>N: POST /api/v1/validaciones
    N-->>B: Perfil de competencia por línea
    B->>W: POST /api/v1/emergencias/:id/ofertas/validar

    M->>W: El municipio elige las ofertas validadas
    W->>B: Ejecuta la tarea "Adjudicar ofertas" (compromisosJson)
    B->>N: POST /api/v1/proyectos/:ref/compromisos
    alt Hay stock suficiente
        N-->>B: 201 Recursos comprometidos
    else Otro proyecto comprometió el stock primero
        N-->>B: 409 Detalle de faltantes
    end

    M->>W: Cada ONG marca su actividad como finalizada
    Note over W: Cuando finalizan todas las ONGs
    W->>B: Ejecuta la tarea de cierre del proyecto
    B->>N: POST /api/v1/proyectos/:ref/cerrar
    N-->>B: 200 Recursos liberados
```

| Paso del proceso | Llamada al Sistema Nacional | Qué recibe | Qué devuelve |
|---|---|---|---|
| Validación externa (eslabón 4) | `POST /validaciones` | Las líneas de las ofertas, con el `codigoNacional` de cada ONG, la categoría y la cantidad | `caracter` (`PRINCIPAL` o `APOYO_SECUNDARIO`) y `perfilCompetencia` por línea. El formato coincide con el que espera la aplicación web, así que Bonita lo reenvía sin transformarlo. |
| Compromiso nacional (eslabón 6) | `POST /proyectos/:ref/compromisos` | El `compromisosJson` que la aplicación web envía en el contrato de la tarea "Adjudicar ofertas" | 201 con los compromisos creados, o 409 si no hay stock suficiente |
| Cierre (eslabón 7) | `POST /proyectos/:ref/cerrar` | La referencia del proyecto | 200 con el detalle de los recursos liberados |

`:ref` es la **referencia externa del proyecto**: el `caseId` de la instancia de Bonita. La generan los sistemas que invocan a esta API, de modo que el Sistema Nacional no necesita conocer el modelo de emergencias.

**Caso 409 en el compromiso.** Si entre la validación y la adjudicación otra emergencia comprometió los mismos recursos, el compromiso falla completo: no se compromete nada. Bonita deriva el flujo por un camino alternativo para que el municipio revise la adjudicación.

### 2.2 Llamadas directas desde la aplicación web

Por fuera del proceso, la aplicación web consume esta API con su propia cuenta de servicio:

| Funcionalidad de la aplicación web | Endpoint |
|---|---|
| Alta de una ONG en la red | `POST /onboarding/ong`. El `codigoNacional` que devuelve se guarda en la organización local. |
| Pantalla "Gestionar inventario" (perfil ONG) | `GET` y `PUT /organizaciones/:codigo/recursos` |
| Listado de ONGs habilitadas y sus certificaciones | `GET /organizaciones` y `GET /organizaciones/:codigo` |

---

## 3. Autenticación con JWT

### 3.1 Cuentas y roles

Quienes consumen esta API son principalmente **sistemas**, no personas. Cada consumidor tiene su propia cuenta:

| Rol | Quién la usa | Cómo se crea |
|---|---|---|
| `SERVICIO` | Bonita (`bonita@rescuesync.ar`) y la aplicación web (`app-web@rescuesync.ar`) | Seed, con las contraseñas tomadas de variables de entorno |
| `ONG` | Una ONG registrada en la red | `POST /onboarding/ong` |
| `ADMIN` | Autoridad del Sistema Nacional (`admin@sistemanacional.gob.ar`) | Seed |

En producción, si falta la variable de entorno con la contraseña de una cuenta de servicio, el seed no crea esa cuenta: nunca queda una cuenta de servicio con una contraseña conocida.

### 3.2 Flujo

```mermaid
sequenceDiagram
    participant C as Cliente (Bonita / App web)
    participant N as Sistema Nacional
    C->>N: POST /api/v1/auth/login { email, password }
    N->>N: Verifica el hash bcrypt de la contraseña
    N-->>C: { accessToken, tokenType: "Bearer", expiresIn }
    C->>N: Request con Authorization: Bearer accessToken
    N->>N: Verifica firma y expiración, y aplica el rol
    N-->>C: Respuesta
```

**Ejemplo de login:**

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "bonita@rescuesync.ar", "password": "********" }
```

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

### 3.3 Decisiones de diseño

- **Solo access token, sin refresh token.** Los clientes son sistemas que guardan sus credenciales: cuando el token vence, vuelven a llamar a `/login`. Los conectores de Bonita hacen login en cada ejecución. Un refresh token con rotación (como el de la aplicación web) suma complejidad sin aportar seguridad en este escenario.
- **Firma HS256** con `JWT_SECRET` de al menos 32 caracteres. La aplicación no arranca si falta el secreto.
- **Payload mínimo:** `sub` (id de la cuenta), `email`, `rol` y `codigoNacional` (solo para cuentas `ONG`). El token está firmado pero no cifrado, por eso no lleva datos sensibles.
- **Contraseñas** guardadas con bcrypt, nunca en claro.
- **Mismo mensaje para todo login fallido** (email inexistente, contraseña incorrecta o cuenta inactiva). Si el email no existe, igual se compara contra un hash señuelo, para que el tiempo de respuesta no revele qué emails tienen cuenta.
- **Rate limiting:** límite general por IP y uno más bajo en `/auth/login` y `/onboarding/ong` (`429 Too Many Requests`).
- **Autorización por rol** con un guard global: todo endpoint requiere token salvo los marcados como públicos (`/auth/login`, `/onboarding/ong` y `/health`). Una cuenta `ONG` solo puede operar sobre su propia organización.

| Situación | Respuesta |
|---|---|
| Sin token, token inválido o token vencido | `401 Unauthorized` |
| Token válido pero sin el rol requerido | `403 Forbidden` |
| Cuenta `ONG` que intenta operar sobre otra organización | `403 Forbidden` |

---

## 4. Esquema de la base de datos

PostgreSQL 16, con migraciones administradas por Prisma.

```mermaid
erDiagram
    CUENTA }o--o| ORGANIZACION : "pertenece a"
    ORGANIZACION ||--o{ ORGANIZACION_CERTIFICACION : "posee"
    CERTIFICACION ||--o{ ORGANIZACION_CERTIFICACION : "se otorga como"
    ORGANIZACION ||--o{ RECURSO : "declara"
    ORGANIZACION ||--o{ COMPROMISO : "asume"
    PROYECTO ||--o{ COMPROMISO : "agrupa"
    COMPROMISO ||--|{ COMPROMISO_ITEM : "detalla"
    RECURSO ||--o{ COMPROMISO_ITEM : "bloqueado en"

    CUENTA {
        int id PK
        string email UK
        string password_hash
        RolCuenta rol
        int organizacion_id FK "solo cuentas ONG"
        boolean activa
    }
    ORGANIZACION {
        int id PK
        string codigo_nacional UK "ONG-0001"
        string nombre UK
        TipoOrganizacion tipo
        string cuit UK
        EstadoOrganizacion estado
        datetime fecha_alta
    }
    CERTIFICACION {
        int id PK
        string codigo UK
        string nombre
        CategoriaRecurso categoria
    }
    ORGANIZACION_CERTIFICACION {
        int id PK
        int organizacion_id FK
        int certificacion_id FK
        int nivel "1 a 4"
        datetime fecha_vencimiento
    }
    RECURSO {
        int id PK
        int organizacion_id FK
        CategoriaRecurso categoria
        string unidad
        int cantidad_total
        int cantidad_comprometida
    }
    PROYECTO {
        int id PK
        string referencia_externa UK "caseId de Bonita"
        NivelGravedad gravedad
        EstadoProyecto estado
        datetime fecha_inicio
        datetime fecha_cierre
    }
    COMPROMISO {
        int id PK
        int proyecto_id FK
        int organizacion_id FK
        EstadoCompromiso estado
        datetime fecha_compromiso
        datetime fecha_liberacion
    }
    COMPROMISO_ITEM {
        int id PK
        int compromiso_id FK
        int recurso_id FK
        int cantidad
    }
```

### 4.1 Entidades

| Entidad | Descripción |
|---|---|
| **Cuenta** | Credenciales de acceso a la API. Las cuentas `ONG` están asociadas a su organización; las de `SERVICIO` y `ADMIN` no pertenecen a ninguna. |
| **Organizacion** | ONG u organismo de rescate registrado. `codigo_nacional` es el identificador que comparten todos los sistemas de RescueSync: se genera en el onboarding a partir del tipo y del id (`ONG-0005`, `ORG-0006`). |
| **Certificacion** | Catálogo de certificaciones (ej.: "Primeros auxilios", "Rescate acuático", "Manipulación de alimentos"). Cada una habilita una categoría de recurso. |
| **OrganizacionCertificacion** | Certificación otorgada a una ONG, con su nivel y vencimiento. El nivel indica hasta qué gravedad de emergencia puede actuar la ONG en esa categoría. |
| **Recurso** | Inventario de una ONG en una categoría. Hay un único registro por (organización, categoría), que corresponde 1 a 1 con la categoría de los lotes de la aplicación web. Lo disponible se calcula como `cantidad_total - cantidad_comprometida`. |
| **Proyecto** | La respuesta a una emergencia. Agrupa los compromisos de todas las ONGs adjudicadas y es la unidad que se cierra en el eslabón 7. |
| **Compromiso** | Lo que una ONG comprometió en un proyecto. Hay uno por ONG por proyecto. |
| **CompromisoItem** | Detalle del compromiso: qué recurso y qué cantidad quedaron bloqueados. |

### 4.2 Enumeraciones

`CategoriaRecurso` y `NivelGravedad` son copias exactas de las de la aplicación web, de modo que los JSON viajan entre sistemas sin traducción.

| Enum | Valores |
|---|---|
| `CategoriaRecurso` | `PERSONAL`, `ALIMENTOS`, `AGUA_POTABLE`, `MEDICAMENTOS`, `ABRIGO_Y_REFUGIO`, `EQUIPAMIENTO`, `TRANSPORTE_Y_LOGISTICA`, `OTRO` |
| `NivelGravedad` | `BAJA` (1), `MEDIA` (2), `ALTA` (3), `CRITICA` (4). El número es el nivel de certificación que se requiere. |
| `RolCuenta` | `ADMIN`, `SERVICIO`, `ONG` |
| `TipoOrganizacion` | `ONG` (prefijo `ONG-`), `ORGANISMO_RESCATE` (prefijo `ORG-`) |
| `EstadoOrganizacion` | `PENDIENTE`, `HABILITADA`, `SUSPENDIDA` |
| `EstadoProyecto` | `EN_EJECUCION`, `FINALIZADO` |
| `EstadoCompromiso` | `ACTIVO`, `LIBERADO` |

### 4.3 Restricciones de integridad

| Restricción | Propósito |
|---|---|
| `UNIQUE (organizacion_id, categoria)` en `recursos` | Un único stock por categoría por ONG |
| `UNIQUE (proyecto_id, organizacion_id)` en `compromisos` | Si Bonita reintenta un compromiso, no se compromete dos veces |
| `UNIQUE (organizacion_id, certificacion_id)` en `organizacion_certificaciones` | Una certificación no se otorga dos veces a la misma ONG |
| `CHECK (cantidad_comprometida >= 0 AND cantidad_comprometida <= cantidad_total)` en `recursos` | Red de seguridad a nivel de base: aunque algún camino del código omitiera el bloqueo, PostgreSQL rechaza una sobre-asignación |
| `CHECK (nivel BETWEEN 1 AND 4)` en `organizacion_certificaciones` | El nivel siempre corresponde a una gravedad |
| `CHECK (cantidad > 0)` en `compromiso_items` | No existen compromisos vacíos |

Las tres restricciones `CHECK` están escritas a mano al final de la migración inicial, porque Prisma no las genera.

---

## 5. Control de concurrencia y bloqueo de recursos

**Problema.** Dos emergencias pueden adjudicarse al mismo tiempo y querer comprometer el mismo recurso de una ONG. Si ambas leen "hay 10 disponibles" antes de que alguna escriba, las dos comprometen 10 y la ONG queda sobre-asignada (*race condition*).

**Solución: bloqueo pesimista por fila con `SELECT ... FOR UPDATE`**, todo dentro de una transacción:

```sql
BEGIN;

-- 1. Bloquea las filas de los recursos involucrados.
--    Otra transacción que intente bloquear las mismas filas espera aquí.
SELECT id, cantidad_total, cantidad_comprometida
FROM recursos
WHERE id = ANY($1)
ORDER BY id          -- orden fijo: evita deadlocks entre transacciones
FOR UPDATE;

-- 2. Con las filas bloqueadas, verifica el disponible de cada línea.
--    Si alguna no alcanza: ROLLBACK y 409 (todo o nada).

-- 3. Registra el compromiso.
UPDATE recursos SET cantidad_comprometida = cantidad_comprometida + $n WHERE id = $id;
INSERT INTO compromisos ...;
INSERT INTO compromiso_items ...;

COMMIT;  -- libera los bloqueos; la transacción en espera lee los valores actualizados
```

| Decisión | Motivo |
|---|---|
| Bloqueo pesimista (`FOR UPDATE`) en lugar de optimista | La contención es real: varias emergencias simultáneas compiten por los mismos recursos. Esperar el bloqueo es preferible a reintentar desde el conector de Bonita. |
| `ORDER BY id` | Si una transacción bloquea A y luego B, y otra bloquea B y luego A, se produce un deadlock. Con un orden fijo, todas bloquean en la misma secuencia: primero la fila del proyecto y después los recursos ordenados por id. |
| Alta del proyecto con `INSERT ... ON CONFLICT DO NOTHING` | Dos adjudicaciones simultáneas del mismo proyecto no chocan por clave duplicada: la segunda espera a la primera y continúa. |
| Todo o nada | Un compromiso parcial dejaría a la ONG con parte de los recursos bloqueados para una adjudicación que no se concretó. |
| Cierre también con bloqueo | `POST /proyectos/:ref/cerrar` bloquea las mismas filas para descontar `cantidad_comprometida` sin competir con un compromiso en curso. |
| Edición de inventario con bloqueo | Un `PUT` de recursos no puede dejar `cantidad_total` por debajo de lo comprometido. |

**Verificación.** El test e2e de concurrencia ([`test/proyectos.e2e-spec.ts`](test/proyectos.e2e-spec.ts)) dispara 10 compromisos en paralelo sobre un recurso con stock para 3, y verifica que exactamente 3 respondan `201`, 7 respondan `409`, y que `cantidad_comprometida` termine igual a `cantidad_total`.

Para confirmar que el test realmente detecta la *race condition*, se ejecutó una vez sin el `FOR UPDATE` y sin el `CHECK`: las 10 transacciones leyeron "hay 3 disponibles" y las 10 respondieron `201`, sobre-asignando el recurso. Con el bloqueo, el resultado es siempre 3 y 7.

---

## 6. Endpoints de la entrega

Prefijo: `/api/v1`. Todos los cuerpos son JSON. La documentación interactiva completa está en Swagger (`/api/docs`).

| Método | Ruta | Acceso | Requisito |
|---|---|---|---|
| `POST` | `/auth/login` | Público | 1. Autenticación |
| `POST` | `/onboarding/ong` | Público | 1. Gestión de cuentas |
| `GET` | `/organizaciones` | `SERVICIO`, `ADMIN` | 2. Catálogo y consulta |
| `GET` | `/organizaciones/:codigo` | `SERVICIO`, `ADMIN`, `ONG` (la propia) | 2. Catálogo y consulta |
| `GET` | `/organizaciones/:codigo/recursos` | `SERVICIO`, `ADMIN`, `ONG` (la propia) | 2. Catálogo y consulta |
| `PUT` | `/organizaciones/:codigo/recursos` | `SERVICIO`, `ONG` (la propia) | 2. Gestión de inventario |
| `POST` | `/validaciones` | `SERVICIO` | 3. Validación por competencias |
| `POST` | `/proyectos/:ref/compromisos` | `SERVICIO` | 4. Concurrencia y bloqueo |
| `POST` | `/proyectos/:ref/cerrar` | `SERVICIO` | 5. Liberación y cierre |
| `GET` | `/health` | Público | Monitoreo del despliegue |

### `POST /onboarding/ong`

Registra una ONG y crea su cuenta de acceso. En esta entrega la organización queda **`HABILITADA` desde el alta** (ver [sección 7](#7-endpoints-previstos-para-próximas-entregas)).

```json
// Request
{
  "nombre": "Bomberos Voluntarios de Berisso",
  "tipo": "ORGANISMO_RESCATE",
  "cuit": "30712345678",
  "email": "contacto@bvberisso.org",
  "password": "********"
}

// Response 201
{
  "codigoNacional": "ORG-0012",
  "nombre": "Bomberos Voluntarios de Berisso",
  "tipo": "ORGANISMO_RESCATE",
  "estado": "HABILITADA",
  "email": "contacto@bvberisso.org"
}
```

`tipo` es opcional (por defecto `ONG`). El CUIT se acepta con o sin guiones. Si el nombre, el CUIT o el email ya están registrados, responde `409`.

### `GET /organizaciones?estado=HABILITADA`

Lista las ONGs filtradas por estado, paginadas (`page`, `size`) y con búsqueda opcional por nombre o código (`busqueda`). El detalle (`GET /organizaciones/:codigo`) incluye las **certificaciones vigentes** de la ONG con su nivel y vencimiento.

```json
// GET /organizaciones/ONG-0012 — Response 200
{
  "codigoNacional": "ONG-0012",
  "nombre": "Bomberos Voluntarios de Berisso",
  "estado": "HABILITADA",
  "certificaciones": [
    { "codigo": "RESC-ACU", "nombre": "Rescate acuático", "categoria": "PERSONAL", "nivel": 3, "fechaVencimiento": "2027-06-30" }
  ]
}
```

### `GET` y `PUT /organizaciones/:codigo/recursos`

Consulta y actualiza el inventario de una ONG. El `PUT` reemplaza la cantidad total por categoría, y falla con `409` si la nueva cantidad es menor a la comprometida.

```json
// PUT Request
{
  "recursos": [
    { "categoria": "PERSONAL", "unidad": "personas", "cantidadTotal": 20 },
    { "categoria": "ALIMENTOS", "unidad": "raciones", "cantidadTotal": 1500 }
  ]
}

// GET Response 200
{
  "recursos": [
    { "categoria": "PERSONAL", "unidad": "personas", "cantidadTotal": 20, "cantidadComprometida": 5, "disponible": 15 },
    { "categoria": "ALIMENTOS", "unidad": "raciones", "cantidadTotal": 1500, "cantidadComprometida": 0, "disponible": 1500 }
  ]
}
```

### `POST /validaciones`

Evalúa las líneas de las ofertas. **No existe el rechazo:** toda línea vuelve con un carácter asignado.

| Condición | `caracter` |
|---|---|
| ONG `HABILITADA` y con una certificación vigente de la categoría, de nivel mayor o igual a la gravedad de la emergencia | `PRINCIPAL` |
| Cualquier otro caso (sin certificación, nivel insuficiente, certificación vencida u ONG no habilitada) | `APOYO_SECUNDARIO`, con el motivo en `perfilCompetencia` |

`disponible` y `cantidadDisponible` son informativos: indican si al momento de validar la ONG tiene stock suficiente, pero no bloquean nada. El bloqueo ocurre en el compromiso.

Los tres primeros campos de cada resultado (`lineaId`, `caracter`, `perfilCompetencia`) son los que espera `POST /emergencias/:id/ofertas/validar` de la aplicación web, que además acepta como opcionales los informativos. Así Bonita reenvía la respuesta sin transformarla.

```json
// Request
{
  "gravedad": "ALTA",
  "lineas": [
    { "lineaId": 41, "codigoNacional": "ONG-0012", "categoria": "PERSONAL", "cantidad": 5 },
    { "lineaId": 42, "codigoNacional": "ONG-0031", "categoria": "PERSONAL", "cantidad": 3 }
  ]
}

// Response 200
{
  "resultados": [
    {
      "lineaId": 41,
      "caracter": "PRINCIPAL",
      "perfilCompetencia": "Rescate acuático nivel 3 - habilitada hasta gravedad ALTA",
      "capacidadesHabilitadas": ["PERSONAL"],
      "nivelRiesgoPermitido": "ALTA",
      "disponible": true,
      "cantidadDisponible": 15
    },
    {
      "lineaId": 42,
      "caracter": "APOYO_SECUNDARIO",
      "perfilCompetencia": "Primeros auxilios nivel 1 - habilitada hasta gravedad BAJA (la emergencia es ALTA)",
      "capacidadesHabilitadas": ["PERSONAL"],
      "nivelRiesgoPermitido": "BAJA",
      "disponible": true,
      "cantidadDisponible": 8
    }
  ]
}
```

### `POST /proyectos/:ref/compromisos`

Compromete los recursos de las ONGs adjudicadas con bloqueo transaccional ([sección 5](#5-control-de-concurrencia-y-bloqueo-de-recursos)). Si el proyecto no existe, lo crea en estado `EN_EJECUCION`.

| Caso | Respuesta |
|---|---|
| Hay stock para todo | `201` con los compromisos creados |
| Algún item no alcanza | `409` con `faltantes`; no se compromete nada |
| Todas las ONGs del request ya estaban comprometidas (reintento de Bonita) | `201` con el estado actual, sin volver a comprometer |
| Solo algunas ya estaban comprometidas | `409` con las `organizaciones` repetidas |
| Alguna organización no está `HABILITADA` | `409` |
| El proyecto ya fue finalizado | `409` |
| Alguna organización no existe | `404` |

```json
// Request — POST /proyectos/20045/compromisos
{
  "gravedad": "ALTA",
  "compromisos": [
    { "codigoNacional": "ONG-0012", "items": [{ "categoria": "PERSONAL", "cantidad": 5 }] },
    { "codigoNacional": "ONG-0031", "items": [{ "categoria": "ALIMENTOS", "cantidad": 600 }] }
  ]
}

// Response 201
{
  "referencia": "20045",
  "estado": "EN_EJECUCION",
  "compromisos": [
    { "id": 7, "codigoNacional": "ONG-0012", "estado": "ACTIVO", "items": [{ "categoria": "PERSONAL", "cantidad": 5 }] },
    { "id": 8, "codigoNacional": "ONG-0031", "estado": "ACTIVO", "items": [{ "categoria": "ALIMENTOS", "cantidad": 600 }] }
  ]
}

// Response 409 — no se comprometió nada
{
  "status": 409,
  "message": "Recursos insuficientes para comprometer el proyecto 20045",
  "faltantes": [
    { "codigoNacional": "ONG-0031", "categoria": "ALIMENTOS", "pedido": 600, "disponible": 250 }
  ],
  "path": "/api/v1/proyectos/20045/compromisos",
  "timestamp": "2026-10-22T14:03:11.000Z"
}
```

### `POST /proyectos/:ref/cerrar`

Libera todos los compromisos activos del proyecto, devuelve el stock a cada ONG y marca el proyecto como `FINALIZADO`. Es **idempotente**: cerrar un proyecto ya finalizado devuelve `200` sin cambios, de modo que un reintento del conector de Bonita no produce errores.

```json
// Response 200
{
  "referencia": "20045",
  "estado": "FINALIZADO",
  "fechaCierre": "2026-11-03T18:20:00.000Z",
  "liberados": [
    { "codigoNacional": "ONG-0012", "items": [{ "categoria": "PERSONAL", "cantidad": 5 }] },
    { "codigoNacional": "ONG-0031", "items": [{ "categoria": "ALIMENTOS", "cantidad": 600 }] }
  ]
}
```

### Formato de errores

Todos los errores comparten el mismo formato:

```json
{ "status": 404, "message": "No existe la organización ONG-9999", "path": "/api/v1/organizaciones/ONG-9999", "timestamp": "..." }
```

| Código | Cuándo |
|---|---|
| `400` | Cuerpo inválido (validación de DTOs, campos no declarados, elementos repetidos) |
| `401` | Sin token, token inválido o token vencido |
| `403` | Rol sin permiso u organización ajena |
| `404` | Organización o proyecto inexistente |
| `409` | Stock insuficiente al comprometer, inventario por debajo de lo comprometido, datos ya registrados en el onboarding, proyecto finalizado u organización no habilitada |
| `429` | Límite de peticiones alcanzado |

Cuando un `409` tiene detalle, viaja junto al mensaje: `faltantes` en el compromiso, `conflictos` en el inventario y `organizaciones` cuando el problema es de alguna ONG.

---

## 7. Endpoints previstos para próximas entregas

Los siguientes endpoints **no forman parte de esta entrega**. Algunos amplían funcionalidad que ya está cubierta de otra forma; otros corresponden a etapas posteriores, cuando se complete la integración de todo el sistema.

| Endpoint | Motivo por el que no se incluye ahora |
|---|---|
| `PATCH /organizaciones/:codigo/estado` | **Aditivo.** Agrega un circuito de aprobación por parte de la autoridad nacional (`PENDIENTE` → `HABILITADA` / `SUSPENDIDA`). En esta entrega las ONGs quedan habilitadas desde el onboarding. |
| `GET /certificaciones` | **Aditivo.** Catálogo general de certificaciones. Las certificaciones de cada ONG ya se consultan en el detalle de la organización; el catálogo lo carga el seed. |
| `GET /recursos/disponibilidad?categoria=` | **Próxima entrega.** Vista agregada de la disponibilidad por categoría a nivel nacional, pensada para el Dashboard de indicadores. En esta entrega el inventario se consulta por ONG. |
| `POST /organizaciones/:codigo/certificaciones` | **Aditivo.** Otorga certificaciones a una ONG desde la API. En esta entrega las certificaciones se cargan por seed. |
| `POST /compromisos/:id/liberar` | **No se usa en el esquema adoptado.** Libera los recursos de una sola ONG. El proceso actual libera todo el proyecto junto cuando todas las ONGs finalizan (`POST /proyectos/:ref/cerrar`). Quedaría disponible para una variante con liberación por ONG mediante una tarea multi-instancia en Bonita. |
| `GET /proyectos` y `GET /proyectos/:ref` | **Próxima entrega.** Consulta de proyectos y su estado, destinada al Dashboard y a la auditoría. Ningún paso del proceso actual la necesita. |

---

## 8. Stack técnico y estructura

Se utiliza el mismo stack y la misma arquitectura en capas que el backend de la aplicación web.

| Capa | Tecnología |
|---|---|
| Runtime y framework | Node.js 24, NestJS 11, TypeScript |
| Persistencia | PostgreSQL 16, Prisma 6 |
| Seguridad | `@nestjs/jwt` con Passport JWT, bcrypt, helmet, rate limiting en memoria (`@nestjs/throttler`) |
| Validación | class-validator, class-transformer |
| Documentación | Swagger (`@nestjs/swagger`) |
| Contenedores | Docker multi-stage, docker-compose para desarrollo |

Diferencias deliberadas con el backend de la aplicación web: **sin Redis** (los clientes son sistemas, así que no hay refresh token ni blacklist que guardar, y el rate limiting en memoria alcanza con una sola instancia), **Swagger siempre activo** (es parte de la entrega) y **el CLI de Prisma en las dependencias de producción** (la imagen aplica las migraciones al arrancar).

```
src/
├── config/          # Configuración y validación de variables de entorno
├── common/          # Decoradores, filtro global de errores, excepciones y DTOs compartidos
├── security/        # Estrategia JWT, guards de autenticación y roles, acceso por organización
├── prisma/          # Cliente de Prisma y tipos transaccionales
├── health/          # Healthcheck
├── seed/            # Seed idempotente (se compila con la app: la imagen no tiene ts-node)
└── dominio/
    ├── auth/
    ├── onboarding/
    ├── organizaciones/
    ├── recursos/        # Inventario y bloqueo de filas (SELECT ... FOR UPDATE)
    ├── validaciones/    # reglas-competencia.ts: reglas puras, con tests unitarios
    └── proyectos/       # Compromisos y cierre
        ├── controller/
        ├── services/
        ├── repositories/
        └── dtos/
prisma/
├── schema/          # Un archivo .prisma por dominio
└── migrations/
test/                # Tests e2e contra PostgreSQL real
postman/             # Colección y entornos (local y Railway)
```

### Datos del seed

El seed corre en cada arranque y es idempotente. Carga las cuentas de servicio, el catálogo de 9 certificaciones y 4 organizaciones de demostración, cuyos códigos coinciden con los del seed de la aplicación web:

| Código | Organización | Para qué sirve en la demo |
|---|---|---|
| `ONG-0001` | Cruz Solidaria | Certificaciones altas: sus ofertas salen `PRINCIPAL` |
| `ORG-0002` | Bomberos Voluntarios de Cosquin | Organismo de rescate, rescate acuático nivel 4 |
| `ONG-0003` | Red Solidaria Sierras Chicas | Niveles bajos y una certificación vencida: `APOYO_SECUNDARIO` |
| `ONG-0004` | Manos Unidas Punilla | `SUSPENDIDA`: valida como apoyo secundario y no se le comprometen recursos |

Lo que el sistema modifica en uso (estado de las organizaciones, inventario, lo comprometido) se crea una sola vez y no se pisa en los arranques siguientes.

---

## 9. Ejecución local

Requisitos: Docker y Docker Compose (en Windows, Docker Engine dentro de WSL2).

```bash
cp .env.example .env          # los valores por defecto sirven para desarrollo
docker compose up --build     # PostgreSQL + API: aplica migraciones, corre el seed y arranca con hot-reload
```

- API: `http://localhost:3001/api/v1`
- Swagger: `http://localhost:3001/api/docs` (especificación OpenAPI en `/api/docs-json`)
- PostgreSQL: `localhost:5435`

También se puede levantar solo la base en Docker y la API en la máquina:

```bash
docker compose up -d postgres
npm install
npx prisma migrate deploy && npm run db:seed
npm run start:dev
```

### Tests

```bash
npm run test        # unitarios: reglas de competencia
npm run test:e2e    # e2e contra PostgreSQL real, incluido el test de concurrencia
```

Los e2e usan la base `sistema_nacional_test`, que crea el contenedor de PostgreSQL la primera vez que se levanta ([`docker/initdb`](docker/initdb)). La suite la trunca antes de cada test, sin tocar la base de desarrollo.

### Colección de Postman

Importar los tres archivos de [`postman/`](postman/): la colección y los entornos **Local** y **Railway**. Con el entorno elegido, **Run collection** recorre todo el proceso en orden (login, onboarding, consultas, validación, compromiso, cierre) y cada request verifica su respuesta. Usa una referencia de proyecto nueva en cada corrida, así que se puede ejecutar las veces que haga falta.

```bash
npx newman run "postman/Sistema Nacional API.postman_collection.json" \
  -e "postman/Sistema Nacional - Local.postman_environment.json"
```

---

## 10. Despliegue

La API se despliega en **Railway** como una imagen Docker construida desde el [`Dockerfile`](Dockerfile), con una base PostgreSQL administrada por Railway en la misma red privada.

```mermaid
flowchart LR
    GH[Repositorio GitHub] -- push a main --> RW[Railway: build del Dockerfile]
    RW --> C[Contenedor]
    C -- 1. prisma migrate deploy --> PG[(PostgreSQL de Railway)]
    C -- 2. seed idempotente --> PG
    C -- 3. node dist/main.js --> API[API en https://...up.railway.app]
    RW -. healthcheck /api/v1/health .-> API
```

Al iniciar, el contenedor aplica las migraciones pendientes, corre el seed y arranca la API. Railway no deriva tráfico a la versión nueva hasta que `/api/v1/health` responde `200` ([`railway.json`](railway.json)). Si una migración falla, el contenedor no arranca y queda en línea la versión anterior.

### Pasos en Railway

1. **New Project → Deploy from GitHub repo** y elegir este repositorio. Railway detecta el `Dockerfile` y el `railway.json`.
2. En el mismo proyecto: **New → Database → PostgreSQL**.
3. En el servicio de la API, pestaña **Variables**, cargar:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base del proyecto) |
   | `JWT_SECRET` | Generado con `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"` |
   | `SEED_ADMIN_PASSWORD` | Contraseña de la cuenta `ADMIN` |
   | `SEED_BONITA_PASSWORD` | Contraseña de la cuenta de servicio de Bonita |
   | `SEED_APP_WEB_PASSWORD` | Contraseña de la cuenta de servicio de la aplicación web |

4. Pestaña **Settings → Networking → Generate Domain** para obtener la URL pública.
5. Completar esa URL en la tabla del inicio de este README y en el entorno **Railway** de Postman.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Cadena de conexión a PostgreSQL (`postgresql://usuario:pass@host:puerto/base`) |
| `JWT_SECRET` | Sí | Secreto de firma de los tokens, de al menos 32 caracteres. Sin él la app no arranca. |
| `PORT` | No | Puerto HTTP. Lo inyecta Railway; localmente es `3001`. |
| `JWT_EXPIRATION` | No | Vigencia del access token (por defecto `1h`) |
| `SEED_ADMIN_PASSWORD` | En producción | Contraseña de la cuenta `ADMIN` |
| `SEED_BONITA_PASSWORD` | En producción | Contraseña de la cuenta de servicio de Bonita |
| `SEED_APP_WEB_PASSWORD` | En producción | Contraseña de la cuenta de servicio de la aplicación web |
| `SEED_DEMO_PASSWORD` | No | Contraseña de las cuentas de las ONGs de demostración (por defecto `Rescue2026!`) |
| `CORS_ALLOWED_ORIGINS` | No | Orígenes permitidos, separados por coma. Los consumidores son servidores, así que no suele hacer falta. |
| `NODE_ENV` | No | La imagen ya lo fija en `production` |
