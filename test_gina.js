/* ============================================================
   test_gina.js — la página de Gina y los iconos configurables.

   Lo que se comprueba aquí, por orden de importancia:
    · una contraseña NUNCA baja al móvil con el resto de datos;
    · quitarla del formulario no la borra del Sheet sin querer;
    · un icono que falta no deja un hueco: vuelve el emoji.
   ============================================================ */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

const HOY = '2026-08-19';

/* El backend manda `tiene_secreto`, nunca `secreto`. */
const GINA = [
  { id:'f1', tipo:'documento', titulo:'DNI', numero:'12345678A',
    usuario:'', tiene_secreto:false, foto_a:'https://drive.test/a', foto_b:'https://drive.test/b',
    notas:'Caduca en 2029', en_poder_de:'papa', orden:1, activo:true },
  { id:'f2', tipo:'numero', titulo:'Pasaporte', numero:'AAB123456',
    usuario:'', tiene_secreto:false, foto_a:'', foto_b:'', notas:'', orden:2, activo:true },
  { id:'f3', tipo:'credencial', titulo:'Cole · Clickedu', numero:'',
    usuario:'gbarboza', tiene_secreto:true, foto_a:'', foto_b:'', notas:'', orden:3, activo:true },
  { id:'f4', tipo:'numero', titulo:'Ficha vieja', numero:'X',
    usuario:'', tiene_secreto:false, orden:4, activo:false }
];

const ICONOS = [
  { clave:'logo_splash', fichero:'logo.png', nota:'' },
  { clave:'ich_bien',    fichero:'bien.png', nota:'' },
  { clave:'logo_login',  fichero:'',         nota:'' }
];

const B = { ok:true, data:{
  version:'0.9.17', hoy:HOY, modo:'confianza',
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', moneda:'€' },
  usuarios:[{ username:'papa', nombre:'Papá', rol:'progenitor', color:'#2878D4', activo:true },
            { username:'mama', nombre:'Mamá', rol:'progenitor', color:'#E4575B', activo:true },
            /* A propósito con la carpeta escrita delante: es el error que
               hacía que la foto no apareciera y no dijera por qué. */
            /* activo:false como en el Sheet de verdad: no entra en la app.
               Y la foto con la carpeta escrita delante, que es el otro
               error que la hacía desaparecer sin decir por qué. */
            { username:'gina', nombre:'Gina', rol:'hija', color:'#8B62D9',
              foto:'img/gina.webp', activo:false }],
  patron:[], custodia:[], eventos:[], eventos_excepciones:[], tareas:[],
  tipos_evento:[{ id:'cumples', nombre:'Cumples', emoji:'🎂', icono:'tarta.png',
                  color:'#EC4899', orden:1, activo:true },
                { id:'otros', nombre:'Otros', emoji:'📌', icono:'', color:'#94A3B8',
                  orden:2, activo:true }],
  comentarios:[], recordatorios:[],
  gastos:[], cuenta:[], liquidaciones:[],
  categorias_gasto:[{ id:'salud', nombre:'Salud', emoji:'🩺', icono:'salud.svg',
                      color:'#0E9384', orden:1, activo:true }],
  alimentos:[], comidas:[], platos:[],
  objetivos_semana:[{ grupo:'verduras', nombre:'Verduras', emoji:'🥦', icono:'verd.png',
                      objetivo:14, tipo:'min', peso:20, orden:1, activo:true }],
  citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[], documentos:[],
  mensajes:[], actividad:[], visitas:[],
  tipos_comida:[{ id:'desayuno', nombre:'El desayuno', emoji:'🥣', icono:'des.png',
                  orden:1, activo:true },
                { id:'comida', nombre:'Comida', emoji:'', icono:'', orden:2, activo:true }],
  iconos: ICONOS,
  gina: GINA }};

let fallos = 0;
function ok(t, c, e){
  if(c) console.log('  ✅ '+t);
  else { console.log('  ❌ '+t + (e!==undefined ? '  → '+e : '')); fallos++; }
}
const espera = ms => new Promise(r => setTimeout(r, ms));

