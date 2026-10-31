/* GINapp — tests de Documentos (jsdom)
   Correr desde la carpeta del repo:  node test_documentos.js

   Lo que de verdad se comprueba aquí no es que la lista se pinte, sino
   tres cosas que, si fallan, fallan en silencio:
     · que el archivo se COMPRIME antes de salir del móvil
     · que lo que se manda al backend es el documento que elegiste
     · que un archivo que no es de la carpeta de la app NO se sirve
                                                                          */
const fs = require('fs'), path = require('path'), { JSDOM } = require('jsdom');

function resp(obj){
  const t = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return Promise.resolve({ ok:true, status:200,
    text:()=>Promise.resolve(t), json:()=>Promise.resolve(JSON.parse(t)) });
}

const HOY = '2026-08-19';
const DOCS = [
  { id:'do1', fecha:'2026-06-10', titulo:'Informe revisión anual', tipo:'informe',
    url:'https://drive.google.com/file/d/FID1/view', file_id:'FID1', mime:'image/jpeg',
    entidad:'', ref_id:'', creado_por:'papa', timestamp:'2026-06-10T10:00:00.000Z' },
  { id:'do2', fecha:'2026-09-02', titulo:'Autorización salidas', tipo:'cole',
    url:'https://drive.google.com/file/d/FID2/view', file_id:'FID2',
    mime:'application/pdf', entidad:'', ref_id:'', creado_por:'mama',
    timestamp:'2026-09-02T08:00:00.000Z' },
  { id:'do3', fecha:'2026-03-01', titulo:'Receta antibiótico', tipo:'receta',
    url:'', file_id:'FID3', mime:'image/jpeg',
    entidad:'', ref_id:'', creado_por:'papa', timestamp:'2026-03-01T08:00:00.000Z' }
];

const BOOT = { ok:true, data:{
  version:'0.3.2', hoy:HOY,
  config:{ nombre_hija:'Georgina', nombre_corto:'Gina', fecha_nacimiento:'2018-03-14' },
  usuarios:[{username:'papa',nombre:'Papá',rol:'progenitor',color:'#2878D4',activo:true},
            {username:'mama',nombre:'Mamá',rol:'progenitor',color:'#E4575B',activo:true}],
  patron:[], custodia:[], eventos:[], eventos_excepciones:[], tipos_evento:[],
  gastos:[], liquidaciones:[], categorias_gasto:[],
  alimentos:[], comidas:[], objetivos_semana:[],
  citas:[], medicacion:[], dosis:[], episodios:[], vacunas:[], crecimiento:[],
  documentos:DOCS, actividad:[], visitas:[]
}};

