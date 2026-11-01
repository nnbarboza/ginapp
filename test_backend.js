/* ============================================================
   test_backend.js — los handlers de verdad, sin Sheets.

   Por qué existe: los otros tests corren la app en jsdom y el backend
   está mockeado, así que un handler puede estar roto y todos pasar. Pasó
   con "Falta el título" al cambiar quién tiene el DNI: el front mandaba
   bien un solo campo y el backend lo rechazaba.

   Aquí se carga Code.gs entero con las APIs de Google simuladas, y se
   sustituyen _readSheet/_upsert por una tabla en memoria. Se prueba la
   LÓGICA del handler, que es donde estuvo el fallo.
   ============================================================ */
const fs = require('fs'), path = require('path'), crypto = require('crypto');

function toSigned(buf){ return Array.from(buf).map(b => b > 127 ? b - 256 : b); }
let props = {};
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
global.Utilities = {
  getUuid: () => crypto.randomUUID(),
  computeHmacSha256Signature: (m, k) => toSigned(crypto.createHmac('sha256',
    Buffer.from(String(k), 'utf8')).update(Buffer.from(String(m), 'utf8')).digest()),
  base64Encode: a => Buffer.from(Uint8Array.from(a.map(b => b < 0 ? b + 256 : b))).toString('base64'),
  base64Decode: s => toSigned(Buffer.from(s, 'base64')),
  base64EncodeWebSafe: a => (typeof a === 'string' ? Buffer.from(a, 'utf8')
      : Buffer.from(Uint8Array.from(a.map(b => b < 0 ? b + 256 : b))))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
  base64DecodeWebSafe: s => toSigned(Buffer.from(
    String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
  newBlob: x => (typeof x === 'string'
    ? { getBytes: () => toSigned(Buffer.from(x, 'utf8')), getDataAsString: () => x }
    : { getBytes: () => x,
        getDataAsString: () => Buffer.from(Uint8Array.from(
          x.map(b => b < 0 ? b + 256 : b))).toString('utf8') }),
  formatDate: (d, tz, f) => new Date(d).toISOString().slice(0, 10)
};
global.SpreadsheetApp = {
  openById: () => FAKE_SS, getActiveSpreadsheet: () => FAKE_SS, flush: () => {}
};
/* getSheetByName devolvía null para TODO, así que cualquier handler que
   empiece comprobando que la pestaña existe salía por la puerta antes de
   hacer nada — y el test pasaba sin probar nada. Devuelve una hoja de
   mentira: lo que se lee y se escribe sigue yendo a TABLAS. */
const HOJA_FALSA = {
  getLastRow: () => 2, getLastColumn: () => 1, getDataRange: () => ({ getValues: () => [] }),
  getRange: () => ({ getValues: () => [], setValues(){ return this; }, setValue(){ return this; } }),
  appendRow: () => {}, deleteRow: () => {}, getName: () => 'falsa'
};
const FAKE_SS = {
  getId: () => 'fake', getSpreadsheetTimeZone: () => 'Europe/Madrid',
  getSheetByName: () => HOJA_FALSA, insertSheet: () => HOJA_FALSA, getSheets: () => []
};
global.DriveApp = { getFileById: () => { throw new Error('sin Drive'); } };
/* Una CacheService de mentira pero con memoria: sin esto no se puede probar
   que el bootstrap se parte en trozos y se vuelve a montar entero. */
let CACHE = {};
global.CacheService = { getScriptCache: () => ({
  get: k => (k in CACHE ? CACHE[k] : null),
  getAll: ks => { const o = {}; ks.forEach(k => { if (k in CACHE) o[k] = CACHE[k]; }); return o; },
  put: (k, v) => { CACHE[k] = String(v); },
  putAll: o => { Object.keys(o).forEach(k => { CACHE[k] = String(o[k]); }); },
  remove: k => { delete CACHE[k]; },
  removeAll: ks => ks.forEach(k => { delete CACHE[k]; })
}) };
global.ContentService = {
  createTextOutput: t => ({ _t: t, setMimeType(){ return this; }, getContent(){ return this._t; } }),
  MimeType: { JSON: 'json' }
};
global.Logger = { log: () => {} };
global.Session = { getScriptTimeZone: () => 'Europe/Madrid' };

const src = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
/* `const SS = SpreadsheetApp.openById(...)` se evalúa al cargar; los stubs
   de arriba ya están puestos, así que basta con evaluarlo todo. */
eval(src);

/* ---------- tablas en memoria ---------- */
let TABLAS = {};
_readSheet = function (tab) { return (TABLAS[tab] || []).map(r => Object.assign({}, r)); };
/* Se sustituye porque _MEMO no existe con tablas en memoria, pero tiene que
   seguir tirando la caché de servidor: es justo lo que garantiza que al
   guardar un gasto el otro no siga viendo el arranque de hace un minuto. */
_invalidar = function () { _bootTirar(); };
_upsert = function (tab, keyCol, obj) {
  TABLAS[tab] = TABLAS[tab] || [];
  const i = TABLAS[tab].findIndex(r => String(r[keyCol]) === String(obj[keyCol]));
  if (i >= 0) TABLAS[tab][i] = Object.assign({}, obj); else TABLAS[tab].push(Object.assign({}, obj));
};
_log = function () {};

let fallos = 0;
function ok(t, c, e){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (e !== undefined ? '  → '+e : '')); fallos++; }
}
/* Los handlers devuelven un TextOutput; esto saca el objeto. */
const r = out => JSON.parse(out.getContent());
const ficha = id => TABLAS['Gina_Fichas'].filter(x => x.id === id)[0];

