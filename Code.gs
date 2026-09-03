/**
 * GINapp — Backend (Google Apps Script)
 * v0.1.0
 *
 * Coordinación de custodia compartida: Calendario · Gastos · Alimentación · Salud
 *
 * DESPLIEGUE
 *   Implementar > Nueva implementación > Aplicación web
 *     Ejecutar como: Yo
 *     Quién tiene acceso: Cualquier usuario
 *   Tras CADA cambio: Implementar > Gestionar implementaciones > ✏️ > Versión: Nueva
 *   (Guardar NO basta. La URL no cambia entre despliegues.)
 *
 * REGLAS DE ORO (heredadas de Gosari, no romperlas)
 *   1. Se lee y se escribe SIEMPRE por el nombre real de la cabecera, nunca por posición.
 *   2. Nada derivado se persiste: balances, exposiciones, variedad y días de custodia
 *      se calculan al vuelo desde los registros.
 *   3. Toda función destructiva informa por defecto y solo actúa con un parámetro explícito.
 */

const SS = SpreadsheetApp.getActiveSpreadsheet();
const APP_VERSION = '0.9.16';

/* ============================================================
   ESQUEMA DE TABLAS
   ============================================================ */
const HEADERS = {

  /* ---------- BASE ---------- */

  /* Perfiles. `pin` de 4 dígitos, vacío = sin PIN. `color` se usa en toda la
     interfaz para saber de quién es cada cosa. El perfil de Gina existe desde
     el día 1 con activo=FALSE: así el selector y los permisos ya lo contemplan
     y la fase infantil no obliga a rehacer nada (§48). */
  'Usuarios': ['username', 'nombre', 'rol', 'color', 'emoji', 'foto', 'pin', 'orden', 'activo'],

  /* Ajustes sueltos de la app. Añadir una fila cambia el comportamiento sin tocar código.
     Claves reconocidas: nombre_hija, emoji_hija, moneda, dia_liquidacion, openai_activo */
  'Config': ['clave', 'valor', 'nota'],

  /* Feed de novedades. Lo escribe el backend en cada mutación. */
  'Actividad': ['id', 'timestamp', 'username', 'seccion', 'accion', 'detalle', 'ref_id'],

  /* Última vez que cada usuario miró cada sección. Sirve para marcar lo nuevo. */
  'Visitas': ['username', 'seccion', 'ts'],

  /* ---------- CALENDARIO ---------- */

  /* El patrón de custodia. Cada columna de día vale: papa | mama | alterno.
     `alterno` se resuelve por paridad de semana respecto a `ancla_fecha`:
     el bloque de fin de semana que contiene `ancla_fecha` es de `ancla_usuario`.
     Varias filas = varios periodos (curso, verano, Navidad). Gana la fila
     vigente con `desde` más reciente. `desde`/`hasta` vacíos = siempre. */
  'Custodia_Patron': ['id', 'nombre', 'desde', 'hasta',
                      'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom',
                      'hora_cambio', 'hora_cambio_finde',
                      'ancla_fecha', 'ancla_usuario', 'prioridad', 'nota', 'activo'],

  /**
   * LA FUENTE DE VERDAD de la custodia: una fila por día, con nombre y apellidos.
   *
   * El convenio NO es una regla generable: la alternancia de fines de semana se
   * REANCLA después de cada periodo vacacional ("iniciándose así nuevamente el
   * régimen ordinario"), julio y agosto van por quincenas no alternas con cambio
   * a las 20:00, Navidad se parte el 30 de diciembre a las 16:30 y Semana Santa
   * el Miércoles Santo a las 16:00, con reparto según año par o impar.
   * Programar eso es fabricar un error de días; y un día de custodia equivocado
   * es el peor fallo posible de esta app.
   *
   * Por eso los días se importan del calendario del convenio con
   * importarCustodia() y viven aquí como dato.
   *
   * `origen`: convenio (importado) · cambio (acordado entre vosotros) · patron.
   * Para las fechas sin fila, la app cae al patrón y las marca como ESTIMADAS.
   */
  'Custodia_Dias': ['fecha', 'username', 'origen', 'motivo', 'creado_por', 'timestamp'],

  /* Un evento del calendario. `responsable` = quién se encarga (papa|mama|ambos).
     `accion` es la nota accionable que alimenta el bloque Recordatorio del inicio
     ("llevar la tarjeta sanitaria"): sin `accion` no hay recordatorio, y así la
     pieza no se convierte en ruido (§14).
     RECURRENCIA (§12): `repite` = no|semanal|mensual · `repite_dias` = CSV de días
     (lun,mar,…) para el semanal · `repite_hasta` = última fecha, vacío = indefinido.
     Las repeticiones NO se guardan como filas: se generan al pintar. */
  'Eventos': ['id', 'fecha', 'fecha_fin', 'hora', 'hora_fin', 'titulo', 'tipo',
              'lugar', 'responsable', 'todo_el_dia', 'notas', 'accion',
              'repite', 'repite_dias', 'repite_hasta', 'creado_por', 'timestamp'],

  /* Una ocurrencia concreta de un evento recurrente que se cancela o se mueve.
     `accion` = cancelado | movido. Sin esto, "esta semana no hay natación"
     obligaría a romper la serie entera. */
  'Eventos_Excepciones': ['id', 'evento_id', 'fecha', 'accion', 'nueva_fecha',
                          'nueva_hora', 'motivo', 'creado_por', 'timestamp'],

  /* Tareas. El MD las descarta de la v1 (§42). La pestaña se crea igualmente:
     vacía, la sección no existe; el día que haga falta, no hay que migrar nada. */
  'Tareas': ['id', 'titulo', 'responsable', 'fecha_limite', 'hecha', 'fecha_hecha',
             'hecha_por', 'notas', 'creado_por', 'timestamp'],

  /* Tipos de evento. Editable a mano: añadir una fila y aparece en la app. */
  /* `icono` es el nombre de un fichero de img/ (o una URL entera). Si está
     vacío se usa el emoji. Poner una imagen nunca es obligatorio y que falte
     el fichero tampoco rompe nada: se cae al emoji. */
  /* `festivo` = TRUE marca el número del día en el calendario, para que un
     día sin cole se vea de un vistazo sin leer nada. Lo decide el Sheet:
     hoy son las vacaciones y los días sin clases, pero mañana pueden ser
     otros. Vacío = no marca. */
  'Tipos_Evento': ['id', 'nombre', 'emoji', 'color', 'orden', 'activo', 'icono',
                   'festivo'],

  /* Comentarios pegados a cualquier elemento (§41). `entidad` = evento | cita |
     gasto | alimento | episodio. Sustituyen al chat que la app no va a tener. */
  /* Notas sueltas colgadas de cualquier cosa. `entidad` dice de qué
     ("evento", "cita"…) y `ref_id` de cuál. Las puede escribir CUALQUIERA
     de los dos, aunque no haya creado el evento: una nota no cambia el
     evento, solo añade contexto. */
  'Comentarios': ['id', 'entidad', 'ref_id', 'texto', 'autor', 'timestamp'],

  /* Un recordatorio marcado como hecho. Se guarda por ocurrencia
     (evento + fecha), no por evento: "hacer la mochila" del viaje de
     agosto no es el mismo recado que el del viaje de diciembre.
     La fila existe = está hecho. Se desmarca borrándola. */
  'Recordatorios': ['id', 'evento_id', 'fecha', 'hecho_por', 'timestamp'],

  /* ---------- GASTOS ---------- */

  /**
   * Un gasto. Dos columnas mandan sobre todo lo demás:
   *
   *   `origen`     de dónde salió el dinero: comun | papa | mama.
   *                Por defecto `comun`, que es como pagáis normalmente.
   *   `compartido` TRUE = es de las dos casas · FALSE = un regalo o capricho
   *                de uno que no se reparte ni se reembolsa.
   *
   * Un gasto con origen `papa` o `mama` y compartido TRUE queda PENDIENTE DE
   * REEMBOLSO desde la cuenta común; cuando se devuelve, `reembolso_id` apunta
   * a la fila de Cuenta_Comun que lo pagó.
   * Sin porcentajes libres (§28): lo compartido va siempre a medias.
   */
  'Gastos': ['id', 'fecha', 'categoria', 'descripcion', 'importe', 'pagado_por',
             'origen', 'compartido', 'comprobante', 'reembolso_id', 'nota',
             'creado_por', 'timestamp'],

  /**
   * Movimientos de la cuenta común. ÚNICA fuente del saldo.
   *   `tipo`: aporte (entra) · reembolso (sale, devuelve un gasto adelantado)
   *           retirada (sale) · ajuste (corrige un descuadre con el banco)
   * Los gastos con origen `comun` NO se copian aquí: salen de Gastos.
   * Dos tablas para el mismo dato siempre acaban descuadrando.
   */
  'Cuenta_Comun': ['id', 'fecha', 'tipo', 'username', 'importe', 'gasto_id',
                   'nota', 'creado_por', 'timestamp'],

  'Categorias_Gasto': ['id', 'nombre', 'emoji', 'color', 'orden', 'activo', 'icono'],

  /* Un pago que salda cuentas. Los gastos incluidos apuntan a su id. */
  'Liquidaciones': ['id', 'fecha', 'importe', 'de_usuario', 'a_usuario', 'nota',
                    'creado_por', 'timestamp'],

  /* ---------- ALIMENTACIÓN ---------- */

  /* La biblioteca. `estado` es un juicio del padre: aceptado | aprendizaje | rechazado.
     Las exposiciones (visto/probado/aceptado) NO se guardan: se cuentan desde Comidas. */
  /* `seccion` no es nutrición, es dónde aparece el atajo al registrar una
     comida: '' (en el buscador y nada más), 'bebida' o 'postre'. Un yogur
     de postre sigue siendo lácteo — mezclar las dos cosas en `grupo`
     rompería los objetivos de la semana. Vacía = no hay atajos, que es
     una sección menos, no una app rota. */
  'Alimentos': ['id', 'nombre', 'grupo', 'emoji', 'estado', 'notas', 'orden',
                'creado_por', 'activo', 'seccion'],

  /* Una comida = N filas con el mismo `grupo_id`, una por alimento.
     `estado_toma`: comio | probo | rechazo. */
  /* `lugar` = DÓNDE comió (casa · cole · fuera · otros).
     `con`   = a cargo de QUIÉN estaba. Son dos preguntas distintas:
     se puede comer fuera con papá. Antes iban en un solo campo. */
  'Comidas': ['id', 'grupo_id', 'fecha', 'hora', 'tipo_comida', 'lugar', 'con',
              'alimento_id', 'nombre', 'grupo', 'estado_toma', 'cantidad', 'nota',
              'creado_por', 'timestamp'],

  /* Objetivos SEMANALES por grupo. `tipo`: min (a alcanzar) | max (a no superar).
     `peso` = cuánto pesa ese grupo en el índice semanal. Fila fuera = grupo sin objetivo. */
  'Objetivos_Semana': ['grupo', 'nombre', 'emoji', 'objetivo', 'tipo', 'peso',
                       'orden', 'activo', 'icono'],

  /* Las cinco comidas del día. Estaban clavadas en el código; aquí se les
     puede cambiar el nombre, el emoji o ponerles un icono propio. */
  'Tipos_Comida': ['id', 'nombre', 'emoji', 'icono', 'orden', 'activo'],

  /* Imágenes sueltas que no cuelgan de ninguna fila: los dos logos y los
     iconos del resumen semanal de alimentación. `nota` explica cuál es
     cuál — esta pestaña se rellena a mano y conviene que se entienda. */
  'Iconos': ['clave', 'fichero', 'nota'],

  /* Platos ya interpretados. Es a la vez CACHÉ y CORRECCIÓN:
     lo que la IA resolvió una vez no se vuelve a preguntar, y si tú
     corriges los grupos, la corrección manda para siempre (`fuente`
     pasa a 'manual' y ya no se pisa). Sin esta pestaña la app sigue
     funcionando: solo pregunta a la IA cada vez. */
  'Platos': ['clave', 'nombre', 'grupos', 'emoji', 'fuente', 'usos',
             'creado_por', 'timestamp'],

  /* ---------- SALUD ---------- */

  'Salud_Citas': ['id', 'fecha', 'hora', 'tipo', 'profesional', 'centro', 'motivo',
                  'acompana', 'resultado', 'notas', 'creado_por', 'timestamp'],

  /* Pauta en curso. `activo` FALSE = tratamiento terminado, se conserva el histórico. */
  'Salud_Medicacion': ['id', 'nombre', 'dosis', 'cada_horas', 'inicio', 'fin', 'motivo',
                       'notas', 'activo', 'creado_por', 'timestamp'],

  /* Cada toma. Es lo que evita dar dos veces la misma dosis entre dos casas. */
  'Salud_Dosis': ['id', 'medicacion_id', 'fecha', 'hora', 'dado_por', 'nota', 'timestamp'],

  /* Episodios puntuales: fiebre, golpes, síntomas (§34). `temperatura` en ºC.
     `evolucion` es texto libre que se va ampliando durante el episodio. */
  'Salud_Episodios': ['id', 'fecha', 'hora', 'tipo', 'descripcion', 'temperatura',
                      'medicacion_id', 'evolucion', 'notas', 'creado_por', 'timestamp'],

  /* Vacunas puestas. `proxima` = fecha de la siguiente dosis, si la hay. */
  'Salud_Vacunas': ['id', 'nombre', 'fecha', 'centro', 'lote', 'proxima', 'notas',
                    'creado_por', 'timestamp'],

  'Crecimiento': ['id', 'fecha', 'peso_kg', 'talla_cm', 'nota', 'creado_por', 'timestamp'],

  /* ---------- DOCUMENTOS ---------- */

  /* Informes, recetas y tickets. El archivo vive en una carpeta de Drive; aquí
     solo el enlace. `entidad`/`ref_id` lo cuelgan de una cita, un gasto o un
     episodio (§36). Sin entidad, es un documento suelto del historial. */
  'Documentos': ['id', 'fecha', 'titulo', 'tipo', 'url', 'file_id', 'mime',
                 'entidad', 'ref_id', 'creado_por', 'timestamp'],

  /* ---------- LOS DATOS DE GINA ----------
   *
   * Lo que siempre hace falta tener a mano: DNI, pasaporte, tarjeta
   * sanitaria, credenciales del cole. Una ficha por dato.
   *
   * `tipo` decide qué se pide y cómo se pinta:
   *   documento  → número + dos fotos (anverso y reverso)
   *   numero     → solo un número o código
   *   credencial → usuario + contraseña
   *
   * `secreto` NUNCA guarda la contraseña en claro: guarda el resultado de
   * _cifra(), que necesita una clave que vive solo en las Script Properties
   * de este proyecto. Quien abra el Sheet ve un churro en base64 y nada más.
   * Esto NO convierte el Sheet en un gestor de contraseñas: protege de una
   * mirada por encima del hombro y de que la hoja se comparta sin querer,
   * no de alguien que tenga acceso al proyecto de Apps Script.
   *
   * El backend nunca devuelve `secreto` en el bootstrap: hay que pedirlo
   * uno a uno con verSecreto, y cada vez queda apuntado en Actividad. */
  /* `en_poder_de` es el papel físico: quién tiene el DNI ahora mismo. No
     es propiedad ni permiso — los dos ven y editan todo — solo evita la
     llamada de "¿tú tienes su tarjeta sanitaria?". Vacío = no se sabe. */
  'Gina_Fichas': ['id', 'tipo', 'titulo', 'numero', 'usuario', 'secreto',
                  'foto_a', 'foto_b', 'notas', 'en_poder_de', 'orden', 'activo',
                  'actualizado_por', 'timestamp'],

  /* ---------- MENSAJES ---------- */

  /**
   * Tablón entre los dos progenitores. NO es un chat: es un registro.
   *   - Un mensaje enviado no se edita ni se borra. No hay handler que lo haga.
   *     Si algo hay que corregir, se manda otro mensaje diciéndolo.
   *   - `leido_por` y `leido_ts` guardan el acuse: quién lo leyó y cuándo.
   * Eso es exactamente lo que WhatsApp no da y por lo que existe esta pestaña.
   */
  'Mensajes': ['id', 'fecha', 'autor', 'texto', 'leido_por', 'leido_ts', 'timestamp'],

  /* ---------- TRAZABILIDAD ---------- */

  /* Todo lo que se borra pasa por aquí con la fila entera serializada (§39).
     Resuelve la contradicción entre "ambos tienen los mismos permisos" (§2, §40)
     y "solo un administrador puede borrar": borran los dos, pero nada se pierde
     y siempre consta quién lo hizo. Recuperar = copiar el JSON de vuelta. */
  'Papelera': ['id', 'tabla', 'fila_id', 'fecha', 'borrado_por', 'datos']
};

/* Grupos alimentarios válidos. `nuevo_alimento` NO está aquí a propósito:
   que un alimento sea nuevo es un dato derivado (primera aparición en Comidas). */
const GRUPOS = ['verduras', 'fruta', 'legumbres', 'pescado', 'proteina_blanca',
                'carnes_rojas', 'huevos', 'lacteos', 'frutos_secos', 'cereales',
                'ultraprocesado', 'capricho', 'permitido', 'bebidas', 'otros'];

/* Las bebidas son alimentos como los demás — cuentan para la variedad y
   se buscan igual — pero salen en su propia sección del buscador porque
   uno no busca "agua" entre las verduras. */
const GRUPO_BEBIDAS = 'bebidas';

/* Nombres antiguos → nuevos, por si algún día se renombra un grupo. */
const GRUPOS_ALIAS = { 'proteina': 'proteina_blanca', 'libre': 'permitido',
                       'cereales_integrales': 'cereales', 'verdura': 'verduras',
                       'agua': 'bebidas', 'bebida': 'bebidas', 'lacteo': 'lacteos',
                       'carne_roja': 'carnes_rojas', 'huevo': 'huevos',
                       'tuberculos': 'cereales', 'pasta': 'cereales', 'arroz': 'cereales',
                       'carne_blanca': 'proteina_blanca', 'dulce': 'capricho' };

const ESTADOS_ALIMENTO = ['aceptado', 'aprendizaje', 'rechazado'];
const ESTADOS_TOMA = ['comio', 'probo', 'rechazo'];
const TIPOS_COMIDA = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro'];
const LUGARES = ['casa', 'cole', 'fuera', 'otros'];

/* Dónde puede dormir Gina. Papá y mamá son además perfiles de la app;
   los avis solo son una casa. */
const CASAS = ['papa', 'mama', 'avis'];

/* Días de la semana en el orden de las columnas de Custodia_Patron */
const DIAS_COL = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

/* ============================================================
   DATOS SEMILLA — solo se escriben si la pestaña está vacía
   ============================================================ */
