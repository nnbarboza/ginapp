/* ============================================================
   test_acceso.js — la capa de acceso, por los dos lados.

   PARTE A (backend, Code.gs evaluado con Google stubbeado):
     el token se firma, caduca y no se puede falsificar; el veto de
     propiedad decide antes de que el handler toque nada.
   PARTE B (frontend, jsdom):
     sin token no hay app; con PIN se pide PIN; lo ajeno se ve pero
     no se edita; un 'auth' del backend devuelve al login.
   ============================================================ */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { JSDOM } = require('jsdom');

let fallos = 0;
function ok(t, c, extra){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (extra!==undefined ? '  → '+extra : '')); fallos++; }
}

/* ============================================================
   PARTE A · BACKEND
   ============================================================ */
console.log('\n══ BACKEND ══');

/* --- Google stubbeado: lo justo para que Code.gs cargue y responda --- */
const HOJAS = {
  Usuarios: [
    { username:'papa', nombre:'Papá', color:'#2878D4', emoji:'👨', rol:'padre', pin:'1234', activo:true },
    { username:'mama', nombre:'Mamá', color:'#E4575B', emoji:'👩', rol:'madre', pin:'5678', activo:true }
  ],
  Eventos: [
    { id:'e1', titulo:'Logopedia', creado_por:'papa' },
    { id:'e2', titulo:'Natación',  creado_por:'mama' },
    { id:'e3', titulo:'Sin dueño', creado_por:'' }
  ],
  Comidas: [ { id:'c9', grupo_id:'g1', creado_por:'mama' } ],
  Salud_Dosis: [ { id:'d1', dado_por:'mama' } ],
  Mensajes: [],
  Gastos: []
};

const PROPS = {};
const ctx = {
  console,
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => (k in PROPS ? PROPS[k] : null),
    setProperty: (k, v) => { PROPS[k] = String(v); }
  })},
  Utilities: {
    formatDate: (d, tz, f) => new Date(d).toISOString().slice(0,10),
    computeHmacSha256Signature: (txt, key) =>
      Array.from(crypto.createHmac('sha256', key).update(String(txt)).digest()),
    base64EncodeWebSafe: bytes =>
      Buffer.from(bytes).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'),
    getUuid: () => 'uuid-' + Object.keys(PROPS).length
  },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSpreadsheetTimeZone: () => 'Europe/Madrid'
  })},
  ContentService: {
    createTextOutput: t => ({ setMimeType: () => ({ _t: t }) }),
    MimeType: { JSON:'json' }
  },
  Session: { getScriptTimeZone: () => 'Europe/Madrid' },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) }
};
ctx.globalThis = ctx;

const src = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
require('vm').createContext(ctx);
require('vm').runInContext(src, ctx);

/* _readSheet se sustituye por las hojas de mentira */
ctx._readSheet = t => (HOJAS[t] || []).map(r => Object.assign({}, r));
/* las const de nivel superior no cuelgan del global del vm: se leen por evaluación */
const G = expr => require('vm').runInContext(expr, ctx);

console.log('\n--- EL TOKEN ---');
const tk = ctx._crearToken('papa');
ok('se emite con tres piezas', tk.split('.').length === 3, tk);
ok('y vale', ctx._tokenUsuario(tk) === 'papa', ctx._tokenUsuario(tk));

const [u, exp, firma] = tk.split('.');
ok('cambiar el usuario lo invalida', ctx._tokenUsuario('mama.'+exp+'.'+firma) === '');
ok('cambiar la firma lo invalida', ctx._tokenUsuario(u+'.'+exp+'.xxxx') === '');
ok('alargarse la caducidad lo invalida',
   ctx._tokenUsuario(u + '.' + (Number(exp)+1000) + '.' + firma) === '');
ok('un token caducado no vale',
   ctx._tokenUsuario(ctx._firmar('papa.1000') ? 'papa.1000.' + ctx._firmar('papa.1000') : '') === '');
ok('y basura tampoco', ctx._tokenUsuario('cualquier-cosa') === '' && ctx._tokenUsuario('') === '');

