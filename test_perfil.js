/* GINapp — tests de Perfil y Mensajes (jsdom)
   Correr desde la carpeta del repo:  node test_perfil.js                   */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19', MES = '2026-08';

/* Agosto 2026: del 1 al 15 mamá, del 16 al 31 papá → 16 días de papá */
const CUSTODIA = [];
for(let d = 1; d <= 31; d++){
  CUSTODIA.push({ fecha:'2026-08-'+String(d).padStart(2,'0'),
                  username: d >= 16 ? 'papa' : 'mama', origen:'convenio' });
}

const MENSAJES = [
  { id:'m1', fecha:'2026-08-19', autor:'mama',
    texto:'He añadido el informe del dentista. Todo correcto, revisión en 6 meses.',
    leido_por:'', leido_ts:'', timestamp:'2026-08-19T10:24:00.000Z' },
  { id:'m2', fecha:'2026-08-18', autor:'papa',
    texto:'El martes la recojo yo a las 17:00, tengo el día libre.',
    leido_por:'mama', leido_ts:'2026-08-18T19:02:00.000Z',
    timestamp:'2026-08-18T18:40:00.000Z' },
  { id:'m3', fecha:'2026-08-17', autor:'papa',
    texto:'Se ha dejado el bañador en tu casa.',
    leido_por:'', leido_ts:'', timestamp:'2026-08-17T09:10:00.000Z' },
  { id:'m4', fecha:'2026-08-16', autor:'mama', texto:'Vale, se lo llevo el jueves.',
    leido_por:'papa', leido_ts:'2026-08-16T12:00:00.000Z',
    timestamp:'2026-08-16T11:30:00.000Z' }
];

const ACTIVIDAD = [
  { id:'a1', timestamp:'2026-08-19T08:15:00.000Z', username:'papa', seccion:'calendario',
    accion:'crea_evento', detalle:'Natación' },
  { id:'a2', timestamp:'2026-08-18T18:42:00.000Z', username:'papa', seccion:'gastos',
    accion:'crea_gasto', detalle:'Clases de inglés · 45,00 €' },
  { id:'a3', timestamp:'2026-08-18T14:10:00.000Z', username:'papa', seccion:'alimentacion',
    accion:'registra_comida', detalle:'comida · 3 alimentos' },
  { id:'a4', timestamp:'2026-08-18T21:30:00.000Z', username:'mama', seccion:'salud',
    accion:'crea_episodio', detalle:'Fiebre' },
  { id:'a5', timestamp:'2026-08-17T11:05:00.000Z', username:'papa', seccion:'salud',
    accion:'sube_documento', detalle:'Informe pediátrico' }
];

