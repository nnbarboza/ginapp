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

  console.log('\n--- GUARDAR SIN ESPERAR ---');
  /* Guardar eran DOS viajes: el POST y después un recargar() que releía las
     34 pestañas para enterarse de la fila recién escrita. Los dos sobran. */
  const espera = ms => new Promise(r => setTimeout(r, ms));
  w.state.data.gastos = [];
  w.state.seccion = 'gastos';

  let vistos = [];
  w.fetch = (u, o) => {
    if(o && o.method === 'POST'){
      const b = JSON.parse(o.body);
      vistos.push(b);
      return espera(60).then(() => texto(JSON.stringify(
        { ok:true, data:{ id:'real_1', fecha:b.payload.fecha, importe:b.payload.importe,
                          descripcion:b.payload.descripcion, categoria:b.payload.categoria,
                          origen:b.payload.origen, compartido:true, creado_por:'papa' } })));
    }
    return texto(JSON.stringify(BOOT));
  };

  const prom = w.guardarOptimista({
    tabla:'gastos',
    provisional:{ fecha:'2026-09-13', importe:42, descripcion:'Libros',
                  categoria:'educacion', origen:'comun', compartido:true },
    accion:'saveGasto',
    payload:{ fecha:'2026-09-13', importe:42, descripcion:'Libros',
              categoria:'educacion', origen:'comun', creado_por:'papa' },
    mensaje:'Gasto guardado' });

  /* Lo que importa: la fila está ANTES de que el servidor conteste. */
  ok('el gasto se ve al instante, sin esperar al servidor',
     w.state.data.gastos.length === 1, w.state.data.gastos.length);
  ok('con un id provisional', String(w.state.data.gastos[0].id).indexOf('tmp_') === 0,
     w.state.data.gastos[0].id);
  ok('y el id provisional NO viaja al backend',
     vistos[0] && vistos[0].payload.id === undefined,
     vistos[0] && JSON.stringify(vistos[0].payload).slice(0,80));

  await prom;
  ok('al contestar, el id provisional se cambia por el de verdad',
     w.state.data.gastos.length === 1 && w.state.data.gastos[0].id === 'real_1',
     w.state.data.gastos.map(g => g.id).join(','));
  ok('y no se recarga el bootstrap entero por una fila',
     vistos.length === 1, vistos.length);

  console.log('\n--- SI EL ENVÍO FALLA, SE DESHACE ---');
  w.state.data.gastos = [];
  w.fetch = (u, o) => (o && o.method === 'POST')
    ? espera(40).then(() => texto('<!DOCTYPE html><title>Error</title>'))
    : texto(JSON.stringify(BOOT));
  let fallo = null;
  const p2 = w.guardarOptimista({
    tabla:'gastos', provisional:{ importe:9, descripcion:'Se va a caer' },
    accion:'saveGasto', payload:{ importe:9 }, mensaje:'Gasto guardado',
    reintentar:function(){} }).catch(e => { fallo = e; });
  ok('mientras va, el gasto está en la lista', w.state.data.gastos.length === 1);
  await p2;
  ok('al fallar desaparece: no llegó a existir', w.state.data.gastos.length === 0,
     w.state.data.gastos.length);
  ok('y avisa', !d2.querySelector('#fallo').hidden);
  ok('con un mensaje que se entiende, no con la comilla angular',
     !/Unexpected token/i.test(d2.querySelector('#fallo').textContent),
     d2.querySelector('#fallo').textContent);
  ok('y con un botón para reintentar', !!d2.querySelector('#falloRe'));

  /* Un toast se va solo a los dos segundos y te deja creyendo que el gasto
     está apuntado. Este se queda hasta que lo cierras. */
  await espera(2600);
  ok('el aviso NO se va solo a los dos segundos', !d2.querySelector('#fallo').hidden);
  w.cerrarFallo();
  ok('se cierra a mano', d2.querySelector('#fallo').hidden);

  console.log('\n--- EDITAR ALGO Y QUE FALLE ---');
  /* Lo que había antes tiene que volver: si no, una edición fallida borra
     el dato bueno de la pantalla. */
  w.state.data.gastos = [{ id:'g9', importe:100, descripcion:'Original' }];
  const p3 = w.guardarOptimista({
    tabla:'gastos', provisional:{ id:'g9', importe:55, descripcion:'Cambiado' },
    accion:'saveGasto', payload:{ id:'g9', importe:55 } }).catch(()=>{});
  ok('se ve el cambio ya', w.state.data.gastos[0].descripcion === 'Cambiado');
  await p3;
  ok('al fallar vuelve lo que había, no se queda a medias',
     w.state.data.gastos.length === 1 && w.state.data.gastos[0].descripcion === 'Original' &&
     w.state.data.gastos[0].importe === 100,
     JSON.stringify(w.state.data.gastos));
  w.cerrarFallo();

  console.log('\n--- BORRAR ---');
  w.state.data.gastos = [{ id:'g1', importe:10 }, { id:'g2', importe:20 }];
  w.fetch = (u, o) => (o && o.method === 'POST')
    ? espera(40).then(() => texto(JSON.stringify({ ok:true, data:{ borradas:1 } })))
    : texto(JSON.stringify(BOOT));
  const p4 = w.borrarOptimista({ tabla:'gastos', id:'g1', accion:'deleteGasto' });
  ok('se va de la lista al instante', w.state.data.gastos.length === 1);
  await p4;
  ok('y sigue fuera', w.state.data.gastos.map(g=>g.id).join(',') === 'g2');

  w.fetch = (u, o) => (o && o.method === 'POST')
    ? espera(40).then(() => texto(JSON.stringify({ ok:false, error:'No se pudo' })))
    : texto(JSON.stringify(BOOT));
  await w.borrarOptimista({ tabla:'gastos', id:'g2', accion:'deleteGasto' }).catch(()=>{});
  ok('un borrado que falla devuelve la fila', w.state.data.gastos.length === 1,
     JSON.stringify(w.state.data.gastos));
  w.cerrarFallo();

  console.log('\n--- EL PUNTITO DE ENVIANDO ---');
  w.fetch = (u, o) => (o && o.method === 'POST')
    ? espera(120).then(() => texto(JSON.stringify({ ok:true, data:{ id:'z' } })))
    : texto(JSON.stringify(BOOT));
  const p5 = w.guardarOptimista({ tabla:'gastos', provisional:{ importe:1 },
    accion:'saveGasto', payload:{ importe:1 } });
  ok('mientras hay algo en vuelo, se ve', !d2.querySelector('#enviando').hidden);
  await p5;
  ok('y al terminar desaparece', d2.querySelector('#enviando').hidden);

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
}, 900);
