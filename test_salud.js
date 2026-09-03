/* GINapp — tests de la sección Salud (jsdom)
   Correr desde la carpeta del repo:  node test_salud.js                    */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';

/* Ibuprofeno cada 8 h. Última dosis: mamá a las 12:15 → la siguiente, 20:15 */
const MEDS = [{ id:'m1', nombre:'Ibuprofeno', dosis:'10 ml', cada_horas:8,
                inicio:'2026-08-18', fin:'', motivo:'Fiebre', activo:true, creado_por:'papa' }];
const DOSIS = [
  { id:'d1', medicacion_id:'m1', fecha:'2026-08-19', hora:'04:15', dado_por:'papa' },
  { id:'d2', medicacion_id:'m1', fecha:'2026-08-19', hora:'12:15', dado_por:'mama' }
];
const CITAS = [
  { id:'ci1', fecha:'2026-08-21', hora:'17:30', tipo:'dentista', centro:'Clínica Sonríe',
    motivo:'Revisión rutinaria', acompana:'papa', creado_por:'papa',
    timestamp:'2026-08-01T10:00:00.000Z' },
  { id:'ci2', fecha:'2026-08-12', hora:'10:20', tipo:'pediatra', centro:'CAP Sarrià',
    motivo:'Revisión pediatra', resultado:'Todo correcto', creado_por:'papa',
    timestamp:'2026-08-12T10:20:00.000Z' }
];
const EPIS = [
  { id:'e1', fecha:'2026-08-19', hora:'18:45', tipo:'fiebre', descripcion:'Fiebre',
    temperatura:38.2, notas:'Por la tarde', evolucion:'2026-08-19 18:45 · papa — 38,2 al llegar',
    creado_por:'papa', timestamp:'2026-08-19T18:45:00.000Z' },
  { id:'e2', fecha:'2026-08-17', hora:'16:30', tipo:'lesion',
    descripcion:'Pequeña caída en el parque', notas:'Golpe en la rodilla derecha',
    creado_por:'mama', timestamp:'2026-08-17T16:30:00.000Z' }
];