const SEED = {
  'Usuarios': [
    ['papa', 'Papá', 'progenitor', '#2563EB', '👨', 'papa.jpg', '', 1, true],
    ['mama', 'Mamá', 'progenitor', '#F43F5E', '👩', 'mama.jpg', '', 2, true],
    ['gina', 'Gina',  'hija',       '#8B5CF6', '🌻', 'gina.jpg', '', 3, false],
    /* Tercera casa: los abuelos maternos. No es un perfil que entra en la
       app — no tiene PIN ni nada que apuntar — pero sí un sitio donde
       Gina duerme, y eso el calendario tiene que poder decirlo. */
    ['avis', 'Els avis', 'abuelos',  '#6E8B5C', '👵', '', '', 4, false]
  ],

  'Config': [
    ['nombre_hija', 'Georgina', 'Nombre completo en la cabecera'],
    ['nombre_corto', 'Gina', 'Cómo se la nombra en los textos'],
    ['fecha_nacimiento', '', 'AAAA-MM-DD. Sirve para la edad y para situar las medidas'],
    ['color_carga', '', 'Fondo de la pantalla de carga y del PIN. Ej: #F2E3FB. Vacío = el de siempre'],
    ['moneda', '€', ''],
    ['cuota_mensual', '250', 'Lo que aporta cada progenitor al mes a la cuenta común'],
    ['carpeta_drive_id', '', 'Se rellena solo al correr crearCarpetaDocumentos()'],
    ['openai_activo', 'FALSE', 'TRUE activa el botón de describir comida con IA'],
    ['dias_min_ich', '3', 'Días registrados mínimos para enseñar el ICH de la semana'],
    ['zona_horaria', 'Europe/Madrid', 'Informativo: la real es la del Sheet']
  ],

  /* Lunes y martes papá, miércoles y jueves mamá, findes alternos.
     ancla_fecha debe ser un día de un fin de semana que fue de ancla_usuario. */
  'Custodia_Patron': [
    ['curso', 'Curso', '', '', 'papa', 'papa', 'mama', 'mama',
     'alterno', 'alterno', 'alterno', '18:00', '18:00', '2026-08-21', 'papa', 1,
     'Lun-Mar papá · Mié-Jue mamá · findes alternos', true]
  ],

  /* "Casa" no está: con quién se queda ya lo dice la custodia de cada día,
     y tenerlo también como tipo de evento haría que el color dijera dos cosas. */
  /* Ninguno de estos colores puede confundirse con el azul de papá (#2878D4),
     el rojo de mamá (#E4575B) ni el lila de Gina (#8B62D9): en la rejilla del
     mes conviven la casa de la custodia y los puntos de los eventos. */
  'Tipos_Comida': [
    ['desayuno', 'Desayuno', '🥣',  '', 1, true],
    ['almuerzo', 'Almuerzo', '🍎',  '', 2, true],
    ['comida',   'Comida',   '🍽️', '', 3, true],
    ['merienda', 'Merienda', '🍪',  '', 4, true],
    ['cena',     'Cena',     '🌙',  '', 5, true],
    ['otro',     'Otra',     '🍴',  '', 6, true]
  ],

  /* La columna `fichero` se rellena a mano con el nombre de un PNG/SVG que
     esté en img/ (o una URL entera). Vacía = se sigue usando el dibujo o el
     emoji de siempre. */
  'Iconos': [
    ['logo_splash',     '', 'Logo grande de la pantalla de carga'],
    ['logo_login',      '', 'Logo de la pantalla del PIN'],
    ['ich_empezando',   '', 'Resumen semanal · aún no hay datos suficientes'],
    ['ich_genial',      '', 'Resumen semanal · dos o más alimentos nuevos'],
    ['ich_nuevo',       '', 'Resumen semanal · un alimento nuevo'],
    ['ich_progreso',    '', 'Resumen semanal · más variedad que la semana pasada'],
    ['ich_oportunidad', '', 'Resumen semanal · un grupo va flojo'],
    ['ich_bien',        '', 'Resumen semanal · buena semana']
  ],

  'Tipos_Evento': [
    /* Las dos últimas columnas son `icono` (vacío: se deduce del id) y
       `festivo`, que marca el número del día en el calendario. */
    ['vacaciones',     'Vacaciones',     '🏖️', '#F59E0B', 1,  true, '', true],
    ['tareas',         'Tareas',         '📋', '#64748B', 2,  true],
    ['excursiones',    'Excursiones',    '🥾', '#0E9384', 3,  true],
    ['dentista',       'Dentista',       '🦷', '#0891B2', 4,  true],
    ['medico',         'Médico',         '🩺', '#10B981', 5,  true],
    ['sin_clases',     'Sin clases',     '🏫', '#84CC16', 6,  true, '', true],
    ['actividad_cole', 'Actividad cole', '🎨', '#6366F1', 7,  true],
    ['cumples',        'Cumples',        '🎂', '#EC4899', 8,  true],
    ['viajes',         'Viajes',         '✈️', '#F97316', 9,  true],
    ['otros',          'Otros',          '📌', '#94A3B8', 10, true]
  ],

  'Categorias_Gasto': [
    ['salud',        'Salud',            '🩺', '#0E9384', 1, true],
    ['educacion',    'Educación',        '🎓', '#2563EB', 2, true],
    ['actividades',  'Actividades',      '⚽', '#8B5CF6', 3, true],
    ['ropa',         'Ropa',             '👕', '#F43F5E', 4, true],
    ['alimentacion', 'Alimentación',     '🍎', '#12B76A', 5, true],
    ['transporte',   'Transporte',       '🚌', '#0BA5EC', 6, true],
    ['material',     'Material escolar', '✏️', '#F79009', 7, true],
    ['ocio',         'Ocio',             '🎡', '#EC4899', 8, true],
    ['otro',         'Otros',            '🧾', '#94A3B8', 9, true]
  ],

  /* Orientativos y editables. Los `max` no son castigos: son techos de referencia. */
  'Objetivos_Semana': [
    ['verduras',       'Verdura',        '🥦', 14, 'min', 20, 1, true],
    ['fruta',          'Fruta',          '🍓', 14, 'min', 18, 2, true],
    ['legumbres',      'Legumbres',      '🫘', 3,  'min', 10, 3, true],
    ['pescado',        'Pescado',        '🐟', 2,  'min', 10, 4, true],
    ['huevos',         'Huevos',         '🥚', 3,  'min', 6,  5, true],
    ['proteina_blanca','Pollo y pavo',   '🍗', 3,  'min', 6,  6, true],
    ['frutos_secos',   'Frutos secos',   '🥜', 4,  'min', 6,  7, true],
    ['lacteos',        'Lácteos',        '🥛', 10, 'min', 6,  8, true],
    ['cereales',       'Cereales y pan', '🍞', 10, 'min', 4,  9, true],
    ['carnes_rojas',   'Carne roja',     '🥩', 1,  'max', 4,  10, true],
    ['ultraprocesado', 'Ultraprocesados','🍟', 3,  'max', 6,  11, true],
    ['capricho',       'Caprichos',      '🍬', 4,  'max', 2,  12, true],
    ['permitido',      'Comida libre',   '🍕', 2,  'max', 2,  13, true]
  ],

  /* Biblioteca de arranque. Estado 'aprendizaje' por defecto: la app no
     presupone qué le gusta. Se corrige en dos toques desde la propia app. */
  'Alimentos': [
    ['al_tomate',     'Tomate',          'verduras',        '🍅', 'aprendizaje', '', 1,  'seed', true],
    ['al_lechuga',    'Lechuga',         'verduras',        '🥬', 'aprendizaje', '', 2,  'seed', true],
    ['al_pepino',     'Pepino',          'verduras',        '🥒', 'aprendizaje', '', 3,  'seed', true],
    ['al_zanahoria',  'Zanahoria',       'verduras',        '🥕', 'aprendizaje', '', 4,  'seed', true],
    ['al_brocoli',    'Brócoli',         'verduras',        '🥦', 'aprendizaje', '', 5,  'seed', true],
    ['al_calabacin',  'Calabacín',       'verduras',        '🥒', 'aprendizaje', '', 6,  'seed', true],
    ['al_judias',     'Judía verde',     'verduras',        '🫛', 'aprendizaje', '', 7,  'seed', true],
    ['al_espinacas',  'Espinacas',       'verduras',        '🥬', 'aprendizaje', '', 8,  'seed', true],
    ['al_pimiento',   'Pimiento',        'verduras',        '🫑', 'aprendizaje', '', 9,  'seed', true],
    ['al_cebolla',    'Cebolla',         'verduras',        '🧅', 'aprendizaje', '', 10, 'seed', true],
    ['al_guisantes',  'Guisantes',       'verduras',        '🟢', 'aprendizaje', '', 11, 'seed', true],
    ['al_champinon',  'Champiñón',       'verduras',        '🍄', 'aprendizaje', '', 12, 'seed', true],
    ['al_calabaza',   'Calabaza',        'verduras',        '🎃', 'aprendizaje', '', 13, 'seed', true],
    ['al_berenjena',  'Berenjena',       'verduras',        '🍆', 'aprendizaje', '', 14, 'seed', true],
    ['al_aguacate',   'Aguacate',        'verduras',        '🥑', 'aprendizaje', '', 15, 'seed', true],

    ['al_platano',    'Plátano',         'fruta',           '🍌', 'aprendizaje', '', 20, 'seed', true],
    ['al_manzana',    'Manzana',         'fruta',           '🍎', 'aprendizaje', '', 21, 'seed', true],
    ['al_pera',       'Pera',            'fruta',           '🍐', 'aprendizaje', '', 22, 'seed', true],
    ['al_naranja',    'Naranja',         'fruta',           '🍊', 'aprendizaje', '', 23, 'seed', true],
    ['al_mandarina',  'Mandarina',       'fruta',           '🍊', 'aprendizaje', '', 24, 'seed', true],
    ['al_fresa',      'Fresa',           'fruta',           '🍓', 'aprendizaje', '', 25, 'seed', true],
    ['al_sandia',     'Sandía',          'fruta',           '🍉', 'aprendizaje', '', 26, 'seed', true],
    ['al_melon',      'Melón',           'fruta',           '🍈', 'aprendizaje', '', 27, 'seed', true],
    ['al_uva',        'Uva',             'fruta',           '🍇', 'aprendizaje', '', 28, 'seed', true],
    ['al_kiwi',       'Kiwi',            'fruta',           '🥝', 'aprendizaje', '', 29, 'seed', true],
    ['al_melocoton',  'Melocotón',       'fruta',           '🍑', 'aprendizaje', '', 30, 'seed', true],
    ['al_cereza',     'Cereza',          'fruta',           '🍒', 'aprendizaje', '', 31, 'seed', true],
    ['al_pina',       'Piña',            'fruta',           '🍍', 'aprendizaje', '', 32, 'seed', true],

    ['al_lentejas',   'Lentejas',        'legumbres',       '🫘', 'aprendizaje', '', 40, 'seed', true],
    ['al_garbanzos',  'Garbanzos',       'legumbres',       '🫘', 'aprendizaje', '', 41, 'seed', true],
    ['al_alubias',    'Alubias',         'legumbres',       '🫘', 'aprendizaje', '', 42, 'seed', true],
    ['al_hummus',     'Hummus',          'legumbres',       '🫙', 'aprendizaje', '', 43, 'seed', true],

    ['al_merluza',    'Merluza',         'pescado',         '🐟', 'aprendizaje', '', 50, 'seed', true],
    ['al_salmon',     'Salmón',          'pescado',         '🐟', 'aprendizaje', '', 51, 'seed', true],
    ['al_atun',       'Atún',            'pescado',         '🐟', 'aprendizaje', '', 52, 'seed', true],
    ['al_lenguado',   'Lenguado',        'pescado',         '🐟', 'aprendizaje', '', 53, 'seed', true],
    ['al_gambas',     'Gambas',          'pescado',         '🦐', 'aprendizaje', '', 54, 'seed', true],

    ['al_pollo',      'Pollo',           'proteina_blanca', '🍗', 'aprendizaje', '', 60, 'seed', true],
    ['al_pavo',       'Pavo',            'proteina_blanca', '🦃', 'aprendizaje', '', 61, 'seed', true],
    ['al_jamoncocido','Jamón cocido',    'proteina_blanca', '🍖', 'aprendizaje', '', 62, 'seed', true],

    ['al_ternera',    'Ternera',         'carnes_rojas',    '🥩', 'aprendizaje', '', 70, 'seed', true],
    ['al_cerdo',      'Cerdo',           'carnes_rojas',    '🥓', 'aprendizaje', '', 71, 'seed', true],
    ['al_jamonserr',  'Jamón serrano',   'carnes_rojas',    '🍖', 'aprendizaje', '', 72, 'seed', true],

    ['al_huevo',      'Huevo',           'huevos',          '🥚', 'aprendizaje', '', 80, 'seed', true],
    ['al_tortilla',   'Tortilla',        'huevos',          '🍳', 'aprendizaje', '', 81, 'seed', true],

    ['al_leche',      'Leche',           'lacteos',         '🥛', 'aprendizaje', '', 90, 'seed', true, 'bebida'],
    ['al_yogur',      'Yogur natural',   'lacteos',         '🥣', 'aprendizaje', '', 91, 'seed', true],
    ['al_queso',      'Queso',           'lacteos',         '🧀', 'aprendizaje', '', 92, 'seed', true],

    ['al_nueces',     'Nueces',          'frutos_secos',    '🥜', 'aprendizaje', '', 100, 'seed', true],
    ['al_almendras',  'Almendras',       'frutos_secos',    '🥜', 'aprendizaje', '', 101, 'seed', true],

    ['al_pan',        'Pan',             'cereales',        '🍞', 'aprendizaje', '', 110, 'seed', true],
    ['al_panint',     'Pan integral',    'cereales',        '🍞', 'aprendizaje', '', 111, 'seed', true],
    ['al_pasta',      'Pasta',           'cereales',        '🍝', 'aprendizaje', '', 112, 'seed', true],
    ['al_arroz',      'Arroz',           'cereales',        '🍚', 'aprendizaje', '', 113, 'seed', true],
    ['al_patata',     'Patata',          'cereales',        '🥔', 'aprendizaje', '', 114, 'seed', true],
    ['al_avena',      'Avena',           'cereales',        '🥣', 'aprendizaje', '', 115, 'seed', true],

    ['al_galletas',   'Galletas',        'ultraprocesado',  '🍪', 'aprendizaje', '', 120, 'seed', true],
    ['al_nuggets',    'Nuggets',         'ultraprocesado',  '🍗', 'aprendizaje', '', 121, 'seed', true],
    ['al_zumoenv',    'Zumo envasado',   'ultraprocesado',  '🧃', 'aprendizaje', '', 122, 'seed', true],

    ['al_chocolate',  'Chocolate',       'capricho',        '🍫', 'aprendizaje', '', 130, 'seed', true],
    ['al_helado',     'Helado',          'capricho',        '🍦', 'aprendizaje', '', 131, 'seed', true],
    ['al_chuches',    'Chuches',         'capricho',        '🍬', 'aprendizaje', '', 132, 'seed', true],

    ['al_pizza',      'Pizza',           'permitido',       '🍕', 'aprendizaje', '', 140, 'seed', true],
    ['al_hamburguesa','Hamburguesa',     'permitido',       '🍔', 'aprendizaje', '', 141, 'seed', true],

    /* Bebidas. Van con su grupo propio para poder listarlas aparte. */
    ['al_agua',       'Agua',            'bebidas', '💧', 'aceptado',    '', 150, 'seed', true, 'bebida'],
    ['al_leche',      'Leche',           'bebidas', '🥛', 'aceptado',    '', 151, 'seed', true, 'bebida'],
    ['al_zumo_nat',   'Zumo natural',    'bebidas', '🍊', 'aceptado',    '', 152, 'seed', true, 'bebida'],
    ['al_batido',     'Batido',          'bebidas', '🥤', 'aprendizaje', '', 153, 'seed', true, 'bebida'],
    ['al_infusion',   'Infusión',        'bebidas', '🍵', 'aprendizaje', '', 154, 'seed', true, 'bebida'],
    ['al_refresco',   'Refresco',        'bebidas', '🥤', 'aprendizaje', '', 155, 'seed', true, 'bebida'],
    ['al_zumo_env',   'Zumo envasado',   'bebidas', '🧃', 'aprendizaje', '', 156, 'seed', true, 'bebida'],
    ['al_caldo',      'Caldo',           'bebidas', '🍜', 'aprendizaje', '', 157, 'seed', true],

    /* Postres: son atajos de la pantalla, no un grupo. Cada uno conserva
       su grupo real — el yogur sigue sumando lácteo y la fruta, fruta.
       Si algún día sobran, se borran del Sheet y la sección se encoge. */
    ['al_yogur_nat',  'Yogur natural',   'lacteos',   '🥣', 'aceptado',    '', 170, 'seed', true, 'postre'],
    ['al_yogur_sab',  'Yogur de sabores','lacteos',   '🍧', 'aprendizaje', '', 171, 'seed', true, 'postre'],
    ['al_fruta_post', 'Fruta de postre', 'fruta',     '🍎', 'aceptado',    '', 172, 'seed', true, 'postre'],
    ['al_natillas',   'Natillas',        'capricho',  '🍮', 'aprendizaje', '', 173, 'seed', true, 'postre'],
    ['al_helado',     'Helado',          'capricho',  '🍨', 'aprendizaje', '', 174, 'seed', true, 'postre'],
    ['al_choco',      'Chocolate',       'capricho',  '🍫', 'aprendizaje', '', 175, 'seed', true, 'postre'],
    ['al_bizcocho',   'Bizcocho',        'cereales',  '🍰', 'aprendizaje', '', 176, 'seed', true, 'postre'],
    ['al_queso_post', 'Queso',           'lacteos',   '🧀', 'aprendizaje', '', 177, 'seed', true, 'postre']
  ]
};

/* ============================================================
   SETUP — idempotente, se puede correr las veces que haga falta
   ============================================================ */
function setup() {
  Object.keys(HEADERS).forEach(function (tab) {
    let sh = SS.getSheetByName(tab);
    if (!sh) sh = SS.insertSheet(tab);
    _ensureColumns(sh, HEADERS[tab]);
    /* Las filas de SEED son arrays en el orden de HEADERS. Se convierten a
       objeto ANTES de escribir para que acaben en la columna correcta aunque
       el orden físico de la pestaña no coincida. Escribir por posición es
       exactamente el bug que costó cuatro versiones en Gosari. */
    if (SEED[tab] && sh.getLastRow() < 2) {
      SEED[tab].forEach(function (arr) {
        const obj = {};
        HEADERS[tab].forEach(function (col, i) { obj[col] = arr[i]; });
        _append(sh, obj);
      });
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).setFontWeight('bold');
  });

  /* Columnas que DEBEN quedarse como texto. Si no, Sheets convierte "14:00"
     en un Date de 1899 y "1/2" en una fecha. */
  const TEXTO = {
    'Eventos': ['hora', 'hora_fin'],
    'Eventos_Excepciones': ['nueva_hora'],
    'Custodia_Patron': ['hora_cambio', 'hora_cambio_finde'],
    'Comidas': ['hora', 'cantidad'],
    'Salud_Citas': ['hora'],
    'Salud_Dosis': ['hora'],
    'Salud_Episodios': ['hora'],
    'Salud_Vacunas': ['lote'],
    'Salud_Medicacion': ['dosis'],
    'Usuarios': ['pin'],
    'Config': ['valor']
  };
  Object.keys(TEXTO).forEach(function (tab) {
    const sh = SS.getSheetByName(tab);
    if (!sh) return;
    TEXTO[tab].forEach(function (c) {
      const col = _colIdx(sh, c);
      if (col > 0) sh.getRange(1, col, sh.getMaxRows()).setNumberFormat('@');
    });
  });

  /* Borra la hoja por defecto si quedó vacía */
  const h1 = SS.getSheetByName('Hoja 1') || SS.getSheetByName('Sheet1') || SS.getSheetByName('Hoja1');
  if (h1 && SS.getSheets().length > 1 && h1.getLastRow() === 0) SS.deleteSheet(h1);

  PropertiesService.getScriptProperties().setProperty('GINAPP_ESQUEMA', APP_VERSION);
  Logger.log('✅ Setup OK — ' + Object.keys(HEADERS).length + ' pestañas: ' +
             Object.keys(HEADERS).join(', '));
}

/**
 * Pone al día la estructura del Sheet sola, una vez por versión.
 *
 * Cada entrega que estrena una pestaña o una columna obligaba a acordarse
 * de correr setup() a mano, y olvidarlo daba un fallo raro y tardío. Esto
 * lo hace por su cuenta: cuesta una lectura de propiedades por petición y
 * solo escribe cuando la versión guardada no es la de ahora.
 */
function _alDia() {
  try {
    const props = PropertiesService.getScriptProperties();
    if (props.getProperty('GINAPP_ESQUEMA') === APP_VERSION) return;
    setup();
    _invalidar();
  } catch (err) {
    /* Sin permisos o con el Sheet ocupado: se sigue. La app aguanta una
       columna que falta (lee '' y ya), lo que no aguanta es no arrancar. */
  }
}

