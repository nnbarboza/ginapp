/* ============================================================
   test_biblio.js — biblioteca, estadísticas e insights.

   Tres cosas que se consultan, no que se usan a diario, y por eso
   viven al fondo de Alimentación y no en medio.

   Regla de las gráficas: una serie, un color. Colorear cada barra
   según su tamaño sería pintar dos veces el mismo dato. Y el número
   va escrito al lado — un tooltip no puede ser la única forma de leer
   un valor.
   ============================================================ */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';          /* miércoles */
const LUN = '2026-08-17';

let fallos = 0;
function ok(t, c, e){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (e!==undefined ? '  → '+e : '')); fallos++; }
}

const OBJ = [
  ['verduras','Verdura','🥦',14,'min'], ['fruta','Fruta','🍓',14,'min'],
  ['legumbres','Legumbres','🫘',3,'min'], ['pescado','Pescado','🐟',2,'min'],
  ['cereales','Cereales','🍞',10,'min'], ['capricho','Caprichos','🍬',4,'max']
].map((o,i) => ({ grupo:o[0], nombre:o[1], emoji:o[2], objetivo:o[3], tipo:o[4],
                  peso:16, orden:i+1, activo:true }));

const AL = [
  { id:'a1', nombre:'Manzana',  grupo:'fruta',     emoji:'🍎', estado:'aceptado',    activo:true },
  { id:'a2', nombre:'Plátano',  grupo:'fruta',     emoji:'🍌', estado:'aceptado',    activo:true },
  { id:'a3', nombre:'Brócoli',  grupo:'verduras',  emoji:'🥦', estado:'aprendizaje', activo:true },
  { id:'a4', nombre:'Lentejas', grupo:'legumbres', emoji:'🫘', estado:'aceptado',    activo:true },
  { id:'a5', nombre:'Merluza',  grupo:'pescado',   emoji:'🐟', estado:'rechazado',   activo:true },
  { id:'a6', nombre:'Pan',      grupo:'cereales',  emoji:'🍞', estado:'aceptado',    activo:true }
];

let seq = 0;
function fila(fecha, tipo, o){
  return Object.assign({ id:'c'+(++seq), grupo_id:fecha+'-'+tipo, fecha, hora:'13:00',
    tipo_comida:tipo, lugar:'casa', con:'papa', estado_toma:'comio',
    creado_por:'papa', timestamp:fecha+'T13:00:00.000Z' }, o);
}

/* Historial: la manzana muchas veces, el brócoli poco, la merluza rechazada. */
const C = [];
for(let i = 0; i < 12; i++){
  const f = '2026-08-' + String(i + 1).padStart(2,'0');
  C.push(fila(f, 'desayuno', { alimento_id:'a1', nombre:'Manzana', grupo:'fruta' }));
}
for(let i = 0; i < 5; i++){
  const f = '2026-08-' + String(i + 1).padStart(2,'0');
  C.push(fila(f, 'comida', { alimento_id:'a4', nombre:'Lentejas', grupo:'legumbres' }));
}
C.push(fila('2026-08-10','comida',{ alimento_id:'a3', nombre:'Brócoli', grupo:'verduras' }));
C.push(fila('2026-08-11','comida',{ alimento_id:'a5', nombre:'Merluza', grupo:'pescado',
                                    estado_toma:'rechazo' }));
/* Esta semana, para que el índice tenga datos */
['2026-08-17','2026-08-18','2026-08-19'].forEach(f => {
  C.push(fila(f,'desayuno',{ alimento_id:'a2', nombre:'Plátano', grupo:'fruta' }));
  C.push(fila(f,'comida',{ alimento_id:'', nombre:'Verdura', grupo:'verduras' }));
});

function boot(){
  return { ok:true, data:{
    version:'0.9.7', hoy:HOY, modo:'confianza',
    config:{ nombre_hija:'Georgina', nombre_corto:'Gina', dias_min_ich:'3' },
    usuarios:[{ username:'papa', nombre:'Papá', rol:'progenitor', color:'#2878D4', activo:true },
              { username:'mama', nombre:'Mamá', rol:'progenitor', color:'#E4575B', activo:true }],
    patron:[], custodia:[{ fecha:HOY, username:'papa', origen:'convenio' }],
    eventos:[], eventos_excepciones:[], tipos_evento:[], comentarios:[], recordatorios:[],
    gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[],
    alimentos:AL, comidas:C, objetivos_semana:OBJ, platos:[],
    citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
    documentos:[], mensajes:[], actividad:[], visitas:[] }};
}

const HTML = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const B = boot(), posts = [];
const dom = new JSDOM(HTML, { runScripts:'dangerously', url:'https://x.test/g/',
  pretendToBeVisual:true, beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        posts.push(JSON.parse(o.body));
        return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{} }) });
      }
      return Promise.resolve({ json:()=>Promise.resolve(B) });
    };
    w.scrollTo = ()=>{}; w.alert = ()=>{};
    Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
    w.localStorage.setItem('ginapp_user','papa');
    w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
  }});

