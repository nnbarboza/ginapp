# GINapp

App móvil para coordinar la custodia compartida de Gina entre sus dos casas.
Calendario · Gastos · Alimentación · Salud.

- **Frontend**: un solo `index.html` con CSS y JS inline. Sin build, sin npm, sin dependencias.
- **Backend**: Google Apps Script (`Code.gs`) sobre un Google Sheet.
- **Hosting**: GitHub Pages. PWA instalable. Coste: 0 €.

## Estructura

```
index.html      la app entera
Code.gs         backend (se pega en el editor de Apps Script)
manifest.json   PWA
sw.js           service worker (network-first para el HTML)
img/            iconos y fotos (ver IMAGENES.md para los nombres)
test_*.js       la suite; se corre con `node test_algo.js`, sin instalar nada
```

## Cómo se trabaja

La carpeta `~/Desktop/GINAPP` del Mac **es** el repo (un clon de `main`). No
hay copias sueltas: lo que está ahí es lo que hay.

**Para añadir una imagen** (un icono, una foto): déjala en `img/` con el
nombre que toque y ya está. Va en el siguiente commit sin hacer nada más.
Los nombres de cada icono están en `IMAGENES.md`.

**Nada de subir ficheros por la web de GitHub.** No es que rompa nada —
`pull.rebase` está puesto y se reordena solo— pero es donde se cuelan los
despistes: así fue como `index.html` y `sw.js` acabaron dentro de `img/`.

**Frontend** — commit y push a `main`. GitHub Pages despliega solo. El
service worker es *network-first* para el HTML, así que los cambios se ven al
recargar, sin trucos de caché.

**Backend** — pegar `Code.gs` completo en el editor → Guardar → **Implementar ›
Gestionar implementaciones › ✏️ › Versión: Nueva**. Guardar no basta. La URL
no cambia entre despliegues. Las pestañas y columnas nuevas se crean solas al
primer arranque (`_alDia()`), no hace falta correr `setup()` a mano.

Subir siempre a la vez `APP_VERSION` (en `index.html` y `Code.gs`) y `CACHE`
(en `sw.js`).

### Notas de este clon

- El token de GitHub vive en `~/Documents/ginapp-token.txt`, **fuera del
  repo** para que no pueda subirse por accidente. Es fine-grained, acotado a
  este repo y a permiso de Contenido. Caduca; cuando lo haga, el push falla
  con error de autenticación y hay que generar otro.
- Si TextEdit guarda ese fichero en RTF, el token no sirve: **Formato →
  Convertir en texto normal** antes de guardar.
- `http.version HTTP/1.1` y un `postBuffer` grande están puestos en este
  repo: sin ellos el push del `index.html` (350 KB) daba HTTP 408.

## Funciones de mantenimiento (editor de Apps Script)

| Función | Qué hace |
|---|---|
| `setup()` | Crea pestañas, añade columnas que falten y siembra los datos base. Idempotente. Normalmente no hace falta: `_alDia()` lo corre solo al cambiar de versión. |
| `diagnosticar()` | Estado de cada pestaña: columnas que faltan o sobran, nº de filas. Primer sitio donde mirar. |
| `verCustodia('2026-09')` | Imprime el mes día a día para comprobar el patrón y la fecha ancla. |
| `verificarIntegridad()` | Busca referencias rotas entre pestañas. Solo informa. |
| `limpiarActividad(true)` | Recorta el feed de actividad. Sin `true` solo informa. |

## Reglas del proyecto

1. Se lee y se escribe **siempre por el nombre real de la cabecera**, nunca por posición.
2. **Nada derivado se persiste**: balances, exposiciones, variedad y días de custodia
   se calculan al vuelo desde los registros.
3. Todo lo configurable vive en una pestaña del Sheet. **Una tabla vacía hace
   desaparecer la feature, no la rompe.**
4. Los inputs numéricos son `type="text" inputmode="decimal"` y se normaliza la coma en JS.
5. Toda función destructiva informa por defecto y solo actúa con un parámetro explícito.

## Patrón de custodia

Se define en la pestaña `Custodia_Patron`, una fila por periodo (curso, verano,
Navidad). Cada columna de día vale `papa`, `mama` o `alterno`.

Los días `alterno` se resuelven por paridad de semana respecto a `ancla_fecha`:
el bloque de fin de semana que contiene esa fecha pertenece a `ancla_usuario`,
el siguiente al otro, y así sucesivamente.

Los días sueltos que se salen del patrón van en `Custodia_Excepciones`, que
siempre manda sobre el patrón.
