// SisPGeo — Sistema de Pedidos de Geoinformação
// © 2026 Estevez Alvarez <alvarez.jean@eb.mil.br>  ·  Software Engineer
// Regras de negócio: Raphael Perrut <perrut.raphael@eb.mil.br>  ·  Cartographic Engineer

import { create } from "zustand";
import type { Usuario } from "../types/user";
import { SUPERVISOR_PROFILES, CONSOLIDADOR_PROFILES } from "../types/user";

interface AuthState {
  user: Usuario | null;
  token: string | null;
  setUser: (user: Usuario) => void;
  setToken: (token: string) => void;
  logout: () => void;
  isGestor: () => boolean;
  isDSG: () => boolean;
  isCGEO: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem("token"),

  setUser: (user) => set({ user }),

  setToken: (token) => {
    localStorage.setItem("token", token);
    set({ token });
  },

  logout: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null });
  },

  isGestor: () => {
    const p = get().user?.perfil;
    return !!(p && (SUPERVISOR_PROFILES.has(p) || CONSOLIDADOR_PROFILES.has(p)));
  },

  isDSG: () => get().user?.perfil === "GESTOR_CARTOGRAFICO",

  isCGEO: () => get().user?.perfil === "ANALISTA_CGEO",
}));
