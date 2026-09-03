# GINapp · Todas las imágenes

Casi todas las imágenes de la app viven en **una sola carpeta**: `img/`, dentro
del repo, al lado de `index.html`. Si un fichero no está, la app **no se
rompe**: pone la inicial de la persona sobre su color, el emoji de siempre, o
el logo dibujado a mano.

Puedes ir subiéndolas de una en una. Ninguna depende de las demás.

Hay dos grupos:

- **Los 4 iconos de la app y las 3 fotos**: los iconos van con nombre fijo;
  las fotos, con el nombre que pongas en la pestaña `Usuarios`. Más abajo.
- **Los iconos que se eligen desde el Sheet**: subes el fichero con el nombre
  que quieras y escribes ese nombre en la casilla que toque. Es la sección
  siguiente.

La única excepción son las fotos del DNI y demás documentos de Gina, que se
suben desde la propia app y van a Drive.

---

## Resumen: los 7 primeros

| # | Fichero | Tamaño | Qué es | ¿Existe ya? |
|---|---------|--------|--------|-------------|
| 1 | `img/icon-192.png` | 192×192 | Icono de la app (Android) | ⚠️ provisional |
| 2 | `img/icon-512.png` | 512×512 | Icono de la app (Android, grande) | ⚠️ provisional |
| 3 | `img/icon-maskable-512.png` | 512×512 | Icono recortable (Android moderno) | ⚠️ provisional |
| 4 | `img/apple-touch-icon.png` | 180×180 | Icono en el iPhone | ⚠️ provisional |
| 5 | la tuya | 400×400 | Tu foto | ✅ `nico.webp` |
| 6 | la de la madre | 400×400 | Foto de la madre de Gina | ✅ `carla.webp` |
| 7 | la de Gina | 400×400 | Foto de Gina | ✅ `gina.webp` |

Las tres fotos son la excepción: **el nombre lo eliges tú** y lo escribes en
la columna `foto` de la pestaña `Usuarios`. `.webp` vale perfectamente.

Los cuatro iconos **ya están puestos**, pero son un cuadrado naranja con una
"G" genérica: no son el logo de GINapp. Funcionan; simplemente están feos.

---

## Los 46 iconos de las secciones

Todo esto se puede sustituir por una imagen tuya **sin tocar el código**.

### Cómo se hace

Subes el `.webp` a `img/` con el nombre exacto de la tabla. Ya está.

No hay que escribir el nombre en ninguna parte: la app lo deduce del id de
cada fila. Puedes subirlos de uno en uno y en cualquier orden — mientras un
fichero no esté, esa fila enseña su emoji de siempre y no se rompe nada.

Si subes uno y no lo ves, dale a **Actualizar** (abajo del todo): la app
recuerda durante la sesión qué ficheros faltaban para no pedirlos treinta
veces por pantalla, y recargar vuelve a probarlos.

> **Ojo con las mayúsculas.** GitHub Pages distingue: `Gina.webp` y
> `gina.webp` son dos ficheros distintos. Todos los nombres van en
> minúscula.

**La excepción.** Las pestañas tienen una columna `icono` (y `fichero` en la
pestaña `Iconos`) que normalmente está vacía. Solo sirve si algún día
quieres que dos filas compartan el mismo dibujo, o apuntar a una imagen que
está fuera del repo. Lo que escribas ahí manda sobre el nombre por
convención.

### Tamaños

| Qué | Tamaño | Formato |
|---|---|---|
| Iconos de categoría (`ev_`, `gas_`, `com_`, `gr_`) | **64 × 64 px** | `.webp` con transparencia |
| Iconos del resumen semanal (`ich_`) | **96 × 96 px** | `.webp` con transparencia |
| Logos (`logo_splash`, `logo_login`) | hasta **300 × 150 px** en pantalla; sube el doble (600 × 300) | `.webp` con transparencia |

Que el dibujo llene el lienzo: la app no le añade margen. El fondo tiene que
ser transparente — detrás hay un color que cambia según de quién sea el día.

---

### Categorías de eventos

| Sube este fichero | Para | En vez de |
|---|---|---|
| `ev_vacaciones.webp` | Vacaciones | 🏖️ |
| `ev_tareas.webp` | Tareas | 📋 |
| `ev_excursiones.webp` | Excursiones | 🥾 |
| `ev_dentista.webp` | Dentista | 🦷 |
| `ev_medico.webp` | Médico | 🩺 |
| `ev_sin_clases.webp` | Sin clases | 🏫 |
| `ev_actividad_cole.webp` | Actividad cole | 🎨 |
| `ev_cumples.webp` | Cumples | 🎂 |
| `ev_viajes.webp` | Viajes | ✈️ |
| `ev_otros.webp` | Otros | 📌 |

### Categorías de gastos

| Sube este fichero | Para | En vez de |
|---|---|---|
| `gas_salud.webp` | Salud | 🩺 |
| `gas_educacion.webp` | Educación | 🎓 |
| `gas_actividades.webp` | Actividades | ⚽ |
| `gas_ropa.webp` | Ropa | 👕 |
| `gas_alimentacion.webp` | Alimentación | 🍎 |
| `gas_transporte.webp` | Transporte | 🚌 |
| `gas_material.webp` | Material escolar | ✏️ |
| `gas_ocio.webp` | Ocio | 🎡 |
| `gas_otro.webp` | Otros | 🧾 |

