"use client";

import { useState, useTransition } from "react";

/**
 * Substituto de `useActionState` pras linhas de edição (Editar → salvar → fechar): mesma
 * assinatura de retorno `[state, formAction, pending]`, mas com um `aoSalvar` chamado só quando a
 * ação retorna sucesso — é o que fecha o formulário de volta pra visualização.
 *
 * O padrão anterior — "if (state.success && editando) setEditando(false)" direto no corpo do
 * componente, ou num useEffect — tem dois problemas: 1) o `state` do useActionState não "reseta"
 * sozinho, então depois do primeiro salvamento bem-sucedido, clicar em "Editar" de novo reabre e
 * fecha o formulário no mesmo tick (parece que o clique não registrou); 2) o projeto roda com as
 * regras do React Compiler, que proíbem mexer em ref ou chamar setState durante a renderização ou
 * dentro de um efeito puro (ver react-hooks/refs e react-hooks/set-state-in-effect).
 *
 * Aqui o fechamento roda dentro da própria transição de envio — contexto de interação do usuário,
 * não efeito nem renderização — então nenhuma das duas regras se aplica.
 */
export function useAcaoEdicao<T extends { error: string | null; success?: boolean }>(
  acao: (prevState: T, formData: FormData) => Promise<T>,
  estadoInicial: T,
  aoSalvar?: (resultado: T) => void,
): readonly [T, (formData: FormData) => void, boolean] {
  const [state, setState] = useState<T>(estadoInicial);
  const [pending, startTransition] = useTransition();

  const formAction = (formData: FormData) => {
    startTransition(async () => {
      const resultado = await acao(estadoInicial, formData);
      setState(resultado);
      if (resultado.success) aoSalvar?.(resultado);
    });
  };

  return [state, formAction, pending] as const;
}
