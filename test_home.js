const fs=require('fs'), path=require('path'), {JSDOM}=require('jsdom');
/* Fragmento real del calendario del convenio (10 ago - 15 sep 2026) */
const cust={"2026-08-10": "mama", "2026-08-11": "mama", "2026-08-12": "mama", "2026-08-13": "mama", "2026-08-14": "mama", "2026-08-15": "mama", "2026-08-16": "papa", "2026-08-17": "papa", "2026-08-18": "papa", "2026-08-19": "papa", "2026-08-20": "papa", "2026-08-21": "papa", "2026-08-22": "papa", "2026-08-23": "papa", "2026-08-24": "papa", "2026-08-25": "papa", "2026-08-26": "papa", "2026-08-27": "papa", "2026-08-28": "papa", "2026-08-29": "papa", "2026-08-30": "papa", "2026-08-31": "papa", "2026-09-05": "mama", "2026-09-06": "mama", "2026-09-07": "papa", "2026-09-08": "papa", "2026-09-09": "mama", "2026-09-10": "mama", "2026-09-11": "papa", "2026-09-12": "papa", "2026-09-13": "papa", "2026-09-14": "papa", "2026-09-15": "papa"};
const HOY='2026-08-19';

const custodia=Object.keys(cust)
  .map(f=>({fecha:f, username:cust[f], origen:'convenio', motivo:'', creado_por:'convenio'}));

const BOOT={ ok:true, data:{
  version:'0.3.0', hoy:HOY,
  config:{nombre_hija:'Georgina',nombre_corto:'Gina',moneda:'€',dias_min_ich:'3'},
  usuarios:[{username:'papa',nombre:'Papá',color:'#2563EB',emoji:'👨',activo:true},
            {username:'mama',nombre:'Mamá',color:'#F43F5E',emoji:'👩',activo:true}],
  patron:[{id:'curso',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',hora_cambio_finde:'20:00',
           ancla_fecha:'2026-08-21',ancla_usuario:'papa',prioridad:1,desde:'',hasta:''}],
  custodia:custodia,
  eventos:[
    {id:'e1',fecha:'2026-08-19',hora:'17:30',titulo:'Dentista',tipo:'salud',
     lugar:'Clínica Sant Jordi',responsable:'papa',accion:'Llevar la tarjeta sanitaria.',repite:'no'},
    {id:'e2',fecha:'2026-09-01',hora:'18:00',titulo:'Natación',tipo:'deporte',
     responsable:'mama',repite:'semanal',repite_dias:'mar',repite_hasta:'2027-06-30'},
    {id:'e3',fecha:'2026-08-20',hora:'17:00',titulo:'Inglés',tipo:'estudio',repite:'no'},
    {id:'e4',fecha:'2026-08-20',hora:'19:00',titulo:'Cumple Marta',tipo:'cumple',repite:'no'},
    {id:'e5',fecha:'2026-08-24',hora:'09:00',titulo:'Excursión',tipo:'estudio',repite:'no',
     accion:'Llevar la autorización firmada.'}
  ],
  eventos_excepciones:[],
  tipos_evento:[{id:'salud',nombre:'Salud',emoji:'🩺',color:'#0E9384'},
                {id:'deporte',nombre:'Deporte',emoji:'⚽',color:'#0BA5EC'},
                {id:'estudio',nombre:'Estudio',emoji:'📚',color:'#F43F5E'},
                {id:'cumple',nombre:'Cumpleaños',emoji:'🎂',color:'#F79009'}],
  gastos:[{id:'g1',fecha:'2026-08-18',categoria:'educacion',descripcion:'Clases de inglés',
           importe:45,origen:'comun',compartido:true,reembolso_id:''},
          {id:'g2',fecha:'2026-08-10',categoria:'salud',descripcion:'Dentista',
           importe:100,origen:'papa',compartido:true,reembolso_id:''},
          {id:'g3',fecha:'2026-08-05',categoria:'ropa',descripcion:'Abrigo',
           importe:60,origen:'papa',compartido:false,reembolso_id:''}],
  /* 500 € aportados − 45 € pagados desde la común = 455 € de saldo.
     Los 100 € que adelantó papá siguen pendientes de devolución. */
  cuenta:[{id:'mv1',fecha:'2026-08-01',tipo:'aporte',username:'papa',importe:250},
          {id:'mv2',fecha:'2026-08-01',tipo:'aporte',username:'mama',importe:250}],
  liquidaciones:[], categorias_gasto:[],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:[{id:'c1',fecha:'2026-09-12',hora:'10:30',tipo:'pediatra',motivo:'Revisión'}],
  medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[], documentos:[],
  actividad:[{id:'a1',timestamp:'2026-08-18T19:22:00.000Z',username:'mama',seccion:'gastos',
              accion:'crea_gasto',detalle:'Clases de inglés · 45 €'}],
  visitas:[{username:'papa',seccion:'inicio',ts:'2026-08-18T08:00:00.000Z'}]
}};