console.log('\n--- CREAR UNA FICHA ---');
let res = r(handleSaveGinaFicha({ payload: {
  tipo:'documento', titulo:'DNI', numero:'12345678A', creado_por:'papa',
  actualizado_por:'papa' } }));
ok('se crea', res.ok === true, res.error);
const ID = res.data.id;
ok('con su tipo', ficha(ID).tipo === 'documento');
ok('y su número', ficha(ID).numero === '12345678A');
ok('sin título no se crea',
   r(handleSaveGinaFicha({ payload:{ tipo:'numero', numero:'X' } })).ok === false);

console.log('\n--- CAMBIAR SOLO QUIÉN LO TIENE ---');
/* Esto es exactamente lo que manda la app al tocar el chip: id, el campo
   y quién lo hace. Nada más. */
res = r(handleSaveGinaFicha({ payload:{
  id:ID, en_poder_de:'mama', actualizado_por:'papa' } }));
ok('NO dice que falta el título', res.ok === true, res.error);
ok('se apunta quién lo tiene', ficha(ID).en_poder_de === 'mama', ficha(ID).en_poder_de);
ok('el título sigue ahí', ficha(ID).titulo === 'DNI', ficha(ID).titulo);
ok('el número también', ficha(ID).numero === '12345678A', ficha(ID).numero);
ok('y el tipo no se cae a "numero"', ficha(ID).tipo === 'documento', ficha(ID).tipo);

console.log('\n--- UNA CASA QUE NO EXISTE NO SE GUARDA ---');
handleSaveGinaFicha({ payload:{ id:ID, en_poder_de:'el vecino' } });
ok('se queda vacío antes que pintar algo sin sentido',
   ficha(ID).en_poder_de === '', JSON.stringify(ficha(ID).en_poder_de));
handleSaveGinaFicha({ payload:{ id:ID, en_poder_de:'avis' } });
ok('los avis sí valen: es una de las tres casas', ficha(ID).en_poder_de === 'avis');

console.log('\n--- LA CONTRASEÑA ---');
res = r(handleSaveGinaFicha({ payload:{
  tipo:'credencial', titulo:'Cole', usuario:'gbarboza', secreto:'Clave.2026!',
  actualizado_por:'papa' } }));
const ID2 = res.data.id;
ok('no se guarda en claro', ficha(ID2).secreto.indexOf('Clave') < 0, ficha(ID2).secreto);
ok('y lo que sale del handler tampoco la lleva',
   res.data.secreto === undefined && res.data.tiene_secreto === true,
   JSON.stringify(res.data).slice(0, 120));

/* Cambiar el usuario NO debe tocar la contraseña. */
handleSaveGinaFicha({ payload:{ id:ID2, usuario:'gbarboza2', actualizado_por:'papa' } });
ok('editar el usuario no borra la contraseña',
   String(ficha(ID2).secreto || '').indexOf('g1.') === 0, ficha(ID2).secreto);
ok('y se sigue pudiendo leer',
   r(handleVerSecreto({ id:ID2, _yo:'papa' })).data.secreto === 'Clave.2026!');

/* Mandarla vacía a propósito SÍ la borra. */
handleSaveGinaFicha({ payload:{ id:ID2, secreto:'', actualizado_por:'papa' } });
ok('mandarla vacía a propósito sí la borra', ficha(ID2).secreto === '');

console.log('\n--- UN PIN QUE EMPIEZA POR CERO ---');
/* Sheets guarda "0209" como el NÚMERO 209 si la celda no era texto cuando
   se escribió. Al leerlo vuelven tres dígitos y la comparación nunca
   cuadraba: metías el PIN correcto y no entrabas. */
ok('209 y "0209" son el mismo PIN', _pinNorm(209) === _pinNorm('0209'),
   _pinNorm(209) + ' vs ' + _pinNorm('0209'));