/* ============================================================
   IDENTIDAD Y PERMISOS

   Sin esto, cualquier permiso sería de adorno: el frontend puede
   decir lo que quiera, pero es el backend quien decide.

   Reglas:
     1. Para escribir hace falta un token válido. Se obtiene con login().
     2. El backend IGNORA el autor que llegue en el payload y pone el del
        token. Así nadie puede registrar algo en nombre del otro.
     3. Un registro solo lo edita o lo borra quien lo creó. Lo demás se ve
        entero, en solo lectura (§3: un único espacio compartido).
     4. Lo que es un acuerdo entre los dos —custodia, biblioteca de
        alimentos— lo puede tocar cualquiera de los dos.
   ============================================================ */

/** Secreto de firma. Se genera solo la primera vez y vive en las propiedades. */
function _secreto() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('GINAPP_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('GINAPP_SECRET', s);
  }
  return s;
}
/* ============================================================
   CIFRADO DE LOS SECRETOS DE GINA

   Apps Script no trae AES. Lo que sí trae es HMAC-SHA256, y con eso se
   construye un cifrado en flujo correcto: la clave y un nonce aleatorio
   generan un chorro de bytes que se mezcla (XOR) con el texto. Cada
   cifrado usa un nonce distinto, así que la misma contraseña guardada dos
   veces no produce el mismo churro.

   Al final se añade una firma del resultado: si alguien edita el churro a
   mano en el Sheet, al descifrar se nota y se dice, en vez de devolver
   basura silenciosamente.

   Formato guardado:  g1.<nonce b64>.<cifrado b64>.<firma b64>

   Lo que esto protege: que la contraseña NO se lea abriendo el Sheet.
   Lo que NO protege: a quien tenga acceso al proyecto de Apps Script, que
   puede leer la clave. Un Sheet no es un gestor de contraseñas y conviene
   no confundirse.
   ============================================================ */

function _claveSecretos() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('GINAPP_CRYPTO_KEY');
  if (!k) {
    k = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('GINAPP_CRYPTO_KEY', k);
  }
  return k;
}

/** Chorro de bytes del largo pedido, a partir de la clave y el nonce. */
function _keystream(nonce, largo) {
  const clave = _claveSecretos();
  const out = [];
  let bloque = 0;
  while (out.length < largo) {
    const b = Utilities.computeHmacSha256Signature(nonce + '|' + bloque, clave);
    for (let i = 0; i < b.length && out.length < largo; i++) out.push(b[i]);
    bloque++;
  }
  return out;
}

function _cifra(texto) {
  const t = String(texto == null ? '' : texto);
  if (!t) return '';
  const bytes = Utilities.newBlob(t).getBytes();          /* UTF-8 */
  const nonce = Utilities.getUuid();
  const ks = _keystream(nonce, bytes.length);
  const mezcla = bytes.map(function (b, i) {
    /* Los bytes de Apps Script son con signo (-128..127); el XOR se hace
       sobre 0..255 y se devuelve al rango con signo para poder guardarlos. */
    const x = ((b & 0xFF) ^ (ks[i] & 0xFF)) & 0xFF;
    return x > 127 ? x - 256 : x;
  });
  const c64 = Utilities.base64Encode(mezcla);
  const firma = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(nonce + '|' + c64, _claveSecretos())).replace(/=+$/, '');
  return 'g1.' + Utilities.base64EncodeWebSafe(nonce) + '.' + c64 + '.' + firma;
}

/** Devuelve el texto, o null si el churro no cuadra. */
function _descifra(guardado) {
  const s = String(guardado || '');
  if (!s) return '';
  const p = s.split('.');
  /* Lo que no venga cifrado se devuelve tal cual: así una fila escrita a
     mano en el Sheet sigue funcionando mientras no se vuelva a guardar. */
  if (p.length !== 4 || p[0] !== 'g1') return s;
  const nonce = Utilities.newBlob(Utilities.base64DecodeWebSafe(p[1])).getDataAsString();
  const firma = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(nonce + '|' + p[2], _claveSecretos())).replace(/=+$/, '');
  if (firma !== p[3]) return null;
  const mezcla = Utilities.base64Decode(p[2]);
  const ks = _keystream(nonce, mezcla.length);
  const bytes = mezcla.map(function (b, i) {
    const x = ((b & 0xFF) ^ (ks[i] & 0xFF)) & 0xFF;
    return x > 127 ? x - 256 : x;
  });
  return Utilities.newBlob(bytes).getDataAsString();
}

/**
 * La versión de una ficha que SÍ puede viajar en el bootstrap: todo menos
 * el secreto. `tiene_secreto` basta para pintar el botón de revelarlo.
 */
function _ginaPublica(f) {
  const c = {};
  Object.keys(f).forEach(function (k) { if (k !== 'secreto') c[k] = f[k]; });
  c.tiene_secreto = String(f.secreto || '').trim() !== '';
  return c;
}

function _firmar(txt) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(txt, _secreto())).replace(/=+$/, '');
}
function _crearToken(username) {
  const exp = new Date().getTime() + 1000 * 60 * 60 * 24 * 90;   // 90 días
  const base = username + '.' + exp;
  return base + '.' + _firmar(base);
}
/** Username del token, o '' si la firma no cuadra o ya caducó. */
function _tokenUsuario(token) {
  const p = String(token || '').split('.');
  if (p.length !== 3) return '';
  const base = p[0] + '.' + p[1];
  if (_firmar(base) !== p[2]) return '';
  if (Number(p[1]) < new Date().getTime()) return '';
  return p[0];
}

/** ¿Hay algún PIN configurado? Si no, la app funciona en modo confianza. */
function _hayPines() {
  return _readSheet('Usuarios').some(function (u) {
    return String(u.pin || '').trim() !== '';
  });
}

/**
 * login. Con PIN configurado hace falta el PIN; sin ninguno configurado,
 * basta con decir quién eres (y la app lo avisa en pantalla).
 */
/* ============================================================
   LÍMITE DE INTENTOS

   Un PIN de 4 cifras son 10.000 combinaciones. Sin límite, un script
   las prueba todas en minutos y el PIN no protege nada. Con 5 intentos
   y 15 minutos de espera, probarlas todas son más de 20 días.

   Se lleva la cuenta en CacheService, que caduca solo. Si la caché se
   vacía (Google la reinicia cuando quiere), se pierde la cuenta y como
   mucho se regalan 5 intentos: molesta poco y no rompe nada.
   ============================================================ */
const LOGIN_MAX = 5;
const LOGIN_ESPERA = 15 * 60;          /* segundos */

function _claveIntentos(username) { return 'login_fail_' + username; }

function _intentos(username) {
  try {
    const v = CacheService.getScriptCache().get(_claveIntentos(username));
    return v ? Number(v) : 0;
  } catch (e) { return 0; }
}
function _apuntaFallo(username) {
  try {
    CacheService.getScriptCache()
      .put(_claveIntentos(username), String(_intentos(username) + 1), LOGIN_ESPERA);
  } catch (e) {}
}
function _limpiaIntentos(username) {
  try { CacheService.getScriptCache().remove(_claveIntentos(username)); } catch (e) {}
}

function handleLogin(p) {
  const username = String(p.username || '').trim().toLowerCase();
  const pin = String(p.pin || '').trim();

  /* Se comprueba ANTES de mirar si el perfil existe: si no, el mensaje
     "ese perfil no existe" ya dice qué usuarios son válidos. */
  if (_intentos(username) >= LOGIN_MAX) {
    return _json({ ok: false, code: 'bloqueado',
      error: 'Demasiados intentos. Prueba dentro de 15 minutos.' });
  }

  const u = _readSheet('Usuarios').filter(function (x) {
    return String(x.username).toLowerCase() === username;
  })[0];
  if (!u) {
    _apuntaFallo(username);
    return _json({ ok: false, error: 'Perfil o PIN incorrecto' });
  }

  const suyo = String(u.pin || '').trim();
  const modo = _hayPines() ? 'pin' : 'confianza';
  if (modo === 'pin') {
    if (!suyo) {
      return _json({ ok: false,
        error: 'Ese perfil aún no tiene PIN. Ponlo en la pestaña Usuarios.' });
    }
    if (pin !== suyo) {
      _apuntaFallo(username);
      const quedan = LOGIN_MAX - _intentos(username);
      return _json({ ok: false, error: 'PIN incorrecto' +
        (quedan > 0 && quedan <= 2 ? ' · quedan ' + quedan + ' intentos' : '') });
    }
  }
  _limpiaIntentos(username);
  return _json({ ok: true, data: {
    token: _crearToken(username), username: username,
    nombre: String(u.nombre || username), modo: modo
  }});
}

/* Acciones que escriben. Todo lo que esté aquí exige token. */
const MUTACIONES = {
  saveEvento:1, deleteEvento:1, saveTarea:1, deleteTarea:1,
  saveCustodia:1, saveCustodiaRango:1, deleteCustodia:1, savePatron:1,
  marcarRecordatorio:1, savePlato:1, interpretaPlato:1,
  saveEventoExcepcion:1, deleteEventoExcepcion:1,
  saveGasto:1, deleteGasto:1, saveLiquidacion:1, deleteLiquidacion:1,
  saveMovimiento:1, deleteMovimiento:1,
  saveAlimento:1, deleteAlimento:1, saveComida:1, deleteComida:1,
  saveCita:1, deleteCita:1, saveMedicacion:1, deleteMedicacion:1,
  saveDosis:1, deleteDosis:1, saveCrecimiento:1, deleteCrecimiento:1,
  saveEpisodio:1, deleteEpisodio:1, saveVacuna:1, deleteVacuna:1,
  saveMensaje:1, saveComentario:1, deleteComentario:1,
  subirDocumento:1, subirArchivo:1, deleteDocumento:1, marcarLeido:1, marcarVisto:1,
  /* Las fichas de Gina son de los dos: cualquiera las edita, como la
     custodia o la biblioteca de alimentos. Por eso no están en PROPIEDAD.
     verSecreto no escribe nada, pero exige token igual y deja rastro. */
  saveGinaFicha:1, deleteGinaFicha:1
};

/**
 * Registros con dueño: solo su autor los edita o los borra.
 * Lo que NO está aquí es un acuerdo compartido y lo toca cualquiera:
 * Custodia_Dias, Alimentos (biblioteca común) y la configuración.
 */
const PROPIEDAD = {
  saveEvento:      { t:'Eventos',           c:'creado_por' },
  deleteEvento:    { t:'Eventos',           c:'creado_por' },
  saveGasto:       { t:'Gastos',            c:'creado_por' },
  deleteGasto:     { t:'Gastos',            c:'creado_por' },
  saveMovimiento:  { t:'Cuenta_Comun',      c:'creado_por' },
  deleteMovimiento:{ t:'Cuenta_Comun',      c:'creado_por' },
  saveCita:        { t:'Salud_Citas',       c:'creado_por' },
  deleteCita:      { t:'Salud_Citas',       c:'creado_por' },
  saveEpisodio:    { t:'Salud_Episodios',   c:'creado_por' },
  deleteEpisodio:  { t:'Salud_Episodios',   c:'creado_por' },
  saveMedicacion:  { t:'Salud_Medicacion',  c:'creado_por' },
  deleteMedicacion:{ t:'Salud_Medicacion',  c:'creado_por' },
  deleteDosis:     { t:'Salud_Dosis',       c:'dado_por'   },
  saveVacuna:      { t:'Salud_Vacunas',     c:'creado_por' },
  deleteVacuna:    { t:'Salud_Vacunas',     c:'creado_por' },
  saveCrecimiento: { t:'Crecimiento',       c:'creado_por' },
  deleteCrecimiento:{ t:'Crecimiento',      c:'creado_por' },
  deleteComentario:{ t:'Comentarios',       c:'autor'      },
  deleteDocumento: { t:'Documentos',        c:'creado_por' },
  saveComida:      { t:'Comidas',           c:'creado_por', clave:'grupo_id' },
  deleteComida:    { t:'Comidas',           c:'creado_por', clave:'grupo_id' }
};

/** Devuelve '' si puede, o el mensaje de error si el registro es del otro. */
function _compruebaDueno(action, p, yo) {
  const reg = PROPIEDAD[action];
  if (!reg) return '';
  const cuerpo = (p.payload && typeof p.payload === 'object') ? p.payload
    : (p.payload ? (function(){ try { return JSON.parse(p.payload); } catch(e){ return {}; } })() : p);
  const clave = reg.clave || 'id';
  const id = String(cuerpo[clave] || p[clave] || p.id || '').trim();
  if (!id) return '';                      /* alta nueva: nada que comprobar */

  const filas = _readSheet(reg.t).filter(function (r) {
    return String(r[clave]) === id;
  });
  if (!filas.length) return '';            /* no existe: lo tratará el handler */
  const dueno = String(filas[0][reg.c] || '').trim().toLowerCase();
  if (!dueno || dueno === yo) return '';
  return 'Esto lo registró ' + dueno + '. Puedes verlo, pero no cambiarlo.';
}

/* ============================================================
   ROUTER
   ============================================================ */
const HANDLERS = {
  'ping': handlePing,
  'login': handleLogin,
  'getLogin': handleGetLogin,
  'getBootstrap': handleGetBootstrap,

  'saveEvento': handleSaveEvento,
  'deleteEvento': handleDeleteEvento,
  'saveTarea': handleSaveTarea,
  'deleteTarea': handleDeleteTarea,
  'saveCustodia': handleSaveCustodia,
  'saveCustodiaRango': handleSaveCustodiaRango,
  'deleteCustodia': handleDeleteCustodia,
  'savePatron': handleSavePatron,
  'saveEventoExcepcion': handleSaveEventoExcepcion,
  'deleteEventoExcepcion': handleDeleteEventoExcepcion,

  'saveGasto': handleSaveGasto,
  'deleteGasto': handleDeleteGasto,
  'saveLiquidacion': handleSaveLiquidacion,
  'deleteLiquidacion': handleDeleteLiquidacion,
  'saveMovimiento': handleSaveMovimiento,
  'deleteMovimiento': handleDeleteMovimiento,

  'saveAlimento': handleSaveAlimento,
  'deleteAlimento': handleDeleteAlimento,
  'saveComida': handleSaveComida,
  'interpretaPlato': handleInterpretaPlato,
  'savePlato': handleSavePlato,
  'deleteComida': handleDeleteComida,

  'saveCita': handleSaveCita,
  'deleteCita': handleDeleteCita,
  'saveMedicacion': handleSaveMedicacion,
  'deleteMedicacion': handleDeleteMedicacion,
  'saveDosis': handleSaveDosis,
  'deleteDosis': handleDeleteDosis,
  'saveCrecimiento': handleSaveCrecimiento,
  'deleteCrecimiento': handleDeleteCrecimiento,
  'saveEpisodio': handleSaveEpisodio,
  'deleteEpisodio': handleDeleteEpisodio,
  'saveVacuna': handleSaveVacuna,
  'deleteVacuna': handleDeleteVacuna,

  'saveMensaje': handleSaveMensaje,
  'marcarLeido': handleMarcarLeido,
  'saveComentario': handleSaveComentario,
  'marcarRecordatorio': handleMarcarRecordatorio,
  'deleteComentario': handleDeleteComentario,
  'subirDocumento': handleSubirDocumento,
  'subirArchivo': handleSubirArchivo,
  'saveGinaFicha': handleSaveGinaFicha,
  'deleteGinaFicha': handleDeleteGinaFicha,
  'verSecreto': handleVerSecreto,
  'deleteDocumento': handleDeleteDocumento,

  'marcarVisto': handleMarcarVisto
};

/**
 * Comprueba identidad y permisos y despacha. Es el único sitio donde se
 * decide quién puede escribir: los handlers ya no se fían del payload.
 */
/* ============================================================
   QUÉ SE PUEDE PEDIR SIN IDENTIFICARSE

   Solo tres cosas, y ninguna dice nada de Gina:
     ping      → ¿está vivo el backend?
     getLogin  → la lista de perfiles, para pintar la pantalla de entrada
     login     → canjear un PIN por un token

   TODO lo demás, incluido LEER, exige token. Antes getBootstrap era
   libre: como el /exec está en un index.html que vive en un repo
   público, cualquiera que lo mirase podía descargarse la base entera
   con una petición. El PIN protegía las escrituras y nada más.
   ============================================================ */
const LIBRES = { ping: 1, getLogin: 1, login: 1 };

function _despachar(p) {
  const action = String(p.action || '').trim();
  if (!action) return _json({ ok: false, error: 'Falta action' });
  const h = HANDLERS[action];
  if (!h) return _json({ ok: false, error: 'Action desconocida: ' + action });

  if (!LIBRES[action]) {
    const quien = _tokenUsuario(p.token);
    if (!quien) {
      return _json({ ok: false, error: 'Sesión caducada. Vuelve a entrar.', code: 'auth' });
    }
    p._yo = quien;
  }

  if (MUTACIONES[action]) {
    const yo = _tokenUsuario(p.token);
    if (!yo) return _json({ ok: false, error: 'Sesión caducada. Vuelve a entrar.', code: 'auth' });
    const veto = _compruebaDueno(action, p, yo);
    if (veto) return _json({ ok: false, error: veto, code: 'ajeno' });
    p._yo = yo;
    if (action === 'saveMensaje' || action === 'saveComentario') p._forzarAutor = true;
    if (action === 'saveDosis') p._forzarDador = true;

    /* Apps Script guarda las escrituras en un buffer y las vuelca cuando
       le viene bien. Sin este flush, la recarga que hace la app justo
       después puede leer el Sheet ANTES de que lo escrito haya llegado,
       y el evento recién guardado no aparece. Era eso. */
    const r = h(p);
    try { SpreadsheetApp.flush(); } catch (e) {}
    return r;
  }
  return h(p);
}

