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
const APP_VERSION = '0.1.0';

/* ============================================================
   ESQUEMA DE TABLAS
   ============================================================ */
const HEADERS = {

  /* ---------- BASE ---------- */

  /* Los dos progenitores. `pin` de 4 dígitos, vacío = sin PIN.
     `color` se usa en todo el interfaz para saber de quién es cada cosa. */
  'Usuarios': ['username', 'nombre', 'rol', 'color', 'emoji', 'pin', 'orden', 'activo'],

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
                      'ancla_fecha', 'ancla_usuario', 'prioridad', 'nota', 'activo'],

  /* Días sueltos que se salen del patrón: un cambio puntual, un viaje, un puente. */
  'Custodia_Excepciones': ['id', 'fecha', 'username', 'motivo', 'creado_por', 'timestamp'],

  /* Un evento del calendario. `responsable` = quién se encarga (papa|mama|ambos).
     `fecha_fin` vacío = evento de un día. */
  'Eventos': ['id', 'fecha', 'fecha_fin', 'hora', 'hora_fin', 'titulo', 'tipo',
              'lugar', 'responsable', 'todo_el_dia', 'notas', 'creado_por', 'timestamp'],

  /* Tareas con responsable y fecha límite. Vacía = la sección no molesta. */
  'Tareas': ['id', 'titulo', 'responsable', 'fecha_limite', 'hecha', 'fecha_hecha',
             'hecha_por', 'notas', 'creado_por', 'timestamp'],

  /* Tipos de evento. Editable a mano: añadir una fila y aparece en la app. */
  'Tipos_Evento': ['id', 'nombre', 'emoji', 'color', 'orden', 'activo'],

  /* ---------- GASTOS ---------- */

  /* `reparto_papa_pct` es el % que le corresponde a papá: 50 = a medias,
     100 = lo asume papá entero, 0 = lo asume mamá entero. Una sola columna
     evita el lío de tener "tipo de reparto" y "valor" descuadrados.
     `liquidacion_id` vacío = pendiente de liquidar. */
  'Gastos': ['id', 'fecha', 'categoria', 'descripcion', 'importe', 'pagado_por',
             'reparto_papa_pct', 'comprobante', 'liquidacion_id', 'nota',
             'creado_por', 'timestamp'],

  'Categorias_Gasto': ['id', 'nombre', 'emoji', 'color', 'orden', 'activo'],

  /* Un pago que salda cuentas. Los gastos incluidos apuntan a su id. */
  'Liquidaciones': ['id', 'fecha', 'importe', 'de_usuario', 'a_usuario', 'nota',
                    'creado_por', 'timestamp'],

  /* ---------- ALIMENTACIÓN ---------- */

  /* La biblioteca. `estado` es un juicio del padre: aceptado | aprendizaje | rechazado.
     Las exposiciones (visto/probado/aceptado) NO se guardan: se cuentan desde Comidas. */
  'Alimentos': ['id', 'nombre', 'grupo', 'emoji', 'estado', 'notas', 'orden',
                'creado_por', 'activo'],

  /* Una comida = N filas con el mismo `grupo_id`, una por alimento.
     `estado_toma`: comio | probo | rechazo. */
  'Comidas': ['id', 'grupo_id', 'fecha', 'hora', 'tipo_comida', 'lugar',
              'alimento_id', 'nombre', 'grupo', 'estado_toma', 'cantidad', 'nota',
              'creado_por', 'timestamp'],

  /* Objetivos SEMANALES por grupo. `tipo`: min (a alcanzar) | max (a no superar).
     `peso` = cuánto pesa ese grupo en el índice semanal. Fila fuera = grupo sin objetivo. */
  'Objetivos_Semana': ['grupo', 'nombre', 'emoji', 'objetivo', 'tipo', 'peso', 'orden', 'activo'],

  /* ---------- SALUD ---------- */

  'Salud_Citas': ['id', 'fecha', 'hora', 'tipo', 'profesional', 'centro', 'motivo',
                  'acompana', 'resultado', 'notas', 'creado_por', 'timestamp'],

  /* Pauta en curso. `activo` FALSE = tratamiento terminado, se conserva el histórico. */
  'Salud_Medicacion': ['id', 'nombre', 'dosis', 'cada_horas', 'inicio', 'fin', 'motivo',
                       'notas', 'activo', 'creado_por', 'timestamp'],

  /* Cada toma. Es lo que evita dar dos veces la misma dosis entre dos casas. */
  'Salud_Dosis': ['id', 'medicacion_id', 'fecha', 'hora', 'dado_por', 'nota', 'timestamp'],

  'Crecimiento': ['id', 'fecha', 'peso_kg', 'talla_cm', 'nota', 'creado_por', 'timestamp']
};

