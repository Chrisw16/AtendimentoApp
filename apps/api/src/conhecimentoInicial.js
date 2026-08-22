/**
 * conhecimentoInicial.js — a carga inicial da base de conhecimento.
 *
 * Conteúdo fornecido pelo operador do provedor (2026-08-22), não inventado
 * aqui. Essa distinção é o motivo de este arquivo existir separado e de a
 * migration 022 NÃO semear artigo: conhecimento escrito por quem faz o código
 * viraria "política da casa" que ninguém redigiu, e um agente citaria como se
 * fosse.
 *
 * ── A REGRA DO STATUS, que é de segurança ────────────────────────────────
 * Só chega na IA o que está `publicado` (§52). Vários itens desta carga são
 * ESQUELETOS — trazem a lista de perguntas que a empresa precisa responder
 * (fidelidade, instalação, cancelamento, manuais de equipamento). Publicar um
 * esqueleto faria a IA responder ao cliente com *"Existe fidelidade? Qual o
 * período?"* como se fosse a política vigente.
 *
 * Por isso: conteúdo COMPLETO nasce `publicado`; ESQUELETO nasce `rascunho`,
 * aparece na tela como pendência editorial e só vai ao ar quando alguém
 * preencher. `rascunho: true` no item é o que marca isso.
 */

/** As 5 primeiras já existiam (migration 022) — os slugs batem de propósito. */
export const CATEGORIAS = [
  { slug: 'isp-core',            nome: 'ISP Core',              ordem: 1,  descricao: 'Fundamentos da rede de um provedor.' },
  { slug: 'wifi',                nome: 'Wi-Fi',                 ordem: 2,  descricao: 'Cobertura, frequências e desempenho sem fio.' },
  { slug: 'fibra-optica',        nome: 'Fibra Óptica',          ordem: 3,  descricao: 'Enlace óptico, sinal e LOS.' },
  { slug: 'rede-conectividade',  nome: 'Rede e Conectividade',  ordem: 4,  descricao: 'IP, DNS, latência e perda de pacotes.' },
  { slug: 'equipamentos',        nome: 'Equipamentos',          ordem: 5,  descricao: 'Manuais de ONU, roteadores e CPEs.' },
  { slug: 'suporte-tecnico',     nome: 'Suporte técnico',       ordem: 6,  descricao: 'Procedimentos de diagnóstico e configuração.' },
  { slug: 'financeiro',          nome: 'Financeiro',            ordem: 7,  descricao: 'Boletos, prazos, negociação e cobrança.' },
  { slug: 'comercial',           nome: 'Comercial',             ordem: 8,  descricao: 'Planos, promoções e argumentação de venda.' },
  { slug: 'objecoes-comerciais', nome: 'Objeções Comerciais',   ordem: 9,  descricao: 'Como tratar cada objeção sem inventar condição.' },
  { slug: 'planos-produtos',     nome: 'Planos e Produtos',     ordem: 10, descricao: 'Catálogo comercial — preço e disponibilidade vêm do ERP.' },
  { slug: 'instalacao',          nome: 'Instalação',            ordem: 11, descricao: 'Prazos, taxas e condições de instalação.' },
  { slug: 'politicas',           nome: 'Políticas do Provedor', ordem: 12, descricao: 'Regras oficiais da empresa: fidelidade, cancelamento, mudança.' },
  { slug: 'atendimento',         nome: 'Atendimento',           ordem: 13, descricao: 'Padrão de comunicação com o cliente.' },
  { slug: 'seguranca',           nome: 'Segurança',             ordem: 14, descricao: 'O que NUNCA orientar ao cliente.' },
  { slug: 'lgpd-privacidade',    nome: 'LGPD e Privacidade',    ordem: 15, descricao: 'Tratamento de dados pessoais do assinante.' },
];

/** Cabeçalho que todo esqueleto carrega — para ninguém confundir com política vigente. */
const PENDENTE = '⚠️ RASCUNHO — PREENCHER COM AS REGRAS OFICIAIS DA EMPRESA.\nEnquanto estiver assim, este item NÃO é usado pela IA.\n\nResponda:\n';