function doGet(e) {
  try {
    return _despachar((e && e.parameter) || {});
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/** POST con Content-Type: text/plain (evita el preflight CORS desde GitHub Pages). */
function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (e && e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        Object.keys(body).forEach(function (k) { p[k] = body[k]; });
      } catch (err) { /* body no-JSON: seguimos con e.parameter */ }
    }
    /* MISMA puerta que doGet. Si esto vuelve a rutear por su cuenta,
       el token y el veto de propiedad dejan de aplicarse a TODAS las
       escrituras, que es justo lo que viaja por POST. Una sola puerta. */
    return _despachar(p);
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/* ============================================================
   HANDLERS — base
   ============================================================ */

function handlePing() {
  return _json({ ok: true, data: {
    pong: true, app: 'GINapp', version: APP_VERSION, modo: _hayPines() ? 'pin' : 'confianza',
    ts: new Date().toISOString(), tz: _tz(),
    pestanas: SS.getSheets().map(function (s) { return s.getName(); })
  }});
}

/**
 * Todo lo que la app necesita al arrancar, en una sola llamada.
 * Params opcionales:
 *   desde → YYYY-MM-DD, límite inferior de comidas y actividad (default: hace 400 días)
 */
/**
 * Lo único que se sirve sin identificarse: quién puede entrar.
 * Nombre, color, foto y si tiene PIN. Ni el PIN, ni un solo dato de
 * Gina. Con esto se pinta la pantalla de entrada y nada más.
 */
function handleGetLogin() {
  return _json({ ok: true, data: {
    version: APP_VERSION,
    modo: _hayPines() ? 'pin' : 'confianza',
    usuarios: _readSheet('Usuarios').filter(function (u) {
      const r = String(u.rol || '');
      return r !== 'hija' && r !== 'abuelos';
    }).map(function (u) {
      return { username: String(u.username), nombre: String(u.nombre || u.username),
               color: String(u.color || ''), emoji: String(u.emoji || ''),
               foto: String(u.foto || ''), tiene_pin: String(u.pin || '').trim() !== '' };
    }).sort(_porOrden)
  }});
}

function handleGetBootstrap(p) {
  _alDia();                        /* pestañas y columnas nuevas, si las hay */
  _precargar();                    /* 26 pestañas en una llamada, si se puede */
  const desde = String(p.desde || '').trim() || _addDays(_hoy(), -400);

  const conf = {};
  _readSheet('Config').forEach(function (r) {
    if (r.clave) conf[String(r.clave).trim()] = r.valor;
  });

  return _json({ ok: true, data: {
    version: APP_VERSION,
    hoy: _hoy(),
    config: conf,
    modo: _hayPines() ? 'pin' : 'confianza',
    /* Sin el PIN: no tiene por qué salir del backend nunca. */
    /* TODOS los usuarios, tambien los inactivos.
       `activo` significa "puede entrar en la app", y ni Gina ni los avis
       entran. Pero su foto, su color y su nombre SI hacen falta: filtrarlos
       aqui dejaba a Gina sin foto en la cabecera y a los avis sin nombre en
       el calendario. Quien puede entrar lo decide la app con esPerfil(). */
    usuarios: _readSheet('Usuarios').map(function (u) {
      const c = {};
      Object.keys(u).forEach(function (k) { if (k !== 'pin') c[k] = u[k]; });
      c.tiene_pin = String(u.pin || '').trim() !== '';
      return c;
    }).sort(_porOrden),

    patron: _activos(_readSheet('Custodia_Patron')),
    custodia: _readSheet('Custodia_Dias').filter(function (r) {
      const f = _fechaKey(r.fecha);
      return f >= _addDays(_hoy(), -400) && f <= _addDays(_hoy(), 400);
    }),
    eventos: _readSheet('Eventos'),
    eventos_excepciones: _readSheet('Eventos_Excepciones'),
    tareas: _readSheet('Tareas'),
    tipos_evento: _activos(_readSheet('Tipos_Evento')).sort(_porOrden),
    comentarios: _readSheet('Comentarios'),
    recordatorios: _readSheet('Recordatorios'),

    gastos: _readSheet('Gastos'),
    categorias_gasto: _activos(_readSheet('Categorias_Gasto')).sort(_porOrden),
    liquidaciones: _readSheet('Liquidaciones'),
    cuenta: _readSheet('Cuenta_Comun'),

    alimentos: _activos(_readSheet('Alimentos')).sort(_porOrden),
    comidas: _readSheet('Comidas').filter(function (r) { return _fechaKey(r.fecha) >= desde; }),
    objetivos_semana: _activos(_readSheet('Objetivos_Semana')).sort(_porOrden),
    platos: _readSheet('Platos'),

    citas: _readSheet('Salud_Citas'),
    medicacion: _readSheet('Salud_Medicacion'),
    dosis: _readSheet('Salud_Dosis').filter(function (r) { return _fechaKey(r.fecha) >= desde; }),
    episodios: _readSheet('Salud_Episodios'),
    vacunas: _readSheet('Salud_Vacunas'),
    crecimiento: _readSheet('Crecimiento'),
    documentos: _readSheet('Documentos'),

    mensajes: _readSheet('Mensajes').slice(-120),
    actividad: _readSheet('Actividad').slice(-200),
    visitas: _readSheet('Visitas'),

    grupos: GRUPOS,
    estados_alimento: ESTADOS_ALIMENTO,
    estados_toma: ESTADOS_TOMA,
    lugares: LUGARES,

    /* Las comidas del día y los iconos sueltos ahora salen del Sheet.
       Si la pestaña está vacía, la app usa sus valores de siempre: una
       tabla vacía esconde la personalización, no rompe la pantalla. */
    tipos_comida: _activos(_readSheet('Tipos_Comida')).sort(_porOrden),
    iconos: _readSheet('Iconos').filter(function (r) {
      return String(r.fichero || '').trim() !== '';
    }),

    gina: _readSheet('Gina_Fichas').map(_ginaPublica)
  }});
}

/** Marca una sección como vista por un usuario. Así se sabe qué es nuevo. */
function handleMarcarVisto(p) {
  const username = String(p._yo || p.username || '').trim();
  const seccion = String(p.seccion || '').trim();
  if (!username || !seccion) return _json({ ok: false, error: 'Falta username o seccion' });

  const sh = SS.getSheetByName('Visitas');
  const rows = _readSheet('Visitas');
  let fila = -1;
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i].username) === username && String(rows[i].seccion) === seccion) {
      fila = i + 2; break;
    }
  }
  const obj = { username: username, seccion: seccion, ts: new Date().toISOString() };
  if (fila > 0) sh.getRange(fila, 1, 1, _headers(sh).length).setValues([_toRow(sh, obj)]);
  else _append(sh, obj);
  return _json({ ok: true, data: obj });
}

/* ============================================================
   HANDLERS — calendario
   ============================================================ */

