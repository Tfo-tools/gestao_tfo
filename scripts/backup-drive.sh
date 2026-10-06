#!/usr/bin/env bash
# Backup do código no Google Drive (Zuzu/CODIGO/gestao_tfo) — roda a cada publicação.
# Zuzu é o drive escrito só pela IA (redesenho de 06/10/2026); o código oficial vive no Mac + GitHub, isto é só rede de segurança.
# Exporta o código do commit atual (sem node_modules, build e .env) e um bundle com o histórico inteiro.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="/Users/vanessaugulino/Library/CloudStorage/GoogleDrive-vanessa@thefashionoffice.com.br/Drives compartilhados/Zuzu/CODIGO/gestao_tfo"
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git branch --show-current)

mkdir -p "$DEST"
# Limpa a cópia anterior do código (mantém só o que este script gera), pra arquivo apagado no repo não sobrar aqui.
find "$DEST" -mindepth 1 -maxdepth 1 ! -name '*.bundle' ! -name 'LEIA-ME.txt' -exec rm -rf {} +
git archive --format=tar HEAD | tar -x -C "$DEST"
git bundle create "$DEST/gestao_tfo-historico-completo.bundle" --all >/dev/null 2>&1

cat > "$DEST/LEIA-ME.txt" <<TXT
Backup do código do TFO-Gestão (github.com/Tfo-tools/gestao_tfo)
Gerado em $(date '+%d/%m/%Y %H:%M') a partir do commit $COMMIT — branch $BRANCH.

- Pastas e arquivos aqui = o código-fonte exatamente como está no GitHub nesse commit
  (sem node_modules, sem build e sem arquivos .env — segredos ficam só na Vercel).
- gestao_tfo-historico-completo.bundle = o repositório inteiro com todo o histórico de commits.
  Para restaurar em qualquer máquina:  git clone gestao_tfo-historico-completo.bundle gestao_tfo
- Para rodar:  npm install  →  npm run dev  (precisa das variáveis de ambiente da Vercel).
TXT
echo "backup ok — commit $COMMIT ($(find "$DEST" -type f | wc -l | tr -d ' ') arquivos, $(du -sh "$DEST" | cut -f1))"
