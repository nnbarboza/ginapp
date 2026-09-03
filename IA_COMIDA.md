# GINapp · La clave de OpenAI y cómo se apunta una comida

---

# 1 · Poner la clave — los pasos exactos

## a) Sacar la clave

1. Entra en **platform.openai.com** y date de alta (o entra si ya tienes cuenta).
2. Arriba a la derecha, tu avatar → **View API keys** · o directamente
   `platform.openai.com/api-keys`.
3. Botón **+ Create new secret key**. Ponle un nombre: `GINapp`.
4. **Cópiala ahora.** Empieza por `sk-` y **solo se enseña una vez**. Si la
   pierdes, se borra y se hace otra, no pasa nada.
5. En **Settings → Billing** añade saldo. El mínimo son 5 $. No los vas a
   gastar (las cuentas están abajo), pero sin saldo la API no responde.

## b) Meterla en la app

**No va en el Sheet, ni en `index.html`, ni en el repo.** Va en las propiedades
del script, que es el único sitio privado que tiene Apps Script.

1. Abre el proyecto de **Apps Script** (el del `Code.gs`).
2. Barra de la izquierda: **⚙ Configuración del proyecto**
   (el engranaje, debajo del icono de reloj).
3. Baja hasta **Propiedades de la secuencia de comandos**
   (en inglés: *Script Properties*).
4. **Añadir propiedad de la secuencia de comandos**:

   | Propiedad | Valor |
   |-----------|-------|
   | `OPENAI_API_KEY` | `sk-...` ← pega la clave aquí |

5. **Guardar propiedades de la secuencia de comandos**.

Ya está. **No hace falta volver a desplegar**: las propiedades se leen en
caliente, así que funciona en la siguiente comida que apuntes.

Opcional, por si algún día quieres cambiar de modelo:

| Propiedad | Valor |
|-----------|-------|
| `OPENAI_MODEL` | `gpt-4o-mini` ← es el que usa por defecto |

## c) Comprobar que funciona

Abre la app → Comida → **Añadir comida** → escribe `Arroz a la cubana` →
**Deducir alimentos**. Deberían salir arroz, huevo y tomate.

Si dice *"No hay clave de OpenAI puesta"*, la propiedad no se guardó o el
nombre está mal escrito. Tiene que ser exactamente `OPENAI_API_KEY`.

## d) Lo que va a costar

| | |
|---|---|
| Un plato por texto | ~0,00004 $ |
| Un plato por **foto** | ~0,0002 $ (5× más, sigue siendo nada) |
| Platos distintos en un año | ~300, siendo generosos |
| **Primer año** | **menos de 0,05 $** |

Los 5 $ del mínimo te van a durar años. Lo digo con todas las letras porque el
motivo real para vigilarlo no es este gasto: es que **una clave de API con una
tarjeta detrás conviene mirarla de vez en cuando**. En OpenAI, *Settings →
Limits*, ponle un **límite mensual de 1 $** y te olvidas.

---

# 2 · Cómo se apunta una comida ahora

El formulario cambió porque tenías razón: escribir "Sushi" y luego no saber qué
poner en "qué ha comido" no tenía sentido.

## Los dos campos son cosas distintas

**Qué comió** → `Sushi`
Es el nombre que se ve luego en el historial. Corto, como lo dices en casa.

**De qué se compone** *(opcional)* → `salmón, arroz, aguacate, alga`
Esto **no se guarda**. Solo sirve para que la IA sepa de qué va. Si el plato es
evidente ("Lentejas con arroz") puedes dejarlo vacío.

## Dos botones

**Deducir alimentos** — manda el nombre y la descripción, y devuelve los
alimentos: *Salmón · Arroz · Aguacate*.

**Foto** — abre la cámara. La foto se reduce en el móvil a 768px, se manda, se
leen los alimentos y **se tira**. No se guarda en Drive, ni en el Sheet, ni en
ningún sitio. Si algún día quieres el histórico visual, se puede añadir, pero
hoy no se guarda nada.