console.log('\n--- EL LOGIN ---');
ok('hay PINs puestos → modo pin', ctx._hayPines() === true);
let r = JSON.parse(ctx.handleLogin({ username:'papa', pin:'1234' })._t);
ok('el PIN bueno entra', r.ok === true && !!r.data.token, JSON.stringify(r).slice(0,90));
ok('devuelve el nombre', r.ok && r.data.nombre === 'Papá');
ok('y el token es de papá', ctx._tokenUsuario(r.data.token) === 'papa');

r = JSON.parse(ctx.handleLogin({ username:'papa', pin:'9999' })._t);
ok('el PIN malo no entra', r.ok === false, JSON.stringify(r));
ok('sin PIN tampoco', JSON.parse(ctx.handleLogin({ username:'papa', pin:'' })._t).ok === false);
ok('ni un usuario inventado',
   JSON.parse(ctx.handleLogin({ username:'abuela', pin:'1234' })._t).ok === false);

console.log('\n--- EL VETO DE PROPIEDAD ---');
const veto = (a, p, yo) => ctx._compruebaDueno(a, p, yo);
ok('papá puede editar lo suyo', veto('saveEvento', { payload:{ id:'e1' } }, 'papa') === '');
ok('papá NO puede editar lo de mamá', veto('saveEvento', { payload:{ id:'e2' } }, 'papa') !== '');
ok('y se explica sin tecnicismos',
   veto('saveEvento', { payload:{ id:'e2' } }, 'papa').indexOf('no cambiarlo') > 0,
   veto('saveEvento', { payload:{ id:'e2' } }, 'papa'));
ok('mamá sí puede editar lo suyo', veto('saveEvento', { payload:{ id:'e2' } }, 'mama') === '');
ok('tampoco puede borrarlo', veto('deleteEvento', { id:'e2' }, 'papa') !== '');
ok('un alta nueva (sin id) pasa siempre', veto('saveEvento', { payload:{ titulo:'x' } }, 'papa') === '');
ok('un id que no existe pasa (lo dirá el handler)',
   veto('saveEvento', { payload:{ id:'zzz' } }, 'papa') === '');
ok('lo viejo sin dueño se deja tocar', veto('saveEvento', { payload:{ id:'e3' } }, 'papa') === '');
ok('las comidas se juzgan por grupo_id, no por id',
   veto('saveComida', { payload:{ grupo_id:'g1' } }, 'papa') !== '');
ok('las dosis, por quién la dio', veto('deleteDosis', { id:'d1' }, 'papa') !== '');
ok('una acción sin dueño declarado no se veta',
   veto('saveConfig', { payload:{ id:'x' } }, 'papa') === '');
ok('el payload también llega como texto JSON',
   veto('saveEvento', { payload: JSON.stringify({ id:'e2' }) }, 'papa') !== '');

console.log('\n--- EL DESPACHADOR ---');
r = JSON.parse(ctx._despachar({ action:'saveEvento', payload:{ titulo:'x' } })._t);
ok('una escritura sin token se rechaza', r.ok === false && r.code === 'auth', JSON.stringify(r));
r = JSON.parse(ctx._despachar({ action:'saveEvento', token:'papa.9'.repeat(3), payload:{} })._t);
ok('con token falso, igual', r.ok === false && r.code === 'auth');
r = JSON.parse(ctx._despachar({ action:'saveEvento', token:tk, payload:{ id:'e2' } })._t);
ok('con token bueno pero registro ajeno → veto', r.ok === false && r.code === 'ajeno', JSON.stringify(r));
ok('las lecturas no piden token',
   G("MUTACIONES['getBootstrap']") === undefined && G("MUTACIONES['login']") === undefined);
ok('pero toda escritura sí',
   ['saveEvento','deleteEvento','saveGasto','saveMensaje','saveComida','saveDosis']
     .every(a => !!G("MUTACIONES['"+a+"']")));

/* La prueba anterior llama a _despachar a mano. Eso NO demuestra nada
   sobre el backend real: lo que se despliega son doGet y doPost, y una
   de las dos puede rutear por su cuenta y saltarse el control entero.
   Aquí se entra por la puerta, como entra el navegador. */
console.log('\n--- POR LA PUERTA DE VERDAD (doGet / doPost) ---');
const GET  = p => JSON.parse(ctx.doGet({ parameter:p })._t);
const POST = b => JSON.parse(ctx.doPost({ parameter:{},
  postData:{ contents: JSON.stringify(b) } })._t);