const posts = [];
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),{
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    /* El stub responde según la acción: login devuelve token, el resto el bootstrap. */
    w.fetch=(url,opt)=>{
      /* Las escrituras se apuntan en `posts` para poder mirarlas. */
      if(opt && opt.method === 'POST'){
        posts.push(JSON.parse(opt.body));
        return Promise.resolve({json:()=>Promise.resolve({ok:true, data:{id:'x'}})});
      }
      const q=new URL(String(url),'https://x/').searchParams;
      if(q.get('action')==='login'){
        const u=q.get('username');
        return Promise.resolve({json:()=>Promise.resolve({ok:true, data:{
          token:u+'.9999999999999.x', username:u,
          nombre:u==='mama'?'Mamá':'Papá', modo:'confianza'}})});
      }
      return Promise.resolve({json:()=>Promise.resolve(BOOT)});
    };
    w.scrollTo=()=>{}; w.alert=()=>{}; w.prompt=()=>null;
    Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
    w.localStorage.setItem('ginapp_backend_url','https://script.google.com/x/exec');
    w.localStorage.setItem('ginapp_user','papa');
    w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
  }});

let fallos=0;
function ok(t,c,extra){ if(c) console.log('  ✅ '+t); else {console.log('  ❌ '+t+(extra?'  → '+extra:'')); fallos++;} }

