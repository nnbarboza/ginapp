/* GINapp — tests de la sección Alimentación (jsdom)
   Correr desde la carpeta del repo:  node test_alimentacion.js            */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';           // miércoles
const LUN = '2026-08-17';

const ALIMENTOS = [
  ['al_tomate','Tomate','verduras','🍅'], ['al_brocoli','Brócoli','verduras','🥦'],
  ['al_platano','Plátano','fruta','🍌'],  ['al_manzana','Manzana','fruta','🍎'],
  ['al_kiwi','Kiwi','fruta','🥝'],        ['al_lentejas','Lentejas','legumbres','🫘'],
  ['al_merluza','Merluza','pescado','🐟'],['al_pollo','Pollo','proteina_blanca','🍗'],
  ['al_yogur','Yogur','lacteos','🥣'],    ['al_pan','Pan','cereales','🍞'],
  ['al_chocolate','Chocolate','capricho','🍫'], ['al_pizza','Pizza','permitido','🍕'],
  /* Atajos de pantalla: la sección dice DÓNDE sale, el grupo qué cuenta.
     El yogur de postre sigue siendo lácteo. */
  ['al_agua','Agua','bebidas','💧','bebida'],
  ['al_leche','Leche','bebidas','🥛','bebida'],
  ['al_natillas','Natillas','capricho','🍮','postre'],
  ['al_yogur_post','Yogur de postre','lacteos','🥣','postre']
].map(a => ({ id:a[0], nombre:a[1], grupo:a[2], emoji:a[3], estado:'aprendizaje',
              seccion:a[4]||'', activo:true }));

const OBJ = [
  ['verduras','Verduras','🥦',14,'min',20], ['fruta','Fruta','🍓',14,'min',18],
  ['legumbres','Legumbres','🫘',3,'min',10], ['pescado','Pescado','🐟',2,'min',10],
  ['proteina_blanca','Pollo y pavo','🍗',3,'min',6], ['lacteos','Lácteos','🥛',10,'min',6],
  ['cereales','Cereales','🍞',10,'min',4],
  ['capricho','Caprichos','🍬',4,'max',2], ['permitido','Comida libre','🍕',2,'max',2]
].map(o => ({ grupo:o[0], nombre:o[1], emoji:o[2], objetivo:o[3], tipo:o[4], peso:o[5], activo:true }));

let seq = 0;
function toma(fecha, hora, tipo, alimentoId, estado){
  const a = ALIMENTOS.find(x => x.id === alimentoId) || {};
  return { id:'c'+(++seq), grupo_id:fecha+'-'+tipo, fecha, hora, tipo_comida:tipo, lugar:'papa',
           alimento_id:alimentoId, nombre:a.nombre, grupo:a.grupo,
           estado_toma:estado||'comio', creado_por:'papa', timestamp:fecha+'T'+hora+':00.000Z' };
}
/* Lunes 17 y martes 18 con registros; miércoles 19 (hoy) también → 3 días */
const COMIDAS = [
  toma('2026-08-17','09:00','desayuno','al_yogur'),
  toma('2026-08-17','09:00','desayuno','al_pan'),
  toma('2026-08-17','13:30','comida','al_merluza'),
  toma('2026-08-17','13:30','comida','al_tomate'),
  toma('2026-08-17','18:00','merienda','al_chocolate'),
  toma('2026-08-18','09:00','desayuno','al_platano'),
  toma('2026-08-18','13:30','comida','al_lentejas'),
  toma('2026-08-18','13:30','comida','al_brocoli','probo'),
  toma('2026-08-18','21:00','cena','al_pizza'),
  toma('2026-08-19','09:00','desayuno','al_manzana'),
  toma('2026-08-19','13:30','comida','al_pollo'),
  toma('2026-08-19','13:30','comida','al_kiwi'),          // alimento nuevo esta semana
  toma('2026-08-19','13:30','comida','al_brocoli','rechazo')
];
/* Histórico anterior: todos menos el kiwi ya se habían comido antes */
const ANTES = ['al_tomate','al_platano','al_manzana','al_lentejas','al_merluza','al_pollo',
               'al_yogur','al_pan','al_chocolate','al_pizza','al_brocoli']
  .map((id,i) => toma('2026-08-0'+((i%8)+1),'13:00','comida',id));