function handleSaveEvento(p) {
  const o = _parsePayload(p);
  if (!String(o.titulo || '').trim()) return _json({ ok: false, error: 'Falta el título' });
  const nuevo = !o.id;
  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    fecha_fin: o.fecha_fin ? _fechaKey(o.fecha_fin) : '',
    hora: _horaKey(o.hora),
    hora_fin: _horaKey(o.hora_fin),
    titulo: String(o.titulo).trim(),
    tipo: String(o.tipo || 'otro').trim().toLowerCase(),
    lugar: o.lugar || '',
    responsable: String(o.responsable || '').trim().toLowerCase(),
    todo_el_dia: _truthy(o.todo_el_dia),
    notas: o.notas || '',
    accion: String(o.accion || '').trim(),
    repite: _repite(o.repite),
    repite_dias: _csvDias(o.repite_dias),
    repite_hasta: o.repite_hasta ? _fechaKey(o.repite_hasta) : '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Eventos', 'id', row);
  _log(row.creado_por, 'calendario', nuevo ? 'crea_evento' : 'edita_evento',
       row.titulo + ' · ' + row.fecha, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteEvento(p) {
  const id = String(p.id || '').trim();
  const r = _borrar('Eventos', p, 'calendario', 'borra_evento');
  /* Un evento borrado no puede dejar excepciones colgando */
  if (id) _deleteAllRows('Eventos_Excepciones', 'evento_id', id);
  return r;
}

function _repite(v) {
  const s = String(v || 'no').trim().toLowerCase();
  return (s === 'semanal' || s === 'mensual') ? s : 'no';
}

/** CSV de días de la semana válidos, en orden lun→dom. */
function _csvDias(v) {
  if (!v) return '';
  const orden = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const set = {};
  arr.forEach(function (d) {
    const s = String(d).trim().toLowerCase().slice(0, 3);
    if (orden.indexOf(s) >= 0) set[s] = true;
  });
  return orden.filter(function (d) { return set[d]; }).join(',');
}

/**
 * Cancela o mueve UNA ocurrencia de un evento recurrente.
 * payload: { evento_id, fecha, accion: 'cancelado'|'movido', nueva_fecha?, nueva_hora? }
 */
function handleSaveEventoExcepcion(p) {
  const o = _parsePayload(p);
  const eventoId = String(o.evento_id || '').trim();
  const fecha = _fechaKey(o.fecha);
  if (!eventoId || !fecha) return _json({ ok: false, error: 'Faltan evento_id o fecha' });

  const accion = String(o.accion || 'cancelado').trim().toLowerCase() === 'movido'
    ? 'movido' : 'cancelado';

  /* Una ocurrencia, una excepción */
  const sh = SS.getSheetByName('Eventos_Excepciones');
  _readSheet('Eventos_Excepciones').forEach(function (e) {
    if (String(e.evento_id) === eventoId && _fechaKey(e.fecha) === fecha) {
      _deleteRow('Eventos_Excepciones', 'id', e.id);
    }
  });

  const row = {
    id: Utilities.getUuid(),
    evento_id: eventoId,
    fecha: fecha,
    accion: accion,
    nueva_fecha: o.nueva_fecha ? _fechaKey(o.nueva_fecha) : '',
    nueva_hora: _horaKey(o.nueva_hora),
    motivo: o.motivo || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _append(sh, row);
  _log(row.creado_por, 'calendario',
       accion === 'movido' ? 'mueve_ocurrencia' : 'cancela_ocurrencia', fecha, eventoId);
  return _json({ ok: true, data: row });
}

function handleDeleteEventoExcepcion(p) {
  return _borrar('Eventos_Excepciones', p, 'calendario', 'restaura_ocurrencia');
}

/** Marca (o desmarca) el recordatorio de una ocurrencia concreta. */
function handleMarcarRecordatorio(p) {
  const o = _parsePayload(p);
  const ev = String(o.evento_id || '').trim();
  const fecha = _fechaKey(o.fecha);
  if (!ev || !fecha) return _json({ ok: false, error: 'Falta el evento o la fecha' });

  const clave = ev + '|' + fecha;
  const prev = _readSheet('Recordatorios').filter(function (r) {
    return String(r.evento_id) + '|' + _fechaKey(r.fecha) === clave;
  })[0];

  if (_truthy(o.hecho)) {
    if (prev) return _json({ ok: true, data: { hecho: true, id: prev.id } });
    const row = { id: Utilities.getUuid(), evento_id: ev, fecha: fecha,
                  hecho_por: String(o.creado_por || '').trim().toLowerCase(),
                  timestamp: new Date().toISOString() };
    _append(SS.getSheetByName('Recordatorios'), row);
    _log(row.hecho_por, 'calendario', 'marca_recordatorio', fecha, ev);
    return _json({ ok: true, data: { hecho: true, id: row.id } });
  }
  if (prev) _deleteRow('Recordatorios', 'id', prev.id);
  return _json({ ok: true, data: { hecho: false } });
}

function handleSaveTarea(p) {
  const o = _parsePayload(p);
  if (!String(o.titulo || '').trim()) return _json({ ok: false, error: 'Falta el título' });
  const nuevo = !o.id;
  const hecha = _truthy(o.hecha);
  const row = {
    id: o.id || Utilities.getUuid(),
    titulo: String(o.titulo).trim(),
    responsable: String(o.responsable || '').trim().toLowerCase(),
    fecha_limite: o.fecha_limite ? _fechaKey(o.fecha_limite) : '',
    hecha: hecha,
    fecha_hecha: hecha ? (o.fecha_hecha ? _fechaKey(o.fecha_hecha) : _hoy()) : '',
    hecha_por: hecha ? (o.hecha_por || o.creado_por || '') : '',
    notas: o.notas || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Tareas', 'id', row);
  _log(o.creado_por, 'calendario',
       nuevo ? 'crea_tarea' : (hecha ? 'completa_tarea' : 'edita_tarea'), row.titulo, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteTarea(p) { return _borrar('Tareas', p, 'calendario', 'borra_tarea'); }

/**
 * Fija (o cambia) quién tiene a la niña un día concreto.
 * Una fecha, una fila: si ya había, se sustituye.
 */
function handleSaveCustodia(p) {
  const o = _parsePayload(p);
  const fecha = _fechaKey(o.fecha);
  const username = String(o.username || '').trim().toLowerCase();
  if (!fecha) return _json({ ok: false, error: 'Falta la fecha' });
  if (!username) return _json({ ok: false, error: 'Falta el usuario' });
  if (CASAS.indexOf(username) < 0) {
    return _json({ ok: false, error: 'No conozco esa casa: ' + username });
  }

  const sh = SS.getSheetByName('Custodia_Dias');
  const row = {
    fecha: fecha, username: username,
    origen: String(o.origen || 'cambio').trim().toLowerCase(),
    motivo: o.motivo || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Custodia_Dias', 'fecha', row);
  _log(row.creado_por, 'calendario', 'cambia_custodia',
       fecha + ' -> ' + username + (row.motivo ? ' (' + row.motivo + ')' : ''), fecha);
  return _json({ ok: true, data: row });
}

/** Quita la fila de un día: vuelve a mandar el convenio o el patrón. */
/**
 * Marca un TRAMO entero de una vez.
 *   fecha · fecha_fin · username · [motivo]
 *
 * Existe porque un verano son 75 días: picarlos uno a uno no es una
 * interfaz, es un castigo. Se escribe en una sola pasada por la hoja,
 * no fila a fila, que con 75 filas se agotaría el tiempo de ejecución.
 */
function handleSaveCustodiaRango(p) {
  const o = _parsePayload(p);
  const desde = _fechaKey(o.fecha);
  const hasta = _fechaKey(o.fecha_fin) || desde;
  const username = String(o.username || '').trim().toLowerCase();
  if (!desde) return _json({ ok: false, error: 'Falta la fecha de inicio' });
  if (hasta < desde) return _json({ ok: false, error: 'El último día es anterior al primero' });
  if (CASAS.indexOf(username) < 0) return _json({ ok: false, error: 'No conozco esa casa' });

  const dias = _diffDias(desde, hasta) + 1;
  if (dias > 400) return _json({ ok: false, error: 'Son más de 400 días. Pártelo en dos.' });

  const sh = SS.getSheetByName('Custodia_Dias');
  if (!sh) return _json({ ok: false, error: 'Falta la pestaña Custodia_Dias. Corre setup().' });

  const filas = {};
  _readSheet('Custodia_Dias').forEach(function (r) {
    const f = _fechaKey(r.fecha);
    if (f) filas[f] = r;
  });

  const ts = new Date().toISOString();
  let n = 0, f = desde;
  while (f <= hasta) {
    const prev = filas[f];
    if (!prev || String(prev.username) !== username || String(prev.origen) !== 'cambio') n++;
    filas[f] = { fecha: f, username: username, origen: 'cambio',
                 motivo: o.motivo || '', creado_por: o.creado_por || '', timestamp: ts };
    f = _addDays(f, 1);
  }

  /* Una sola escritura: la hoja se reconstruye entera. */
  const cols = HEADERS['Custodia_Dias'];
  const orden = Object.keys(filas).sort();
  const matriz = orden.map(function (k) {
    return cols.map(function (c) { return filas[k][c] === undefined ? '' : filas[k][c]; });
  });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  if (matriz.length) sh.getRange(2, 1, matriz.length, cols.length).setValues(matriz);
  _invalidar('Custodia_Dias');

  _log(o.creado_por, 'calendario', 'cambia_custodia',
       dias + ' días (' + desde + ' → ' + hasta + ') con ' + username +
       (o.motivo ? ' · ' + o.motivo : ''), desde);
  return _json({ ok: true, data: { dias: dias, cambiados: n, desde: desde, hasta: hasta } });
}

function handleDeleteCustodia(p) {
  const fecha = _fechaKey(p.fecha || '');
  if (!fecha) return _json({ ok: false, error: 'Falta la fecha' });
  const n = _deleteAllRows('Custodia_Dias', 'fecha', fecha);
  _log(p.creado_por, 'calendario', 'deshace_cambio_custodia', fecha, fecha);
  return _json({ ok: n > 0, data: { borradas: n } });
}

/** Alta o edición de un periodo del patrón (curso, verano, Navidad…). */
function handleSavePatron(p) {
  const o = _parsePayload(p);
  const row = {
    id: o.id || Utilities.getUuid(),
    nombre: String(o.nombre || 'Periodo').trim(),
    desde: o.desde ? _fechaKey(o.desde) : '',
    hasta: o.hasta ? _fechaKey(o.hasta) : '',
    lun: _quien(o.lun), mar: _quien(o.mar), mie: _quien(o.mie), jue: _quien(o.jue),
    vie: _quien(o.vie), sab: _quien(o.sab), dom: _quien(o.dom),
    ancla_fecha: o.ancla_fecha ? _fechaKey(o.ancla_fecha) : '',
    ancla_usuario: String(o.ancla_usuario || '').trim().toLowerCase(),
    prioridad: _n(o.prioridad) || 1,
    nota: o.nota || '',
    activo: o.activo === undefined || o.activo === '' ? true : _truthy(o.activo)
  };
  _upsert('Custodia_Patron', 'id', row);
  _log(o.creado_por, 'calendario', 'cambia_patron', row.nombre, row.id);
  return _json({ ok: true, data: row });
}

function _quien(v) {
  const s = String(v || '').trim().toLowerCase();
  return s === 'papa' || s === 'mama' || s === 'alterno' ? s : '';
}

/* ============================================================
   HANDLERS — gastos
   ============================================================ */

function handleSaveGasto(p) {
  const o = _parsePayload(p);
  if (_n(o.importe) <= 0) return _json({ ok: false, error: 'El importe tiene que ser mayor que 0' });

  const nuevo = !o.id;
  const ORIGENES = ['comun', 'papa', 'mama'];
  let origen = String(o.origen || 'comun').trim().toLowerCase();
  if (ORIGENES.indexOf(origen) < 0) origen = 'comun';

  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    categoria: String(o.categoria || 'otro').trim().toLowerCase(),
    descripcion: String(o.descripcion || '').trim(),
    importe: _n(o.importe),
    pagado_por: String(o.pagado_por).trim().toLowerCase(),
    origen: origen,
    compartido: (o.compartido === undefined || o.compartido === '')
      ? true : _truthy(o.compartido),
    comprobante: o.comprobante || '',
    reembolso_id: o.reembolso_id || '',
    nota: o.nota || '',
    creado_por: o.creado_por || o.pagado_por || '',
    timestamp: new Date().toISOString()
  };
  if (!row.pagado_por) row.pagado_por = row.origen === 'comun' ? 'comun' : row.origen;
  _upsert('Gastos', 'id', row);
  _log(row.creado_por, 'gastos', nuevo ? 'crea_gasto' : 'edita_gasto',
       (row.descripcion || row.categoria) + ' · ' + row.importe + ' €', row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteGasto(p) { return _borrar('Gastos', p, 'gastos', 'borra_gasto'); }

/**
 * Cierra una liquidación: crea la fila y marca los gastos incluidos.
 * payload: { importe, de_usuario, a_usuario, nota, gastos: [id, …] }
 */
function handleSaveLiquidacion(p) {
  const o = _parsePayload(p);
  if (_n(o.importe) <= 0) return _json({ ok: false, error: 'El importe tiene que ser mayor que 0' });

  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    importe: _n(o.importe),
    de_usuario: String(o.de_usuario || '').trim().toLowerCase(),
    a_usuario: String(o.a_usuario || '').trim().toLowerCase(),
    nota: o.nota || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Liquidaciones', 'id', row);

  /* Marca los gastos incluidos. Si no se envía lista, se cogen todos los pendientes
     con fecha <= la de la liquidación. */
  const sh = SS.getSheetByName('Gastos');
  const col = _colIdx(sh, 'liquidacion_id');
  let ids = o.gastos;
  if (!ids || !ids.length) {
    ids = _readSheet('Gastos')
      .filter(function (g) { return !g.liquidacion_id && _fechaKey(g.fecha) <= row.fecha; })
      .map(function (g) { return g.id; });
  }
  let marcados = 0;
  if (col > 0) {
    ids.forEach(function (id) {
      const idx = _findRow(sh, 'id', id);
      if (idx > 0) { sh.getRange(idx, col).setValue(row.id); marcados++; }
    });
  }

  _log(row.creado_por, 'gastos', 'liquida',
       row.importe + ' € de ' + row.de_usuario + ' a ' + row.a_usuario +
       ' (' + marcados + ' gastos)', row.id);
  return _json({ ok: true, data: { liquidacion: row, gastos_marcados: marcados } });
}

/** Deshace una liquidación: borra la fila y libera sus gastos. */
function handleDeleteLiquidacion(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const sh = SS.getSheetByName('Gastos');
  const col = _colIdx(sh, 'liquidacion_id');
  let liberados = 0;
  if (col > 0) {
    _readSheet('Gastos').forEach(function (g) {
      if (String(g.liquidacion_id) === id) {
        const idx = _findRow(sh, 'id', g.id);
        if (idx > 0) { sh.getRange(idx, col).setValue(''); liberados++; }
      }
    });
  }
  const n = _deleteRow('Liquidaciones', 'id', id);
  _log(p.creado_por, 'gastos', 'deshace_liquidacion', liberados + ' gastos liberados', id);
  return _json({ ok: n > 0, data: { borradas: n, liberados: liberados } });
}

/**
 * Un movimiento de la cuenta común: aporte, reembolso, retirada o ajuste.
 */
function handleSaveMovimiento(p) {
  const o = _parsePayload(p);
  if (_n(o.importe) <= 0) return _json({ ok: false, error: 'El importe tiene que ser mayor que 0' });
  const TIPOS = ['aporte', 'reembolso', 'retirada', 'ajuste'];
  let tipo = String(o.tipo || 'aporte').trim().toLowerCase();
  if (TIPOS.indexOf(tipo) < 0) tipo = 'aporte';

  const nuevo = !o.id;
  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    tipo: tipo,
    username: String(o.username || '').trim().toLowerCase(),
    importe: _n(o.importe),
    gasto_id: o.gasto_id || '',
    nota: o.nota || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Cuenta_Comun', 'id', row);

  /* Un reembolso marca el gasto que devuelve, para que deje de estar pendiente */
  if (tipo === 'reembolso' && row.gasto_id) {
    const sh = SS.getSheetByName('Gastos');
    const idx = _findRow(sh, 'id', row.gasto_id);
    const col = _colIdx(sh, 'reembolso_id');
    if (idx > 0 && col > 0) sh.getRange(idx, col).setValue(row.id);
  }

  _log(row.creado_por, 'gastos', nuevo ? 'crea_movimiento' : 'edita_movimiento',
       tipo + ' · ' + row.importe + ' €' +
       (row.username ? ' · ' + row.username : ''), row.id);
  return _json({ ok: true, data: row });
}

/** Borra un movimiento y libera el gasto que hubiera reembolsado. */
function handleDeleteMovimiento(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const sh = SS.getSheetByName('Gastos');
  const col = _colIdx(sh, 'reembolso_id');
  if (col > 0) {
    _readSheet('Gastos').forEach(function (g) {
      if (String(g.reembolso_id) === id) {
        const idx = _findRow(sh, 'id', g.id);
        if (idx > 0) sh.getRange(idx, col).setValue('');
      }
    });
  }
  return _borrar('Cuenta_Comun', p, 'gastos', 'borra_movimiento');
}

/* ============================================================
   HANDLERS — alimentación
   ============================================================ */

function handleSaveAlimento(p) {
  const o = _parsePayload(p);
  const nombre = String(o.nombre || '').trim();
  if (!nombre) return _json({ ok: false, error: 'Falta el nombre' });

  const nuevo = !o.id;
  const estado = ESTADOS_ALIMENTO.indexOf(String(o.estado || '').trim().toLowerCase()) >= 0
    ? String(o.estado).trim().toLowerCase() : 'aprendizaje';

  const row = {
    id: o.id || Utilities.getUuid(),
    nombre: nombre,
    grupo: _normGrupo(o.grupo),
    emoji: o.emoji || '',
    estado: estado,
    notas: o.notas || '',
    orden: o.orden === undefined || o.orden === '' ? 900 : _n(o.orden),
    seccion: (function () {
      const x = String(o.seccion || '').trim().toLowerCase();
      return (x === 'bebida' || x === 'postre') ? x : '';
    })(),
    creado_por: o.creado_por || '',
    activo: o.activo === undefined || o.activo === '' ? true : _truthy(o.activo)
  };
  _upsert('Alimentos', 'id', row);
  if (!nuevo && o.estado) {
    _log(o.creado_por, 'alimentacion', 'cambia_estado', nombre + ' → ' + estado, row.id);
  } else if (nuevo) {
    _log(o.creado_por, 'alimentacion', 'crea_alimento', nombre, row.id);
  }
  return _json({ ok: true, data: row });
}

/** Baja lógica: las comidas registradas apuntan a este id y no deben romperse. */
function handleDeleteAlimento(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const sh = SS.getSheetByName('Alimentos');
  const idx = _findRow(sh, 'id', id);
  if (idx < 0) return _json({ ok: false, error: 'No encontrado' });
  const col = _colIdx(sh, 'activo');
  if (col < 0) return _json({ ok: false, error: 'Falta la columna activo. Corre setup().' });
  sh.getRange(idx, col).setValue(false);
  return _json({ ok: true, data: { id: id, activo: false } });
}

/**
 * Guarda una comida: N filas con el mismo `grupo_id`, una por alimento.
 * Reescribe el grupo entero → crear y editar son la misma operación.
 *
 * payload = {
 *   grupo_id?, fecha, hora, tipo_comida, lugar, nota, creado_por,
 *   items: [ { alimento_id, nombre, grupo, estado_toma, cantidad, nota } ]
 * }
 */
/* ============================================================
   INTERPRETAR UN PLATO
   "Arroz a la cubana" → cereales, huevos, verduras.

   Tres capas, de la más barata a la más cara:
     1. Platos ya guardados (incluidas TUS correcciones). Instantáneo,
        gratis, y funciona aunque no haya clave puesta.
     2. Los alimentos de la biblioteca que aparecen en el texto.
     3. OpenAI, solo si lo anterior no ha resuelto nada.

   La clave vive en Script Properties (OPENAI_API_KEY), nunca en el
   código ni en el Sheet. Sin clave, las capas 1 y 2 siguen sirviendo:
   la IA es una ayuda, no un requisito.
   ============================================================ */

/** Misma clave para "Arroz a la Cubana", "arroz a la cubana " y "ARROZ A LA CUBANA". */
function _clavePlato(nombre) {
  return String(nombre || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   /* fuera acentos */
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

function _gruposValidos(lista) {
  const out = [];
  (lista || []).forEach(function (g) {
    const k = GRUPOS_ALIAS[String(g).trim().toLowerCase()] || String(g).trim().toLowerCase();
    if (GRUPOS.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k);
  });
  return out;
}

/** Capa 2: alimentos de la biblioteca que se nombran en el texto. */
function _porBiblioteca(texto) {
  const t = ' ' + _clavePlato(texto) + ' ';
  const out = [];
  _activos(_readSheet('Alimentos')).forEach(function (a) {
    const n = _clavePlato(a.nombre);
    if (!n || n.length < 4) return;              /* "pan" da falsos positivos */
    if (t.indexOf(' ' + n) < 0) return;          /* que empiece palabra */
    out.push({ id: String(a.id), nombre: String(a.nombre),
               grupo: _normGrupo(a.grupo), emoji: String(a.emoji || ''),
               estado: String(a.estado || ''), existe: true });
  });
  return out;
}

/** Empareja un nombre suelto con la biblioteca. Devuelve null si no está. */
function _buscaAlimento(nombre) {
  const n = _clavePlato(nombre);
  if (!n) return null;
  const libro = _activos(_readSheet('Alimentos'));
  /* Exacto primero; si no, uno que contenga al otro ("salmon" ~ "salmon crudo"). */
  let hit = libro.filter(function (a) { return _clavePlato(a.nombre) === n; })[0];
  if (!hit && n.length >= 4) {
    hit = libro.filter(function (a) {
      const m = _clavePlato(a.nombre);
      return m.length >= 4 && (m.indexOf(n) === 0 || n.indexOf(m) === 0);
    })[0];
  }
  if (!hit) return null;
  return { id: String(hit.id), nombre: String(hit.nombre),
           grupo: _normGrupo(hit.grupo), emoji: String(hit.emoji || ''),
           estado: String(hit.estado || ''), existe: true };
}

const _IA_SISTEMA =
  'Clasificas platos caseros españoles en CATEGORÍAS de alimentos, para una ' +
  'app de alimentación infantil. Responde SOLO JSON con esta forma exacta: ' +
  '{"grupos":["..."],"emoji":"X"}. ' +
  'Reglas: ' +
  '1) "grupos" son identificadores EXACTAMENTE de esta lista: @@GRUPOS@@. ' +
  '2) Marca todas las categorías que el plato aporta de verdad. Unos tequeños ' +
  'con guacamole llevan cereales y verduras; un arroz a la cubana lleva ' +
  'cereales, huevos y verduras. ' +
  '3) No cuentes especias, aceite ni condimentos. ' +
  '4) Si el plato es un ultraprocesado, un dulce o comida rápida, marca esa ' +
  'categoría aunque lleve además otras cosas. ' +
  '5) Entre 1 y 5 categorías. Si no reconoces comida, devuelve {"grupos":[]}.';

function _sistemaIA() { return _IA_SISTEMA.replace('@@GRUPOS@@', GRUPOS.join(', ')); }

/** Llama a OpenAI. `foto` es un data URL. Nunca lanza: devuelve {error}. */
function _pideIA(texto, foto) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('OPENAI_API_KEY');
  if (!key) return { grupos: [], error: 'sin_clave' };

  const contenido = foto
    ? [{ type: 'text', text: texto || 'Identifica los alimentos de esta foto.' },
       { type: 'image_url', image_url: { url: foto, detail: 'low' } }]
    : String(texto).slice(0, 400);

  try {
    const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        model: props.getProperty('OPENAI_MODEL') || 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: _sistemaIA() },
                   { role: 'user', content: contenido }]
      })
    });
    const codigo = res.getResponseCode();
    if (codigo !== 200) {
      /* El texto de OpenAI dice POR QUÉ. Tragárselo y decir solo "no ha
         respondido" deja al usuario sin nada que hacer. */
      let detalle = '';
      try { detalle = (JSON.parse(res.getContentText()).error || {}).message || ''; }
      catch (e) { detalle = String(res.getContentText()).slice(0, 160); }
      return { grupos: [], error: 'http_' + codigo, detalle: detalle.slice(0, 200) };
    }
    const j = JSON.parse(res.getContentText());
    const c = JSON.parse(j.choices[0].message.content);
    return { grupos: _gruposValidos(c.grupos), emoji: String(c.emoji || '').slice(0, 4) };
  } catch (err) {
    const m = String(err);
    /* El caso más común la primera vez: el proyecto nunca ha pedido
       permiso para salir a internet, porque hasta ahora no lo necesitaba.
       Decir "excepción" ahí no ayuda a nadie. */
    if (m.indexOf('UrlFetchApp') >= 0 || m.indexOf('external_request') >= 0) {
      return { grupos: [], error: 'sin_permiso' };
    }
    return { grupos: [], error: m.slice(0, 160) };
  }
}

/**
 * Interpreta un plato y devuelve ALIMENTOS, no grupos sueltos.
 *  p.nombre      → "Sushi"           (lo que se verá luego)
 *  p.descripcion → "salmón, arroz…"  (opcional, para afinar)
 *  p.foto        → data URL          (opcional, entra por POST)
 *
 * Cada alimento vuelve marcado con `existe`: los que ya están en la
 * biblioteca se enlazan por id; los nuevos hay que confirmarlos antes
 * de crearlos, para que la biblioteca no se llene de variantes.
 */
/**
 * Interpreta un plato y devuelve sus CATEGORÍAS.
 *   p.nombre → "Tequeños con guacamole"
 *   p.foto   → data URL (opcional)
 *
 * Devuelve grupos, no ingredientes: nadie va a dar de alta "tequeños"
 * como alimento, ni tiene por qué. Los alimentos son lo que se AÑADE a
 * una comida (bebida, snack, fruta), y eso se busca a mano.
 */
function handleInterpretaPlato(p) {
  const o = _parsePayload(p);
  const nombre = String(o.nombre || '').trim();
  const foto = String(o.foto || '');
  if (!nombre && !foto) return _json({ ok: false, error: 'Dime qué comió' });
  const clave = _clavePlato(nombre);

  /* 1 · ya resuelto antes (o corregido a mano) */
  if (clave && !foto) {
    const g = _readSheet('Platos').filter(function (r) {
      return _clavePlato(r.clave) === clave;
    })[0];
    if (g && String(g.grupos || '').trim()) {
      return _json({ ok: true, data: {
        nombre: g.nombre || nombre,
        grupos: _gruposValidos(String(g.grupos).split(',')),
        emoji: g.emoji || '', fuente: 'guardado'
      }});
    }
  }

  /* 2 · la IA */
  const ia = _pideIA(nombre, foto);
  let aviso = '';
  if (ia.error === 'sin_clave') {
    aviso = 'No hay clave de OpenAI puesta. Marca las categorías a mano.';
  } else if (ia.error === 'sin_permiso') {
    aviso = 'El proyecto no tiene permiso para salir a internet. ' +
            'Hay que volver a autorizarlo (mira PERMISOS.md).';
  } else if (ia.error) {
    /* El motivo real, no un "no ha respondido" que no dice nada. */
    aviso = ia.detalle ? ('OpenAI: ' + ia.detalle) : ('Fallo de la IA (' + ia.error + ')');
  }
  return _json({ ok: true, data: {
    nombre: nombre, grupos: ia.grupos, emoji: ia.emoji || '',
    fuente: ia.grupos.length ? 'ia' : 'nada', aviso: aviso
  }});
}

/**
 * Diagnóstico de la IA. Ejecútala desde el editor de Apps Script y mira
 * el registro: dice si la clave está puesta y qué contesta OpenAI.
 */
function probarIA() {
  const key = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  Logger.log('1 · Clave: ' + (key ? 'puesta (' + key.slice(0, 7) + '…' + key.slice(-4) + ')' : 'NO PUESTA'));
  if (!key) {
    Logger.log('   → Configuración del proyecto → Propiedades → OPENAI_API_KEY');
    return;
  }

  /* Se prueba la salida a internet por separado: si falla aquí, no es
     culpa de OpenAI y el mensaje debe decirlo. */
  try {
    UrlFetchApp.fetch('https://api.openai.com/v1/models', {
      muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + key }
    });
    Logger.log('2 · Salida a internet: OK');
  } catch (err) {
    Logger.log('2 · Salida a internet: BLOQUEADA');
    Logger.log('   ' + String(err).slice(0, 160));
    Logger.log('   → Al proyecto le falta el permiso script.external_request.');
    Logger.log('   → Mira PERMISOS.md: hay que añadirlo al manifiesto y volver');
    Logger.log('     a autorizar. No es culpa de OpenAI ni de la clave.');
    return;
  }

  const r = _pideIA('Arroz a la cubana', '');
  if (r.error) {
    Logger.log('3 · OpenAI: ERROR ' + r.error);
    if (r.detalle) Logger.log('   ' + r.detalle);
  } else {
    Logger.log('3 · OpenAI: OK → ' + JSON.stringify(r.grupos));
    Logger.log('✅ Todo funciona.');
  }
}

/** Guarda qué categorías lleva un plato. Lo manual no lo pisa la IA. */
function handleSavePlato(p) {
  const o = _parsePayload(p);
  const nombre = String(o.nombre || '').trim();
  const clave = _clavePlato(nombre);
  if (!clave) return _json({ ok: false, error: 'Falta el nombre del plato' });

  const ids = _gruposValidos(
    Array.isArray(o.grupos) ? o.grupos : String(o.grupos || '').split(','));
  if (!ids.length) return _json({ ok: false, error: 'El plato no lleva categorías' });

  const prev = _readSheet('Platos').filter(function (r) {
    return _clavePlato(r.clave) === clave;
  })[0];
  const fuente = String(o.fuente || 'manual').toLowerCase();
  if (prev && String(prev.fuente) === 'manual' && fuente !== 'manual') {
    return _json({ ok: true, data: { clave: clave, respetado: true } });
  }

  const row = {
    clave: clave, nombre: nombre, grupos: ids.join(','),
    emoji: String(o.emoji || (prev && prev.emoji) || '').slice(0, 4),
    fuente: fuente,
    usos: _n(prev && prev.usos) + 1,
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Platos', 'clave', row);
  return _json({ ok: true, data: row });
}

function handleSaveComida(p) {
  const o = _parsePayload(p);
  const items = o.items || [];
  if (!items.length) return _json({ ok: false, error: 'La comida está vacía' });

  /* Alimentos nuevos que vienen del formulario ya confirmados por quien
     apunta. Se crean AQUÍ, en la misma llamada: si se hiciera en dos
     pasos, un fallo a mitad dejaría alimentos huérfanos en la biblioteca. */
  items.forEach(function (it) {
    if (it.alimento_id || !it.crear || !String(it.nombre || '').trim()) return;
    const yaEsta = _buscaAlimento(it.nombre);
    if (yaEsta) { it.alimento_id = yaEsta.id; return; }
    const id = Utilities.getUuid();
    _upsert('Alimentos', 'id', {
      id: id, nombre: String(it.nombre).trim(), grupo: _normGrupo(it.grupo),
      emoji: String(it.emoji || ''), estado: 'aprendizaje', notas: '',
      orden: 900, creado_por: o.creado_por || '', activo: true
    });
    it.alimento_id = id;
  });

  const grupoId = o.grupo_id || Utilities.getUuid();
  const nuevo = !o.grupo_id;
  const fecha = _fechaKey(o.fecha || _hoy());
  const ts = new Date().toISOString();

  _deleteAllRows('Comidas', 'grupo_id', grupoId);

  const sh = SS.getSheetByName('Comidas');
  const filas = items.map(function (it) {
    const estado = ESTADOS_TOMA.indexOf(String(it.estado_toma || '').trim().toLowerCase()) >= 0
      ? String(it.estado_toma).trim().toLowerCase() : 'comio';
    return {
      id: it.id || Utilities.getUuid(),
      grupo_id: grupoId,
      fecha: fecha,
      hora: _horaKey(o.hora),
      tipo_comida: TIPOS_COMIDA.indexOf(String(o.tipo_comida || '').toLowerCase()) >= 0
        ? String(o.tipo_comida).toLowerCase() : 'otro',
      /* Compatibilidad: antes 'papa'/'mama' viajaban en `lugar`. */
      lugar: (function () {
        const l = String(o.lugar || '').toLowerCase();
        if (l === 'papa' || l === 'mama') return 'casa';
        return LUGARES.indexOf(l) >= 0 ? l : '';
      })(),
      con: (function () {
        const c = String(o.con || '').toLowerCase();
        if (c) return c;
        const l = String(o.lugar || '').toLowerCase();
        return (l === 'papa' || l === 'mama') ? l : '';
      })(),
      alimento_id: it.alimento_id || '',
      nombre: it.nombre || '',
      grupo: _normGrupo(it.grupo),
      estado_toma: estado,
      cantidad: String(it.cantidad || ''),
      /* `nota` es el NOMBRE DEL PLATO y es de la comida entera, no de cada
         alimento: se repite en todas las filas del grupo para que leer
         cualquiera de ellas ya lo diga. Antes se escribía it.nota, que
         nunca venía, y el plato se perdía siempre. */
      nota: String(o.nota || it.nota || ''),
      creado_por: o.creado_por || '',
      timestamp: ts
    };
  });
  filas.forEach(function (r) { _append(sh, r); });

  _log(o.creado_por, 'alimentacion', nuevo ? 'registra_comida' : 'edita_comida',
       (filas[0].tipo_comida || 'comida') + ' · ' + filas.length + ' alimentos · ' + fecha, grupoId);

  /* Se devuelven los items con su alimento_id ya resuelto: el frontal
     los necesita para recordar de qué se compone el plato. */
  return _json({ ok: true, data: { grupo_id: grupoId, filas: filas.length,
    items: filas.map(function (r) {
      return { alimento_id: r.alimento_id, nombre: r.nombre, grupo: r.grupo };
    }) } });
}

function handleDeleteComida(p) {
  const gid = String(p.grupo_id || p.id || '').trim();
  if (!gid) return _json({ ok: false, error: 'Falta grupo_id' });
  const n = _deleteAllRows('Comidas', 'grupo_id', gid);
  _log(p.creado_por, 'alimentacion', 'borra_comida', n + ' filas', gid);
  return _json({ ok: n > 0, data: { borradas: n } });
}

/* ============================================================
   HANDLERS — salud
   ============================================================ */

function handleSaveCita(p) {
  const o = _parsePayload(p);
  const nuevo = !o.id;
  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    hora: _horaKey(o.hora),
    tipo: String(o.tipo || 'pediatra').trim().toLowerCase(),
    profesional: o.profesional || '',
    centro: o.centro || '',
    motivo: o.motivo || '',
    acompana: String(o.acompana || '').trim().toLowerCase(),
    resultado: o.resultado || '',
    notas: o.notas || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Salud_Citas', 'id', row);
  _log(row.creado_por, 'salud', nuevo ? 'crea_cita' : 'edita_cita',
       (row.motivo || row.tipo) + ' · ' + row.fecha, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteCita(p) { return _borrar('Salud_Citas', p, 'salud', 'borra_cita'); }

function handleSaveMedicacion(p) {
  const o = _parsePayload(p);
  if (!String(o.nombre || '').trim()) return _json({ ok: false, error: 'Falta el nombre' });
  const nuevo = !o.id;
  const row = {
    id: o.id || Utilities.getUuid(),
    nombre: String(o.nombre).trim(),
    dosis: String(o.dosis || ''),
    cada_horas: _n(o.cada_horas),
    inicio: _fechaKey(o.inicio || _hoy()),
    fin: o.fin ? _fechaKey(o.fin) : '',
    motivo: o.motivo || '',
    notas: o.notas || '',
    activo: o.activo === undefined || o.activo === '' ? true : _truthy(o.activo),
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Salud_Medicacion', 'id', row);
  _log(row.creado_por, 'salud', nuevo ? 'crea_medicacion' : 'edita_medicacion',
       row.nombre + (row.dosis ? ' · ' + row.dosis : ''), row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteMedicacion(p) {
  return _borrar('Salud_Medicacion', p, 'salud', 'borra_medicacion');
}

/** Una toma. Es el registro que evita duplicar dosis entre las dos casas. */
function handleSaveDosis(p) {
  const o = _parsePayload(p);
  if (!String(o.medicacion_id || '').trim()) return _json({ ok: false, error: 'Falta medicacion_id' });
  const ahora = new Date();
  const row = {
    id: o.id || Utilities.getUuid(),
    medicacion_id: String(o.medicacion_id).trim(),
    fecha: _fechaKey(o.fecha || _hoy()),
    hora: _horaKey(o.hora) || Utilities.formatDate(ahora, _tz(), 'HH:mm'),
    dado_por: String(o.dado_por || '').trim().toLowerCase(),
    nota: o.nota || '',
    timestamp: ahora.toISOString()
  };
  _upsert('Salud_Dosis', 'id', row);

  let nombre = row.medicacion_id;
  _readSheet('Salud_Medicacion').forEach(function (m) {
    if (String(m.id) === row.medicacion_id) nombre = m.nombre;
  });
  _log(row.dado_por, 'salud', 'da_dosis', nombre + ' · ' + row.hora, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteDosis(p) { return _borrar('Salud_Dosis', p, 'salud', 'borra_dosis'); }

function handleSaveCrecimiento(p) {
  const o = _parsePayload(p);
  if (_n(o.peso_kg) <= 0 && _n(o.talla_cm) <= 0) {
    return _json({ ok: false, error: 'Pon al menos el peso o la talla' });
  }
  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    peso_kg: _n(o.peso_kg),
    talla_cm: _n(o.talla_cm),
    nota: o.nota || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Crecimiento', 'id', row);
  _log(row.creado_por, 'salud', 'mide', row.peso_kg + ' kg · ' + row.talla_cm + ' cm', row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteCrecimiento(p) { return _borrar('Crecimiento', p, 'salud', 'borra_medida'); }

/**
 * Un episodio puntual: fiebre, golpe, síntomas (§34).
 * `evolucion` se va ampliando: cada actualización añade una línea con la hora,
 * en vez de sobrescribir. Así queda el curso del episodio, que es lo útil
 * cuando la niña cambia de casa a media enfermedad.
 */
function handleSaveEpisodio(p) {
  const o = _parsePayload(p);
  if (!String(o.descripcion || o.tipo || '').trim()) {
    return _json({ ok: false, error: 'Describe qué ha pasado' });
  }
  const nuevo = !o.id;
  const ahora = new Date();
  const hora = _horaKey(o.hora) ||
               Utilities.formatDate(ahora, _tz(), 'HH:mm');

  let evolucion = '';
  if (!nuevo) {
    const prev = _readSheet('Salud_Episodios')
      .filter(function (r) { return String(r.id) === String(o.id); })[0];
    evolucion = prev ? String(prev.evolucion || '') : '';
  }
  if (String(o.nueva_nota || '').trim()) {
    const quien = String(o.creado_por || '').trim();
    const linea = _fechaKey(o.fecha_nota || _hoy()) + ' ' + hora +
                  (quien ? ' · ' + quien : '') + ' — ' + String(o.nueva_nota).trim();
    evolucion = evolucion ? (evolucion + '\n' + linea) : linea;
  }

  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    hora: hora,
    tipo: String(o.tipo || 'sintoma').trim().toLowerCase(),
    descripcion: String(o.descripcion || '').trim(),
    temperatura: _n(o.temperatura),
    medicacion_id: o.medicacion_id || '',
    evolucion: evolucion,
    notas: o.notas || '',
    creado_por: o.creado_por || '',
    timestamp: ahora.toISOString()
  };
  _upsert('Salud_Episodios', 'id', row);
  _log(row.creado_por, 'salud', nuevo ? 'crea_episodio' : 'actualiza_episodio',
       row.descripcion + (row.temperatura ? ' · ' + row.temperatura + ' ºC' : ''), row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteEpisodio(p) { return _borrar('Salud_Episodios', p, 'salud', 'borra_episodio'); }

function handleSaveVacuna(p) {
  const o = _parsePayload(p);
  if (!String(o.nombre || '').trim()) return _json({ ok: false, error: 'Falta el nombre' });
  const nuevo = !o.id;
  const row = {
    id: o.id || Utilities.getUuid(),
    nombre: String(o.nombre).trim(),
    fecha: _fechaKey(o.fecha || _hoy()),
    centro: o.centro || '',
    lote: String(o.lote || ''),
    proxima: o.proxima ? _fechaKey(o.proxima) : '',
    notas: o.notas || '',
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Salud_Vacunas', 'id', row);
  _log(row.creado_por, 'salud', nuevo ? 'crea_vacuna' : 'edita_vacuna',
       row.nombre + ' · ' + row.fecha, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteVacuna(p) { return _borrar('Salud_Vacunas', p, 'salud', 'borra_vacuna'); }

/* ============================================================
   HANDLERS — mensajes
   ============================================================ */

/**
 * Envía un mensaje al tablón. Solo alta: un mensaje no se edita.
 * Si llega un id se rechaza a propósito — reescribir el pasado se cargaría
 * la única razón de que esta pestaña exista.
 */
function handleSaveMensaje(p) {
  const o = _parsePayload(p);
  const texto = String(o.texto || '').trim();
  if (!texto) return _json({ ok: false, error: 'El mensaje está vacío' });
  if (o.id) return _json({ ok: false, error: 'Los mensajes no se editan ni se borran' });
  if (!String(o.autor || '').trim()) return _json({ ok: false, error: 'Falta el autor' });

  const ahora = new Date();
  const row = {
    id: Utilities.getUuid(),
    fecha: _hoy(),
    autor: String(o.autor).trim().toLowerCase(),
    texto: texto.slice(0, 4000),
    leido_por: '',
    leido_ts: '',
    timestamp: ahora.toISOString()
  };
  _append(SS.getSheetByName('Mensajes'), row);
  _log(row.autor, 'mensajes', 'envia_mensaje', texto.slice(0, 90), row.id);
  return _json({ ok: true, data: row });
}

/** Acuse de lectura. Solo se marca la primera vez y nunca lo hace el autor. */
function handleMarcarLeido(p) {
  const id = String(p.id || '').trim();
  const username = String(p._yo || p.username || '').trim().toLowerCase();
  if (!id || !username) return _json({ ok: false, error: 'Faltan id o username' });

  const sh = SS.getSheetByName('Mensajes');
  const idx = _findRow(sh, 'id', id);
  if (idx < 0) return _json({ ok: false, error: 'No encontrado' });

  const cols = _headers(sh);
  const fila = {};
  sh.getRange(idx, 1, 1, cols.length).getValues()[0]
    .forEach(function (v, i) { fila[cols[i]] = _cellValue(v); });

  if (String(fila.autor) === username) return _json({ ok: true, data: fila });
  if (String(fila.leido_por || '').trim()) return _json({ ok: true, data: fila });

  const cP = _colIdx(sh, 'leido_por'), cT = _colIdx(sh, 'leido_ts');
  const ts = new Date().toISOString();
  if (cP > 0) sh.getRange(idx, cP).setValue(username);
  if (cT > 0) sh.getRange(idx, cT).setValue(ts);
  fila.leido_por = username; fila.leido_ts = ts;
  return _json({ ok: true, data: fila });
}

/* ============================================================
   HANDLERS — comentarios (§41: notas pegadas a un elemento)
   ============================================================ */

function handleSaveComentario(p) {
  const o = _parsePayload(p);
  const texto = String(o.texto || '').trim();
  if (!texto) return _json({ ok: false, error: 'El comentario está vacío' });
  if (!String(o.ref_id || '').trim()) return _json({ ok: false, error: 'Falta ref_id' });

  const row = {
    id: o.id || Utilities.getUuid(),
    entidad: String(o.entidad || '').trim().toLowerCase(),
    ref_id: String(o.ref_id).trim(),
    texto: texto.slice(0, 1000),
    autor: String(o.autor || o.creado_por || '').trim().toLowerCase(),
    timestamp: new Date().toISOString()
  };
  _upsert('Comentarios', 'id', row);
  _log(row.autor, row.entidad === 'gasto' ? 'gastos' :
       (row.entidad === 'alimento' ? 'alimentacion' :
       (row.entidad === 'evento' ? 'calendario' : 'salud')),
       'comenta', texto.slice(0, 80), row.ref_id);
  return _json({ ok: true, data: row });
}

function handleDeleteComentario(p) { return _borrar('Comentarios', p, 'salud', 'borra_comentario'); }

/* ============================================================
   HANDLERS — documentos (§36)
   El archivo va a una carpeta de Drive; en el Sheet solo el enlace.
   Llamar SIEMPRE por POST: un base64 no cabe en una URL.
   ============================================================ */

/**
 * payload: { archivo: base64 (con o sin prefijo data:), mime, nombre,
 *            titulo, tipo, entidad?, ref_id?, fecha?, creado_por }
 */
/**
 * Sube un archivo a Drive y devuelve su enlace, SIN crear fila en
 * Documentos. Sirve para el comprobante de un gasto, que no es un
 * documento de Salud y no tiene por qué salir en esa lista.
 */
function handleSubirArchivo(p) {
  const o = _parsePayload(p);
  const carpetaId = _config('carpeta_drive_id');
  if (!carpetaId) {
    return _json({ ok: false,
      error: 'Falta la carpeta de Drive. Corre crearCarpetaDocumentos() en el editor.' });
  }
  let b64 = String(o.archivo || '').trim();
  if (!b64) return _json({ ok: false, error: 'Falta el archivo' });
  b64 = b64.replace(/^data:[^;]+;base64,/, '');
  const mime = String(o.mime || 'application/octet-stream');
  const titulo = String(o.titulo || 'Archivo').trim().slice(0, 80);

  try {
    const carpeta = DriveApp.getFolderById(carpetaId);
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime,
      _fechaKey(o.fecha || _hoy()) + ' · ' + titulo);
    const file = carpeta.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return _json({ ok: true, data: { url: file.getUrl(), id: file.getId(), nombre: titulo } });
  } catch (err) {
    return _json({ ok: false, error: 'No se pudo subir a Drive: ' + String(err) });
  }
}

function handleSubirDocumento(p) {
  const o = _parsePayload(p);
  const carpetaId = _config('carpeta_drive_id');
  if (!carpetaId) {
    return _json({ ok: false,
      error: 'Falta la carpeta de Drive. Corre crearCarpetaDocumentos() en el editor.' });
  }

  let b64 = String(o.archivo || '').trim();
  if (!b64) return _json({ ok: false, error: 'Falta el archivo' });
  b64 = b64.replace(/^data:[^;]+;base64,/, '');
  const mime = String(o.mime || 'application/octet-stream');
  const titulo = String(o.titulo || o.nombre || 'Documento').trim();

  let file;
  try {
    const carpeta = DriveApp.getFolderById(carpetaId);
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime,
      _fechaKey(o.fecha || _hoy()) + ' · ' + titulo);
    file = carpeta.createFile(blob);
    /* Cualquiera con el enlace: la madre no tiene por qué tener cuenta de Google
       en el mismo dominio, y el enlace solo viaja dentro de la app. */
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    return _json({ ok: false, error: 'No se pudo subir a Drive: ' + String(err) });
  }

  const row = {
    id: Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    titulo: titulo,
    tipo: String(o.tipo || 'informe').trim().toLowerCase(),
    url: file.getUrl(),
    file_id: file.getId(),
    mime: mime,
    entidad: String(o.entidad || '').trim().toLowerCase(),
    ref_id: String(o.ref_id || '').trim(),
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Documentos', 'id', row);
  _log(row.creado_por, 'salud', 'sube_documento', titulo, row.id);
  return _json({ ok: true, data: row });
}

/** Borra el registro y el archivo de Drive. La fila queda en Papelera. */
function handleDeleteDocumento(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const doc = _readSheet('Documentos').filter(function (r) { return String(r.id) === id; })[0];
  if (doc && doc.file_id) {
    try { DriveApp.getFileById(String(doc.file_id)).setTrashed(true); }
    catch (err) { /* si ya no está, seguimos */ }
  }
  return _borrar('Documentos', p, 'salud', 'borra_documento');
}

/* ============================================================
   FICHAS DE GINA
   ============================================================ */

const GINA_TIPOS = ['documento', 'numero', 'credencial'];

/**
 * Crea o actualiza una ficha. La contraseña llega en claro por HTTPS y se
 * cifra AQUÍ: nunca se escribe tal cual en el Sheet.
 *
 * Si no viene `secreto` en la llamada, el que ya hubiera se conserva. Así,
 * editar el usuario de una credencial no obliga a reescribir la contraseña
 * — que además nunca ha bajado al móvil, así que el formulario no la tiene.
 */
function handleSaveGinaFicha(p) {
  const o = _parsePayload(p);

  const id = String(o.id || '').trim();
  const previa = id
    ? _readSheet('Gina_Fichas').filter(function (r) { return String(r.id) === id; })[0]
    : null;

  /* Cada campo que no venga se queda como estaba: así una llamada que solo
     cambia quién tiene el DNI no tiene que reenviar la ficha entera —y no
     puede pisarla por accidente. El título solo es obligatorio al crearla.
     Antes se exigía siempre, y cambiar el poseedor daba "Falta el título". */
  const titulo = String(o.titulo === undefined
    ? (previa ? previa.titulo : '') : o.titulo).trim();
  if (!titulo) return _json({ ok: false, error: 'Falta el título' });

  const tipoPedido = String(o.tipo === undefined
    ? (previa ? previa.tipo : '') : o.tipo).trim().toLowerCase();
  const tipo = GINA_TIPOS.indexOf(tipoPedido) >= 0 ? tipoPedido : 'numero';

  let secreto = previa ? String(previa.secreto || '') : '';
  if (o.secreto !== undefined && o.secreto !== null) {
    const txt = String(o.secreto);
    /* Cadena vacía = borrar la contraseña, que es distinto de no mandarla. */
    secreto = txt === '' ? '' : _cifra(txt);
  }

  const row = {
    id: id || Utilities.getUuid(),
    tipo: tipo,
    titulo: titulo,
    numero: String(o.numero === undefined ? (previa ? previa.numero : '') : o.numero).trim(),
    usuario: String(o.usuario === undefined ? (previa ? previa.usuario : '') : o.usuario).trim(),
    secreto: secreto,
    foto_a: String(o.foto_a === undefined ? (previa ? previa.foto_a : '') : o.foto_a).trim(),
    foto_b: String(o.foto_b === undefined ? (previa ? previa.foto_b : '') : o.foto_b).trim(),
    notas: String(o.notas === undefined ? (previa ? previa.notas : '') : o.notas),
    en_poder_de: (function () {
      const v = o.en_poder_de === undefined
        ? (previa ? previa.en_poder_de : '') : o.en_poder_de;
      const x = String(v || '').trim().toLowerCase();
      /* Solo una casa conocida, o vacío. Un valor raro se queda en vacío
         antes que pintar "en poder de undefined". */
      return CASAS.indexOf(x) >= 0 ? x : '';
    })(),
    orden: o.orden === undefined || o.orden === '' ? (previa ? _n(previa.orden) : 900) : _n(o.orden),
    activo: o.activo === undefined || o.activo === '' ? true : _truthy(o.activo),
    actualizado_por: o.actualizado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Gina_Fichas', 'id', row);
  _log(row.actualizado_por, 'perfil', previa ? 'edita_ficha' : 'crea_ficha', titulo, row.id);
  return _json({ ok: true, data: _ginaPublica(row) });
}

function handleDeleteGinaFicha(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const f = _readSheet('Gina_Fichas').filter(function (r) { return String(r.id) === id; })[0];
  /* La foto se va con la ficha: si no, quedan ficheros sueltos en Drive
     con un DNI dentro y nadie sabe de qué eran. */
  [f && f.foto_a, f && f.foto_b].forEach(function (url) {
    const m = String(url || '').match(/[-\w]{25,}/);
    if (!m) return;
    try { DriveApp.getFileById(m[0]).setTrashed(true); } catch (err) { /* ya no está */ }
  });
  return _borrar('Gina_Fichas', p, 'perfil', 'borra_ficha');
}

/**
 * Descifra UNA contraseña y la devuelve. Nunca viaja en el bootstrap: hay
 * que pedirla a propósito, y cada petición queda apuntada en Actividad con
 * quién y cuándo. No es una barrera contra el otro progenitor —los dos
 * tienen derecho a estos datos— sino un registro de que se miró.
 */
function handleVerSecreto(p) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const f = _readSheet('Gina_Fichas').filter(function (r) { return String(r.id) === id; })[0];
  if (!f) return _json({ ok: false, error: 'Esa ficha ya no está' });
  if (!String(f.secreto || '').trim()) return _json({ ok: true, data: { secreto: '' } });

  const txt = _descifra(String(f.secreto));
  if (txt === null) {
    return _json({ ok: false, error: 'La contraseña guardada no se puede leer: ' +
      'se ha editado a mano en el Sheet o cambió la clave del proyecto. ' +
      'Vuelve a escribirla desde la app.' });
  }
  _log(p._yo || '', 'perfil', 've_secreto', String(f.titulo || ''), id);
  return _json({ ok: true, data: { secreto: txt } });
}

/** Valor de una clave de Config. '' si no existe. */
function _config(clave) {
  const f = _readSheet('Config').filter(function (r) {
    return String(r.clave).trim() === clave;
  })[0];
  return f ? String(f.valor || '').trim() : '';
}

/* ============================================================
   HELPERS
   ============================================================ */

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * El payload, con el autor puesto por el backend. Que el cliente mande
 * creado_por:'mama' da igual: si el token es de papá, queda papá.
 */
function _parsePayload(p) {
  let o;
  if (p.payload) {
    if (typeof p.payload === 'object') o = p.payload;
    else { try { o = JSON.parse(p.payload); } catch (err) { o = {}; } }
  } else {
    o = {};
    Object.keys(p).forEach(function (k) {
      if (k !== 'action' && k !== 'token' && k.charAt(0) !== '_') o[k] = p[k];
    });
  }
  if (p._yo) {
    o.creado_por = p._yo;
    if (p._forzarAutor) o.autor = p._yo;
    if (p._forzarDador) o.dado_por = p._yo;
  }
  return o;
}

/**
 * Borrado genérico por id. Antes de borrar, la fila entera se copia a Papelera
 * con quién y cuándo. Así los dos progenitores pueden borrar sin que se pierda
 * nada y sin inventar una jerarquía entre ellos (§2 vs §40).
 */
function _borrar(tab, p, seccion, accion) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  _aPapelera(tab, id, p.creado_por);
  const n = _deleteRow(tab, 'id', id);
  if (n > 0) {
    _log(p.creado_por, seccion, accion, '', id);
    return _json({ ok: true, data: { borradas: n } });
  }
  /* Devolver ok:false SIN error hacía que el frontal dijese "respuesta
     inesperada del backend", que no dice nada. Si la fila ya no está,
     el borrado está conseguido: eso no es un fallo. */
  return _json({ ok: true, data: { borradas: 0, yaNoEstaba: true } });
}

/** Copia una fila a Papelera antes de borrarla. Nunca tumba la operación. */
function _aPapelera(tab, id, quien) {
  try {
    const fila = _readSheet(tab).filter(function (r) { return String(r.id) === String(id); })[0];
    if (!fila) return;
    _append(SS.getSheetByName('Papelera'), {
      id: Utilities.getUuid(),
      tabla: tab,
      fila_id: id,
      fecha: new Date().toISOString(),
      borrado_por: String(quien || '').trim().toLowerCase(),
      datos: JSON.stringify(fila).slice(0, 45000)
    });
  } catch (err) { /* no crítico */ }
}

/** Lista limpia separada por comas: sin espacios, sin duplicados, sin vacíos. */
function _csv(v) {
  if (!v) return '';
  const arr = Array.isArray(v) ? v : String(v).split(',');
  const out = [];
  arr.forEach(function (x) {
    const s = String(x).trim().toLowerCase();
    if (s && out.indexOf(s) < 0) out.push(s);
  });
  return out.join(',');
}

/** Escribe en el feed de novedades. Nunca debe tumbar la operación principal. */
function _log(username, seccion, accion, detalle, refId) {
  try {
    const sh = SS.getSheetByName('Actividad');
    if (!sh) return;
    _append(sh, {
      id: Utilities.getUuid(),
      timestamp: new Date().toISOString(),
      username: String(username || '').trim().toLowerCase(),
      seccion: seccion || '',
      accion: accion || '',
      detalle: String(detalle || '').slice(0, 200),
      ref_id: refId || ''
    });
  } catch (err) { /* no crítico */ }
}

/** Lee una pestaña como array de objetos. Devuelve [] si no existe (no rompe). */
/* ============================================================
   LECTURA — el coste real de la app está aquí

   El bootstrap toca 26 pestañas. Con getDataRange().getValues() eso son
   ~70 idas y vueltas al servicio de Sheets y 4–6 segundos de espera con
   la pantalla de carga puesta.

   Dos capas para evitarlo:
     1. _PRECARGA: si el servicio avanzado de Sheets está activado, se
        traen TODAS las pestañas en UNA sola llamada HTTP.
     2. _MEMO: dentro de una misma ejecución, cada pestaña se lee una
        vez. (Usuarios se leía dos veces solo para saber si hay PINs.)

   Si el servicio avanzado no está activado la app funciona igual, solo
   que lenta: es una optimización, no una dependencia.
   ============================================================ */
var _MEMO = {};

/** Trae de golpe todas las pestañas del esquema. Silencioso si no puede. */
function _precargar() {
  try {
    if (typeof Sheets === 'undefined') return false;      /* servicio no activado */
    const tabs = Object.keys(HEADERS);
    const res = Sheets.Spreadsheets.Values.batchGet(SS.getId(), {
      ranges: tabs.map(function (t) { return "'" + t + "'"; }),
      valueRenderOption: 'UNFORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING'
    });
    (res.valueRanges || []).forEach(function (vr, i) {
      _MEMO[tabs[i]] = _filasAObjetos(vr.values || []);
    });
    return true;
  } catch (err) {
    /* Pestaña que falta, permisos, cuota... da igual: se lee a la antigua. */
    return false;
  }
}

/** Matriz cruda → objetos por nombre de cabecera. Nunca por posición. */
function _filasAObjetos(data) {
  if (!data || data.length < 2) return [];
  const headers = data[0].map(String);
  return data.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = _cellValue(row[i]); });
    return obj;
  }).filter(function (r) {
    return Object.keys(r).some(function (k) { return r[k] !== '' && r[k] !== null; });
  });
}

function _readSheet(name) {
  if (_MEMO[name]) return _MEMO[name];
  const sh = SS.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) { _MEMO[name] = []; return _MEMO[name]; }
  _MEMO[name] = _filasAObjetos(sh.getDataRange().getValues());
  return _MEMO[name];
}

/** Tras escribir, lo leído deja de valer. Se llama en cada escritura. */
function _invalidar(tab) {
  if (tab) delete _MEMO[tab]; else _MEMO = {};
}

/** Filtra por `activo`: vacío cuenta como TRUE (la app funciona antes de rellenar nada). */
function _activos(rows) {
  return rows.filter(function (r) {
    return r.activo === '' || r.activo === undefined || _truthy(r.activo);
  });
}

function _porOrden(a, b) { return (_n(a.orden) || 999) - (_n(b.orden) || 999); }

/**
 * Celda → valor serializable.
 *  - Fechas → YYYY-MM-DD local (evita el desfase por UTC).
 *  - Horas → HH:mm. Sheets guarda "14:00" como un Date del 1899-12-30 (su época
 *    interna); serializado como fecha saldría "1899-12-30".
 */
function _cellValue(v) {
  if (v instanceof Date) {
    const tz = _tz();
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, tz, 'HH:mm');
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}

/** Cualquier fecha (Date, ISO, DD/MM/YYYY) → YYYY-MM-DD. */
function _fechaKey(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, _tz(), 'yyyy-MM-dd');
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + _pad(m[2]) + '-' + _pad(m[1]);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd');
  return s;
}

function _pad(n) { return ('0' + n).slice(-2); }

/** Cualquier hora → HH:mm. Acepta Date, "14:00", "14:00:00", "9:5". */
function _horaKey(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, _tz(), 'HH:mm');
  const m = String(v).trim().match(/^(\d{1,2})[:.h](\d{1,2})/);
  if (!m) return String(v).trim();
  const h = Math.min(23, parseInt(m[1], 10)), mi = Math.min(59, parseInt(m[2], 10));
  return _pad(h) + ':' + _pad(mi);
}

var _TZ = null;
function _tz() {
  if (_TZ === null) _TZ = SS.getSpreadsheetTimeZone();
  return _TZ;
}
var _HOY = null;
function _hoy() {
  if (_HOY === null) _HOY = Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd');
  return _HOY;
}

function _addDays(fecha, dias) {
  const p = String(fecha).split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + dias);
  return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd');
}

function _truthy(v) {
  if (v === true || v === 1) return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes' || s === 'x';
}

function _n(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : Math.round(v * 100) / 100;
  /* Mismo criterio que num() en la app: con coma, los puntos son miles;
     "1.240" suelto también; el resto, punto decimal. Una celda escrita a
     mano en el Sheet entra por aquí igual que un payload. */
  let s = String(v == null ? 0 : v).trim().replace(/[\s€]/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const x = parseFloat(s);
  return isNaN(x) ? 0 : Math.round(x * 100) / 100;
}

/** Un grupo alimentario válido, aplicando alias. Vacío → 'otros'. */
function _normGrupo(v) {
  let s = String(v || '').trim().toLowerCase();
  if (GRUPOS_ALIAS[s]) s = GRUPOS_ALIAS[s];
  return GRUPOS.indexOf(s) >= 0 ? s : 'otros';
}

/** Añade al final las columnas que falten. Nunca reordena ni borra. */
function _ensureColumns(sh, cols) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const current = sh.getLastRow() > 0
    ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String)
    : [];
  const missing = cols.filter(function (c) { return current.indexOf(c) < 0; });
  if (!missing.length) return;
  const startCol = current.filter(String).length + 1;
  sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
}

/**
 * Cabecera REAL de la pestaña (fila 1). Única fuente válida de orden:
 * _ensureColumns añade columnas nuevas al final, así que el orden físico
 * puede no coincidir con la constante HEADERS.
 */
function _headers(sh) {
  if (!sh || sh.getLastColumn() < 1) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
}

/** Índice 1-based de una columna por nombre. -1 si no existe. */
function _colIdx(sh, nombre) {
  const i = _headers(sh).indexOf(nombre);
  return i < 0 ? -1 : i + 1;
}

/** Objeto → array de fila, respetando el orden real de la pestaña. */
function _toRow(sh, obj) {
  return _headers(sh).map(function (h) {
    return (obj[h] === undefined || obj[h] === null) ? '' : obj[h];
  });
}

function _append(sh, obj) {
  sh.appendRow(_toRow(sh, obj));
  _invalidar(sh.getName());
}

function _findRow(sh, keyCol, keyVal) {
  if (!sh || sh.getLastRow() < 2) return -1;
  const data = sh.getDataRange().getValues();
  const ci = data[0].map(String).indexOf(keyCol);
  if (ci < 0) return -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][ci]) === String(keyVal)) return i + 1;
  }
  return -1;
}

