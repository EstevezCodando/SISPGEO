import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { authApi } from "../api/auth";

type Estado = "carregando" | "sucesso" | "erro";

export function AtivarConta() {
  const { token } = useParams<{ token: string }>();
  const [estado, setEstado] = useState<Estado>("carregando");
  const [mensagem, setMensagem] = useState("");

  useEffect(() => {
    if (!token) { setEstado("erro"); setMensagem("Token inválido."); return; }

    authApi
      .confirmEmail(token)
      .then((r) => {
        setMensagem(r.data?.message ?? "E-mail confirmado com sucesso.");
        setEstado("sucesso");
      })
      .catch((err) => {
        setMensagem(
          err.response?.data?.detail ?? "Link inválido ou expirado."
        );
        setEstado("erro");
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* glow */}
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
          {/* DSG logo */}
          <div className="flex justify-center mb-6">
            <img src="/dsg.png" alt="DSG" className="h-12 w-auto opacity-80" />
          </div>

          {estado === "carregando" && (
            <>
              <div className="flex justify-center mb-5">
                <svg
                  className="animate-spin h-10 w-10 text-emerald-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">
                Verificando link...
              </h2>
              <p className="text-zinc-500 text-sm">Aguarde um momento.</p>
            </>
          )}

          {estado === "sucesso" && (
            <>
              <div className="flex justify-center mb-5">
                <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                  <svg
                    className="h-8 w-8 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2 tracking-tight">
                E-mail confirmado!
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                Sua conta está ativa. Você já pode realizar login no SisPGeo.
              </p>
              <Link
                to="/login"
                className="inline-block w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-emerald-400 transition-colors shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
              >
                Ir para o Login
              </Link>
            </>
          )}

          {estado === "erro" && (
            <>
              <div className="flex justify-center mb-5">
                <div className="h-16 w-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center">
                  <svg
                    className="h-8 w-8 text-red-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mb-2 tracking-tight">
                Link inválido
              </h2>
              <p className="text-zinc-400 text-sm leading-relaxed mb-6">
                {mensagem}
              </p>
              <p className="text-zinc-500 text-xs mb-6">
                Links de ativação expiram em 24 horas. Se o prazo venceu,
                entre em contato com o administrador do sistema.
              </p>
              <Link
                to="/login"
                className="inline-block w-full border border-zinc-700 text-zinc-300 py-2.5 rounded-lg font-medium text-sm hover:border-zinc-500 hover:text-zinc-100 transition-colors"
              >
                Voltar ao Login
              </Link>
            </>
          )}

          <p className="mt-6 text-zinc-600 text-[11px]">
            SisPGeo · Diretoria de Serviço Geográfico · EB
          </p>
        </div>
      </div>
    </div>
  );
}
