/* =========================================================
   sw.js — Service Worker: um script que o navegador roda "por
   trás" do app e que pode interceptar os pedidos de arquivos.

   Estratégia escolhida: "rede primeiro, cache como reserva".
   - Com internet: busca sempre a versão nova (você publica uma
     mudança e ela aparece na hora, sem dor de cabeça).
   - Sem internet: entrega a última cópia guardada, então o app
     ao menos abre em vez de mostrar a tela de erro do Safari.

   IMPORTANTE: só guardamos arquivos DO PRÓPRIO SITE (html, css,
   js, ícones). Pedidos ao Supabase passam direto: dados de
   gastos nunca ficam no cache.
   ========================================================= */

// Mude o número quando mudar a lista de arquivos abaixo
const NOME_CACHE = 'meus-gastos-v4';

const ARQUIVOS_DO_APP = [
  './',
  'index.html',
  'css/style.css',
  'js/config.js',
  'js/utils.js',
  'js/storage.js',
  'js/auth.js',
  'js/metas.js',
  'js/ia.js',
  'js/inicio.js',
  'js/relatorios.js',
  'js/categorias.js',
  'js/app.js',
  'manifest.webmanifest',
  'icones/icone-192.png',
  'icones/apple-touch-icon.png',
];

// 1) Instalação: guarda os arquivos do app
self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(NOME_CACHE).then((cache) => cache.addAll(ARQUIVOS_DO_APP))
  );
  self.skipWaiting(); // ativa a versão nova sem esperar fechar o app
});

// 2) Ativação: apaga caches de versões antigas
self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== NOME_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// 3) Cada pedido de arquivo passa por aqui
self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  const mesmoSite = new URL(pedido.url).origin === self.location.origin;

  // Só mexemos em leituras (GET) de arquivos do nosso site
  if (pedido.method !== 'GET' || !mesmoSite) return;

  evento.respondWith(
    fetch(pedido)
      .then((resposta) => {
        // Deu certo: atualiza a cópia no cache e entrega
        if (resposta.ok) {
          const copia = resposta.clone();
          caches.open(NOME_CACHE).then((cache) => cache.put(pedido, copia));
        }
        return resposta;
      })
      .catch(() => caches.match(pedido)) // sem internet: usa o cache
  );
});
