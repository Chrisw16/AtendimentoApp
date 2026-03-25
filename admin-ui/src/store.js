import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // Auth
  token: localStorage.getItem('maxxi_token') || '',
  role: localStorage.getItem('maxxi_role') || '',
  userName: localStorage.getItem('maxxi_nome') || '',
  userId: localStorage.getItem('maxxi_id') || '',
  isLoggedIn: !!localStorage.getItem('maxxi_token'),

  setAuth: (data) => {
    localStorage.setItem('maxxi_token', data.token);
    localStorage.setItem('maxxi_role', data.role || 'admin');
    localStorage.setItem('maxxi_nome', data.nome || 'Admin');
    localStorage.setItem('maxxi_id', data.id || 'admin');
    set({
      token: data.token,
      role: data.role || 'admin',
      userName: data.nome || 'Admin',
      userId: data.id || 'admin',
      isLoggedIn: true,
    });
  },

  logout: () => {
    localStorage.removeItem('maxxi_token');
    localStorage.removeItem('maxxi_role');
    localStorage.removeItem('maxxi_nome');
    localStorage.removeItem('maxxi_id');
    set({ token: '', role: '', userName: '', userId: '', isLoggedIn: false });
  },

  // Toast
  toast: null,
  showToast: (msg, isError = false) => {
    set({ toast: { msg, isError } });
    setTimeout(() => set({ toast: null }), 3500);
  },

  // Chat unread
  chatUnread: 0,
  setChatUnread: (n) => set({ chatUnread: n }),

  // Sidebar collapsed state
  sidebarCollapsed: localStorage.getItem('maxxi_sidebar_collapsed') === 'true',
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem('maxxi_sidebar_collapsed', String(next));
    set({ sidebarCollapsed: next });
  },

  // Notifications panel
  notifications: [],
  notifUnread: 0,
  addNotification: (notif) => {
    const item = {
      id: Date.now() + Math.random(),
      ts: new Date().toISOString(),
      read: false,
      ...notif,
    };
    set(s => ({
      notifications: [item, ...s.notifications].slice(0, 50),
      notifUnread: s.notifUnread + 1,
    }));
  },
  markAllNotifRead: () => {
    set(s => ({
      notifications: s.notifications.map(n => ({ ...n, read: true })),
      notifUnread: 0,
    }));
  },
  clearNotifications: () => set({ notifications: [], notifUnread: 0 }),
}));