### Comidas del día

| Sube este fichero | Para | En vez de |
|---|---|---|
| `com_desayuno.webp` | Desayuno | 🥣 |
| `com_almuerzo.webp` | Almuerzo | 🍎 |
| `com_comida.webp` | Comida | 🍽️ |
| `com_merienda.webp` | Merienda | 🍪 |
| `com_cena.webp` | Cena | 🌙 |
| `com_otro.webp` | Otra | 🍴 |

### Categorías de comida

| Sube este fichero | Para | En vez de |
|---|---|---|
| `gr_verduras.webp` | Verdura | 🥦 |
| `gr_fruta.webp` | Fruta | 🍓 |
| `gr_legumbres.webp` | Legumbres | 🫘 |
| `gr_pescado.webp` | Pescado | 🐟 |
| `gr_huevos.webp` | Huevos | 🥚 |
| `gr_proteina_blanca.webp` | Pollo y pavo | 🍗 |
| `gr_frutos_secos.webp` | Frutos secos | 🥜 |
| `gr_lacteos.webp` | Lácteos | 🥛 |
| `gr_cereales.webp` | Cereales y pan | 🍞 |
| `gr_carnes_rojas.webp` | Carne roja | 🥩 |
| `gr_ultraprocesado.webp` | Ultraprocesados | 🍟 |
| `gr_capricho.webp` | Caprichos | 🍬 |
| `gr_permitido.webp` | Comida libre | 🍕 |

### Logos y resumen semanal

| Fichero | Dónde sale |
|---|---|
| `logo_splash.webp` | Pantalla de carga, mientras arranca la app |
| `logo_login.webp` | Pantalla donde metes el PIN |
| `ich_empezando.webp` | Resumen semanal · aún no hay datos suficientes |
| `ich_genial.webp` | Resumen semanal · dos o más alimentos nuevos |
| `ich_nuevo.webp` | Resumen semanal · un alimento nuevo |
| `ich_progreso.webp` | Resumen semanal · más variedad que la semana pasada |
| `ich_oportunidad.webp` | Resumen semanal · un grupo va flojo |
| `ich_bien.webp` | Resumen semanal · buena semana |

### El color de fondo de esas dos pantallas

Se pone en la pestaña `Config`, clave **`color_carga`**, con un color en
hexadecimal (`#F2E3FB`). Vacío = el fondo gris claro de siempre. Afecta a la
pantalla de carga, a la del PIN y a la barra de estado del móvil mientras
arranca.

Si además la app está instalada en el móvil, cambia también
`background_color` y `theme_color` en `manifest.json` al mismo valor: es lo
que pinta Android en el medio segundo anterior a que arranque nada.

**Sube el logo con fondo transparente**, aunque pongas color de fondo. Si el
`.webp` lleva su propio fondo y el color no coincide al píxel, se ve un
rectángulo recortado alrededor.

### El logo de la pantalla de carga tiene truco

Esa pantalla se dibuja **antes** de pedir nada al Sheet, así que la primera
vez que abras la app después de ponerlo verás todavía el logo dibujado a
mano. A partir de la segunda vez ya sale el tuyo: la app se acuerda del
nombre del fichero. Es el precio de que la carga aparezca al instante y sin
conexión.

### Fotos del DNI y demás documentos de Gina

Esas **no** van en `img/`. Se hacen desde la propia app (Datos de Gina →
Documento → Anverso / Reverso) y se guardan en la carpeta de Drive, como los
comprobantes de gastos. No hay que subir nada a mano.

---

## 1 · Los cuatro iconos de la app

Son los que se ven en la pantalla de inicio del móvil cuando instaláis la app,
y en el conmutador de aplicaciones. Se declaran en `manifest.json` y en la
línea 12 de `index.html`; **no toques esos ficheros**, solo sustituye los PNG.

### `img/icon-192.png` — 192 × 192 px, PNG
### `img/icon-512.png` — 512 × 512 px, PNG

El logo de GINapp centrado, **con su fondo** (no transparente). Deja un margen
de respiro de un 10 % por cada lado: Android le aplica esquinas redondeadas y
si el dibujo llega al borde, lo corta.

### `img/icon-maskable-512.png` — 512 × 512 px, PNG

El mismo logo, pero con **mucho más margen**: todo lo importante tiene que caber
dentro del círculo central que ocupa el 80 % del lienzo. Android lo recorta en
círculo, en cuadrado o en gota según el móvil, y solo garantiza esa zona
central. En la práctica: el mismo diseño al ~65 % de tamaño sobre el mismo
fondo de color.

Si te da pereza hacer dos, puedes subir el mismo fichero como
`icon-512.png` y `icon-maskable-512.png` — se verá un poco apretado en algunos
Android, nada grave.

### `img/apple-touch-icon.png` — 180 × 180 px, PNG

