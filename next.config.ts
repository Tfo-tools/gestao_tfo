import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Padrão é 1mb — anexos de fatura/comprovante (foto do celular, PDF) passam disso fácil.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
