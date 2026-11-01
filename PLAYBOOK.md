# Playbook: webapps personales con coste 0 €

Lo aprendido construyendo **GINapp** (PWA de ~9.000 líneas en producción, usada
a diario por dos personas). Está escrito para que otro chat pueda arrancar una
app nueva, o arreglar una existente, sin volver a tropezar con lo mismo.

Casi nada de aquí es teoría: cada regla está porque algo falló primero. Cuando
sé qué falló, lo cuento — una regla sin su motivo es una regla que alguien
borrará en seis meses.

---

## 1. La arquitectura, y cuándo NO usarla

```
index.html  ──fetch──>  Apps Script /exec  ──>  Google Sheet
 (GitHub Pages)            (Code.gs)            (la base de datos)
```

- **Frontend**: UN solo `index.html` con CSS y JS inline. Sin build, sin npm,
  sin framework, sin dependencias en runtime.
- **Backend**: Google Apps Script publicado como web app.
- **Datos**: un Google Sheet. Una pestaña por tabla.
- **Hosting**: GitHub Pages. PWA instalable desde el móvil.
- **Coste**: 0 €. **Mantenimiento**: no hay dependencias que actualizar.

### Por qué un solo fichero

Suena mal y es lo correcto aquí. Un `index.html` de 450 KB se sirve en una
petición, no tiene paso de build que se pueda romper, no tiene `node_modules`
que caduque, y dentro de dos años se abrirá igual. Partirlo en módulos
obligaría a un bundler, y un bundler es una dependencia que hay que mantener
para una app que usan dos personas.

El límite real no es el tamaño: es que **tu asistente tiene que poder editarlo
sin leerlo entero**. Con buenos nombres de función y comentarios que digan *por
qué*, se edita por partes sin problema.

### Cuándo este stack NO sirve

Dilo pronto, no a mitad de camino:

- **Más de ~5.000 filas por pestaña.** Apps Script lee la hoja entera; a partir
  de ahí el arranque se va de las manos. Toca Firestore o Supabase.
- **Varias personas escribiendo a la vez sobre lo mismo.** No hay bloqueos ni
  transacciones. Para una familia va bien; para un equipo, no.
- **Datos que no te puedes permitir perder.** Un Sheet se edita a mano y
  alguien borrará una fila. Ten pestaña `Papelera`.
- **Secretos de verdad** (claves de pago, datos de terceros). Apps Script corre
  con la cuenta de quien lo publica.
- **Latencia garantizada.** Ver la sección de rendimiento: el arranque en frío
  son segundos y no hay forma de evitarlo.

---

## 2. Las reglas que no se negocian

Las cinco primeras son de GINapp y se han ganado el sitio. Cópialas tal cual.

**1. Se lee y se escribe SIEMPRE por el nombre de la cabecera, nunca por
posición.** Alguien insertará una columna en el Sheet y, con índices, todo se
corre una posición en silencio. No hay error: hay datos mal.

**2. Nada derivado se persiste.** Saldos, totales, rachas, variedad: se
calculan al vuelo desde los registros. Un total guardado se desincroniza del
dato que lo produjo y a partir de ahí ya no sabes cuál de los dos miente.
*Excepción legítima*: una **marca de hasta dónde se ha llegado** (`ultima_generada`,
`generado_hasta`). Eso no es un cálculo, es el registro de una acción —
sin ella, algo que el usuario borró a mano reaparece en el siguiente arranque.

**3. Todo lo configurable vive en una pestaña del Sheet.** Y **una tabla vacía
hace desaparecer la feature, no la rompe.** Así el usuario cambia el
comportamiento sin tocar código ni pedírtelo a ti.

**4. Inputs numéricos: `type="text" inputmode="decimal"`.** `type="number"` se
come la coma decimal en teclados en español. `1,50` entra como `1`. Y en JS,
normaliza siempre:

```js
function num(v){
  var s = String(v==null ? 0 : v).trim().replace(/[\s €]/g,'');
  if(s.indexOf(',') >= 0) s = s.replace(/\./g,'').replace(',','.');   // 1.240,55
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');   // 1.240
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}
```

