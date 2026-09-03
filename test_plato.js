/* ============================================================
   test_plato.js — apuntar una comida como en Gosari.

   El modelo, que me había inventado mal:
     · la COMIDA es el plato ("Tequeños con guacamole") y lo que cuenta
       para los objetivos son sus CATEGORÍAS. Nadie va a dar de alta
       "tequeños" como alimento, ni tiene por qué.
     · los ALIMENTOS son lo que se AÑADE — bebida, snack, fruta. Son
       opcionales y son los que suman variedad.
     · una categoría cuenta UNA VEZ por comida: una ensalada con cinco
       verduras es una ración de verdura, no cinco.
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
  ['huevos','Huevos','🥚',3,'min'], ['cereales','Cereales','🍞',10,'min'],
  ['capricho','Caprichos','🍬',4,'max'], ['ultraprocesado','Ultraprocesados','🍟',3,'max']
].map((o,i) => ({ grupo:o[0], nombre:o[1], emoji:o[2], objetivo:o[3], tipo:o[4],
                  peso:10, orden:i+1, activo:true }));

const AL = [
  { id:'a1', nombre:'Lentejas', grupo:'legumbres', emoji:'🫘', estado:'aceptado', activo:true },
  { id:'a2', nombre:'Manzana',  grupo:'fruta',     emoji:'🍎', estado:'aceptado', activo:true },
  { id:'a4', nombre:'Brócoli',  grupo:'verduras',  emoji:'🥦', estado:'aprendizaje', activo:true },
  { id:'b1', nombre:'Agua',     grupo:'bebidas',   emoji:'💧', estado:'aceptado', activo:true },
  { id:'b2', nombre:'Leche',    grupo:'bebidas',   emoji:'🥛', estado:'aceptado', activo:true },
  { id:'b3', nombre:'Zumo natural', grupo:'bebidas', emoji:'🍊', estado:'aceptado', activo:true }
];

let seq = 0;
/** Una comida = varias filas con el mismo grupo_id. */
function fila(fecha, hora, tipo, o){
  return Object.assign({ id:'c'+(++seq), grupo_id:fecha+'-'+tipo, fecha, hora,
    tipo_comida:tipo, lugar:'casa', con:'papa', estado_toma:'comio',
    creado_por:'papa', timestamp:fecha+'T'+hora+':00.000Z' }, o);
}

function boot(comidas){
  return { ok:true, data:{
    version:'0.9.3', hoy:HOY, modo:'confianza',
    config:{ nombre_hija:'Georgina', nombre_corto:'Gina', dias_min_ich:'3' },
    usuarios:[{ username:'papa', nombre:'Papá', rol:'progenitor', color:'#2878D4', activo:true },
              { username:'mama', nombre:'Mamá', rol:'progenitor', color:'#E4575B', activo:true },
              { username:'avis', nombre:'Els avis', rol:'abuelos', color:'#6E8B5C', activo:false }],
    patron:[], custodia:[{ fecha:HOY, username:'papa', origen:'convenio' }],
    eventos:[], eventos_excepciones:[], tipos_evento:[],
    gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[],
    alimentos:AL, comidas:comidas || [], objetivos_semana:OBJ, platos:[],
    citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
    documentos:[], mensajes:[], actividad:[], visitas:[] }};
}

const HTML = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

function abrir(comidas, ia){
  const B = boot(comidas), posts = [];
  const dom = new JSDOM(HTML, { runScripts:'dangerously', url:'https://x.test/g/',
    pretendToBeVisual:true, beforeParse(w){
      w.fetch = (u, o) => {
        if(o && o.method === 'POST'){
          const body = JSON.parse(o.body);
          posts.push(body);
          if(body.action === 'interpretaPlato'){
            return Promise.resolve({ json:()=>Promise.resolve(
              ia || { ok:true, data:{ nombre:body.payload.nombre, fuente:'ia',
                      grupos:['cereales','verduras'] }}) });
          }
          return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ grupo_id:'g1' } }) });
        }
        return Promise.resolve({ json:()=>Promise.resolve(B) });
      };
      w.scrollTo = ()=>{}; w.alert = ()=>{};
      Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
      w.localStorage.setItem('ginapp_user','papa');
      w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
    }});
  return { dom, posts, w:dom.window, d:dom.window.document,
           click(el){ el && el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); },
           cuerpo(){ return (this.d.querySelector('#aliCuerpo').textContent||'')
                       .replace(/\s+/g,' '); },
           hoja(){ return (this.d.querySelector('#hojaC').textContent||'')
                     .replace(/\s+/g,' '); },
           items(){ return this.w.borrador.items; },
           marcados(){ return this.items().filter(x => !x.alimento_id)
                         .map(x => x.grupo).sort().join(','); } };
}
const espera = ms => new Promise(r => setTimeout(r, ms));

async function formulario(comidas, ia, tipo){
  const A = abrir(comidas, ia);
  await espera(700);
  A.w.ir('alimentacion');
  A.w.abrirComida('', tipo);
  await espera(60);
  return A;
}