Para el iPhone. **Sin transparencia y sin esquinas redondeadas**: iOS redondea
él solo, y si le mandas una imagen ya redondeada queda un halo raro. Fondo
sólido de borde a borde.

**Cuidado con iOS:** el icono se congela en el momento en que añades la app a
la pantalla de inicio. Si lo cambias después, hay que **quitar la app de la
pantalla de inicio y volver a añadirla** para verlo. En Android se actualiza
solo.

---

## 2 · Las tres fotos de perfil

Estas son las que dan vida a la app: salen en la cabecera, en el selector de
perfil, en la pantalla de entrada, y como puntito de color junto a cada cosa
que apunta cada uno.

### `img/papa.jpg`, `img/mama.jpg`, `img/gina.jpg`

- **400 × 400 px**, cuadradas. La app las recorta en círculo sola
  (`object-fit: cover`), así que centra bien la cara: lo que quede fuera del
  círculo inscrito no se verá.
- **JPG** para fotos (pesan mucho menos). Si tuvieras que usar PNG o WEBP,
  también vale — solo hay que cambiar el nombre en el Sheet (abajo).
- Que no pesen más de ~150 KB cada una. Se cargan en cada pantalla.
- Se ven en tamaños de 26 px a 62 px, así que **un primer plano de cara**
  funciona mucho mejor que un plano entero.

### Cómo se conectan con el Sheet

El nombre del fichero **no está escrito en el código**: sale de la pestaña
**`Usuarios`**, columna **`foto`**. Ahora mismo dice:

| username | nombre | foto |
|----------|--------|------|
| papa | Papá | `papa.jpg` |
| mama | Mamá | `mama.jpg` |
| gina | Gina | `gina.jpg` |

La app compone la ruta como `img/` + lo que ponga esa celda. Así que:

- Si subes `img/papa.jpg`, no tienes que tocar nada.
- Si tu fichero se llama distinto (`nico.png`, `foto-papa.webp`…), escribe ese
  nombre exacto en la celda `foto`. **Solo el nombre, sin `img/`.**
- Si dejas la celda **vacía**, la app pone la inicial sobre el color del
  perfil. Es un estado válido, no un error.

Lo mismo pasa si el fichero no existe todavía: la app detecta que la imagen no
carga y cae a la inicial sin dar ningún fallo. Puedes subir primero la tuya y
dejar las otras dos para cuando las tengas.

---

## 3 · Lo que NO necesita imagen

Para que no pierdas el tiempo:

- **Los iconos de dentro de la app** (calendario, comida, gastos, salud,
  termómetro, pastilla, campana…) son SVG dibujados en el propio
  `index.html`. Son 40 y pico y no hay que subir ninguno.
- **El logo de GINapp** del arranque y de la pantalla de entrada está dibujado
  con texto y un SVG del corazón. No es una imagen.
- **Los alimentos** usan emoji, no fotos.
- **Las categorías de gasto, los tipos de evento y los tipos de cita** usan
  iconos SVG o emoji del Sheet.

---

## 4 · Cómo subirlas

Desde la web de GitHub, sin instalar nada:

1. Entra en el repo → carpeta **`img`**.
2. **Add file → Upload files**.
3. Arrastra el fichero (o los que tengas listos) y **Commit changes**.
4. Si estás reemplazando uno que ya existe, súbelo **con el mismo nombre**:
   GitHub lo sustituye.

Espera un minuto a que GitHub Pages republique.

### Si no ves el cambio

Las imágenes se cachean a propósito (la app funciona sin cobertura). El HTML
siempre se pide a la red, pero los iconos y las fotos se sirven de la caché
mientras se refrescan por detrás. Traducción práctica: **la primera vez que
abras la app verás la imagen vieja, y a la segunda ya está la nueva.**

Si quieres forzarlo del todo, en `sw.js` línea 12 cambia:

```js
const CACHE = 'ginapp-v0.8.0';
```

por `'ginapp-v0.8.1'` (cualquier valor distinto). Eso tira la caché entera y
la reconstruye. En iOS, además, cierra la app del todo antes de reabrirla.

---

## 5 · Orden que yo seguiría

1. **`gina.jpg`** — es la que más se ve: preside la cabecera de la home.
2. **`papa.jpg`** y **`mama.jpg`** — la app deja de ser dos iniciales de
   colores y pasa a parecer vuestra.
3. **Los cuatro iconos** — cuando tengas decidido el logo definitivo. Hazlos
   los cuatro de una tanda, salen del mismo diseño.

---

## 6 · Estructura final de la carpeta

```
ginapp/
├── index.html
├── manifest.json
├── sw.js
└── img/
    ├── icon-192.png             192×192   PNG   icono Android
    ├── icon-512.png             512×512   PNG   icono Android grande
    ├── icon-maskable-512.png    512×512   PNG   icono recortable
    ├── apple-touch-icon.png     180×180   PNG   icono iPhone
    ├── papa.jpg                 400×400   JPG   ← columna foto de Usuarios
    ├── mama.jpg                 400×400   JPG   ← columna foto de Usuarios
    └── gina.jpg                 400×400   JPG   ← columna foto de Usuarios
```

(`Code.gs` no va en el repo: vive en el editor de Apps Script.)