**5. Toda función destructiva informa por defecto y solo actúa con un
parámetro explícito.** `limpiarX()` cuenta lo que haría; `limpiarX(true)`
lo hace. Sin esto, un día te equivocas de función en el desplegable del editor.

Y una sexta que añadiría desde el principio:

**6. Lo que se borra va a una pestaña `Papelera` antes de borrarse.** Es una
fila más y te ahorra el día que pase.

---

## 3. Google Sheets: las tres trampas

**Sheets convierte lo que le pegas.** `"14:00"` se vuelve una fecha de 1899 y
`"08/09/26"` se vuelve un `Date`. Normaliza SIEMPRE al leer:

```js
function _cellValue(v) {
  if (v instanceof Date) {
    const tz = _tz();
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, tz, 'HH:mm');  // era una hora
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}
```

**Las fechas pegadas a mano son ambiguas.** `8/9/26` es el 8 de septiembre en
España y el 9 de agosto para `new Date()`. Si caes en `new Date(texto)` tienes
un bug que solo aparece los días ≤ 12 de cada mes — o sea, casi siempre, pero
no siempre, que es lo peor. Escribe tu propio parser que asuma día/mes y
complete los años de dos cifras.

**La misma función de fecha tiene que existir en los dos lados**, backend y
frontend, y leer igual. Si no, el backend filtra una cosa y la app busca otra.

---

## 4. Rendimiento: el arranque en frío manda

**El problema:** Apps Script se duerme. Si nadie lo ha usado en un rato, el
arranque son varios segundos **antes** de ejecutar la primera línea. Si lo
abriste hace un minuto, medio segundo. Eso es lo que hace que la app a veces
vuele y a veces parezca rota.

**No se puede evitar.** Lo que sí se puede es dejar de mirarlo. Cuatro cosas,
por orden de impacto:

### 4.1 Una sola llamada al arrancar

Un `getBootstrap` que devuelve TODO lo que la app necesita. Cinco llamadas son
cinco arranques en frío, no uno.

(Mi primera hipótesis fue que había demasiadas llamadas. La comprobé: ya había
una sola. La causa era el arranque en frío. **Mide antes de optimizar**, también
cuando el que propone la hipótesis es el usuario.)

### 4.2 Pintar con lo de la última vez

`localStorage` guarda el último bootstrap. Al abrir, la app pinta eso al
instante y refresca por detrás. Una cinta arriba dice de cuándo son los datos
mientras no lleguen los frescos.

Descarta la caché si es de otra versión de la app (el formato pudo cambiar) o
si tiene más de ~72 h. Y envuelve cada lectura y escritura en `try/catch`:
en navegación privada eso lanza.

### 4.3 Cachear el bootstrap montado en el servidor

`CacheService` 60 segundos. Si dos personas abren la app con un minuto de
diferencia, no se vuelven a leer las 34 pestañas.

**Tope de 100 KB por clave**, así que hay que partirlo en trozos. Guarda el
manifiesto (`_boot_n` = cuántos trozos) **el último**: si lo guardas primero y
falla un trozo, sirves medio JSON. Y si al leer falta uno, descarta el conjunto
entero antes que servir algo incompleto. Cualquier escritura tira la caché.

### 4.4 Guardar sin esperar

Esto fue lo que más se notó. Guardar eran **dos** viajes: el POST que escribe y
después una recarga completa para enterarse de la fila recién escrita.

```js
// 1. El backend DEVUELVE la fila guardada. Cero lecturas después.
// 2. Y no se le espera:
guardarOptimista({
  tabla: 'gastos',
  provisional: filaConIdTemporal,   // se pinta YA
  accion: 'saveGasto',
  payload: {...},
  reintentar: guardarGasto          // para el botón del aviso de fallo
});
```

