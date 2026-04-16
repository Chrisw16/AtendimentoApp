// Stubs — páginas não implementadas ainda
// Cada componente deve ser exportado como default para lazy() funcionar

function Stub({ title, description }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '60vh', gap: '12px', textAlign: 'center',
      color: 'var(--text-tertiary)',
    }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', color: 'var(--text-primary)' }}>
        {title}
      </h1>
      <p style={{ fontSize: '14px', maxWidth: '400px' }}>{description}</p>
    </div>
  );
}

export function Analytics()    { return <Stub title="Analytics"          description="Relatórios avançados e métricas de atendimento." />; }
export function Dispositivos() { return <Stub title="Dispositivos CPE"  description="Gestão de equipamentos via TR-069." />; }
export function Email()        { return <Stub title="E-mail"             description="Caixa de entrada unificada e automações." />; }
export function VoIP()         { return <Stub title="VoIP"               description="Softphone, ramais e histórico de chamadas." />; }
export function Frota()        { return <Stub title="Frota"              description="Gestão de veículos, rotas e manutenção." />; }

export default Stub;
