# /tantric — página de vendas (US$ 9,90)

Site estático de uma página, mobile first, com 3 telas: escolha → confirmação 18+ e carregamento → página de vendas.
Sem build e sem backend. Publicado em `/tantric` (pasta `tantric/` + `vercel.json`).

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | HTML, CSS e JS das 3 telas |
| `config.js` | **Todas as variáveis** (nome, preço, checkout, descritor, pixel, goals, aulas, depoimentos) |
| `assets/` | Imagens (ver abaixo) |
| `../terms`, `../privacy`, `../refund` | Páginas simples `/terms`, `/privacy`, `/refund` com `[PLACEHOLDER: texto fornecido pelo time]` |

## Onde trocar as variáveis (`config.js`)

- **Fase 1 → Fase 2:** troque só `PRODUCT_NAME` (`SQS System` → `The Tantric Lover`) e `CHECKOUT_URL`.
- `CHECKOUT_URL`: aponta para o checkout da Centerpag (`https://go.centerpag.com/PPU38CQHQQD`). Se ficar vazio, todos os botões de compra apenas avisam no console e não redirecionam.
  Os parâmetros da URL de entrada (`utm_*`, `fbclid`, `src`...) são repassados intactos, mais `goal={goal}`.
- `STATEMENT_DESCRIPTOR` e `SUPPORT_EMAIL`: hoje têm **valores de exemplo** (`EXAMPLE*DESCRIPTOR`, `support@example.com`). Troque antes de publicar para tráfego real.
- `COACH_ANCHOR`: `$300+ per session` (valor a confirmar). A economia `You save $290+` é calculada sozinha (COACH_ANCHOR − PRICE).
- `RATING` e `RATING_COUNT`: vazios = a linha de prova do Bloco 1 não aparece. Preencha só com dado real.
- `TESTIMONIALS`: lista vazia = Bloco 7 e o item "Reviews" do menu ficam ocultos. Formato de cada item está comentado no arquivo.
- `PIXEL_ID`: vazio = nenhum evento do Meta Pixel é disparado.
- `GOALS`: os 5 campos que mudam por escolha (`GOAL_NAME`, `HEADLINE`, `SUB_END`, `MOCKUP_CHIP`, `FEATURED_LESSON`). `HEADLINE_HIGHLIGHT` é o trecho da headline que recebe o gradiente.
- `LESSONS`: título e linha das 6 aulas do Bloco 4.

## Imagens (`assets/`)

Basta colocar o arquivo com o nome certo; nenhum código precisa mudar. Enquanto não existir, aparece o placeholder (gradiente vinho → rosa + cadeado).

| Arquivo | Onde aparece | Tamanho |
|---|---|---|
| `hero_mockup.jpg` | Celular da Tela 1 e do Bloco 1 | 4:5, 1080 × 1350 |
| `lesson_1.jpg` … `lesson_6.jpg` | Grade de aulas do Bloco 4 | 16:9, 1280 × 720 |

**Exporte os arquivos já borrados.** Não use blur por CSS: o original ficaria acessível pela URL. O cadeado e o selo 18+ são só camadas visuais.

## Fluxo e links úteis

- Tela 1 (cards) → clique em um card ou em "Skip" → modal 18+ → carregamento (2,5 s) → Tela 3 personalizada.
- Link direto: `/tantric?goal=squirt|multiple|addicted|all` pula os cards, mas mostra o modal 18+ (a menos que já confirmado na sessão).
- Eventos do Meta Pixel (só com `PIXEL_ID`): `PageView` e `ViewContent` (Tela 1), `GoalSelected` (com `goal`), `ViewContent` (Tela 3), `InitiateCheckout` (qualquer CTA, antes do redirecionamento).
- Fora do escopo desta versão (de propósito): contadores de cupons, "pessoas comprando agora" e "Temporarily unavailable". Não há dado real para sustentar isso.
