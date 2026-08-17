// SisPGeo — Sistema de Pedidos de Geoinformação
// © 2026 2º Sgt Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
// Regras de negócio e contratos: Cap Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer
// Revisão técnica do projeto: Cel Azeredo <azeredo.marcio@eb.mil.br>  ·  Cartographic Engineer

import { useEffect, type ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import {
    BrowserRouter,
    Navigate,
    Route,
    Routes,
    useLocation,
} from "react-router-dom";
import { usersApi } from "./api/users";
import { AppLayout } from "./components/layout/AppLayout";
import { AdminPedidos } from "./pages/admin/AdminPedidos";
import { ApiMetricas } from "./pages/admin/ApiMetricas";
import { GerenciarUsuarios } from "./pages/admin/GerenciarUsuarios";
import { Ajuda } from "./pages/Ajuda";
import { AtivarConta } from "./pages/AtivarConta";
import { CGEODashboard } from "./pages/cgeo/CGEODashboard";
import { Dashboard } from "./pages/Dashboard";
import { DSGDashboard } from "./pages/dsg/DSGDashboard";
import { JanelasPedidos } from "./pages/dsg/JanelasPedidos";
import { Relatorios } from "./pages/dsg/Relatorios";
import { EsqueciSenha } from "./pages/EsqueciSenha";
import { GestorDashboard } from "./pages/gestor/GestorDashboard";
import { PedidosHomologados } from "./pages/gestor/PedidosHomologados";
import { Integracoes } from "./pages/Integracoes";
import { Login } from "./pages/Login";
import { MeusDados } from "./pages/MeusDados";
import { MeusPedidos } from "./pages/MeusPedidos";
import { RedefinirSenha } from "./pages/RedefinirSenha";
import { Register } from "./pages/Register";
import { ReenviarAtivacao } from "./pages/ReenviarAtivacao";
import { SolicitarProdutos } from "./pages/SolicitarProdutos";
import { useAuthStore } from "./store/authStore";
import { CONSOLIDADOR_PROFILES, SUPERVISOR_PROFILES } from "./types/user";

const GESTOR_PROFILES = new Set([
  ...SUPERVISOR_PROFILES,
  ...CONSOLIDADOR_PROFILES,
]);

function RequireAuth({ children }: { children: ReactNode }) {
  const { token, user, setUser } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (token && !user) {
      usersApi
        .getMe()
        .then((r) => setUser(r.data))
        .catch(() => useAuthStore.getState().logout());
    }
  }, [token, user]);

  if (!token)
    return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function RequireProfile({
  profiles,
  children,
}: {
  profiles: Set<string>;
  children: ReactNode;
}) {
  const { user } = useAuthStore();
  if (user && !profiles.has(user.perfil)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{ duration: 4000 }}
        containerStyle={{ zIndex: 99999 }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/ativar/:token" element={<AtivarConta />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
        <Route path="/reenviar-ativacao" element={<ReenviarAtivacao />} />

        {/* Protected */}
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route path="/solicitar-produtos" element={<SolicitarProdutos />} />
          <Route path="/meus-pedidos" element={<MeusPedidos />} />
          <Route path="/meus-dados" element={<MeusDados />} />
          <Route
            path="/gestor/pedidos"
            element={
              <RequireProfile profiles={GESTOR_PROFILES}>
                <GestorDashboard />
              </RequireProfile>
            }
          />
          <Route
            path="/gestor/homologados"
            element={
              <RequireProfile profiles={GESTOR_PROFILES}>
                <PedidosHomologados />
              </RequireProfile>
            }
          />
          <Route path="/dsg/pedidos" element={<DSGDashboard />} />
          <Route path="/dsg/janelas" element={<JanelasPedidos />} />
          <Route path="/dsg/relatorios" element={<Relatorios />} />
          <Route path="/cgeo/pedidos" element={<CGEODashboard />} />
          <Route path="/admin/usuarios" element={<GerenciarUsuarios />} />
          <Route path="/admin/pedidos" element={<AdminPedidos />} />
          <Route path="/admin/metricas" element={<ApiMetricas />} />
          <Route path="/integracoes" element={<Integracoes />} />
          <Route path="/ajuda" element={<Ajuda />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
