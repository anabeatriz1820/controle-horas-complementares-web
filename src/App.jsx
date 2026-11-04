import React, { useState } from "react";

function App() {
  const [tela, setTela] = useState("inicio");

  if (tela === "login") {
    return (
      <main className="pagina">
        <section className="cartao cartao-login">
          <button
            type="button"
            className="botao-voltar"
            onClick={() => setTela("inicio")}
          >
            Voltar
          </button>

          <span className="etiqueta">FCAP/UPE</span>
          <h1 className="titulo-login">Acessar o sistema</h1>
          <p className="texto-login">
            Informe o e-mail e a senha cadastrados para continuar.
          </p>

          <form className="formulario" onSubmit={(evento) => evento.preventDefault()}>
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="seu.email@upe.br"
              autoComplete="email"
              required
            />

            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              name="senha"
              type="password"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              required
            />

            <button type="submit" className="botao-principal">
              Entrar
            </button>
          </form>

          <p className="aviso">
            O login será conectado ao Supabase na próxima etapa.
          </p>
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
