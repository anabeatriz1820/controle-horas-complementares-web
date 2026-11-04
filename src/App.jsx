import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase.js";

const novaSolicitacao = { atividadeId: "", titulo: "", horas: "", comprovante: null };
const novaAvaliacao = { resultado: "Aprovado", horas: "", justificativa: "" };

function App() {
  const [tela, setTela] = useState("inicio");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [usuario, setUsuario] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [atividades, setAtividades] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [formulario, setFormulario] = useState(novaSolicitacao);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [selecionada, setSelecionada] = useState(null);
  const [avaliacao, setAvaliacao] = useState(novaAvaliacao);
  const [parecer, setParecer] = useState("");
  const [observacaoSiga, setObservacaoSiga] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) carregarUsuario(data.session.user);
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      if (!sessao?.user) {
        setUsuario(null);
        setPerfil(null);
        setTela("inicio");
      }
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function carregarUsuario(authUser) {
    setMensagem("");
    const { data, error } = await supabase
      .from("usuarios")
      .select("nome,email,perfil,matricula,curso,validado_siga")
      .eq("id", authUser.id)
      .single();

    if (error) {
      setMensagem(`Perfil não localizado: ${error.message}`);
      return;
    }

    setUsuario(authUser);
    setPerfil(data);
    setTela("painel");

    if (data.perfil === "Discente") {
      await Promise.all([carregarAtividades(), carregarSolicitacoesDiscente(authUser.id)]);
    } else {
      await carregarSolicitacoesEquipe();
    }
  }

  async function carregarAtividades() {
    const { data, error } = await supabase
      .from("atividades")
      .select("id,nome,eixo,limite_horas")
      .eq("ativa", true)
      .order("nome");

    if (error) setMensagem(`Não foi possível carregar as atividades: ${error.message}`);
    else setAtividades(data ?? []);
  }

  async function carregarSolicitacoesDiscente(id = usuario?.id) {
    if (!id) return;

    const { data, error } = await supabase
      .from("solicitacoes")
      .select("id,titulo,horas_solicitadas,horas_aprovadas,resultado_avaliacao,situacao_processo,justificativa,registrado_siga,data_solicitacao,parecer_docente,atividades(nome,eixo)")
      .eq("usuario_id", id)
      .order("data_solicitacao", { ascending: false });

    if (error) setMensagem(`Não foi possível carregar as solicitações: ${error.message}`);
    else setSolicitacoes(data ?? []);
  }

  async function carregarSolicitacoesEquipe() {
    const { data, error } = await supabase
      .from("solicitacoes")
      .select("id,usuario_id,titulo,horas_solicitadas,horas_aprovadas,comprovante_caminho,comprovante_nome,resultado_avaliacao,situacao_processo,justificativa,registrado_siga,data_solicitacao,parecer_docente,parecer_solicitado,atividades(nome,eixo)")
      .order("data_solicitacao", { ascending: false });

    if (error) {
      setMensagem(`Não foi possível carregar as solicitações: ${error.message}`);
      return;
    }

    const ids = [...new Set((data ?? []).map((item) => item.usuario_id))];
    let alunos = [];

    if (ids.length > 0) {
      const resposta = await supabase
        .from("usuarios")
        .select("id,nome,matricula,curso")
        .in("id", ids);
      alunos = resposta.data ?? [];
    }

    const mapa = Object.fromEntries(alunos.map((aluno) => [aluno.id, aluno]));
    setSolicitacoes((data ?? []).map((item) => ({ ...item, aluno: mapa[item.usuario_id] })));
  }

  async function entrar(evento) {
    evento.preventDefault();
    setCarregando(true);
    setMensagem("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) setMensagem(`Não foi possível entrar: ${error.message}`);
    else await carregarUsuario(data.user);

    setCarregando(false);
  }

  async function sair() {
    await supabase.auth.signOut();
    setEmail("");
    setSenha("");
    setMensagem("");
    setSolicitacoes([]);
  }

  async function enviarSolicitacao(evento) {
    evento.preventDefault();
    setMensagem("");

    const atividade = atividades.find((item) => item.id === formulario.atividadeId);
    const horas = Number(formulario.horas);

    if (!formulario.comprovante || formulario.comprovante.type !== "application/pdf") {
      setMensagem("Selecione um comprovante em PDF.");
      return;
    }
    if (formulario.comprovante.size > 10 * 1024 * 1024) {
      setMensagem("O PDF deve ter no máximo 10 MB.");
      return;
    }
    if (!atividade || horas < 1 || horas > atividade.limite_horas) {
      setMensagem(`Informe entre 1 e ${atividade?.limite_horas ?? 1} horas.`);
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
    } else {
      setFormulario(novaSolicitacao);
      setMostrarFormulario(false);
      setMensagem("Solicitação enviada com sucesso.");
      await carregarSolicitacoesDiscente(usuario.id);
    }

    setCarregando(false);
  }

  async function visualizarPDF(item) {
    const { data, error } = await supabase.storage
      .from("comprovantes")
      .createSignedUrl(item.comprovante_caminho, 300);

    if (error) setMensagem(`Não foi possível abrir o PDF: ${error.message}`);
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function abrirAvaliacao(item) {
    setSelecionada(item);
    setMensagem("");
    setAvaliacao({
      resultado: "Aprovado",
      horas: String(item.horas_solicitadas),
      justificativa: "",
    });
  }

  async function solicitarParecer(item) {
    setCarregando(true);
    setMensagem("");

    const { error } = await supabase.rpc("solicitar_parecer_docente", {
      p_solicitacao_id: item.id,
    });

    if (error) setMensagem(`Não foi possível solicitar o parecer: ${error.message}`);
    else {
      setMensagem("Parecer docente solicitado.");
      await carregarSolicitacoesEquipe();
    }

    setCarregando(false);
  }

  async function salvarAvaliacao(evento) {
    evento.preventDefault();
    if (!selecionada) return;

    const horas = Number(avaliacao.horas);
    const parcial = avaliacao.resultado === "Aprovado parcialmente";
    const reprovado = avaliacao.resultado === "Reprovado";

    if (parcial && (horas <= 0 || horas >= selecionada.horas_solicitadas)) {
      setMensagem("Na aprovação parcial, as horas devem ser maiores que zero e menores que as solicitadas.");
      return;
    }
    if ((parcial || reprovado) && !avaliacao.justificativa.trim()) {
      setMensagem("A justificativa é obrigatória para aprovação parcial ou reprovação.");
      return;
    }

    setCarregando(true);
    const horasFinais = reprovado
      ? 0
      : avaliacao.resultado === "Aprovado"
        ? selecionada.horas_solicitadas
        : horas;

    const { error } = await supabase.rpc("avaliar_solicitacao", {
      p_solicitacao_id: selecionada.id,
      p_resultado: avaliacao.resultado,
      p_horas_aprovadas: horasFinais,
      p_justificativa: avaliacao.justificativa.trim(),
    });

    if (error) setMensagem(`Não foi possível salvar a avaliação: ${error.message}`);
    else {
      setMensagem("Avaliação registrada com sucesso.");
      setSelecionada(null);
      setAvaliacao(novaAvaliacao);
      await carregarSolicitacoesEquipe();
    }

    setCarregando(false);
  }

  async function salvarParecer(evento) {
    evento.preventDefault();
    if (!selecionada || !parecer.trim()) return;

    setCarregando(true);
    const { error } = await supabase.rpc("registrar_parecer_docente", {
      p_solicitacao_id: selecionada.id,
      p_parecer: parecer.trim(),
    });

    if (error) setMensagem(`Não foi possível registrar o parecer: ${error.message}`);
    else {
      setMensagem("Parecer acadêmico registrado com sucesso.");
      setSelecionada(null);
      setParecer("");
      await carregarSolicitacoesEquipe();
    }

    setCarregando(false);
  }

  async function confirmarSiga(evento) {
    evento.preventDefault();
    if (!selecionada) return;

    setCarregando(true);
    const { error } = await supabase.rpc("confirmar_registro_siga", {
      p_solicitacao_id: selecionada.id,
      p_observacao: observacaoSiga.trim() || null,
    });

    if (error) setMensagem(`Não foi possível confirmar o SIG@: ${error.message}`);
    else {
      setMensagem("Registro no SIG@ confirmado. Processo concluído.");
      setSelecionada(null);
      setObservacaoSiga("");
      await carregarSolicitacoesEquipe();
    }

    setCarregando(false);
  }

  const totais = useMemo(() => ({
    solicitadas: solicitacoes.reduce((soma, item) => soma + Number(item.horas_solicitadas || 0), 0),
    aprovadas: solicitacoes.reduce((soma, item) => soma + Number(item.horas_aprovadas || 0), 0),
    pendentes: solicitacoes.filter((item) => item.situacao_processo === "Pendente de análise").length,
  }), [solicitacoes]);

  if (tela === "painel" && perfil?.perfil === "Discente") {
    return <PainelDiscente
      perfil={perfil}
      sair={sair}
      totais={totais}
      mensagem={mensagem}
      mostrarFormulario={mostrarFormulario}
      setMostrarFormulario={setMostrarFormulario}
      setMensagem={setMensagem}
      formulario={formulario}
      setFormulario={setFormulario}
      atividades={atividades}
      enviarSolicitacao={enviarSolicitacao}
      carregando={carregando}
      solicitacoes={solicitacoes}
    />;
  }

  if (tela === "painel" && perfil?.perfil === "Técnico Administrativo") {
    return <PainelTecnico
      perfil={perfil}
      sair={sair}
      mensagem={mensagem}
      solicitacoes={solicitacoes}
      visualizarPDF={visualizarPDF}
      abrirAvaliacao={abrirAvaliacao}
      solicitarParecer={solicitarParecer}
      selecionada={selecionada}
      setSelecionada={setSelecionada}
      avaliacao={avaliacao}
      setAvaliacao={setAvaliacao}
      salvarAvaliacao={salvarAvaliacao}
      observacaoSiga={observacaoSiga}
      setObservacaoSiga={setObservacaoSiga}
      confirmarSiga={confirmarSiga}
      carregando={carregando}
    />;
  }

  if (tela === "painel" && perfil?.perfil === "Docente") {
    return <PainelDocente
      perfil={perfil}
      sair={sair}
      mensagem={mensagem}
      solicitacoes={solicitacoes}
      visualizarPDF={visualizarPDF}
      selecionada={selecionada}
      setSelecionada={setSelecionada}
      parecer={parecer}
      setParecer={setParecer}
      salvarParecer={salvarParecer}
      carregando={carregando}
    />;
  }

  if (tela === "login") {
    return <main className="pagina">
      <section className="cartao cartao-login">
        <button type="button" className="botao-voltar" onClick={() => { setMensagem(""); setTela("inicio"); }}>Voltar</button>
        <span className="etiqueta">FCAP/UPE</span>
        <h1 className="titulo-login">Acessar o sistema</h1>
        <p>Informe o e-mail e a senha cadastrados.</p>
        <form className="formulario" onSubmit={entrar}>
          <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Senha<input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required /></label>
          {mensagem && <p className="aviso">{mensagem}</p>}
          <button className="botao-principal" disabled={carregando}>{carregando ? "Entrando..." : "Entrar"}</button>
        </form>
      </section>
    </main>;
  }

  return <main className="pagina">
    <section className="cartao">
      <span className="etiqueta">FCAP/UPE</span>
      <h1>Atividades Complementares</h1>
      <p>Sistema para envio, acompanhamento e avaliação das atividades complementares.</p>
      <button type="button" className="botao-principal" onClick={() => setTela("login")}>Acessar o sistema</button>
    </section>
  </main>;
}

function Cabecalho({ perfil, sair }) {
  return <header className="barra-superior">
    <div><strong>FCAP/UPE</strong><span>Atividades Complementares</span></div>
    <div className="usuario-menu"><span>{perfil.nome}</span><button type="button" onClick={sair}>Sair</button></div>
  </header>;
}

function PainelDiscente(props) {
  return <main className="aplicacao">
    <Cabecalho perfil={props.perfil} sair={props.sair} />
    <section className="conteudo">
      <div className="cabecalho-painel">
        <div>
          <p className="rotulo">PAINEL DO DISCENTE</p>
          <h1 className="titulo-painel">Olá, {props.perfil.nome}</h1>
          <p>Matrícula: {props.perfil.matricula || "Não informada"} · {props.perfil.curso || "Curso não informado"}</p>
        </div>
        <button className="botao-principal" type="button" onClick={() => { props.setMostrarFormulario(!props.mostrarFormulario); props.setMensagem(""); }}>
          {props.mostrarFormulario ? "Cancelar" : "+ Nova solicitação"}
        </button>
      </div>

      <div className="metricas">
        <article><span>Horas solicitadas</span><strong>{props.totais.solicitadas}h</strong></article>
        <article><span>Horas aprovadas</span><strong>{props.totais.aprovadas}h</strong></article>
        <article><span>Pendentes</span><strong>{props.totais.pendentes}</strong></article>
      </div>

      {props.mensagem && <div className="mensagem" role="status">{props.mensagem}</div>}

      {props.mostrarFormulario && <section className="painel-formulario">
        <h2>Nova solicitação</h2>
        <form className="formulario grade-formulario" onSubmit={props.enviarSolicitacao}>
          <label>Atividade
            <select value={props.formulario.atividadeId} onChange={(e) => props.setFormulario({ ...props.formulario, atividadeId: e.target.value, horas: "" })} required>
              <option value="">Selecione</option>
              {props.atividades.map((item) => <option key={item.id} value={item.id}>{item.nome} · {item.eixo} · até {item.limite_horas}h</option>)}
            </select>
          </label>
          <label>Título<input value={props.formulario.titulo} onChange={(e) => props.setFormulario({ ...props.formulario, titulo: e.target.value })} required /></label>
          <label>Horas solicitadas<input type="number" min="1" value={props.formulario.horas} onChange={(e) => props.setFormulario({ ...props.formulario, horas: e.target.value })} required /></label>
          <label>Comprovante em PDF<input type="file" accept="application/pdf" onChange={(e) => props.setFormulario({ ...props.formulario, comprovante: e.target.files?.[0] ?? null })} required /></label>
          <button className="botao-principal" disabled={props.carregando}>{props.carregando ? "Enviando..." : "Enviar solicitação"}</button>
        </form>
      </section>}

      <section className="lista">
        <h2>Minhas solicitações</h2>
        {props.solicitacoes.length === 0 ? <p className="vazio">Nenhuma solicitação enviada.</p> : props.solicitacoes.map((item) => <article className="solicitacao" key={item.id}>
          <div><span className="status">{item.resultado_avaliacao || item.situacao_processo}</span><h3>{item.titulo}</h3><p>{item.atividades?.nome} · {new Date(item.data_solicitacao).toLocaleDateString("pt-BR")}</p></div>
          <div className="horas"><span>Solicitadas: {item.horas_solicitadas}h</span><strong>Aprovadas: {item.horas_aprovadas}h</strong></div>
          {item.justificativa && <p className="texto-largo"><strong>Justificativa:</strong> {item.justificativa}</p>}
          {item.parecer_docente && <p className="texto-largo"><strong>Parecer docente:</strong> {item.parecer_docente}</p>}
          <p className="texto-largo">SIG@: {item.registrado_siga ? "Registrado" : "Aguardando"}</p>
        </article>)}
      </section>
    </section>
  </main>;
}

function PainelTecnico(props) {
  const pendentes = props.solicitacoes.filter((item) => item.situacao_processo === "Pendente de análise");
  const aguardandoSiga = props.solicitacoes.filter((item) => item.situacao_processo === "Aguardando lançamento no SIG@" && !item.registrado_siga);

  return <main className="aplicacao">
    <Cabecalho perfil={props.perfil} sair={props.sair} />
    <section className="conteudo">
      <p className="rotulo">PAINEL DO TÉCNICO ADMINISTRATIVO</p>
      <h1 className="titulo-painel">Análise e registro das atividades</h1>
      <p>Valide documentos, registre o resultado e confirme o lançamento no SIG@.</p>
      {props.mensagem && <div className="mensagem" role="status">{props.mensagem}</div>}

      <section className="lista">
        <h2>Pendentes de análise ({pendentes.length})</h2>
        {pendentes.length === 0 ? <p className="vazio">Nenhuma solicitação pendente.</p> : pendentes.map((item) => <CartaoEquipe key={item.id} item={item}>
          <button className="botao-secundario" type="button" onClick={() => props.visualizarPDF(item)}>Visualizar PDF</button>
          <button className="botao-secundario" type="button" disabled={item.parecer_solicitado || props.carregando} onClick={() => props.solicitarParecer(item)}>{item.parecer_solicitado ? "Parecer solicitado" : "Solicitar parecer"}</button>
          <button className="botao-principal" type="button" onClick={() => props.abrirAvaliacao(item)}>Avaliar</button>
        </CartaoEquipe>)}
      </section>

      <section className="lista">
        <h2>Aguardando lançamento no SIG@ ({aguardandoSiga.length})</h2>
        {aguardandoSiga.length === 0 ? <p className="vazio">Nenhum processo aguardando lançamento.</p> : aguardandoSiga.map((item) => <CartaoEquipe key={item.id} item={item}>
          <button className="botao-secundario" type="button" onClick={() => props.visualizarPDF(item)}>Visualizar PDF</button>
          <button className="botao-principal" type="button" onClick={() => { props.setSelecionada({ ...item, modo: "siga" }); props.setObservacaoSiga(""); }}>Confirmar SIG@</button>
        </CartaoEquipe>)}
      </section>

      {props.selecionada && props.selecionada.modo !== "siga" && <Modal fechar={() => props.setSelecionada(null)} titulo="Avaliar solicitação">
        <p><strong>{props.selecionada.aluno?.nome}</strong> · {props.selecionada.titulo}</p>
        {props.selecionada.parecer_docente && <div className="destaque"><strong>Parecer docente:</strong><p>{props.selecionada.parecer_docente}</p></div>}
        <form className="formulario" onSubmit={props.salvarAvaliacao}>
          <label>Resultado
            <select value={props.avaliacao.resultado} onChange={(e) => props.setAvaliacao({ ...props.avaliacao, resultado: e.target.value, horas: e.target.value === "Aprovado" ? String(props.selecionada.horas_solicitadas) : e.target.value === "Reprovado" ? "0" : "" })}>
              <option>Aprovado</option><option>Aprovado parcialmente</option><option>Reprovado</option>
            </select>
          </label>
          <label>Horas aprovadas<input type="number" min="0" max={props.selecionada.horas_solicitadas} disabled={props.avaliacao.resultado !== "Aprovado parcialmente"} value={props.avaliacao.horas} onChange={(e) => props.setAvaliacao({ ...props.avaliacao, horas: e.target.value })} /></label>
          <label>Justificativa<textarea rows="4" value={props.avaliacao.justificativa} onChange={(e) => props.setAvaliacao({ ...props.avaliacao, justificativa: e.target.value })} placeholder="Obrigatória para aprovação parcial ou reprovação" /></label>
          <button className="botao-secundario" type="button" onClick={() => props.visualizarPDF(props.selecionada)}>Visualizar comprovante</button>
          <button className="botao-principal" disabled={props.carregando}>{props.carregando ? "Salvando..." : "Salvar avaliação"}</button>
        </form>
      </Modal>}

      {props.selecionada?.modo === "siga" && <Modal fechar={() => props.setSelecionada(null)} titulo="Confirmar registro no SIG@">
        <p><strong>{props.selecionada.aluno?.nome}</strong> · {props.selecionada.horas_aprovadas}h aprovadas</p>
        <form className="formulario" onSubmit={props.confirmarSiga}>
          <label>Observação do técnico<textarea rows="4" value={props.observacaoSiga} onChange={(e) => props.setObservacaoSiga(e.target.value)} placeholder="Opcional" /></label>
          <button className="botao-principal" disabled={props.carregando}>{props.carregando ? "Confirmando..." : "Confirmar lançamento"}</button>
        </form>
      </Modal>}
    </section>
  </main>;
}

function PainelDocente(props) {
  const paraParecer = props.solicitacoes.filter((item) => item.parecer_solicitado || item.parecer_docente);

  return <main className="aplicacao">
    <Cabecalho perfil={props.perfil} sair={props.sair} />
    <section className="conteudo">
      <p className="rotulo">PAINEL DO DOCENTE</p>
      <h1 className="titulo-painel">Pareceres acadêmicos</h1>
      <p>Consulte o comprovante e registre um parecer quando solicitado pela secretaria.</p>
      {props.mensagem && <div className="mensagem" role="status">{props.mensagem}</div>}
      <section className="lista">
        {paraParecer.length === 0 ? <p className="vazio">Nenhum parecer solicitado.</p> : paraParecer.map((item) => <CartaoEquipe key={item.id} item={item}>
          <button className="botao-secundario" type="button" onClick={() => props.visualizarPDF(item)}>Visualizar PDF</button>
          <button className="botao-principal" type="button" onClick={() => { props.setSelecionada(item); props.setParecer(item.parecer_docente || ""); }}>{item.parecer_docente ? "Editar parecer" : "Registrar parecer"}</button>
        </CartaoEquipe>)}
      </section>

      {props.selecionada && <Modal fechar={() => props.setSelecionada(null)} titulo="Parecer acadêmico">
        <p><strong>{props.selecionada.aluno?.nome}</strong> · {props.selecionada.titulo}</p>
        <form className="formulario" onSubmit={props.salvarParecer}>
          <label>Parecer<textarea rows="7" value={props.parecer} onChange={(e) => props.setParecer(e.target.value)} required placeholder="Registre a análise acadêmica da atividade" /></label>
          <button className="botao-secundario" type="button" onClick={() => props.visualizarPDF(props.selecionada)}>Visualizar comprovante</button>
          <button className="botao-principal" disabled={props.carregando}>{props.carregando ? "Salvando..." : "Salvar parecer"}</button>
        </form>
      </Modal>}
    </section>
  </main>;
}

function CartaoEquipe({ item, children }) {
  return <article className="solicitacao">
    <div>
      <span className="status">{item.resultado_avaliacao || item.situacao_processo}</span>
      <h3>{item.titulo}</h3>
      <p>{item.aluno?.nome || "Discente"} · Matrícula {item.aluno?.matricula || "não informada"}</p>
      <p>{item.atividades?.nome} · {item.atividades?.eixo} · {item.horas_solicitadas}h solicitadas</p>
      {item.parecer_docente && <p><strong>Parecer docente registrado</strong></p>}
    </div>
    <div className="acoes-equipe">{children}</div>
  </article>;
}

function Modal({ fechar, titulo, children }) {
  return <div className="modal-fundo" role="dialog" aria-modal="true" aria-label={titulo}>
    <section className="modal">
      <button className="fechar" type="button" onClick={fechar} aria-label="Fechar">×</button>
      <h2>{titulo}</h2>
      {children}
    </section>
  </div>;
}

export default App;
