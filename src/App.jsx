import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const estadoInicial = { atividadeId: "", titulo: "", horas: "", comprovante: null };

function App() {
  const [tela, setTela] = useState("inicio");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [atividades, setAtividades] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [formulario, setFormulario] = useState(estadoInicial);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  useEffect(() => {
    async function iniciar() {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) await carregarUsuario(data.session.user);
    }
    iniciar();
    const { data: listener } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (!sessao?.user) {
        setUsuario(null);
        setPerfil(null);
        setTela("inicio");
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function carregarUsuario(usuarioAutenticado) {
    const { data, error } = await supabase
      .from("usuarios")
      .select("nome, email, perfil, matricula, curso, validado_siga")
      .eq("id", usuarioAutenticado.id)
      .single();
    if (error) {
      setMensagem(`Perfil não localizado: ${error.message}`);
      return;
    }
    setUsuario(usuarioAutenticado);
    setPerfil(data);
    setTela("painel");
    await Promise.all([carregarAtividades(), carregarSolicitacoes(usuarioAutenticado.id)]);
  }

  async function carregarAtividades() {
    const { data, error } = await supabase
      .from("atividades")
      .select("id, nome, eixo, limite_horas")
      .eq("ativa", true)
      .order("nome");
    if (!error) setAtividades(data ?? []);
  }

  async function carregarSolicitacoes(usuarioId = usuario?.id) {
    if (!usuarioId) return;
    const { data, error } = await supabase
      .from("solicitacoes")
      .select("id, titulo, horas_solicitadas, horas_aprovadas, resultado_avaliacao, situacao_processo, justificativa, registrado_siga, data_solicitacao, atividades(nome, eixo)")
      .eq("usuario_id", usuarioId)
      .order("data_solicitacao", { ascending: false });
    if (!error) setSolicitacoes(data ?? []);
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
      setMensagem(`Não foi possível entrar: ${error.message}`);
      setCarregando(false);
      return;
    }
    await carregarUsuario(data.user);
    setCarregando(false);
  }

  async function enviarSolicitacao(evento) {
    evento.preventDefault();
    setMensagem("");
    const horas = Number(formulario.horas);
    const atividade = atividades.find((item) => item.id === formulario.atividadeId);

    if (!formulario.comprovante || formulario.comprovante.type !== "application/pdf") {
      setMensagem("Selecione um comprovante em PDF.");
      return;
    }
    if (formulario.comprovante.size > 10 * 1024 * 1024) {
      setMensagem("O comprovante deve ter no máximo 10 MB.");
      return;
    }
    if (!atividade || !horas || horas < 1 || horas > atividade.limite_horas) {
      setMensagem(`Informe uma carga horária entre 1 e ${atividade?.limite_horas ?? 1} horas.`);
      return;
    }

    setCarregando(true);
    const nomeSeguro = formulario.comprovante.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const caminho = `${usuario.id}/${Date.now()}-${nomeSeguro}`;

    const { error: erroArquivo } = await supabase.storage
      .from("comprovantes")
      .upload(caminho, formulario.comprovante, { contentType: "application/pdf" });

    if (erroArquivo) {
      setMensagem(`Não foi possível enviar o PDF: ${erroArquivo.message}`);
      setCarregando(false);
      return;
    }

    const { error: erroRegistro } = await supabase.from("solicitacoes").insert({
      usuario_id: usuario.id,
      atividade_id: formulario.atividadeId,
      titulo: formulario.titulo.trim(),
      horas_solicitadas: horas,
      comprovante_caminho: caminho,
      comprovante_nome: formulario.comprovante.name,
    });

    if (erroRegistro) {
      await supabase.storage.from("comprovantes").remove([caminho]);
      setMensagem(`Não foi possível registrar a solicitação: ${erroRegistro.message}`);
      setCarregando(false);
      return;
    }

    setFormulario(estadoInicial);
    setMostrarFormulario(false);
    setMensagem("Solicitação enviada com sucesso.");
    await carregarSolicitacoes(usuario.id);
    setCarregando(false);
  }

  async function sair() {
    await supabase.auth.signOut();
    setEmail("");
    setSenha("");
    setMensagem("");
  }

  const totais = useMemo(() => {
    const solicitadas = solicitacoes.reduce((soma, item) => soma + Number(item.horas_solicitadas || 0), 0);
    const aprovadas = solicitacoes.reduce((soma, item) => soma + Number(item.horas_aprovadas || 0), 0);
    return { solicitadas, aprovadas, pendentes: solicitacoes.filter((item) => item.situacao_processo === "Pendente de análise").length };
  }, [solicitacoes]);

  if (tela === "painel" && usuario && perfil) {
    return (
      <main className="aplicacao">
        <header className="barra-superior">
          <div><strong>FCAP/UPE</strong><span>Atividades Complementares</span></div>
          <div className="usuario-menu"><span>{perfil.nome}</span><button type="button" onClick={sair}>Sair</button></div>
        </header>

        <section className="conteudo">
          <div className="cabecalho-painel">
            <div>
              <p className="rotulo">PAINEL DO DISCENTE</p>
              <h1>Olá, {perfil.nome}</h1>
              <p>Matrícula: {perfil.matricula || "Não informada"} · {perfil.curso || "Curso não informado"}</p>
            </div>
            <button className="botao-principal" type="button" onClick={() => { setMostrarFormulario(!mostrarFormulario); setMensagem(""); }}>
              {mostrarFormulario ? "Cancelar" : "+ Nova solicitação"}
            </button>
          </div>

          <div className="metricas">
            <article><span>Horas solicitadas</span><strong>{totais.solicitadas}h</strong></article>
            <article><span>Horas aprovadas</span><strong>{totais.aprovadas}h</strong></article>
            <article><span>Pendentes</span><strong>{totais.pendentes}</strong></article>
          </div>

          {mensagem && <div className="mensagem" role="status">{mensagem}</div>}

          {mostrarFormulario && (
            <section className="painel-formulario">
              <h2>Nova solicitação</h2>
              <form className="formulario grade-formulario" onSubmit={enviarSolicitacao}>
                <label>Atividade
                  <select value={formulario.atividadeId} onChange={(e) => setFormulario({ ...formulario, atividadeId: e.target.value, horas: "" })} required>
                    <option value="">Selecione</option>
                    {atividades.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.eixo} · até {item.limite_horas}h</option>)}
                  </select>
                </label>
                <label>Título da atividade
                  <input value={formulario.titulo} onChange={(e) => setFormulario({ ...formulario, titulo: e.target.value })} placeholder="Ex.: Curso de Excel" required />
                </label>
                <label>Horas solicitadas
                  <input type="number" min="1" value={formulario.horas} onChange={(e) => setFormulario({ ...formulario, horas: e.target.value })} required />
                </label>
                <label>Comprovante em PDF
                  <input type="file" accept="application/pdf" onChange={(e) => setFormulario({ ...formulario, comprovante: e.target.files?.[0] ?? null })} required />
                </label>
                <button className="botao-principal" type="submit" disabled={carregando}>{carregando ? "Enviando..." : "Enviar solicitação"}</button>
              </form>
            </section>
          )}

          <section className="lista">
            <h2>Minhas solicitações</h2>
            {solicitacoes.length === 0 ? <p className="vazio">Nenhuma solicitação enviada.</p> : solicitacoes.map((item) => (
              <article className="solicitacao" key={item.id}>
                <div>
                  <span className={`status status-${(item.resultado_avaliacao || "pendente").toLowerCase().replaceAll(" ", "-")}`}>{item.resultado_avaliacao || item.situacao_processo}</span>
                  <h3>{item.titulo}</h3>
                  <p>{item.atividades?.nome} · {new Date(item.data_solicitacao).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="horas"><span>Solicitadas: {item.horas_solicitadas}h</span><strong>Aprovadas: {item.horas_aprovadas}h</strong></div>
                {item.justificativa && <p className="justificativa"><strong>Justificativa:</strong> {item.justificativa}</p>}
                <p className="siga">SIG@: {item.registrado_siga ? "Registrado" : "Aguardando"}</p>
              </article>
            ))}
          </section>
        </section>
      </main>
    );
  }

  if (tela === "login") {
    return (
      <main className="pagina"><section className="cartao cartao-login">
        <button type="button" className="botao-voltar" onClick={() => { setMensagem(""); setTela("inicio"); }}>Voltar</button>
        <span className="etiqueta">FCAP/UPE</span><h1 className="titulo-login">Acessar o sistema</h1>
        <p className="texto-login">Informe o e-mail e a senha cadastrados para continuar.</p>
        <form className="formulario" onSubmit={entrar}>
          <label htmlFor="email">E-mail</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="senha">Senha</label><input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          {mensagem && <p className="aviso">{mensagem}</p>}
          <button type="submit" className="botao-principal" disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
        </form>
      </section></main>
    );
  }

  return (
    <main className="pagina"><section className="cartao">
      <span className="etiqueta">FCAP/UPE</span><h1>Atividades Complementares</h1>
      <p>Sistema para envio, acompanhamento e avaliação das atividades complementares.</p>
      <button type="button" className="botao-principal" onClick={() => setTela("login")}>Acessar o sistema</button>
    </section></main>
  );
}

export default App;