ok('se rellena a cuatro cifras', _pinNorm(209) === '0209', _pinNorm(209));
ok('un PIN normal no cambia', _pinNorm('1234') === '1234');
ok('los ceros de en medio se respetan', _pinNorm('1004') === '1004');
ok('todo ceros también', _pinNorm(0) === '0000', _pinNorm(0));
ok('lo que no son cuatro dígitos se deja como está',
   _pinNorm('abc') === 'abc' && _pinNorm('12345') === '12345');
ok('vacío sigue vacío', _pinNorm('') === '' && _pinNorm(null) === '');
ok('y NO cuela un PIN distinto por el padding',
   _pinNorm('1234') !== _pinNorm('234'), _pinNorm('234'));

console.log('\n--- LA CACHÉ DEL ARRANQUE, EN EL SERVIDOR ---');
/* Pasa de 100 KB por clave, así que va por trozos. Lo que importa es que
   vuelva a salir EXACTAMENTE lo que entró, y que un trozo perdido no
   devuelva medio JSON. */
CACHE = {};
const GRANDE = JSON.stringify({ ok:true, data:{ relleno:'x'.repeat(250000) } });
_bootGuardar(GRANDE);
ok('se parte en varias claves', parseInt(CACHE['_boot_n'], 10) >= 3, CACHE['_boot_n']);
ok('ninguna pasa del tope de 100 KB',
   Object.keys(CACHE).filter(k => k !== '_boot_n')
     .every(k => CACHE[k].length <= 100000),
   Math.max.apply(null, Object.keys(CACHE).filter(k => k !== '_boot_n').map(k => CACHE[k].length)));
ok('y vuelve a montarse igual que entró', _bootLeer() === GRANDE);

/* Si falta un trozo se descarta el conjunto: servir medio JSON haría que la
   app fallara al parsear, que es peor que no tener caché. */
delete CACHE['_boot_1'];
ok('con un trozo perdido no se sirve nada', _bootLeer() === null);

CACHE = {};
_bootGuardar(GRANDE);
_bootTirar();
ok('cualquier escritura la tira entera', _bootLeer() === null);
ok('y no deja restos', Object.keys(CACHE).length === 0, Object.keys(CACHE).join(','));

/* Una carga demasiado grande simplemente no se cachea. */
CACHE = {};
_bootGuardar('y'.repeat(90000 * 45));
ok('lo que no cabe no se cachea a medias', _bootLeer() === null);
ok('y no deja basura ocupando sitio', !CACHE['_boot_n']);

/* Escribir cualquier cosa invalida: _invalidar llama a _bootTirar. */
CACHE = {};
_bootGuardar('{"ok":true}');
_invalidar();
ok('guardar un gasto deja la caché sin efecto', _bootLeer() === null);

console.log('\n--- LA COMIDA DEL COLE, SOLA ---');
/* De lunes a viernes come en el comedor y el menú ya está en el Sheet.
   Apuntarlo a mano era copiar algo que la app ya tenía. */
TABLAS['Comidas'] = [];
TABLAS['Config'] = [
  { clave:'cole_automatico', valor:'TRUE', nota:'' },
  { clave:'cole_hora', valor:'13:00', nota:'' },
  { clave:'cole_generado_hasta', valor:'2026-10-04', nota:'' }
];
TABLAS['Menu_Cole'] = [
  { fecha:'2026-10-05', plato:'Ensalada de espirales y butifarra',
    alimentos:'Espirales:cereales, Butifarra:carnes_procesadas, Rúcula:verduras', nota:'' },
  { fecha:'2026-10-06', plato:'Garbanzos y tortilla',
    alimentos:'Garbanzos:legumbres, Tortilla:huevos', nota:'' },
  /* Festivo: fila sin platos. No se puede inventar una comida. */
  { fecha:'2026-10-07', plato:'', alimentos:'', nota:'Festivo' },
  /* Mañana: no se adelanta el futuro. */
  { fecha:'2026-10-09', plato:'Arroz integral', alimentos:'Arroz:cereales', nota:'' }
];
_hoy = function () { return '2026-10-08'; };

let p = _generarComidasCole(false);
ok('sin aplicar solo informa', TABLAS['Comidas'].length === 0);
ok('y dice cuántas crearía', p.n === 2, p.n);

_generarComidasCole(true);
const gids = () => [...new Set(TABLAS['Comidas'].map(c => c.grupo_id))];
ok('crea las comidas que faltaban', gids().length === 2, gids().length);
ok('una fila por alimento, agrupadas por comida',
   TABLAS['Comidas'].length === 5, TABLAS['Comidas'].length);
ok('en el cole y a la hora de comer',
   TABLAS['Comidas'].every(c => c.lugar === 'cole' && c.tipo_comida === 'comida'));
ok('a la hora que dice Config',
   TABLAS['Comidas'].every(c => c.hora === '13:00'), TABLAS['Comidas'][0].hora);
