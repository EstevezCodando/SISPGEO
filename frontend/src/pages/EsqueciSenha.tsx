import { ArrowLeft, CheckCircle2, Mail } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { authApi } from "../api/auth";

export function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.endsWith("@eb.mil.br")) {
      toast.error("Somente emails @eb.mil.br são aceitos");
      return;
    }
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
      setEnviado(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      const msg = e.response?.data?.detail ?? "Erro ao enviar e-mail";
      // 429 = limite diário atingido
      toast.error(msg, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <img src="/dsg.png" alt="DSG" className="h-14 w-auto" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Recuperar senha
            </h1>
            <p className="text-zinc-500 text-sm mt-1">SisPGeo – DSG/EB</p>
          </div>

          {enviado ? (
            /* ── Estado: e-mail enviado ── */
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="rounded-full bg-emerald-500/10 border border-emerald-500/20 p-4">
                  <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                </div>
              </div>
              <div>
                <p className="text-zinc-100 font-medium">
                  Verifique seu e-mail
                </p>
                <p className="text-zinc-400 text-sm mt-2 leading-relaxed">
                  Se <span className="text-zinc-200 font-medium">{email}</span>{" "}
                  estiver cadastrado, você receberá um link para redefinir sua
                  senha. O link expira em{" "}
                  <span className="text-zinc-200">1 hora</span>.
                </p>
              </div>
              <div className="bg-zinc-800/60 border border-white/5 rounded-lg p-3 text-left">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  <span className="text-zinc-300 font-medium">
                    Não recebeu o e-mail?
                  </span>{" "}
                  Verifique a caixa de spam ou aguarde alguns minutos.
                </p>
                <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                  Caso não receba o e-mail para mudança de senha, entre em
                  contato com a{" "}
                  <span className="text-zinc-400 font-medium">DSG</span> no
                  telefone (61) 3415-5237 ou 860-5237 (RITEx).
                </p>
              </div>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar para o login
              </Link>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              <p className="text-zinc-400 text-sm mb-6 text-center leading-relaxed">
                Informe seu e-mail institucional. Se estiver cadastrado,
                enviaremos um link para redefinir sua senha.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    E-mail Institucional
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nome@eb.mil.br"
                      required
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
                >
                  {loading ? "Enviando..." : "Enviar link de recuperação"}
                </button>
              </form>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para o login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
