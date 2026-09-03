/* ============================================================
   test_semana.js — lo que dura varios días.

   Un viaje de cinco días rompía las dos vistas de la home:
    · en la tira semanal metía icono + hora + título recortado dentro
      de una columna de 48px, y no se leía nada;
    · en la tarjeta de hoy salía UNA VEZ POR DÍA, así que ocupaba
      todos los huecos con la misma cosa repetida.

   Ahora: banda continua sobre la rejilla, y una sola entrada con su
   tramo en la tarjeta.
   ============================================================ */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-25';          /* martes */
const LUN = '2026-08-24';

let fallos = 0;
function ok(t, c, e){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (e!==undefined ? '  → '+e : '')); fallos++; }
}

const cust = {};
['2026-08-24','2026-08-25'].forEach(f => cust[f] = 'papa');
['2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30'].forEach(f => cust[f] = 'mama');

function boot(eventos){
  return { ok:true, data:{
    version:'0.8.3', hoy:HOY, modo:'confianza',
    config:{ nombre_hija:'Georgina', nombre_corto:'Gina', moneda:'€', dias_min_ich:'3' },
    usuarios:[{ username:'papa', nombre:'Papá', color:'#2878D4', rol:'padre', activo:true },
              { username:'mama', nombre:'Mamá', color:'#E4575B', rol:'madre', activo:true }],
    patron:[],
    custodia:Object.keys(cust).map(f => ({ fecha:f, username:cust[f],
      origen:'convenio', creado_por:'convenio' })),
    eventos:eventos, eventos_excepciones:[],
    tipos_evento:[
      { id:'viajes', nombre:'Viajes', emoji:'✈️', color:'#E99A3D' },
      { id:'dentista', nombre:'Dentista', emoji:'🦷', color:'#43A7B5' },
      { id:'cumples', nombre:'Cumples', emoji:'🎂', color:'#8B62D9' },
      { id:'vacaciones', nombre:'Vacaciones', emoji:'🏖️', color:'#3FAE62' }],
    gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[],
    alimentos:[], comidas:[], objetivos_semana:[],
    citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
    documentos:[], mensajes:[], actividad:[], visitas:[] }};
}

const HTML = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
function abrir(eventos){
  const B = boot(eventos);
  const dom = new JSDOM(HTML, { runScripts:'dangerously', url:'https://x.test/g/',
    pretendToBeVisual:true, beforeParse(w){
      w.fetch = () => Promise.resolve({ json:()=>Promise.resolve(B) });
      w.scrollTo = ()=>{};
      Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
      w.localStorage.setItem('ginapp_user','papa');
      w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
    }});
  return { dom, w:dom.window, d:dom.window.document,
           bandas(){ return [...this.d.querySelectorAll('#semBandas .bnd-s')]; },
           click(el){ el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); } };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

const VIAJE = { id:'v1', fecha:'2026-08-26', fecha_fin:'2026-08-30', titulo:'Viaje Andorra',
                tipo:'viajes', lugar:'Andorra', hora:'10:00', repite:'no', creado_por:'papa' };