const BOOT = { ok:true, data:{
  version:'0.3.2', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', fecha_nacimiento:'2018-03-14' },
  usuarios:[{username:'papa',nombre:'Papá',rol:'progenitor',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',rol:'progenitor',color:'#E4575B',activo:true}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',ancla_fecha:'2026-08-21',ancla_usuario:'papa'}],
  custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[],
  gastos:[], liquidaciones:[], categorias_gasto:[],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:CITAS, medicacion:MEDS, dosis:DOSIS, episodios:EPIS,
  vacunas:[{ id:'v1', nombre:'Triple vírica', fecha:'2026-05-04', centro:'CAP Sarrià',
             proxima:'', creado_por:'mama', timestamp:'2026-05-04T09:00:00.000Z' }],
  crecimiento:[{ id:'g1', fecha:'2026-06-10', peso_kg:26.4, talla_cm:128,
                 creado_por:'papa', timestamp:'2026-06-10T09:00:00.000Z' },
               { id:'g2', fecha:'2026-02-08', peso_kg:24.9, talla_cm:124.5,
                 creado_por:'mama', timestamp:'2026-02-08T09:00:00.000Z' },
               /* Solo peso: no siempre se mide todo a la vez. */
               { id:'g3', fecha:'2026-08-01', peso_kg:27.1, talla_cm:0,
                 creado_por:'papa', timestamp:'2026-08-01T09:00:00.000Z' }],
  documentos:[{id:'do1'},{id:'do2'}], actividad:[], visitas:[]
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
  click([...d.querySelectorAll('#nav button')].find(b => b.dataset.s === 'salud'));
  const cuerpo = () => d.querySelector('#salCuerpo').textContent.replace(/\s+/g,' ');

  console.log('\n--- MEDICACIÓN (lo más importante entre dos casas) ---');
  ok('la medicación activa va la primera', !!d.querySelector('.dosis-c'));
  ok('está por encima de la próxima cita',
     d.querySelector('#salCuerpo').innerHTML.indexOf('dosis-c') <
     d.querySelector('#salCuerpo').innerHTML.indexOf('cita-c'));
  ok('nombra el medicamento y la dosis', cuerpo().indexOf('Ibuprofeno · 10 ml') >= 0);
  ok('dice quién dio la última y a qué hora',
     cuerpo().indexOf('12:15') >= 0 && cuerpo().indexOf('mamá') >= 0, cuerpo().slice(0,220));

  const p = w.proximaDosis(MEDS[0]);
  ok('calcula la próxima dosis: 12:15 + 8 h = 20:15',
     p && p.hora === '20:15' && p.fecha === HOY, p && (p.fecha+' '+p.hora));
  ok('la muestra en pantalla', cuerpo().indexOf('20:15') >= 0);
  ok('cuenta las dosis de hoy', w.dosisDeHoy('m1') === 2, w.dosisDeHoy('m1'));
  ok('lo dice en pantalla', cuerpo().indexOf('2 dosis hoy') >= 0);
  ok('hay botón de marcar dosis', !!d.querySelector('[data-dosis="m1"]'));

  console.log('\n--- SIN PAUTA NO SE INVENTA HORA ---');
  ok('sin cada_horas no hay próxima dosis',
     w.proximaDosis({ id:'m1', cada_horas:0 }) === null);
  ok('sin dosis previas tampoco',
     w.proximaDosis({ id:'zzz', cada_horas:8 }) === null);

  console.log('\n--- PRÓXIMA CITA ---');
  ok('muestra la cita futura, no la pasada',
     cuerpo().indexOf('Revisión rutinaria') >= 0);
  ok('calcula el badge «En 2 días»', cuerpo().indexOf('En 2 días') >= 0, cuerpo().slice(0,400));
  ok('muestra el centro', cuerpo().indexOf('Clínica Sonríe') >= 0);
  ok('dice quién la lleva', cuerpo().indexOf('La lleva papá') >= 0);

  console.log('\n--- HISTORIAL UNIFICADO ---');
  const h = w.historialSalud('');
  ok('mezcla episodios, citas pasadas, vacunas y medidas (2+1+1+3)', h.length === 7, h.length);
  ok('la cita futura NO entra en el historial',
     !h.some(r => r.id === 'ci1'), h.map(r=>r.id).join(','));
  ok('ordena de más reciente a más antiguo',
     h[0].fecha === '2026-08-19' && h[h.length-1].fecha === '2026-02-08',
     h[0].fecha + ' … ' + h[h.length-1].fecha);
  ok('la fiebre muestra la temperatura con coma',
     h[0].lineas.join(' ').indexOf('38,2 °C') >= 0, h[0].lineas.join(' | '));
  ok('cada registro lleva autor', h.every(r => r.autor !== undefined));
  ok('en pantalla se ve quién lo apuntó',
     cuerpo().indexOf('Papá') >= 0 && cuerpo().indexOf('Mamá') >= 0);
  ok('la caída aparece atribuida a mamá',
     h.find(r => r.id==='e2').autor === 'mama');

  console.log('\n--- FILTRO POR CATEGORÍA ---');
  click(d.querySelector('[data-salcat="lesion"]'));
  ok('filtra solo lesiones', w.historialSalud('lesion').length === 1);
  ok('la pantalla ya no muestra la fiebre', cuerpo().indexOf('38,2') < 0);
  ok('sí muestra la caída', cuerpo().indexOf('caída en el parque') >= 0);
  click(d.querySelector('[data-salcat="lesion"]'));
  ok('al volver a tocar se quita el filtro', !w.state.salCat);

  console.log('\n--- NO HAY NAVEGADOR SEMANAL ---');
  ok('la sección no tiene selector de semana',
     !d.querySelector('#s-salud .ali-nav') && cuerpo().indexOf('Esta semana') < 0);

  console.log('\n--- MARCAR DOSIS ---');
  const antes = posts.length;
  click(d.querySelector('[data-dosis="m1"]'));
  setTimeout(() => {
    ok('manda un POST', posts.length === antes + 1);
    const pd = posts[posts.length-1];
    ok('la acción es saveDosis', pd && pd.action === 'saveDosis', pd && pd.action);
    ok('con la medicación correcta', pd && pd.payload.medicacion_id === 'm1');
    ok('registra quién la dio', pd && pd.payload.dado_por === 'papa');
    ok('y a qué hora', pd && /^\d{2}:\d{2}$/.test(pd.payload.hora), pd && pd.payload.hora);

    console.log('\n--- FORMULARIOS ---');
    click(d.querySelector('#fabSalud'));
    ok('el menú ofrece los tres registros',
       ['cita','episodio','medicacion'].every(k => !!d.querySelector('[data-salnuevo="'+k+'"]')));

    click(d.querySelector('[data-salnuevo="episodio"]'));
    ok('el episodio propone fiebre', w.borradorSalud.tipo === 'fiebre');
    ok('con fiebre pide la temperatura', !!d.querySelector('#fTemp'));
    click(d.querySelector('[data-salcampo="tipo"][data-val="lesion"]'));
    ok('al cambiar a lesión desaparece la temperatura', !d.querySelector('#fTemp'));
    ok('y conserva el tipo elegido', w.borradorSalud.tipo === 'lesion');

    d.querySelector('#fDesc').value = 'Golpe en el codo';
    const antes2 = posts.length;
    click(d.querySelector('#salGuardar'));
    setTimeout(() => {
      ok('guarda el episodio', posts.length === antes2 + 1);
      const pe = posts[posts.length-1];
      ok('con la acción saveEpisodio', pe && pe.action === 'saveEpisodio', pe && pe.action);
      ok('lee la descripción del formulario',
         pe && pe.payload.descripcion === 'Golpe en el codo', pe && pe.payload.descripcion);
      ok('y quién lo apunta', pe && pe.payload.creado_por === 'papa');

      console.log('\n--- EDITAR UN EPISODIO EXISTENTE ---');
      w.formEpisodio('e1');
      ok('carga la descripción', w.borradorSalud.descripcion === 'Fiebre');
      ok('muestra la evolución previa',
         d.querySelector('#hojaC').textContent.indexOf('38,2 al llegar') >= 0);
      ok('pide añadir a la evolución, no sobrescribirla',
         d.querySelector('#hojaC').textContent.indexOf('Añadir a la evolución') >= 0);
      ok('ofrece borrarlo', !!d.querySelector('#salBorrar'));

      console.log('\n--- CRECIMIENTO ---');
      w.pintarSalud();
      const cr = (d.querySelector('.crec')||{}).textContent || '';
      ok('hay tarjeta de crecimiento', !!d.querySelector('.crec'));
      ok('el peso que sale es el más reciente, no el primero de la lista',
         cr.indexOf('27,1 kg') >= 0, cr.match(/Peso.{0,20}/));
      ok('la talla es la última que SE MIDIÓ, aunque sea de otro día',
         cr.indexOf('128 cm') >= 0, cr.match(/Talla.{0,20}/));

      console.log('\n--- LA EDAD SE CALCULA, NO SE GUARDA ---');
      ok('nacida el 14/3/2018, el 19/8/2026 tiene 8 años y 5 meses',
         w.edadTexto('2026-08-19') === '8 años y 5 meses', w.edadTexto('2026-08-19'));
      ok('el día antes de cumplir aún no los ha cumplido',
         w.edadTexto('2027-03-13') === '8 años y 11 meses', w.edadTexto('2027-03-13'));
      ok('y el mismo día del cumpleaños sí',
         w.edadTexto('2027-03-14') === '9 años', w.edadTexto('2027-03-14'));
      ok('sale en la tarjeta', cr.indexOf('8 años') >= 0, cr.match(/Edad.{0,24}/));
      ok('sin fecha de nacimiento no se inventa una edad',
         (function(){
           const f = w.state.data.config.fecha_nacimiento;
           w.state.data.config.fecha_nacimiento = '';
           const r = w.edadTexto('2026-08-19') === '' && w.edadEn('2026-08-19') === null;
           w.state.data.config.fecha_nacimiento = f;
           return r;
         })());

      console.log('\n--- LA EVOLUCIÓN ---');
      ok('se dibujan dos gráficas, no una con dos escalas',
         d.querySelectorAll('.crec .ln-svg').length === 2,
         d.querySelectorAll('.crec .ln-svg').length);
      const gs = d.querySelectorAll('.crec .crec-g');
      ok('la del peso lleva sus tres medidas',
         gs[0] && gs[0].querySelectorAll('circle').length === 3,
         gs[0] && gs[0].querySelectorAll('circle').length);
      ok('la de la talla solo las dos que se midieron',
         gs[1] && gs[1].querySelectorAll('circle').length === 2,
         gs[1] && gs[1].querySelectorAll('circle').length);
      ok('la escala se ajusta al dato: 27,1 kg no cabe en un eje 0-100 legible',
         cr.indexOf('100') < 0, cr.slice(0, 200));

      console.log('\n--- APUNTAR UNA MEDIDA ---');
      w.formMedida('');
      const hm = () => (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ');
      ok('dice qué edad tenía ese día', hm().indexOf('tenía 8 años') >= 0, hm().slice(0,140));
      ok('el peso es texto, no number (la coma decimal)',
         d.querySelector('#mdPeso').getAttribute('type') === 'text' &&
         d.querySelector('#mdPeso').getAttribute('inputmode') === 'decimal');
      const antesM = posts.length;
      click(d.querySelector('#mdGuardar'));
      ok('vacío no se guarda', posts.length === antesM);
      ok('y lo dice', (d.querySelector('#toast').textContent||'').indexOf('al menos') >= 0,
         d.querySelector('#toast').textContent);
      d.querySelector('#mdPeso').value = '27,4';
      click(d.querySelector('#mdGuardar'));
      const pm = posts[posts.length-1];
      ok('la acción es saveCrecimiento', pm && pm.action === 'saveCrecimiento', pm && pm.action);
      ok('27,4 se guarda como 27.4, no como 0', pm && pm.payload.peso_kg === 27.4,
         pm && pm.payload.peso_kg);
      ok('solo con el peso vale: la talla va a 0', pm && pm.payload.talla_cm === 0);

      console.log('\n--- MEDIDA AJENA ---');
      w.state.modo = 'estricto';
      w.formMedida('g2');
      ok('la de mamá se ve pero no se edita', !d.querySelector('#mdGuardar'));
      ok('con su edad de entonces', hm().indexOf('7 años') >= 0, hm());
      w.state.modo = 'confianza';

      console.log('\n--- LA APP NO DA CONSEJO MÉDICO ---');
      w.formMedicacion('');
      const t = d.querySelector('#hojaC').textContent;
      ok('avisa de que no recomienda tratamientos', t.indexOf('no recomienda') >= 0);
      const PROHIBIDO = /deber[íi]as dar|te recomendamos dar|aumenta la dosis|reduce la dosis/i;
      ok('y no sugiere dosis en ningún texto', !PROHIBIDO.test(d.body.textContent));

      console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
      process.exit(fallos ? 1 : 0);
    }, 220);
  }, 220);
}, 700);