/* Grupos alimentarios válidos. `nuevo_alimento` NO está aquí a propósito:
   que un alimento sea nuevo es un dato derivado (primera aparición en Comidas). */
const GRUPOS = ['verduras', 'fruta', 'legumbres', 'pescado', 'proteina_blanca',
                'carnes_rojas', 'huevos', 'lacteos', 'frutos_secos', 'cereales',
                'ultraprocesado', 'capricho', 'permitido', 'agua', 'otros'];

/* Nombres antiguos → nuevos, por si algún día se renombra un grupo. */
const GRUPOS_ALIAS = { 'proteina': 'proteina_blanca', 'libre': 'permitido',
                       'cereales_integrales': 'cereales', 'verdura': 'verduras' };

const ESTADOS_ALIMENTO = ['aceptado', 'aprendizaje', 'rechazado'];
const ESTADOS_TOMA = ['comio', 'probo', 'rechazo'];
const TIPOS_COMIDA = ['desayuno', 'almuerzo', 'comida', 'merienda', 'cena', 'otro'];
const LUGARES = ['papa', 'mama', 'cole', 'fuera'];

/* Días de la semana en el orden de las columnas de Custodia_Patron */
const DIAS_COL = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

/* ============================================================
   DATOS SEMILLA — solo se escriben si la pestaña está vacía
   ============================================================ */
const SEED = {
  'Usuarios': [
    ['papa', 'Papá', 'padre', '#12B76A', '👨', '', 1, true],
    ['mama', 'Mamá', 'madre', '#7A5AF8', '👩', '', 2, true]
  ],

  'Config': [
    ['nombre_hija', 'Gina', 'Cómo se llama en la interfaz'],
    ['emoji_hija', '🌻', 'Emoji de cabecera'],
    ['moneda', '€', ''],
    ['openai_activo', 'FALSE', 'TRUE activa el botón de describir comida con IA'],
    ['zona_horaria', 'Europe/Madrid', 'Informativo: la real es la del Sheet']
  ],

  /* Lunes y martes papá, miércoles y jueves mamá, findes alternos.
     ancla_fecha debe ser un día de un fin de semana que fue de ancla_usuario. */
  'Custodia_Patron': [
    ['curso', 'Curso', '', '', 'papa', 'papa', 'mama', 'mama',
     'alterno', 'alterno', 'alterno', '2026-08-21', 'papa', 1,
     'Lun-Mar papá · Mié-Jue mamá · findes alternos', true]
  ],

  'Tipos_Evento': [
    ['cole',         'Cole',         '🎒', '#2E90FA', 1, true],
    ['extraescolar', 'Extraescolar', '⚽', '#12B76A', 2, true],
    ['medico',       'Médico',       '🩺', '#F04438', 3, true],
    ['cumple',       'Cumpleaños',   '🎂', '#EE46BC', 4, true],
    ['viaje',        'Viaje',        '✈️', '#7A5AF8', 5, true],
    ['finde',        'Plan',         '🎡', '#F79009', 6, true],
    ['otro',         'Otro',         '📌', '#98A2B3', 9, true]
  ],

  'Categorias_Gasto': [
    ['cole',         'Cole',          '🎒', '#2E90FA', 1, true],
    ['comedor',      'Comedor',       '🍽️', '#12B76A', 2, true],
    ['extraescolar', 'Extraescolares','⚽', '#F79009', 3, true],
    ['ropa',         'Ropa',          '👕', '#EE46BC', 4, true],
    ['salud',        'Salud',         '🩺', '#F04438', 5, true],
    ['ocio',         'Ocio',          '🎡', '#7A5AF8', 6, true],
    ['material',     'Material',      '✏️', '#0BA5EC', 7, true],
    ['otro',         'Otro',          '🧾', '#98A2B3', 9, true]
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

    ['al_leche',      'Leche',           'lacteos',         '🥛', 'aprendizaje', '', 90, 'seed', true],
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

    ['al_agua',       'Agua',            'agua',            '💧', 'aceptado',    '', 150, 'seed', true]
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
    if (SEED[tab] && sh.getLastRow() < 2) {
      SEED[tab].forEach(function (row) { sh.appendRow(row); });
    }
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).setFontWeight('bold');
  });

  /* Columnas que DEBEN quedarse como texto. Si no, Sheets convierte "14:00"
     en un Date de 1899 y "1/2" en una fecha. */
  const TEXTO = {
    'Eventos': ['hora', 'hora_fin'],
    'Comidas': ['hora', 'cantidad'],
    'Salud_Citas': ['hora'],
    'Salud_Dosis': ['hora'],
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

  Logger.log('✅ Setup OK — ' + Object.keys(HEADERS).length + ' pestañas: ' +
             Object.keys(HEADERS).join(', '));
}