/** Crea o actualiza por clave. Mantiene los valores de columnas no enviadas. */
function _upsert(tab, keyCol, obj) {
  const sh = SS.getSheetByName(tab);
  if (!sh) throw new Error('No existe la pestaña ' + tab + '. Corre setup().');
  const cols = _headers(sh);
  const idx = _findRow(sh, keyCol, obj[keyCol]);
  if (idx > 0) {
    const prev = sh.getRange(idx, 1, 1, cols.length).getValues()[0];
    const merged = {};
    cols.forEach(function (h, i) { merged[h] = (obj[h] !== undefined) ? obj[h] : prev[i]; });
    sh.getRange(idx, 1, 1, cols.length).setValues([_toRow(sh, merged)]);
    _invalidar(tab);
  } else {
    _append(sh, obj);
  }
}

function _deleteRow(tab, keyCol, keyVal) {
  const sh = SS.getSheetByName(tab);
  const idx = _findRow(sh, keyCol, keyVal);
  if (idx < 0) return 0;
  sh.deleteRow(idx);
  _invalidar(tab);
  return 1;
}

/** Borra TODAS las filas que coincidan, de abajo arriba para no desplazar índices. */
function _deleteAllRows(tab, keyCol, keyVal) {
  const sh = SS.getSheetByName(tab);
  if (!sh || sh.getLastRow() < 2) return 0;
  const data = sh.getDataRange().getValues();
  const ci = data[0].map(String).indexOf(keyCol);
  if (ci < 0) return 0;
  let n = 0;
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][ci]) === String(keyVal)) { sh.deleteRow(i + 1); n++; }
  }
  if (n) _invalidar(tab);
  return n;
}