export const ARTIGOS = [
  // ── ISP CORE ────────────────────────────────────────────────────
  {
    slug: 'o-que-e-um-provedor-de-internet', titulo: 'O que é um provedor de internet',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica de forma simples o funcionamento de um provedor de internet e os principais componentes envolvidos na entrega do serviço.',
    conteudo: `Um provedor de internet é responsável por entregar conectividade aos seus clientes utilizando uma infraestrutura de telecomunicações.

Em redes de fibra óptica, o serviço normalmente passa por equipamentos como OLT, CTO e ONU/ONT até chegar ao roteador instalado no ambiente do cliente.

O provedor também utiliza sistemas de autenticação, monitoramento e gerenciamento para controlar conexões, equipamentos, contratos e serviços.`,
  },
  {
    slug: 'o-que-e-onu-e-ont', titulo: 'O que é ONU e ONT',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica o papel da ONU ou ONT em uma conexão de fibra óptica.',
    conteudo: `ONU e ONT são equipamentos responsáveis por receber o sinal óptico da rede do provedor e convertê-lo para utilização no ambiente do cliente.

Dependendo da instalação, o equipamento também pode funcionar como roteador Wi-Fi.

Informações como estado da ONU, potência óptica e tempo de conexão podem ajudar no diagnóstico de problemas.`,
  },
  {
    slug: 'o-que-e-olt', titulo: 'O que é OLT',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica o papel da OLT na rede de fibra óptica.',
    conteudo: `OLT é o equipamento localizado na infraestrutura do provedor responsável por concentrar e controlar conexões de fibra óptica de diversos clientes.

Ela se comunica com as ONUs ou ONTs instaladas nos clientes e é uma das principais partes de uma rede GPON.`,
  },
  {
    slug: 'o-que-e-cto', titulo: 'O que é CTO',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica o papel da CTO na distribuição de fibra óptica.',
    conteudo: `CTO significa Caixa de Terminação Óptica.

É um ponto da rede externa utilizado para distribuir fibras até os clientes próximos.

Normalmente a fibra que chega à residência ou empresa do assinante parte de uma CTO existente na região.`,
  },
  {
    slug: 'o-que-e-pppoe', titulo: 'O que é PPPoE',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica o funcionamento básico da autenticação PPPoE.',
    conteudo: `PPPoE é um protocolo frequentemente utilizado por provedores para autenticar o acesso do cliente à internet.

A conexão utiliza credenciais associadas ao contrato do assinante.

O estado da sessão PPPoE pode auxiliar na identificação de situações em que o equipamento está conectado fisicamente, mas não possui uma sessão válida de internet.`,
  },
  {
    slug: 'o-que-e-radius', titulo: 'O que é RADIUS',
    tipo: 'artigo', categoria: 'isp-core',
    resumo: 'Explica o papel do RADIUS na autenticação dos assinantes.',
    conteudo: `RADIUS é um sistema utilizado para autenticação e controle de sessões de acesso.

Em um provedor, ele pode fornecer informações como usuário conectado, endereço IP, início da sessão e estado atual da autenticação.`,
  },

  // ── REDE E CONECTIVIDADE ────────────────────────────────────────
  {
    slug: 'o-que-e-cgnat', titulo: 'O que é CGNAT',
    tipo: 'artigo', categoria: 'rede-conectividade',
    resumo: 'Explica CGNAT de forma adequada para atendimento ao cliente.',
    conteudo: `CGNAT é uma tecnologia utilizada para permitir que vários clientes compartilhem endereços IPv4 públicos.

Para usos comuns, como navegação, streaming e redes sociais, normalmente não existe impacto perceptível.

Algumas aplicações específicas, como determinados servidores, câmeras, jogos ou acessos externos, podem exigir configurações diferentes.

A IA nunca deve prometer IP público ou alteração de CGNAT sem consultar a política e as ferramentas do provedor.`,
  },
  {
    slug: 'ipv4-e-ipv6', titulo: 'IPv4 e IPv6',
    tipo: 'artigo', categoria: 'rede-conectividade',
    resumo: 'Explica de forma simples as diferenças entre IPv4 e IPv6.',
    conteudo: `IPv4 e IPv6 são protocolos utilizados para endereçar dispositivos na internet.

O IPv6 foi criado principalmente para ampliar significativamente a quantidade de endereços disponíveis.

O suporte e a forma de disponibilização de IPv4 ou IPv6 dependem da infraestrutura e das políticas do provedor.`,
  },
  {
    slug: 'o-que-e-dns', titulo: 'O que é DNS',
    tipo: 'artigo', categoria: 'rede-conectividade',
    resumo: 'Explica a função do DNS.',
    conteudo: `DNS é o sistema responsável por transformar nomes de sites, como exemplo.com, em endereços que os equipamentos conseguem localizar na internet.

Problemas de DNS podem fazer com que sites não sejam encontrados mesmo quando existe conectividade.`,
  },
  {
    slug: 'latencia-ping-e-jitter', titulo: 'Latência, ping e jitter',
    tipo: 'artigo', categoria: 'rede-conectividade',
    resumo: 'Explica os conceitos de latência, ping e jitter.',
    conteudo: `Latência representa o tempo necessário para os dados viajarem entre dois pontos da rede.

O ping é uma forma comum de medir esse tempo.

Jitter representa a variação da latência ao longo do tempo.

Valores elevados podem afetar principalmente jogos online, chamadas de voz, videoconferências e outras aplicações em tempo real.`,
  },
  {
    slug: 'perda-de-pacotes', titulo: 'Perda de pacotes',
    tipo: 'artigo', categoria: 'rede-conectividade',
    resumo: 'Explica o que é perda de pacotes e seus possíveis efeitos.',
    conteudo: `Perda de pacotes acontece quando parte dos dados enviados pela rede não chega corretamente ao destino.

Ela pode provocar travamentos, falhas em chamadas, instabilidade em jogos e degradação da experiência de navegação.

A causa precisa ser investigada antes de qualquer conclusão.`,
  },

  // ── WI-FI ───────────────────────────────────────────────────────
  {
    slug: 'wifi-2-4-ghz-x-5-ghz', titulo: 'Wi-Fi 2.4 GHz x 5 GHz',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Explica as diferenças entre as redes Wi-Fi de 2.4 GHz e 5 GHz.',
    conteudo: `A frequência de 2.4 GHz normalmente oferece maior alcance e maior capacidade de atravessar obstáculos, mas possui menor velocidade e maior possibilidade de interferência.

A frequência de 5 GHz normalmente oferece maior velocidade e menor interferência, porém possui alcance menor.

Próximo ao roteador, 5 GHz geralmente é a melhor opção para equipamentos compatíveis. Em locais mais distantes ou separados por diversas paredes, 2.4 GHz pode apresentar melhor alcance.`,
  },
  {
    slug: 'velocidade-contratada-x-velocidade-no-wifi', titulo: 'Velocidade contratada x velocidade no Wi-Fi',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Explica por que a velocidade do plano pode ser diferente da velocidade observada em um dispositivo conectado por Wi-Fi.',
    conteudo: `A velocidade contratada representa a capacidade disponibilizada ao acesso do cliente.

A velocidade observada através do Wi-Fi pode variar de acordo com distância, obstáculos, interferências, frequência utilizada, capacidade do roteador e capacidade do próprio dispositivo.

Um equipamento antigo pode não suportar toda a velocidade disponível no plano.`,
  },
  {
    slug: 'cabo-de-rede-x-wifi', titulo: 'Cabo de rede x Wi-Fi',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Explica as principais diferenças entre conexão cabeada e Wi-Fi.',
    conteudo: `A conexão por cabo normalmente oferece maior estabilidade e menor influência de interferências do ambiente.

O Wi-Fi oferece mobilidade e conveniência, mas seu desempenho pode variar de acordo com distância, obstáculos e interferências.

Testes técnicos de velocidade podem apresentar resultados diferentes dependendo da forma de conexão utilizada.`,
  },
  {
    slug: 'o-que-interfere-no-wifi', titulo: 'O que interfere no Wi-Fi',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Apresenta os principais fatores que podem prejudicar uma rede Wi-Fi.',
    conteudo: `Entre os fatores que podem prejudicar o Wi-Fi estão distância do roteador, paredes, móveis, outros roteadores próximos, dispositivos sem fio, posição inadequada do equipamento e características do aparelho utilizado.

Problemas de alcance Wi-Fi não significam necessariamente que exista problema no link fornecido pelo provedor.`,
  },
  {
    slug: 'onde-posicionar-o-roteador', titulo: 'Onde posicionar o roteador',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Orienta sobre posicionamento adequado de um roteador Wi-Fi.',
    conteudo: `O roteador deve preferencialmente ficar em uma posição central, aberta e elevada.

Evite colocá-lo dentro de armários, atrás de grandes obstáculos ou em locais muito fechados.

Quanto maior a quantidade de paredes e obstáculos entre o dispositivo e o roteador, maior tende a ser a degradação do sinal.`,
  },
  {
    slug: 'quando-utilizar-wifi-mesh', titulo: 'Quando utilizar Wi-Fi Mesh',
    tipo: 'artigo', categoria: 'wifi',
    resumo: 'Explica situações em que uma solução Mesh pode melhorar a cobertura Wi-Fi.',
    conteudo: `Soluções Mesh podem ser indicadas para imóveis grandes, ambientes com muitos cômodos ou situações nas quais um único roteador não consegue oferecer cobertura adequada.

A necessidade de Mesh depende das características físicas do ambiente e não apenas da velocidade contratada.`,
  },

  // ── FIBRA ÓPTICA ────────────────────────────────────────────────
  {
    slug: 'como-funciona-uma-conexao-de-fibra-optica', titulo: 'Como funciona uma conexão de fibra óptica',
    tipo: 'artigo', categoria: 'fibra-optica',
    resumo: 'Explica de maneira simples a utilização de fibra óptica para entrega de internet.',
    conteudo: `A fibra óptica transporta informações utilizando sinais luminosos.

Ela permite alta capacidade de transmissão e grande alcance.

O sinal passa pela infraestrutura óptica do provedor até chegar à ONU ou ONT instalada no cliente.`,
  },
  {
    slug: 'o-que-significa-los-vermelho', titulo: 'O que significa LOS vermelho',
    tipo: 'artigo', categoria: 'fibra-optica',
    resumo: 'Explica o significado da indicação LOS.',
    conteudo: `LOS significa Loss of Signal, ou perda de sinal.

Quando a indicação LOS da ONU está vermelha ou piscando, normalmente significa que o equipamento não está recebendo corretamente o sinal óptico.

Entre as possíveis causas estão rompimento de fibra, desconexão, dobra excessiva ou problema na rede externa.

O cliente nunca deve abrir conectores ópticos ou olhar diretamente para a extremidade da fibra.`,
  },
  {
    slug: 'sinal-optico-da-onu', titulo: 'Sinal óptico da ONU',
    tipo: 'artigo', categoria: 'fibra-optica',
    resumo: 'Explica a utilização da potência óptica no diagnóstico.',
    conteudo: `A potência óptica indica a intensidade do sinal recebido pela ONU através da fibra.

Valores inadequados podem indicar perdas excessivas no enlace e eventualmente provocar instabilidade ou desconexões.

Os limites considerados normais devem seguir os parâmetros definidos pelo provedor e pelos equipamentos utilizados.

Dados atuais sempre devem ser obtidos através das ferramentas de consulta.`,
  },

  // ── SUPORTE TÉCNICO (artigos) ───────────────────────────────────
  {
    slug: 'principais-causas-de-internet-lenta', titulo: 'Principais causas de internet lenta',
    tipo: 'artigo', categoria: 'suporte-tecnico',
    resumo: 'Apresenta causas comuns de percepção de lentidão.',
    conteudo: `Lentidão pode estar relacionada ao Wi-Fi, distância do roteador, interferência, quantidade de dispositivos, limitações do aparelho, serviços externos, problemas de sinal óptico, perda de pacotes ou problemas na conexão.

O atendimento deve diagnosticar antes de determinar a causa.`,
  },
  {
    slug: 'diferenca-entre-problema-de-internet-e-problema-de-wifi', titulo: 'Diferença entre problema de internet e problema de Wi-Fi',
    tipo: 'artigo', categoria: 'suporte-tecnico',
    resumo: 'Ajuda a diferenciar falha de conexão de problema de cobertura Wi-Fi.',
    conteudo: `Um problema de internet significa que existe dificuldade na conectividade entregue ao acesso.

Um problema de Wi-Fi pode ocorrer mesmo quando a conexão do provedor está funcionando normalmente.

É importante avaliar se todos os dispositivos apresentam o problema, se o comportamento muda próximo ao roteador e se equipamentos conectados por cabo também apresentam falha.`,
  },
  {
    slug: 'quedas-frequentes', titulo: 'Quedas frequentes',
    tipo: 'artigo', categoria: 'suporte-tecnico',
    resumo: 'Apresenta possíveis causas de quedas recorrentes.',
    conteudo: `Quedas podem estar relacionadas a problemas ópticos, reinicializações do equipamento, autenticação, infraestrutura externa ou problemas específicos do Wi-Fi.

A análise deve utilizar dados do contrato, manutenção, RADIUS, ONU e histórico sempre que disponíveis.`,
  },

  // ── FAQ ─────────────────────────────────────────────────────────
  {
    slug: 'faq-internet-sem-funcionar', titulo: 'Minha internet está sem funcionar. O que faço?',
    tipo: 'faq', categoria: 'suporte-tecnico',
    resumo: 'Resposta geral para clientes relatando ausência de conexão.',
    conteudo: `O atendimento deve primeiro identificar o cliente e executar o procedimento de ausência de conexão.

A IA não deve concluir a causa sem realizar as verificações disponíveis através das ferramentas.`,
  },
  {
    slug: 'faq-internet-lenta', titulo: 'Minha internet está lenta',
    tipo: 'faq', categoria: 'suporte-tecnico',
    resumo: 'Orientação inicial para relatos de lentidão.',
    conteudo: `Lentidão pode possuir diversas causas.

O atendimento deve identificar se o problema ocorre em todos os dispositivos, por Wi-Fi ou cabo, e utilizar as ferramentas disponíveis para verificar a conexão antes de concluir a origem.`,
  },
  {
    slug: 'faq-wifi-nao-pega-em-todos-os-quartos', titulo: 'O Wi-Fi não pega em todos os quartos',
    tipo: 'faq', categoria: 'wifi',
    resumo: 'Explica limitações naturais de cobertura Wi-Fi.',
    conteudo: `O alcance do Wi-Fi depende da distância, paredes, obstáculos, interferências e características do ambiente.

Casas maiores podem exigir posicionamento diferente do roteador ou uma solução adicional de cobertura, como Mesh.`,
  },
  {
    slug: 'faq-posso-reiniciar-meu-roteador', titulo: 'Posso reiniciar meu roteador?',
    tipo: 'faq', categoria: 'equipamentos',
    resumo: 'Explica a diferença entre reiniciar e restaurar o equipamento.',
    conteudo: `Reiniciar significa desligar e ligar novamente o equipamento.

Restaurar ou resetar pode apagar configurações importantes.

O cliente nunca deve realizar reset de fábrica sem orientação específica do provedor.`,
  },

  // ── FINANCEIRO ──────────────────────────────────────────────────
  {
    slug: 'como-funciona-a-compensacao-de-pagamento', titulo: 'Como funciona a compensação de pagamento',
    tipo: 'artigo', categoria: 'financeiro',
    resumo: 'Explica que pagamentos podem possuir prazos diferentes de confirmação.',
    conteudo: `A confirmação de um pagamento pode depender da forma utilizada e do processamento do sistema financeiro.

A IA nunca deve inventar prazo de compensação.

Quando houver informação específica do provedor ou retorno do ERP, ela deve ser priorizada.`,
  },
  {
    slug: 'faq-segunda-via-de-boleto', titulo: 'Segunda via de boleto',
    tipo: 'faq', categoria: 'financeiro',
    resumo: 'Orienta sobre solicitação de segunda via.',
    conteudo: `Quando o cliente solicitar segunda via, a IA deve identificar corretamente o contrato e utilizar a ferramenta financeira correspondente.

Valores, vencimentos, PIX e linhas digitáveis nunca devem ser obtidos da base de conhecimento.

Devem sempre vir do ERP.`,
  },
  {
    slug: 'politica-promessa-de-pagamento', titulo: 'Promessa de pagamento',
    tipo: 'politica', categoria: 'financeiro', rascunho: true,
    resumo: 'Define as regras adotadas pelo provedor para promessa ou liberação de confiança.',
    conteudo: `- Quando pode ser concedida?
- Quem tem direito?
- Quantas vezes pode ser utilizada?
- Qual o prazo concedido?
- Em que situações NÃO deve ser oferecida?

A IA deve seguir exclusivamente esta política e as validações da ferramenta correspondente.`,
  },

  // ── COMERCIAL ───────────────────────────────────────────────────
  {
    slug: 'como-identificar-a-necessidade-do-cliente', titulo: 'Como identificar a necessidade do cliente',
    tipo: 'argumentacao', categoria: 'comercial',
    resumo: 'Orienta a entender o perfil de uso antes de recomendar um plano.',
    conteudo: `Antes de recomendar um plano, procure compreender naturalmente o perfil do cliente.

Informações úteis incluem quantidade de pessoas, dispositivos, streaming, home office, jogos, tamanho da residência e principais necessidades.

Evite transformar a conversa em um interrogatório.`,
  },
  {
    slug: 'como-identificar-sinais-de-compra', titulo: 'Como identificar sinais de compra',
    tipo: 'argumentacao', categoria: 'comercial',
    resumo: 'Ensina a reconhecer quando o cliente demonstra intenção real de contratar.',
    conteudo: `Perguntas sobre prazo de instalação, documentos, formas de pagamento, disponibilidade no endereço e como iniciar a contratação são sinais importantes de intenção de compra.

Quando houver sinal claro, conduza naturalmente o cliente para consulta de cobertura e contratação.`,
  },
  {
    slug: 'como-conduzir-para-o-fechamento', titulo: 'Como conduzir para o fechamento',
    tipo: 'argumentacao', categoria: 'comercial',
    resumo: 'Orienta como transformar interesse em próximo passo concreto.',
    conteudo: `Depois de identificar necessidade, apresentar uma oferta adequada e tratar eventuais dúvidas, conduza o cliente para uma ação clara.

Exemplos:
- Consultar cobertura.
- Iniciar pré-cadastro.
- Solicitar dados necessários.
- Confirmar interesse.

Evite encerrar uma conversa com intenção de compra sem propor um próximo passo.`,
  },

  // ── OBJEÇÕES COMERCIAIS ─────────────────────────────────────────
  {
    slug: 'objecao-esta-caro', titulo: 'Objeção: "Está caro"',
    tipo: 'argumentacao', categoria: 'objecoes-comerciais',
    resumo: 'Orienta o tratamento da objeção relacionada a preço.',
    conteudo: `Não ofereça desconto imediatamente.

Primeiro procure entender se o cliente está comparando com outro provedor, se possui um orçamento específico ou se ainda não percebeu valor suficiente.

Apresente benefícios relacionados à necessidade identificada.

Nunca invente desconto ou condição comercial.`,
  },
  {
    slug: 'objecao-vou-pensar', titulo: 'Objeção: "Vou pensar"',
    tipo: 'argumentacao', categoria: 'objecoes-comerciais',
    resumo: 'Orienta como reagir quando o cliente diz que precisa pensar.',
    conteudo: `Respeite a decisão do cliente, mas procure entender se existe alguma dúvida ou ponto que ainda impede a decisão.

Uma abordagem possível é perguntar:
"Claro. Ficou alguma dúvida sobre o plano, instalação ou valor que eu possa esclarecer antes?"

Evite pressionar excessivamente.`,
  },
  {
    slug: 'objecao-outro-provedor-e-mais-barato', titulo: 'Objeção: "Outro provedor é mais barato"',
    tipo: 'argumentacao', categoria: 'objecoes-comerciais',
    resumo: 'Orienta comparação com concorrentes sem ataques ou informações inventadas.',
    conteudo: `Não desvalorize ou ataque o concorrente.

Procure entender o que está sendo comparado e destaque os diferenciais reais do serviço oferecido.

Preço, benefícios e condições devem sempre vir das informações oficiais do provedor.`,
  },
  {
    slug: 'objecao-ja-tenho-internet', titulo: 'Objeção: "Já tenho internet"',
    tipo: 'argumentacao', categoria: 'objecoes-comerciais',
    resumo: 'Orienta abordagem para clientes que já possuem outro provedor.',
    conteudo: `Procure entender se o cliente está satisfeito com o serviço atual e se existe alguma necessidade não atendida.

Não force uma troca sem identificar um motivo real que gere valor para o cliente.`,
  },
  {
    slug: 'objecao-so-quero-saber-o-preco', titulo: 'Objeção: "Só quero saber o preço"',
    tipo: 'argumentacao', categoria: 'objecoes-comerciais',
    resumo: 'Orienta como responder de maneira objetiva sem abandonar a oportunidade comercial.',
    conteudo: `Responda objetivamente quando houver preço disponível através das ferramentas.

Em seguida, procure entender brevemente o perfil do cliente para verificar se aquela oferta realmente é adequada.

Nunca esconda preço propositalmente apenas para prolongar a conversa.`,
  },

  // ── POLÍTICAS (esqueletos — nascem em rascunho) ─────────────────
  {
    slug: 'politica-de-fidelidade', titulo: 'Política de fidelidade',
    tipo: 'politica', categoria: 'politicas', rascunho: true,
    resumo: 'Define as regras de fidelidade aplicáveis aos planos.',
    conteudo: `- Existe fidelidade?
- Qual o período?
- Em quais planos?
- Quando começa a contar?
- Como funciona o cancelamento antecipado?
- Existem exceções?
- Como deve ser explicado ao cliente?`,
  },
  {
    slug: 'politica-de-instalacao', titulo: 'Política de instalação',
    tipo: 'politica', categoria: 'instalacao', rascunho: true,
    resumo: 'Define as condições e regras para instalação.',
    conteudo: `- A instalação é gratuita ou paga?
- Existe taxa dependendo do cenário?
- Qual o prazo estimado?
- Que documentos são necessários?
- É preciso um responsável no local?
- Quais as regras para instalação empresarial?
- Quais situações caracterizam inviabilidade?`,
  },
  {
    slug: 'politica-de-mudanca-de-endereco', titulo: 'Política de mudança de endereço',
    tipo: 'politica', categoria: 'politicas', rascunho: true,
    resumo: 'Define como funciona mudança de endereço.',
    conteudo: `- É necessário consultar cobertura?
- Existe taxa?
- Existe novo prazo de fidelidade?
- Os equipamentos permanecem com o cliente?
- Qual o prazo médio?
- O que acontece se não houver cobertura no novo endereço?`,
  },
  {
    slug: 'politica-de-cancelamento', titulo: 'Política de cancelamento',
    tipo: 'politica', categoria: 'politicas', rascunho: true,
    resumo: 'Define as regras de cancelamento.',
    conteudo: `- Quem pode solicitar?
- Que validações são necessárias?
- Que equipamentos devem ser devolvidos?
- Que multas se aplicam?
- Quais os prazos?
- Por quais canais se solicita?
- Como funciona o encerramento financeiro?`,
  },
  {
    slug: 'politica-de-visita-tecnica', titulo: 'Política de visita técnica',
    tipo: 'politica', categoria: 'suporte-tecnico', rascunho: true,
    resumo: 'Define regras de visita técnica.',
    conteudo: `- Quando a visita é indicada?
- Quando pode existir cobrança?
- Qual o prazo?
- Quais os horários disponíveis?
- Quem precisa estar presente?
- Que casos devem ser resolvidos remotamente antes da visita?`,
  },

  // ── PROCEDIMENTOS ───────────────────────────────────────────────
  {
    slug: 'procedimento-sem-conexao', titulo: 'Atendimento — Sem conexão',
    tipo: 'procedimento', categoria: 'suporte-tecnico',
    resumo: 'Define a sequência de diagnóstico para ausência total de internet.',
    conteudo: `1. Identificar cliente e contrato.
2. Verificar situação contratual.
3. Consultar manutenção regional.
4. Consultar sessão PPPoE/RADIUS.
5. Consultar ONU.
6. Avaliar sinal óptico.
7. Realizar procedimentos permitidos.
8. Retestar.
9. Abrir chamado somente quando necessário.
10. Informar claramente o próximo passo.`,
  },
  {
    slug: 'procedimento-internet-lenta', titulo: 'Atendimento — Internet lenta',
    tipo: 'procedimento', categoria: 'suporte-tecnico',
    resumo: 'Define sequência de diagnóstico para lentidão.',
    conteudo: `1. Identificar o cliente.
2. Entender onde ocorre a lentidão.
3. Identificar se é Wi-Fi ou cabo.
4. Consultar manutenção.
5. Verificar conexão.
6. Consultar ONU e sinal.
7. Avaliar fatores de Wi-Fi.
8. Orientar teste adequado.
9. Determinar próxima ação com base nos resultados.`,
  },
  {
    slug: 'procedimento-quedas-frequentes', titulo: 'Atendimento — Quedas frequentes',
    tipo: 'procedimento', categoria: 'suporte-tecnico',
    resumo: 'Define a sequência de análise de instabilidade.',
    conteudo: `1. Identificar contrato.
2. Consultar manutenção.
3. Consultar histórico.
4. Consultar RADIUS.
5. Consultar ONU.
6. Avaliar potência óptica.
7. Identificar recorrência.
8. Realizar procedimentos aplicáveis.
9. Abrir chamado quando houver indicação técnica.`,
  },
  {
    slug: 'procedimento-los-vermelho', titulo: 'Atendimento — LOS vermelho',
    tipo: 'procedimento', categoria: 'suporte-tecnico',
    resumo: 'Define comportamento quando o cliente relata LOS.',
    conteudo: `1. Identificar contrato.
2. Confirmar o relato.
3. Consultar ONU.
4. Consultar manutenção.
5. Verificar possíveis eventos de rede.
6. NÃO orientar manipulação de conectores ópticos.
7. Seguir a política do provedor para abertura de chamado.`,
  },
  {
    slug: 'procedimento-comercial-residencial', titulo: 'Atendimento comercial residencial',
    tipo: 'procedimento', categoria: 'comercial',
    resumo: 'Define o fluxo recomendado para atendimento de novos clientes residenciais.',
    conteudo: `1. Entender necessidade.
2. Solicitar localização/endereço.
3. Consultar cobertura.
4. Compreender perfil de uso.
5. Consultar planos disponíveis.
6. Recomendar opção adequada.
7. Apresentar benefícios.
8. Tratar objeções.
9. Conduzir para fechamento.
10. Coletar dados.
11. Realizar pré-cadastro.
12. Informar próximo passo.`,
  },

  // ── MANUAIS DE EQUIPAMENTO (esqueletos) ─────────────────────────
  {
    slug: 'huawei-x6-10-visao-geral', titulo: 'Huawei X6-10 — Visão geral',
    tipo: 'manual', categoria: 'equipamentos', rascunho: true,
    resumo: 'Características e informações gerais do Huawei X6-10.',
    conteudo: `- Qual a função do equipamento?
- Que padrão de Wi-Fi ele suporta?
- Quais portas possui?
- Quais LEDs possui?
- Características relevantes.
- Limitações conhecidas.
- Situações comuns de suporte.`,
  },
  {
    slug: 'huawei-x6-10-leds', titulo: 'Huawei X6-10 — LEDs',
    tipo: 'manual', categoria: 'equipamentos', rascunho: true,
    resumo: 'Significado das principais luzes indicadoras do equipamento.',
    conteudo: `Descreva o estado normal, piscando e apagado de cada LED:
- Power
- PON
- LOS
- LAN
- Wi-Fi`,
  },
  {
    slug: 'huawei-x6-10-wifi', titulo: 'Huawei X6-10 — Wi-Fi',
    tipo: 'manual', categoria: 'equipamentos', rascunho: true,
    resumo: 'Informações relacionadas às redes Wi-Fi do equipamento.',
    conteudo: `- Rede 2.4 GHz.
- Rede 5 GHz.
- Nome padrão das redes.
- Como alterar a senha.
- Recursos relevantes.
- Limitações.`,
  },
  {
    slug: 'huawei-v5v2-visao-geral', titulo: 'Huawei V5V2 — Visão geral',
    tipo: 'manual', categoria: 'equipamentos', rascunho: true,
    resumo: 'Características e informações gerais do Huawei V5V2.',
    conteudo: `Mesma estrutura do X6-10: função, Wi-Fi suportado, portas, LEDs,
características relevantes, limitações conhecidas e situações comuns de suporte.`,
  },
  {
    slug: 'zyxel-visao-geral', titulo: 'Zyxel — Visão geral',
    tipo: 'manual', categoria: 'equipamentos', rascunho: true,
    resumo: 'Características e informações gerais do equipamento Zyxel utilizado pela empresa.',
    conteudo: `Preencher com o MODELO exato utilizado pela empresa e, a partir dele:
função, Wi-Fi suportado, portas, LEDs, características, limitações e
situações comuns de suporte.`,
  },

  // ── SEGURANÇA E ATENDIMENTO ─────────────────────────────────────
  {
    slug: 'seguranca-fibra-optica', titulo: 'Segurança ao lidar com fibra óptica',
    tipo: 'politica', categoria: 'seguranca',
    resumo: 'Define orientações que a IA nunca deve ultrapassar durante o suporte.',
    conteudo: `O cliente não deve ser orientado a desmontar equipamentos ópticos, abrir conectores de fibra, manipular componentes internos ou olhar diretamente para a extremidade de uma fibra óptica.

Atividades que envolvam rede externa, postes, caixas de distribuição ou instalações elétricas devem ser executadas somente por profissionais autorizados.`,
  },
  {
    slug: 'padrao-de-comunicacao-com-o-cliente', titulo: 'Padrão de comunicação com o cliente',
    tipo: 'politica', categoria: 'atendimento',
    resumo: 'Define o estilo esperado nos atendimentos.',
    conteudo: `- Ser cordial e objetivo.
- Evitar excesso de linguagem técnica.
- Explicar termos quando necessário.
- Não discutir com o cliente.
- Não prometer algo que não esteja confirmado.
- Não inventar informações.
- Evitar respostas excessivamente longas.
- Chamar o cliente pelo nome de forma natural.
- Demonstrar que compreendeu o problema antes de propor solução.`,
  },
];

