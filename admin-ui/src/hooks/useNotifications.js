import { useEffect, useRef } from 'react';
import { createChatSSE, fetchVapidKey, api } from '../api';
import { useStore } from '../store';

function playSound(urgent) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const g = ctx.createGain(); g.connect(ctx.destination);
    if (urgent) {
      [0, .15, .3].forEach(t => {
        const o = ctx.createOscillator(); o.connect(g); o.frequency.value = 1050;
        g.gain.setValueAtTime(.4, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + t + .12);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .12);
      });
    } else {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.connect(g); o2.connect(g);
      o1.frequency.value = 700; o2.frequency.value = 900;
      g.gain.setValueAtTime(.25, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .4);
      o1.start(ctx.currentTime); o1.stop(ctx.currentTime + .12);
      o2.start(ctx.currentTime + .14); o2.stop(ctx.currentTime + .38);
    }
  } catch {}
}

async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const d = await fetchVapidKey();
    if (!d?.publicKey) return;
    const reg = await navigator.serviceWorker.ready;
    const padding = '='.repeat((4 - d.publicKey.length % 4) % 4);
    const base64 = (d.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: outputArray });
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub.toJSON()) });
  } catch {}
}

export default function useNotifications() {
  const { showToast, setChatUnread, addNotification } = useStore();
  const sseRef = useRef(null);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') subscribePush();
      });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      subscribePush();
    }

    const connect = () => {
      if (sseRef.current) { try { sseRef.current.close(); } catch {} }
      const sse = createChatSSE();
      sseRef.current = sse;

      sse.addEventListener('nova_mensagem', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.status !== 'ativa') playSound(false);
          const nome = d.nome || d.telefone || 'Cliente';
          addNotification({
            type: 'info',
            message: `Nova mensagem de ${nome}`,
            sub: (d.conteudo || '').slice(0, 60),
          });
          if (Notification.permission === 'granted') {
            new Notification('Maxxi — ' + nome, {
              body: (d.conteudo || 'Nova mensagem').slice(0, 100),
              icon: '/admin/icons/icon-192.png',
              tag: 'maxxi-msg-' + (d.convId || ''),
              renotify: true,
              silent: true,
            });
          }
        } catch {}
      });

      sse.addEventListener('cliente_frustrado', (e) => {
        try {
          const d = JSON.parse(e.data);
          playSound(true);
          const nome = d.nome || d.telefone;
          showToast('Cliente frustrado: ' + nome);
          addNotification({
            type: 'alert',
            message: 'Cliente frustrado',
            sub: nome + ' (' + (d.canal || '') + ')',
          });
          if (Notification.permission === 'granted') {
            new Notification('Maxxi — Cliente frustrado!', {
              body: nome + ' (' + (d.canal || '') + ')',
              icon: '/admin/icons/icon-192.png',
              tag: 'frustrado-' + (d.convId || ''),
              renotify: true,
              requireInteraction: true,
            });
          }
        } catch {}
      });

      sse.addEventListener('status_alterado', (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.status === 'aguardando') {
            playSound(false);
            addNotification({
              type: 'warning',
              message: 'Conversa aguardando atendente',
            });
            if (Notification.permission === 'granted') {
              new Notification('Maxxi — Aguardando atendente', {
                body: 'Uma conversa precisa de atenção',
                icon: '/admin/icons/icon-192.png',
                tag: 'aguardando',
                renotify: true,
              });
            }
          }
        } catch {}
      });

      sse.addEventListener('mensagem_agente', (e) => {
        try {
          const d = JSON.parse(e.data);
          const myId = localStorage.getItem('maxxi_id');
          if (d.convId && myId) playSound(false);
        } catch {}
      });

      // Agente fantasma
      sse.addEventListener("agente_fantasma", (e) => {
        try {
          const d = JSON.parse(e.data);
          playSound(false);
          addNotification({
            type: "alert",
            message: `Fantasma: ${d.agenteNome} assumiu conversa de ${d.clienteNome || "cliente"} há ${d.minutos}min sem responder`,
            sub: `Canal: ${d.canal || "wa"} · Ação necessária`,
          });
          showToast(`👻 ${d.agenteNome}: sem resposta há ${d.minutos}min`);
        } catch {}
      });

      // Conversa abandonada
      sse.addEventListener("conversa_abandonada", (e) => {
        try {
          const d = JSON.parse(e.data);
          addNotification({
            type: "warning",
            message: `Conversa de ${d.clienteNome || "cliente"} sem resposta há ${d.minutos}min`,
            sub: `Agente: ${d.agenteNome || d.agenteId} · ${d.canal || ""}`,
          });
        } catch {}
      });

      sse.onerror = () => {
        try { sse.close(); } catch {}
        setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      if (sseRef.current) { try { sseRef.current.close(); } catch {} }
    };
  }, []); // eslint-disable-line
}
