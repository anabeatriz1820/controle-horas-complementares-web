import React, { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

function App() {
  const [tela, setTela] = useState("inicio");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    async function carregarSessao() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        await carregarPerfil(data.session.user);
      }
    }

    carregarSessao();

    const { data: listener } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (!sessao?.user) {
        setUsuario(null);
        setPerfil(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function carregarPerfil(usuarioAutenticado) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("nome, email, perfil, matricula, validado_siga")
      .eq("id", usuarioAutenticado.id)
      .single();

    if (error) {
      setMensagem("Conta autenticada, mas o perfil não foi localizado.");
      return;
    }

    setUsuario(usuarioAutenticado);
    setPerfil(data);
    setTela("painel");
  }

  async function entrar(evento) {
    evento.preventDefault();
    setMensagem("");
    setCarregando(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setMensagem(`Erro do Supabase: ${error.message}${error.code ? ` (${error.code})` : ""}`);
      setCarregando(false);
      return;
    }

    await carregarPerfil(data.user);
    setCarregando(false);
  }

  async function sair() {
    await supabase.auth.signOut();
    setEmail("");
    setSenha("");
    setMensagem("");
    setTela("inicio");
  }

  if (tela === "painel" && usuario && perfil) {
    return (
      <main className="pagina">
        <section className="cartao cartao-login">
          <span className="etiqueta">FCAP/UPE</span>
          <h1 className="titulo-login">Bem-vindo ao sistema</h1>
          <p className="texto-login">
            <strong>{perfil.nome}</strong><br />
            Perfil: {perfil.perfil}
          </p>
          <p className="aviso">
            Login realizado com sucesso. O painel específico de cada perfil será
            criado na próxima etapa.
          </p>
          <button type="button" className="botao-principal" onClick={sair}>
            Sair
          </button>
        </section>
      </main>
    );
  }

  if (tela === "login") {
    return (
      <main className="pagina">
        <section className="cartao cartao-login">
          <button
            type="button"
            className="botao-voltar"
            onClick={() => {
              setMensagem("");
              setTela("inicio");
            }}
          >
            Voltar
          </button>

          <span className="etiqueta">FCAP/UPE</span>
          <h1 className="titulo-login">Acessar o sistema</h1>
          <p className="texto-login">
            Informe o e-mail e a senha cadastrados para continuar.
          </p>

          <form className="formulario" onSubmit={entrar}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu.email@upe.br"
              autoComplete="email"
              value={email}
              onChange={(evento) => setEmail(evento.target.value)}
              required
            />

            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              name="senha"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              required
            />

            {mensagem && <p className="aviso">{mensagem}</p>}

            <button type="submit" className="botao-principal" disabled={carregando}>
              {carregando ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="pagina">
      <section className="cartao">
        <span className="etiqueta">FCAP/UPE</span>
        <h1>Atividades Complementares</h1>
        <p>
          Sistema para envio, acompanhamento e avaliação das atividades
          complementares.
        </p>
        <button
          type="button"
          className="botao-principal"
          onClick={() => setTela("login")}
        >
          Acessar o sistema
        </button>
      </section>
    </main>
  );
}

export default App;