/* ============================================================
   CUSTODIA — misma lógica que el frontend, aquí solo para diagnosticar
   ============================================================ */

/**
 * Quién tiene a la niña una fecha concreta.
 * Orden de resolución: excepción del día > patrón vigente > ''.
 */
function _custodiaDe(fecha, patrones, dias) {
  const f = _fechaKey(fecha);
  for (let i = 0; i < dias.length; i++) {
    if (_fechaKey(dias[i].fecha) === f) return String(dias[i].username);
  }
  const pat = _patronVigente(f, patrones);
  if (!pat) return '';

  const p = f.split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const valor = String(pat[DIAS_COL[d.getDay()]] || '').trim().toLowerCase();
  if (valor !== 'alterno') return valor;

  /* Bloque de fin de semana: el viernes que lo abre. Vie→él mismo, Sáb→-1, Dom→-2.
     Cualquier otro día marcado como 'alterno' se ancla a su propio viernes anterior. */
  const dow = d.getDay();
  const atras = dow === 5 ? 0 : dow === 6 ? 1 : dow === 0 ? 2 : (dow + 2);
  const viernes = _addDays(f, -atras);

  const anc = _fechaKey(pat.ancla_fecha);
  if (!anc || !pat.ancla_usuario) return '';
  const pa = anc.split('-');
  const da = new Date(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  const dowA = da.getDay();
  const atrasA = dowA === 5 ? 0 : dowA === 6 ? 1 : dowA === 0 ? 2 : (dowA + 2);
  const viernesA = _addDays(anc, -atrasA);

  const semanas = Math.round(_diffDias(viernesA, viernes) / 7);
  const otro = String(pat.ancla_usuario).toLowerCase() === 'papa' ? 'mama' : 'papa';
  return (((semanas % 2) + 2) % 2) === 0 ? String(pat.ancla_usuario).toLowerCase() : otro;
}

function _diffDias(a, b) {
  const pa = String(a).split('-'), pb = String(b).split('-');
  const da = Date.UTC(Number(pa[0]), Number(pa[1]) - 1, Number(pa[2]));
  const db = Date.UTC(Number(pb[0]), Number(pb[1]) - 1, Number(pb[2]));
  return Math.round((db - da) / 86400000);
}

/** El patrón que aplica a una fecha: el de mayor prioridad entre los vigentes. */
function _patronVigente(fecha, patrones) {
  let mejor = null;
  patrones.forEach(function (p) {
    const desde = _fechaKey(p.desde), hasta = _fechaKey(p.hasta);
    if (desde && fecha < desde) return;
    if (hasta && fecha > hasta) return;
    /* Un periodo acotado (verano, Navidad) manda sobre el general */
    const espec = (desde || hasta) ? 1000 : 0;
    const score = espec + (_n(p.prioridad) || 1);
    if (!mejor || score > mejor._score) { p._score = score; mejor = p; }
  });
  return mejor;
}

/* ============================================================
   CALENDARIO DEL CONVENIO
   Extraído del Excel "CALENDARI GEO Conveni": 1.047 días entre el
   2025-01-01 y el 2027-11-30, comprimidos en tramos [desde, hasta, quien].
   Reparto real resultante: 516 días papá / 531 mamá (49,3% / 50,7%).
   ============================================================ */
const CUSTODIA_CONVENIO = [
  /* Extraído del convenio real (CALENDARI GEO), leyendo el color de
     relleno de cada día y validando que la columna del Excel coincide
     con el día de la semana verdadero. 1095 días: 2025, 2026 y 2027
     completos, sin un solo hueco.

     Azul (cualquiera de sus tres tonos) = papá · amarillo = mamá ·
     verde = avis. El bloque de detalle de jun–sep 2026 pisa al
     general: es la versión corregida del propio convenio.

     Aquí está el cambio de alternancia de fines de semana de marzo de
     2026 (20-22 y 27-29 seguidos, los dos de papá), que ninguna regla
     generativa acierta. Por eso esto son DATOS y no un patrón. */
  ['2025-01-01','2025-01-05','mama'],
  ['2025-01-06','2025-01-07','papa'],
  ['2025-01-08','2025-01-09','mama'],
  ['2025-01-10','2025-01-14','papa'],
  ['2025-01-15','2025-01-19','mama'],
  ['2025-01-20','2025-01-21','papa'],
  ['2025-01-22','2025-01-23','mama'],
  ['2025-01-24','2025-01-28','papa'],
  ['2025-01-29','2025-02-02','mama'],
  ['2025-02-03','2025-02-04','papa'],
  ['2025-02-05','2025-02-06','mama'],
  ['2025-02-07','2025-02-11','papa'],
  ['2025-02-12','2025-02-16','mama'],
  ['2025-02-17','2025-02-18','papa'],
  ['2025-02-19','2025-02-20','mama'],
  ['2025-02-21','2025-02-25','papa'],
  ['2025-02-26','2025-03-02','mama'],
  ['2025-03-03','2025-03-04','papa'],
  ['2025-03-05','2025-03-06','mama'],
  ['2025-03-07','2025-03-11','papa'],
  ['2025-03-12','2025-03-16','mama'],
  ['2025-03-17','2025-03-18','papa'],
  ['2025-03-19','2025-03-20','mama'],
  ['2025-03-21','2025-03-25','papa'],
  ['2025-03-26','2025-03-30','mama'],
  ['2025-03-31','2025-04-01','papa'],
  ['2025-04-02','2025-04-03','mama'],
  ['2025-04-04','2025-04-08','papa'],
  ['2025-04-09','2025-04-16','mama'],
  ['2025-04-17','2025-04-22','papa'],
  ['2025-04-23','2025-04-27','mama'],
  ['2025-04-28','2025-04-29','papa'],
  ['2025-04-30','2025-05-01','mama'],
  ['2025-05-02','2025-05-06','papa'],
  ['2025-05-07','2025-05-11','mama'],
  ['2025-05-12','2025-05-13','papa'],
  ['2025-05-14','2025-05-15','mama'],
  ['2025-05-16','2025-05-20','papa'],
  ['2025-05-21','2025-05-25','mama'],
  ['2025-05-26','2025-05-27','papa'],
  ['2025-05-28','2025-05-29','mama'],
  ['2025-05-30','2025-06-03','papa'],
  ['2025-06-04','2025-06-08','mama'],
  ['2025-06-09','2025-06-10','papa'],
  ['2025-06-11','2025-06-12','mama'],
  ['2025-06-13','2025-06-17','papa'],
  ['2025-06-18','2025-06-22','mama'],
  ['2025-06-23','2025-06-24','papa'],
  ['2025-06-25','2025-06-26','mama'],
  ['2025-06-27','2025-07-01','papa'],
  ['2025-07-02','2025-07-06','mama'],
  ['2025-07-07','2025-07-08','papa'],
  ['2025-07-09','2025-07-10','mama'],
  ['2025-07-11','2025-07-15','papa'],
  ['2025-07-16','2025-07-20','mama'],
  ['2025-07-21','2025-07-22','papa'],
  ['2025-07-23','2025-07-24','mama'],
  ['2025-07-25','2025-07-29','papa'],
  ['2025-07-30','2025-07-31','mama'],
  ['2025-08-01','2025-08-15','papa'],
  ['2025-08-16','2025-08-31','mama'],
  ['2025-09-01','2025-09-02','papa'],
  ['2025-09-03','2025-09-04','mama'],
  ['2025-09-05','2025-09-09','papa'],
  ['2025-09-10','2025-09-14','mama'],
  ['2025-09-15','2025-09-16','papa'],
  ['2025-09-17','2025-09-18','mama'],
  ['2025-09-19','2025-09-23','papa'],
  ['2025-09-24','2025-09-28','mama'],
  ['2025-09-29','2025-09-30','papa'],
  ['2025-10-01','2025-10-02','mama'],
  ['2025-10-03','2025-10-07','papa'],
  ['2025-10-08','2025-10-12','mama'],
  ['2025-10-13','2025-10-14','papa'],
  ['2025-10-15','2025-10-16','mama'],
  ['2025-10-17','2025-10-21','papa'],
  ['2025-10-22','2025-10-26','mama'],
  ['2025-10-27','2025-10-28','papa'],
  ['2025-10-29','2025-10-30','mama'],
  ['2025-10-31','2025-11-04','papa'],
  ['2025-11-05','2025-11-09','mama'],
  ['2025-11-10','2025-11-11','papa'],
  ['2025-11-12','2025-11-13','mama'],
  ['2025-11-14','2025-11-18','papa'],
  ['2025-11-19','2025-11-23','mama'],
  ['2025-11-24','2025-11-25','papa'],
  ['2025-11-26','2025-11-27','mama'],
  ['2025-11-28','2025-12-02','papa'],
  ['2025-12-03','2025-12-08','mama'],
  ['2025-12-09','2025-12-09','papa'],
  ['2025-12-10','2025-12-11','mama'],
  ['2025-12-12','2025-12-16','papa'],
  ['2025-12-17','2025-12-19','mama'],
  ['2025-12-20','2025-12-24','papa'],
  ['2025-12-25','2025-12-26','mama'],
  ['2025-12-27','2025-12-29','papa'],
  ['2025-12-30','2026-01-04','mama'],
  ['2026-01-05','2026-01-05','papa'],
  ['2026-01-06','2026-01-08','mama'],
  ['2026-01-09','2026-01-13','papa'],
  ['2026-01-14','2026-01-18','mama'],
  ['2026-01-19','2026-01-20','papa'],
  ['2026-01-21','2026-01-22','mama'],
  ['2026-01-23','2026-01-27','papa'],
  ['2026-01-28','2026-02-01','mama'],
  ['2026-02-02','2026-02-03','papa'],
  ['2026-02-04','2026-02-05','mama'],
  ['2026-02-06','2026-02-10','papa'],
  ['2026-02-11','2026-02-15','mama'],
  ['2026-02-16','2026-02-17','papa'],
  ['2026-02-18','2026-02-19','mama'],
  ['2026-02-20','2026-02-24','papa'],
  ['2026-02-25','2026-03-01','mama'],
  ['2026-03-02','2026-03-03','papa'],
  ['2026-03-04','2026-03-05','mama'],
  ['2026-03-06','2026-03-10','papa'],
  ['2026-03-11','2026-03-15','mama'],
  ['2026-03-16','2026-03-17','papa'],
  ['2026-03-18','2026-03-19','mama'],
  ['2026-03-20','2026-03-24','papa'],
  ['2026-03-25','2026-03-26','mama'],
  ['2026-03-27','2026-03-31','papa'],
  ['2026-04-01','2026-04-04','mama'],
  ['2026-04-05','2026-04-07','papa'],
  ['2026-04-08','2026-04-09','mama'],
  ['2026-04-10','2026-04-14','papa'],
  ['2026-04-15','2026-04-19','mama'],
  ['2026-04-20','2026-04-21','papa'],
  ['2026-04-22','2026-04-23','mama'],
  ['2026-04-24','2026-04-28','papa'],
  ['2026-04-29','2026-05-03','mama'],
  ['2026-05-04','2026-05-05','papa'],
  ['2026-05-06','2026-05-07','mama'],
  ['2026-05-08','2026-05-12','papa'],
  ['2026-05-13','2026-05-17','mama'],
  ['2026-05-18','2026-05-19','papa'],
  ['2026-05-20','2026-05-21','mama'],
  ['2026-05-22','2026-05-26','papa'],
  ['2026-05-27','2026-05-31','mama'],
  ['2026-06-01','2026-06-02','papa'],
  ['2026-06-03','2026-06-04','mama'],
  ['2026-06-05','2026-06-09','papa'],
  ['2026-06-10','2026-06-14','mama'],
  ['2026-06-15','2026-06-16','papa'],
  ['2026-06-17','2026-06-18','mama'],
  ['2026-06-19','2026-06-23','papa'],
  ['2026-06-24','2026-06-28','mama'],
  ['2026-06-29','2026-06-30','papa'],
  ['2026-07-01','2026-07-02','mama'],
  ['2026-07-03','2026-07-04','papa'],
  ['2026-07-05','2026-07-11','mama'],
  ['2026-07-12','2026-07-18','papa'],
  ['2026-07-19','2026-07-25','mama'],
  ['2026-07-26','2026-07-30','papa'],
  ['2026-07-31','2026-08-15','mama'],
  ['2026-08-16','2026-08-31','papa'],
  ['2026-09-01','2026-09-06','avis'],
  ['2026-09-07','2026-09-08','papa'],
  ['2026-09-09','2026-09-10','mama'],
  ['2026-09-11','2026-09-15','papa'],
  ['2026-09-16','2026-09-20','mama'],
  ['2026-09-21','2026-09-22','papa'],
  ['2026-09-23','2026-09-24','mama'],
  ['2026-09-25','2026-09-29','papa'],
  ['2026-09-30','2026-10-04','mama'],
  ['2026-10-05','2026-10-06','papa'],
  ['2026-10-07','2026-10-08','mama'],
  ['2026-10-09','2026-10-13','papa'],
  ['2026-10-14','2026-10-18','mama'],
  ['2026-10-19','2026-10-20','papa'],
  ['2026-10-21','2026-10-22','mama'],
  ['2026-10-23','2026-10-27','papa'],
  ['2026-10-28','2026-11-01','mama'],
  ['2026-11-02','2026-11-03','papa'],
  ['2026-11-04','2026-11-05','mama'],
  ['2026-11-06','2026-11-10','papa'],
  ['2026-11-11','2026-11-15','mama'],
  ['2026-11-16','2026-11-17','papa'],
  ['2026-11-18','2026-11-19','mama'],
  ['2026-11-20','2026-11-24','papa'],
  ['2026-11-25','2026-11-29','mama'],
  ['2026-11-30','2026-12-01','papa'],
  ['2026-12-02','2026-12-03','mama'],
  ['2026-12-04','2026-12-08','papa'],
  ['2026-12-09','2026-12-13','mama'],
  ['2026-12-14','2026-12-15','papa'],
  ['2026-12-16','2026-12-17','mama'],
  ['2026-12-18','2026-12-20','papa'],
  ['2026-12-21','2026-12-29','mama'],
  ['2026-12-30','2027-01-07','papa'],
  ['2027-01-08','2027-01-10','mama'],
  ['2027-01-11','2027-01-12','papa'],
  ['2027-01-13','2027-01-14','mama'],
  ['2027-01-15','2027-01-19','papa'],
  ['2027-01-20','2027-01-24','mama'],
  ['2027-01-25','2027-01-26','papa'],
  ['2027-01-27','2027-01-28','mama'],
  ['2027-01-29','2027-02-02','papa'],
  ['2027-02-03','2027-02-07','mama'],
  ['2027-02-08','2027-02-09','papa'],
  ['2027-02-10','2027-02-11','mama'],
  ['2027-02-12','2027-02-16','papa'],
  ['2027-02-17','2027-02-21','mama'],
  ['2027-02-22','2027-02-23','papa'],
  ['2027-02-24','2027-02-25','mama'],
  ['2027-02-26','2027-03-02','papa'],
  ['2027-03-03','2027-03-07','mama'],
  ['2027-03-08','2027-03-09','papa'],
  ['2027-03-10','2027-03-11','mama'],
  ['2027-03-12','2027-03-16','papa'],
  ['2027-03-17','2027-03-23','mama'],
  ['2027-03-24','2027-03-30','papa'],
  ['2027-03-31','2027-04-04','mama'],
  ['2027-04-05','2027-04-06','papa'],
  ['2027-04-07','2027-04-08','mama'],
  ['2027-04-09','2027-04-13','papa'],
  ['2027-04-14','2027-04-18','mama'],
  ['2027-04-19','2027-04-20','papa'],
  ['2027-04-21','2027-04-22','mama'],
  ['2027-04-23','2027-04-27','papa'],
  ['2027-04-28','2027-05-02','mama'],
  ['2027-05-03','2027-05-04','papa'],
  ['2027-05-05','2027-05-06','mama'],
  ['2027-05-07','2027-05-11','papa'],
  ['2027-05-12','2027-05-16','mama'],
  ['2027-05-17','2027-05-18','papa'],
  ['2027-05-19','2027-05-20','mama'],
  ['2027-05-21','2027-05-25','papa'],
  ['2027-05-26','2027-05-30','mama'],
  ['2027-05-31','2027-06-01','papa'],
  ['2027-06-02','2027-06-03','mama'],
  ['2027-06-04','2027-06-08','papa'],
  ['2027-06-09','2027-06-13','mama'],
  ['2027-06-14','2027-06-15','papa'],
  ['2027-06-16','2027-06-17','mama'],
  ['2027-06-18','2027-06-22','papa'],
  ['2027-06-23','2027-06-27','mama'],
  ['2027-06-28','2027-06-29','papa'],
  ['2027-06-30','2027-06-30','mama'],
  ['2027-07-01','2027-07-15','papa'],
  ['2027-07-16','2027-07-31','mama'],
  ['2027-08-01','2027-08-15','papa'],
  ['2027-08-16','2027-09-02','mama'],
  ['2027-09-03','2027-09-07','papa'],
  ['2027-09-08','2027-09-12','mama'],
  ['2027-09-13','2027-09-14','papa'],
  ['2027-09-15','2027-09-16','mama'],
  ['2027-09-17','2027-09-21','papa'],
  ['2027-09-22','2027-09-26','mama'],
  ['2027-09-27','2027-09-28','papa'],
  ['2027-09-29','2027-09-30','mama'],
  ['2027-10-01','2027-10-05','papa'],
  ['2027-10-06','2027-10-10','mama'],
  ['2027-10-11','2027-10-12','papa'],
  ['2027-10-13','2027-10-14','mama'],
  ['2027-10-15','2027-10-19','papa'],
  ['2027-10-20','2027-10-24','mama'],
  ['2027-10-25','2027-10-26','papa'],
  ['2027-10-27','2027-10-28','mama'],
  ['2027-10-29','2027-11-02','papa'],
  ['2027-11-03','2027-11-07','mama'],
  ['2027-11-08','2027-11-09','papa'],
  ['2027-11-10','2027-11-11','mama'],
  ['2027-11-12','2027-11-16','papa'],
  ['2027-11-17','2027-11-21','mama'],
  ['2027-11-22','2027-11-23','papa'],
  ['2027-11-24','2027-11-25','mama'],
  ['2027-11-26','2027-11-30','papa'],
  ['2027-12-01','2027-12-05','mama'],
  ['2027-12-06','2027-12-08','papa'],
  ['2027-12-09','2027-12-09','mama'],
  ['2027-12-10','2027-12-14','papa'],
  ['2027-12-15','2027-12-19','mama'],
  ['2027-12-20','2027-12-29','papa'],
  ['2027-12-30','2027-12-31','mama']
];

/**
 * Vuelca el calendario del convenio en Custodia_Dias.
 * Idempotente: reimportar actualiza, no duplica.
 * Por defecto NO pisa los días marcados como 'cambio' (acuerdos vuestros).
 * Para forzar también esos: importarCustodia(true)
 */
function importarCustodia(pisarCambios) {
  const sh = SS.getSheetByName('Custodia_Dias');
  if (!sh) { Logger.log('❌ Falta la pestaña Custodia_Dias. Corre setup().'); return; }

  /* La pestaña se reconstruye entera de una vez. Borrar fila a fila serían
     miles de llamadas a la hoja y la ejecución se agotaría por tiempo. */
  const final = {};
  _readSheet('Custodia_Dias').forEach(function (r) {
    const f = _fechaKey(r.fecha);
    if (f) final[f] = r;
  });
  const habia = Object.keys(final).length;

  const ts = new Date().toISOString();
  let escritos = 0, respetados = 0, iguales = 0;

  CUSTODIA_CONVENIO.forEach(function (t) {
    let f = t[0];
    while (f <= t[1]) {
      const prev = final[f];
      if (prev && String(prev.origen) === 'cambio' && !pisarCambios) {
        respetados++;
      } else if (prev && String(prev.username) === t[2] && String(prev.origen) === 'convenio') {
        iguales++;
      } else {
        final[f] = { fecha: f, username: t[2], origen: 'convenio', motivo: '',
                     creado_por: 'convenio', timestamp: ts };
        escritos++;
      }
      f = _addDays(f, 1);
    }
  });

  const cols = _headers(sh);
  const fechas = Object.keys(final).sort();
  const matriz = fechas.map(function (f) {
    const o = final[f];
    return cols.map(function (h) { return (o[h] === undefined || o[h] === null) ? '' : o[h]; });
  });

  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, sh.getMaxColumns()).clearContent();
  if (matriz.length) sh.getRange(2, 1, matriz.length, cols.length).setValues(matriz);

  Logger.log('=== IMPORTACIÓN DEL CONVENIO ===');
  Logger.log('📅 Días que había: ' + habia + ' → ahora: ' + fechas.length);
  Logger.log('✅ Escritos o actualizados: ' + escritos);
  Logger.log('➖ Ya estaban igual: ' + iguales);
  Logger.log('🔒 Cambios vuestros respetados: ' + respetados +
             (respetados ? '  (para pisarlos también: importarCustodia(true))' : ''));
  if (fechas.length) Logger.log('Rango: ' + fechas[0] + ' → ' + fechas[fechas.length - 1]);
}