## Los alimentos nuevos se confirman, no se cuelan

Cada alimento vuelve marcado:

- Los que **ya están** en la biblioteca se enlazan solos.
- Los que **no**, salen con la etiqueta **NUEVO** y se crean **al guardar**.

Si un nombre no te gusta ("salmón crudo" cuando tú lo llamas "salmón"),
quítalo con la ✕ y búscalo en el buscador. Así la biblioteca no se llena de
variantes de lo mismo.

## Lo aceptado no vuelve a preguntar

Un alimento con estado **aceptado** entra directo como *se lo comió*, sin los
tres botones. Debajo pone *"Se lo comió · cambiar"* por si ese día fue
distinto.

Lo que está **en aprendizaje** sí pregunta, porque es justo esa respuesta la
que hace que un alimento pase de *probado* a *aceptado*.

## Bebidas

Fila propia de chips: **Agua · Leche · Zumo natural · Batido · Infusión ·
Refresco · Zumo envasado · Caldo**. Un toque y entra.

Son alimentos de verdad —cuentan para la variedad y viven en la biblioteca—
pero no salen mezcladas en el buscador de comida, porque nadie busca "agua"
entre las verduras. Si escribes "agua" en el buscador, sí aparece.

Para añadir más bebidas: nueva fila en la pestaña `Alimentos` con
`grupo = bebidas`.

---

# 3 · Sí, puedes tocar el Sheet directamente

Es la base de datos entera. **Lo que cambies ahí manda.** Solo hay tres reglas.

## Las reglas

**1 · Nunca borres ni renombres una cabecera.** La app lee por nombre de
columna, no por posición — así que puedes **mover columnas de sitio** o
**añadir las tuyas** sin romper nada. Lo que no puede es no encontrarlas.

**2 · Para borrar, borra la fila entera** (clic derecho en el número → Eliminar
fila). No dejes filas vacías a medias.

**3 · Un `id` que ya se está usando, no lo cambies.** Si renombras el `id` de un
alimento, las comidas que lo usaban quedan colgando.

Después de tocar el Sheet, dale a **Actualizar** en la app (abajo del todo).

## Qué hay en cada pestaña

| Pestaña | Para qué la vas a tocar |
|---------|-------------------------|
| `Alimentos` | Corregir el grupo de algo, cambiar un emoji, pasar a `aceptado`, o `activo = FALSE` para que deje de salir sin perder el histórico |
| `Objetivos_Semana` | Cambiar los objetivos, quitar grupos que no os sirven, añadir los vuestros |
| `Platos` | Corregir de qué se compone un plato. Pon `fuente = manual` y la IA no lo vuelve a tocar |
| `Usuarios` | Nombres, colores, el PIN, la foto |
| `Custodia_Dias` | Los días del convenio. Mejor cámbialos desde el calendario de la app |
| `Config` | Nombre de la hija, moneda, cuota mensual |

**El truco para "borrar" sin perder nada**: casi todas las pestañas tienen
columna `activo`. Ponla en `FALSE` y esa fila desaparece de la app pero el
histórico sigue cuadrando. Borrar la fila de verdad rompe lo que ya la usaba.

---

# 4 · Si la IA falla

La app **nunca** se rompe por esto:

| Qué pasa | Qué dice |
|----------|----------|
| No hay clave puesta | "No hay clave de OpenAI puesta: busca los alimentos a mano." |
| Sin saldo, clave mala, OpenAI caído | "La IA no ha respondido. Busca los alimentos a mano." |
| No reconoce el plato | "No he sabido de qué se compone. Búscalo abajo." |

En los tres casos el buscador y las bebidas siguen ahí. Marcas lo que sea,
guardas, y **ese plato queda resuelto para siempre**: la próxima vez sale solo,
sin llamar a nadie.