/* Esto ANTES pasaba, y era el agujero: el /exec vive en un index.html
   de un repo público, así que "leer es libre" significaba que cualquiera
   que mirase el repo podía bajarse la base entera con una petición. */
r = GET({ action:'getBootstrap' });
ok('LEER el bootstrap sin token ya NO se puede', r.ok === false && r.code === 'auth',
   JSON.stringify(r));
ok('con token sí', GET({ action:'getBootstrap', token:tk }).ok === true);
ok('doGet conoce login', GET({ action:'login', username:'papa', pin:'1234' }).ok === true,
   JSON.stringify(GET({ action:'login', username:'papa', pin:'1234' })));

console.log('\n--- LO ÚNICO ABIERTO: LA PANTALLA DE ENTRADA ---');
r = GET({ action:'getLogin' });
ok('getLogin responde sin token', r.ok === true, JSON.stringify(r).slice(0,90));
ok('dice quién puede entrar', r.data.usuarios.length === 2, r.data.usuarios.length);
ok('con su nombre y color, para pintar la pantalla',
   r.data.usuarios.every(u => u.nombre && u.color !== undefined));
ok('SIN el PIN', r.data.usuarios.every(u => u.pin === undefined),
   JSON.stringify(r.data.usuarios[0]));
ok('y sin un solo dato de Gina',
   ['eventos','comidas','citas','gastos','custodia','episodios','documentos']
     .every(k => r.data[k] === undefined), Object.keys(r.data).join(','));
ok('los avis y la hija no salen: no entran en la app',
   !r.data.usuarios.some(u => u.username === 'avis' || u.username === 'gina'));

console.log('\n--- FUERZA BRUTA DEL PIN ---');
/* 4 cifras son 10.000 combinaciones: sin límite, un script las prueba
   en minutos y el PIN no protege nada. */
{
  const cache = {};
  ctx.CacheService = { getScriptCache: () => ({
    get: k => (k in cache ? cache[k] : null),
    put: (k, v) => { cache[k] = v; },
    remove: k => { delete cache[k]; }
  })};
  let ult;
  for(let i = 0; i < 5; i++) ult = JSON.parse(ctx.handleLogin({ username:'mama', pin:'0000' })._t);
  ok('los primeros fallos solo dicen que el PIN es incorrecto',
     ult.ok === false && ult.code !== 'bloqueado', JSON.stringify(ult));
  ult = JSON.parse(ctx.handleLogin({ username:'mama', pin:'0000' })._t);
  ok('al sexto se bloquea', ult.code === 'bloqueado', JSON.stringify(ult));
  ult = JSON.parse(ctx.handleLogin({ username:'mama', pin:'5678' })._t);
  ok('y ni con el PIN bueno se entra mientras dura el bloqueo',
     ult.ok === false && ult.code === 'bloqueado', JSON.stringify(ult));
  ok('pero el otro perfil no queda bloqueado de rebote',
     JSON.parse(ctx.handleLogin({ username:'papa', pin:'1234' })._t).ok === true);
  ok('un usuario inventado no revela que no existe',
     JSON.parse(ctx.handleLogin({ username:'abuela', pin:'1' })._t).error
       .indexOf('no existe') < 0);
}
r = GET({ action:'saveEvento', payload:JSON.stringify({ titulo:'x' }) });
ok('doGet exige token para escribir', r.ok === false && r.code === 'auth', JSON.stringify(r));

r = POST({ action:'saveEvento', payload:{ titulo:'x' } });
ok('doPost TAMBIÉN exige token', r.ok === false && r.code === 'auth', JSON.stringify(r));
r = POST({ action:'saveEvento', token:'papa.9999999999999.falsa', payload:{ titulo:'x' } });
ok('doPost rechaza un token falso', r.ok === false && r.code === 'auth', JSON.stringify(r));
r = POST({ action:'saveEvento', token:tk, payload:{ id:'e2', titulo:'robado' } });
ok('doPost aplica el veto de propiedad', r.ok === false && r.code === 'ajeno', JSON.stringify(r));
r = POST({ action:'deleteEvento', token:tk, id:'e2' });
ok('y también al borrar', r.ok === false && r.code === 'ajeno', JSON.stringify(r));
ok('doPost y doGet comparten puerta',
   String(ctx.doPost).indexOf('_despachar') > 0 && String(ctx.doGet).indexOf('_despachar') > 0);