Pinta la fila con un id provisional, cierra el formulario y manda por detrás.
Si falla: se deshace y sale un aviso **persistente** con botón de reintentar.
Un toast de dos segundos no vale aquí — si desaparece mientras miras otra cosa,
te quedas creyendo que se guardó.

**Optimista con la red, nunca con las reglas.** Si el backend puede contestar
«falta el título», valida ANTES en el cliente. Lo optimista solo cubre la
latencia, no la posibilidad de que la operación sea inválida.

Un punto girando en una esquina mientras haya algo en vuelo. Y **no** lo
apliques a lo que se toca de uvas a peras: ahí no compensa la complejidad.

---

## 5. Red: lo que Apps Script hace y nadie te avisa

### 5.1 POST como `text/plain` para esquivar el preflight CORS

```js
fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // NO application/json
  body: JSON.stringify(body)
});
```

`application/json` dispara un preflight `OPTIONS` que Apps Script no contesta.
En el backend, parsea `e.postData.contents` a mano.

### 5.2 La respuesta NO siempre es JSON

Apps Script devuelve **HTML** cuando se atraganta, cuando falta publicar una
versión, o cuando Google decide pedir login. Si haces `r.json()` a pelo, el
usuario ve `Unexpected token '<'`, que no significa nada para nadie.

```js
function leerRespuesta(r){
  return r.text().then(function(t){
    try { return JSON.parse(t); }
    catch(e){
      throw new Error(
        /accounts\.google\.com|ServiceLogin/i.test(t)
          ? 'Google está pidiendo iniciar sesión. Abre la URL del backend una vez.'
        : /<title>Error|Script function not found/i.test(t)
          ? 'El backend ha devuelto un error. Suele faltar publicar versión nueva.'
        : 'El backend no ha contestado con datos. Vuelve a intentarlo.');
    }
  });
}
```

Reintenta **una vez** ante un tropiezo de red o un no-JSON. Un error legítimo
del backend (`ok:false` con mensaje) NO se reintenta.

### 5.3 Una sola puerta de entrada

`doGet` y `doPost` tienen que desembocar en la **misma** función de despacho
que comprueba el token y los permisos. Si `doPost` rutea por su cuenta, el
control de acceso deja de aplicarse justo a las escrituras.

### 5.4 Volcar el buffer antes de contestar

Apps Script agrupa las escrituras. Sin `SpreadsheetApp.flush()` antes de
devolver, una lectura inmediata puede no ver lo que acabas de escribir.

---

## 6. Autenticación sin servidor de sesiones

Token HMAC sin estado. Nada que almacenar, nada que caduque mal.

```
token = usuario.expiracion.firma
firma = HMAC-SHA256(usuario + "." + expiracion, SECRETO)
```

- El `SECRETO` se autogenera la primera vez y vive en Script Properties, nunca
  en el Sheet ni en el repo.
- Validar = recalcular la firma y comprobar la fecha. Sin tabla de sesiones.
- Caducidad larga (90 días): es una app familiar, no un banco.
- Una lista blanca de acciones que no requieren token (`ping`, `login`), y
  **todo lo demás pasa por el control**.
- Para el PIN, limita los intentos con `CacheService`.

Si guardas contraseñas de terceros (la del cole, la del seguro), **cífralas**
con una clave en Script Properties. En claro en un Sheet es inaceptable aunque
el Sheet sea privado: se comparte por accidente.

---

## 7. Despliegue y cachés: donde más tiempo perdí

Tres cachés distintas te pueden servir la versión vieja, y es fácil limpiar la
que no es. Me pasó: desregistré el service worker varias veces y el problema
estaba en otro sitio.

### Las tres

| Cuál | Quién la limpia |
|---|---|
| Caché del service worker | `caches.delete()` |
| **Caché HTTP del navegador** | Nada de lo anterior. Es la que me engañó. |
| Caché del bootstrap en `localStorage` | Tu propio código, por versión |

### El service worker: `no-store` no es decorativo

Un service worker *network-first* para el HTML está bien, pero:

