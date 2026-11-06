# Validação — 6 de novembro de 2026

- `npm ci`: passou.
- `npm run check`: passou.
- `npm test`: 12 testes passaram, sem testes ignorados, em Node.js 22.
- Navegador Chromium: fluxo principal passou em 1366×900 e 390×844, sem erro JavaScript ou rolagem horizontal.
- Fontes externas bloqueadas durante a validação de navegador: interface continua utilizável com fontes locais.
- Catálogo, busca, carrinho preservado ao recarregar, remoção e checkout demonstrativo verificados no navegador. Integração Stripe, valores no servidor, idempotência e confirmação do pagamento testados com respostas simuladas.

## Dependências da instalação final

O deploy na conta Vercel do proprietário ainda não foi executado. Não foram usadas chaves reais OpenAI/Stripe nem realizadas cobranças. A integração OpenAI foi testada com respostas simuladas. O microfone depende da permissão, do navegador e do dispositivo final; o teste em navegador automatizado validou o chat por texto. Siga o README para configurar as variáveis e fazer a validação final no domínio publicado.

A interface de acesso protegido à IA também foi verificada no navegador, com resposta simulada e envio da senha no cabeçalho Authorization.
Retornos de pagamento pendente e confirmado foram verificados no navegador com respostas simuladas, incluindo a limpeza dos parâmetros da URL após a consulta.