const BOOT = { ok:true, data:{
  version:'0.7.0', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', cuota_mensual:'250' },
  usuarios:[{username:'papa',nombre:'Papá',rol:'progenitor',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',rol:'progenitor',color:'#E4575B',activo:true},
            {username:'gina',nombre:'Gina',rol:'hija',color:'#8B62D9',activo:false}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',ancla_fecha:'2026-08-21',ancla_usuario:'papa'}],
  custodia:CUSTODIA,
  eventos:[{ id:'e1', fecha:'2026-08-20', hora:'17:00', titulo:'Inglés',
             tipo:'actividad_cole', repite:'no' },
           { id:'e2', fecha:'2026-08-05', hora:'18:00', titulo:'Natación',
             tipo:'actividad_cole', repite:'no' }],
  eventos_excepciones:[],
  tipos_evento:[{id:'actividad_cole',nombre:'Actividad cole',emoji:'🎨',color:'#6366F1'}],
  gastos:[{id:'g1',fecha:'2026-08-15',categoria:'salud',descripcion:'Dentista',importe:65,
           origen:'comun',compartido:true,reembolso_id:'',creado_por:'papa'},
          {id:'g2',fecha:'2026-08-08',categoria:'ropa',descripcion:'Zapatillas',importe:80,
           origen:'papa',compartido:true,reembolso_id:'',creado_por:'papa'},
          /* De mamá: no tiene que contar en el resumen de papá. */
          {id:'g3',fecha:'2026-08-09',categoria:'ropa',descripcion:'Abrigo',importe:40,
           origen:'mama',compartido:true,reembolso_id:'',creado_por:'mama'},
          /* Adelantado por papá pero YA devuelto: sigue siendo suyo, pero
             no está pendiente. */
          {id:'g4',fecha:'2026-08-04',categoria:'salud',descripcion:'Farmacia',importe:12,
           origen:'papa',compartido:true,reembolso_id:'mv9',creado_por:'papa'}],
  cuenta:[{id:'mv1',fecha:'2026-08-01',tipo:'aporte',username:'papa',importe:250},
          {id:'mv2',fecha:'2026-08-03',tipo:'aporte',username:'mama',importe:190}],
  liquidaciones:[],
  categorias_gasto:[{id:'salud',nombre:'Salud',emoji:'🩺',color:'#0E9384'},
                    {id:'ropa',nombre:'Ropa',emoji:'👕',color:'#F43F5E'}],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:[{id:'ci1',fecha:'2026-08-21',hora:'17:30',tipo:'dentista',motivo:'Dentista',
          centro:'Clínica Sonríe'}],
  medicacion:[], dosis:[],
  episodios:[{id:'ep1',fecha:'2026-08-18',hora:'21:30',tipo:'fiebre',descripcion:'Fiebre',
              temperatura:38.2,creado_por:'mama',timestamp:'2026-08-18T21:30:00.000Z'}],
  vacunas:[], crecimiento:[], documentos:[],
  mensajes:MENSAJES, actividad:ACTIVIDAD, visitas:[]
}};

const posts = [];
const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        posts.push(JSON.parse(o.body));
        return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ id:'x' } }) });
      }
      const q = new URL(String(u),'https://x/').searchParams;
      if(q.get('action') === 'login'){
        const n = q.get('username');
        return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{
          token:n+'.9999999999999.x', username:n,
          nombre:n==='mama'?'Mamá':'Papá', modo:'confianza' } }) });
      }
      return Promise.resolve({ json:()=>Promise.resolve(BOOT) });
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
function click(el){ el.dispatchEvent(new dom.window.Event('click',{bubbles:true})); }