console.log('\n--- LOS MENSAJES NO SE TOCAN ---');
ok('no existe deleteMensaje', typeof ctx.handleDeleteMensaje === 'undefined' &&
   G("HANDLERS['deleteMensaje']") === undefined);
r = JSON.parse(ctx.handleSaveMensaje({ payload:{ id:'m1', texto:'editado' } })._t);
ok('y editar uno se rechaza', r.ok === false, JSON.stringify(r));

console.log('\n--- EL BOOTSTRAP NO FILTRA PINS ---');
const boot = JSON.parse(ctx.handleGetBootstrap({})._t);
ok('responde', boot.ok === true, JSON.stringify(boot).slice(0,120));
if(boot.ok){
  ok('ningún usuario lleva su pin',
     boot.data.usuarios.every(x => x.pin === undefined),
     JSON.stringify(boot.data.usuarios[0]));
  ok('pero sí dice quién tiene uno', boot.data.usuarios.every(x => x.tiene_pin === true));
  ok('y en qué modo está la app', boot.data.modo === 'pin', boot.data.modo);
}

/* ============================================================
   PARTE B · FRONTEND
   ============================================================ */
console.log('\n══ FRONTEND ══');

const HOY = '2026-08-19';
function bootData(modo){
  return { ok:true, data:{
    version:'0.8.0', hoy:HOY, modo:modo,
    config:{ nombre_hija:'Georgina', nombre_corto:'Gina', moneda:'€', dias_min_ich:'3' },
    usuarios:[
      { username:'papa', nombre:'Papá', color:'#2878D4', emoji:'👨', rol:'padre',
        activo:true, tiene_pin: modo==='pin' },
      { username:'mama', nombre:'Mamá', color:'#E4575B', emoji:'👩', rol:'madre',
        activo:true, tiene_pin: modo==='pin' }
    ],
    patron:[], custodia:[{ fecha:HOY, username:'papa', origen:'convenio' }],
    eventos:[
      { id:'e1', fecha:HOY, hora:'17:00', titulo:'Logopedia', tipo:'actividad_cole',
        repite:'no', creado_por:'papa' },
      { id:'e2', fecha:HOY, hora:'18:30', titulo:'Natación', tipo:'actividad_cole',
        lugar:'Piscina', repite:'no', creado_por:'mama' }
    ],
    eventos_excepciones:[], tipos_evento:[
      { id:'actividad_cole', nombre:'Actividad cole', emoji:'🎨', color:'#7C5CD6' }],
    gastos:[
      { id:'g1', fecha:HOY, categoria:'ropa', descripcion:'Abrigo', importe:60,
        origen:'papa', compartido:true, creado_por:'papa' },
      { id:'g2', fecha:HOY, categoria:'ropa', descripcion:'Botas', importe:40,
        origen:'mama', compartido:true, creado_por:'mama' }
    ],
    cuenta:[], liquidaciones:[], categorias_gasto:[],
    alimentos:[], comidas:[], objetivos_semana:[],
    citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
    documentos:[], mensajes:[],
    actividad:[
      { id:'a1', timestamp:'2026-08-18T19:22:00.000Z', username:'mama', seccion:'gastos',
        accion:'crea_gasto', detalle:'Botas · 40 €' },
      { id:'a2', timestamp:'2026-08-18T20:10:00.000Z', username:'mama', seccion:'calendario',
        accion:'crea_evento', detalle:'Natación' }
    ],
    visitas:[{ username:'papa', seccion:'inicio', ts:'2026-08-18T08:00:00.000Z' }]
  }};
}

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