/* ============================================================
   ROUTER
   ============================================================ */
const HANDLERS = {
  'ping': handlePing,
  'getBootstrap': handleGetBootstrap,

  'saveEvento': handleSaveEvento,
  'deleteEvento': handleDeleteEvento,
  'saveTarea': handleSaveTarea,
  'deleteTarea': handleDeleteTarea,
  'saveExcepcion': handleSaveExcepcion,
  'deleteExcepcion': handleDeleteExcepcion,
  'savePatron': handleSavePatron,

  'saveGasto': handleSaveGasto,
  'deleteGasto': handleDeleteGasto,
  'saveLiquidacion': handleSaveLiquidacion,
  'deleteLiquidacion': handleDeleteLiquidacion,

  'saveAlimento': handleSaveAlimento,
  'deleteAlimento': handleDeleteAlimento,
  'saveComida': handleSaveComida,
  'deleteComida': handleDeleteComida,

  'saveCita': handleSaveCita,
  'deleteCita': handleDeleteCita,
  'saveMedicacion': handleSaveMedicacion,
  'deleteMedicacion': handleDeleteMedicacion,
  'saveDosis': handleSaveDosis,
  'deleteDosis': handleDeleteDosis,
  'saveCrecimiento': handleSaveCrecimiento,
  'deleteCrecimiento': handleDeleteCrecimiento,

  'marcarVisto': handleMarcarVisto
};

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = String(p.action || '').trim();
    if (!action) return _json({ ok: false, error: 'Falta action' });
    const h = HANDLERS[action];
    if (!h) return _json({ ok: false, error: 'Action desconocida: ' + action });
    return h(p);
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
    const action = String(p.action || '').trim();
    if (!action) return _json({ ok: false, error: 'Falta action' });
    const h = HANDLERS[action];
    if (!h) return _json({ ok: false, error: 'Action desconocida: ' + action });
    return h(p);
  } catch (err) {
    return _json({ ok: false, error: String(err) });
  }
}

/* ============================================================
   HANDLERS — base
   ============================================================ */

function handlePing() {
  return _json({ ok: true, data: {
    pong: true, app: 'GINapp', version: APP_VERSION,
    ts: new Date().toISOString(), tz: SS.getSpreadsheetTimeZone(),
    pestanas: SS.getSheets().map(function (s) { return s.getName(); })
  }});
}

/**
 * Todo lo que la app necesita al arrancar, en una sola llamada.
 * Params opcionales:
 *   desde → YYYY-MM-DD, límite inferior de comidas y actividad (default: hace 400 días)
 */
function handleGetBootstrap(p) {
  const desde = String(p.desde || '').trim() || _addDays(_hoy(), -400);

  const conf = {};
  _readSheet('Config').forEach(function (r) {
    if (r.clave) conf[String(r.clave).trim()] = r.valor;
  });

  return _json({ ok: true, data: {
    version: APP_VERSION,
    hoy: _hoy(),
    config: conf,
    usuarios: _activos(_readSheet('Usuarios')).sort(_porOrden),

    patron: _activos(_readSheet('Custodia_Patron')),
    excepciones: _readSheet('Custodia_Excepciones'),
    eventos: _readSheet('Eventos'),
    tareas: _readSheet('Tareas'),
    tipos_evento: _activos(_readSheet('Tipos_Evento')).sort(_porOrden),

    gastos: _readSheet('Gastos'),
    categorias_gasto: _activos(_readSheet('Categorias_Gasto')).sort(_porOrden),
    liquidaciones: _readSheet('Liquidaciones'),

    alimentos: _activos(_readSheet('Alimentos')).sort(_porOrden),
    comidas: _readSheet('Comidas').filter(function (r) { return _fechaKey(r.fecha) >= desde; }),
    objetivos_semana: _activos(_readSheet('Objetivos_Semana')).sort(_porOrden),

    citas: _readSheet('Salud_Citas'),
    medicacion: _readSheet('Salud_Medicacion'),
    dosis: _readSheet('Salud_Dosis').filter(function (r) { return _fechaKey(r.fecha) >= desde; }),
    crecimiento: _readSheet('Crecimiento'),

    actividad: _readSheet('Actividad').slice(-200),
    visitas: _readSheet('Visitas'),

    grupos: GRUPOS,
    estados_alimento: ESTADOS_ALIMENTO,
    estados_toma: ESTADOS_TOMA,
    tipos_comida: TIPOS_COMIDA,
    lugares: LUGARES
  }});
}