ok('con el nombre del plato', TABLAS['Comidas'][0].nota === 'Ensalada de espirales y butifarra',
   TABLAS['Comidas'][0].nota);
ok('y su grupo, que es lo que cuenta',
   TABLAS['Comidas'].some(c => c.grupo === 'carnes_procesadas'));

/* Sin autor: esta comida no la apuntó ninguno de los dos, así que en la app
   la edita y la borra cualquiera (esMio devuelve true si no hay dueño). */
ok('sin dueño: la puede tocar cualquiera de los dos',
   TABLAS['Comidas'].every(c => c.creado_por === ''));

ok('el festivo no inventa una comida',
   !TABLAS['Comidas'].some(c => c.fecha === '2026-10-07'));
ok('y el futuro tampoco: solo hasta hoy',
   !TABLAS['Comidas'].some(c => c.fecha > '2026-10-08'),
   TABLAS['Comidas'].map(c => c.fecha).join(','));
ok('la marca avanza hasta hoy', _cfg('cole_generado_hasta') === '2026-10-08',
   _cfg('cole_generado_hasta'));

/* Lo que de verdad importa: no duplicar, y no resucitar lo borrado. */
_generarComidasCole(true);
ok('volver a arrancar no duplica nada', gids().length === 2, gids().length);

TABLAS['Comidas'] = TABLAS['Comidas'].filter(c => c.fecha !== '2026-10-06');
_generarComidasCole(true);
ok('una comida borrada a mano NO vuelve sola',
   !TABLAS['Comidas'].some(c => c.fecha === '2026-10-06'),
   TABLAS['Comidas'].map(c => c.fecha).join(','));

/* Si ya habíais apuntado vosotros esa comida, no se pisa. */
TABLAS['Comidas'] = [];
TABLAS['Config'] = TABLAS['Config'].map(c =>
  c.clave === 'cole_generado_hasta' ? { ...c, valor:'2026-10-04' } : c);
TABLAS['Comidas'].push({ id:'mio', grupo_id:'gmio', fecha:'2026-10-05', hora:'13:30',
  tipo_comida:'comida', lugar:'cole', alimento_id:'', nombre:'Lo que fuera',
  grupo:'verduras', estado_toma:'comio', creado_por:'papa' });
_generarComidasCole(true);
ok('lo que ya habíais apuntado no se pisa',
   TABLAS['Comidas'].filter(c => c.fecha === '2026-10-05').length === 1,
   TABLAS['Comidas'].filter(c => c.fecha === '2026-10-05').length);

/* Y el interruptor manda. */
TABLAS['Comidas'] = [];
TABLAS['Config'] = TABLAS['Config'].map(c =>
  c.clave === 'cole_automatico' ? { ...c, valor:'FALSE' }
  : c.clave === 'cole_generado_hasta' ? { ...c, valor:'2026-10-04' } : c);
_generarComidasCole(true);
ok('apagado en Config, no crea nada', TABLAS['Comidas'].length === 0);

console.log('\n--- REAJUSTAR LOS GRUPOS ---');
/* completarCatalogos solo AÑADE filas que faltan. Al meter `momentos`, las
   filas que ya estaban se quedaron con la columna creada y vacía — y vacío
   significa «vale en cualquier comida», así que la app seguía recomendando
   legumbres para merendar. La columna estaba; faltaba el dato. */
TABLAS['Objetivos_Semana'] = [
  { grupo:'cereales', nombre:'Cereales y pan', emoji:'🍞', objetivo:12, tipo:'min',
    peso:4, momentos:'', banda_baja:'', banda_alta:'', orden:9, activo:true },
  { grupo:'legumbres', nombre:'Legumbres', emoji:'🫘', objetivo:3, tipo:'min',
    peso:10, momentos:'', banda_baja:'', banda_alta:'', orden:3, activo:true },
  { grupo:'carnes_rojas', nombre:'Carne roja', emoji:'🥩', objetivo:1, tipo:'max',
    peso:4, momentos:'', banda_baja:'', banda_alta:'', orden:10, activo:true }
];
const og = () => TABLAS['Objetivos_Semana'];
const fila = g => og().filter(x => x.grupo === g)[0];

/* Primero, sin aplicar: no puede tocar nada. */
const antesJSON = JSON.stringify(og());
reajustarGrupos();
ok('sin parámetro solo informa, no escribe', JSON.stringify(og()) === antesJSON);

reajustarGrupos(true);
ok('rellena los momentos que estaban vacíos',
   fila('legumbres').momentos === 'comida,cena', fila('legumbres').momentos);
ok('«Cereales y pan» pasa a llamarse Hidratos',
   fila('cereales').nombre === 'Hidratos', fila('cereales').nombre);
ok('pero el id NO cambia: reescribir Comidas y Alimentos no compensa',
   fila('cereales').grupo === 'cereales');

