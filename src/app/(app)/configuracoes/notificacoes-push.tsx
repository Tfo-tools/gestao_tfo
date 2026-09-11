"use client";

import { useEffect, useState } from "react";
import { salvarInscricaoPush, removerInscricaoPush } from "./push-actions";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type Estado = "verificando" | "indisponivel" | "inativo" | "ativo" | "processando";

export function NotificacoesPush() {
  const [estado, setEstado] = useState<Estado>("verificando");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function verificar() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setEstado("indisponivel");
        return;
      }
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) {
        setEstado("indisponivel");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "inativo");
    }
    verificar();
  }, []);

  async function ativar() {
    setErro(null);
    setEstado("processando");
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setErro("Permissão de notificação negada.");
        setEstado("inativo");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setErro("Chave de notificação não configurada.");
        setEstado("inativo");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      const resultado = await salvarInscricaoPush({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
      });
      if (resultado.error) {
        setErro(resultado.error);
        setEstado("inativo");
        return;
      }
      setEstado("ativo");
    } catch {
      setErro("Não foi possível ativar as notificações.");
      setEstado("inativo");
    }
  }

  async function desativar() {
    setErro(null);
    setEstado("processando");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removerInscricaoPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inativo");
    } catch {
      setErro("Não foi possível desativar as notificações.");
      setEstado("ativo");
    }
  }

  if (estado === "verificando") return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h2 className="mb-1 font-heading text-sm font-semibold">Notificações push</h2>
      <p className="mb-4 text-[12px] text-text-muted">
        Lembretes de contas a vencer (1 dia antes e no dia) e tarefas com prazo. No iPhone, funciona depois de salvar o
        TFO-Gestão na tela de início.
      </p>

      {estado === "indisponivel" && (
        <p className="text-[12px] text-text-faint">
          Esse navegador não suporta notificações push. No iPhone, adicione o app à tela de início primeiro (compartilhar → Adicionar
          à Tela de Início).
        </p>
      )}

      {(estado === "inativo" || estado === "processando") && (
        <button
          type="button"
          onClick={ativar}
          disabled={estado === "processando"}
          className="rounded-lg bg-wine-deep px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-60"
        >
          {estado === "processando" ? "Ativando…" : "Ativar notificações"}
        </button>
      )}

      {estado === "ativo" && (
        <div className="flex items-center gap-3">
          <span className="rounded bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">Ativas</span>
          <button type="button" onClick={desativar} className="text-[12px] text-text-muted underline">
            Desativar
          </button>
        </div>
      )}

      {erro && <p className="mt-2 text-[11.5px] text-danger">{erro}</p>}
    </div>
  );
}