/** Marca una sección como vista por un usuario. Así se sabe qué es nuevo. */
function handleMarcarVisto(p) {
  const username = String(p.username || '').trim();
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
    creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _upsert('Eventos', 'id', row);
  _log(row.creado_por, 'calendario', nuevo ? 'crea_evento' : 'edita_evento',
       row.titulo + ' · ' + row.fecha, row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteEvento(p) { return _borrar('Eventos', p, 'calendario', 'borra_evento'); }

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

/** Un día concreto que se sale del patrón de custodia. */
function handleSaveExcepcion(p) {
  const o = _parsePayload(p);
  const fecha = _fechaKey(o.fecha);
  const username = String(o.username || '').trim().toLowerCase();
  if (!fecha) return _json({ ok: false, error: 'Falta la fecha' });
  if (!username) return _json({ ok: false, error: 'Falta el usuario' });

  /* Una fecha, una excepción: si ya había, se sustituye. */
  _deleteAllRows('Custodia_Excepciones', 'fecha', fecha);
  const row = {
    id: Utilities.getUuid(), fecha: fecha, username: username,
    motivo: o.motivo || '', creado_por: o.creado_por || '',
    timestamp: new Date().toISOString()
  };
  _append(SS.getSheetByName('Custodia_Excepciones'), row);
  _log(row.creado_por, 'calendario', 'cambia_custodia',
       fecha + ' → ' + username + (row.motivo ? ' (' + row.motivo + ')' : ''), row.id);
  return _json({ ok: true, data: row });
}

function handleDeleteExcepcion(p) {
  const fecha = _fechaKey(p.fecha || '');
  if (fecha) {
    const n = _deleteAllRows('Custodia_Excepciones', 'fecha', fecha);
    _log(p.creado_por, 'calendario', 'deshace_cambio_custodia', fecha, '');
    return _json({ ok: n > 0, data: { borradas: n } });
  }
  return _borrar('Custodia_Excepciones', p, 'calendario', 'deshace_cambio_custodia');
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
  if (!String(o.pagado_por || '').trim()) return _json({ ok: false, error: 'Falta quién lo pagó' });

  const nuevo = !o.id;
  let pct = o.reparto_papa_pct;
  pct = (pct === undefined || pct === '') ? 50 : _n(pct);
  pct = Math.max(0, Math.min(100, pct));

  const row = {
    id: o.id || Utilities.getUuid(),
    fecha: _fechaKey(o.fecha || _hoy()),
    categoria: String(o.categoria || 'otro').trim().toLowerCase(),
    descripcion: String(o.descripcion || '').trim(),
    importe: _n(o.importe),
    pagado_por: String(o.pagado_por).trim().toLowerCase(),
    reparto_papa_pct: pct,
    comprobante: o.comprobante || '',
    liquidacion_id: o.liquidacion_id || '',
    nota: o.nota || '',
    creado_por: o.creado_por || o.pagado_por || '',
    timestamp: new Date().toISOString()
  };
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
function handleSaveComida(p) {
  const o = _parsePayload(p);
  const items = o.items || [];
  if (!items.length) return _json({ ok: false, error: 'La comida está vacía' });

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
      lugar: LUGARES.indexOf(String(o.lugar || '').toLowerCase()) >= 0
        ? String(o.lugar).toLowerCase() : '',
      alimento_id: it.alimento_id || '',
      nombre: it.nombre || '',
      grupo: _normGrupo(it.grupo),
      estado_toma: estado,
      cantidad: String(it.cantidad || ''),
      nota: it.nota || '',
      creado_por: o.creado_por || '',
      timestamp: ts
    };
  });
  filas.forEach(function (r) { _append(sh, r); });

  _log(o.creado_por, 'alimentacion', nuevo ? 'registra_comida' : 'edita_comida',
       (filas[0].tipo_comida || 'comida') + ' · ' + filas.length + ' alimentos · ' + fecha, grupoId);

  return _json({ ok: true, data: { grupo_id: grupoId, filas: filas.length } });
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
    hora: _horaKey(o.hora) || Utilities.formatDate(ahora, SS.getSpreadsheetTimeZone(), 'HH:mm'),
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

/* ============================================================
   HELPERS
   ============================================================ */

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function _parsePayload(p) {
  if (p.payload) {
    if (typeof p.payload === 'object') return p.payload;
    try { return JSON.parse(p.payload); } catch (err) { return {}; }
  }
  const o = {};
  Object.keys(p).forEach(function (k) { if (k !== 'action') o[k] = p[k]; });
  return o;
}

/** Borrado genérico por id + entrada en el feed de actividad. */
function _borrar(tab, p, seccion, accion) {
  const id = String(p.id || '').trim();
  if (!id) return _json({ ok: false, error: 'Falta id' });
  const n = _deleteRow(tab, 'id', id);
  if (n > 0) _log(p.creado_por, seccion, accion, '', id);
  return _json({ ok: n > 0, data: { borradas: n } });
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
function _readSheet(name) {
  const sh = SS.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(String);
  return data.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = _cellValue(row[i]); });
    return obj;
  }).filter(function (r) {
    return Object.keys(r).some(function (k) { return r[k] !== '' && r[k] !== null; });
  });
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
    const tz = SS.getSpreadsheetTimeZone();
    if (v.getFullYear() < 1901) return Utilities.formatDate(v, tz, 'HH:mm');
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  }
  return v;
}