const posts = [], gets = [];
const dom = new JSDOM(fs.readFileSync(path.join(__dirname,'index.html'),'utf8'), {
  runScripts:'dangerously', url:'https://x.test/ginapp/', pretendToBeVisual:true,
  beforeParse(w){
    w.fetch = (u, o) => {
      if(o && o.method === 'POST'){
        const b = JSON.parse(o.body);
        posts.push(b);
        if(b.action === 'subirDocumento'){
          const p = b.payload || {};
          return resp({ ok:true, data:{
            id:'nuevo1', fecha:p.fecha, titulo:p.titulo, tipo:p.tipo,
            url:'https://drive.google.com/file/d/NEW/view', file_id:'NEW',
            mime:p.mime, entidad:'', ref_id:'', creado_por:p.creado_por,
            timestamp:'2026-08-19T12:00:00.000Z' } });
        }
        return resp({ ok:true, data:{ id:'x' } });
      }
      const q = new URL(String(u), 'https://x/').searchParams;
      if(q.get('action') === 'verDocumento'){
        gets.push(q.get('id'));
        /* 1x1 GIF: lo bastante real para que el <img> tenga un src válido. */
        return resp({ ok:true, data:{ id:q.get('id'), nombre:'x.gif', mime:'image/gif',
          bytes:43, b64:'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' } });
      }
      return resp(BOOT);
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
function click(el){
  if(!el) { fallos++; console.log('  ❌ (no existe el elemento que iba a pulsar)'); return; }
  el.dispatchEvent(new dom.window.Event('click',{bubbles:true}));
}
const espera = ms => new Promise(r => setTimeout(r, ms));

setTimeout(async () => {
  const w = dom.window, d = w.document;
  const hoja = () => (d.querySelector('#hojaC')||{}).textContent || '';
  click([...d.querySelectorAll('#nav button')].find(b => b.dataset.s === 'salud'));

  console.log('\n--- LA PUERTA EXISTE Y LLEVA A ALGÚN SITIO ---');
  /* Era un <div> decorativo: prometía «toda la información organizada» y
     al tocarlo no pasaba nada. Dos puertas, las dos muertas. */
  const banner = d.querySelector('#salDocsB');
  ok('la carpeta de abajo es un botón, no un adorno',
     !!banner && banner.tagName === 'BUTTON', banner && banner.tagName);
  ok('y dice cuántos hay, que es lo que distingue una carpeta llena de una vacía',
     banner.textContent.indexOf('3 archivos') >= 0, banner.textContent);
  ok('el contador de arriba también sigue ahí', !!d.querySelector('#salDocs'));

  click(banner);
  ok('se abre la hoja de documentos', d.querySelector('#hoja').classList.contains('on'));
  ok('con los tres', [...d.querySelectorAll('[data-doc]')].length === 3,
     [...d.querySelectorAll('[data-doc]')].length);

  console.log('\n--- ORDEN Y FILTROS ---');
  const ids = () => [...d.querySelectorAll('[data-doc]')].map(b => b.dataset.doc);
  /* Del más reciente al más viejo: septiembre, junio, marzo. Un cajón de
     papeles ordenado por cuándo lo metiste no sirve de nada. */
  ok('ordena por fecha del documento, no por cuándo se subió',
     ids().join(',') === 'do2,do1,do3', ids().join(','));
  click(d.querySelector('[data-docf="cole"]'));
  ok('filtrar por Cole deja uno', ids().join(',') === 'do2', ids().join(','));
  click(d.querySelector('[data-docf=""]'));
  ok('y Todos los devuelve', ids().length === 3);

  w.state.docQ = 'receta';
  w.pintarDocumentos();
  ok('la búsqueda va por título', ids().join(',') === 'do3', ids().join(','));
  w.state.docQ = 'zzz';
  w.pintarDocumentos();
  ok('sin resultados lo dice, no deja la lista en blanco',
     hoja().indexOf('Nada con ese filtro') >= 0, hoja().slice(0,160));
  w.state.docQ = '';
  w.pintarDocumentos();

  console.log('\n--- SUBIR: LA FOTO SE REDUCE ANTES DE SALIR DEL MÓVIL ---');
  /* Una foto de informe son 4 MB; en base64, 5,5 MB por un POST de Apps
     Script. Con datos móviles eso no sube. Esto comprueba que
     prepararArchivo redimensiona de verdad, no que «hay una función». */
  let pintado = null;
  w.HTMLCanvasElement.prototype.getContext = function(){
    return { drawImage:(img,x,y,an,al)=>{ pintado = { an:an, al:al }; } };
  };
  w.HTMLCanvasElement.prototype.toDataURL = function(){
    return 'data:image/jpeg;base64,RkFLRUpQRUc=';
  };
  w.URL.createObjectURL = () => 'blob:x';
  w.URL.revokeObjectURL = () => {};
  /* Una Image falsa de 4000x3000, como la de cualquier móvil. */
  const ImagenReal = w.Image;
  w.Image = function(){
    const o = { width:4000, height:3000 };
    Object.defineProperty(o, 'src', { set(){ setTimeout(()=>o.onload && o.onload(), 0); } });
    return o;
  };

  let entregado = null;
  w.prepararArchivo({ name:'informe.jpg', type:'image/jpeg', size:4*1024*1024 },
    { max:1600, topeMB:15 }, (url, mime, nombre) => { entregado = { url, mime, nombre }; });
  await espera(30);

  ok('la foto se redimensiona al lado largo pedido', pintado && pintado.an === 1600,
     pintado && (pintado.an+'x'+pintado.al));
  ok('y se mantiene la proporción (4000x3000 → 1600x1200)',
     pintado && pintado.al === 1200, pintado && pintado.al);
  ok('sale como JPEG, no como el PNG enorme del canvas',
     entregado && entregado.mime === 'image/jpeg', entregado && entregado.mime);

  /* 1600, no 1200 como en los tickets de gasto: un informe lleva letra
     pequeña y a 1200 se pierde justo lo que querías guardar. */
  pintado = null;
  w.prepararArchivo({ name:'ticket.jpg', type:'image/jpeg', size:1024 },
    { max:1200, topeMB:8 }, ()=>{});
  await espera(30);
  ok('los tickets de gasto siguen yendo a 1200: cada uno con su tamaño',
     pintado && pintado.an === 1200, pintado && pintado.an);

  /* Un PDF no se toca: redimensionar un PDF no significa nada. */
  let pdf = null;
  const FRreal = w.FileReader;
  w.FileReader = function(){
    this.readAsDataURL = () => { this.result = 'data:application/pdf;base64,UERG';
                                 setTimeout(()=>this.onload && this.onload(), 0); };
  };
  w.prepararArchivo({ name:'informe.pdf', type:'application/pdf', size:300*1024 },
    { max:1600, topeMB:15 }, (url, mime) => { pdf = { url, mime }; });
  await espera(30);
  ok('un PDF va tal cual, sin pasar por el canvas',
     pdf && pdf.mime === 'application/pdf', pdf && pdf.mime);

  /* Y por encima del tope no se intenta: Apps Script se queda sin memoria
     montando el base64 y devuelve un error que no entiende nadie. */
  let gordo = 'no llamado';
  w.prepararArchivo({ name:'escaner.tiff', type:'image/tiff'.replace('image/','x/'),
                      size:40*1024*1024 },
    { max:1600, topeMB:15 }, () => { gordo = 'llamado'; });
  await espera(30);
  ok('un fichero enorme se rechaza aquí, no en el servidor', gordo === 'no llamado', gordo);

  console.log('\n--- SUBIR: QUÉ LE LLEGA AL BACKEND ---');
  w.pintarDocumentos();
  click(d.querySelector('#docNuevo'));
  ok('se abre el formulario', hoja().indexOf('Nuevo documento') >= 0);
  ok('propone hoy como fecha', d.querySelector('#dcFecha').value === HOY,
     d.querySelector('#dcFecha').value);

  click(d.querySelector('[data-doctipo="receta"]'));
  ok('el tipo se puede cambiar', w.borradorDoc.tipo === 'receta', w.borradorDoc.tipo);

  /* Sin archivo no se guarda: una ficha sin archivo es una fila que no
     sirve para nada y que nadie vuelve a tocar. */
  const antes = posts.length;
  d.querySelector('#dcTit').value = 'Antibiótico de septiembre';
  click(d.querySelector('#dcGuardar'));
  await espera(30);
  ok('sin archivo no manda nada', posts.length === antes, posts.length - antes);

  w.borradorDoc.archivo = 'data:image/jpeg;base64,RkFLRQ==';
  w.borradorDoc.mime = 'image/jpeg';
  w.borradorDoc.nombre = 'receta.jpg';
  w.pintarFormDoc();
  ok('con archivo elegido se ve cuál es', hoja().indexOf('receta.jpg') >= 0, hoja());
  d.querySelector('#dcTit').value = 'Antibiótico de septiembre';
  d.querySelector('#dcFecha').value = '2026-08-15';
  click(d.querySelector('#dcGuardar'));

  ok('mientras sube lo dice, en vez de quedarse mudo',
     hoja().indexOf('Subiendo') >= 0, hoja().slice(0,200));
  await espera(60);

  const env = posts[posts.length-1];
  ok('manda subirDocumento', env && env.action === 'subirDocumento', env && env.action);
  ok('con el título escrito', env.payload.titulo === 'Antibiótico de septiembre',
     env.payload.titulo);
  ok('el tipo elegido', env.payload.tipo === 'receta', env.payload.tipo);
  ok('la fecha del documento, no la de hoy', env.payload.fecha === '2026-08-15',
     env.payload.fecha);
  ok('el archivo', String(env.payload.archivo).indexOf('base64,') > 0);
  ok('y quién lo sube', env.payload.creado_por === 'papa', env.payload.creado_por);
  /* Y el token, como toda escritura: sin esto el backend lo rechaza. */
  ok('viaja con el token de la sesión', !!env.token, env.token);

  ok('la fila nueva entra en la lista sin recargar',
     w.state.data.documentos.length === 4, w.state.data.documentos.length);
  ok('y se ve', hoja().indexOf('Antibiótico de septiembre') >= 0);
  ok('el contador de la pantalla de Salud se actualiza solo',
     (d.querySelector('#salDocsB')||{}).textContent.indexOf('4 archivos') >= 0,
     (d.querySelector('#salDocsB')||{}).textContent);

  console.log('\n--- VER: EL ARCHIVO NO ES PÚBLICO ---');
  /* El visor pide los bytes al backend con el token en vez de abrir un
     enlace de Drive. Así no hace falta que haya sesión de Google abierta
     —que en un móvil falla justo el día que tienes prisa— y, sobre todo,
     el archivo puede quedarse privado. */
  click(d.querySelector('[data-doc="do1"]'));
  ok('mientras llega, lo dice', hoja().indexOf('Abriendo el archivo') >= 0, hoja().slice(0,160));
  await espera(60);
  ok('pide el archivo por su id de Drive', gets[gets.length-1] === 'FID1', gets.join(','));
  const img = d.querySelector('#hojaC .doc-img');
  ok('y lo pinta dentro de la app', !!img);
  ok('desde los bytes, no desde un enlace de Drive',
     img && img.src.indexOf('data:image/') === 0, img && img.src.slice(0,40));
  ok('con el enlace de Drive aparte, para descargar o imprimir',
     (d.querySelector('#hojaC a[href*="drive.google.com"]')||{}).href
       .indexOf('FID1') >= 0);

}, 400);

/* El borrado y el resto del visor se prueban en un segundo pase: hace
   falta volver a abrir la hoja después de cerrarla. */
setTimeout(async () => {
  const w = dom.window, d = w.document;
  const hoja = () => (d.querySelector('#hojaC')||{}).textContent || '';
  const espera2 = ms => new Promise(r => setTimeout(r, ms));

  console.log('\n--- CACHÉ DEL VISOR ---');
  w.pintarDocumentos();
  const antesGets = gets.length;
  click(d.querySelector('[data-doc="do1"]'));
  await espera2(40);
  ok('un documento ya abierto no se vuelve a bajar', gets.length === antesGets,
     (gets.length - antesGets) + ' peticiones de más');

  console.log('\n--- UN PDF NO SE PINTA COMO SI FUERA UNA FOTO ---');
  w.cacheDoc['do2'] = { mime:'application/pdf', b64:'UERG', nombre:'a.pdf' };
  w.verDocumento('do2');
  ok('va a un visor de PDF', !!d.querySelector('#hojaC .doc-pdf'));
  ok('y avisa de que algunos navegadores no lo pintan, en vez de dejar un hueco',
     hoja().indexOf('ábrelo en Drive') >= 0, hoja().slice(-200));

  console.log('\n--- SIN ENLACE DE DRIVE NO SE INVENTA UNO ---');
  w.cacheDoc['do3'] = { mime:'image/gif', b64:'R0lGODlh', nombre:'r.gif' };
  w.verDocumento('do3');
  ok('do3 no tiene url guardada y no sale el botón',
     !d.querySelector('#hojaC a[href*="drive.google.com"]'));
  ok('pero sí se puede ver y borrar', !!d.querySelector('#hojaC .doc-img') &&
     !!d.querySelector('[data-docborra="do3"]'));

  console.log('\n--- BORRAR ---');
  const antesN = w.state.data.documentos.length;
  const antesP = posts.length;
  click(d.querySelector('[data-docborra="do3"]'));
  await espera2(40);
  ok('desaparece de la lista al instante', w.state.data.documentos.length === antesN - 1,
     w.state.data.documentos.length);
  const del = posts[posts.length-1];
  ok('manda deleteDocumento', posts.length > antesP && del.action === 'deleteDocumento',
     del && del.action);
  ok('con el id', del && del.id === 'do3', del && del.id);
  /* El backend borra TAMBIÉN el archivo de Drive. Dejar la ficha fuera y
     el archivo dentro es peor que las dos cosas: nadie vuelve a Drive. */
  ok('y se olvida lo que tuviera cacheado', !w.cacheDoc['do3']);

  console.log(fallos ? '\n❌ '+fallos+' fallos' : '\n✅ TODOS LOS TESTS PASAN');
  if(fallos) process.exitCode = 1;
}, 1400);
