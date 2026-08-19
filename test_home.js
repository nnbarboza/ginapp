const fs=require('fs'), {JSDOM}=require('jsdom');
const cust=JSON.parse(fs.readFileSync('/tmp/cust_final.json','utf8'));
const HOY='2026-08-19';

const custodia=Object.keys(cust).filter(f=>f>='2026-07-01'&&f<='2026-10-31')
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
    {id:'e4',fecha:'2026-08-20',hora:'19:00',titulo:'Cumple Marta',tipo:'cumple',repite:'no'}
  ],
  eventos_excepciones:[],
  tipos_evento:[{id:'salud',nombre:'Salud',emoji:'🩺',color:'#0E9384'},
                {id:'deporte',nombre:'Deporte',emoji:'⚽',color:'#0BA5EC'},
                {id:'estudio',nombre:'Estudio',emoji:'📚',color:'#F43F5E'},
                {id:'cumple',nombre:'Cumpleaños',emoji:'🎂',color:'#F79009'}],
  gastos:[{id:'g1',fecha:'2026-08-18',categoria:'educacion',descripcion:'Clases de inglés',
           importe:45,pagado_por:'mama',participantes:'papa,mama',liquidacion_id:''},
          {id:'g2',fecha:'2026-08-10',categoria:'salud',descripcion:'Dentista',
           importe:100,pagado_por:'papa',participantes:'papa,mama',liquidacion_id:''},
          {id:'g3',fecha:'2026-08-05',categoria:'ropa',descripcion:'Abrigo',
           importe:60,pagado_por:'papa',participantes:'papa',liquidacion_id:''}],
  liquidaciones:[], categorias_gasto:[],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:[{id:'c1',fecha:'2026-09-12',hora:'10:30',tipo:'pediatra',motivo:'Revisión'}],
  medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[], documentos:[],
  actividad:[{id:'a1',timestamp:'2026-08-18T19:22:00.000Z',username:'mama',seccion:'gastos',
              accion:'crea_gasto',detalle:'Clases de inglés · 45 €'}],
  visitas:[{username:'papa',seccion:'inicio',ts:'2026-08-18T08:00:00.000Z'}]
}};

const dom=new JSDOM(fs.readFileSync('ginapp/index.html','utf8'),{
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch=()=>Promise.resolve({json:()=>Promise.resolve(BOOT)});
    w.scrollTo=()=>{}; w.alert=()=>{}; w.prompt=()=>null;
    Object.defineProperty(w.navigator,'serviceWorker',{value:undefined,configurable:true});
    w.localStorage.setItem('ginapp_backend_url','https://script.google.com/x/exec');
    w.localStorage.setItem('ginapp_user','papa');
  }});

let fallos=0;
function ok(t,c,extra){ if(c) console.log('  ✅ '+t); else {console.log('  ❌ '+t+(extra?'  → '+extra:'')); fallos++;} }

setTimeout(()=>{
  const w=dom.window, d=w.document;
  const T=s=>(d.querySelector(s)||{}).textContent||'';
  console.log('\n--- CABECERA ---');
  ok('perfil = Papá', T('#pfNom')==='Papá', T('#pfNom'));
  ok('badge de novedades = 1', T('#novN')==='1', T('#novN'));
  ok('splash oculto', d.querySelector('#splash').classList.contains('out'));

  console.log('\n--- HOY (19 ago 2026, según convenio) ---');
  const hoy=T('#cardHoy');
  ok('custodia real del 19/08 = '+cust['2026-08-19'], true);
  ok('no dice ESTIMADO (hay fila del convenio)', hoy.indexOf('ESTIMADO')<0);
  ok('muestra el dentista', hoy.indexOf('Dentista')>=0);
  ok('muestra la hora 17:30', hoy.indexOf('17:30')>=0);
  ok('recordatorio con la tarjeta sanitaria', hoy.indexOf('tarjeta sanitaria')>=0);
  const esperado = cust['2026-08-19']==='papa' ? 'contigo' : 'con mamá';
  ok('dice "'+esperado+'"', hoy.indexOf(esperado)>=0, hoy.slice(0,160).replace(/\s+/g,' '));

  console.log('\n--- TARJETAS ---');
  const secs=T('#secs');
  ok('saldo con sujeto (no un número suelto)', /te debe|Le debes|En paz/.test(secs), secs.slice(0,200));
  // papá pagó 100 (mitad mamá=50) y 60 solo suyo; mamá pagó 45 (mitad papá=22,50)
  ok('saldo = 27,50 € a favor de papá', secs.indexOf('27,50')>=0, secs.match(/te debe.{0,40}/s));
  ok('alimentación en estado vacío honesto', secs.indexOf('Sin registros')>=0);
  ok('salud enseña la próxima cita', secs.indexOf('Revisión')>=0);

  console.log('\n--- SEMANA ---');
  const dias=[...d.querySelectorAll('#semDias .dia')];
  ok('7 días', dias.length===7, dias.length);
  const lunes=dias[0], hoyCel=dias.find(x=>x.classList.contains('hoy'));
  ok('hay un día marcado como hoy', !!hoyCel);
  ok('el 19 es el día de hoy', hoyCel && hoyCel.textContent.indexOf('19')>=0);
  const clasesOk=dias.every(x=>x.classList.contains('papa')||x.classList.contains('mama'));
  ok('todos los días tienen custodia asignada', clasesOk);
  const jue20=dias[3];
  ok('el jueves 20 muestra "+1" (tiene 2 eventos)', jue20.textContent.indexOf('+1')>=0, jue20.textContent);
  ok('ningún día marcado ESTIMADO (todos del convenio)',
     dias.filter(x=>x.classList.contains('estimado')).length===0);

  console.log('\n--- NOVEDADES ---');
  ok('tarjeta de novedades visible', !d.querySelector('#cardNov').hidden);
  ok('atribuye el gasto a Mamá', T('#cardNov').indexOf('Mamá')>=0);

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
  const dias2=[...d.querySelectorAll('#semDias .dia')];
  ok('sigue habiendo 7 días', dias2.length===7);

  console.log('\n--- CAMBIO DE PERFIL ---');
  d.querySelector('#btnPerfil').dispatchEvent(new w.Event('click',{bubbles:true}));
  const optMama=d.querySelector('[data-user="mama"]');
  ok('la hoja lista a Mamá', !!optMama);
  if(optMama){
    optMama.dispatchEvent(new w.Event('click',{bubbles:true}));
    ok('perfil pasa a Mamá', T('#pfNom')==='Mamá', T('#pfNom'));
    ok('el saldo se invierte', T('#secs').indexOf('Le debes')>=0, T('#secs').match(/Saldo.{0,60}/s));
  }

  console.log('\n--- DÍAS FUERA DEL CONVENIO (fallback al patrón) ---');
  // salto a una semana de 2028: no hay filas importadas
  for(let i=0;i<80;i++) d.querySelector('#semNext').dispatchEvent(new w.Event('click',{bubbles:true}));
  const d3=[...d.querySelectorAll('#semDias .dia')];
  ok('todos marcados como estimados', d3.every(x=>x.classList.contains('estimado')),
     d3.map(x=>x.className).join(' | '));
  ok('aun así asignan custodia', d3.every(x=>x.classList.contains('papa')||x.classList.contains('mama')));

  console.log('\n'+(fallos?('❌ '+fallos+' fallos'):'✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos?1:0);
}, 700);
