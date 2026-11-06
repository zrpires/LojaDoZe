# Curadoria.IA — Boas escolhas para sua rotina.

Uma loja simples, com uma ajuda inteligente para encontrar o que faz sentido para você.

MVP funcional independente, com interface em português, servidor Python e SQLite. Sem dependências Python externas. Requer Python 3.11+ e navegador atualizado.

## Executar

```bash
git clone https://github.com/zrpires/ecommerce-com-ia.git
cd ecommerce-com-ia
python3 server.py
```

Abra http://localhost:8000. No Windows, use `python` se necessário. Para executar os três simultaneamente, use portas diferentes: `PORT=8001 python3 server.py` (Linux/macOS) ou `$env:PORT="8001"; python server.py` (PowerShell).

## Funcionalidades

- Catálogo pesquisável com seis produtos e estoque persistido.
- Carrinho local, remoção de unidades e cálculo em centavos.
- Checkout demonstrativo transacional: valida estoque e calcula preços no servidor.
- Consultor de compras com contexto do catálogo.

## Ativar a IA real

Sem chave, o aplicativo identifica o **modo demonstrativo** e fornece respostas fixas, sem consulta a um modelo. Para respostas personalizadas, configure uma chave da API OpenAI, com saldo e acesso ao modelo. A chave fica somente no servidor.

Linux/macOS:

```bash
read -s -p "Chave OpenAI: " OPENAI_API_KEY; echo
export OPENAI_API_KEY
export OPENAI_MODEL=gpt-4.1-mini
python3 server.py
```

PowerShell:

```powershell
$secret = Read-Host "Chave OpenAI" -AsSecureString
$env:OPENAI_API_KEY = [System.Net.NetworkCredential]::new('', $secret).Password
$env:OPENAI_MODEL = "gpt-4.1-mini"
python server.py
```

`.env.example` documenta a configuração; arquivos `.env` não são carregados automaticamente. Nunca faça commit da chave. Chamadas à API podem gerar custos. O chat envia sua mensagem e o contexto atual do aplicativo à OpenAI; não envie dados sensíveis. Cada mensagem é independente, sem memória de conversas anteriores.

## Dados e limites

O servidor escuta apenas em `127.0.0.1`. Esta versão é para uso local, individual, sem autenticação. Não a exponha à internet sem implementar autenticação, HTTPS, limites de requisições e política de privacidade. SQLite é criado automaticamente em `data.sqlite3`; faça backup para conservar os dados. O arquivo é ignorado pelo Git. Use `DATABASE_PATH` para outro caminho. A interface funciona sem fontes externas; fontes do Google são opcionais.

O checkout não processa pagamentos, frete ou emissão fiscal. Preços e estoque são ilustrativos. O histórico de pedidos é persistido no banco, mas ainda não há painel administrativo.

## Testar

```bash
python3 -m unittest discover -s tests -v
node --check static/app.js
```

Os testes usam banco temporário e não exigem chave de IA. O GitHub Actions executa os mesmos testes a cada push e pull request.

## Estrutura

- `server.py`: API HTTP, persistência e integração OpenAI via biblioteca padrão.
- `static/`: interface HTML, CSS e JavaScript sem etapa de build.
- `project.json`: identidade e configuração da aplicação.
- `tests/`: testes de regras de negócio, API e isolamento de dados.

## Próximos passos para produção

Adicionar autenticação e usuários, monitoramento, testes de navegador e implantação com HTTPS. Integrar um provedor de pagamentos com webhooks e tratamento de estornos antes de vender.