(async function(){

  console.log('\n--- TEQUEÑOS CON GUACAMOLE ---');
  {
    const A = await formulario([]);
    ok('pide el plato tal cual', !!A.d.querySelector('#inPlato'));
    ok('con un ejemplo que no es un ingrediente',
       A.d.querySelector('#inPlato').placeholder.indexOf('Tequeños') >= 0,
       A.d.querySelector('#inPlato').placeholder);
    ok('ya no pide una descripción aparte', !A.d.querySelector('#inDesc'));

    A.d.querySelector('#inPlato').value = 'Tequeños con guacamole';
    A.click(A.d.querySelector('#btnPlato'));
    ok('mientras piensa, lo dice', A.hoja().indexOf('Mirando de qué se compone') >= 0);
    await espera(220);

    const ip = A.posts.filter(p => p.action === 'interpretaPlato');
    ok('pregunta una vez', ip.length === 1, ip.length);
    ok('mandando el plato entero, no ingredientes',
       ip[0].payload.nombre === 'Tequeños con guacamole', ip[0].payload.nombre);
    ok('con token: cuesta dinero', !!ip[0].token);

    ok('devuelve CATEGORÍAS, no una lista de alimentos',
       A.marcados() === 'cereales,verduras', A.marcados());
    ok('sin dar de alta "tequeños" en la biblioteca',
       !A.items().some(x => x.alimento_id || x.crear));
    ok('y quedan como checks marcados, para repasarlos',
       A.d.querySelectorAll('.gchip.on').length === 2,
       A.d.querySelectorAll('.gchip.on').length);
    ok('se puede guardar solo con eso', !A.d.querySelector('#guardarComida').disabled);
    A.dom.window.close();
  }

  console.log('\n--- LOS CHECKS SE REPASAN ---');
  {
    const A = await formulario([]);
    A.d.querySelector('#inPlato').value = 'Tequeños con guacamole';
    A.click(A.d.querySelector('#btnPlato'));
    await espera(220);

    A.click(A.d.querySelector('.gchip[data-g="verduras"]'));
    ok('se desmarca lo que la IA metió de más', A.marcados() === 'cereales', A.marcados());
    A.click(A.d.querySelector('.gchip[data-g="capricho"]'));
    ok('y se marca lo que faltaba', A.marcados() === 'capricho,cereales', A.marcados());
    ok('queda constancia de que lo tocaste', A.w.borrador.platoTocado === true);

    A.click(A.d.querySelector('#guardarComida'));
    await espera(260);
    const sp = A.posts.filter(p => p.action === 'savePlato');
    ok('el plato se recuerda', sp.length === 1, sp.length);
    ok('con TU versión', sp[0].payload.grupos.sort().join(',') === 'capricho,cereales',
       sp[0].payload.grupos.join(','));
    ok('marcado manual, para que la IA no lo pise', sp[0].payload.fuente === 'manual');
    A.dom.window.close();
  }

  console.log('\n--- SIN IA TAMBIÉN SE APUNTA ---');
  {
    const A = await formulario([]);
    ok('los checks están a la vista desde el principio',
       A.d.querySelectorAll('.gchip[data-g]').length === OBJ.length,
       A.d.querySelectorAll('.gchip[data-g]').length);
    A.click(A.d.querySelector('.gchip[data-g="legumbres"]'));
    A.click(A.d.querySelector('.gchip[data-g="verduras"]'));
    ok('marcando dos basta', A.marcados() === 'legumbres,verduras');
    ok('y se puede guardar sin haber tocado la IA',
       !A.d.querySelector('#guardarComida').disabled &&
       A.posts.filter(p => p.action === 'interpretaPlato').length === 0);
    A.dom.window.close();
  }

  console.log('\n--- LOS ALIMENTOS SON UN AÑADIDO ---');
  {
    const A = await formulario([]);
    ok('el bloque dice que es opcional', A.hoja().indexOf('opcional') >= 0);
    const chips = [...A.d.querySelectorAll('.chips.beb [data-add]')];
    ok('las bebidas están a un toque', chips.length === 3, chips.length);
    A.click(chips.find(c => c.dataset.add === 'b1'));
    await espera(40);
    ok('el agua entra como alimento', A.items().some(x => x.alimento_id === 'b1'));
    ok('no como categoría del plato', A.marcados() === '');
    ok('y con eso solo ya se puede guardar',
       !A.d.querySelector('#guardarComida').disabled);
    A.dom.window.close();
  }

  console.log('\n--- FOTO: LA CÁMARA O EL CARRETE, LO ELIGE EL MÓVIL ---');
  {
    const A = await formulario([]);
    ok('hay entrada de foto', !!A.d.querySelector('#inFoto'));
    ok('acepta imágenes', A.d.querySelector('#inFoto').accept === 'image/*');
    /* Sin `capture`, iOS y Android preguntan "Cámara / Fototeca" ellos
       solos. Poner dos botones duplicaba un menú que ya da el sistema. */
    ok('sin forzar la cámara: el móvil ofrece las dos opciones',
       !A.d.querySelector('#inFoto').getAttribute('capture'));
    ok('y solo hay un botón, no dos', !A.d.querySelector('#inCam'));
    A.dom.window.close();
  }

  console.log('\n--- EN EL COLE NO ESTÁ CON NADIE ---');
  {
    const A = await formulario([]);
    ok('por defecto en casa y con quien tiene la custodia',
       A.w.borrador.lugar === 'casa' && A.w.borrador.con === 'papa',
       A.w.borrador.lugar + '/' + A.w.borrador.con);
    A.click(A.d.querySelector('[data-lugar="cole"]'));
    ok('en el cole deja de preguntar a cargo de quién', !A.d.querySelector('[data-con]'));
    ok('y no deja a nadie puesto', A.w.borrador.con === '', A.w.borrador.con);
    A.click(A.d.querySelector('[data-lugar="fuera"]'));
    ok('fuera de casa sí vuelve a preguntar', !!A.d.querySelector('[data-con]'));
    ok('proponiendo la custodia otra vez', A.w.borrador.con === 'papa');
    A.click(A.d.querySelector('[data-con="avis"]'));
    ok('y los avis también son una opción', A.w.borrador.con === 'avis');
    A.dom.window.close();
  }

  console.log('\n--- UNA CATEGORÍA CUENTA UNA VEZ POR COMIDA ---');
  {
    /* La ensalada del lunes lleva cinco verduras apuntadas. Debe contar
       como UNA ración, no como cinco: apuntar con detalle no puede
       inflar el marcador. */
    const cinco = ['Tomate','Lechuga','Pepino','Zanahoria','Cebolla'].map(n =>
      fila(LUN,'13:30','comida',{ alimento_id:'', nombre:n, grupo:'verduras' }));
    const A = abrir(cinco);
    await espera(700);
    ok('cinco verduras en una comida = 1 ración',
       A.w.racionesDia('verduras', LUN) === 1, A.w.racionesDia('verduras', LUN));

    /* Pero en dos comidas distintas sí son dos. */
    A.w.state.data.comidas.push(
      fila(LUN,'21:00','cena',{ alimento_id:'', nombre:'Judías', grupo:'verduras' }));
    ok('en dos comidas distintas, 2 raciones',
       A.w.racionesDia('verduras', LUN) === 2, A.w.racionesDia('verduras', LUN));

    /* Dentro de una comida se queda el estado más favorable. */
    A.w.state.data.comidas.push(
      fila(LUN,'13:30','comida',{ alimento_id:'', nombre:'Pimiento',
                                  grupo:'verduras', estado_toma:'rechazo' }));
    ok('un rechazo dentro de la comida no borra lo que sí comió',
       A.w.racionesDia('verduras', LUN) === 2, A.w.racionesDia('verduras', LUN));
    A.dom.window.close();
  }

  console.log('\n--- TOCAR UNA COMIDA VACÍA LA ABRE YA EN SU SITIO ---');
  {
    const A = abrir([]);
    await espera(700);
    A.w.ir('alimentacion');
    const mer = A.d.querySelector('[data-nuevacomida="merienda"]');
    ok('la merienda vacía se ofrece', !!mer);
    A.click(mer);
    await espera(60);
    ok('y se abre ya como merienda, sin elegirlo a mano',
       A.w.borrador.tipo_comida === 'merienda', A.w.borrador.tipo_comida);
    A.dom.window.close();
  }

  console.log('\n--- QUÉ CONVIENE PARA LA SIGUIENTE COMIDA ---');
  {
    const A = abrir([
      fila(LUN,'13:30','comida',{ alimento_id:'', nombre:'Legumbres', grupo:'legumbres' }),
      fila(HOY,'09:00','desayuno',{ alimento_id:'a2', nombre:'Manzana', grupo:'fruta' }),
      fila(HOY,'13:30','comida',{ alimento_id:'', nombre:'Legumbres', grupo:'legumbres' })
    ]);
    await espera(700);
    A.w.ir('alimentacion');
    const c = A.cuerpo();
    ok('propone lo que falta', c.indexOf('Pescado') >= 0 || c.indexOf('Verdura') >= 0,
       c.slice(0,240));
    ok('y dice lo que ya está cubierto hoy',
       c.indexOf('no hace falta insistir') >= 0, c.slice(0,300));
    ok('sin juzgar', c.indexOf('ha comido mal') < 0);
    ok('esto no llama a la IA', A.posts.filter(p => p.action === 'interpretaPlato').length === 0);
    A.dom.window.close();
  }

  console.log('\n--- SI LA IA FALLA, DICE POR QUÉ ---');
  {
    const A = await formulario([], { ok:true, data:{ nombre:'Sushi', grupos:[],
      fuente:'nada', aviso:'OpenAI: You exceeded your current quota.' }});
    A.d.querySelector('#inPlato').value = 'Sushi';
    A.click(A.d.querySelector('#btnPlato'));
    await espera(220);
    ok('el motivo real, no un "no ha respondido" que no ayuda',
       A.hoja().indexOf('exceeded your current quota') >= 0, A.hoja().slice(0,200));
    ok('y los checks siguen ahí para marcarlos a mano',
       A.d.querySelectorAll('.gchip[data-g]').length === OBJ.length);
    A.dom.window.close();
  }

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
