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
const FAKE_SS = {
  getId: () => 'fake', getSpreadsheetTimeZone: () => 'Europe/Madrid',
  getSheetByName: () => null, insertSheet: () => null, getSheets: () => []
};
global.DriveApp = { getFileById: () => { throw new Error('sin Drive'); } };
global.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) };
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
_invalidar = function () {};
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

console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
process.exit(fallos ? 1 : 0);