/** Levanta la app. sesion=null → sin token. modo → 'pin' | 'confianza'. */
function abrir(modo, sesion, extra){
  const posts = [];
  const dom = new JSDOM(HTML, {
    runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
    beforeParse(w){
      w.fetch = (url, o) => {
        if(o && o.method === 'POST'){
          const body = JSON.parse(o.body); posts.push(body);
          if(extra && extra.rechazaEscrituras)
            return Promise.resolve({ json:()=>Promise.resolve(
              { ok:false, error:'Sesión caducada. Vuelve a entrar.', code:'auth' }) });
          return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ id:'x' } }) });
        }
        const q = new URL(String(url), 'https://x/').searchParams;
        const acc = q.get('action') || '';
        if(acc && acc !== 'getBootstrap')
          posts.push({ action:acc, via:'GET', token:q.get('token')||'',
                       payload:{ seccion:q.get('seccion'), username:q.get('username') } });
        if(acc === 'login'){
          const n = q.get('username'), p = q.get('pin') || '';
          const pines = { papa:'1234', mama:'5678' };
          if(modo === 'pin' && p !== pines[n])
            return Promise.resolve({ json:()=>Promise.resolve(
              { ok:false, error:'PIN incorrecto.' }) });
          return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{
            token:n+'.9999999999999.x', username:n,
            nombre:n==='mama'?'Mamá':'Papá', modo:modo } }) });
        }
        return Promise.resolve({ json:()=>Promise.resolve(bootData(modo)) });
      };
      w.scrollTo = ()=>{}; w.alert = ()=>{}; w.prompt = ()=>null;
      Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
      if(sesion){
        w.localStorage.setItem('ginapp_user', sesion);
        w.localStorage.setItem('ginapp_token', sesion+'.9999999999999.x');
      }
    }});
  return { dom, posts, w: dom.window, d: dom.window.document,
           click(el){ el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); } };
}

const espera = ms => new Promise(r => setTimeout(r, ms));

