/* =========================================================
   config.js — os dados de conexão com o SEU projeto Supabase.

   Onde achar: painel do Supabase → botão "Connect" no topo
   (ou Settings → API Keys).

   ✅ Use a "Publishable key" (começa com sb_publishable_).
      Ela FOI FEITA para ficar no navegador e no GitHub.
      Quem protege seus dados é o RLS, não o segredo da chave.

   ❌ NUNCA coloque aqui a "Secret key" (sb_secret_) nem a
      antiga "service_role". Elas ignoram o RLS e dão acesso
      total ao banco.
   ========================================================= */

const SUPABASE_URL = 'https://ryuvvkoldjvvmdtylcqj.supabase.co';
const SUPABASE_CHAVE_PUBLICA = 'sb_publishable_4wIktdNbn5R6wMzFncaH6g_oZmD909l';