setTimeout(() => {
  const w = dom.window, d = w.document;

  console.log('\n--- LA NAV ---');
  const btns = [...d.querySelectorAll('#nav button')];
  ok('tiene 6 secciones', btns.length === 6, btns.length);
  const bPf = btns.find(b => b.dataset.s === 'perfil');
  ok('la última lleva el nombre del perfil activo',
     bPf && bPf.textContent.indexOf('Papá') >= 0, bPf && bPf.textContent);
  ok('avisa de mensajes sin leer con un contador', bPf && !!bPf.querySelector('i.pill'));

  click(bPf);
  const cuerpo = () => d.querySelector('#pfCuerpo').textContent.replace(/\s+/g,' ');

  console.log('\n--- CABECERA ---');
  ok('saluda con el nombre', cuerpo().indexOf('Papá') >= 0);
  ok('dice desde qué punto de vista se mira',
     cuerpo().indexOf('desde el punto de vista de papá') >= 0);
  ok('marca el perfil como activo', cuerpo().indexOf('Perfil activo') >= 0);

  console.log('\n--- LAS TRES CIFRAS ---');
  const dc = w.diasConmigoEnMes('papa', MES);
  ok('16 días de papá en agosto', dc.n === 16 && dc.total === 31, dc.n + '/' + dc.total);
  ok('lo muestra', cuerpo().indexOf('16 días') >= 0 && cuerpo().indexOf('de 31') >= 0);
  ok('la aportación sale de la cuenta', cuerpo().indexOf('250,00 €') >= 0);
  ok('y dice que va al día', cuerpo().indexOf('Al día') >= 0);
  // papá adelantó 80 € compartidos que nadie le ha devuelto
  ok('los 80 € adelantados salen como «te deben»',
     cuerpo().indexOf('Te deben') >= 0 && cuerpo().indexOf('80,00 €') >= 0,
     cuerpo().match(/Te deben.{0,30}/));

  console.log('\n--- MISMO MES, OTRO PERFIL ---');
  const dm = w.diasConmigoEnMes('mama', MES);
  ok('mamá tiene 15 días', dm.n === 15, dm.n);
  ok('y los dos suman el mes entero', dc.n + dm.n === 31);

  console.log('\n--- RESUMEN DEL MES ---');
  ok('cuenta los eventos del mes ya pasados', w.eventosDelMes(MES).pasados >= 1,
     JSON.stringify(w.eventosDelMes(MES)));
  ok('sin datos de comida no inventa un ICH', w.ichMedioMes(MES) === null);

  /* ============================================================
     Estas tarjetas son del USUARIO, no de la casa. Los totales del
     hogar ya están en Gastos y en Calendario; repetirlos aquí no daba
     ninguna razón para no entrar directamente en la sección.
     ============================================================ */
  console.log('\n--- LO QUE HAS HECHO TÚ ---');
  const m = w.miMes(MES);
  ok('la sección se titula por lo que hace el usuario',
     cuerpo().indexOf('Lo que has hecho') >= 0, cuerpo().match(/Lo que.{0,30}/));
  ok('cuenta los gastos que ha apuntado él', m.gastos === 3, m.gastos);
  ok('y NO el que apuntó mamá', m.gastadoTotal === 157, m.gastadoTotal);
  ok('adelantado = lo suyo, compartido y sin devolver', m.adelantado === 80, m.adelantado);
  ok('lo ya devuelto no cuenta como pendiente', m.sinDevolver === 1, m.sinDevolver);
  ok('sale en pantalla', cuerpo().indexOf('Has adelantado') >= 0 &&
     cuerpo().indexOf('80,00 €') >= 0, cuerpo().match(/Has adelantado.{0,30}/));
  ok('los registros de salud son los suyos: el episodio es de mamá',
     m.salud === 0, m.salud);

  console.log('\n--- Y CABE ---');
  /* El motivo del rediseño: en 2×2 cada tarjeta medía 195px y no había
     sitio para dos cifras con sus etiquetas. Una fila por sección. */
  ok('las tarjetas van apiladas, no en rejilla de dos',
     w.getComputedStyle(d.querySelector('.pf-res')).flexDirection === 'column',
     w.getComputedStyle(d.querySelector('.pf-res')).display + ' ' +
     w.getComputedStyle(d.querySelector('.pf-res')).flexDirection);
  ok('hay una tarjeta por sección', d.querySelectorAll('.pf-r').length === 4,
     d.querySelectorAll('.pf-r').length);
  ok('y los registros del mes', w.registrosSaludMes(MES) === 1, w.registrosSaludMes(MES));

  console.log('\n--- MENSAJES: TABLÓN, NO CHAT ---');
  // m1 es de mamá y está sin leer. m3 está sin leer pero lo escribió papá:
  // tu propio mensaje sin leer es cosa del otro, no un pendiente tuyo.
  ok('1 mensaje sin leer para papá', w.mensajesSinLeer().length === 1,
     w.mensajesSinLeer().map(m=>m.id).join(','));
  ok('los propios sin leer NO cuentan como pendientes tuyos',
     !w.mensajesSinLeer().some(m => m.autor === 'papa'),
     w.mensajesSinLeer().map(m=>m.autor).join(','));
  ok('el más reciente va arriba', w.mensajesOrdenados()[0].id === 'm1');
  ok('se ve el mensaje de mamá', cuerpo().indexOf('informe del dentista') >= 0);
  ok('un mensaje tuyo leído muestra el acuse',
     (function(){ w.state.msgTodos = true; w.pintarPerfil();
                  return cuerpo().indexOf('Leído por mamá') >= 0; })(),
     cuerpo().match(/Leído por.{0,40}/));
  ok('y uno tuyo sin leer lo dice', cuerpo().indexOf('Sin leer') >= 0);
  ok('explica en qué se diferencia de WhatsApp',
     cuerpo().indexOf('no se edita ni se borra') >= 0);

  console.log('\n--- ENVIAR ---');
  click(d.querySelector('#msgNuevo'));
  ok('se abre la hoja', d.querySelector('#hoja').classList.contains('on'));
  ok('dice a quién va', d.querySelector('#hojaC').textContent.indexOf('Para mamá') >= 0);
  ok('avisa de que no se podrá editar',
     d.querySelector('#hojaC').textContent.indexOf('no se puede editar ni borrar') >= 0);

  const antes = posts.length;
  click(d.querySelector('#msgEnviar'));
  ok('no envía un mensaje vacío', posts.length === antes);
  ok('y lo dice', d.querySelector('#toast').textContent.indexOf('vacío') >= 0);

  d.querySelector('#msgTexto').value = 'La mochila del cole se queda en mi casa esta semana.';
  click(d.querySelector('#msgEnviar'));
  setTimeout(() => {
    ok('ahora sí envía', posts.length === antes + 1);
    const p = posts[posts.length-1];
    ok('la acción es saveMensaje', p && p.action === 'saveMensaje', p && p.action);
    ok('con el autor', p && p.payload.autor === 'papa');
    ok('y el texto', p && p.payload.texto.indexOf('mochila') >= 0);
    ok('NO manda id: un mensaje nuevo nunca sobrescribe otro', p && !p.payload.id);

    console.log('\n--- ACUSE DE LECTURA ---');
    const antes2 = posts.length;
    w.abrirMensaje('m1');                       // mensaje de mamá, sin leer
    setTimeout(() => {
      ok('abrir un mensaje del otro lo marca leído', posts.length === antes2 + 1);
      const pl = posts[posts.length-1];
      ok('con la acción marcarLeido', pl && pl.action === 'marcarLeido', pl && pl.action);
      ok('y con quién lo leyó', pl && pl.username === 'papa');

      const antes3 = posts.length;
      w.abrirMensaje('m3');                     // mensaje propio, sin leer
      setTimeout(() => {
        ok('abrir un mensaje propio NO lo marca leído', posts.length === antes3);
        const antes4 = posts.length;
        w.abrirMensaje('m4');                   // de mamá, ya leído
        setTimeout(() => {
          ok('un mensaje ya leído no se vuelve a marcar', posts.length === antes4);

          console.log('\n--- NO SE PUEDEN BORRAR ---');
          ok('no existe ningún botón de borrar mensaje',
             !d.querySelector('[id*="msgBorrar"]') &&
             d.body.innerHTML.indexOf('deleteMensaje') < 0);

          console.log('\n--- MI ACTIVIDAD ---');
          w.state.pfTodaAct = true; w.pintarPerfil();
          const act = cuerpo();
          ok('solo lista lo mío', act.indexOf('Natación') >= 0 && act.indexOf('Fiebre') < 0);
          ok('en primera persona', act.indexOf('Has añadido un evento') >= 0);
          ok('con el detalle', act.indexOf('Clases de inglés') >= 0);
          ok('y ordenado por hora', act.indexOf('Natación') < act.indexOf('Clases de inglés'));

          console.log('\n--- CAMBIO DE PERFIL ---');
          click(d.querySelector('#pfAjustes'));
          click(d.querySelector('#ajPerfil'));
          const optM = d.querySelector('[data-user="mama"]');
          ok('los ajustes llevan al cambio de perfil', !!optM);
          if(optM) click(optM);
          /* Cambiar de perfil es re-identificarse contra el backend: es asíncrono. */
          setTimeout(() => {
            w.ir('perfil');
            ok('el perfil pasa a mamá', cuerpo().indexOf('Mamá') >= 0);
            ok('y los días cambian a 15', cuerpo().indexOf('15 días') >= 0,
               cuerpo().match(/\d+ días/));
            ok('la nav también', [...d.querySelectorAll('#nav button')]
               .find(b => b.dataset.s==='perfil').textContent.indexOf('Mamá') >= 0);

            console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
            process.exit(fallos ? 1 : 0);
          }, 200);
        }, 160);
      }, 160);
    }, 200);
  }, 220);
}, 700);
