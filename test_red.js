/* ============================================================
   test_red.js — la capa de red, que es donde nacía el «error del string».

   `llamar()` hacía r.json() a secas. Apps Script no siempre contesta JSON:
   cuando se atraganta, cuando Google pide iniciar sesión o cuando falta
   publicar una versión, devuelve una página HTML con código 200. El
   navegador entonces escupe «Unexpected token '<'», que no le dice nada a
   quien está mirando el móvil.
   ============================================================ */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-09-13';
const BOOT = { ok:true, data:{
  version:'0.9.23', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina' },
  usuarios:[{username:'papa',nombre:'Papá',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',color:'#E4575B',activo:true}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',ancla_fecha:'2026-09-04',ancla_usuario:'papa'}],
  custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[], tareas:[],
  comentarios:[], recordatorios:[],
  gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[], recurrentes:[],
  alimentos:[], comidas:[], objetivos_semana:[], platos:[],
  citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
  documentos:[], mensajes:[], actividad:[], visitas:[],
  tipos_comida:[], iconos:[], gina:[], menu_cole:[]
}};

/* El guion de la respuesta: cada entrada es lo que devolverá el siguiente
   fetch. Así se puede simular «falla la primera, va la segunda». */
let guion = [];
let llamadas = 0;
function texto(t, status){
  return Promise.resolve({ ok:(status||200) < 400, status:status||200,
    text:()=>Promise.resolve(t), json:()=>Promise.resolve(JSON.parse(t)) });
}

const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = () => {
      llamadas++;
      const sig = guion.length ? guion.shift() : JSON.stringify(BOOT);
      if(sig instanceof Error) return Promise.reject(sig);
      return texto(sig);
    };
    w.scrollTo = ()=>{}; w.alert = ()=>{}; w.prompt = ()=>null;
    Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
    w.localStorage.setItem('ginapp_user','papa');
    w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
  }});

let fallos = 0;
function ok(t, c, extra){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (extra!==undefined ? '  → '+extra : '')); fallos++; }
}
const HTML_LOGIN = '<!DOCTYPE html><html><head><title>Iniciar sesión</title></head>' +
  '<body><form action="https://accounts.google.com/ServiceLogin">…</form></body></html>';
const HTML_ERROR = '<!DOCTYPE html><html><head><title>Error</title></head>' +
  '<body>Se ha producido un error: Script function not found: doGet</body></html>';

