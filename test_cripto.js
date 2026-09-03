/* Comprueba _cifra/_descifra fuera de Apps Script, imitando Utilities con
   crypto de Node. Lo que se prueba es la CONSTRUCCIÓN, no la librería. */
const crypto = require('crypto');
const fs = require('fs');
let props = {};
global.PropertiesService = { getScriptProperties: () => ({
  getProperty: k => props[k] || null, setProperty: (k,v) => { props[k]=v; } }) };
function toSigned(buf){ return Array.from(buf).map(b => b>127 ? b-256 : b); }
global.Utilities = {
  getUuid: () => crypto.randomUUID(),
  computeHmacSha256Signature: (msg, key) =>
    toSigned(crypto.createHmac('sha256', Buffer.from(String(key),'utf8'))
      .update(Buffer.from(String(msg),'utf8')).digest()),
  base64Encode: a => Buffer.from(Uint8Array.from(a.map(b=>b<0?b+256:b))).toString('base64'),
  base64Decode: s => toSigned(Buffer.from(s,'base64')),
  base64EncodeWebSafe: a => (typeof a === 'string'
      ? Buffer.from(a,'utf8') : Buffer.from(Uint8Array.from(a.map(b=>b<0?b+256:b))))
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
  base64DecodeWebSafe: s => toSigned(Buffer.from(String(s).replace(/-/g,'+').replace(/_/g,'/'),'base64')),
  newBlob: x => (typeof x === 'string'
    ? { getBytes: () => toSigned(Buffer.from(x,'utf8')),
        getDataAsString: () => x }
    : { getBytes: () => x,
        getDataAsString: () => Buffer.from(Uint8Array.from(x.map(b=>b<0?b+256:b))).toString('utf8') })
};
global.SpreadsheetApp = { openById: () => ({}) };
global.SS = {};
const src = fs.readFileSync(require('path').join(__dirname,'Code.gs'),'utf8');
/* Solo las funciones del bloque de cifrado */
const bloque = src.slice(src.indexOf('function _claveSecretos'),
                         src.indexOf('function _ginaPublica'));
eval(bloque);

let fallos = 0;
function ok(t,c,e){ if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t+(e!==undefined?'  → '+e:'')); fallos++; } }

console.log('\n--- IDA Y VUELTA ---');
['Clave.2026!', 'x', 'contraseña con ñ y acentós €', 'a'.repeat(500),
 'con "comillas" y \\barras\\ y | tuberías'].forEach(function(t){
  const c = _cifra(t);
  ok('«'+t.slice(0,28)+(t.length>28?'…':'')+'» vuelve igual', _descifra(c) === t,
     JSON.stringify(_descifra(c)).slice(0,60));
});
ok('vacío es vacío, no un churro', _cifra('') === '' && _descifra('') === '');

console.log('\n--- NO SE LEE ABRIENDO EL SHEET ---');
const c1 = _cifra('Clave.2026!');
ok('lo guardado no contiene el texto', c1.indexOf('Clave') < 0, c1.slice(0,40));
ok('lleva marca de versión', c1.indexOf('g1.') === 0);
const c2 = _cifra('Clave.2026!');
ok('la MISMA contraseña dos veces da churros distintos', c1 !== c2);
ok('y las dos se leen igual', _descifra(c1) === _descifra(c2));

console.log('\n--- SI SE MANIPULA, SE NOTA ---');
const p = c1.split('.');
const roto = ['g1', p[1], Buffer.from('otracosa').toString('base64'), p[3]].join('.');
ok('un cifrado editado a mano devuelve null, no basura', _descifra(roto) === null);
ok('una firma cambiada también',
   _descifra([p[0],p[1],p[2],'XXXX'].join('.')) === null);

console.log('\n--- COMPATIBILIDAD ---');
ok('lo escrito a mano en el Sheet sin cifrar se devuelve tal cual',
   _descifra('1234') === '1234');

console.log('\n--- LA CLAVE ---');
ok('se genera sola la primera vez', !!props.GINAPP_CRYPTO_KEY);
ok('y es larga', String(props.GINAPP_CRYPTO_KEY).length >= 100,
   String(props.GINAPP_CRYPTO_KEY).length);
const antes = props.GINAPP_CRYPTO_KEY;
_cifra('otra');
ok('no cambia en cada uso', props.GINAPP_CRYPTO_KEY === antes);

console.log('\n' + (fallos ? ('❌ '+fallos+' fallos') : '✅ TODOS LOS TESTS PASAN'));
process.exit(fallos ? 1 : 0);