(async function(){

  /* ---------- 1. sin sesión ---------- */
  console.log('\n--- SIN SESIÓN ---');
  {
    const A = abrir('pin', null);
    await espera(700);
    ok('sale la pantalla de entrada', !A.d.querySelector('#login').hidden);
    ok('preguntando quién eres', A.d.querySelector('#login').textContent.indexOf('¿Quién eres?') >= 0);
    ok('con los dos perfiles', A.d.querySelectorAll('[data-lguser]').length === 2);
    ok('y sin teclado hasta elegir', !A.d.querySelector('.tecla-g'));

    A.click(A.d.querySelector('[data-lguser="papa"]'));
    await espera(60);
    ok('al elegir papá pide su PIN',
       A.d.querySelector('#login').textContent.indexOf('Hola, Papá') >= 0);
    ok('con teclado de 4 cifras', !!A.d.querySelector('.tecla-g') &&
       A.d.querySelectorAll('.pin-p i').length === 4);

    const marca = n => String(n).split('').forEach(x =>
      A.click(A.d.querySelector('[data-tecla="'+x+'"]')));

    marca('9999');
    await espera(200);
    ok('el PIN malo no entra', !A.d.querySelector('#login').hidden);
    ok('y lo dice', A.d.querySelector('#login .err').textContent.length > 0,
       A.d.querySelector('#login .err').textContent);
    ok('sin guardar ninguna sesión', !A.w.localStorage.getItem('ginapp_token'));

    await espera(1500);
    marca('1234');
    await espera(300);
    ok('el PIN bueno sí entra', !!A.w.localStorage.getItem('ginapp_token'),
       A.w.localStorage.getItem('ginapp_token'));
    ok('y la app queda a la vista', A.d.querySelector('#login').classList.contains('out'));
    A.dom.window.close();
  }

  /* ---------- 2. modo confianza ---------- */
  console.log('\n--- SIN NINGÚN PIN PUESTO (modo confianza) ---');
  {
    const B = abrir('confianza', null);
    await espera(700);
    ok('avisa de que así entra cualquiera',
       B.d.querySelector('#login').textContent.indexOf('cualquiera que abra') >= 0);
    B.click(B.d.querySelector('[data-lguser="mama"]'));
    await espera(250);
    ok('y entra directo, sin teclado', B.d.querySelector('#login').classList.contains('out'));
    ok('como mamá', B.w.state.user === 'mama', B.w.state.user);
    B.dom.window.close();
  }

  /* ---------- 3. lo ajeno se ve, no se toca ---------- */
  console.log('\n--- TODO SE VE, NADIE EDITA LO AJENO ---');
  {
    const C = abrir('pin', 'papa');
    await espera(700);
    const w = C.w, d = C.d;
    const hoja = () => (d.querySelector('#hojaC').textContent || '').replace(/\s+/g,' ');

    w.formEvento('e2');
    ok('el evento de mamá se abre en solo lectura', !d.querySelector('#evGuardar'));
    ok('pero se lee entero', hoja().indexOf('Natación') >= 0 && hoja().indexOf('Piscina') >= 0, hoja());
    ok('y se dice quién lo apuntó', hoja().indexOf('Lo registró mamá') >= 0);
    ok('sin ofrecer borrarlo', !d.querySelector('#evBorrar'));

    w.cerrarHoja();
    w.formEvento('e1');
    ok('lo mío sí se edita', !!d.querySelector('#evGuardar'));
    ok('y se borra', !!d.querySelector('#evBorrar'));

    w.cerrarHoja();
    w.formGasto('g2');
    ok('el gasto de mamá también es de solo lectura', !d.querySelector('#gasGuardar'),
       hoja().slice(0,60));
    ok('con su importe a la vista', hoja().indexOf('40,00') >= 0, hoja());

    w.cerrarHoja();
    w.formGasto('g1');
    ok('el mío se edita', !!d.querySelector('#gasGuardar'));

    ok('pero la cuenta la ven igual los dos: nada se oculta',
       w.state.data.gastos.length === 2);
    C.dom.window.close();
  }

  /* ---------- 4. avisos por sección ---------- */
  console.log('\n--- AVISOS DE LO QUE HA HECHO EL OTRO ---');
  {
    const E = abrir('pin', 'papa');
    await espera(700);
    const d = E.d, w = E.w;
    const nav = s => [...d.querySelectorAll('#nav button')].find(b => b.dataset.s === s);
    ok('gastos avisa de 1', nav('gastos').querySelector('i.pill') &&
       nav('gastos').querySelector('i.pill').textContent === '1',
       nav('gastos').textContent);
    ok('calendario también', !!nav('calendario').querySelector('i.pill'));
    ok('salud no, porque mamá no ha tocado nada', !nav('salud').querySelector('i.pill'));
    ok('inicio nunca lleva aviso', !nav('inicio').querySelector('i.pill'));

    E.click(nav('gastos'));
    await espera(60);
    ok('al entrar en gastos el aviso se apaga solo', !nav('gastos').querySelector('i.pill'),
       nav('gastos').textContent);
    ok('y el del calendario sigue', !!nav('calendario').querySelector('i.pill'));
    ok('marcar visto se manda al backend',
       E.posts.some(p => p.action === 'marcarVisto' && p.payload.seccion === 'gastos' && !!p.token),
       JSON.stringify(E.posts.map(p => p.action)));
    E.dom.window.close();
  }

  /* ---------- 5. el token viaja y la sesión caduca ---------- */
  console.log('\n--- LA SESIÓN ---');
  {
    const F = abrir('pin', 'papa', { rechazaEscrituras:true });
    await espera(700);
    const w = F.w, d = F.d;

    w.formEvento(null);
    d.querySelector('#eTit').value = 'Prueba';
    d.querySelector('#eTit').dispatchEvent(new w.Event('input',{bubbles:true}));
    F.click(d.querySelector('#evGuardar'));
    await espera(200);

    const p = F.posts[F.posts.length-1];
    ok('toda escritura lleva el token', !!(p && p.token), p && Object.keys(p).join(','));
    ok('el backend dice que caducó y volvemos al login',
       !d.querySelector('#login').hidden, d.querySelector('#login').hidden);
    ok('y la sesión local se borra', !w.localStorage.getItem('ginapp_token'));
    F.dom.window.close();
  }

  /* ---------- 6. salir ---------- */
  console.log('\n--- SALIR ---');
  {
    const G = abrir('pin', 'papa');
    await espera(700);
    G.w.salir();
    ok('cierra la sesión', !G.w.localStorage.getItem('ginapp_token'));
    ok('y devuelve a la pantalla de entrada', !G.d.querySelector('#login').hidden);
    G.dom.window.close();
  }

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