const BOOT = { ok:true, data:{
  version:'0.3.1', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', dias_min_ich:'3',
           objetivo_variedad:'25', objetivo_nuevos:'2' },
  usuarios:[{username:'papa',nombre:'Papá',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',color:'#E4575B',activo:true}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',ancla_fecha:'2026-08-21',ancla_usuario:'papa'}],
  custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[],
  gastos:[], liquidaciones:[], categorias_gasto:[],
  alimentos: ALIMENTOS, comidas: ANTES.concat(COMIDAS), objetivos_semana: OBJ,
  citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[], documentos:[],
  actividad:[], visitas:[]
}};

const posts = [];
const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        posts.push(JSON.parse(o.body));
        return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ grupo_id:'nuevo', filas:1 } }) });
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
  const nav = [...d.querySelectorAll('#nav button')].find(b => b.dataset.s === 'alimentacion');
  click(nav);

  console.log('\n--- CÁLCULO ---');
  ok('la semana arranca en el lunes 17', w.state.aliLunes === LUN, w.state.aliLunes);
  ok('3 días con registro', w.diasConRegistro(LUN) === 3, w.diasConRegistro(LUN));

  // fruta: plátano(1) + manzana(1) + kiwi(1) = 3 · brócoli probó = 0,5 en verduras
  ok('raciones de fruta = 3', w.racionesSemana('fruta', LUN) === 3, w.racionesSemana('fruta',LUN));
  ok('«lo probó» cuenta media ración', w.racionesSemana('verduras', LUN) === 1.5,
     w.racionesSemana('verduras', LUN));
  ok('«lo rechazó» no suma', w.racionesDia('verduras','2026-08-19') === 0,
     w.racionesDia('verduras','2026-08-19'));

  const varie = w.variedadDe(LUN);
  // 12 alimentos distintos: el brócoli entra porque el día 18 lo PROBÓ,
  // aunque el 19 lo rechazara. Un rechazo no borra una exposición previa.
  ok('variedad = 12 alimentos distintos', varie.length === 12, varie.length);
  ok('el brócoli cuenta: lo probó el día 18', varie.indexOf('al_brocoli') >= 0);
  ok('un alimento SOLO rechazado no contaría',
     (function(){
       const antes = w.state.data.comidas;
       w.state.data.comidas = antes.filter(c => !(c.alimento_id==='al_brocoli' && c.estado_toma==='probo'));
       const v2 = w.variedadDe(LUN).indexOf('al_brocoli') < 0;
       w.state.data.comidas = antes;
       return v2;
     })());

  const nuevos = w.nuevosDe(LUN);
  ok('1 alimento nuevo: el kiwi', nuevos.length === 1 && nuevos[0] === 'al_kiwi', nuevos.join(','));

  const i = w.ich(LUN);
  ok('el ICH se calcula', !!i);
  ok('está entre 0 y 100', i && i.total >= 0 && i.total <= 100, i && i.total);
  ok('los cuatro componentes existen',
     i && ['variedad','grupos','nuevos','limites'].every(k => typeof i.comp[k] === 'number'));
  const esperado = Math.round((40*i.comp.variedad + 25*i.comp.grupos +
                               20*i.comp.nuevos + 15*i.comp.limites)/100);
  ok('el total cuadra con los pesos 40/25/20/15', Math.abs(i.total - esperado) <= 1,
     i.total + ' vs ' + esperado);

  console.log('\n--- HONESTIDAD DEL INDICADOR ---');
  const sinDatos = w.ich('2026-06-01');
  ok('sin días suficientes NO inventa número', sinDatos === null, JSON.stringify(sinDatos));
  w.state.aliLunes = '2026-06-01'; w.pintarAlimentacion();
  const vacio = d.querySelector('#aliCuerpo').textContent;
  ok('lo dice en pantalla', vacio.indexOf('no hay datos suficientes') >= 0);
  ok('y explica por qué', vacio.indexOf('inventado') >= 0);
  w.state.aliLunes = LUN; w.pintarAlimentacion();

  console.log('\n--- PANTALLA ---');
  const cuerpo = d.querySelector('#aliCuerpo').textContent;
  ok('muestra el valor del ICH', cuerpo.indexOf(String(i.total)) >= 0);
  ok('los componentes muestran puntuación, no los pesos',
     cuerpo.indexOf('peso 40%') >= 0 && cuerpo.indexOf(String(i.comp.variedad)) >= 0);
  ok('la tabla semanal lista los grupos', cuerpo.indexOf('Verduras') >= 0 && cuerpo.indexOf('Fruta') >= 0);
  ok('la fila de fruta muestra 3 / 14', cuerpo.replace(/\s+/g,' ').indexOf('3 / 14') >= 0);

  /* Antes se cortaba a 8 filas detrás de un botón que no estaba enganchado,
     y lo que quedaba escondido eran justo los límites. Ahora salen todos. */
  const filas = [...d.querySelectorAll('.tb tr')].filter(t => !t.classList.contains('sep'));
  ok('salen TODOS los grupos, ninguno escondido', filas.length === OBJ.length + 1,
     (filas.length-1) + ' de ' + OBJ.length);
  ok('incluidos los límites, que son los que más importan',
     cuerpo.indexOf('Caprichos') >= 0 && cuerpo.indexOf('Comida libre') >= 0);
  ok('ya no hay botón de "ver todos"', !d.querySelector('#aliTodos'));
  ok('los límites van aparte, porque se leen al revés',
     (d.querySelector('.tb tr.sep')||{}).textContent === 'Sin pasarse',
     (d.querySelector('.tb tr.sep')||{}).textContent);
  /* Sin emoji en el texto a propósito: el icono es una <img> que en un
     navegador se cae al emoji si el fichero no está, pero en jsdom no
     llega a cargar nada. Lo que se comprueba aquí es el ORDEN. */
  const orden = [...d.querySelectorAll('.tb td.g')].map(t => t.textContent.trim());
  ok('y van después de los mínimos',
     orden.indexOf('Sin pasarse') > orden.indexOf('Verduras') &&
     orden.indexOf('Sin pasarse') < orden.indexOf('Caprichos'), orden.join(' | '));
  /* Las cinco comidas del día están SIEMPRE, registradas o no: para
     apuntar la merienda se toca la merienda, sin abrir nada antes. */
  ok('el día se titula "Hoy"', cuerpo.indexOf('Hoy') >= 0);
  /* Solo el nombre del plato y sus categorías. Listar los alimentos ahí
     convertía la tarjeta en un muro de texto. */
  ok('con las categorías de cada comida',
     cuerpo.indexOf('Fruta') >= 0 && cuerpo.indexOf('Pollo y pavo') >= 0, cuerpo.slice(0,300));
  ok('sin enumerar los alimentos añadidos', cuerpo.indexOf('Manzana ·') < 0);
  ok('salen las cinco comidas, tenga o no algo apuntado',
     ['Desayuno','Almuerzo','Comida','Merienda','Cena']
       .every(t => cuerpo.indexOf(t) >= 0), cuerpo.slice(0,200));
  ok('las que faltan se ofrecen para apuntar',
     d.querySelectorAll('[data-nuevacomida]').length >= 1,
     d.querySelectorAll('[data-nuevacomida]').length);
  ok('y las que hay se abren para editar',
     d.querySelectorAll('[data-comida]').length >= 2,
     d.querySelectorAll('[data-comida]').length);
  ok('hay tira de días para cambiar sin salir',
     d.querySelectorAll('[data-alidia]').length === 7);
  ok('marcando qué días tienen algo',
     d.querySelectorAll('[data-alidia] .pt.hay').length === 3,
     d.querySelectorAll('[data-alidia] .pt.hay').length);
  ok('el día de hoy viene elegido',
     d.querySelector('[data-alidia].on').dataset.alidia === HOY);
  ok('el subtítulo cuenta la variedad', d.querySelector('#aliSub').textContent.indexOf('12 alimentos') >= 0,
     d.querySelector('#aliSub').textContent);

  console.log('\n--- TONO DE LOS MENSAJES (§25) ---');
  const PROHIBIDAS = /suspend|fatal|mal |peor|culpa|castig|penaliz|adelgaz|caloría|gordo|obes/i;
  let malas = 0, largos = 0;
  ['2026-08-17','2026-08-10','2026-08-03','2026-07-27','2026-06-01'].forEach(l => {
    const m = w.mensajeSemana(l);
    if(PROHIBIDAS.test(m.t + ' ' + m.p)) { malas++; console.log('     ⚠️ ' + m.t + ' · ' + m.p); }
    if((m.t + m.p).length > 150) largos++;
  });
  ok('ningún mensaje culpabiliza', malas === 0);
  ok('ninguno pasa de 150 caracteres', largos === 0);

  console.log('\n--- REGISTRO DE COMIDA ---');
  click(d.querySelector('#addComida'));
  const hoja = () => d.querySelector('#hojaC').textContent;
  ok('se abre la hoja', d.querySelector('#hoja').classList.contains('on'));
  ok('propone un tipo de comida', !!w.borrador.tipo_comida, w.borrador.tipo_comida);
  ok('precarga la hora', /^\d{2}:\d{2}$/.test(w.borrador.hora), w.borrador.hora);
  ok('empieza vacía', w.borrador.items.length === 0);
  ok('el botón de guardar está desactivado', d.querySelector('#guardarComida').disabled);
  ok('pide el plato por su nombre', !!d.querySelector('#inPlato'));

  /* La comida son sus CATEGORÍAS. Los alimentos son lo que se añade
     (bebida, snack): opcionales, y no hay por qué dar de alta
     "tequeños" como alimento para poder apuntar unos tequeños. */
  console.log('\n--- LA COMIDA SON SUS CATEGORÍAS ---');
  ok('las categorías están a la vista, sin abrir nada',
     d.querySelectorAll('.gchip[data-g]').length >= 8,
     d.querySelectorAll('.gchip[data-g]').length);
  ok('los límites van aparte', hoja().indexOf('Sin pasarse') >= 0);
  click(d.querySelector('.gchip[data-g="legumbres"]'));
  ok('marcar una categoría basta para poder guardar',
     !d.querySelector('#guardarComida').disabled);
  ok('y se guarda sin alimento concreto',
     w.borrador.items.length === 1 && !w.borrador.items[0].alimento_id &&
     w.borrador.items[0].grupo === 'legumbres');
  ok('el chip queda marcado', d.querySelector('.gchip[data-g="legumbres"]').classList.contains('on'));
  click(d.querySelector('.gchip[data-g="legumbres"]'));
  ok('y se desmarca volviendo a tocarlo', w.borrador.items.length === 0);
  click(d.querySelector('.gchip[data-g="legumbres"]'));

  console.log('\n--- LOS ALIMENTOS SON UN AÑADIDO ---');
  ok('el buscador dice que es opcional', hoja().indexOf('opcional') >= 0);
  ok('muestra los frecuentes sin escribir nada', !!d.querySelector('[data-add]'));
  click(d.querySelector('[data-add="al_tomate"]'));
  ok('añade el tomate', w.borrador.items.length === 2 &&
     w.borrador.items[1].alimento_id === 'al_tomate');
  ok('por defecto «se lo comió»', w.borrador.items[1].estado_toma === 'comio');
  ok('el tomate desaparece del buscador', !d.querySelector('[data-add="al_tomate"]'));

  click([...d.querySelectorAll('[data-est="probo"]')][0]);
  ok('se cambia el estado a «lo probó»', w.borrador.items[1].estado_toma === 'probo');

  click(d.querySelector('[data-tipo="cena"]'));
  ok('se cambia el tipo de comida', w.borrador.tipo_comida === 'cena');
  /* Dónde y a cargo de quién son dos preguntas: se puede comer fuera
     con papá, y antes eso no se podía apuntar. */
  ok('por defecto viene "en casa"', w.borrador.lugar === 'casa', w.borrador.lugar);
  /* El miércoles le toca a mamá según el patrón: eso es lo que propone,
     y así no hay que tocarlo casi nunca. */
  ok('y a cargo de quien tiene la custodia ese día',
     w.borrador.con === 'mama', w.borrador.con);
  click(d.querySelector('[data-lugar="fuera"]'));
  ok('se marca dónde', w.borrador.lugar === 'fuera');
  ok('sin tocar quién estaba a cargo', w.borrador.con === 'mama');
  click(d.querySelector('[data-con="papa"]'));
  ok('y se puede decir que fue con papá aunque comieran fuera',
     w.borrador.lugar === 'fuera' && w.borrador.con === 'papa',
     w.borrador.lugar + ' / ' + w.borrador.con);
  click(d.querySelector('[data-lugar="fuera"]'));
  ok('el sitio se desmarca volviendo a tocarlo', w.borrador.lugar === '');
  ok('ya no hay "papá" ni "mamá" entre los sitios',
     !d.querySelector('[data-lugar="papa"]') && !d.querySelector('[data-lugar="mama"]'));

  console.log('\n--- EN EL COLE NO ESTÁ NI CON PAPÁ NI CON MAMÁ ---');
  click(d.querySelector('[data-lugar="cole"]'));
  ok('deja de preguntar a cargo de quién', !d.querySelector('[data-con]'));
  ok('y no se queda ninguno puesto', w.borrador.con === '', w.borrador.con);
  click(d.querySelector('[data-lugar="casa"]'));
  ok('al volver a casa lo propone otra vez', !!d.querySelector('[data-con]'));
  ok('con quien tiene la custodia', w.borrador.con === 'mama', w.borrador.con);

  console.log('\n--- GUARDADO ---');
  const antes = posts.length;
  click(d.querySelector('#guardarComida'));
  setTimeout(() => {
    ok('manda un POST', posts.length === antes + 1, posts.length);
    const p = posts[posts.length-1];
    ok('la acción es saveComida', p && p.action === 'saveComida', p && p.action);
    ok('lleva los dos items', p && p.payload.items.length === 2, p && p.payload.items.length);
    ok('conserva el estado «probó»',
       p && p.payload.items.some(x => x.estado_toma === 'probo'));
    ok('el item de grupo va sin alimento_id',
       p && p.payload.items.some(x => !x.alimento_id && x.grupo === 'legumbres'));
    ok('registra quién lo apuntó', p && p.payload.creado_por === 'papa');
    ok('la hoja se cierra', !d.querySelector('#hoja').classList.contains('on'));

    console.log('\n--- EDICIÓN ---');
    w.abrirComida('2026-08-19-comida');
    ok('carga los 3 items de esa comida', w.borrador.items.length === 3, w.borrador.items.length);
    ok('recuerda el grupo_id', w.borrador.grupo_id === '2026-08-19-comida');
    ok('ofrece borrarla', !!d.querySelector('#borrarComida'));

    console.log('\n--- LA CARD DEL DÍA ---');
    const res = w.resumenComida({ items:[
      { alimento_id:'', nombre:'Verduras', grupo:'verduras' },
      { alimento_id:'al_natillas', nombre:'Natillas', grupo:'capricho' },
      { alimento_id:'al_tomate', nombre:'Tomate', grupo:'verduras' } ]});
    ok('la categoría de un alimento cuenta como cualquier otra',
       res.indexOf('Caprichos') >= 0, res);
    ok('y no se esconde detrás de un «+N más»', res.indexOf('+1 más') < 0, res);
    ok('una categoría repetida sale una sola vez',
       res.split('Verduras').length - 1 === 1, res);

    console.log('\n--- ORDEN DE LA HOJA ---');
    w.abrirComida('');
    const orden = ['Qué comida es','Hora','Dónde','A cargo de','El plato',
                   'Bebidas','Postres','Y además','Qué categorías cuenta'];
    const txt = hoja();
    let pos = -1, bien = true, donde = '';
    orden.forEach(function(et){
      const i = txt.indexOf(et);
      if(i < 0){ bien = false; donde = 'falta: '+et; return; }
      if(i < pos){ bien = false; donde = 'fuera de sitio: '+et; }
      pos = i;
    });
    ok('se pregunta en el orden en que se piensa una comida', bien, donde);
    ok('las categorías van al final, para repasar',
       txt.indexOf('Qué categorías cuenta') > txt.indexOf('Y además'));

    console.log('\n--- BEBIDAS Y POSTRES ---');
    ok('hay atajo de bebidas', txt.indexOf('Bebidas') >= 0);
    ok('hay atajo de postres', txt.indexOf('Postres') >= 0);
    ok('el agua sale como bebida', !!d.querySelector('[data-add="al_agua"]'));
    ok('las natillas salen como postre', !!d.querySelector('[data-add="al_natillas"]'));
    ok('un postre NO se saca del grupo por serlo: sigue contando su grupo real',
       w.state.data.alimentos.find(a => a.id==='al_yogur_post').grupo === 'lacteos');
    ok('el brócoli no se cuela en los atajos: no tiene sección',
       !d.querySelector('.chips.beb [data-add="al_brocoli"]'));

    console.log('\n--- LAS CATEGORÍAS SE MARCAN SOLAS ---');
    click(d.querySelector('[data-add="al_natillas"]'));
    const chipCap = d.querySelector('.gchip[data-g="capricho"]');
    ok('añadir natillas marca «caprichos» sin tocarlo',
       chipCap && chipCap.className.indexOf('on') >= 0, chipCap && chipCap.className);
    ok('y se ve que viene de un alimento, no de un check a mano',
       chipCap && chipCap.className.indexOf('auto') >= 0);
    ok('dice de cuál viene', chipCap && chipCap.dataset.auto === 'Natillas',
       chipCap && chipCap.dataset.auto);
    click(chipCap);
    ok('no se puede desmarcar desde el chip: sería mentirle a los objetivos',
       d.querySelector('.gchip[data-g="capricho"]').className.indexOf('on') >= 0);
    ok('y explica por qué', (d.querySelector('#toast').textContent||'').indexOf('Natillas') >= 0,
       d.querySelector('#toast').textContent);
    ok('quitando el alimento se va la categoría',
       (click(d.querySelector('[data-quitar]')),
        d.querySelector('.gchip[data-g="capricho"]').className.indexOf('on') < 0));

    console.log('\n--- EL NOMBRE DEL PLATO ---');
    w.abrirComida('');
    d.querySelector('#inPlato').value = 'Tequeños con guacamole';
    d.querySelector('#inPlato').dispatchEvent(new w.Event('input',{bubbles:true}));
    click(d.querySelector('.gchip[data-g="verduras"]'));
    ok('el plato sobrevive al repintado', w.borrador.plato === 'Tequeños con guacamole',
       w.borrador.plato);
    const antesP = posts.length;
    click(d.querySelector('#guardarComida'));
    ok('viaja al backend como nota de la comida',
       posts.length === antesP + 1 &&
       posts[posts.length-1].payload.nota === 'Tequeños con guacamole',
       posts.length > antesP ? posts[posts.length-1].payload.nota : 'no se envió');

    console.log('\n--- CREAR ALIMENTO NUEVO ---');
    w.abrirComida('');
    d.querySelector('#inBusca').value = 'Aguacate';
    d.querySelector('#inBusca').dispatchEvent(new w.Event('input',{bubbles:true}));
    ok('ofrece crearlo', !!d.querySelector('[data-crear]'));
    click(d.querySelector('[data-crear]'));
    ok('pide el grupo', hoja().indexOf('A qué grupo pertenece') >= 0);
    ok('no deja crear sin grupo', d.querySelector('#nuGuardar').disabled);
    click(d.querySelector('[data-g="verduras"]'));
    ok('con grupo ya se puede crear', !d.querySelector('#nuGuardar').disabled);

    console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
    process.exit(fallos ? 1 : 0);
  }, 250);
}, 700);
