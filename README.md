# Asadero Kikiriki — MVP con MongoDB, Node.js y JavaScript

## Requisitos
- Node.js versión 20 o superior
- MongoDB Community Server instalado y ejecutándose en `127.0.0.1:27017`
- Visual Studio Code (opcional)

## Instalación
1. Abre esta carpeta en Visual Studio Code.
2. Abre una terminal integrada.
3. Ejecuta `npm install`.
4. Copia `.env.example` a un archivo llamado `.env`. Conserva la dirección MongoDB local y **cambia SESSION_SECRET por una cadena aleatoria de 32 caracteres o más**.
5. Confirma que el servicio MongoDB está iniciado.
6. Ejecuta `npm start`.
7. Abre `http://localhost:3000`.

## Acceso de demostración
- Administrador: `admin` / `Kikiriki2026!`
- Empleado: `empleado` / `Empleado2026!`

Cambia estas credenciales antes de utilizar datos reales. Es una aplicación académica de demostración, no un servicio listo para producción.

## Funciones
- Página pública con menú, categorías, carrito y registro de pedidos.
- Los pedidos descuentan existencias del catálogo y devuelven existencias si son cancelados.
- Panel con inicio de sesión, estados de pedidos, productos, insumos, usuarios y reportes.
- Colecciones MongoDB: `employees`, `products`, `supplies`, `inventorymoves`, `orders`, `counters`, `sessions`.
- Los informes de ventas cuentan **solo** pedidos marcados como entregados; no representan cobros confirmados.
- El inventario de materias primas se gestiona de manera independiente: no hay fórmulas/recetas de consumo automático.

## Limitaciones del MVP
- Semillas de productos y precios son datos ficticios, pendientes de validación con el asadero.
- No incluye pagos, domicilios geolocalizados ni notificaciones automáticas.
- No tiene pruebas automatizadas de integración ni endurecimiento integral de seguridad.
- MongoDB independiente permite actualizaciones atómicas individuales, pero **no** brinda transacciones multi-documento en este diseño; para una operación comercial se debe implementar una estrategia transaccional en réplica y auditoría de inventario.
- Antes de desplegar públicamente: protección adicional CSRF, HTTPS, validaciones exhaustivas y revisión de permisos y privacidad.

## Organización
- `server.js`: backend Express, modelos Mongoose y rutas API.
- `static/index.html`: interfaz pública y panel administrativo.
- `static/styles.css`: estilos responsivos.
- `static/app.js`: frontend interactivo y consumo de API.
- `.env.example`: variables de configuración (copia a `.env`).

## Prueba sugerida
1. Ingresa a la página y agrega dos productos al carrito.
2. Envía un pedido de prueba.
3. Accede como administrador desde el panel.
4. Cambia el estado del pedido: pendiente → preparación → listo → entregado.
5. Revisa el módulo de reportes.