/* Lo que se ajusta a mano no se pisa: son justo esas dos columnas. */
ok('respeta el objetivo que habías puesto tú', fila('cereales').objetivo === 12,
   fila('cereales').objetivo);
ok('y el peso', fila('legumbres').peso === 10, fila('legumbres').peso);

ok('añade los grupos nuevos de moderar',
   !!fila('bebidas_azucaradas') && !!fila('carnes_procesadas'),
   og().map(x => x.grupo).join(','));
ok('con sus bandas, no con cuota',
   _n(fila('bebidas_azucaradas').banda_baja) > 0 &&
   _n(fila('bebidas_azucaradas').banda_alta) > _n(fila('bebidas_azucaradas').banda_baja),
   fila('bebidas_azucaradas').banda_baja + '–' + fila('bebidas_azucaradas').banda_alta);
ok('los caprichos pasan a llamarse dulces y galletas',
   String(fila('capricho').nombre).toLowerCase().indexOf('dulces') === 0,
   fila('capricho').nombre);

/* La carne roja NO se renombra a procesada: son cosas distintas y un filete
   quedaría etiquetado como embutido. Se desactiva. */
ok('la carne roja se desactiva, no se renombra',
   !_truthy(fila('carnes_rojas').activo) && fila('carnes_rojas').nombre === 'Carne roja',
   fila('carnes_rojas').nombre + ' activo=' + fila('carnes_rojas').activo);
ok('y lo ya registrado como carne roja sigue existiendo', !!fila('carnes_rojas'));

/* Es idempotente: correrlo dos veces no cambia nada más. */
const trasUno = JSON.stringify(og());
reajustarGrupos(true);
ok('correrlo otra vez no cambia nada', JSON.stringify(og()) === trasUno);

console.log('\n--- RECURRENTES ---');
/* El cole: 180 € el día 1 de cada mes desde junio. Hoy es 19 de agosto en
   este test, así que tienen que existir junio, julio y agosto y ni uno más. */
TABLAS['Recurrentes'] = []; TABLAS['Gastos'] = []; TABLAS['Cuenta_Comun'] = [];
_hoy = function () { return '2026-08-19'; };

res = r(handleSaveRecurrente({ payload: {
  clase:'gasto', descripcion:'Cole', importe:'180', categoria:'cole',
  origen:'comun', dia_mes:1, desde:'2026-06-01', creado_por:'papa' } }));
ok('se crea la regla', res.ok === true, res.error);
const REC = res.data.id;
let gs = () => TABLAS['Gastos'].filter(g => g.recurrente_id === REC);
ok('fabrica los tres meses pasados', gs().length === 3,
   gs().map(g => g.fecha).join(' '));
ok('cada uno el día que toca',
   gs().map(g => g.fecha).sort().join(' ') === '2026-06-01 2026-07-01 2026-08-01',
   gs().map(g => g.fecha).sort().join(' '));
ok('con su importe', gs().every(g => g.importe === 180), gs().map(g => g.importe).join());
ok('y marcados con la regla que los hizo', gs().every(g => g.recurrente_id === REC));

/* Lo que de verdad importa: volver a arrancar NO duplica nada. */
_generarRecurrentes(true); _generarRecurrentes(true);
ok('arrancar otra vez no duplica', gs().length === 3, gs().length);

/* Septiembre aún no ha llegado. */
ok('no adelanta el mes que viene',
   !gs().some(g => g.fecha > '2026-08-19'), gs().map(g => g.fecha).join(' '));

/* Borrar un recibo que no se cobró NO lo resucita. */
TABLAS['Gastos'] = TABLAS['Gastos'].filter(g => g.fecha !== '2026-07-01');
_generarRecurrentes(true);
ok('un recibo borrado a mano no vuelve solo', gs().length === 2,
   gs().map(g => g.fecha).join(' '));

console.log('\n--- EL DÍA 31 EN FEBRERO ---');
ok('cae el 28, no se salta el mes', _fechaRecurrente('2026-02', 31) === '2026-02-28',
   _fechaRecurrente('2026-02', 31));
ok('y en enero sí es el 31', _fechaRecurrente('2026-01', 31) === '2026-01-31');
ok('el día 1 es el día 1', _fechaRecurrente('2026-02', 1) === '2026-02-01');
ok('un día imposible se acota', _fechaRecurrente('2026-03', 99) === '2026-03-31',
   _fechaRecurrente('2026-03', 99));

console.log('\n--- UN INGRESO RECURRENTE ---');
res = r(handleSaveRecurrente({ payload: {
  clase:'ingreso', descripcion:'Aporte mensual', importe:'300',
  username:'mama', dia_mes:5, desde:'2026-07-01', creado_por:'mama' } }));