const espera = ms => new Promise(r => setTimeout(r, ms));
setTimeout(async ()=>{
  const w=dom.window, d=w.document;
  const T=s=>(d.querySelector(s)||{}).textContent||'';
  console.log('\n--- CABECERA ---');
  ok('perfil = Papá', T('#pfNom')==='Papá', T('#pfNom'));
  /* Una sola fila: Gina, la campana y quién mira. Dos filas se comían
     media pantalla antes de enseñar nada. */
  const hd = d.querySelector('.hd-top');
  ok('la foto de Gina va en la misma fila que la campana y el perfil',
     hd.contains(d.querySelector('#fotoGina')) && hd.contains(d.querySelector('#btnNov')) &&
     hd.contains(d.querySelector('#btnPerfil')));
  ok('y el nombre también', hd.contains(d.querySelector('#ginaNom')));
  ok('ya no hay una segunda fila de cabecera', !d.querySelector('.hd'));
  ok('ni accesos rápidos duplicando las tarjetas', !d.querySelector('#rapidas'));
  ok('badge de novedades = 1', T('#novN')==='1', T('#novN'));
  ok('splash oculto', d.querySelector('#splash').classList.contains('out'));

  console.log('\n--- HOY (19 ago 2026, según convenio) ---');
  const hoy=T('#cardHoy');
  ok('custodia real del 19/08 = '+cust['2026-08-19'], true);
  ok('no dice ESTIMADO (hay fila del convenio)', hoy.indexOf('ESTIMADO')<0);
  ok('muestra el dentista', hoy.indexOf('Dentista')>=0);
  ok('muestra la hora 17:30', hoy.indexOf('17:30')>=0);
  ok('la nota accionable va pegada al evento visible', hoy.indexOf('tarjeta sanitaria')>=0);
  ok('y NO se repite como tarjeta Recordatorio',
     (d.querySelector('#cardRec').textContent||'').indexOf('tarjeta sanitaria')<0);

  const esperado = cust['2026-08-19']==='papa' ? 'contigo' : 'con mamá';
  ok('dice "'+esperado+'"', hoy.indexOf(esperado)>=0, hoy.slice(0,160).replace(/\s+/g,' '));

  console.log('\n--- TARJETAS ---');
  const secs=T('#secs');
  /* En la portada va el ritmo del mes, no el saldo: el saldo se mira
     cuando vas a pagar algo, y para eso ya entras en la sección. */
  ok('la tarjeta muestra lo gastado en el mes', secs.indexOf('Gastado en agosto')>=0,
     secs.slice(0,200));
  // 45 inglés + 100 dentista + 60 abrigo, todos de agosto
  ok('gastado en agosto = 205,00 €', secs.indexOf('205,00')>=0,
     secs.match(/Gastado en agosto.{0,40}/s));
  ok('y NO el saldo de la cuenta, que es otra cosa', secs.indexOf('455,00')<0);
  // papá adelantó 100 € compartidos; el abrigo de 60 € es suyo y no cuenta
  ok('los 100 € adelantados salen como pendientes de devolver',
     secs.indexOf('100,00 € por devolver')>=0, secs.match(/devolver.{0,30}/s));
  ok('el gasto NO compartido no genera devolución', secs.indexOf('160,00')<0);
  ok('alimentación en estado vacío honesto', secs.indexOf('Sin registros')>=0);
  ok('salud enseña la próxima cita', secs.indexOf('Revisión')>=0);

  console.log('\n--- SEMANA ---');
  const dias=[...d.querySelectorAll('#semDias .d')];
  ok('7 días', dias.length===7, dias.length);
  const lunes=dias[0], hoyCel=dias.find(x=>x.classList.contains('hoy'));
  ok('hay un día marcado como hoy', !!hoyCel);
  ok('el 19 es el día de hoy', hoyCel && hoyCel.textContent.indexOf('19')>=0);
  const clasesOk=dias.every(x=>x.classList.contains('papa')||x.classList.contains('mama'));
  ok('todos los días tienen custodia asignada', clasesOk);
  const jue20=dias[3];
  /* Los títulos ya no caben en una columna de 48px: cada evento de un
     solo día es un punto de su color. */
  ok('el jueves 20 muestra 2 puntos (tiene 2 eventos)',
     jue20.querySelectorAll('.pts i').length===2, jue20.querySelectorAll('.pts i').length);
  ok('un día sin nada no pinta puntos', dias[5].querySelectorAll('.pts i').length===0);
  ok('ya no se recortan títulos dentro del día', !jue20.querySelector('.en'));
  ok('ningún día marcado ESTIMADO (todos del convenio)',
     dias.filter(x=>x.classList.contains('est')).length===0);

  console.log('\n--- RECORDATORIO ---');
  const rec=d.querySelector('#cardRec').textContent||'';
  ok('la excursión del día 24 sí genera recordatorio', rec.indexOf('autorización')>=0, rec);
  ok('el recordatorio nombra el evento', rec.indexOf('Excursión')>=0);

  console.log('\n--- NOVEDADES ---');
  ok('tarjeta de novedades visible', !d.querySelector('#cardNov').hidden);
  ok('atribuye el gasto a Mamá', T('#cardNov').indexOf('Mamá')>=0);

  const click = el => el && el.dispatchEvent(new w.Event('click',{bubbles:true}));

  console.log('\n--- EL RECADO CUELGA DE SU EVENTO ---');
  /* Antes iba en un bloque suelto al final de los dos eventos, así que con
     dos a la vista no se sabía de cuál era. Ahora va DENTRO de su fila. */
  const filaDentista = [...d.querySelectorAll('#cardHoy .ev')]
    .find(e => e.textContent.indexOf('Dentista') >= 0);
  ok('el recado está dentro de la fila del dentista',
     filaDentista && filaDentista.textContent.indexOf('tarjeta sanitaria') >= 0,
     filaDentista && filaDentista.textContent.replace(/\s+/g,' '));
  ok('y no hay ningún bloque suelto al final',
     !d.querySelector('#cardHoy .hoy-nota'));
  const otraFila = [...d.querySelectorAll('#cardHoy .ev')]
    .find(e => e.textContent.indexOf('Dentista') < 0);
  ok('un evento sin recado no lleva ninguno',
     !otraFila || !otraFila.querySelector('.ev-ac'),
     otraFila && otraFila.textContent.replace(/\s+/g,' '));

  console.log('\n--- TOCAR EL EVENTO ABRE SU RESUMEN ---');
  /* Un resumen, no el formulario: para mirar a qué hora era no hace falta
     tener delante la categoría, las repeticiones y las notas. */
  click(filaDentista);
  const hj = () => (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ');
  ok('se abre la hoja del evento', d.querySelector('#hoja').classList.contains('on'));
  ok('y es un resumen, no el formulario', !d.querySelector('#eTit'));
  ok('con su título', hj().indexOf('Dentista') >= 0, hj().slice(0,90));
  ok('cuándo y dónde', hj().indexOf('Clínica Sant Jordi') >= 0);
  ok('el recado, con su check', !!d.querySelector('.rec-tog') &&
     hj().indexOf('tarjeta sanitaria') >= 0);
  ok('y un lápiz para editar', !!d.querySelector('[data-eveditar]'));

  console.log('\n--- Y EL LÁPIZ LLEVA A LA EDICIÓN ---');
  click(d.querySelector('[data-eveditar]'));
  ok('ahora sí es el formulario', (d.querySelector('#eTit')||{}).value === 'Dentista',
     (d.querySelector('#eTit')||{}).value);
  ok('con su recado editable',
     (d.querySelector('#eAccion')||{}).value === 'Llevar la tarjeta sanitaria.',
     (d.querySelector('#eAccion')||{}).value);
  ok('y ofrece borrarlo', !!d.querySelector('#evBorrar'));
  click(d.querySelector('#velo'));

  console.log('\n--- MARCARLO NO LO BORRA ---');
  /* Re-consultar la fila: abrir y cerrar la hoja puede haber repintado la
     portada, y un nodo desconectado del DOM ya no burbujea el click. */
  const fila2 = [...d.querySelectorAll('#cardHoy .ev')]
    .find(e => e.textContent.indexOf('Dentista') >= 0);
  const chk = fila2.querySelector('[data-rectog]');
  ok('hay un check en el recado', !!chk);
  ok('que dice a qué evento y día pertenece',
     chk && chk.dataset.rectog.indexOf('e1|2026-08-19') === 0, chk && chk.dataset.rectog);
  const antesR = posts.length;
  click(chk);
  await espera(60);
  ok('marcarlo manda marcarRecordatorio',
     posts.length === antesR + 1 && posts[antesR].action === 'marcarRecordatorio',
     posts[antesR] && posts[antesR].action);
  ok('con hecho = true', posts[antesR] && posts[antesR].payload.hecho === true);
  ok('y NO toca el evento: el recado se queda',
     posts[antesR] && posts[antesR].action !== 'saveEvento' &&
     w.state.data.eventos.find(e => e.id === 'e1').accion === 'Llevar la tarjeta sanitaria.');
  /* Ya marcado, el mismo check tiene que ofrecer desmarcarlo. */
  w.state.data.recordatorios = [{ id:'r1', evento_id:'e1', fecha:'2026-08-19',
                                  hecho_por:'papa', timestamp:'2026-08-19T08:00:00.000Z' }];
  w.pintarHoy();
  const chk2 = [...d.querySelectorAll('#cardHoy [data-rectog]')]
    .find(x => x.dataset.rectog.indexOf('e1|') === 0);
  ok('una vez hecho, el check queda marcado',
     chk2 && chk2.className.indexOf('on') >= 0, chk2 && chk2.className);
  ok('y al tocarlo se desmarca, no se borra',
     chk2 && chk2.dataset.rectog.slice(-2) === '|0', chk2 && chk2.dataset.rectog);
  const antesD = posts.length;
  click(chk2);
  await espera(60);
  ok('manda hecho = false', posts[antesD] && posts[antesD].payload.hecho === false,
     posts[antesD] && JSON.stringify(posts[antesD].payload.hecho));
  /* Las dos marcas han lanzado su recarga; esperar a que acaben antes de
     seguir, o el resto de asserts miran una pantalla a medio repintar. */
  await espera(150);
  w.state.data.recordatorios = [];
  w.pintarHoy();

  console.log('\n--- NAVEGACIÓN ---');
  const btn=[...d.querySelectorAll('#nav button')].find(b=>b.dataset.s==='gastos');
  btn.dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('cambia a Gastos', !d.querySelector('#s-gastos').hidden && d.querySelector('#s-inicio').hidden);
  const b2=[...d.querySelectorAll('#nav button')].find(b=>b.dataset.s==='inicio');
  b2.dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('vuelve a Inicio', !d.querySelector('#s-inicio').hidden);

  console.log('\n--- SEMANA SIGUIENTE (fuera del convenio importado no, pero probamos nav) ---');
  d.querySelector('#semNext').dispatchEvent(new w.Event('click',{bubbles:true}));
  ok('el título deja de ser "Esta semana"', T('#semTit')!=='Esta semana', T('#semTit'));
  const dias2=[...d.querySelectorAll('#semDias .d')];
  ok('sigue habiendo 7 días', dias2.length===7);

  console.log('\n--- CAMBIO DE PERFIL ---');
  d.querySelector('#btnPerfil').dispatchEvent(new w.Event('click',{bubbles:true}));
  const optMama=d.querySelector('[data-user="mama"]');
  ok('la hoja lista a Mamá', !!optMama);
  if(optMama) optMama.dispatchEvent(new w.Event('click',{bubbles:true}));
}, 700);

/* El cambio de perfil vuelve a identificarse contra el backend: es asíncrono. */
setTimeout(()=>{
  const w=dom.window, d=w.document;
  const T=s=>(d.querySelector(s)||{}).textContent||'';
  ok('perfil pasa a Mamá', T('#pfNom')==='Mamá', T('#pfNom'));
  ok('y estrena token', w.localStorage.getItem('ginapp_token').indexOf('mama.')===0,
     w.localStorage.getItem('ginapp_token'));
  ok('las cuentas son las mismas mire quien mire', T('#secs').indexOf('205,00')>=0,
     T('#secs').match(/Gastado en.{0,40}/s));

  console.log('\n--- DÍAS FUERA DEL CONVENIO (fallback al patrón) ---');
  // salto a una semana de 2028: no hay filas importadas
  for(let i=0;i<80;i++) d.querySelector('#semNext').dispatchEvent(new w.Event('click',{bubbles:true}));
  const d3=[...d.querySelectorAll('#semDias .d')];
  ok('todos marcados como estimados', d3.every(x=>x.classList.contains('est')),
     d3.map(x=>x.className).join(' | '));
  ok('aun así asignan custodia', d3.every(x=>x.classList.contains('papa')||x.classList.contains('mama')));

  console.log('\n'+(fallos?('❌ '+fallos+' fallos'):'✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos?1:0);
}, 1800);   /* el primer bloque ahora espera a las escrituras */
