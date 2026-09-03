/* ============================================================
   test_avisos.js — las dos capas de aviso, que son distintas:

   1. NAV (pill por sección): "el otro ha tocado algo aquí".
      Se apaga por haber pasado por delante.
   2. ATENCIÓN (tarjeta de la home): mensaje del tablón, cambio de
      custodia, salud en curso. NO se apaga por entrar en la
      sección — se apaga cuando la cosa deja de estar pendiente.

   Lo segundo es lo único que se calcula desde el estado real, no
   desde el registro de actividad. Por eso no se persiste nada.
   ============================================================ */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');

let fallos = 0;
function ok(t, c, extra){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (extra!==undefined ? '  → '+extra : '')); fallos++; }
}

const HOY = '2026-08-19';
const d1  = '2026-08-21';   /* dentro de la ventana */
const d30 = '2026-09-30';   /* fuera: eso es agenda, no urgencia */

function boot(extra){
  const base = {
    version:'0.8.0', hoy:HOY, modo:'pin',
    config:{ nombre_hija:'Georgina', nombre_corto:'Gina', moneda:'€', dias_min_ich:'3' },
    usuarios:[
      { username:'papa', nombre:'Papá', color:'#2878D4', emoji:'👨', rol:'padre', activo:true },
      { username:'mama', nombre:'Mamá', color:'#E4575B', emoji:'👩', rol:'madre', activo:true }
    ],
    patron:[], custodia:[{ fecha:HOY, username:'papa', origen:'convenio', creado_por:'convenio' }],
    eventos:[], eventos_excepciones:[], tipos_evento:[],
    gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[],
    alimentos:[], comidas:[], objetivos_semana:[],
    citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
    documentos:[], mensajes:[], actividad:[],
    visitas:[{ username:'papa', seccion:'inicio', ts:'2026-08-18T08:00:00.000Z' }]
  };
  return { ok:true, data: Object.assign(base, extra || {}) };
}

const HTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function abrir(extra){
  const B = boot(extra), badges = [];
  const dom = new JSDOM(HTML, {
    runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
    beforeParse(w){
      w.fetch = (u, o) => (o && o.method === 'POST')
        ? Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ id:'x' } }) })
        : Promise.resolve({ json:()=>Promise.resolve(B) });
      w.scrollTo = ()=>{}; w.alert = ()=>{}; w.prompt = ()=>null;
      Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
      w.navigator.setAppBadge   = n => { badges.push(n); return Promise.resolve(); };
      w.navigator.clearAppBadge = ()  => { badges.push(0); return Promise.resolve(); };
      w.localStorage.setItem('ginapp_user','papa');
      w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
    }});
  return { dom, badges, w:dom.window, d:dom.window.document,
           click(el){ el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); },
           aten(){ return (this.d.querySelector('#cardAten').textContent||'')
                     .replace(/\s+/g,' '); },
           items(){ return [...this.d.querySelectorAll('[data-aten]')]; } };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