const REC2 = res.data.id;
const movs = TABLAS['Cuenta_Comun'].filter(m => m.recurrente_id === REC2);
ok('va a la cuenta, no a gastos', movs.length === 2, movs.map(m => m.fecha).join(' '));
ok('como aporte', movs.every(m => m.tipo === 'aporte'));
ok('y a nombre de quien lo pone', movs.every(m => m.username === 'mama'));

console.log('\n--- APAGAR UNA REGLA ---');
handleDeleteRecurrente({ id:REC, _yo:'papa' });
_hoy = function () { return '2026-09-19'; };
_generarRecurrentes(true);
ok('apagada deja de fabricar', gs().length === 2, gs().map(g => g.fecha).join(' '));
ok('pero lo ya cobrado sigue ahí: esos gastos existieron', gs().length === 2);
ok('la regla no se borra, se desactiva',
   TABLAS['Recurrentes'].some(x => x.id === REC && !_truthy(x.activo)));

console.log('\n--- HASTA CUÁNDO ---');
TABLAS['Gastos'] = [];
res = r(handleSaveRecurrente({ payload: {
  clase:'gasto', descripcion:'Extraescolar', importe:'40', dia_mes:10,
  desde:'2026-06-01', hasta:'2026-07-31', creado_por:'papa' } }));
const REC3 = res.data.id;
const ex = TABLAS['Gastos'].filter(g => g.recurrente_id === REC3);
ok('no pasa de la fecha de fin', ex.length === 2, ex.map(g => g.fecha).join(' '));
ok('ni uno de agosto', !ex.some(g => g.fecha >= '2026-08-01'));

console.log('\n--- LO QUE NO SE GUARDA ---');
ok('sin nombre no se crea',
   r(handleSaveRecurrente({ payload:{ importe:'10' } })).ok === false);
ok('con importe cero tampoco',
   r(handleSaveRecurrente({ payload:{ descripcion:'X', importe:'0' } })).ok === false);
ok('la coma decimal se entiende',
   r(handleSaveRecurrente({ payload:{ descripcion:'Y', importe:'12,50',
     desde:'2026-09-01', dia_mes:28, creado_por:'papa' } })).data.importe === 12.5);

console.log('\n--- FECHAS PEGADAS A MANO ---');
/* El menú del cole se pegó desde el PDF con las fechas como "8/9/26". El
   filtro del bootstrap las pasaba por _fechaKey, que no entendía el año de dos
   cifras y caía a `new Date("8/9/26")` → 9 de AGOSTO. El menú estaba en el
   Sheet y quedaba fuera de la ventana, o casaba con el día equivocado. */
ok('"8/9/26" es el 8 de septiembre', _fechaKey('8/9/26') === '2026-09-08', _fechaKey('8/9/26'));
ok('no el 9 de agosto', _fechaKey('8/9/26') !== '2026-08-09');
ok('el día 14 sigue siendo día', _fechaKey('14/9/26') === '2026-09-14', _fechaKey('14/9/26'));
ok('con año largo, igual', _fechaKey('8/9/2026') === '2026-09-08');
ok('el ISO no se toca', _fechaKey('2026-09-08') === '2026-09-08');
ok('el ISO sin ceros se rellena', _fechaKey('2026-9-8') === '2026-09-08', _fechaKey('2026-9-8'));
ok('el front y el back leen la misma fecha igual',
   _fechaKey('8/9/26') === '2026-09-08');

console.log('\n--- CRECIMIENTO ---');
res = r(handleSaveCrecimiento({ payload:{
  fecha:'2026-08-19', peso_kg:'26,4', talla_cm:'128', creado_por:'papa' } }));
ok('se guarda una medición', res.ok === true, res.error);
const m = TABLAS['Crecimiento'][0];
ok('la coma decimal se guarda como 26.4, no como 0', m.peso_kg === 26.4, m.peso_kg);
ok('y la talla como número', m.talla_cm === 128, m.talla_cm);
ok('sin peso ni talla no se guarda nada',
   r(handleSaveCrecimiento({ payload:{ fecha:'2026-08-20', creado_por:'papa' } })).ok === false);
ok('solo con el peso sí vale: no siempre se mide todo',
   r(handleSaveCrecimiento({ payload:{ fecha:'2026-08-21', peso_kg:'27', creado_por:'papa' } })).ok === true);

console.log('\n--- DOCUMENTOS: LOS ARCHIVOS NO SON PÚBLICOS ---');
/* Hasta la 0.9.31 cada archivo subido se publicaba con ANYONE_WITH_LINK
   «porque el enlace solo viaja dentro de la app». Eso es falso en cuanto
   alguien reenvía un mensaje, y son informes médicos de una niña. */
