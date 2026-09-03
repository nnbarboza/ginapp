/* GINapp — tests de la sección Calendario (jsdom)
   Correr desde la carpeta del repo:  node test_calendario.js              */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';   // miércoles

const TIPOS = [
  ['vacaciones','Vacaciones','🏖️','#F59E0B'], ['tareas','Tareas','📋','#64748B'],
  ['excursiones','Excursiones','🥾','#0E9384'], ['dentista','Dentista','🦷','#0891B2'],
  ['medico','Médico','🩺','#10B981'], ['sin_clases','Sin clases','🏫','#84CC16'],
  ['actividad_cole','Actividad cole','🎨','#6366F1'], ['cumples','Cumples','🎂','#EC4899'],
  ['viajes','Viajes','✈️','#F97316'], ['otros','Otros','📌','#94A3B8']
].map(t => ({ id:t[0], nombre:t[1], emoji:t[2], color:t[3], activo:true,
              festivo: t[0] === 'vacaciones' || t[0] === 'sin_clases' }));

const EVENTOS = [
  { id:'e1', fecha:'2026-08-19', hora:'17:00', titulo:'Logopedia', tipo:'actividad_cole',
    lugar:'Centro Sarrià', responsable:'papa', repite:'no', creado_por:'papa' },
  { id:'e2', fecha:'2026-08-03', hora:'18:00', titulo:'Natación', tipo:'actividad_cole',
    lugar:'Piscina Municipal', responsable:'', repite:'semanal', repite_dias:'lun,mie',
    repite_hasta:'2027-06-30', creado_por:'mama' },
  { id:'e3', fecha:'2026-08-24', fecha_fin:'2026-08-28', titulo:'Casal de verano',
    tipo:'sin_clases', lugar:'Escola Nova', responsable:'mama', repite:'no', creado_por:'mama' },
  { id:'e4', fecha:'2026-09-12', titulo:'Cumpleaños Gina', tipo:'cumples',
    responsable:'', repite:'no', creado_por:'papa' },
  { id:'e5', fecha:'2026-08-20', hora:'09:00', titulo:'Excursión al Montseny',
    tipo:'excursiones', responsable:'papa', accion:'Llevar la autorización firmada.',
    repite:'no', creado_por:'papa' }
];
/* Una cita de Salud: tiene que salir en el calendario sin duplicarla (§35) */
const CITAS = [
  { id:'ci1', fecha:'2026-08-19', hora:'17:30', tipo:'dentista', centro:'Clínica Sonríe',
    motivo:'Revisión rutinaria', acompana:'papa', creado_por:'papa',
    timestamp:'2026-08-01T10:00:00.000Z' }
];
/* Del 16 al 31 de agosto es de papá (segunda quincena, año par) */
const CUSTODIA = [];
for(let d = 1; d <= 31; d++){
  const f = '2026-08-' + String(d).padStart(2,'0');
  CUSTODIA.push({ fecha:f, username: d >= 16 ? 'papa' : 'mama', origen:'convenio' });
}
CUSTODIA.push({ fecha:'2026-09-01', username:'mama', origen:'convenio' });