(async function(){

  console.log('\n--- LA BANDA ---');
  {
    const A = abrir([VIAJE]);
    await espera(700);
    const b = A.bandas();
    ok('el viaje se dibuja como una banda', b.length === 1, b.length);
    ok('con su nombre legible entero, sin recortar',
       b[0].querySelector('.nm').textContent === 'Viaje Andorra',
       b[0].querySelector('.nm').textContent);
    /* mié 26 = columna 3, dom 30 = columna 7 → grid-column: 3 / 8 */
    ok('empieza el miércoles y acaba el domingo',
       b[0].style.gridColumn === '3 / 8', b[0].style.gridColumn);
    ok('no deja puntos sueltos en cada día que cruza',
       [...A.d.querySelectorAll('#semDias .pts i')].length === 0);
    ok('y la leyenda no lo repite: ya lleva el nombre dentro',
       A.d.querySelector('#semLeg').textContent.indexOf('Viajes') < 0,
       A.d.querySelector('#semLeg').textContent);
    A.dom.window.close();
  }

  console.log('\n--- LAS PUNTAS DICEN SI SIGUE ---');
  {
    /* Vacaciones largas: entran antes del lunes y siguen tras el domingo. */
    const A = abrir([{ id:'x1', fecha:'2026-06-24', fecha_fin:'2026-09-07',
      titulo:'Vacaciones de verano', tipo:'vacaciones', repite:'no', creado_por:'papa' }]);
    await espera(700);
    const b = A.bandas()[0];
    ok('ocupa la semana entera', b.style.gridColumn === '1 / 8', b.style.gridColumn);
    ok('y avisa de que viene de antes y sigue después',
       b.querySelectorAll('.pt-a').length === 2, b.querySelectorAll('.pt-a').length);
    A.dom.window.close();
  }

  console.log('\n--- LOS DE UN DÍA SIGUEN SIENDO PUNTOS ---');
  {
    const A = abrir([VIAJE,
      { id:'d1', fecha:'2026-08-24', hora:'17:00', titulo:'Dentista', tipo:'dentista',
        repite:'no', creado_por:'papa' },
      { id:'c1', fecha:'2026-08-24', hora:'19:00', titulo:'Cumple Marta', tipo:'cumples',
        repite:'no', creado_por:'papa' }]);
    await espera(700);
    const dias = [...A.d.querySelectorAll('#semDias .d')];
    ok('el lunes lleva 2 puntos', dias[0].querySelectorAll('.pts i').length === 2,
       dias[0].querySelectorAll('.pts i').length);
    ok('de sus colores, no del mismo',
       dias[0].querySelectorAll('.pts i')[0].style.background !==
       dias[0].querySelectorAll('.pts i')[1].style.background);
    ok('el viaje sigue siendo banda, no punto', A.bandas().length === 1);
    ok('y la leyenda nombra solo lo que es punto',
       A.d.querySelector('#semLeg').textContent.indexOf('Dentista') >= 0 &&
       A.d.querySelector('#semLeg').textContent.indexOf('Viajes') < 0,
       A.d.querySelector('#semLeg').textContent);
    A.dom.window.close();
  }

  console.log('\n--- LA TARJETA DE HOY NO LO REPITE ---');
  {
    const A = abrir([VIAJE]);
    await espera(700);
    const t = (A.d.querySelector('#cardHoy').textContent||'').replace(/\s+/g,' ');
    const veces = t.split('Viaje Andorra').length - 1;
    ok('el viaje sale UNA vez, no una por día', veces === 1, veces + ' veces');
    ok('con el tramo que ocupa, no con "mañana" a secas',
       t.indexOf('30 ago') >= 0, t);
    ok('y sin hora: un tramo de cinco días no tiene hora',
       t.indexOf('10:00') < 0, t);
    A.dom.window.close();
  }

  console.log('\n--- UN TRAMO EN CURSO SE DICE ASÍ ---');
  {
    const A = abrir([{ id:'v2', fecha:'2026-08-24', fecha_fin:'2026-08-28',
      titulo:'Casal', tipo:'viajes', repite:'no', creado_por:'papa' }]);
    await espera(700);
    const t = (A.d.querySelector('#cardHoy').textContent||'').replace(/\s+/g,' ');
    ok('dice que está en curso', t.indexOf('en curso') >= 0, t);
    ok('y hasta cuándo', t.indexOf('28 ago') >= 0, t);
    A.dom.window.close();
  }

  console.log('\n--- LAS REPETICIONES SÍ VUELVEN ---');
  {
    /* Una clase semanal no es un tramo: cada semana es una cita distinta
       y tiene que poder salir dos veces en la lista de próximos. */
    const A = abrir([{ id:'r1', fecha:'2026-08-26', hora:'18:00', titulo:'Natación',
      tipo:'dentista', repite:'semanal', repite_dias:'mie,vie',
      repite_hasta:'2027-06-30', creado_por:'papa' }]);
    await espera(700);
    const t = (A.d.querySelector('#cardHoy').textContent||'').replace(/\s+/g,' ');
    ok('la clase semanal aparece dos veces (miércoles y viernes)',
       t.split('Natación').length - 1 === 2, t.split('Natación').length - 1);
    ok('y no se dibuja como banda', A.bandas().length === 0);
    A.dom.window.close();
  }

  console.log('\n--- TOCAR LA BANDA ABRE EL EVENTO ---');
  {
    const A = abrir([VIAJE]);
    await espera(700);
    A.click(A.bandas()[0]);
    await espera(80);
    ok('se abre ese viaje, no otra cosa',
       A.w.borradorEvento && A.w.borradorEvento.titulo === 'Viaje Andorra',
       A.w.borradorEvento && A.w.borradorEvento.titulo);
    ok('en su formulario, editable porque es mío', !!A.d.querySelector('#evGuardar'));
    ok('con la hora ya en formato del selector nativo',
       A.d.querySelector('#eHora').type === 'time' &&
       A.d.querySelector('#eHora').value === '10:00',
       A.d.querySelector('#eHora').type + ' / ' + A.d.querySelector('#eHora').value);
    A.dom.window.close();
  }

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