/** Cualquier fecha (Date, ISO, DD/MM/YYYY) → YYYY-MM-DD. */
function _fechaKey(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, SS.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return m[3] + '-' + _pad(m[2]) + '-' + _pad(m[1]);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, SS.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return s;
}

function _pad(n) { return ('0' + n).slice(-2); }

/** Cualquier hora → HH:mm. Acepta Date, "14:00", "14:00:00", "9:5". */
function _horaKey(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, SS.getSpreadsheetTimeZone(), 'HH:mm');
  const m = String(v).trim().match(/^(\d{1,2})[:.h](\d{1,2})/);
  if (!m) return String(v).trim();
  const h = Math.min(23, parseInt(m[1], 10)), mi = Math.min(59, parseInt(m[2], 10));
  return _pad(h) + ':' + _pad(mi);
}

function _hoy() {
  return Utilities.formatDate(new Date(), SS.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function _addDays(fecha, dias) {
  const p = String(fecha).split('-');
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  d.setDate(d.getDate() + dias);
  return Utilities.formatDate(d, SS.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

function _truthy(v) {
  if (v === true || v === 1) return true;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'si' || s === 'sí' || s === 'yes' || s === 'x';
}

function _n(v) {
  const x = parseFloat(String(v == null ? 0 : v).replace(',', '.'));
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

function _append(sh, obj) { sh.appendRow(_toRow(sh, obj)); }

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
  } else {
    _append(sh, obj);
  }
}

function _deleteRow(tab, keyCol, keyVal) {
  const sh = SS.getSheetByName(tab);
  const idx = _findRow(sh, keyCol, keyVal);
  if (idx < 0) return 0;
  sh.deleteRow(idx);
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
  return n;
}

/* ============================================================
   CUSTODIA — misma lógica que el frontend, aquí solo para diagnosticar
   ============================================================ */

/**
 * Quién tiene a la niña una fecha concreta.
 * Orden de resolución: excepción del día > patrón vigente > ''.
 */
function _custodiaDe(fecha, patrones, excepciones) {
  const f = _fechaKey(fecha);
  for (let i = 0; i < excepciones.length; i++) {
    if (_fechaKey(excepciones[i].fecha) === f) return String(excepciones[i].username);
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
   DIAGNÓSTICO Y MANTENIMIENTO
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
  const exc = _readSheet('Custodia_Excepciones');
  if (!patrones.length) { Logger.log('❌ No hay patrón activo. Corre setup().'); return; }

  const y = Number(mes.split('-')[0]), m = Number(mes.split('-')[1]);
  const dias = new Date(y, m, 0).getDate();
  const NOM = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  Logger.log('=== CUSTODIA ' + mes + ' ===');
  let cPapa = 0, cMama = 0;
  for (let d = 1; d <= dias; d++) {
    const f = y + '-' + _pad(m) + '-' + _pad(d);
    const q = _custodiaDe(f, patrones, exc);
    const esExc = exc.some(function (e) { return _fechaKey(e.fecha) === f; });
    if (q === 'papa') cPapa++; if (q === 'mama') cMama++;
    Logger.log(NOM[new Date(y, m - 1, d).getDay()] + ' ' + f + '  ' +
               (q || '—') + (esExc ? '  ← excepción' : ''));
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