(async function(){

  console.log('\n--- SIN NADA PENDIENTE ---');
  {
    const A = abrir();
    await espera(700);
    ok('la tarjeta de Atención ni aparece', A.d.querySelector('#cardAten').hidden);
    ok('y el icono de la app queda a cero', A.badges[A.badges.length-1] === 0, A.badges);
    A.dom.window.close();
  }

  console.log('\n--- LAS TRES COSAS QUE AVISAN ---');
  {
    const A = abrir({
      mensajes:[{ id:'m1', fecha:HOY, autor:'mama', texto:'El viernes la recojo yo a las 17h',
                  leido_por:'', timestamp:'2026-08-19T09:00:00.000Z' }],
      custodia:[
        { fecha:HOY,  username:'papa', origen:'convenio', creado_por:'convenio' },
        { fecha:d1,   username:'mama', origen:'cambio', motivo:'Boda',  creado_por:'mama' },
        { fecha:d30,  username:'mama', origen:'cambio', motivo:'Lejos', creado_por:'mama' }
      ],
      episodios:[{ id:'ep1', fecha:HOY, hora:'08:00', tipo:'fiebre',
                   descripcion:'38.2 esta mañana', creado_por:'mama' }],
      citas:[{ id:'ci1', fecha:'2026-08-22', hora:'10:30', tipo:'pediatra',
               centro:'CAP Sarrià', creado_por:'mama' }]
    });
    await espera(700);
    const t = A.aten();
    ok('la tarjeta sale', !A.d.querySelector('#cardAten').hidden);
    ok('con el mensaje del tablón', t.indexOf('Mensaje de Mamá') >= 0, t);
    ok('y su texto, para no tener que abrirlo', t.indexOf('recojo yo') >= 0);
    ok('con el cambio de custodia cercano', t.indexOf('Cambio de custodia') >= 0);
    /* "Le toca a mamá" no decía si era el día entero o solo la noche.
       Un día del calendario marca DÓNDE DUERME, y así se dice. */
    ok('diciendo con quién duerme esa noche', t.indexOf('duerme con mamá') >= 0, t);
    ok('con el episodio de salud', t.indexOf('Episodio · fiebre') >= 0, t);
    ok('con la cita próxima', t.indexOf('Cita · pediatra') >= 0);
    ok('el cambio de dentro de un mes NO entra', t.indexOf('Lejos') < 0, t);
    ok('son 4 avisos', A.items().length === 4, A.items().length);
    ok('y el icono de la app marca 4', A.badges[A.badges.length-1] === 4, A.badges);
    A.dom.window.close();
  }

  console.log('\n--- LO MÍO NO ME AVISA A MÍ ---');
  {
    const A = abrir({
      mensajes:[{ id:'m1', fecha:HOY, autor:'papa', texto:'Lo apunto yo',
                  leido_por:'', timestamp:'2026-08-19T09:00:00.000Z' }],
      custodia:[{ fecha:d1, username:'mama', origen:'cambio', creado_por:'papa' }],
      episodios:[{ id:'ep1', fecha:HOY, tipo:'fiebre', creado_por:'papa' }],
      citas:[{ id:'ci1', fecha:'2026-08-22', tipo:'pediatra', creado_por:'papa' }]
    });
    await espera(700);
    ok('nada de lo que apunto yo me avisa', A.d.querySelector('#cardAten').hidden, A.aten());
    A.dom.window.close();
  }

  console.log('\n--- EL CONVENIO NO ES UN CAMBIO ---');
  {
    const A = abrir({
      custodia:[{ fecha:d1, username:'mama', origen:'convenio', creado_por:'convenio' }]
    });
    await espera(700);
    ok('un día normal del convenio no avisa de nada',
       A.d.querySelector('#cardAten').hidden, A.aten());
    A.dom.window.close();
  }

  console.log('\n--- SE APAGA SOLO CUANDO DEJA DE ESTAR PENDIENTE ---');
  {
    const A = abrir({
      mensajes:[{ id:'m1', fecha:HOY, autor:'mama', texto:'Hola', leido_por:'',
                  timestamp:'2026-08-19T09:00:00.000Z' }]
    });
    await espera(700);
    const w = A.w, d = A.d;
    ok('el mensaje sin leer avisa', !d.querySelector('#cardAten').hidden);

    /* Pasar por la sección NO lo apaga: esa es toda la diferencia
       con la pill de la nav. */
    w.marcarSeccionVista('perfil');
    w.pintarTodo();
    ok('pasar por el perfil no lo apaga', !d.querySelector('#cardAten').hidden, A.aten());

    /* Leerlo de verdad, sí. */
    w.state.data.mensajes[0].leido_por = 'papa';
    w.pintarTodo();
    ok('leerlo sí lo apaga', d.querySelector('#cardAten').hidden);
    ok('y el icono vuelve a cero', A.badges[A.badges.length-1] === 0, A.badges);
    A.dom.window.close();
  }

  console.log('\n--- EL AVISO LLEVA A LA COSA, NO SOLO A LA SECCIÓN ---');
  {
    const A = abrir({
      custodia:[
        { fecha:HOY, username:'papa', origen:'convenio', creado_por:'convenio' },
        { fecha:d1,  username:'mama', origen:'cambio', motivo:'Boda', creado_por:'mama' }
      ],
      citas:[{ id:'ci1', fecha:'2026-08-22', hora:'10:30', tipo:'pediatra',
               centro:'CAP Sarrià', creado_por:'mama' }]
    });
    await espera(700);
    const w = A.w, d = A.d;

    A.click(A.items()[0]);            /* el cambio de custodia */
    await espera(60);
    ok('abre el calendario', !d.querySelector('#s-calendario').hidden);
    ok('en el día del cambio, no en hoy', w.state.calDia === d1, w.state.calDia);

    w.ir('inicio');
    A.click(A.items()[1]);            /* la cita */
    await espera(60);
    ok('la cita abre salud', !d.querySelector('#s-salud').hidden);
    ok('y abre la cita concreta',
       (d.querySelector('#hojaC').textContent||'').indexOf('CAP Sarrià') >= 0,
       (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ').slice(0,80));
    ok('en solo lectura, porque es de mamá', !d.querySelector('#ciGuardar'));
    A.dom.window.close();
  }

  console.log('\n--- NADA DE ESTO SE GUARDA ---');
  {
    const A = abrir({
      mensajes:[{ id:'m1', fecha:HOY, autor:'mama', texto:'Hola', leido_por:'',
                  timestamp:'2026-08-19T09:00:00.000Z' }]
    });
    await espera(700);
    ok('la lista de avisos se recalcula al pintar, no vive en el Sheet',
       Array.isArray(A.w.atencion()) && A.w.atencion().length === 1);
    ok('y no hay pestaña ni campo que la persista',
       A.w.state.data.avisos === undefined && A.w.state.data.notificaciones === undefined);
    A.dom.window.close();
  }

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
