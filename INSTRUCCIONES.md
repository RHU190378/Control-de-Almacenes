# Sistema de Almacenes — Guía rápida (para personas sin conocimientos técnicos)

Necesitas: una cuenta gratuita en **supabase.com** y otra en **netlify.com**.

## PARTE A — Supabase (la base de datos)
sistema_almacenes
@soporte123*
1. Entra a supabase.com > **New project**. Ponle un nombre y una contraseña de base de datos (guárdala). Espera 1–2 minutos.
2. Abre el archivo `supabase/schema.sql` con el Bloc de notas. Busca la línea que dice `>>> EDITA AQUÍ <<<` y cambia
   `CAMBIA_ESTE_CORREO@ejemplo.com` por **tu correo real** (el del administrador). Guarda.
3. En Supabase: menú izquierdo **SQL Editor** > **New query**. Copia TODO el contenido de `schema.sql`, pégalo y pulsa **Run**.
   Debe decir *Success. No rows returned*. (Se puede ejecutar de nuevo sin perder datos.)

4. En Supabase: **Authentication > Providers > Email** y desactiva **Confirm email**. Guarda.

5. El bucket de fotos llamado **fotos** (público) se crea solo con el script. Verifica en **Storage** que exista;
   si no aparece, créalo: **New bucket** > nombre exacto `fotos` > marca **Public bucket** > Save.

6. Ve a **Project Settings > API** y copia dos datos: **Project URL:https://rrgppwnupeoofywvfwfz.supabase.co/rest/v1/** y la clave **anon / publishable**:sb_publishable_Ja34UIEQftS4frY52fJ9uA_VuVOas2n.

## PARTE B — Conectar la aplicación (2 datos)

7. Abre `src/config.ts` y reemplaza solo estas dos líneas:
   - `SUPABASE_URL`  → tu Project URL
   - `SUPABASE_KEY`  → tu clave pública (anon / publishable)

## PARTE C — Netlify (publicar)

8. En Netlify: **Add new site > Deploy manually** y arrastra la carpeta del proyecto ya descomprimida
   (o conecta tu repositorio de GitHub: Netlify detecta todo solo gracias a `netlify.toml`).
   Si Netlify lo pide: comando `npm run build`, carpeta de publicación `dist`.
9. Abre la dirección que te da Netlify. Verás **"¿Primera vez? Crear el administrador inicial"**.
   Escribe tu nombre, **el mismo correo del paso 2** y la contraseña que quieras. Listo.

## Después

- **Más usuarios:** dentro del programa, menú **Usuarios** > Nuevo usuario (nombre, correo, contraseña, rol y almacén).
  Hasta 3 administradores de sistema y 2 administradores por almacén; usuarios ilimitados.
- **Instalar en el celular (PWA):** abre la dirección en el celular > menú del navegador > "Agregar a pantalla de inicio".
- **Datos de empresa y logo:** menú *Datos de la empresa*. **Productos en masa:** menú Importar Excel.
- **Si ya tenías una versión anterior:** vuelve a pegar y ejecutar el `schema.sql` nuevo (no borra datos) y vuelve a publicar la app.

## Novedades de esta versión

- Menú en columna a la izquierda; panel con saldo de combustible por almacén y por producto.
- Reportes: una sola lista de consultas con *Fecha inicial / Fecha final* (inventario con entradas y salidas, categorías, movimientos,
  combustible y agroquímicos por equipo o tipo, gasto de repuestos por equipo, servicios, horómetro y mantenimiento).
- *Control de maquinaria* (horómetros) y *Control de mantenimiento* (con alertas), con formulario y panel.
- El **precio unitario** se escribe en cada nota de ingreso; el costo del producto se calcula solo (promedio ponderado).
- Pedido aprobado → se genera solo la **nota de traspaso**.
- Botón **Buscar** con número de nota; botón **Imprimir** con vista previa (PDF, Excel o impresora).
- Pantalla de **Unidades de manejo** (nombre, abreviatura, equivalencia, descripción).
