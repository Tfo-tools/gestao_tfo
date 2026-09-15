"use client";

import { useEffect, useRef, useState } from "react";
import { criarMeioPagamento, type MeioPagamento } from "./meios-pagamento-actions";

type Pessoa = { id: string; nome: string };

function tituloMeio(m: MeioPagamento, pessoas: Pessoa[]): string {
  const titular = m.titular_tipo === "empresa" ? "Empresa" : (pessoas.find((p) => p.id === m.titular_pessoa_id)?.nome ?? "—");
  return m.bandeira ? `${m.banco} — ${titular} · ${m.bandeira}` : `${m.banco} — ${titular}`;
}

/** Digita, filtra os bancos/cartões já cadastrados; se não achar, cadastra um novo sem sair do
 * formulário — o cadastro fica disponível pra qualquer lançamento futuro, não só esse. */
export function SeletorMeioPagamento({
  tipo,
  meiosIniciais,
  pessoas,
  bancoAtual,
  onSelecionar,
}: {
  tipo: "conta" | "cartao";
  meiosIniciais: MeioPagamento[];
  pessoas: Pessoa[];
  bancoAtual?: string;
  onSelecionar: (dados: {
    banco: string;
    bandeira?: string;
    titular: string;
    meio_pagamento_id: string;
    dia_vencimento?: number | null;
    dias_fechamento_antes?: number | null;
  }) => void;
}) {
  const [meios, setMeios] = useState(meiosIniciais.filter((m) => m.tipo === tipo));
  const [busca, setBusca] = useState(bancoAtual ?? "");
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  // Conta só existe pra empresa nesse sistema (conta pessoal não é rastreada aqui) — só cartão
  // pode ser de sócia, então só ali faz sentido perguntar de quem é.
  const titularTravadoEmpresa = tipo === "conta";
  const [novoTitularTipo, setNovoTitularTipo] = useState<"pessoa" | "empresa">("empresa");
  const [novoPessoaId, setNovoPessoaId] = useState("");
  const [novaBandeira, setNovaBandeira] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAberto(false);
        setCriando(false);
      }
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  const filtrados = meios.filter((m) => m.banco.toLowerCase().includes(busca.toLowerCase()));

  function selecionar(m: MeioPagamento) {
    const titular = m.titular_tipo === "empresa" ? "Empresa" : (pessoas.find((p) => p.id === m.titular_pessoa_id)?.nome ?? "—");
    setBusca(m.banco);
    setAberto(false);
    onSelecionar({
      banco: m.banco,
      bandeira: m.bandeira ?? undefined,
      titular,
      meio_pagamento_id: m.id,
      dia_vencimento: m.dia_vencimento ?? null,
      dias_fechamento_antes: m.dias_fechamento_antes ?? null,
    });
  }

  async function salvarNovo() {
    setErro(null);
    if (!busca.trim()) {
      setErro("Digite o nome do banco/cartão.");
      return;
    }
    setSalvando(true);
    const titularTipo = titularTravadoEmpresa ? "empresa" : novoTitularTipo;
    const resultado = await criarMeioPagamento({
      banco: busca.trim(),
      tipo,
      titular_tipo: titularTipo,
      titular_pessoa_id: titularTipo === "pessoa" ? novoPessoaId || null : null,
      bandeira: novaBandeira || null,
    });
    setSalvando(false);
    if (resultado.error || !resultado.meio) {
      setErro(resultado.error ?? "Erro ao salvar.");
      return;
    }
    setMeios((prev) => [...prev, resultado.meio!]);
    selecionar(resultado.meio);
    setCriando(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="mb-1 block text-[10.5px] text-text-faint">{tipo === "cartao" ? "Banco do cartão" : "Banco"}</label>
      <input
        type="text"
        value={busca}
        onChange={(e) => {
          setBusca(e.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        placeholder="Digite pra buscar ou cadastrar"
        className="input w-full"
      />

      {aberto && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
          {!criando ? (
            <>
              {filtrados.length === 0 && <p className="px-3 py-2 text-[11.5px] text-text-faint">Nenhum cadastrado ainda.</p>}
              {filtrados.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selecionar(m)}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-bg"
                >
                  {tituloMeio(m, pessoas)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCriando(true)}
                className="block w-full border-t border-border-soft px-3 py-2 text-left text-[12px] font-medium text-primary-deep hover:bg-bg"
              >
                + Cadastrar {busca.trim() ? `"${busca.trim()}"` : "novo"}
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              <div>
                <label className="mb-1 block text-[10px] text-text-faint">Banco</label>
                <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} className="input w-full" />
              </div>
              {!titularTravadoEmpresa && (
                <div>
                  <label className="mb-1 block text-[10px] text-text-faint">De quem é</label>
                  <div className="flex gap-1 rounded-lg bg-bg p-1">
                    <button
                      type="button"
                      onClick={() => setNovoTitularTipo("empresa")}
                      className={`flex-1 rounded-md py-1 text-[11px] font-medium ${novoTitularTipo === "empresa" ? "bg-surface shadow-sm" : "text-text-muted"}`}
                    >
                      Empresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setNovoTitularTipo("pessoa")}
                      className={`flex-1 rounded-md py-1 text-[11px] font-medium ${novoTitularTipo === "pessoa" ? "bg-surface shadow-sm" : "text-text-muted"}`}
                    >
                      Sócia
                    </button>
                  </div>
                </div>
              )}
              {!titularTravadoEmpresa && novoTitularTipo === "pessoa" && (
                <select value={novoPessoaId} onChange={(e) => setNovoPessoaId(e.target.value)} className="input w-full">
                  <option value="">Selecione…</option>
                  {pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}
              {tipo === "cartao" && (
                <div>
                  <label className="mb-1 block text-[10px] text-text-faint">Bandeira</label>
                  <input type="text" value={novaBandeira} onChange={(e) => setNovaBandeira(e.target.value)} placeholder="Ex: Visa" className="input w-full" />
                </div>
              )}
              {erro && <p className="text-[11px] text-danger">{erro}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={salvando}
                  onClick={salvarNovo}
                  className="rounded-lg bg-wine-deep px-3 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
                >
                  {salvando ? "…" : "Salvar e usar"}
                </button>
                <button type="button" onClick={() => setCriando(false)} className="text-[11.5px] text-text-muted">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
