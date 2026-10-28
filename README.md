# Mountain Burger · Cali Grill

App web instalable en el celular (PWA) para llevar la producción, el inventario, los costos y la caja de Mountain Burger. Funciona sin señal: lo que se registra se guarda en el celular y se sube solo cuando vuelve la red.

Usa **Firebase** (Firestore + Auth) para los datos y se publica en **Netlify**.

## Las tres interfaces

| Quién | Pantallas |
| --- | --- |
| **Administración** | Inicio (resumen, alertas, lo que falta configurar) · Catálogo (recetas, insumos, proveedores y sus reglas, compradores y precios, usuarios) · Costos (costo completo por hamburguesa, parrilla y luz, gastos de la casa) · Finanzas (4 fondos, movimientos, nómina) · Ajustes. Puede "ver como" logística o cocina. |
| **Logística y compras** | Comanda de mañana + lista de compras · Compra rápida con conteo físico · Despacho a cada comprador · Cobros (cuadre del bote de Alórica y pagos de clientes) · Más (stock y conteos, pago diario a cocina, mermas). |
| **Cocina** | Producir con un toque (elige carnicería y cantidad) · Nevera por lotes con vencimiento a 3 días · Mis comisiones · Merma · Cierre de jornada (descuenta la limpieza). |

Para entrar hay que **verificar el correo** (llega un enlace al crear la cuenta) y se puede **recuperar la contraseña** por correo. Todas tienen **Español / English** y **Visión Clara** (letra grande, botones de 64 px, alto contraste) en Ajustes.

## Probar sin Firebase (modo demo)

```bash
npm install
npm run demo
```

Abre la dirección que muestra la terminal, entra con un rol y en **Ajustes → Cargar datos iniciales**. Los datos quedan solo en ese navegador.

## Ponerla en marcha de verdad

### 1. Firebase

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com) (plan gratuito Spark).
2. **Authentication → Sign-in method →** activa *Correo electrónico/contraseña*.
   En **Authentication → Templates** puedes poner "Mountain Burger" como remitente y revisar el texto del correo de verificación y el de cambio de contraseña (ya salen en español).
3. **Firestore Database →** créala (modo producción, región `southamerica-east1` o la más cercana).
4. **Firestore → Reglas →** pega el contenido de `firestore.rules` y publica.
5. **Configuración del proyecto → Tus apps →** agrega una app web y copia los datos del SDK.

### 2. Configuración local

Ya viene configurado para el proyecto `mountain-burger-5c3a4` en `.env.local` (desarrollo) y `.env.production` (lo usa Netlify al compilar, así que no hace falta poner variables en Netlify). Si algún día cambias de proyecto, edita esos dos archivos.

```bash
cp .env.example .env.local   # y llena los 6 valores de Firebase
npm install
npm run dev
```

### 3. Primera cuenta de administración

1. En la app, toca **Crear cuenta** con tu correo. Te llega un correo: toca el enlace y vuelve a la app (**Ya lo verifiqué**).
2. En la consola de Firebase → Firestore → colección `users` → tu documento → cambia `role` de `pendiente` a `admin`.
3. Vuelve a la app: ya entras como administración. Ve a **Ajustes → Cargar datos iniciales**.
4. Las demás personas crean su cuenta y verifican su correo; tú les asignas el rol en **Catálogo → Usuarios** (`logistica` o `cocina`).

### 4. Netlify

1. Sube el proyecto a un repositorio (GitHub) y en Netlify elige **Add new site → Import from Git**.
2. Build command `npm run build`, publish directory `dist` (ya está en `netlify.toml`).
3. No hace falta configurar variables: Netlify toma `.env.production`.
4. En Firebase → Authentication → Settings → **Authorized domains**, agrega el dominio de Netlify.

En el celular: abre la página y elige **Agregar a pantalla de inicio**.

## Qué hay que configurar desde la app

La pantalla de Inicio lista lo pendiente. Los datos iniciales traen:

- **Receta Mountain Burger v1:** carne 60 g, pan 1, tomate 1 rebanada, queso 1 tajada, bolsita 1, cinta 15 cm. Cátsup y lechuga en 0 g → ponles el gramaje en Catálogo → Recetas.
- **Regla de La Abuela:** sal, ajo y pimienta en 0 → pon cuánto lleva cada gramo de carne (ej. 0.01 = 10 g por kilo).
- **Conversiones:** cuántas rebanadas da un tomate, tajadas por paquete de queso, cm por rollo de cinta (Catálogo → Insumos).
- **Parrilla:** 1500 W. Falta el **tiempo por tanda y hamburguesas por tanda** de cada carne (Costos → Parrilla y luz).
- **Luz:** tarifa **aproximada de 800 $/kWh** (EMCALI publicó un costo unitario cercano a 759 $/kWh en enero de 2026). Cámbiala cuando tengas un dato mejor.
- **Limpieza de cierre (recomendación inicial por jornada):** jabón 20 g, Fabuloso 60 ml, 1 bolsa de basura; Fino en 0. Ajusta según cuántas jornadas te dura cada producto.
- **Gastos de la casa:** como la factura es de toda la casa, se recomienda acordar un aporte mensual fijo por servicios y registrarlo en Costos → Gastos de la casa; la app lo reparte entre las hamburguesas del mes.
- **Precios de ejemplo:** Alórica 10.000, Don Santiago 8.000; Parque sin precio. Se agregan compradores nuevos en Catálogo → Compradores y precios.
- **Comisión:** 1.000 por hamburguesa de referencia; logística la cambia en Más → Pago cocina. Se liquida a diario.
- **Fondos:** modo *costo real* (Resurtido recibe el costo de los insumos vendidos, Nómina la comisión, el resto 50/50 entre Operativos y Utilidad).

## Cómo está hecha

```
src/
  domain/      lógica pura y probada: unidades, receta (BOM), faltantes, fondos, costos, PEPS, cuadre
  data/
    backend.js         interfaz única de datos (Firestore o demo)
    firebaseAdapter.js Firestore con caché offline + Auth
    memoryAdapter.js   modo demo
    ops.js             cada operación = un lote atómico (todo o nada), sin lecturas → sirve sin señal
    store.jsx          suscripciones en vivo y catálogos compartidos
    costs.js           modelo de costo completo y margen
    seed.js            datos iniciales
  screens/     admin · logistica · cocina · common
firestore.rules  permisos por rol; correo verificado obligatorio; libros que solo se agregan; nota obligatoria en mermas
test/            pruebas (npm test)
```

Diferencias con el documento de modelo de datos, propias de Firestore: las líneas de receta (`recipe_ingredients`), de compra (`purchase_items`) y las conversiones por insumo viven dentro de su documento padre; y hay documentos resumen (`stock`, `finished_stock`, `finished_lots`, `fund_balances`) que se actualizan con incrementos para ver saldos al instante.

## Pruebas

```bash
npm test
```

Cubre conversiones, explosión de receta con la regla de La Abuela, lista de compras, reparto en fondos, costo completo, PEPS/vencimiento, cuadre del bote y un día completo de operación (compra → producción → despacho → cobro → cuadre → merma → liquidación).
