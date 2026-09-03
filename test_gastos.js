/* GINapp — tests de la sección Gastos (jsdom)
   Correr desde la carpeta del repo:  node test_gastos.js                   */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19', MES = '2026-08';

const CATS = [
  ['salud','Salud','🩺','#0E9384'], ['educacion','Educación','🎓','#2563EB'],
  ['actividades','Actividades','⚽','#8B5CF6'], ['ropa','Ropa','👕','#F43F5E'],
  ['ocio','Ocio','🎡','#EC4899'], ['otro','Otros','🧾','#94A3B8']
].map(c => ({ id:c[0], nombre:c[1], emoji:c[2], color:c[3], activo:true }));

/* Agosto: 500 € aportados. Gastos del mes:
     dentista 65 desde la común
     inglés   45 adelantados por mamá, compartido  → pendiente
     fútbol   40 desde la común
     zapatillas 80 adelantadas por papá, compartido → pendiente
     cine     18,50 pagado por mamá y NO compartido → no toca la cuenta   */
const GASTOS = [
  { id:'g1', fecha:'2026-08-15', categoria:'salud', descripcion:'Dentista',
    importe:65, origen:'comun', compartido:true, reembolso_id:'', creado_por:'mama',
    timestamp:'2026-08-15T10:00:00.000Z' },
  { id:'g2', fecha:'2026-08-12', categoria:'educacion', descripcion:'Clases de inglés',
    importe:45, origen:'mama', compartido:true, reembolso_id:'', creado_por:'mama',
    timestamp:'2026-08-12T10:00:00.000Z' },
  { id:'g3', fecha:'2026-08-10', categoria:'actividades', descripcion:'Fútbol mensual',
    importe:40, origen:'comun', compartido:true, reembolso_id:'', creado_por:'papa',
    timestamp:'2026-08-10T10:00:00.000Z' },
  { id:'g4', fecha:'2026-08-08', categoria:'ropa', descripcion:'Zapatillas',
    importe:80, origen:'papa', compartido:true, reembolso_id:'', creado_por:'papa',
    timestamp:'2026-08-08T10:00:00.000Z' },
  { id:'g5', fecha:'2026-08-05', categoria:'ocio', descripcion:'Cine',
    importe:18.50, origen:'mama', compartido:false, reembolso_id:'', creado_por:'mama',
    timestamp:'2026-08-05T10:00:00.000Z' },
  { id:'g6', fecha:'2026-07-20', categoria:'ropa', descripcion:'Bañador',
    importe:22, origen:'comun', compartido:true, reembolso_id:'', creado_por:'papa',
    timestamp:'2026-07-20T10:00:00.000Z' }
];
const CUENTA = [
  { id:'mv1', fecha:'2026-08-01', tipo:'aporte', username:'papa', importe:250,
    creado_por:'papa', timestamp:'2026-08-01T09:00:00.000Z' },
  { id:'mv2', fecha:'2026-08-03', tipo:'aporte', username:'mama', importe:190,
    creado_por:'mama', timestamp:'2026-08-03T09:00:00.000Z' }
];