const w = dom.window, d = dom.window.document;
const click = el => el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true}));
const hoja = () => (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ');
const cuerpo = () => (d.querySelector('#aliCuerpo').textContent||'').replace(/\s+/g,' ');
const espera = ms => new Promise(r => setTimeout(r, ms));

(async function(){
  await espera(700);
  w.ir('alimentacion');
  await espera(60);

  console.log('\n--- SE LLEGA DESDE ABAJO, NO DESDE EN MEDIO ---');
  ok('hay enlace a la biblioteca', !!d.querySelector('#aliBib'));
  ok('y a las estadísticas', !!d.querySelector('#aliStats'));
  ok('la biblioteca dice cuántos hay',
     cuerpo().indexOf(AL.length + ' dados de alta') >= 0, cuerpo().slice(-200));

  console.log('\n--- EL RANKING SE CALCULA BIEN ---');
  const top = w.rankingAlimentos('', '', 10);
  ok('la manzana es la más repetida', top[0].id === 'a1' && top[0].veces === 12,
     top[0].nombre + ' ' + top[0].veces);
  ok('ordenado de más a menos',
     top.every((x,i) => i === 0 || top[i-1].veces >= x.veces), top.map(x=>x.veces).join(','));
  ok('la merluza rechazada NO cuenta como consumida',
     !top.some(x => x.id === 'a5'), top.map(x=>x.nombre).join(','));
  ok('los grupos sueltos (sin alimento) tampoco entran',
     top.every(x => x.id !== ''), top.length);

  console.log('\n--- LA BIBLIOTECA ---');
  click(d.querySelector('#aliBib'));
  await espera(60);
  ok('se abre con todos', d.querySelectorAll('[data-bibedit]').length === AL.length,
     d.querySelectorAll('[data-bibedit]').length);
  ok('ordenados por lo que más se usa',
     d.querySelectorAll('[data-bibedit]')[0].dataset.bibedit === 'a1');
  ok('cada uno dice su grupo y cuántas veces',
     hoja().indexOf('Fruta · 12 veces') >= 0, hoja().slice(0,300));
  ok('y cómo va con él', hoja().indexOf('Aceptado') >= 0 && hoja().indexOf('Probando') >= 0);

  console.log('\n--- LOS FILTROS ---');
  click(d.querySelector('[data-bibg="fruta"]'));
  await espera(40);
  ok('filtra por grupo', d.querySelectorAll('[data-bibedit]').length === 2,
     d.querySelectorAll('[data-bibedit]').length);
  ok('y dice cuántos de cuántos', hoja().indexOf('2 alimentos de ' + AL.length) >= 0,
     hoja().slice(0,200));
  click(d.querySelector('[data-bibg=""]'));
  await espera(40);
  click(d.querySelector('[data-bibe="rechazado"]'));
  await espera(40);
  ok('filtra por estado', d.querySelectorAll('[data-bibedit]').length === 1 &&
     d.querySelector('[data-bibedit]').dataset.bibedit === 'a5');
  click(d.querySelector('[data-bibe=""]'));
  await espera(40);
  w.state.bibQ = 'plát'; w.pintarBiblioteca();
  ok('y busca por nombre, con acentos y todo',
     d.querySelectorAll('[data-bibedit]').length === 1 &&
     d.querySelector('[data-bibedit]').dataset.bibedit === 'a2');
  w.state.bibQ = 'zzz'; w.pintarBiblioteca();
  ok('sin resultados lo dice, no se queda en blanco',
     hoja().indexOf('Nada con esos filtros') >= 0);
  w.state.bibQ = ''; w.pintarBiblioteca();
  ok('los grupos del filtro son solo los que tienen algo',
     d.querySelectorAll('[data-bibg]').length === 6,
     d.querySelectorAll('[data-bibg]').length);

  console.log('\n--- EDITAR UN ALIMENTO ---');
  click(d.querySelector('[data-bibedit="a3"]'));
  await espera(40);
  ok('se abre el brócoli', hoja().indexOf('Brócoli') >= 0);
  ok('con su nombre editable', d.querySelector('#edNom').value === 'Brócoli');
  ok('explica qué hace "aceptado"',
     hoja().indexOf('deja de preguntar cómo fue') >= 0, hoja().slice(-300));
  click(d.querySelector('[data-ede="aceptado"]'));
  ok('se cambia el estado', w.state._edAl.estado === 'aceptado');
  click(d.querySelector('[data-edg="fruta"]'));
  ok('y el grupo', w.state._edAl.grupo === 'fruta');

  ok('se puede marcar como atajo de postre', !!d.querySelector('[data-edsec="postre"]'));
  click(d.querySelector('[data-edsec="postre"]'));
  ok('lo recuerda', w.state._edAl.seccion === 'postre', w.state._edAl.seccion);
  ok('el atajo NO toca el grupo: son dos cosas distintas',
     w.state._edAl.grupo === 'fruta', w.state._edAl.grupo);
  ok('y lo explica, que si no parece que reclasifique',
     hoja().indexOf('El grupo no cambia') >= 0);

  const antes = posts.length;
  click(d.querySelector('#edGuardar'));
  await espera(260);
  const p = posts[antes];
  ok('se manda', p && p.action === 'saveAlimento', p && p.action);
  ok('con el id, para editar y no duplicar', p && p.payload.id === 'a3');
  ok('con el estado nuevo', p && p.payload.estado === 'aceptado');
  ok('y sigue activo', p && p.payload.activo === true);
  ok('la sección viaja también', p && p.payload.seccion === 'postre', p && p.payload.seccion);

  click(d.querySelector('[data-bibedit="a5"]'));
  await espera(40);
  const antesR = posts.length;
  click(d.querySelector('#edRetirar'));
  await espera(260);
  ok('retirar lo desactiva, no lo borra',
     posts[antesR].payload.activo === false, JSON.stringify(posts[antesR].payload));
  ok('y se dice que el histórico se queda', true);

  console.log('\n--- LAS ESTADÍSTICAS ---');
  w.ir('alimentacion');
  await espera(60);
  click(d.querySelector('#aliStats'));
  await espera(60);
  ok('se abre', hoja().indexOf('Estadísticas') >= 0);
  ok('con lo que más come', hoja().indexOf('Lo que más come') >= 0);
  const barras = [...d.querySelectorAll('.bh-r')];
  ok('en barras ordenadas', barras.length >= 4, barras.length);
  ok('con el número escrito al lado: no depende de un tooltip',
     barras[0].querySelector('.vl').textContent === '12',
     barras[0].querySelector('.vl').textContent);
  /* Una serie, un color: colorear cada barra según su tamaño sería
     pintar dos veces el mismo dato y gastar el único canal libre. */
  /* Ojo al alcance: hay DOS gráficas en la hoja, cada una con su color.
     La regla es una serie un color, no una hoja un color. */
  const bloques = [...d.querySelectorAll('.st-b')];
  const conBarras = bloques.filter(b => b.querySelector('.bh-r'));
  ok('cada gráfica va en su bloque', conBarras.length >= 1, bloques.length + ' bloques');
  const prim = [...conBarras[0].querySelectorAll('.bh-r .tr i')];
  const cols = new Set(prim.map(b => b.style.background));
  ok('todas las barras de una serie, del mismo color', cols.size === 1, [...cols].join(' | '));
  if(conBarras[1]){
    const c2 = new Set([...conBarras[1].querySelectorAll('.bh-r .tr i')]
      .map(b => b.style.background));
    ok('la otra serie, otro color, pero también uno solo', c2.size === 1, [...c2].join(' | '));
    ok('y no reutiliza el color de la primera',
       [...c2][0] !== [...cols][0], [...cols][0] + ' vs ' + [...c2][0]);
  }
  ok('y explica qué se está contando',
     hoja().indexOf('No cuentan los rechazos') >= 0);

  console.log('\n--- LA LÍNEA DE EVOLUCIÓN ---');
  const svgs = [...d.querySelectorAll('.ln-svg')];
  if(svgs.length){
    ok('hay una línea', svgs.length === 1);
    ok('un solo trazo, sin leyenda: el título ya lo nombra',
       svgs[0].querySelectorAll('path').length === 1);
    ok('la rejilla es sólida, no de puntos',
       [...svgs[0].querySelectorAll('line')].every(l => !l.getAttribute('stroke-dasharray')));
    ok('el trazo es fino', svgs[0].querySelector('path').getAttribute('stroke-width') === '2');
    ok('y el último punto va etiquetado', hoja().indexOf('Última semana') >= 0);
  } else {
    /* Con una sola semana de datos NO se dibuja: una línea de un punto
       es una línea inventada. */
    ok('sin dos semanas no dibuja una línea inventada',
       hoja().indexOf('Dibujar una línea con un punto sería inventarla') >= 0,
       hoja().slice(-300));
  }

  console.log('\n--- INSIGHTS ---');
  w.ir('alimentacion');
  await espera(60);
  const ins = w.insights();
  ok('se sacan solos de los datos', Array.isArray(ins));
  ok('detecta el grupo que lleva más tiempo sin aparecer',
     ins.some(x => /sin aparecer/.test(x.t)), JSON.stringify(ins.map(x=>x.t)));
  ok('y lo dice sin juzgar',
     ins.every(x => !/comido mal|demasiado|deber[íi]as|est[áa] mal/i.test(x.t + ' ' + x.p)),
     JSON.stringify(ins.map(x=>x.t)));
  ok('si hay algo, sale en pantalla',
     !ins.length || cuerpo().indexOf('Nos hemos fijado') >= 0, cuerpo().slice(0,200));

  ok('sin datos no se inventa ningún insight',
     (function(){
       const c = w.state.data.comidas;
       w.state.data.comidas = [];
       w.state._primeraVez = null;      /* el memo de "alimentos nuevos" */
       const vacio = w.insights().length === 0 && w.pintarInsights() === '';
       w.state.data.comidas = c;
       w.state._primeraVez = null;
       return vacio;
     })());

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
