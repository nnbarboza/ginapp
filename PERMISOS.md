# GINapp · Dar permiso de internet al proyecto

```
Exception: You do not have permission to call UrlFetchApp.fetch.
Required permissions: .../auth/script.external_request
```

Esto **no es culpa de OpenAI ni de tu clave**. Es Google.

## Por qué pasa

Un proyecto de Apps Script pide permisos **una sola vez**, la primera vez que
lo autorizas, y se queda con los que necesitaba **ese día**. Cuando tú
autorizaste GINapp, el código solo tocaba el Sheet: pidió permiso para hojas de
cálculo y ya está.

Ahora el código llama a OpenAI, que es salir a internet. Ese permiso no estaba
en la lista, y Google no lo añade solo: hay que **declararlo y volver a
autorizar**.

Que "funcionara una vez" fue seguramente al ejecutarlo desde el editor, donde a
veces Google sí repregunta. Desde la app desplegada no, porque el despliegue
arrastra la autorización vieja.

---

## Cómo arreglarlo · 5 minutos

### 1 · Ver el manifiesto

En el editor de Apps Script:

**⚙ Configuración del proyecto** → marca la casilla
**«Mostrar el archivo de manifiesto "appsscript.json" en el editor»**

Vuelve a **Editor** (`<>`): ahora aparece un fichero `appsscript.json` junto a
`Code.gs`.

### 2 · Pegar el manifiesto

Ábrelo y **sustituye todo su contenido** por el `appsscript.json` que te he
dejado en la carpeta. Guarda (Ctrl/Cmd+S).

Lo que declara:

| Permiso | Para qué |
|---------|----------|
| `spreadsheets` | leer y escribir el Sheet |
| `script.external_request` | **hablar con OpenAI** ← el que falta |
| `drive` | los documentos de Salud |
| `script.scriptapp` | los disparadores |

De paso deja activado el **servicio avanzado de Sheets**, que es lo que hace
que el arranque traiga las 26 pestañas en una sola llamada. Si ya lo tenías
puesto, no cambia nada.

### 3 · Volver a autorizar

En el editor, selecciona la función **`probarIA`** en el desplegable de arriba y
dale a **Ejecutar**.

Ahora sí saldrá la ventana de permisos:

1. **Revisar permisos** → elige tu cuenta de Google.
2. Saldrá **«Google no ha verificado esta aplicación»**. Es normal: es tu
   propio script, no está publicado en ninguna tienda.
   → **Configuración avanzada** → **Ir a GINapp (no seguro)**.
3. Verás la lista de permisos, ahora **con «Conectarse a un servicio externo»**.
   → **Permitir**.

### 4 · Comprobar

`probarIA` escribe el resultado en el registro (**Ver → Registro de ejecución**,
o Ctrl/Cmd+Enter). Tiene que salir:

```
1 · Clave: puesta (sk-proj…abcd)
2 · Salida a internet: OK
3 · OpenAI: OK → ["cereales","huevos","verduras"]
✅ Todo funciona.
```

Si algo falla, la línea te dice **cuál de los tres pasos** y por qué. Las tres
cosas se prueban por separado a propósito: así no confundes un problema de
permisos con uno de saldo.

### 5 · Volver a desplegar

**Importante y fácil de olvidar.** La app usa el `/exec`, y ese sigue con la
autorización vieja hasta que publiques una versión nueva:

**Implementar → Gestionar implementaciones → ✏️ (lápiz) → Versión: `Nueva` →
Implementar**

Hasta que hagas esto, `probarIA` funcionará desde el editor pero la app seguirá
dando el mismo error.

---

## Si sigue fallando

Ejecuta `probarIA` y mira qué línea falla:

| Sale | Qué pasa | Qué hacer |
|------|----------|-----------|
| `1 · Clave: NO PUESTA` | Falta `OPENAI_API_KEY` | Configuración del proyecto → Propiedades del script |
| `2 · Salida a internet: BLOQUEADA` | El permiso sigue sin estar | Repite el paso 3. Si no sale la ventana: **Implementar → Probar implementaciones** y autoriza desde ahí |
| `3 · OpenAI: ERROR http_401` | Clave inválida o revocada | Haz una nueva en platform.openai.com |
| `3 · OpenAI: ERROR http_429` | Sin saldo o límite superado | Billing → añadir crédito · Limits → subir el tope |
| `3 · OpenAI: ERROR http_400` | El modelo no existe en tu cuenta | Quita la propiedad `OPENAI_MODEL` para volver a `gpt-4o-mini` |

**Mientras tanto la app funciona igual.** Los checks de categorías están a la
vista y se marcan a mano: la IA solo te ahorra tocarlos.