const BOOT = { ok:true, data:{
  version:'0.6.0', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina' },
  usuarios:[{username:'papa',nombre:'Papá',rol:'progenitor',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',rol:'progenitor',color:'#E4575B',activo:true},
            {username:'gina',nombre:'Gina',rol:'hija',color:'#8B62D9',activo:false},
            {username:'avis',nombre:'Els avis',rol:'abuelos',color:'#6E8B5C',activo:false}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',hora_cambio_finde:'20:00',
           ancla_fecha:'2026-08-21',ancla_usuario:'papa'}],
  custodia:CUSTODIA, eventos:EVENTOS, eventos_excepciones:[], tipos_evento:TIPOS,
  comentarios:[{ id:'n1', entidad:'evento', ref_id:'e1', texto:'Va con la mochila azul',
                 autor:'mama', timestamp:'2026-08-18T10:00:00.000Z' }],
  recordatorios:[],
  gastos:[], cuenta:[], liquidaciones:[], categorias_gasto:[],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:CITAS, medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
  documentos:[], actividad:[], visitas:[]
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
  click([...d.querySelectorAll('#nav button')].find(b => b.dataset.s === 'calendario'));
  const cuerpo = () => d.querySelector('#calCuerpo').textContent.replace(/\s+/g,' ');
  const celdas = () => [...d.querySelectorAll('.cd')];

  console.log('\n--- REJILLA DEL MES ---');
  ok('arranca en el mes de hoy', w.state.calMes === '2026-08', w.state.calMes);
  ok('semanas completas: múltiplo de 7', celdas().length % 7 === 0, celdas().length);
  ok('agosto de 2026 empieza en sábado: 5 huecos delante',
     celdas().filter(c => c.classList.contains('fuera')).length >= 5);
  const c19 = celdas().find(c => c.dataset.caldia === '2026-08-19');
  ok('el 19 está marcado como hoy', c19 && c19.classList.contains('hoy'));
  ok('y pintado del color de papá', c19 && c19.classList.contains('papa'));
  const c10 = celdas().find(c => c.dataset.caldia === '2026-08-10');
  ok('el 10 sale del color de mamá', c10 && c10.classList.contains('mama'));
  ok('la leyenda solo tiene dos casas',
     cuerpo().indexOf('Con papá') >= 0 && cuerpo().indexOf('Con mamá') >= 0 &&
     cuerpo().indexOf('Con Gina') < 0);

  console.log('\n--- PUNTOS Y BANDAS ---');
  ok('el 19 tiene puntos de evento', c19 && c19.querySelectorAll('.pts i').length >= 2,
     c19 && c19.querySelectorAll('.pts i').length);
  /* Los huecos se pintan siempre para que todas las celdas midan igual;
     una banda "existe" cuando su hueco lleva color. */
  const bandas = c => [...c.querySelectorAll('.bnds i')]
    .filter(i => i.style.background).length;
  const c25 = celdas().find(c => c.dataset.caldia === '2026-08-25');
  ok('un evento de varios días se pinta como banda, no como punto',
     c25 && bandas(c25) === 1 && c25.querySelectorAll('.pts i').length === 0,
     c25 && (bandas(c25) + '/' + c25.querySelectorAll('.pts i').length));
  ok('la banda cubre todos los días del casal',
     ['2026-08-24','2026-08-26','2026-08-28'].every(f =>
       bandas(celdas().find(c => c.dataset.caldia === f)) === 1));
  ok('y no se cuela en el día siguiente',
     bandas(celdas().find(c => c.dataset.caldia === '2026-08-29')) === 0);
  ok('todas las celdas miden lo mismo, lleven algo o no',
     new Set(celdas().map(c => c.className.indexOf('cd') === 0)).size === 1);
  ok('los huecos están reservados aunque el día esté vacío',
     celdas().every(c => c.querySelectorAll('.bnds i').length === 3 && !!c.querySelector('.pts')));
  /* Con más tramos que huecos, el último se pinta a rayas: dice que hay
     más sin mentir sobre cuántos. */
  ok('con más de tres tramos avisa de que hay más',
     (function(){
       const ev = w.state.data.eventos;
       w.state.data.eventos = ev.concat([1,2,3,4].map(n => ({
         id:'x'+n, fecha:'2026-08-10', fecha_fin:'2026-08-20',
         titulo:'Tramo '+n, tipo:'vacaciones', repite:'no', creado_por:'papa' })));
       w.pintarCalendario();
       const c = celdas().find(x => x.dataset.caldia === '2026-08-15');
       const r = !!c.querySelector('.bnds i.mas');
       w.state.data.eventos = ev; w.pintarCalendario();
       return r;
     })());

  console.log('\n--- LAS CITAS MÉDICAS SALEN AQUÍ (§35) ---');
  const ag19 = w.agendaDe('2026-08-19');
  ok('el 19 tiene 3 cosas: logopedia, natación y la cita', ag19.length === 3, ag19.length);
  ok('la cita del dentista aparece', ag19.some(o => o.ev.titulo === 'Revisión rutinaria'));
  ok('marcada como cita, no como evento', ag19.some(o => o.ev._cita === true));
  ok('ordenadas por hora',
     ag19[0].hora === '17:00' && ag19[1].hora === '17:30' && ag19[2].hora === '18:00',
     ag19.map(o => o.hora).join(' '));
  ok('se ve en el detalle del día', cuerpo().indexOf('Revisión rutinaria') >= 0);
  ok('con su centro', cuerpo().indexOf('Clínica Sonríe') >= 0);

  console.log('\n--- REPETICIONES GENERADAS, NO GUARDADAS ---');
  ok('solo hay 5 eventos guardados', BOOT.data.eventos.length === 5);
  ok('la natación cae los miércoles', w.agendaDe('2026-08-26').some(o => o.ev.id === 'e2'));
  ok('y los lunes', w.agendaDe('2026-08-31').some(o => o.ev.id === 'e2'));
  ok('pero no los martes', !w.agendaDe('2026-08-25').some(o => o.ev.id === 'e2'));
  ok('ni antes de empezar', !w.agendaDe('2026-07-29').some(o => o.ev.id === 'e2'));
  ok('ni después de la fecha tope', !w.agendaDe('2027-09-01').some(o => o.ev.id === 'e2'));

  console.log('\n--- DETALLE DEL DÍA ---');
  ok('dice con quién está', cuerpo().indexOf('Con papá') >= 0);
  /* Aquí se avisaba del cambio de casa la víspera: si hoy duerme con papá
     y mañana con mamá, ponía "Cambio de casa: pasa con mamá" HOY. Con el
     modelo (cada día dice dónde duerme esa noche) el cambio es mañana, no
     hoy. La etiqueta adelantaba un día y el color ya lo cuenta. */
  ok('el detalle NO adelanta el cambio a la víspera',
     (function(){
       w.state.calDia = '2026-08-31'; w.pintarCalendario();
       const t = cuerpo();
       w.state.calDia = HOY; w.pintarCalendario();
       return t.indexOf('Cambio de casa') < 0;
     })(), cuerpo().match(/Cambio de casa.{0,50}/));

  console.log('\n--- DÍAS SIN COLE ---');
  /* Qué cuenta como festivo lo dice el Sheet (columna `festivo`), no una
     lista de ids clavada en el código. */
  const cel = f => celdas().find(c => c.dataset.caldia === f);
  ok('un día del casal marca el número', cel('2026-08-25').classList.contains('fest'));
  ok('todos los días del tramo, no solo el primero',
     ['2026-08-24','2026-08-26','2026-08-28'].every(f => cel(f).classList.contains('fest')));
  ok('el día siguiente ya no', !cel('2026-08-29').classList.contains('fest'));
  ok('un día con logopedia NO es festivo: esa categoría no lo es',
     !cel('2026-08-19').classList.contains('fest'));
  ok('si el Sheet deja de marcar la categoría, deja de marcarse el día',
     (function(){
       const t = w.state.data.tipos_evento.find(x => x.id === 'sin_clases');
       t.festivo = false; w.pintarCalendario();
       const r = !celdas().find(c => c.dataset.caldia === '2026-08-25')
         .classList.contains('fest');
       t.festivo = true; w.pintarCalendario();
       return r;
     })());

  console.log('\n--- LOS FILTROS TAMBIÉN FILTRAN LOS DESTACADOS ---');
  ok('sin filtro, el titular es el de siempre',
     cuerpo().indexOf('Próximos eventos destacados') >= 0);
  click(d.querySelector('[data-calcat="cumples"]'));
  ok('con filtro, el titular dice de qué',
     cuerpo().indexOf('Próximos · Cumples') >= 0, cuerpo().match(/Próximos.{0,30}/));
  ok('sale el cumpleaños', cuerpo().indexOf('Cumpleaños Gina') >= 0);
  ok('y NO el casal, que es de otra categoría',
     (d.querySelector('.dest')||{}).textContent.indexOf('Casal') < 0,
     (d.querySelector('.dest')||{}).textContent);
  click(d.querySelector('[data-calcat="dentista"]'));
  ok('una categoría sin nada próximo lo dice, no se calla',
     cuerpo().indexOf('Nada de esta categoría en los próximos meses') >= 0,
     (d.querySelector('.dest')||{}).textContent);
  click(d.querySelector('[data-calcat=""]'));
  ok('al quitar el filtro vuelve la selección de siempre',
     cuerpo().indexOf('Próximos eventos destacados') >= 0 &&
     cuerpo().indexOf('Casal') >= 0);

  console.log('\n--- TOCAR UN DÍA ---');
  click(celdas().find(c => c.dataset.caldia === '2026-08-24'));
  ok('cambia el día seleccionado', w.state.calDia === '2026-08-24');
  ok('y el detalle muestra el casal', cuerpo().indexOf('Casal de verano') >= 0);
  click(celdas().find(c => c.dataset.caldia === '2026-09-01'));
  ok('tocar un día de otro mes salta de mes', w.state.calMes === '2026-09', w.state.calMes);

  click(d.querySelector('#calHoy'));
  ok('el botón Hoy vuelve al día de hoy',
     w.state.calDia === HOY && w.state.calMes === '2026-08');

  console.log('\n--- FILTRO POR CATEGORÍA ---');
  click(d.querySelector('[data-calcat="dentista"]'));
  ok('filtra el detalle', cuerpo().indexOf('Logopedia') < 0 &&
     cuerpo().indexOf('Revisión rutinaria') >= 0);
  ok('y también la rejilla',
     celdas().find(c => c.dataset.caldia === '2026-08-19').querySelectorAll('.pts i').length === 1);
  click(d.querySelector('[data-calcat=""]'));
  ok('«Todos» lo quita', !w.state.calCat && cuerpo().indexOf('Logopedia') >= 0);

  console.log('\n--- DESTACADOS ---');
  ok('el casal aparece por durar varios días', cuerpo().indexOf('Casal de verano') >= 0);
  ok('el cumpleaños aparece por categoría', cuerpo().indexOf('Cumpleaños Gina') >= 0);
  ok('la logopedia NO aparece: es rutina',
     (d.querySelector('.dest') || {textContent:''}).textContent.indexOf('Logopedia') < 0);
  ok('sin responsable dice «Sin asignar»',
     (d.querySelector('.dest') || {textContent:''}).textContent.indexOf('Sin asignar') >= 0);
  ok('con responsable dice con quién',
     (d.querySelector('.dest') || {textContent:''}).textContent.indexOf('Con mamá') >= 0);

  console.log('\n--- VISTA AGENDA ---');
  click(d.querySelector('[data-vista="agenda"]'));
  ok('cambia de vista', w.state.calVista === 'agenda');
  ok('ya no hay rejilla', !d.querySelector('.rej'));
  ok('lista los próximos días', cuerpo().indexOf('Hoy') >= 0);
  ok('con el cumpleaños de dentro de un mes', cuerpo().indexOf('Cumpleaños Gina') >= 0);
  click(d.querySelector('[data-vista="mes"]'));
  ok('y se vuelve al mes', !!d.querySelector('.rej'));

  console.log('\n--- FORMULARIO DE EVENTO ---');
  click(d.querySelector('#fabCal'));
  ok('se abre la hoja', d.querySelector('#hoja').classList.contains('on'));
  ok('propone el día seleccionado', w.borradorEvento.fecha === HOY, w.borradorEvento.fecha);
  ok('sin repetición no pide días', !d.querySelector('[data-edia]'));
  click(d.querySelector('[data-ecampo="repite"][data-val="semanal"]'));
  ok('al elegir semanal pide los días', !!d.querySelector('[data-edia]'));
  ok('y explica que no se guardan filas',
     d.querySelector('#hojaC').textContent.indexOf('se generan al pintar') >= 0);
  click(d.querySelector('[data-edia="mar"]'));
  click(d.querySelector('[data-edia="jue"]'));
  ok('los días se acumulan en orden', w.borradorEvento.repite_dias === 'mar,jue',
     w.borradorEvento.repite_dias);
  click(d.querySelector('[data-edia="mar"]'));
  ok('y se pueden quitar', w.borradorEvento.repite_dias === 'jue');

  console.log('\n--- VALIDACIÓN ---');
  const antes = posts.length;
  click(d.querySelector('#evGuardar'));
  ok('no guarda un evento sin nombre', posts.length === antes);
  ok('y lo dice', d.querySelector('#toast').textContent.indexOf('nombre') >= 0);

  d.querySelector('#eTit').value = 'Inglés';
  d.querySelector('#eFecha').value = '2026-09-10';
  d.querySelector('#eFin').value = '2026-09-01';
  click(d.querySelector('#evGuardar'));
  ok('rechaza un fin anterior al principio', posts.length === antes);
  ok('y lo explica', d.querySelector('#toast').textContent.indexOf('anterior') >= 0);

  d.querySelector('#eFin').value = '';
  d.querySelector('#eHora').value = '17:00';
  click(d.querySelector('[data-ecampo="tipo"][data-val="actividad_cole"]'));
  ok('conserva lo escrito al repintar', w.borradorEvento.titulo === 'Inglés',
     w.borradorEvento.titulo);
  click(d.querySelector('#evGuardar'));
  setTimeout(() => {
    ok('ahora sí guarda', posts.length === antes + 1);
    const p = posts[posts.length-1];
    ok('la acción es saveEvento', p && p.action === 'saveEvento');
    ok('con el título', p && p.payload.titulo === 'Inglés');
    ok('la categoría', p && p.payload.tipo === 'actividad_cole');
    ok('la repetición', p && p.payload.repite === 'semanal' && p.payload.repite_dias === 'jue');
    ok('y quién lo apunta', p && p.payload.creado_por === 'papa');

    console.log('\n--- LO AJENO SE VE, NO SE TOCA ---');
    w.formEvento('e3');
    const ajeno = d.querySelector('#hojaC').textContent.replace(/\s+/g,' ');
    ok('el casal de mamá se abre en solo lectura', !d.querySelector('#evGuardar'), ajeno.slice(0,60));
    ok('pero se lee entero', ajeno.indexOf('Casal de verano') >= 0 &&
       ajeno.indexOf('28 ago') >= 0, ajeno);
    ok('y dice quién lo apuntó', ajeno.indexOf('Lo registró mamá') >= 0);
    ok('no ofrece borrarlo', !d.querySelector('#evBorrar'));

    console.log('\n--- EDITAR LO PROPIO ---');
    w.formEvento('e1');
    ok('carga la logopedia', w.borradorEvento.titulo === 'Logopedia', w.borradorEvento.titulo);
    ok('con su hora', w.borradorEvento.hora === '17:00', w.borradorEvento.hora);
    ok('ofrece borrarlo', !!d.querySelector('#evBorrar'));

    console.log('\n--- UNA CITA SE EDITA EN SU FORMULARIO ---');
    w.state.calDia = HOY; w.pintarCalendario();
    const chip = [...d.querySelectorAll('[data-calev]')].find(x => x.dataset.calev.indexOf('cita:')===0);
    ok('la cita lleva su propio identificador', !!chip, chip && chip.dataset.calev);
    if(chip){
      click(chip);
      ok('abre el formulario de cita, no el de evento',
         d.querySelector('#hojaC').textContent.indexOf('Editar cita') >= 0);
    }

    console.log('\n--- CAMBIAR DE QUIÉN ES UN DÍA ---');
    /* El convenio es la norma, no una ley física: hay días que se
       cambian. Antes solo se podía tocando el Sheet a mano. */
    w.state.calDia = HOY; w.pintarCalendario();
    const btnC = d.querySelector('[data-cust]');
    ok('el día ofrece cambiarse', !!btnC, btnC && btnC.textContent);
    click(btnC);
    const hj = () => (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ');
    ok('se abre preguntando dónde duerme, no "con quién está"',
       hj().indexOf('¿Dónde duerme') >= 0, hj().slice(0,60));
    ok('y explica que el cambio no es a medianoche',
       hj().indexOf('no a medianoche') >= 0);
    /* Tres casas: papá, mamá y los avis. Los avis no entran en la app,
       pero sí son un sitio donde Gina duerme. */
    ok('con las tres casas', d.querySelectorAll('[data-custq]').length === 3,
       d.querySelectorAll('[data-custq]').length);
    ok('incluidos los avis', !!d.querySelector('[data-custq="avis"]'));
    ok('viene marcado quien lo tiene ahora',
       w.borradorCust.username === w.custodiaDe(HOY).quien, w.borradorCust.username);
    ok('y deja claro que el convenio no se toca', hj().indexOf('El convenio no se toca') >= 0);

    const otroU = w.otro(w.custodiaDe(HOY).quien);
    click(d.querySelector('[data-custq="'+otroU+'"]'));
    ok('se elige al otro', w.borradorCust.username === otroU, w.borradorCust.username);
    d.querySelector('#cuMotivo').value = 'Boda';

    const antesC = posts.length;
    click(d.querySelector('#cuGuardar'));
    setTimeout(() => {
      ok('manda un POST', posts.length === antesC + 1, posts.length - antesC);
      const pc = posts[posts.length-1];
      ok('la acción es saveCustodia', pc && pc.action === 'saveCustodia', pc && pc.action);
      ok('con la fecha', pc && pc.payload.fecha === HOY, pc && pc.payload.fecha);
      ok('y el nuevo responsable', pc && pc.payload.username === otroU);
      ok('marcado como cambio, no como convenio', pc && pc.payload.origen === 'cambio',
         pc && pc.payload.origen);
      ok('con el motivo', pc && pc.payload.motivo === 'Boda', pc && pc.payload.motivo);

      console.log('\n--- Y SE PUEDE DESHACER ---');
      w.state.data.custodia.push({ fecha:HOY, username:otroU, origen:'cambio',
                                   motivo:'Boda', creado_por:'papa' });
      w.indexarCustodia(); w.pintarCalendario();
      click(d.querySelector('[data-cust]'));
      ok('un día ya cambiado ofrece volver al convenio', !!d.querySelector('#cuVolver'));
      const antesD = posts.length;
      click(d.querySelector('#cuVolver'));
      setTimeout(() => {
        const pd = posts[posts.length-1];
        ok('y eso borra la excepción', posts.length === antesD + 1 &&
           pd.action === 'deleteCustodia', pd && pd.action);

        console.log('\n--- UN TRAMO ENTERO, NO DÍA A DÍA ---');
        /* Un verano son 75 días. Picarlos uno a uno no es una interfaz. */
        w.state.calDia = HOY; w.pintarCalendario();
        click(d.querySelector('[data-cust]'));
        ok('se puede cambiar a modo tramo', !!d.querySelector('[data-custr="1"]'));
        click(d.querySelector('[data-custr="1"]'));
        ok('aparecen dos fechas', !!d.querySelector('#cuIni') && !!d.querySelector('#cuFin'));
        ok('empieza en el día que tocaste', d.querySelector('#cuIni').value === HOY,
           d.querySelector('#cuIni').value);

        d.querySelector('#cuIni').value = '2026-06-24';
        d.querySelector('#cuFin').value = '2026-09-07';
        d.querySelector('#cuIni').dispatchEvent(new w.Event('input',{bubbles:true}));
        ok('cuenta los días para que sepas qué estás tocando',
           hj().indexOf('76 días') >= 0, hj().match(/\d+ días/));

        click(d.querySelector('[data-custq="avis"]'));
        ok('se puede elegir a los avis', w.borradorCust.username === 'avis');
        ok('sin perder las fechas al repintar',
           w.borradorCust.fecha === '2026-06-24' && w.borradorCust.fecha_fin === '2026-09-07',
           w.borradorCust.fecha + ' → ' + w.borradorCust.fecha_fin);
        d.querySelector('#cuMotivo').value = 'Verano con los abuelos';

        const antesR = posts.length;
        click(d.querySelector('#cuGuardar'));
        setTimeout(() => {
          const pr = posts[posts.length-1];
          ok('manda UN solo POST para los 76 días', posts.length === antesR + 1,
             posts.length - antesR);
          ok('con la acción de tramo', pr.action === 'saveCustodiaRango', pr.action);
          ok('con las dos fechas', pr.payload.fecha === '2026-06-24' &&
             pr.payload.fecha_fin === '2026-09-07', JSON.stringify(pr.payload).slice(0,80));
          ok('a nombre de los avis', pr.payload.username === 'avis');
          ok('y marcado como cambio', pr.payload.origen === 'cambio');

          console.log('\n--- LOS AVIS SON UNA CASA, NO UN PERFIL ---');
          w.state.data.custodia.push({ fecha:'2026-09-02', username:'avis',
                                       origen:'cambio', motivo:'Avis' });
          w.indexarCustodia(); w.state.calDia = '2026-09-02'; w.pintarCalendario();
          const cav = celdas().find(c => c.dataset.caldia === '2026-09-02');
          ok('el día se pinta con su tono propio', cav && cav.classList.contains('avis'),
             cav && cav.className);
          ok('ni de papá ni de mamá',
             cav && !cav.classList.contains('papa') && !cav.classList.contains('mama'));
          ok('y el detalle lo dice', cuerpo().indexOf('els avis') >= 0,
             cuerpo().match(/Con [a-zé ]+/g));
          ok('la leyenda los nombra solo cuando salen',
             cuerpo().indexOf('Duerme con els avis') >= 0,
             cuerpo().match(/Duerme con [a-zé ]+/g));
          click(d.querySelector('#btnPerfil'));
          ok('pero NO se puede entrar en la app como los avis',
             !d.querySelector('[data-user="avis"]'),
             [...d.querySelectorAll('[data-user]')].map(x => x.dataset.user).join(','));

          console.log('\n--- UN EVENTO EMPIEZA Y ACABA ---');
          w.formEvento('e1');
          const hf = d.querySelector('#eHoraFin');
          ok('hay hora de fin, no solo de inicio', !!hf && hf.type === 'time');
          ok('marcada como opcional', hj().indexOf('opcional') >= 0);
          ok('y en un evento normal se llama "acaba"', hj().indexOf('Acaba') >= 0, hj().slice(0,200));
          /* Un viaje sale y vuelve: la misma pareja de campos, dicha con
             las palabras de cada cosa. */
          click(d.querySelector('[data-ecampo="tipo"][data-val="viajes"]'));
          ok('en un viaje se llama "vuelve"', hj().indexOf('Vuelve') >= 0, hj().slice(0,200));
          d.querySelector('#eHoraFin').value = '19:30';
          w.leerFormEvento();
          ok('la hora de fin se lee del formulario', w.borradorEvento.hora_fin === '19:30',
             w.borradorEvento.hora_fin);

          console.log('\n--- NOTAS: LAS ESCRIBE CUALQUIERA ---');
          w.formEvento('e1');
          ok('se ve la nota que dejó mamá en MI evento',
             hj().indexOf('mochila azul') >= 0, hj().slice(-200));
          ok('con quién la escribió', hj().indexOf('Mamá') >= 0);
          ok('pero no puedo borrar la suya', !d.querySelector('[data-notaborra="n1"]'));
          ok('y hay sitio para añadir la mía', !!d.querySelector('#eNota'));
          d.querySelector('#eNota').value = 'Recogerla a las 18h';
          const antesN = posts.length;
          click(d.querySelector('#btnNota'));
          setTimeout(() => {
            const pn = posts[antesN];
            ok('se manda como comentario', pn && pn.action === 'saveComentario', pn && pn.action);
            ok('colgado del evento', pn && pn.payload.entidad === 'evento' &&
               pn.payload.ref_id === 'e1');
            ok('con el texto', pn && pn.payload.texto === 'Recogerla a las 18h');

            console.log('\n--- UN RECORDATORIO SE MARCA COMO HECHO ---');
            w.ir('inicio');
            const chk = d.querySelector('[data-rechecho]');
            ok('el recordatorio trae un check', !!chk,
               d.querySelector('#cardRec').textContent.slice(0,60));
            const antesR = posts.length;
            click(chk);
            setTimeout(() => {
              const pr = posts[antesR];
              ok('se manda marcado', pr && pr.action === 'marcarRecordatorio', pr && pr.action);
              ok('con el evento Y la fecha: la mochila de agosto no es la de diciembre',
                 pr && !!pr.payload.evento_id && !!pr.payload.fecha,
                 pr && JSON.stringify(pr.payload));
              ok('como hecho', pr && pr.payload.hecho === true);

              /* Una vez hecho, deja de ocupar la portada. */
              w.state.data.recordatorios.push({ id:'r1', evento_id:pr.payload.evento_id,
                fecha:pr.payload.fecha, hecho_por:'papa' });
              w.pintarRecordatorio();
              ok('y desaparece de la portada',
                 (d.querySelector('#cardRec').textContent||'').indexOf('Recordatorio') < 0,
                 d.querySelector('#cardRec').textContent);

              console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
              process.exit(fallos ? 1 : 0);
            }, 220);
          }, 260);
        }, 220);
      }, 220);
    }, 220);
  }, 240);
}, 700);
