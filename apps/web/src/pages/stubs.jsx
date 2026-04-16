// Stubs — cada um será expandido na sua sessão dedicada
import styles from './Stub.module.css';

function Stub({ title, description }) {
  return (
    <div className={styles.root}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.desc}>{description}</p>
    </div>
  );
}

export function Historico()    { return <Stub title="Histórico"          description="Conversas encerradas com busca e filtros avançados." />; }
export function Tarefas()      { return <Stub title="Tarefas"            description="Gestão de tarefas por agente com Kanban e prazos." />; }
export function Satisfacao()   { return <Stub title="Satisfação"         description="NPS, avaliações e heatmap de performance." />; }
export function Fluxos()       { return <Stub title="Fluxos"             description="Editor visual de fluxos de atendimento com IA." />; }
export function Canais()       { return <Stub title="Canais"             description="Configuração de WhatsApp, Telegram, e-mail e demais canais." />; }
export function Analytics()    { return <Stub title="Analytics"          description="Relatórios avançados e métricas de atendimento." />; }
export function Clientes()     { return <Stub title="Clientes"           description="Base de clientes integrada ao ERP." />; }
export function Ocorrencias()  { return <Stub title="Ocorrências"        description="Registro e gestão de ocorrências técnicas." />; }
export function OrdensServico(){ return <Stub title="Ordens de Serviço"  description="Criação e acompanhamento de OS." />; }
export function Frota()        { return <Stub title="Frota"              description="Gestão de veículos, rotas e manutenção." />; }
export function Cobertura()    { return <Stub title="Cobertura"          description="Mapa interativo de cobertura geográfica." />; }
export function MonitorRede()  { return <Stub title="Monitor de Rede"   description="Topologia, alertas e status de equipamentos." />; }
export function Dispositivos() { return <Stub title="Dispositivos CPE"  description="Gestão de equipamentos via TR-069." />; }
export function Financeiro()   { return <Stub title="Financeiro"         description="Cobranças, régua e integração com ERP financeiro." />; }
export function Email()        { return <Stub title="E-mail"             description="Caixa de entrada unificada e automações." />; }
export function VoIP()         { return <Stub title="VoIP"               description="Softphone, ramais e histórico de chamadas." />; }
export function Configuracoes(){ return <Stub title="Configurações"      description="Configurações gerais do sistema e do tenant." />; }
