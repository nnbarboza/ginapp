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
img/            iconos
```

## Despliegue

**Frontend** — subir los archivos al repo. El service worker es *network-first*
para el HTML, así que los cambios se ven al recargar, sin trucos de caché.

**Backend** — pegar `Code.gs` completo en el editor → Guardar → si cambió el
esquema, correr `setup()` → **Implementar › Gestionar implementaciones › ✏️ ›
Versión: Nueva**. Guardar no basta. La URL no cambia entre despliegues.

Subir siempre a la vez `APP_VERSION` (en `index.html`) y `CACHE` (en `sw.js`).

## Funciones de mantenimiento (editor de Apps Script)

| Función | Qué hace |
|---|---|
| `setup()` | Crea pestañas, añade columnas que falten y siembra los datos base. Idempotente. |
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