```js
// MAL: este fetch «de red» puede resolverse contra la caché HTTP del navegador.
fetch(req)

// BIEN:
fetch(req.url, { cache: 'no-store', credentials: 'same-origin' })
```

GitHub Pages sirve el HTML con varios minutos de `Cache-Control`. Sin
`no-store`, el network-first **no llega a la red** y la app se queda en la
versión anterior después de desplegar. Parece un bug del service worker y no
lo es.

### Recargar de verdad

```js
// location.reload() respeta la caché HTTP. location.reload(true) lo ignoran
// todos los navegadores desde hace años. La única URL que ninguna caché
// puede acertar es una que no ha visto nunca:
location.replace(url + '?v=' + Date.now());
```

Y quita el parámetro al arrancar con `history.replaceState` para que no se
quede pegado.

### El aviso de versiones: mira hacia DÓNDE

Enseña la versión del frontend y la del backend, y avisa si no coinciden. Pero
**compara, no mires solo si son distintas**. Mi aviso decía siempre «falta
publicar el backend»; cuando la vieja era la app (que es lo normal, porque el
backend se publica a mano y la app se baja sola) mandaba a republicar algo ya
publicado. Diez minutos perdidos haciendo lo contrario de lo que tocaba.

Y compara como números, no como texto: `"0.9.9" > "0.9.33"` alfabéticamente.

### Checklist de cada despliegue

1. Subir `APP_VERSION` en el frontend **y** en el backend, y el nombre de la
   caché en el service worker. Los tres a la vez.
2. Frontend: commit y push. Pages despliega solo (~1 min).
3. Backend: pegar el código → Guardar → **Implementar › Gestionar
   implementaciones › ✏️ › Versión: Nueva**. **Guardar no despliega.** Este es
   el fallo más repetido: ejecutas desde el editor y funciona, porque el editor
   usa el código guardado; la app usa el desplegado.
4. Las pestañas y columnas nuevas se crean solas al primer arranque tras
   cambiar de versión. Comprueba el orden: si la caché se mira ANTES que la
   migración, las columnas nuevas tardan un minuto en existir.

---

## 8. Tests: jsdom, sin framework

**16+ ficheros, cero dependencias salvo `jsdom`.** Se corren con
`node test_algo.js`. Cada uno carga el `index.html` real en jsdom con
`runScripts:'dangerously'`, un `fetch` falso, y pincha la UI de verdad.

Para el backend: stubs de los globales de Google (`SpreadsheetApp`,
`Utilities`, `DriveApp`, `CacheService`, `Logger`…) y `eval` del `Code.gs`,
sustituyendo `_readSheet`/`_upsert` por tablas en memoria.

### Lo que hace que un test sirva

**Un test que no puede fallar no es un test.** Tres formas reales en que los
míos no probaban nada:

- Los `fetch` falsos solo tenían `json()`, no `text()` — y el código real usa
  `text()`. Dejaban sin probar justo el camino que fallaba en el móvil.
- El `getSheetByName` falso devolvía `null` para todo, así que cualquier
  handler que empiece comprobando que la pestaña existe salía por la puerta
  antes de hacer nada, y el test pasaba en verde.
- Faltaba el stub de `Logger`, así que un `catch` que reporta por `Logger.log`
  se convertía él mismo en la excepción.

**Cuando arregles un bug, comprueba que el test nuevo falla con el código
viejo.** Si no, no estás probando el arreglo. Revertir el cambio treinta
segundos y volver a correr es barato.

**El comentario del test dice qué se rompió, no qué hace el código:**

```js
/* Pasó de verdad: el backend estaba en la 0.9.33 y la app en la 0.9.32, y
   el aviso decía «falta publicar el backend». El aviso miraba SI había
   desfase, nunca hacia dónde. */
ok('si la app va detrás, NO se manda a publicar el backend', ds.q === 'app');
```

**No pongas constantes a mano que cambian cada versión.** Tenía un
`=== '0.9.30'`; se rompía en cada subida y lo único que probaba era que
alguien se había acordado de editarlo. Léela del fichero.

