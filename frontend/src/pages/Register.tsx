import { CheckCircle2, Eye, EyeOff, Mail, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { omsApi } from "../api/oms";
import { OMS_DATA } from "../data/omsData";
import { POSTOS } from "../data/postos";

const CMILITAR = Object.entries(OMS_DATA).map(([code, { label }]) => ({
  code,
  label,
}));

const SUBORDINACOES = [
  { value: "COTER", label: "COTER - Comando de Operações Terrestres" },
  { value: "DEC", label: "DEC - Departamento de Engenharia e Construção" },
  { value: "COLOG", label: "COLOG - Comando Logístico" },
  {
    value: "DECEx",
    label: "DECEx - Departamento de Educação e Cultura do Exército",
  },
  { value: "DSG", label: "DSG - Diretoria de Serviço Geográfico" },
];

// ── Validação de senha (mesmas regras do backend) ─────────────────────────────

function validarSenha(senha: string): string | null {
  if (senha.length < 8) return "Mínimo 8 caracteres";
  if (!/[A-Z]/.test(senha)) return "Pelo menos uma letra maiúscula";
  if (!/[a-z]/.test(senha)) return "Pelo menos uma letra minúscula";
  if (!/[0-9]/.test(senha)) return "Pelo menos um número";
  if (!/[^A-Za-z0-9]/.test(senha)) return "Pelo menos um caractere especial";
  return null;
}

function RequisitosItem({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 text-xs transition-colors ${ok ? "text-emerald-400" : "text-zinc-500"}`}
    >
      {ok ? (
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
      ) : (
        <XCircle className="h-3.5 w-3.5 flex-shrink-0" />
      )}
      {texto}
    </li>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState<string | null>(null);
  const [omCustom, setOmCustom] = useState(false);
  const [customOMs, setCustomOMs] = useState<string[]>([]);
  const [showSenha, setShowSenha] = useState(false);
  const [showConfirmar, setShowConfirmar] = useState(false);
  const [form, setForm] = useState({
    posto_graduacao: "",
    nome: "",
    nome_de_guerra: "",
    email: "",
    telefone: "",
    ritex_prefix: "",
    ritex_number: "",
    regiao_militar: "",
    om: "",
    funcao_secao: "",
    orgao_vinculante: "",
    senha: "",
    confirmar_senha: "",
  });

  const set =
    (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value;
      setForm((f) => {
        const next = { ...f, [field]: value };
        if (field === "regiao_militar") {
          next.om = "";
          setOmCustom(false);
        }
        return next;
      });
    };

  const numOnly =
    (field: string, maxLen: number) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, maxLen);
      setForm((f) => ({ ...f, [field]: value }));
    };

  const applyPhoneMask = (raw: string): string => {
    const d = raw.replace(/\D/g, "").slice(0, 11);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10)
      return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, telefone: applyPhoneMask(e.target.value) }));
  };

  const phoneDigits = form.telefone.replace(/\D/g, "");
  const phoneTouched = phoneDigits.length > 0;
  const phoneValid = phoneDigits.length === 10 || phoneDigits.length === 11;

  // Senha
  const erroSenha = form.senha ? validarSenha(form.senha) : null;
  const senhaOk = form.senha.length > 0 && erroSenha === null;
  const confirmacaoOk =
    form.senha === form.confirmar_senha && form.confirmar_senha.length > 0;

  useEffect(() => {
    if (!form.regiao_militar) {
      setCustomOMs([]);
      return;
    }
    omsApi
      .listar(form.regiao_militar)
      .then((r) => setCustomOMs(r.data))
      .catch(() => setCustomOMs([]));
  }, [form.regiao_militar]);

  const staticOMs = form.regiao_militar
    ? (OMS_DATA[form.regiao_militar]?.oms ?? [])
    : [];
  const availableOMs = [...new Set([...staticOMs, ...customOMs])].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validações na ordem visual dos campos do formulário
    if (!form.posto_graduacao) {
      toast.error("Selecione o Posto / Graduação");
      return;
    }
    if (!form.nome_de_guerra.trim()) {
      toast.error("Informe o Nome de Guerra");
      return;
    }
    if (!form.nome.trim()) {
      toast.error("Informe o Nome Completo");
      return;
    }
    if (!form.email.endsWith("@eb.mil.br")) {
      toast.error("Somente emails @eb.mil.br são aceitos");
      return;
    }
    if (!phoneValid) {
      toast.error("Informe um telefone válido com DDD – ex: (61) 99999-9999");
      return;
    }
    if (!form.regiao_militar) {
      toast.error("Selecione o Comando Militar de Área Enquadrante");
      return;
    }
    if (!form.om.trim()) {
      toast.error("Informe a Organização Militar (OM)");
      return;
    }
    if (!form.funcao_secao.trim()) {
      toast.error("Informe a Função / Seção");
      return;
    }
    if (!form.orgao_vinculante) {
      toast.error("Selecione o Órgão de Subordinação");
      return;
    }
    const erroSenhaAtual = validarSenha(form.senha);
    if (erroSenhaAtual) {
      toast.error(erroSenhaAtual);
      return;
    }
    if (form.senha !== form.confirmar_senha) {
      toast.error("As senhas não coincidem");
      return;
    }

    const ritex =
      form.ritex_prefix.length === 3 && form.ritex_number.length === 4
        ? `${form.ritex_prefix}-${form.ritex_number}`
        : undefined;

    setLoading(true);
    try {
      if (omCustom && form.om.trim() && form.regiao_militar) {
        await omsApi.criar(form.regiao_militar, form.om.trim()).catch(() => {
          /* silent */
        });
      }
      await authApi.register({
        nome: form.nome,
        nome_de_guerra: form.nome_de_guerra || undefined,
        email: form.email,
        telefone: form.telefone,
        telefone_ritex: ritex,
        regiao_militar: form.regiao_militar || undefined,
        om: form.om,
        secao_om: form.funcao_secao,
        orgao_vinculante: form.orgao_vinculante || undefined,
        posto_graduacao: form.posto_graduacao || undefined,
        senha: form.senha,
      });
      setRegistered(form.email);
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? "Erro no cadastro";
      toast.error(
        Array.isArray(msg) ? (msg[0]?.msg ?? String(msg)) : String(msg),
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Tela de confirmação de cadastro ──────────────────────────────────────────
  if (registered) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/10 blur-[140px] rounded-full pointer-events-none" />
        <div className="relative z-10 w-full max-w-md">
          <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src="/dsg.png"
                alt="DSG"
                className="h-12 w-auto opacity-80"
              />
            </div>

            {/* Ícone de sucesso */}
            <div className="flex justify-center mb-5">
              <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </div>

            {/* Título */}
            <h2 className="text-xl font-bold text-zinc-100 text-center tracking-tight mb-2">
              Cadastro realizado com sucesso!
            </h2>
            <p className="text-zinc-400 text-sm text-center leading-relaxed mb-5">
              Um link de ativação foi enviado para o endereço abaixo. Siga as
              instruções para concluir o acesso ao sistema.
            </p>

            {/* E-mail em destaque */}
            <div className="flex items-center gap-2.5 bg-zinc-800/70 border border-zinc-700/60 rounded-lg px-4 py-3 mb-6">
              <Mail className="h-4 w-4 text-emerald-400 flex-shrink-0" />
              <span className="font-mono text-sm text-emerald-300 font-semibold truncate">
                {registered}
              </span>
            </div>

            {/* Próximos passos */}
            <div className="bg-zinc-800/50 border border-zinc-700/40 rounded-lg p-4 mb-5">
              <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-3">
                Próximos passos
              </p>
              <ol className="space-y-2.5">
                <li className="flex gap-3 text-sm text-zinc-400">
                  <span className="text-emerald-500 font-bold text-xs mt-0.5 shrink-0">
                    01
                  </span>
                  <span>
                    Acesse a caixa de entrada do seu e-mail institucional
                  </span>
                </li>
                <li className="flex gap-3 text-sm text-zinc-400">
                  <span className="text-emerald-500 font-bold text-xs mt-0.5 shrink-0">
                    02
                  </span>
                  <span>
                    Abra a mensagem enviada pelo{" "}
                    <strong className="text-zinc-300">SisPGeo</strong> e clique
                    em{" "}
                    <strong className="text-zinc-300">
                      Ativar Minha Conta
                    </strong>
                  </span>
                </li>
                <li className="flex gap-3 text-sm text-zinc-400">
                  <span className="text-emerald-500 font-bold text-xs mt-0.5 shrink-0">
                    03
                  </span>
                  <span>Retorne ao sistema e realize seu primeiro acesso</span>
                </li>
              </ol>
            </div>

            {/* Nota de expiração */}
            <p className="text-center text-xs text-zinc-300 mb-6">
              O link de ativação é válido por{" "}
              <span className="text-zinc-100 font-medium">24 horas</span>. Caso
              não encontre o e-mail, verifique a pasta de spam.
            </p>

            <button
              onClick={() => navigate("/login")}
              className="w-full border border-zinc-700 text-zinc-300 py-2.5 rounded-lg font-medium text-sm hover:border-zinc-500 hover:text-zinc-100 transition-colors"
            >
              Ir para o Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Formulário de cadastro ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-emerald-500/15 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg">
        <div className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl p-8">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <img src="/dsg.png" alt="DSG" className="h-12 w-auto" />
            </div>
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
              Cadastro de Novo Usuário
            </h1>
            <p className="text-zinc-500 text-sm">SisPGeo – DSG/EB</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Posto / Graduação */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Posto / Graduação <span className="text-red-400">*</span>
              </label>
              <select
                value={form.posto_graduacao}
                onChange={set("posto_graduacao")}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="" className="bg-zinc-800">
                  Selecione o posto / graduação
                </option>
                {POSTOS.map((p) => (
                  <option key={p.id} value={p.nome} className="bg-zinc-800">
                    {p.abrev} – {p.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Nome de Guerra */}
            <Field
              label="Nome de Guerra"
              type="text"
              value={form.nome_de_guerra}
              onChange={set("nome_de_guerra")}
              placeholder="Digite o Nome de Guerra do Militar"
              required
            />

            <Field
              label="Nome Completo (sem posto/graduação)"
              type="text"
              value={form.nome}
              onChange={set("nome")}
              required
            />

            <Field
              label="Email Institucional (@eb.mil.br)"
              type="email"
              value={form.email}
              onChange={set("email")}
              placeholder="nome@eb.mil.br"
              required
            />

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Telefone <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={form.telefone}
                  onChange={handlePhoneChange}
                  placeholder="(61) 99999-9999"
                  required
                  inputMode="numeric"
                  className={[
                    "w-full bg-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-100",
                    "placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-colors",
                    phoneTouched && !phoneValid
                      ? "border border-red-500 focus:ring-red-500 focus:border-red-500"
                      : phoneTouched && phoneValid
                        ? "border border-emerald-500 focus:ring-emerald-500 focus:border-emerald-500"
                        : "border border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500",
                  ].join(" ")}
                />
                {phoneTouched && phoneValid && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-xs font-medium pointer-events-none">
                    ✓ Válido
                  </span>
                )}
              </div>
              {phoneTouched && !phoneValid && (
                <p className="mt-1 text-xs text-red-400">
                  Número incompleto – informe DDD + número (fixo: 8 dígitos,
                  celular: 9 dígitos)
                </p>
              )}
            </div>

            {/* Telefone Ritex (opcional) */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Telefone Funcional (RITEx)
                <span className="text-zinc-500 text-xs font-normal ml-1">
                  – opcional
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.ritex_prefix}
                  onChange={numOnly("ritex_prefix", 3)}
                  placeholder="000"
                  maxLength={3}
                  className="w-20 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                />
                <span className="text-zinc-500 font-semibold select-none">
                  -
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.ritex_number}
                  onChange={numOnly("ritex_number", 4)}
                  placeholder="0000"
                  maxLength={4}
                  className="w-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                />
                {(form.ritex_prefix || form.ritex_number) && (
                  <span className="text-xs text-zinc-500 ml-1">
                    {form.ritex_prefix.padEnd(3, "_")}-
                    {form.ritex_number.padEnd(4, "_")}
                  </span>
                )}
              </div>
            </div>

            {/* Comando Militar Enquadrante */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Comando Militar de Área Enquadrante{" "}
                <span className="text-red-400">*</span>
              </label>
              <select
                value={form.regiao_militar}
                onChange={set("regiao_militar")}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="" className="bg-zinc-800">
                  Selecione o Comando Militar de Área Enquadrante
                </option>
                {CMILITAR.map(({ code, label }) => (
                  <option key={code} value={code} className="bg-zinc-800">
                    {code} – {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Organização Militar */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Organização Militar (OM) <span className="text-red-400">*</span>
              </label>
              {omCustom ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.om}
                    onChange={set("om")}
                    placeholder="Digite a sigla da OM"
                    required
                    autoFocus
                    className="flex-1 bg-zinc-800 border border-emerald-500/40 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setOmCustom(false);
                      setForm((f) => ({ ...f, om: "" }));
                    }}
                    className="px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-700 rounded-lg transition-colors"
                  >
                    ← Lista
                  </button>
                </div>
              ) : (
                <>
                  <input
                    list="om-options"
                    value={form.om}
                    onChange={set("om")}
                    required
                    disabled={!form.regiao_militar}
                    placeholder={
                      form.regiao_militar
                        ? "Digite a sigla da OM"
                        : "Selecione o C Mil A Enquadrante primeiro"
                    }
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                  <datalist id="om-options">
                    {availableOMs.map((om) => (
                      <option key={om} value={om} />
                    ))}
                  </datalist>
                  {form.regiao_militar && (
                    <button
                      type="button"
                      onClick={() => {
                        setOmCustom(true);
                        setForm((f) => ({ ...f, om: "" }));
                      }}
                      className="mt-1.5 text-[11px] text-emerald-500 hover:text-emerald-400 transition-colors"
                    >
                      + Minha OM não está na lista
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Função / Seção */}
            <Field
              label="Função / Seção"
              type="text"
              value={form.funcao_secao}
              onChange={set("funcao_secao")}
              required
            />

            {/* Subordinação */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Subordinação <span className="text-red-400">*</span>
              </label>
              <select
                value={form.orgao_vinculante}
                onChange={set("orgao_vinculante")}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="" className="bg-zinc-800">
                  Selecione o Órgão de Subordinação
                </option>
                {SUBORDINACOES.map(({ value, label }) => (
                  <option key={value} value={value} className="bg-zinc-800">
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* ── Senha ─────────────────────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSenha ? "text" : "password"}
                  value={form.senha}
                  onChange={set("senha")}
                  required
                  placeholder="Crie uma senha segura"
                  className={`w-full bg-zinc-800 rounded-lg px-3 py-2.5 pr-10 text-sm text-zinc-100
                    placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-colors
                    ${
                      form.senha.length > 0
                        ? senhaOk
                          ? "border border-emerald-500/60 focus:ring-emerald-500 focus:border-emerald-500"
                          : "border border-red-500/60 focus:ring-red-500/50 focus:border-red-500/50"
                        : "border border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500"
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showSenha ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showSenha ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>

              {/* Requisitos dinâmicos — aparecem quando o usuário começa a digitar */}
              {form.senha.length > 0 && (
                <ul className="mt-2 space-y-1 pl-0.5">
                  <RequisitosItem
                    ok={form.senha.length >= 8}
                    texto="Mínimo 8 caracteres"
                  />
                  <RequisitosItem
                    ok={/[A-Z]/.test(form.senha)}
                    texto="Uma letra maiúscula"
                  />
                  <RequisitosItem
                    ok={/[a-z]/.test(form.senha)}
                    texto="Uma letra minúscula"
                  />
                  <RequisitosItem
                    ok={/[0-9]/.test(form.senha)}
                    texto="Um número"
                  />
                  <RequisitosItem
                    ok={/[^A-Za-z0-9]/.test(form.senha)}
                    texto="Um caractere especial (!@#$...)"
                  />
                </ul>
              )}
            </div>

            {/* ── Confirmar Senha ────────────────────────────────────────────────── */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Confirmar Senha <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirmar ? "text" : "password"}
                  value={form.confirmar_senha}
                  onChange={set("confirmar_senha")}
                  required
                  placeholder="Repita a senha"
                  className={`w-full bg-zinc-800 rounded-lg px-3 py-2.5 pr-10 text-sm text-zinc-100
                    placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-colors
                    ${
                      form.confirmar_senha.length > 0
                        ? confirmacaoOk
                          ? "border border-emerald-500/60 focus:ring-emerald-500 focus:border-emerald-500"
                          : "border border-red-500/60 focus:ring-red-500/50 focus:border-red-500/50"
                        : "border border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500"
                    }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmar((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showConfirmar ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showConfirmar ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.confirmar_senha.length > 0 && !confirmacaoOk && (
                <p className="mt-1 text-xs text-red-400">
                  As senhas não coincidem
                </p>
              )}
              {confirmacaoOk && (
                <p className="mt-1 text-xs text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Senhas conferem
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-400 transition-colors disabled:opacity-60 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
            >
              {loading ? "Cadastrando..." : "Criar Conta"}
            </button>
          </form>

          <p className="text-center text-sm text-zinc-500 mt-4">
            Já tem conta?{" "}
            <Link
              to="/login"
              className="text-emerald-400 font-medium hover:text-emerald-300 transition-colors"
            >
              Entrar
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Componentes auxiliares ────────────────────────────────────────────────────

function Field({
  label,
  type,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const [touched, setTouched] = useState(false);
  const isInvalid = required && touched && !value.trim();

  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        className={[
          "w-full bg-zinc-800 rounded-lg px-3 py-2.5 text-sm text-zinc-100",
          "placeholder:text-zinc-500 focus:outline-none focus:ring-1 transition-colors",
          isInvalid
            ? "border border-red-500 focus:ring-red-500 focus:border-red-500"
            : "border border-zinc-700 focus:ring-emerald-500 focus:border-emerald-500",
        ].join(" ")}
      />
      {isInvalid && (
        <p className="mt-1 text-xs text-red-400">Campo obrigatório</p>
      )}
    </div>
  );
}
