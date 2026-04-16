import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useStore = create(
  persist(
    (set, get) => ({
      /* ── AUTH ─────────────────────────────────────────────── */
      token: null,
      user: null,
      role: null,
      permissoes: null,

      setAuth: ({ token, user, role, permissoes }) =>
        set({ token, user, role: role || user?.role, permissoes: permissoes || null }),

      logout: () => {
        set({ token: null, user: null, role: null, permissoes: null });
        window.location.href = '/login';
      },

      hasPerm: (perm) => {
        const { role, permissoes } = get();
        if (role === 'admin') return true;
        if (!permissoes) return false;
        return permissoes[perm] === true;
      },

      /* ── NOTIFICATIONS ────────────────────────────────────── */
      notifCount: 0,
      notifications: [],

      addNotification: (notif) =>
        set(s => ({
          notifications: [{ ...notif, id: Date.now(), read: false }, ...s.notifications].slice(0, 50),
          notifCount: s.notifCount + 1,
        })),

      markAllRead: () =>
        set(s => ({
          notifications: s.notifications.map(n => ({ ...n, read: true })),
          notifCount: 0,
        })),

      /* ── TOAST ────────────────────────────────────────────── */
      toasts: [],

      toast: (message, type = 'info', duration = 4000) => {
        const id = Date.now();
        set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
        setTimeout(() => {
          set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));
        }, duration);
      },

      removeToast: (id) =>
        set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

      /* ── UI STATE ─────────────────────────────────────────── */
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),

      commandPaletteOpen: false,
      setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
    }),
    {
      name: 'maxxi-store',
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        role: s.role,
        permissoes: s.permissoes,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);