TABLAS['Config'] = [{ clave:'carpeta_drive_id', valor:'CARPETA', nota:'' }];
TABLAS['Documentos'] = [];
const compartidos = [];
function ficheroFalso(id, padreId, bytes, mime){
  return {
    _id:id, getId:()=>id, getName:()=>id+'.jpg', getSize:()=>(bytes||1000),
    getUrl:()=>'https://drive.google.com/file/d/'+id+'/view',
    getParents:()=>{ let n = padreId ? 1 : 0;
      return { hasNext:()=>n>0, next:()=>{ n--; return { getId:()=>padreId }; } }; },
    getBlob:()=>({ getContentType:()=>(mime||'image/jpeg'),
                   getBytes:()=>toSigned(Buffer.from('BYTES')) }),
    setSharing:(a,b)=>{ compartidos.push(id+':'+a); },
    setTrashed:()=>{}
  };
}
const EN_DRIVE = {};
global.DriveApp = {
  Access: { ANYONE:'ANYONE', ANYONE_WITH_LINK:'ANYONE_WITH_LINK', PRIVATE:'PRIVATE' },
  Permission: { VIEW:'VIEW', NONE:'NONE' },
  getFileById: id => { if(!EN_DRIVE[id]) throw new Error('no existe'); return EN_DRIVE[id]; },
  getFolderById: id => {
    if(id !== 'CARPETA') throw new Error('no existe');
    return { getId:()=>'CARPETA', getName:()=>'GINapp · documentos',
             getUrl:()=>'https://drive/CARPETA',
             createFile: blob => { const f = ficheroFalso('NUEVO', 'CARPETA');
                                   EN_DRIVE['NUEVO'] = f; return f; },
             getFiles: () => { const ks = Object.keys(EN_DRIVE); let i = 0;
                               return { hasNext:()=>i<ks.length, next:()=>EN_DRIVE[ks[i++]] }; },
             addEditor: ()=>{} };
  }
};
res = r(handleSubirDocumento({ payload:{
  archivo:'data:image/jpeg;base64,RkFLRQ==', mime:'image/jpeg',
  titulo:'Informe de la revisión', tipo:'informe', fecha:'2026-08-15',
  creado_por:'papa' } }));
ok('se sube y se crea la ficha', res.ok === true, res.error);
ok('con su título y su tipo',
   TABLAS['Documentos'][0].titulo === 'Informe de la revisión' &&
   TABLAS['Documentos'][0].tipo === 'informe');
ok('guardando el id de Drive, que es por donde se lee después',
   TABLAS['Documentos'][0].file_id === 'NUEVO', TABLAS['Documentos'][0].file_id);
ok('y NADIE lo pone con enlace público', compartidos.length === 0, compartidos.join(','));

console.log('\n--- VER UN DOCUMENTO ---');
res = r(handleVerDocumento({ id:'NUEVO' }));
ok('devuelve los bytes para verlo dentro de la app', res.ok === true, res.error);
ok('con su tipo, para saber si es foto o PDF', res.data.mime === 'image/jpeg', res.data.mime);
ok('en base64', typeof res.data.b64 === 'string' && res.data.b64.length > 0);

/* Sin esta comprobación, cualquiera con un token válido podría pedir un
   id cualquiera y leerse el Drive ENTERO de la cuenta que publica el
   script: facturas, contratos, lo que haya. */
EN_DRIVE['AJENO'] = ficheroFalso('AJENO', 'OTRA_CARPETA');
res = r(handleVerDocumento({ id:'AJENO' }));
ok('un archivo que no está en la carpeta de la app NO se sirve', res.ok === false);
ok('y se dice por qué, sin filtrar si existe o no',
   /no es de GINapp/i.test(String(res.error)), res.error);
EN_DRIVE['HUERFANO'] = ficheroFalso('HUERFANO', '');
ok('uno sin carpeta tampoco', r(handleVerDocumento({ id:'HUERFANO' })).ok === false);
ok('un id que no existe da error claro, no una excepción',
   /ya no está/i.test(String(r(handleVerDocumento({ id:'FANTASMA' })).error)));
ok('sin id, tampoco', r(handleVerDocumento({})).ok === false);

/* 20 MB es donde Apps Script se queda sin memoria montando el base64 y
   devuelve una excepción que no entiende nadie. Mejor decirlo. */
EN_DRIVE['GORDO'] = ficheroFalso('GORDO', 'CARPETA', 30*1024*1024);
res = r(handleVerDocumento({ id:'GORDO' }));
ok('un archivo enorme se rechaza con un mensaje, no con una excepción',
   res.ok === false && /Drive/.test(String(res.error)), res.error);

console.log('\n--- LOS QUE YA ESTABAN SUBIDOS ---');
/* Cambiar el código no cierra lo que ya está abierto: esos enlaces siguen
   vivos hasta que alguien los cierra a mano. */
