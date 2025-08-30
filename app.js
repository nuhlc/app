/* app.js */
(() => {
  'use strict';

  /* ========= CONFIG ========= */
  const ENDPOINT   = "https://script.google.com/macros/s/AKfycbwHk6o909wUncUcY0g0nRgJSpiZ-ZI7MtZjxMRCTrVU2yh9zm_M9uULA6SBYnTcuL0mEw/exec";
  const CARD_WIDTH = 638, CARD_HEIGHT = 1011, QR_SIZE = 200;
  const px2mm      = p => p * 0.264583;

  // Detecta 3D de forma segura
  const supports3D =
    (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' &&
     CSS.supports('transform-style','preserve-3d')) ? true : false;

  // Dados visuais opcionais (se quiser usar imagens em Base64)
  const BG_BASE64 = "";
  const LOGO_MAIN_BASE64   = "";
  const LOGO_FOOTER1_BASE64= "";
  const LOGO_FOOTER2_BASE64= "";

  // Estado do crachá (frente)
  const currentData = { name:'', code:'', photoUrl:'' };

  // ==== helpers de protocolo/código de barras/QR ====
  function sanitizeForBarcode(s){
    return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  }
  function getInitials(n){
    return n ? n.trim().split(' ').filter(Boolean).map(p=>p[0].toUpperCase()).join('') : '';
  }
  function makeProtocol(code,name){
    const d=new Date(),pad=n=>String(n).padStart(2,'0');
    const ts=`${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
    const clean=sanitizeForBarcode(code), half=Math.floor(clean.length/2);
    return `${ts}${clean.slice(0,half)}${getInitials(name)}${clean.slice(half)}`;
  }

  function safeRenderQR(){
    if(!window.QRCode) return;
    const cont=document.getElementById('qr'); if(!cont) return;
    cont.innerHTML='';
    new QRCode(cont,{
      text: JSON.stringify({nome: currentData.name||'Nome', codigo: currentData.code||''}),
      width: QR_SIZE, height: QR_SIZE
    });
  }
  function safeRenderBarcode(){
    const protocol = makeProtocol(currentData.code||'', currentData.name||'Nome');

    const protocolEl = document.getElementById('protocolText');
    if (protocolEl) protocolEl.textContent = protocol;

    if(window.JsBarcode){
      const svg=document.getElementById('barcode');
      if(svg){
        while(svg.firstChild) svg.removeChild(svg.firstChild);
        JsBarcode(svg, protocol, {
          format: "CODE128",
          lineColor: "#FFFFFF",
          background: "transparent",
          width: 2,
          height: 15,
          displayValue: false,
          margin: 0
        });
      }
    }
  }
  function renderAll(){ safeRenderQR(); safeRenderBarcode(); }

  function setBadgeData(name, code, photoUrl){
    currentData.name = name||'';
    currentData.code = code||'';
    currentData.photoUrl = photoUrl||'';

    const pName = document.getElementById('pName');
    const pCode = document.getElementById('pCode');
    if (pName) pName.textContent = currentData.name || 'Nome';
    if (pCode) pCode.textContent = currentData.code || 'Código';

    const img=document.getElementById('pPhoto');
    if (img){
      img.crossOrigin='anonymous';
      img.src = currentData.photoUrl || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCI+PC9zdmc+';
    }
    renderAll();
  }
  // Deixe disponível global (integrações externas)
  window.setBadgeData = setBadgeData;

  async function downloadCard(type='png'){
    if(!window.html2canvas){ alert('html2canvas não disponível offline até a primeira visita em HTTPS.'); return; }
    renderAll();
    const el=document.getElementById('cardFront'); if(!el) return;
    const canvas=await html2canvas(el,{backgroundColor:null,scale:4,useCORS:true,allowTaint:true});
    if(type==='png'){
      triggerDownload(canvas.toDataURL('image/png'),'cartao.png');
    }else{
      if(!window.jspdf||!window.jspdf.jsPDF){ alert('jsPDF não disponível offline até a primeira visita em HTTPS.'); return; }
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:[px2mm(CARD_WIDTH),px2mm(CARD_HEIGHT)]});
      pdf.addImage(canvas.toDataURL('image/jpeg',0.95),'JPEG',0,0,px2mm(CARD_WIDTH),px2mm(CARD_HEIGHT));
      pdf.save('cartao.pdf');
    }
  }
  window.downloadCard = downloadCard; // usado no HTML nos botões

  function triggerDownload(url,filename){
    const a=document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ======== Verso / scanner / fila offline ========
  let eventoValido = false;
  let qrInstance   = null;

  function setStatusOfflineUI(){
    const statusBar = document.getElementById('statusBar');
    if (!statusBar) return;
    statusBar.textContent = navigator.onLine ? "" : "Sem conexão — os registros serão enviados automaticamente quando a internet voltar.";
  }

  function mostrarMensagem(texto, isErro){
    const msg = document.getElementById('msg'); if(!msg) return;
    msg.textContent = texto;
    msg.classList.toggle('error', !!isErro);
  }

  function onScanSuccess(decodedText){
    try{
      const data=JSON.parse(decodedText);
      if(data && data.nome && data.codigo){
        const eventoInput = document.getElementById('evento');
        const bip = document.getElementById('bip');
        if (eventoInput) eventoInput.value = `${data.nome} - ${data.codigo}`;
        eventoValido = true;
        if (bip) bip.play();
        mostrarMensagem("Evento lido com sucesso!", false);
      }else{
        mostrarMensagem('QR inválido. Esperado {"nome":"...","codigo":"..."}', true);
      }
    }catch(e){
      mostrarMensagem("Leitura inválida do QR.", true);
    }
  }

  async function startQR(){
    try{
      if(!window.Html5Qrcode){ console.warn('html5-qrcode ainda não carregado (faça uma visita online para cachear).'); return; }
      if(qrInstance) return;
      qrInstance = new Html5Qrcode("reader");
      await qrInstance.start({ facingMode:"environment" }, { fps:10, qrbox:250 }, onScanSuccess);
    }catch(e){
      console.warn("Falha ao iniciar câmera:", e);
    }
  }
  async function stopQR(){
    try{
      if(qrInstance){
        await qrInstance.stop();
        await qrInstance.clear();
        qrInstance=null;
      }
    }catch(e){}
  }

  // Fila offline (localStorage)
  function getFila(){
    try{ return JSON.parse(localStorage.getItem('filaRegistros')||'[]'); }
    catch(e){ return []; }
  }
  function setFila(arr){ localStorage.setItem('filaRegistros', JSON.stringify(arr)); }

  async function enviarRegistro(record){
    const fd=new URLSearchParams();
    fd.append('nome', record.nome);
    fd.append('codigo', record.codigo);
    fd.append('evento', record.evento);
    fd.append('horario', record.horario);
    const resp=await fetch(ENDPOINT,{method:'POST',body:fd});
    if(!resp.ok) throw new Error('Falha no envio');
  }

  async function tentarEnviarFila(){
    const fila=getFila(); if(!fila.length || !navigator.onLine) return;
    const rest=[];
    for(const it of fila){
      try{ await enviarRegistro(it); }
      catch(e){ rest.push(it); }
    }
    setFila(rest);
    if (fila.length && !rest.length) mostrarMensagem("Registros pendentes enviados com sucesso.", false);
  }

  function salvaOffline(r){
    const f=getFila(); f.push(r); setFila(f);
  }

  // ======== Inicialização / Listeners ========
  document.addEventListener('DOMContentLoaded', () => {
    // Fallback visual se não houver 3D
    if (!supports3D) document.body.classList.add('no-3d');

    // Opcional: imagens base64 na frente
    const bgEl = document.getElementById('bg');
    if (bgEl && BG_BASE64.startsWith('data:')) bgEl.style.backgroundImage = `url('${BG_BASE64}')`;
    if (LOGO_MAIN_BASE64)   { const el = document.getElementById('logoMain'); if (el) el.src = LOGO_MAIN_BASE64; }
    if (LOGO_FOOTER1_BASE64){ const el = document.getElementById('foot1');    if (el) el.src = LOGO_FOOTER1_BASE64; }
    if (LOGO_FOOTER2_BASE64){ const el = document.getElementById('foot2');    if (el) el.src = LOGO_FOOTER2_BASE64; }

    // Render inicial da frente
    renderAll();

    // Prefill por URL
    const p=new URLSearchParams(location.search);
    setBadgeData(decodeURIComponent(p.get('name')||''), decodeURIComponent(p.get('code')||''), decodeURIComponent(p.get('photo')||''));

    // Botões de flip
    const card3d      = document.getElementById('card3d');
    const flipToBack  = document.getElementById('flipToBack');
    const flipToFront = document.getElementById('flipToFront');

    function showBack(){
      if (card3d) card3d.classList.add('is-back');
      if(!supports3D){ document.body.classList.add('back-visible'); }
      if (flipToFront) flipToFront.style.display='inline-block';
    }
    function showFront(){
      if (card3d) card3d.classList.remove('is-back');
      if(!supports3D){ document.body.classList.remove('back-visible'); }
      if (flipToFront) flipToFront.style.display='none';
    }

    if (flipToBack){
      flipToBack.addEventListener('click', ()=>{
        const nomeInput   = document.getElementById('nome');
        const codigoInput = document.getElementById('codigo');
        if (nomeInput)   nomeInput.value   = currentData.name||'';
        if (codigoInput) codigoInput.value = currentData.code||'';
        showBack(); startQR();
      });
    }
    if (flipToFront){
      flipToFront.addEventListener('click', ()=>{ showFront(); stopQR(); });
    }

    // Travar o campo "evento" (somente leitura real)
    const eventoInput = document.getElementById('evento');
    ['keydown','keypress','keyup','paste','drop','input','focus'].forEach(evt=>{
      if (!eventoInput) return;
      eventoInput.addEventListener(evt,e=>{
        if(evt!=='focus') e.preventDefault();
        if(evt==='focus') eventoInput.blur();
        return false;
      },true);
    });

    // Status online/offline
    setStatusOfflineUI();
    window.addEventListener('online', ()=>{ setStatusOfflineUI(); tentarEnviarFila(); });
    window.addEventListener('offline', setStatusOfflineUI);

    // Submit do formulário (verso)
    const form = document.getElementById('form');
    if (form){
      form.addEventListener('submit', async (e)=>{
        e.preventDefault();

        const nomeInput   = document.getElementById('nome');
        const codigoInput = document.getElementById('codigo');
        const eventoInput = document.getElementById('evento');
        const bip         = document.getElementById('bip');

        if(!eventoValido || !eventoInput || !eventoInput.value.trim()){
          mostrarMensagem("Leia o QR do evento para prosseguir.", true);
          return;
        }

        const registro={
          nome:   (nomeInput?.value || '').trim(),
          codigo: (codigoInput?.value || '').trim(),
          evento: (eventoInput?.value || '').trim(),
          horario: new Date().toLocaleString('pt-BR')
        };

        if(navigator.onLine){
          try{
            await enviarRegistro(registro);
            mostrarMensagem("Presença registrada com sucesso!", false);
            if (bip) bip.play();
          }catch(e){
            salvaOffline(registro);
            mostrarMensagem("Sem conexão estável. Registro salvo e será enviado automaticamente.", true);
          }
        }else{
          salvaOffline(registro);
          mostrarMensagem("Você está offline. Registro salvo e será enviado quando a internet voltar.", true);
        }

        if (eventoInput) eventoInput.value="";
        eventoValido=false;
      });
    }

    // SW (para offline)
    if('serviceWorker' in navigator){
      window.addEventListener('load', ()=> navigator.serviceWorker.register('./sw.js').catch(()=>{}));
    }

    // Tenta sincronizar ao abrir
    tentarEnviarFila();
  })();

  // Exponha downloads se os botões usarem onclick no HTML
  // (já fizemos: window.downloadCard = downloadCard)

})();