setTimeout(async () => {
  const w = dom.window;

  console.log('\n--- UNA PÁGINA HTML NO ES UN ERROR DE SINTAXIS ---');
  guion = [HTML_ERROR, HTML_ERROR];      /* falla, reintenta, vuelve a fallar */
  llamadas = 0;
  let err = null;
  try { await w.llamar('getBootstrap', {}); } catch(e){ err = e; }
  ok('falla, como debe', !!err);
  ok('pero NO con «Unexpected token»',
     !/Unexpected token|is not valid JSON|JSON\.parse/i.test(String(err && err.message)),
     err && err.message);
  ok('dice que falta publicar el backend',
     /publicar/i.test(String(err && err.message)), err && err.message);
  ok('y guarda el html crudo por si hace falta mirarlo',
     String(err && err.crudo).indexOf('<!DOCTYPE') === 0);

  console.log('\n--- CUANDO GOOGLE PIDE INICIAR SESIÓN ---');
  guion = [HTML_LOGIN, HTML_LOGIN];
  err = null;
  try { await w.llamar('getBootstrap', {}); } catch(e){ err = e; }
  ok('lo dice con esas palabras', /iniciar sesión/i.test(String(err && err.message)),
     err && err.message);

  console.log('\n--- UN TROPIEZO SE REINTENTA UNA VEZ ---');
  /* Es lo normal en Apps Script: la primera despierta el script y se cae,
     la segunda va. Sin reintento, el usuario ve un error que no existe. */
  guion = [HTML_ERROR, JSON.stringify(BOOT)];
  llamadas = 0;
  let d = await w.llamar('getBootstrap', {});
  ok('la segunda vez sale bien sin que el usuario vea nada', !!d && !!d.hoy, d && d.hoy);
  ok('y solo se reintentó una vez', llamadas === 2, llamadas);

  console.log('\n--- PERO UN ERROR DE VERDAD NO SE REINTENTA ---');
  /* «Falta el título» es una respuesta correcta del backend diciendo que no.
     Reintentarla no arregla nada y duplica la fila en el registro. */
  guion = [JSON.stringify({ ok:false, error:'Falta el título' }),
           JSON.stringify({ ok:true, data:{} })];
  llamadas = 0;
  err = null;
  try { await w.llamar('saveGinaFicha', {}); } catch(e){ err = e; }
  ok('llega el error tal cual', err && err.message === 'Falta el título', err && err.message);
  ok('y no se llamó dos veces', llamadas === 1, llamadas);

  console.log('\n--- UN CORTE DE RED SÍ SE REINTENTA ---');
  guion = [new TypeError('Failed to fetch'), JSON.stringify(BOOT)];
  llamadas = 0;
  d = await w.llamar('getBootstrap', {});
  ok('se recupera solo', !!d && !!d.hoy);
  ok('en dos intentos', llamadas === 2, llamadas);

  console.log('\n--- RESPUESTA VACÍA ---');
  guion = ['', ''];
  err = null;
  try { await w.llamar('getBootstrap', {}); } catch(e){ err = e; }
  ok('tampoco explota con la comilla angular',
     !!err && !/Unexpected token/i.test(String(err.message)), err && err.message);

  console.log('\n--- LA URL NO SE CACHEA ---');
  /* Safari servía el bootstrap de su propia caché y enseñaba datos viejos. */
  let urlVista = '';
  w.fetch = (u) => { urlVista = String(u); return texto(JSON.stringify(BOOT)); };
  await w.llamar('getBootstrap', {});
  ok('lleva un parámetro que cambia en cada llamada', /[?&]_=\d{10,}/.test(urlVista),
     urlVista.slice(-60));

  console.log('\n--- LA CACHÉ DEL ARRANQUE ---');
  const d2 = w.document;
  ok('tras cargar, queda guardada', !!w.leerCache(), w.localStorage.getItem('ginapp_boot') ? 'hay algo' : 'vacío');
  ok('con los datos, no con un cálculo', !!w.leerCache().d.usuarios);

  /* Lo que importa: una caché de OTRA versión no se usa. Entre versiones
     cambian campos y tablas, y pintar datos viejos con código nuevo es la
     clase de fallo que no se reproduce cuando lo buscas. */
  w.localStorage.setItem('ginapp_boot', JSON.stringify(
    { ts:Date.now(), v:'0.0.1-vieja', d:BOOT.data }));
  ok('una caché de otra versión se ignora', w.leerCache() === null);

  w.localStorage.setItem('ginapp_boot', JSON.stringify(
    { ts:Date.now() - 96*3600*1000, v:w.APP_VERSION, d:BOOT.data }));
  ok('y una de hace cuatro días también', w.leerCache() === null);

  w.localStorage.setItem('ginapp_boot', 'esto no es json{{{');
  ok('una caché corrupta no rompe nada', w.leerCache() === null);

  console.log('\n--- LA CINTA DE «ESTO ES DE ANTES» ---');
  w.pintarDesfase(Date.now() - 5*60000);
  const cinta = d2.querySelector('#desfase');
  ok('sale', !cinta.hidden);
  ok('y dice de cuándo son los datos',
     cinta.textContent.indexOf('hace 5 minutos') >= 0, cinta.textContent);
  ok('con la palabra actualizando, para que se sepa que vienen los buenos',
     cinta.textContent.indexOf('actualizando') >= 0);
  w.pintarDesfase(null);
  ok('y desaparece en cuanto llegan', cinta.hidden);

  ok('hace un momento se dice así', w.edadCache(Date.now() - 20000) === 'hace un momento',
     w.edadCache(Date.now() - 20000));
  ok('las horas en singular', w.edadCache(Date.now() - 3600*1000) === 'hace 1 hora',
     w.edadCache(Date.now() - 3600*1000));
  ok('y los días', w.edadCache(Date.now() - 50*3600*1000) === 'hace 2 días',
     w.edadCache(Date.now() - 50*3600*1000));

  console.log('\n--- SI SE LLENA EL ALMACENAMIENTO ---');
  /* Guardar no puede tumbar la app: si no cabe, se sigue sin caché. */
  const set = w.localStorage.setItem.bind(w.localStorage);
  w.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  let reventó = false;
  try { w.guardarCache(BOOT.data); } catch(e){ reventó = true; }
  w.localStorage.setItem = set;
  ok('no explota, simplemente no guarda', !reventó);

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
}, 900);
