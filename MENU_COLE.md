# El menú del cole

Cada mes el cole publica un PDF con el menú del comedor. La app lo usa para
rellenar sola la comida de los días de cole: pone el nombre del plato y marca
los alimentos, todos como comidos. Se quita lo que no se haya comido.

## La pestaña `Menu_Cole`

Cuatro columnas, una fila por día lectivo:

| columna | qué va | ejemplo |
|---|---|---|
| `fecha` | `AAAA-MM-DD` | `2026-09-08` |
| `plato` | nombre corto, lo que se verá en la app | `Espaguetis y croquetas` |
| `alimentos` | `Nombre:grupo` separados por comas | `Espaguetis:cereales, Tomate:verduras` |
| `nota` | solo para los festivos | `Diada — festivo, no hay cole` |

Un día festivo va con `plato` y `alimentos` vacíos y la nota puesta. La app lo
trata como "este día no hay menú", que es lo correcto.

**Los grupos válidos son estos y solo estos.** Uno inventado no rompe nada,
pero el alimento cae en `otros` y deja de contar para la variedad:

```
verduras · fruta · legumbres · pescado · proteina_blanca · carnes_procesadas
huevos · lacteos · frutos_secos · cereales · ultraprocesado · capricho
bebidas_azucaradas · permitido · bebidas · otros
```

`verMenu('2026-09')` en el editor de Apps Script avisa de los que estén mal.

## Prompt para ChatGPT

Se le adjunta el PDF del mes y se le pega esto. Devuelve el TSV listo para
pegar en el Sheet.

---

Te paso el PDF del menú del comedor del colegio. Conviértelo en una tabla TSV
(separada por tabuladores) con exactamente estas cuatro columnas, en este
orden, con la fila de cabecera incluida:

```
fecha	plato	alimentos	nota
```

Reglas:

1. **`fecha`**: formato `AAAA-MM-DD`. Una fila por día lectivo, en orden.
2. **Traduce todo al castellano.** El menú viene en catalán.
3. **`plato`**: nombre corto y reconocible, máximo unas cinco palabras. Es una
   etiqueta, no la descripción del PDF. `Espaguetis integrals amb salsa de
   tomàquet / Croquetes de pollastre amb remolatxa` → `Espaguetis y croquetas`.
4. **`alimentos`**: los ingredientes reales del día, en formato
   `Nombre:grupo`, separados por comas. Incluye los del primer plato, los del
   segundo, las guarniciones **y el postre**. Nombres en singular y en
   mayúscula inicial: `Tomate`, no `tomates`. Los condimentos no (aceite, sal,
   especias): no son una ración de nada.

   **El postre cuenta.** En octubre se dejó fuera, y como casi todos los días
   ponen «Fruita de temporada», la app se quedó sin cinco raciones de fruta a
   la semana y recomendaba fruta a una niña que la comía todos los días. Si el
   PDF no dice cuál, va `Fruta de temporada:fruta`; si dice `Iogurt`, va
   `Yogur:lacteos`.
5. **`grupo`** tiene que ser uno de estos, exactamente como están escritos:
   `verduras`, `fruta`, `legumbres`, `pescado`, `proteina_blanca`,
   `carnes_procesadas`, `huevos`, `lacteos`, `frutos_secos`, `cereales`,
   `ultraprocesado`, `capricho`, `bebidas_azucaradas`, `permitido`, `bebidas`,
   `otros`.
   - `proteina_blanca` es toda la carne y el huevo de carne: pollo, pavo,
     conejo, ternera y cerdo. Ya no hay `carnes_rojas`.
   - `carnes_procesadas` es butifarra, salchicha, embutido y hamburguesa
     industrial. Es un grupo de los de «sin pasarse», así que importa
     distinguirlo de la carne a secas.
   - `cereales` incluye pasta, arroz, pan, patata y boniato.
   - `permitido` es lo que no es sano ni insano: aceitunas, pesto, mayonesa.
   - Los guisantes van en `legumbres`.
6. **Días festivos o sin comedor**: fila con la fecha, `plato` y `alimentos`
   vacíos, y el motivo en `nota` (`Diada — festivo, no hay cole`).
7. No añadas ninguna columna más, ni comentarios, ni explicaciones. Solo el TSV.

Ejemplo de dos filas bien hechas:

```
fecha	plato	alimentos	nota
2026-09-08	Espaguetis y croquetas	Espaguetis:cereales, Tomate:verduras, Croquetas de pollo:proteina_blanca, Remolacha:verduras, Fruta de temporada:fruta	
2026-09-11			Diada — festivo, no hay cole
```

---

## Al pegarlo

Se selecciona la pestaña `Menu_Cole`, se borran las filas del mes anterior
(dejando la cabecera) y se pega desde `A2`. Si Google Sheets convierte las
fechas a su propio formato no pasa nada: la app entiende tanto la fecha de
verdad como el texto.

Si se corrige un menú que YA estaba cargado, cambiar la pestaña no basta:
las comidas creadas siguen como estaban. Hay que rehacerlas:

```js
rehacerColeDesde('2026-11-01', '2026-11-30')        // informa
rehacerColeDesde('2026-11-01', '2026-11-30', true)  // lo hace
```

Solo borra las que creó el generador, y ni eso en los días donde alguien
apuntó su propia comida del cole. Lo borrado queda en `Papelera`.

Si el texto llega con los acentos rotos (`tom√†quet` en vez de `tomàquet`), es
que se ha pegado desde un fichero leído con la codificación equivocada. Pegar
desde la ventana de ChatGPT directamente, o desde un `.xlsx`, no da ese
problema.