### Un test que vale por muchos

Un guard que detecta **nombres de clase CSS usados por dos componentes
distintos**. Tres bugs visuales salieron de eso: la segunda definición ganaba
y se llevaba por delante estilos de la primera, sin ningún error.

### Verificación visual

Playwright + Chromium, con el mismo bootstrap falso que los tests, capturando
las pantallas tocadas. Un test puede pasar con la pantalla rota. Mira las
capturas.

---

## 9. Que el asistente suba el código solo

Esto cambia mucho el ritmo de trabajo: se acaba el «te paso el fichero, pégalo
tú» y con él una clase entera de errores.

### Montaje (una vez)

1. Una carpeta del ordenador **es** el repo: un clon de `main`. No hay copias
   sueltas; lo que está ahí es lo que hay.
2. Esa carpeta tiene que estar conectada a la conversación (en Cowork, «añadir
   carpeta»).
3. Token de GitHub **fine-grained**, acotado a ese repo y a permiso de
   Contenido. Guardado **fuera del repo** (`~/Documents/<algo>-token.txt`) para
   que no pueda subirse por accidente. Configúralo en el remoto del clon.
4. Para ficheros grandes: `git config http.version HTTP/1.1` y un `postBuffer`
   grande. Sin eso, subir un `index.html` de 350 KB daba HTTP 408.

### El ciclo

El asistente edita en su propio entorno, corre los tests, copia los ficheros a
la carpeta del ordenador y hace commit y push desde ahí.

**Dos cosas que te vas a encontrar:**

- Git necesita borrar sus propios `.lock` y temporales, y el puente de ficheros
  no deja borrar hasta que das permiso. Dáselo a esa carpeta al principio de la
  sesión. Si no, cada commit deja un `.git/HEAD.lock` que hace fallar al
  siguiente.
- Apps Script sigue siendo manual (pegar + publicar). Se puede automatizar con
  `clasp`, a cambio de una autenticación de Google. Merece la pena si tocas el
  backend a menudo.

### Mensajes de commit

Que digan **qué se rompía**, no qué se tocó. «Arregla el aviso de versiones» no
sirve dentro de seis meses; «el aviso miraba si había desfase pero nunca hacia
dónde, y mandaba a republicar algo ya publicado» sí.

---

## 10. Cómo encargar el trabajo

Esto va dirigido al humano tanto como al asistente.

**Consultar antes de ejecutar.** En una app personal no hay QA ni staging:
deshacer sale caro. Mejor una pregunta de más que una entrega para tirar. Las
preguntas van ANTES de escribir código, no a mitad.

**Pide que te cuestionen.** El consejo más caro que recibí en este proyecto fue
el que me llevó la contraria. Un ejemplo real: pedí reescribir el modelo de
datos de alimentación basándome en el análisis de otra IA. El asistente ejecutó
el código real y demostró que tres de sus afirmaciones centrales eran falsas —
la estructura que proponía crear ya existía. Lo que hacía falta era calibrar
números y cambiar cómo se presentaban, no reescribir nada.

Un asistente que te da la razón te cuesta semanas de trabajo inútil.

**Verifica en vez de suponer.** «Esto debería funcionar» no es una verificación.
Correr el código, leer el fichero, mirar la captura, sí.

**Y no inventes problemas.** Yo mismo hice lo contrario: vi un «0 comidas
creadas» que no me gustó, deduje un fallo y mandé al usuario a correr
diagnósticos. No había fallo: era la respuesta correcta para ese día. Antes de
declarar un bug, comprueba que es un bug.

**Avisa de lo que se rompió por tu culpa, aunque nadie lo haya notado.** En una
sesión borré ~1.000 líneas con un reemplazo mal acotado. Los tests lo pillaron,
se restauró desde git, y se dijo. Lo contrario envenena todo lo demás que digas.

### Los comentarios del código

En este proyecto los comentarios explican **por qué**, y a menudo **qué pasó**:

