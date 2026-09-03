/* ============================================================
   test_pie.js — el botón Actualizar.

   Tiene dos comportamientos y conviene no confundirlos:
    · con service worker (el móvil, la app instalada): tira la caché,
      lo desregistra y RECARGA la página. Es la única forma de ver una
      versión nueva desde el móvil.
    · sin service worker (escritorio, jsdom): solo trae los datos. No
      recargar de más es mejor experiencia.
   ============================================================ */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';
const B = { ok:true, data:{
  version:'0.9.15', hoy:HOY, modo:'confianza',
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', moneda:'€', dias_min_ich:'3' },
  usuarios:[{ username:'papa', nombre:'Papá', color:'#2878D4', rol:'padre', activo:true },
            { username:'mama', nombre:'Mamá', color:'#E4575B', rol:'madre', activo:true }],
  patron:[], custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[],
  gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[], alimentos:[], comidas:[],
  objetivos_semana:[], citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[],
  crecimiento:[], documentos:[], mensajes:[], actividad:[], visitas:[] }};

let fallos = 0;
function ok(t, c, e){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (e!==undefined ? '  → '+e : '')); fallos++; }
}
const espera = ms => new Promise(r => setTimeout(r, ms));

/** sw:true simula un móvil con service worker y caché instalados. */
function abrir(sw, falla){
  const reg = { llamadas:0, cachesBorradas:[], desregistros:0, recargas:0 };
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
    runScripts:'dangerously', url:'https://x.test/g/', pretendToBeVisual:true,
    beforeParse(w){
      w.fetch = () => { reg.llamadas++;
        return falla && reg.llamadas > 1
          ? Promise.resolve({ json:()=>Promise.resolve({ ok:false, error:'Sin conexión' }) })
          : Promise.resolve({ json:()=>Promise.resolve(B) }); };
      w.scrollTo = ()=>{};
      if(sw){
        w.caches = { keys: () => Promise.resolve(['ginapp-v0.8.1','ginapp-v0.8.0']),
                     delete: k => { reg.cachesBorradas.push(k); return Promise.resolve(true); } };
        Object.defineProperty(w.navigator,'serviceWorker',{ configurable:true, value:{
          getRegistrations: () => Promise.resolve([{ unregister(){ reg.desregistros++;
            return Promise.resolve(true); } }]),
          register: () => Promise.resolve({}) }});
        /* recargarPagina() es la costura: location.reload no se puede
           interceptar en jsdom. */
        w.__recarga = () => { reg.recargas++; };
      } else {
        Object.defineProperty(w.navigator,'serviceWorker',{ value:undefined, configurable:true });
      }
      w.localStorage.setItem('ginapp_user','papa');
      w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
    }});
  return { dom, reg, w:dom.window, d:dom.window.document,
           click(el){ el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); } };
}

(async function(){

  console.log('\n--- ESTÁ DONDE TIENE QUE ESTAR ---');
  {
    const A = abrir(false);
    await espera(700);
    const d = A.d, b = d.querySelector('#btnRecargar');
    ok('hay botón de actualizar', !!b);
    ok('al final del todo, con la versión',
       d.querySelector('.pie').contains(b) && d.querySelector('.pie').contains(d.querySelector('#ver')));
    ok('la versión sale', d.querySelector('#ver').textContent === '0.9.15',
       d.querySelector('#ver').textContent);
    ok('y dice de cuándo son los datos que miras',
       /Datos de las \d\d:\d\d/.test(d.querySelector('#recHora').textContent),
       d.querySelector('#recHora').textContent);
    A.dom.window.close();
  }

  console.log('\n--- EN EL MÓVIL: TIRA LA CACHÉ Y RECARGA ---');
  {
    const A = abrir(true);
    await espera(700);
    A.w.recargarPagina = A.w.__recarga;
    const base = A.reg.llamadas;
    const b = A.d.querySelector('#btnRecargar');
    A.click(b);
    ok('avisa de que está trabajando', b.classList.contains('cargando'));
    await espera(150);
    ok('borra TODAS las cachés, no solo la vieja',
       A.reg.cachesBorradas.length === 2, A.reg.cachesBorradas.join(','));
    ok('desregistra el service worker', A.reg.desregistros === 1, A.reg.desregistros);
    ok('y recarga la página desde la red', A.reg.recargas === 1, A.reg.recargas);
    ok('sin pedir datos por su cuenta: ya los trae la recarga',
       A.reg.llamadas === base, A.reg.llamadas - base);
    A.dom.window.close();
  }

  console.log('\n--- EN ESCRITORIO: SOLO TRAE DATOS ---');
  {
    const A = abrir(false);
    await espera(700);
    const antes = A.reg.llamadas;
    const b = A.d.querySelector('#btnRecargar');
    A.click(b);
    await espera(200);
    ok('pide datos', A.reg.llamadas === antes + 1, A.reg.llamadas - antes);
    ok('no recarga la página sin motivo', A.reg.recargas === 0);
    ok('vuelve a su sitio al acabar', !b.classList.contains('cargando') &&
       A.d.querySelector('#recTxt').textContent === 'Actualizar',
       A.d.querySelector('#recTxt').textContent);
    ok('y lo confirma', (A.d.querySelector('#toast').textContent||'').indexOf('Al día') >= 0,
       A.d.querySelector('#toast').textContent);
    A.dom.window.close();
  }

  console.log('\n--- NO SE ENCADENA ---');
  {
    const A = abrir(false);
    await espera(700);
    const antes = A.reg.llamadas;
    const b = A.d.querySelector('#btnRecargar');
    A.click(b); A.click(b); A.click(b);
    await espera(200);
    ok('tres toques seguidos = una sola petición', A.reg.llamadas === antes + 1,
       A.reg.llamadas - antes);
    A.dom.window.close();
  }

  console.log('\n--- SI FALLA, LO DICE ---');
  {
    const A = abrir(false, true);
    await espera(700);
    const b = A.d.querySelector('#btnRecargar');
    A.click(b);
    await espera(250);
    ok('avisa del error', (A.d.querySelector('#toast').textContent||'').indexOf('Sin conexión') >= 0,
       A.d.querySelector('#toast').textContent);
    ok('en rojo', A.d.querySelector('#toast').className.indexOf('ko') >= 0);
    ok('y el botón queda usable otra vez', !b.classList.contains('cargando') &&
       A.d.querySelector('#recTxt').textContent === 'Actualizar');
    A.dom.window.close();
  }

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