const posts = [];
const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/g/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        const b = JSON.parse(o.body);
        posts.push(b);
        if(b.action === 'verSecreto'){
          return Promise.resolve({ json:()=>Promise.resolve({
            ok:true, data:{ secreto:'Clave.2026!' } }) });
        }
        return Promise.resolve({ json:()=>Promise.resolve({ ok:true, data:{ id:'x' } }) });
      }
      return Promise.resolve({ json:()=>Promise.resolve(B) });
    };
    w.scrollTo = ()=>{}; w.alert = ()=>{};
    Object.defineProperty(w.navigator,'serviceWorker',{ value:undefined, configurable:true });
    w.localStorage.setItem('ginapp_user','papa');
    w.localStorage.setItem('ginapp_token','papa.9999999999999.x');
  }});

const w = dom.window, d = w.document;
function click(el){ el && el.dispatchEvent(new w.Event('click',{bubbles:true})); }
const hoja = () => (d.querySelector('#hojaC').textContent||'').replace(/\s+/g,' ');

(async function(){
  await espera(700);

  console.log('\n--- LA CONTRASEÑA NO BAJA AL MÓVIL ---');
  const cruda = JSON.stringify(w.state.data);
  ok('en ningún sitio de los datos cargados está la contraseña',
     cruda.indexOf('Clave.2026') < 0);
  ok('el backend solo dice SI la hay, no cuál',
     w.state.data.gina.some(f => f.tiene_secreto === true) &&
     w.state.data.gina.every(f => f.secreto === undefined));

  console.log('\n--- SE LLEGA TOCANDO SU FOTO ---');
  click(d.querySelector('#fotoGina'));
  ok('se abre la página', d.querySelector('#hoja').classList.contains('on'));
  ok('con su nombre', hoja().indexOf('Datos de Gina') >= 0, hoja().slice(0,80));
  ok('salen las tres fichas activas', d.querySelectorAll('[data-ginaver]').length === 3,
     d.querySelectorAll('[data-ginaver]').length);
  ok('la retirada no sale', hoja().indexOf('Ficha vieja') < 0);
  ok('el DNI enseña su número sin abrirlo', hoja().indexOf('12345678A') >= 0);
  ok('avisa de que las contraseñas quedan apuntadas al mirarlas',
     hoja().indexOf('queda apuntado') >= 0);

  console.log('\n--- UN DOCUMENTO ---');
  click(d.querySelector('[data-ginaver="f1"]'));
  ok('el número es tocable para copiarlo',
     !!d.querySelector('[data-copiar="12345678A"]'));
  ok('con las dos caras', d.querySelectorAll('.gn-foto img').length === 2,
     d.querySelectorAll('.gn-foto img').length);
  ok('y sus notas', hoja().indexOf('Caduca en 2029') >= 0);
  ok('no pide contraseña donde no la hay', hoja().indexOf('Contraseña') < 0);

  console.log('\n--- UNA CREDENCIAL ---');
  click(d.querySelector('#gnVolver'));
  click(d.querySelector('[data-ginaver="f3"]'));
  ok('el usuario se ve y se copia', !!d.querySelector('[data-copiar="gbarboza"]'));
  ok('la contraseña empieza tapada', hoja().indexOf('••••••••') >= 0);
  ok('y no está en el HTML de la hoja, ni escondida',
     d.querySelector('#hojaC').innerHTML.indexOf('Clave.2026') < 0);
  const antesV = posts.length;
  click(d.querySelector('#gnVerPass'));
  await espera(220);
  ok('pedirla es una llamada aparte', posts.length === antesV + 1);
  ok('con su propia acción', posts[posts.length-1].action === 'verSecreto',
     posts[posts.length-1].action);
  ok('ahora sí se ve', hoja().indexOf('Clave.2026!') >= 0);
  ok('y se puede copiar', !!d.querySelector('[data-copiar="Clave.2026!"]'));

  console.log('\n--- EDITAR SIN PERDER LA CONTRASEÑA ---');
  click(d.querySelector('[data-ginaedit="f3"]'));
  ok('el formulario NO trae la contraseña escrita', !d.querySelector('#gnPass'));
  ok('dice que ya hay una guardada', hoja().indexOf('guardada') >= 0);
  d.querySelector('#gnUsu').value = 'gbarboza2';
  const antesE = posts.length;
  click(d.querySelector('#gnGuardar'));
  await espera(240);
  const pe = posts[antesE];
  ok('se guarda el usuario nuevo', pe && pe.payload.usuario === 'gbarboza2',
     pe && pe.payload.usuario);
  ok('y NO se manda un secreto vacío, que la borraría',
     pe && pe.payload.secreto === undefined, pe && JSON.stringify(pe.payload.secreto));

  console.log('\n--- CAMBIARLA A PROPÓSITO SÍ ---');
  w.formGina('f3');
  click(d.querySelector('#gnCambiaPass'));
  ok('aparece el campo', !!d.querySelector('#gnPass'));
  d.querySelector('#gnPass').value = 'OtraClave9';
  const antesC = posts.length;
  click(d.querySelector('#gnGuardar'));
  await espera(240);
  ok('ahora sí viaja', posts[antesC] && posts[antesC].payload.secreto === 'OtraClave9',
     posts[antesC] && posts[antesC].payload.secreto);

  console.log('\n--- UN TIPO POR CADA COSA ---');
  w.formGina('');
  ok('por defecto es un documento', w.borradorGina.tipo === 'documento');
  ok('un documento pide fotos', !!d.querySelector('#gnFa') && !!d.querySelector('#gnFb'));
  ok('y no pide usuario', !d.querySelector('#gnUsu'));
  click(d.querySelector('[data-gntipo="credencial"]'));
  ok('una credencial pide usuario y contraseña',
     !!d.querySelector('#gnUsu') && !!d.querySelector('#gnPass'));
  ok('y no pide fotos del DNI', !d.querySelector('#gnFa'));
  d.querySelector('#gnTit').value = '';
  const antesT = posts.length;
  click(d.querySelector('#gnGuardar'));
  ok('no guarda algo sin nombre: no se sabría qué es', posts.length === antesT);
  ok('y lo dice', (d.querySelector('#toast').textContent||'').indexOf('nombre') >= 0,
     d.querySelector('#toast').textContent);

  console.log('\n--- QUIÉN TIENE EL DOCUMENTO ---');
  w.hojaGina();
  ok('la lista dice quién lo tiene', hoja().indexOf('Papá') >= 0, hoja().slice(0,220));
  ok('y solo en el que está puesto: los demás no dicen nada',
     d.querySelectorAll('.mk.casa').length === 1,
     d.querySelectorAll('.mk.casa').length);
  click(d.querySelector('[data-ginaver="f1"]'));
  ok('se cambia desde la ficha, sin entrar a editar',
     !!d.querySelector('[data-gnpoder="mama"]'));
  ok('con las tres casas y un "no se sabe"',
     d.querySelectorAll('[data-gnpoder]').length === 4,
     d.querySelectorAll('[data-gnpoder]').length);
  const antesP = posts.length;
  click(d.querySelector('[data-gnpoder="mama"]'));
  await espera(240);
  const pp = posts[antesP];
  ok('se guarda al toque', posts.length > antesP && pp.action === 'saveGinaFicha');
  ok('con el nuevo poseedor', pp && pp.payload.en_poder_de === 'mama',
     pp && pp.payload.en_poder_de);
  ok('y SOLO ese campo: no reescribe el resto de la ficha a ciegas',
     pp && pp.payload.titulo === undefined && pp.payload.numero === undefined,
     pp && Object.keys(pp.payload).join(','));
  ok('tampoco toca el secreto', pp && pp.payload.secreto === undefined);

  w.formGina('f3');
  ok('una credencial no pregunta quién la tiene: no es un papel',
     !d.querySelector('[data-gnpoder]'));

  console.log('\n--- GINA NO ENTRA EN LA APP, PERO SÍ SALE EN ELLA ---');
  /* Gina va con activo=FALSE en el Sheet porque no tiene perfil. El
     backend filtraba por ese campo y la dejaba fuera del todo: sin foto,
     sin color y sin nombre. `activo` dice quién ENTRA, no quién EXISTE. */
  ok('está entre los usuarios cargados',
     w.state.data.usuarios.some(u => u.username === 'gina'),
     w.state.data.usuarios.map(u => u.username).join(','));
  ok('con su foto', (w.usuario('gina').foto || '').indexOf('gina.webp') >= 0,
     w.usuario('gina').foto);
  ok('y su nombre', w.nombreDe('gina') === 'Gina', w.nombreDe('gina'));
  ok('la cabecera la pinta, no pone la inicial',
     (d.querySelector('#fotoGina').innerHTML || '').indexOf('img/gina.webp') >= 0,
     d.querySelector('#fotoGina').innerHTML);
  ok('pero NO se puede entrar como ella', !w.esPerfil(w.usuario('gina')));
  ok('los avis tampoco', !w.esPerfil({ rol:'abuelos', activo:true }));
  ok('un progenitor retirado tampoco entra',
     !w.esPerfil({ rol:'progenitor', activo:false }));
  ok('y uno sin la casilla puesta sí: vacío cuenta como activo',
     w.esPerfil({ rol:'progenitor', activo:'' }));

  console.log('\n--- LA RUTA DE UNA IMAGEN ---');
  ok('un nombre suelto va a img/', w.rutaIcono('gina.webp') === 'img/gina.webp',
     w.rutaIcono('gina.webp'));
  ok('con la carpeta escrita delante NO se duplica',
     w.rutaIcono('img/gina.webp') === 'img/gina.webp', w.rutaIcono('img/gina.webp'));
  ok('con barra inicial tampoco', w.rutaIcono('/img/gina.webp') === 'img/gina.webp',
     w.rutaIcono('/img/gina.webp'));
  ok('una URL entera se deja en paz',
     w.rutaIcono('https://x.test/a.png') === 'https://x.test/a.png');
  ok('vacío es vacío', w.rutaIcono('') === '' && w.rutaIcono(null) === '');
  ok('el avatar usa la misma regla, así que .webp con carpeta también sale',
     w.avatarHTML('gina',40).indexOf('src="img/gina.webp"') >= 0,
     w.avatarHTML('gina',40));

  console.log('\n--- ICONOS CONFIGURABLES ---');
  ok('un tipo de evento con icono pinta la imagen',
     w.ico(B.data.tipos_evento[0], 15, '').indexOf('img/tarta.png') >= 0,
     w.ico(B.data.tipos_evento[0], 15, ''));
  ok('y sin icono se queda el emoji',
     w.ico(B.data.tipos_evento[1], 15, '').indexOf('📌') >= 0,
     w.ico(B.data.tipos_evento[1], 15, ''));
  ok('el emoji viaja como respaldo de la imagen',
     w.ico(B.data.tipos_evento[0], 15, '').indexOf('data-fb="🎂"') >= 0);
  ok('una URL entera se respeta tal cual',
     w.ico({ icono:'https://x.test/a.png' }, 15, '').indexOf('src="https://x.test/a.png"') >= 0,
     w.ico({ icono:'https://x.test/a.png' }, 15, ''));
  ok('una clave suelta de la pestaña Iconos también',
     w.iconoDe('ich_bien', 30, '💚').indexOf('img/bien.png') >= 0);
  /* Sin escribir nada, el fichero se llama como la clave: subirlo basta. */
  ok('una clave sin fichero escrito busca el nombre por convención',
     w.iconoDe('logo_login', 30, '🌱').indexOf('img/logo_login.webp') >= 0,
     w.iconoDe('logo_login', 30, '🌱'));
  ok('y una clave que no está en la pestaña, igual',
     w.iconoDe('ich_nuevo', 30, '✨').indexOf('img/ich_nuevo.webp') >= 0,
     w.iconoDe('ich_nuevo', 30, '✨'));
  ok('lo escrito a mano manda sobre la convención',
     w.iconoDe('ich_bien', 30, '💚').indexOf('img/bien.png') >= 0);
  ok('el emoji viaja como respaldo por si el fichero no existe',
     w.iconoDe('ich_nuevo', 30, '✨').indexOf('data-fb="✨"') >= 0);

  console.log('\n--- UN FICHERO QUE FALTA NO SE PIDE TREINTA VECES ---');
  const antesRotos = Object.keys(w._iconosRotos).length;
  w._iconosRotos['img/ich_nuevo.webp'] = 1;
  ok('si ya sabemos que falta, se pinta el emoji y no se vuelve a pedir',
     w.iconoDe('ich_nuevo', 30, '✨').indexOf('<img') < 0 &&
     w.iconoDe('ich_nuevo', 30, '✨').indexOf('✨') >= 0,
     w.iconoDe('ich_nuevo', 30, '✨'));
  delete w._iconosRotos['img/ich_nuevo.webp'];
  ok('y al recargar se vuelve a probar: subir el fichero basta',
     w.iconoDe('ich_nuevo', 30, '✨').indexOf('<img') >= 0);

  console.log('\n--- LOS NOMBRES POR CONVENCIÓN ---');
  const te = w.state.data.tipos_evento.filter(x => x.id === 'otros')[0];
  ok('un tipo de evento sin nada escrito ya sabe qué fichero buscar',
     w.ico(te, 15, '').indexOf('img/ev_otros.webp') >= 0, w.ico(te, 15, ''));
  ok('el que SÍ tiene columna escrita la respeta',
     w.ico(w.state.data.tipos_evento[0], 15, '').indexOf('img/tarta.png') >= 0);
  ok('una categoría de gasto usa su prefijo',
     w.ico(w.state.data.categorias_gasto[0], 15, '').indexOf('gas_salud') >= 0 ||
     w.ico(w.state.data.categorias_gasto[0], 15, '').indexOf('salud.svg') >= 0);
  ok('un grupo de comida va por `grupo`, no por `id`',
     (w.state.data.objetivos_semana[0]._icono || '') === 'gr_verduras.webp',
     w.state.data.objetivos_semana[0]._icono);
  ok('una comida del día también',
     (w.tipoComida('cena')._icono || '') === 'com_cena.webp',
     w.tipoComida('cena')._icono);
  ok('el nombre derivado NO se escribe en la columna del Sheet',
     w.state.data.tipos_evento.filter(x => x.id === 'otros')[0].icono === '',
     w.state.data.tipos_evento.filter(x => x.id === 'otros')[0].icono);

  console.log('\n--- LAS COMIDAS SALEN DEL SHEET ---');
  ok('el nombre se puede cambiar desde el Sheet',
     w.tipoComida('desayuno').nom === 'El desayuno', w.tipoComida('desayuno').nom);
  ok('con su icono', w.tipoComida('desayuno').icono === 'des.png');
  ok('una fila a medias no deja la comida sin emoji',
     w.tipoComida('comida').em === '🍽️', w.tipoComida('comida').em);
  ok('un id que el Sheet no trae sigue existiendo',
     w.tipoComida('cena').nom === 'Cena', w.tipoComida('cena').nom);
  ok('y uno inventado no revienta', w.tipoComida('zzz').id === 'otro');

  console.log('\n--- EL COLOR DE LA PANTALLA DE CARGA ---');
  /* Sale de Config, pero la pantalla de carga se pinta antes de tener
     datos: se recuerda del arranque anterior, como los logos. */
  w.state.data.config.color_carga = '#F2E3FB';
  w.guardarLogos();
  ok('se recuerda para la próxima vez',
     w.localStorage.getItem('ginapp_color_carga') === '#F2E3FB',
     w.localStorage.getItem('ginapp_color_carga'));
  ok('y se aplica a la pantalla de carga',
     d.querySelector('#splash').style.background.indexOf('242') >= 0 ||
     d.querySelector('#splash').style.background.toLowerCase().indexOf('#f2e3fb') >= 0,
     d.querySelector('#splash').style.background);
  ok('y a la del PIN, que es la misma pantalla para el que mira',
     !!d.querySelector('#login').style.background,
     d.querySelector('#login').style.background);
  ok('la barra de estado del móvil va a juego',
     (d.querySelector('meta[name="theme-color"]')||{}).content !== '#FAFAFA');
  ok('un color inventado no se traga: se queda el de siempre',
     (function(){
       w.state.data.config.color_carga = 'lila bonito';
       w.guardarLogos();
       return !w.localStorage.getItem('ginapp_color_carga');
     })());
  w.state.data.config.color_carga = '';
  w.guardarLogos();

  console.log('\n--- EL LOGO SE RECUERDA PARA LA PRÓXIMA CARGA ---');
  ok('se guarda el fichero del splash',
     w.localStorage.getItem('ginapp_logo_splash') === 'logo.png',
     w.localStorage.getItem('ginapp_logo_splash'));
  ok('el que no tiene fichero escrito toma el nombre por convención',
     w.localStorage.getItem('ginapp_logo_login') === 'logo_login.webp',
     w.localStorage.getItem('ginapp_logo_login'));
  ok('y ya se está pintando', !!d.querySelector('#logoSplash img'));
  ok('guardando el dibujo original por si la imagen falla',
     (d.querySelector('#logoSplash').dataset.orig||'').indexOf('GINapp') >= 0 ||
     (d.querySelector('#logoSplash').dataset.orig||'').indexOf('gin') >= 0);

  /* ============================================================
     Tres bugs de esta app han salido de lo mismo: una clase genérica de
     un componente (.hoy, .est, .sel, .sec) que también era el modificador
     de otro. El síntoma siempre es raro y tardío — 14px de menos en una
     celda, un botón de 172px de alto. Esto lo caza al escribirlo.
     ============================================================ */
  console.log('\n--- NINGÚN MODIFICADOR PISA A UN COMPONENTE ---');
  const css = [...d.querySelectorAll('style')].map(s => s.textContent).join('\n');
  /* Solo interesan las clases sueltas que se comportan como COMPONENTE:
     las que pintan fondo, se posicionan o reservan alto. Una utilidad como
     .i (envolver un icono) o un modificador como .ta (textarea) declaran
     ajustes finos y pueden repetir nombre sin consecuencias. */
  const DE_COMPONENTE = /(^|;)\s*(min-height|height|box-shadow|position|margin|margin-top|margin-bottom|background)\s*:/;
  const sueltas = new Set();
  css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').forEach(bloque => {
    const p = bloque.split('{');
    if(p.length < 2 || !DE_COMPONENTE.test(p[1])) return;
    p[0].split(',').forEach(x => {
      const t = x.trim();
      if(/^\.[a-z][a-z0-9-]*$/.test(t)) sueltas.add(t.slice(1));
    });
  });
  /* Mirar solo el DOM del momento se queda corto: la mitad de las
     plantillas viven dentro de funciones que aún no se han llamado. Se
     lee el fichero entero y se sacan todos los `class="a b c"`, incluidos
     los de las cadenas de JavaScript. */
  const fuente = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
  const grupos = [];
  fuente.replace(/class="([^"]*)"/g, function(_, v){ grupos.push(v); return _; });
  [...d.querySelectorAll('*')].forEach(el => {
    if(el.classList.length > 1) grupos.push([...el.classList].join(' '));
  });

  const choques = [];
  grupos.forEach(g => {
    /* Las plantillas meten trozos de código entre clases ("chip'+(on?..."):
       se queda solo con lo que es un nombre de clase de verdad. */
    const cs = g.split(/[\s'"+]+/).filter(x => /^[a-z][a-z0-9-]*$/.test(x));
    if(cs.length < 2) return;
    cs.slice(1).forEach(c => {
      if(sueltas.has(c) && choques.indexOf(c + ' tras .' + cs[0]) < 0)
        choques.push(c + ' tras .' + cs[0]);
    });
  });
  ok('ningún modificador coincide con el nombre de un componente',
     choques.length === 0, choques.join(' · '));

  console.log('\n' + (fallos ? ('❌ ' + fallos + ' fallos') : '✅ TODOS LOS TESTS PASAN'));
  process.exit(fallos ? 1 : 0);
})();