```js
/* Sin autor: en la app, lo que no tiene dueño lo edita cualquiera. Es
   correcto — esta comida no la apuntó ninguno de los dos. */

/* `no-store` no es decorativo: sin él, este fetch «de red» puede resolverse
   contra la caché HTTP del navegador, que para GitHub Pages dura minutos. */
```

No es adorno. Es lo que impide que dentro de seis meses alguien «limpie» una
línea rara que estaba ahí por un motivo. Y es lo que permite a un chat nuevo
entender una decisión sin tener el historial de la conversación.

---

## 11. Decisiones de producto que envejecieron bien

Transferibles a cualquier app de datos personales:

**Las ventanas de tiempo que se mueven, no las naturales.** «Últimos 7 días»,
no «esta semana». Con semana natural, el lunes por la mañana cualquier
indicador se queda a cero y no vuelve a significar nada hasta el jueves. El
dato deja de contar por el calendario, no por la realidad.

**Bandas, no cuotas.** «Baja / Moderada / Alta» en vez de «3 de 3». Un contador
se lee como un presupuesto que se gasta, y convierte cada uso en un pecado
contabilizado. Y que la puntuación baje con pendiente en vez de agotarse: un
indicador clavado en cero deja de informar.

**Cada sugerencia con su porqué.** «Lácteos — hace 2 días que no» en vez de
«Lácteos». Un nombre suelto hay que creérselo; el porqué se entiende y se
discute.

**No propongas lo que no encaja.** Mi app recomendaba legumbres para merendar.
Un consejo que nadie va a seguir le quita credibilidad a los que sí valen.

**Pantalla vacía honesta.** «Aún no hay datos suficientes: con 2 de 3 días el
número sería inventado» es mejor que un cero o que un número inventado.

**Lo que más se usa, arriba.** El índice bonito estaba el primero y era lo que
menos se miraba; la decisión diaria era otra. Pregúntale al usuario qué mira de
verdad, y reordena.

---

## 12. Arranque de una app nueva: por este orden

1. **El modelo de datos en el Sheet.** Pestañas y columnas. Es lo más caro de
   cambiar después.
2. **El bootstrap**: una llamada que devuelve todo, y una pantalla que lo pinta.
3. **Auth** antes de que haya nada que proteger. Añadirla después toca todo.
4. **Una escritura entera**, de punta a punta, con guardado optimista. Es la
   plantilla de todas las demás.
5. **El primer test**, ahora. El que escribes al final no se escribe.
6. **El resto de secciones**, copiando el patrón de la 4.
7. **Las funciones de mantenimiento** (`diagnosticar()`, los `verX()`). Parecen
   un lujo hasta la primera vez que algo no cuadra en producción y no tienes
   forma de mirar.

### Sistema de diseño, desde el principio

Variables CSS en `:root` y nunca un color a pelo en el markup. En GINapp hay
tres capas: color por **persona**, color por **sección** y color por **estado**.
Que nunca choquen — si el rojo de «mamá» es el mismo que el de «error», cada
pantalla miente un poco.

Radios y tipografía, también variables. Un sistema con cuatro radios se ve
coherente; uno con catorce, no.

---

## 13. Qué pasarle a otro chat

Junto a este documento:

| Fichero | Para qué |
|---|---|
| `README.md` | Cómo se trabaja en ESTE repo y las decisiones concretas tomadas. |
| `index.html` | El frontend entero. Es también el ejemplo de todos los patrones. |
| `Code.gs` | El backend entero, con las funciones de mantenimiento. |
| `sw.js` | Pequeño, y con el arreglo de caché que cuesta encontrar. |
| Un `test_*.js` | Uno basta como plantilla. `test_red.js` si quieres el de red. |

Y dile esto, que es lo que más rendimiento da:

> Lee `PLAYBOOK.md` antes de proponer nada. Pregúntame antes de ejecutar.
> Cuestióname cuando creas que me equivoco: no quiero que me des la razón.
> Verifica ejecutando, no suponiendo. Y cuando arregles un bug, escribe el test
> que falla con el código viejo.
