# LojaDoZe

Aplicativo web independente pronto para importação na Vercel. Interface em português, arquivos estáticos em `public/` e funções Node.js em `api/`. Não usa Python, SQLite ou disco persistente no servidor.

## Publicar na Vercel

1. Abra [New Project](https://vercel.com/new) e importe `zrpires/LojaDoZe`.
2. **Root Directory:** raiz do repositório. **Framework Preset:** Other. **Node.js:** 22.x.
3. Mantenha **Build Command desativado/vazio**. **Output Directory:** `public` (já definido em `vercel.json`). Instalação: `npm ci` (ou padrão da Vercel).
4. Clique em Deploy. O aplicativo já abre e suas funções locais ficam utilizáveis, sem chave de IA.
5. Para IA generativa, configure as variáveis abaixo em Settings → Environment Variables e faça **Redeploy**. Configure separadamente em Production e Preview se usar ambos.

Não há etapa de build ou servidor que precise permanecer rodando. As rotas `/api/*` usam Vercel Functions. Não faça upload apenas da pasta `public`: importe o repositório inteiro para incluir as funções.

## Funcionalidades

- Catálogo público, pesquisa e carrinho persistido neste navegador.
- Recomendação local por orçamento/categoria, ou IA generativa opcional.
- Checkout Stripe hospedado, com valores calculados no servidor e idempotência.
- Retorno do pagamento conferido no servidor; cancelamento preserva o carrinho.

## IA generativa opcional

| Variável | Uso |
| --- | --- |
| `OPENAI_API_KEY` | Sua chave OpenAI com saldo/acesso à API |
| `OPENAI_MODEL` | Modelo disponível na sua conta; padrão `gpt-4.1-mini` |
| `APP_PASSWORD` | Senha forte para liberar chamadas pagas de IA |

**Sem chave:** a interface mostra “Assistente local · sem IA generativa” e responde por regras locais. Não finge ser um modelo. **Com chave:** `APP_PASSWORD` é obrigatório para evitar expor uma API paga sem controle de acesso. Digite essa senha na seção “Acesso à IA” do aplicativo; ela fica em `sessionStorage` nesta aba. Não a publique no código, não use prefixo `NEXT_PUBLIC_` e não compartilhe uma senha pessoal reutilizada. Se alguém já souber a senha, poderá usar sua API; troque a variável e faça Redeploy para revogar o acesso. Para uso público em escala, implemente contas e limites de consumo por usuário. A senha protege o uso pago da IA; não é um sistema de usuários ou proteção dos arquivos públicos.

A chave OpenAI nunca vai para o navegador. As chamadas podem gerar custos. Configure limites de gasto na conta OpenAI. O provedor aplica suas próprias políticas de dados. Erros de saldo, chave, conexão e modelo aparecem na tela sem revelar segredos.

## Ativar pagamentos reais

1. Antes de vender, edite `lib/config.js` com seus produtos reais, preços em **centavos**, descrição e condições de entrega. O catálogo inicial é ilustrativo.
2. Configure `STRIPE_SECRET_KEY` na Vercel. Comece com uma chave de teste (`sk_test_…`).
3. Configure `APP_URL=https://SEU-DOMINIO.vercel.app` com o domínio definitivo, sem caminhos ou parâmetros, e faça Redeploy.
4. Faça uma compra de teste usando os cartões de teste oficiais do Stripe (por exemplo, 4242 4242 4242 4242, validade futura e CVC de teste). Nunca use cartão real no modo teste.
5. Confirme no Dashboard Stripe que produto, valor, endereço e status estão corretos. Só depois configure sua chave de produção.

Sem Stripe, o checkout é explicitamente uma **simulação**, sem pedido comercial, cobrança ou reserva. As chaves ficam somente no servidor. O cliente nunca define o preço de cobrança.

O pagamento ocorre no Stripe. Os pedidos, contatos, endereços e recibos ficam no Dashboard Stripe; não há banco local nem painel administrativo separado. O atendimento e a entrega são manuais, pelo lojista. O catálogo não controla estoque: use apenas produtos com disponibilidade garantida. Não existe cálculo automático de frete, emissão fiscal, webhooks de fulfillment ou estornos pelo aplicativo. Defina preço/entrega na sua operação e informe condições, contato e políticas antes de disponibilizar a loja para compradores. Não adicione serviços com estoque limitado sem implementar uma reserva persistente de estoque.

O retorno `?checkout=success` sozinho **não** confirma pagamento. O servidor consulta a sessão Stripe e só marca pago com `payment_status=paid` e `status=complete`. Fechar a aba não perde um pagamento: o registro continua no Stripe. Para métodos assíncronos, verifique o Dashboard; não há monitoramento em segundo plano nesta versão.

## Executar no computador

Requer **Node.js 22.x** e npm. Sem dependências externas em runtime.

```bash
git clone https://github.com/zrpires/LojaDoZe.git
cd LojaDoZe
npm ci
cp .env.example .env
npm run dev
```

Abra http://localhost:3000. No Windows, copie `.env.example` para `.env` pelo Explorer ou `Copy-Item .env.example .env` no PowerShell. Edite `.env` para configurar serviços opcionais. Nunca faça commit dele. Para rodar mais de um projeto, use `PORT` diferente em cada `.env`.

## Verificação

```bash
npm run check
npm test
```

Testes de rotas HTTP, validação, modo local, autenticação, falhas de provedores e integração simulada com OpenAI e Stripe, incluindo preços e confirmação do pagamento. O GitHub Actions executa os testes a cada push/pull request. Testes simulados não substituem uma compra de teste na sua conta nem o teste do microfone no seu dispositivo.

## Estrutura

- `public/`: interface e estado do navegador.
- `api/`: funções serverless.
- `lib/`: regras, segurança e integração com serviços.
- `dev.mjs`: servidor apenas para desenvolvimento local.
- `vercel.json`: configuração de deploy e cabeçalhos de segurança.
- `.env.example`: variáveis disponíveis, sem credenciais.

As respostas de API usam `no-store`. Requisições de outra origem são recusadas, entradas e tamanhos são validados e as saídas da interface usam texto seguro. O deploy final, chaves reais, compatibilidade de voz e operação comercial precisam ser validados no seu domínio e nas suas contas.