EN_DRIVE['VIEJO'] = ficheroFalso('VIEJO', 'CARPETA');
EN_DRIVE['VIEJO'].getSharingAccess = () => 'ANYONE_WITH_LINK';
EN_DRIVE['NUEVO'].getSharingAccess = () => 'PRIVATE';
compartidos.length = 0;
cerrarEnlacesPublicos();
ok('por defecto solo informa, no toca nada', compartidos.length === 0);
cerrarEnlacesPublicos(true);
ok('con true cierra el que estaba abierto',
   compartidos.indexOf('VIEJO:PRIVATE') >= 0, compartidos.join(','));
ok('y no toca el que ya era privado',
   compartidos.indexOf('NUEVO:PRIVATE') < 0, compartidos.join(','));

console.log('\n--- COMPARTIR LA CARPETA NO PUEDE TUMBAR LA TANDA ---');
/* Pasó de verdad: addEditor lanzó «Acceso denegado: DriveApp» y se llevó
   por delante el cerrarEnlacesPublicos() que iba detrás — justo lo único
   de la tanda que protegía algo. */
let dioError = false;
global.DriveApp.getFolderById = id => ({
  getId:()=>'CARPETA', getName:()=>'GINapp · documentos',
  getUrl:()=>'https://drive/CARPETA',
  addEditor:()=>{ throw new Error('Exception: Acceso denegado: DriveApp.'); }
});
try { compartirCarpeta('alguien@gmail.com'); } catch (e) { dioError = true; }
ok('si Drive no deja compartir, no se lanza la excepción hacia arriba', !dioError);

console.log('\n--- 0 COMIDAS DEL COLE: POR QUÉ ---');
/* «0 comidas creadas» a secas deja adivinando entre tres causas que se
   arreglan de forma distinta: el menú sin pegar, los días ya apuntados,
   o la columna `alimentos` vacía. */
ok('sin Menu_Cole se dice que está vacía',
   /Menu_Cole está vacía/.test(_porQueNoCole({ menus:0, dias:5, saltadas:{} })));
ok('si ya estaban apuntadas, se dice que no hay nada que hacer',
   /ya tenían/.test(_porQueNoCole({ menus:20, dias:5,
     saltadas:{ sinMenu:0, ocupadas:5, sinAlimentos:0 } })));
ok('si el menú está pero sin alimentos, se señala esa columna',
   /alimentos. vac/.test(_porQueNoCole({ menus:20, dias:5,
     saltadas:{ sinMenu:0, ocupadas:0, sinAlimentos:5 } })));
/* La trampa real: el menú está pegado pero con las fechas al revés
   (8/9/26 leído como 9 de agosto), así que ningún día casa. */
ok('si hay menú pero ningún día casa, se apunta al formato de fecha',
   /d.a\/mes/.test(_porQueNoCole({ menus:20, dias:5,
     saltadas:{ sinMenu:5, ocupadas:0, sinAlimentos:0 } })));

console.log('\n--- EL SIMULACRO TIENE QUE SIMULAR LO QUE DICE ---');
/* rellenarColeDesde("2026-10-01") sin `true` decía «desde esa fecha se
   crearían las que falten», pero contaba desde la MARCA real. Con la
   marca ya en hoy contestaba «nada que hacer» aunque octubre estuviera
   entero sin rellenar: el informe negaba el problema que iba a buscar. */
TABLAS['Comidas'] = [];
TABLAS['Config'] = [
  { clave:'cole_automatico', valor:'TRUE', nota:'' },
  { clave:'cole_hora', valor:'13:00', nota:'' },
  /* La marca, adelantada hasta hoy: el caso real. */
  { clave:'cole_generado_hasta', valor:_hoy(), nota:'' }
];
TABLAS['Menu_Cole'] = [
  { fecha:_addDays(_hoy(), -5), plato:'Lentejas',
    alimentos:'Lentejas:legumbres, Zanahoria:verduras', nota:'' },
  { fecha:_addDays(_hoy(), -4), plato:'Merluza al horno',
    alimentos:'Merluza:pescado, Patata:cereales', nota:'' }
];
ok('con la marca en hoy, el generador normal no ve nada',
   _generarComidasCole(false).n === 0);
const sim = _generarComidasCole(false, _addDays(_hoy(), -6));
ok('pero simulando desde antes sí ve los dos días', sim.n === 2, sim.n);
ok('y no ha tocado la marca', _cfg('cole_generado_hasta', '') === _hoy());
ok('ni ha creado nada', TABLAS['Comidas'].length === 0, TABLAS['Comidas'].length);

/* Y el apagado también se explica, en vez de devolver 0 en silencio. */
TABLAS['Config'] = [{ clave:'cole_automatico', valor:'FALSE', nota:'' }];
ok('si está apagado se dice, no se devuelve 0 a secas',
   /cole_automatico/.test(_porQueNoCole(_generarComidasCole(false))));

console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
process.exit(fallos ? 1 : 0);