/* ============================================================
   DIAGNÓSTICO Y MANTENIMIENTO
   ============================================================ */

/* ============================================================
   IMÁGENES

   No hay nada que rellenar. El nombre del fichero sale del id de cada
   fila: `ev_cumples.webp`, `gas_salud.webp`, `com_desayuno.webp`,
   `gr_verduras.webp`, `logo_splash.webp`, `ich_bien.webp`… Se sube el
   fichero a img/ y aparece. Mientras no esté, se ve el emoji.

   La columna `icono` (y `fichero` en la pestaña Iconos) sigue existiendo
   como excepción: sirve para que dos filas compartan dibujo o para
   apuntar a una URL de fuera. Vacía, que es lo normal, manda el nombre
   por convención.

   La lista completa de nombres está en IMAGENES.md.
   ============================================================ */

/** Estado de todas las pestañas: columnas que faltan, columnas de más, nº de filas. */
function diagnosticar() {
  Logger.log('=== DIAGNÓSTICO GINapp v' + APP_VERSION + ' ===');
  Logger.log('Zona horaria del Sheet: ' + SS.getSpreadsheetTimeZone());
  let problemas = 0;
  Object.keys(HEADERS).forEach(function (tab) {
    const sh = SS.getSheetByName(tab);
    if (!sh) { Logger.log('❌ ' + tab + ': NO EXISTE. Corre setup().'); problemas++; return; }
    const real = _headers(sh).filter(String);
    const esperadas = HEADERS[tab];
    const faltan = esperadas.filter(function (c) { return real.indexOf(c) < 0; });
    const sobran = real.filter(function (c) { return esperadas.indexOf(c) < 0; });
    const filas = Math.max(0, sh.getLastRow() - 1);
    let msg = (faltan.length ? '❌' : '✅') + ' ' + tab + ' — ' + filas + ' filas';
    if (faltan.length) { msg += ' · FALTAN: ' + faltan.join(', ') + ' → corre setup()'; problemas++; }
    if (sobran.length) msg += ' · extra (se ignoran): ' + sobran.join(', ');
    Logger.log(msg);
  });
  Logger.log(problemas ? '⚠️ ' + problemas + ' pestaña(s) con problemas.' : '✅ Todo correcto.');
}

/**
 * Imprime el calendario de custodia de un mes para comprobar que el patrón
 * y la fecha ancla son los correctos. Ej: verCustodia('2026-09')
 */
function verCustodia(mes) {
  mes = String(mes || _hoy().slice(0, 7));
  const patrones = _activos(_readSheet('Custodia_Patron'));
  const exc = _readSheet('Custodia_Dias');

  const y = Number(mes.split('-')[0]), m = Number(mes.split('-')[1]);
  const dias = new Date(y, m, 0).getDate();
  const NOM = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  Logger.log('=== CUSTODIA ' + mes + ' ===');
  let cPapa = 0, cMama = 0;
  for (let d = 1; d <= dias; d++) {
    const f = y + '-' + _pad(m) + '-' + _pad(d);
    const q = _custodiaDe(f, patrones, exc);
    const fila = exc.filter(function (e) { return _fechaKey(e.fecha) === f; })[0];
    if (q === 'papa') cPapa++; if (q === 'mama') cMama++;
    Logger.log(NOM[new Date(y, m - 1, d).getDay()] + ' ' + f + '  ' + (q || '—') +
               (fila ? '  · ' + fila.origen : '  · ESTIMADO (sin fila)'));
  }
  Logger.log('--- Papá: ' + cPapa + ' días · Mamá: ' + cMama + ' días ---');
}

/**
 * Comprueba que las referencias entre pestañas no estén rotas.
 * Solo INFORMA. No toca nada.
 */
function verificarIntegridad() {
  Logger.log('=== INTEGRIDAD ===');
  const alimentos = {};
  _readSheet('Alimentos').forEach(function (a) { alimentos[String(a.id)] = a.nombre; });
  const huerfanas = _readSheet('Comidas').filter(function (c) {
    return c.alimento_id && !alimentos[String(c.alimento_id)];
  });
  Logger.log(huerfanas.length
    ? '⚠️ ' + huerfanas.length + ' fila(s) de Comidas apuntan a un alimento inexistente'
    : '✅ Comidas → Alimentos OK');

  const meds = {};
  _readSheet('Salud_Medicacion').forEach(function (m) { meds[String(m.id)] = m.nombre; });
  const dosisHuerfanas = _readSheet('Salud_Dosis').filter(function (d) {
    return d.medicacion_id && !meds[String(d.medicacion_id)];
  });
  Logger.log(dosisHuerfanas.length
    ? '⚠️ ' + dosisHuerfanas.length + ' dosis sin medicación'
    : '✅ Dosis → Medicación OK');

  const liq = {};
  _readSheet('Liquidaciones').forEach(function (l) { liq[String(l.id)] = true; });
  const gastosMal = _readSheet('Gastos').filter(function (g) {
    return g.liquidacion_id && !liq[String(g.liquidacion_id)];
  });
  Logger.log(gastosMal.length
    ? '⚠️ ' + gastosMal.length + ' gasto(s) apuntan a una liquidación borrada'
    : '✅ Gastos → Liquidaciones OK');

  const usuarios = _readSheet('Usuarios').map(function (u) { return String(u.username); });
  Logger.log('Usuarios definidos: ' + usuarios.join(', '));
}

/**
 * Crea la carpeta de Drive donde irán informes, recetas y tickets, y guarda
 * su id en Config. Idempotente: si Config ya tiene una carpeta válida, no hace nada.
 * Después, comparte esa carpeta con la cuenta de Google de la madre.
 */
function crearCarpetaDocumentos() {
  const actual = _config('carpeta_drive_id');
  if (actual) {
    try {
      const c = DriveApp.getFolderById(actual);
      Logger.log('✅ Ya existe: "' + c.getName() + '"');
      Logger.log(c.getUrl());
      return;
    } catch (err) { Logger.log('⚠️ El id guardado ya no vale. Creando una nueva…'); }
  }
  const carpeta = DriveApp.createFolder('GINapp · documentos');
  const sh = SS.getSheetByName('Config');
  const idx = _findRow(sh, 'clave', 'carpeta_drive_id');
  if (idx > 0) sh.getRange(idx, _colIdx(sh, 'valor')).setValue(carpeta.getId());
  else _append(sh, { clave: 'carpeta_drive_id', valor: carpeta.getId(), nota: '' });
  Logger.log('✅ Carpeta creada y guardada en Config.');
  Logger.log(carpeta.getUrl());
  Logger.log('👉 Compártela con la cuenta de Google de la madre para que ella también suba.');
}

/** Deja la pestaña Actividad en las últimas N entradas. Por defecto informa. */
function limpiarActividad(aplicar, dejar) {
  dejar = dejar || 500;
  const sh = SS.getSheetByName('Actividad');
  if (!sh) return;
  const filas = Math.max(0, sh.getLastRow() - 1);
  if (filas <= dejar) { Logger.log('✅ Actividad tiene ' + filas + ' filas. Nada que limpiar.'); return; }
  const sobran = filas - dejar;
  if (!aplicar) {
    Logger.log('⚠️ Actividad tiene ' + filas + ' filas. Sobran ' + sobran + '.');
    Logger.log('Para borrarlas de verdad: limpiarActividad(true)');
    return;
  }
  sh.deleteRows(2, sobran);
  Logger.log('🗑️ ' + sobran + ' fila(s) borradas de Actividad.');
}

/* ============================================================
   TESTS (correr desde el editor)
   ============================================================ */
function testPing() { Logger.log(handlePing().getContent()); }
function testBootstrap() {
  const s = handleGetBootstrap({}).getContent();
  Logger.log('Tamaño del bootstrap: ' + s.length + ' caracteres');
  Logger.log(s.slice(0, 1500) + ' …');
}