/**
 * Semeia categorias e artigos. Idempotente por slug: rodar de novo não
 * duplica, e o que o operador editou NÃO é desfeito pelo deploy seguinte.
 *
 * O `status` sai de `rascunho: true` — ver a regra no topo do arquivo.
 */
export async function semearConhecimento(db) {
  if (!await db.schema.hasTable('knowledge_categorias')) return { categorias: 0, artigos: 0, rascunhos: 0 };

  for (const c of CATEGORIAS) {
    await db('knowledge_categorias').insert(c).onConflict('slug').ignore();
  }

  const porSlug = Object.fromEntries(
    (await db('knowledge_categorias').select('id', 'slug')).map(c => [c.slug, c.id]));

  let inseridos = 0, rascunhos = 0;
  for (const a of ARTIGOS) {
    if (await db('knowledge_artigos').where({ slug: a.slug }).first()) continue;
    const status = a.rascunho ? 'rascunho' : 'publicado';
    await db('knowledge_artigos').insert({
      slug: a.slug,
      titulo: a.titulo,
      tipo: a.tipo,
      categoria_id: porSlug[a.categoria] || null,
      resumo: a.resumo,
      conteudo: a.rascunho ? PENDENTE + a.conteudo : a.conteudo,
      status,
      // Publicado direto: o operador é a autoridade editorial e pediu a carga.
      // O que NÃO vai direto é esqueleto — esse fica em rascunho de propósito.
      ...(status === 'publicado' ? { publicado_em: db.fn.now() } : {}),
    });
    inseridos++;
    if (a.rascunho) rascunhos++;
  }

  return { categorias: CATEGORIAS.length, artigos: inseridos, rascunhos };
}