const BOOT = { ok:true, data:{
  version:'0.5.0', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', cuota_mensual:'250' },
  usuarios:[{username:'papa',nombre:'Papá',rol:'progenitor',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',rol:'progenitor',color:'#E4575B',activo:true},
            {username:'gina',nombre:'Gina',rol:'hija',color:'#8B62D9',activo:false}],
  patron:[{id:'c',lun:'papa',mar:'papa',mie:'mama',jue:'mama',vie:'alterno',sab:'alterno',
           dom:'alterno',hora_cambio:'18:00',ancla_fecha:'2026-08-21',ancla_usuario:'papa'}],
  custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[],
  gastos:GASTOS, cuenta:CUENTA, liquidaciones:[], categorias_gasto:CATS,
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[], documentos:[],
  actividad:[], visitas:[]
}};

const posts = [];
const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        const b = JSON.parse(o.body);
        posts.push(b);
        if(b.action === 'subirArchivo'){
          return Promise.resolve({ json:()=>Promise.resolve({ ok:true,
            data:{ url:'https://drive.test/f/abc', id:'abc', nombre:'ticket' } }) });
        }
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
  click([...d.querySelectorAll('#nav button')].find(b => b.dataset.s === 'gastos'));
  const cuerpo = () => d.querySelector('#gasCuerpo').textContent.replace(/\s+/g,' ');

  console.log('\n--- SALDO DE LA CUENTA COMÚN ---');
  // 250 + 190 aportados − (65 + 40 + 22 pagados desde la común) = 313
  ok('saldo = 313,00 €', w.saldoComun() === 313, w.saldoComun());
  ok('lo muestra en pantalla', cuerpo().indexOf('313,00 €') >= 0, cuerpo().slice(0,200));
  ok('los gastos adelantados NO restan del saldo',
     w.saldoComun() !== 313 - 45 - 80);
  ok('muestra el último movimiento', cuerpo().indexOf('aporte de mamá') >= 0);

  console.log('\n--- PENDIENTES DE DEVOLVER ---');
  const pr = w.pendientesReembolso();
  ok('papá tiene 80 € adelantados', pr.papa === 80, pr.papa);
  ok('mamá tiene 45 € adelantados', pr.mama === 45, pr.mama);
  ok('son 2 gastos', pr.n === 2, pr.n);
  ok('el cine de mamá NO cuenta: no es compartido', pr.mama !== 63.5);
  ok('lo dice en pantalla', cuerpo().indexOf('Pendiente de devolver') >= 0);
  ok('con las dos cifras', cuerpo().indexOf('80,00 €') >= 0 && cuerpo().indexOf('45,00 €') >= 0);

  console.log('\n--- APORTES DEL MES ---');
  ok('papá ha aportado 250', w.aportadoEnMes('papa', MES) === 250);
  ok('mamá ha aportado 190', w.aportadoEnMes('mama', MES) === 190);
  ok('papá sale al día', cuerpo().indexOf('Al día') >= 0);
  ok('a mamá le faltan 60,00 €', cuerpo().indexOf('Faltan 60,00 €') >= 0,
     cuerpo().match(/Faltan.{0,20}/));
  ok('la cuota se lee de Config, no está en el código',
     cuerpo().indexOf('Aportes acordados: 250,00 € cada uno') >= 0);
  ok('y se dice que la pactasteis vosotros', cuerpo().indexOf('no un cálculo de la app') >= 0);

  console.log('\n--- ESTADO DE LA CUENTA ---');
  const est = w.estadoCuenta(MES);
  ok('con un aporte pendiente el estado lo refleja', est.t === 'Falta un aporte', est.t);
  ok('no usa palabras que repartan culpa',
     !/sana|enferma|mal|fatal|culpa/i.test(cuerpo()));

  console.log('\n--- GASTOS DEL MES ---');
  const gs = w.gastosDeMes(MES);
  ok('5 gastos en agosto (el bañador es de julio)', gs.length === 5, gs.length);
  // 65 + 45 + 40 + 80 + 18,50
  ok('total 248,50 €', cuerpo().indexOf('248,50 €') >= 0, cuerpo().match(/Total gastado.{0,30}/));
  ok('ordenados de más reciente a más antiguo', gs[0].id === 'g1' && gs[4].id === 'g5');
  ok('el donut se dibuja sin librerías', d.querySelectorAll('#gasCuerpo svg.donut').length >= 2);
  ok('la leyenda lleva importes y porcentajes',
     cuerpo().indexOf('26%') >= 0 || cuerpo().indexOf('32%') >= 0, cuerpo().match(/Ropa.{0,24}/));

  console.log('\n--- LISTA DE GASTOS ---');
  ok('distingue lo pagado desde la común', cuerpo().indexOf('Desde la cuenta común') >= 0);
  ok('y lo adelantado por una persona', cuerpo().indexOf('Lo pagó papá') >= 0);
  ok('marca lo que está por devolver', cuerpo().indexOf('por devolver') >= 0);
  ok('marca el gasto que es solo de uno', cuerpo().indexOf('solo suyo') >= 0);

  console.log('\n--- NAVEGACIÓN POR MESES ---');
  click(d.querySelector('#gasPrev'));
  ok('pasa a julio', w.state.gasMes === '2026-07', w.state.gasMes);
  ok('y muestra el bañador', cuerpo().indexOf('Bañador') >= 0);
  ok('el saldo de la cuenta NO cambia con el mes', w.saldoComun() === 313);
  click(d.querySelector('#gasNext'));
  ok('vuelve a agosto', w.state.gasMes === MES);
  ok('el mes de diciembre salta bien de año', w.mesAnterior('2026-12', 1) === '2027-01');
  ok('y enero hacia atrás también', w.mesAnterior('2026-01', -1) === '2025-12');

  console.log('\n--- FORMULARIO DE GASTO ---');
  click(d.querySelector('#gasNuevo'));
  ok('se abre la hoja', d.querySelector('#hoja').classList.contains('on'));
  ok('el origen por defecto es la cuenta común', w.borradorGasto.origen === 'comun');
  ok('sin origen personal no pregunta por el reparto', !d.querySelector('[data-gcampo="compartido"]'));
  ok('el importe es texto, no number (la coma decimal)',
     d.querySelector('#gImp').getAttribute('type') === 'text' &&
     d.querySelector('#gImp').getAttribute('inputmode') === 'decimal');

  click(d.querySelector('[data-gcampo="origen"][data-val="papa"]'));
  ok('al elegir origen personal aparece el reparto', !!d.querySelector('[data-gcampo="compartido"]'));
  ok('y por defecto es compartido', w.borradorGasto.compartido === true);
  ok('avisa de que quedará pendiente de devolver',
     d.querySelector('#hojaC').textContent.indexOf('pendiente de devolver') >= 0);
  click(d.querySelector('[data-gcampo="compartido"][data-val="0"]'));
  ok('se puede marcar como cosa suya', w.borradorGasto.compartido === false);
  ok('y el aviso cambia',
     d.querySelector('#hojaC').textContent.indexOf('Ni se reparte ni se reembolsa') >= 0);

  console.log('\n--- NÚMEROS ESCRITOS A MANO ---');
  ok('24,50 → 24.5', w.num('24,50') === 24.5, w.num('24,50'));
  ok('24.50 → 24.5 (por si alguien lo escribe a la inglesa)',
     w.num('24.50') === 24.5, w.num('24.50'));
  ok('1.240,55 → 1240.55, tal y como lo imprime la propia app',
     w.num('1.240,55') === 1240.55, w.num('1.240,55'));
  ok('1.240 → 1240, no 1,24', w.num('1.240') === 1240, w.num('1.240'));
  ok('1.240.500 → 1240500', w.num('1.240.500') === 1240500, w.num('1.240.500'));
  ok('aguanta el símbolo del euro pegado', w.num('38 €') === 38, w.num('38 €'));
  ok('lo que no es un número es 0, no NaN', w.num('hola') === 0, w.num('hola'));

  console.log('\n--- LA COMA DECIMAL ---');
  d.querySelector('#gDesc').value = 'Libros';
  d.querySelector('#gImp').value = '24,50';
  click(d.querySelector('[data-gcampo="categoria"][data-val="educacion"]'));
  ok('conserva lo escrito al repintar', w.borradorGasto.descripcion === 'Libros',
     w.borradorGasto.descripcion);
  ok('y el importe con coma', w.borradorGasto.importe === '24,50', w.borradorGasto.importe);

  const antes = posts.length;
  click(d.querySelector('#gasGuardar'));
  setTimeout(() => {
    ok('manda un POST', posts.length === antes + 1);
    const p = posts[posts.length-1];
    ok('la acción es saveGasto', p && p.action === 'saveGasto');
    ok('24,50 se guarda como 24.5, no como 0',
       p && p.payload.importe === 24.5, p && p.payload.importe);
    ok('con su origen', p && p.payload.origen === 'papa');
    ok('y marcado como no compartido', p && p.payload.compartido === 'FALSE');
    ok('registra quién lo apunta', p && p.payload.creado_por === 'papa');

    console.log('\n--- IMPORTE INVÁLIDO ---');
    w.formGasto('');
    const antes2 = posts.length;
    d.querySelector('#gImp').value = '0';
    click(d.querySelector('#gasGuardar'));
    ok('no guarda un gasto de 0 €', posts.length === antes2);
    ok('y lo dice', d.querySelector('#toast').textContent.indexOf('mayor que 0') >= 0);

    console.log('\n--- EDITAR ---');
    w.formGasto('g4');
    ok('carga el concepto', w.borradorGasto.descripcion === 'Zapatillas');
    ok('carga el origen', w.borradorGasto.origen === 'papa');
    ok('ofrece borrarlo', !!d.querySelector('#gasBorrar'));

    console.log('\n--- COMPROBANTE Y COMENTARIOS ---');
    w.formGasto('');
    ok('ofrece hacer o subir una foto', !!d.querySelector('#gFoto') &&
       d.querySelector('#gFoto').getAttribute('accept') === 'image/*');
    ok('sin forzar la cámara: el móvil deja elegir carrete',
       !d.querySelector('#gFoto').hasAttribute('capture'));
    ok('y subir un fichero cualquiera (la factura en PDF)',
       !!d.querySelector('#gFich') && !d.querySelector('#gFich').getAttribute('accept'));
    ok('hay un campo libre de comentarios', !!d.querySelector('#gNota'));
    ok('el comprobante es opcional, y lo dice',
       d.querySelector('#hojaC').textContent.indexOf('Comprobante opcional') >= 0,
       d.querySelector('#hojaC').textContent.match(/Comprobante.{0,15}/));

    /* Un PDF: no pasa por el canvas, va tal cual. */
    d.querySelector('#gDesc').value = 'Fisio';
    d.querySelector('#gImp').value = '38';
    d.querySelector('#gNota').value = 'Mitad la cubre Adeslas';
    const antesUp = posts.length;
    w.comprobanteElegido({ value:'',
      files:[ new w.File(['%PDF-1.4 factura'], 'factura.pdf', { type:'application/pdf' }) ] });
    setTimeout(() => {
      ok('sube el fichero', posts.length === antesUp + 1, posts.length - antesUp);
      const pu = posts[posts.length-1];
      ok('con su propia acción', pu && pu.action === 'subirArchivo', pu && pu.action);
      ok('no crea un documento de Salud: un ticket no es historial médico',
         pu && pu.action !== 'saveDocumento');
      ok('manda el fichero en base64',
         pu && /^data:application\/pdf;base64,/.test(String(pu.payload.archivo)),
         pu && String(pu.payload.archivo).slice(0,40));
      ok('guarda la URL en el borrador',
         w.borradorGasto.comprobante === 'https://drive.test/f/abc',
         w.borradorGasto.comprobante);
      ok('adjuntar no borra lo que ya estaba escrito',
         w.borradorGasto.descripcion === 'Fisio' && w.borradorGasto.nota === 'Mitad la cubre Adeslas',
         w.borradorGasto.descripcion + ' / ' + w.borradorGasto.nota);
      ok('y se puede abrir desde la hoja',
         !!d.querySelector('.cmp a') &&
         d.querySelector('.cmp a').getAttribute('href') === 'https://drive.test/f/abc');
      ok('ya no ofrece adjuntar otro encima', !d.querySelector('#gFoto'));

      const antesG = posts.length;
      click(d.querySelector('#gasGuardar'));
      setTimeout(() => {
        const pg = posts[posts.length-1];
        ok('el gasto se guarda con el comprobante',
           pg && pg.payload.comprobante === 'https://drive.test/f/abc', pg && pg.payload.comprobante);
        ok('y con los comentarios',
           pg && pg.payload.nota === 'Mitad la cubre Adeslas', pg && pg.payload.nota);
        ok('el importe sigue bien', pg && pg.payload.importe === 38, pg && pg.payload.importe);

        console.log('\n--- QUITAR EL COMPROBANTE ---');
        w.formGasto('');
        w.borradorGasto.comprobante = 'https://drive.test/f/abc';
        w.pintarFormGasto();
        d.querySelector('#gNota').value = 'Se me pegó otro ticket';
        click(d.querySelector('#gQuitaCmp'));
        ok('lo quita', w.borradorGasto.comprobante === '');
        ok('vuelve a ofrecer adjuntar', !!d.querySelector('#gFoto'));
        ok('sin perder los comentarios',
           w.borradorGasto.nota === 'Se me pegó otro ticket', w.borradorGasto.nota);

        console.log('\n--- GASTO AJENO: SE VE, NO SE TOCA ---');
        w.state.data.gastos.push({ id:'g7', fecha:'2026-08-14', categoria:'salud',
          descripcion:'Vacuna', importe:30, origen:'comun', compartido:true,
          comprobante:'https://drive.test/f/vac', nota:'Pagó ella y lo pasó',
          reembolso_id:'', creado_por:'mama', timestamp:'2026-08-14T10:00:00.000Z' });
        w.state.modo = 'estricto';
        w.formGasto('g7');
        const aj = d.querySelector('#hojaC');
        ok('no se puede editar', !d.querySelector('#gasGuardar'));
        ok('pero el comprobante se ve', !!aj.querySelector('a[href="https://drive.test/f/vac"]'));
        ok('y los comentarios también',
           aj.textContent.indexOf('Pagó ella y lo pasó') >= 0);

        console.log('\n--- APORTE ---');
        click(d.querySelector('#velo'));
        w.state.modo = 'confianza';
        w.pintarGastos();
        click(d.querySelector('#gasAporte'));
        ok('propone la cuota acordada', d.querySelector('#aImp').value === '250');
        const antes3 = posts.length;
        click(d.querySelector('#apGuardar'));
        setTimeout(() => {
          ok('guarda el aporte', posts.length === antes3 + 1);
          const pa = posts[posts.length-1];
          ok('como movimiento de la cuenta', pa && pa.action === 'saveMovimiento');
          ok('de tipo aporte', pa && pa.payload.tipo === 'aporte');
          ok('con importe 250', pa && pa.payload.importe === 250);
          ok('y a nombre de quien lo ingresa', pa && pa.payload.username === 'papa');

          console.log('\n--- SALDO DE PARTIDA ---');
          w.pintarGastos();
          ok('se llega sin depender de la cuota mensual',
             !!d.querySelector('#gasAporteCC'));
          click(d.querySelector('#gasAporteCC'));
          click(d.querySelector('[data-acampo="tipo"][data-val="ajuste"]'));
          ok('deja de preguntar quién lo ingresa: no es de nadie',
             !d.querySelector('[data-acampo="username"]'));
          ok('lo explica', d.querySelector('#hojaC').textContent
             .indexOf('ya había en la cuenta') >= 0);
          ok('no propone la cuota: como saldo de partida sería inventada',
             d.querySelector('#aImp').value === '', d.querySelector('#aImp').value);
          d.querySelector('#aImp').value = '1.240,55';
          const antes4 = posts.length;
          click(d.querySelector('#apGuardar'));
          setTimeout(() => {
            const ps = posts[posts.length-1];
            ok('lo guarda', posts.length === antes4 + 1);
            ok('como ajuste, no como aporte de uno de los dos',
               ps && ps.payload.tipo === 'ajuste', ps && ps.payload.tipo);
            ok('sin dueño', ps && ps.payload.username === '', ps && ps.payload.username);
            ok('con el importe europeo bien leído',
               ps && ps.payload.importe === 1240.55, ps && ps.payload.importe);
            ok('y queda explicado en el histórico',
               ps && ps.payload.nota === 'Saldo de partida', ps && ps.payload.nota);
            /* 283 = los 313 de siempre menos la vacuna de 30 que añadimos
               arriba para probar la vista de solo lectura. */
            const previo = w.saldoComun();
            w.state.data.cuenta.push({ id:'mv9', fecha:'2026-08-01', tipo:'ajuste',
              username:'', importe:1000, nota:'Saldo de partida', creado_por:'papa' });
            ok('un ajuste suma al saldo, no resta',
               previo === 283 && w.saldoComun() === 1283, previo + ' → ' + w.saldoComun());
            ok('y el histórico lo llama por su nombre',
               w.textoMovimiento({ tipo:'ajuste', username:'', importe:1000,
                 nota:'Saldo de partida', fecha:'2026-08-01' }).indexOf('saldo de partida') === 0,
               w.textoMovimiento({ tipo:'ajuste', username:'', importe:1000,
                 nota:'Saldo de partida', fecha:'2026-08-01' }));

            console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
            process.exit(fallos ? 1 : 0);
          }, 220);
        }, 220);
      }, 220);
    }, 260);
  }, 220);
}, 700);
