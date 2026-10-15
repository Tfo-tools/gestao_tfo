import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit carrega as fontes padrão (Helvetica) do próprio pacote em tempo de execução; se o Next o
  // empacotar, esses arquivos ficam de fora do bundle e o PDF falha na Vercel.
  serverExternalPackages: ["pdfkit"],
  experimental: {
    // Padrão é 1mb. Anexos de tarefa vão direto do navegador pro Drive/Storage (a Vercel barra corpo
    // acima de ~4,5mb, independente deste valor); isto cobre os uploads que ainda passam pelo servidor
    // (comprovantes de custos, reserva de anexo pequeno).
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
