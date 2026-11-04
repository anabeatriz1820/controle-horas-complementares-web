import { createClient } from "@supabase/supabase-js";

function limparVariavel(valor) {
  return (valor ?? "")
    .trim()
    .replace(/[^\x20-\x7E]/g, "");
}

const supabaseUrl = limparVariavel(
  import.meta.env.VITE_SUPABASE_URL
).replace(/\/$/, "");

const supabasePublishableKey = limparVariavel(
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "As variaveis de ambiente do Supabase nao foram configuradas."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);
