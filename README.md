# Sistema de Inventario Multialmacén — Etapa 3

Esta entrega incluye todo lo de la etapa 2 (login, almacenes, usuarios,
productos, categorías, unidades, proveedores, clientes, datos de
empresa) más:

- **Entradas**: registrar el ingreso de varios productos a la vez en
  un almacén, con proveedor, precio y fecha de vencimiento por
  producto. El stock del almacén sube automáticamente.
- **Salidas**: registrar la salida de varios productos a la vez, con
  cliente y precio. Si algún producto no tiene stock suficiente, el
  sistema cancela toda la operación y avisa cuál es el producto y
  cuánto stock hay disponible — no se guarda nada a medias.

No se necesita ningún SQL adicional para esta etapa: las reglas de
entradas y salidas ya estaban incluidas en `schema.sql` (etapa 1).

Lo que falta para las próximas etapas: pedidos internos y traspasos
entre almacenes, reportes imprimibles y estadísticas.

## 1. Configurar Supabase (una sola vez)

1. Entra a tu proyecto en https://supabase.com
2. Ve a **SQL Editor** → nueva consulta.
3. Pega el contenido completo de `schema.sql` (el que recibiste en la
   etapa 1) y presiona **Run**.
4. Pega también el contenido de `update_1_setup_check.sql` y presiona
   **Run**.
5. Ve a **Storage** → **New bucket** y crea:
   - `product-images` → marca la casilla **Public bucket**
   - `company-assets` → marca la casilla **Public bucket**
6. Ve a **Project Settings → API** y copia:
   - **Project URL**
   - **anon / public key**

## 2. Configurar el proyecto

1. Copia el archivo `.env.example` y renómbralo a `.env`
2. Pega ahí tu Project URL y tu anon key:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu_anon_key
   ```

## 3. Probar en tu computadora (opcional)

```
npm install
npm run dev
```

Abre la dirección que te muestre la terminal. La primera vez, el
sistema te pedirá crear la cuenta del administrador (nombre, correo y
contraseña). Esa persona queda automáticamente como "Administrador de
sistema".

## 4. Publicar en Netlify

1. Sube esta carpeta a un repositorio de GitHub (o arrastra el ZIP
   directamente en Netlify si prefieres).
2. En Netlify: **Add new site → Import an existing project**.
3. Framework: Vite. Build command: `npm run build`. Publish directory:
   `dist` (ya viene configurado en `netlify.toml`).
4. En **Site settings → Environment variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Despliega. Entra a la URL que te da Netlify y crea tu usuario
   administrador (igual que en el paso 3).

## Notas importantes

- Para crear más usuarios (administradores de almacén o usuarios),
  no necesitas volver a Supabase: usa el botón "Nuevo usuario" dentro
  del propio sistema, en la sección **Usuarios**.
- El sistema es responsive: se ve y funciona bien tanto en
  computadora como en celular, desde el mismo sitio publicado.
- Nunca se usa la Service Role Key ni Edge Functions: todo funciona
  con la Anon key + seguridad por fila (RLS) definida en el SQL.
