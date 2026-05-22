import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { omsApi } from "../api/oms";
import { OMS_DATA } from "../data/omsData";
import { POSTOS } from "../data/postos";
import { trackEvent } from "../firebase";

const CMILITAR = Object.entries(OMS_DATA).map(([code, { label }]) => ({
  code,
  label,
}));

// Subordinação: órgão ao qual a OM é subordinada
const SUBORDINACOES = [
  { value: "DSG", label: "DSG — Diretoria de Serviço Geográfico" },
  { value: "DCT", label: "DCT — Departamento de Ciência e Tecnologia" },
  { value: "COTER", label: "COTER — Comando de Operações Terrestres" },
  { value: "DEC", label: "DEC — Departamento de Engenharia e Construção" },
  { value: "COLOG", label: "COLOG — Comando Logístico" },
  {
    value: "DECEx",
    label: "DECEx — Departamento de Educação e Cultura do Exército",
  },
];

export function Register() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [omCustom, setOmCustom] = useState(false); // habilita campo livre para OM não listada
  const [customOMs, setCustomOMs] = useState<string[]>([]); // OMs salvas por outros usuários
  const [form, setForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    ritex_prefix: "", // 3 dígitos
    ritex_number: "", // 4 dígitos
    regiao_militar: "",
    om: "",
    secao_om: "",
    orgao_vinculante: "",
    posto_graduacao: "",
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

  // Máscara numérica
  const numOnly =
    (field: string, maxLen: number) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value.replace(/\D/g, "").slice(0, maxLen);
      setForm((f) => ({ ...f, [field]: value }));
    };

  // Busca OMs customizadas ao mudar o C Mil. A
  useEffect(() => {
    if (!form.regiao_militar) { setCustomOMs([]); return; }
    omsApi.listar(form.regiao_militar)
      .then(r => setCustomOMs(r.data))
      .catch(() => setCustomOMs([]));
  }, [form.regiao_militar]);

  const staticOMs = form.regiao_militar ? (OMS_DATA[form.regiao_militar]?.oms ?? []) : [];
  // Merge: estáticas + customizadas (sem duplicatas), ordenado
  const availableOMs = [...new Set([...staticOMs, ...customOMs])].sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.senha !== form.confirmar_senha) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (!form.email.endsWith("@eb.mil.br")) {
      toast.error("Somente emails @eb.mil.br são aceitos");
      return;
    }
    if (!form.om.trim()) {
      toast.error("Informe a Organização Militar");
      return;
    }

    // Monta telefone Ritex (ex: "152-7890") — opcional
    const ritex =
      form.ritex_prefix.length === 3 && form.ritex_number.length === 4
        ? `${form.ritex_prefix}-${form.ritex_number}`
        : undefined;

    setLoading(true);
    try {
      // Salva OM customizada para futuros cadastrantes (se digitada manualmente)
      if (omCustom && form.om.trim() && form.regiao_militar) {
        await omsApi.criar(form.regiao_militar, form.om.trim()).catch(() => {/* silent */});
      }

      await authApi.register({
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        telefone_ritex: ritex,
        regiao_militar: form.regiao_militar || undefined,
        om: form.om,
        secao_om: form.secao_om,
        orgao_vinculante: form.orgao_vinculante || undefined,
        posto_graduacao: form.posto_graduacao || undefined,
        senha: form.senha,
      });
      trackEvent("sign_up", { method: "email", om: form.om });
      toast.success(
        "Cadastro realizado! Aguarde o administrador autorizar seu acesso.",
        { duration: 6000 },
      );
      navigate("/login");
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? "Erro no cadastro";
      toast.error(
        Array.isArray(msg) ? (msg[0]?.msg ?? String(msg)) : String(msg),
      );
    } finally {
      setLoading(false);
    }
  };

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
              Novo Cadastro
            </h1>
            <p className="text-zinc-500 text-sm">SisPGeo — DSG/EB</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
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
                <option value="" className="bg-zinc-800">Selecione o posto / graduação</option>
                {POSTOS.map((p) => (
                  <option key={p.id} value={p.nome} className="bg-zinc-800">
                    {p.abrev} — {p.nome}
                  </option>
                ))}
              </select>
            </div>

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

            {/* Telefone + Ritex */}
            <Field
              label="Telefone"
              type="tel"
              value={form.telefone}
              onChange={set("telefone")}
              placeholder="(61) 99999-9999"
              required
            />

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Telefone Funcional (Ritex)
                <span className="text-zinc-500 text-xs font-normal ml-1">
                  — opcional
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
                  —
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
                    {form.ritex_prefix.padEnd(3, "_")} —{" "}
                    {form.ritex_number.padEnd(4, "_")}
                  </span>
                )}
              </div>
            </div>

            {/* Comando Militar Enquadrante */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Comando Militar de Área Enquadrante
              </label>
              <select
                value={form.regiao_militar}
                onChange={set("regiao_militar")}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="" className="bg-zinc-800">
                  Escolha o C Mil A Enquadrante
                </option>
                {CMILITAR.map(({ code, label }) => (
                  <option key={code} value={code} className="bg-zinc-800">
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* OM — combobox com datalist + opção de OM nova */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Organização Militar (OM)
              </label>
              {omCustom ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={form.om}
                    onChange={set("om")}
                    placeholder="Digite o nome completo da OM"
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
                        ? "Escolha ou digite a OM"
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

            {/* Subordinação */}
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Subordinação{" "}
                <span className="text-zinc-500 text-xs">
                  (órgão ao qual sua OM é subordinada)
                </span>
              </label>
              <select
                value={form.orgao_vinculante}
                onChange={set("orgao_vinculante")}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
              >
                <option value="" className="bg-zinc-800">
                  Escolha a subordinação
                </option>
                {SUBORDINACOES.map(({ value, label }) => (
                  <option key={value} value={value} className="bg-zinc-800">
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <Field
              label="Seção / Função"
              type="text"
              value={form.secao_om}
              onChange={set("secao_om")}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Senha"
                type="password"
                value={form.senha}
                onChange={set("senha")}
                required
              />
              <Field
                label="Confirmar Senha"
                type="password"
                value={form.confirmar_senha}
                onChange={set("confirmar_senha")}
                required
              />
            </div>

            <p className="text-xs text-zinc-500">
              A senha deve ter mínimo 8 caracteres, com maiúscula, minúscula,
              número e caractere especial.
            </p>

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
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
      />
    </div>
  );
}
