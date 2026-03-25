/* ═══════ MAIN CHAT PAGE — redesign v7.5.97 ═══════ */
export default function Chat() {
  const [convs, setConvs] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filtro, setFiltro] = useState('todos');
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [canned, setCanned] = useState([]);
  const [cannedVisible, setCannedVisible] = useState(false);
  const [cannedIdx, setCannedIdx] = useState(-1);
  const [mobileView, setMobileView] = useState('list');
  const [modal, setModal] = useState(null);
  const [notaText, setNotaText] = useState('');
  const [reacaoHover, setReacaoHover] = useState(null);
  const [transferTarget, setTransferTarget] = useState('');
  const [retornoModal, setRetornoModal] = useState(false);
  const [retornoMin, setRetornoMin] = useState(10);
  const [retornoAgendado, setRetornoAgendado] = useState(null);
  const [meuDesempenho, setMeuDesempenho] = useState(null);
  const [digitando, setDigitando] = useState({});
  const [respondendo, setRespondendo] = useState(null);
  const [showTags, setShowTags] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [showTransferAgente, setShowTransferAgente] = useState(false);
  const [agentesLista, setAgentesLista] = useState([]);
  const digitandoTimer = useRef({});

  const { userId, userName, showToast, setChatUnread } = useStore();
  const msgsEndRef = useRef(null);
  const sseRef = useRef(null);
  const inputRef = useRef(null);
  const activeRef = useRef(null);
  const prevAguardandoRef = useRef(0);
  activeRef.current = activeConv;

  const audioCtxRef = useRef(null);
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const playAlert = useCallback((title, body) => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtxRef.current;
      const playBeep = (delay) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880; osc.type = 'sine'; gain.gain.value = 0.3;
        osc.start(ctx.currentTime + delay); osc.stop(ctx.currentTime + delay + 0.12);
      };
      playBeep(0); playBeep(0.18);
    } catch {}
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try { new Notification(title, { body, icon: '/admin/favicon.ico', tag: 'maxxi-chat-' + Date.now() }); } catch {}
    }
  }, []);

  const loadConvs = useCallback(async () => {
    try {
      const list = await fetchConversas();
      const arr = Array.isArray(list) ? list : [];
      setConvs(arr);
      setChatUnread(arr.filter(c => c.status === 'aguardando').length);
    } catch {}
  }, [setChatUnread]);

