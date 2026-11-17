/* ==========================================================================
   CONFIGURAÇÃO DO SITE /tantric
   Todas as variáveis do briefing (seções 3 e 9) ficam aqui. O HTML nunca
   escreve esses valores direto: ele sempre lê deste arquivo.
   ========================================================================== */
window.SITE_CONFIG = {

  /* ---- Produto / oferta ------------------------------------------------- */
  // Fase 1 (teste): "SQS System"  |  Fase 2: "The Tantric Lover"
  PRODUCT_NAME: "SQS System",
  PRICE: "$9.90",

  // Link do checkout. Fase 1: checkout do SQS System. Fase 2: novo produto.
  // Se ficar vazio, os botões só avisam no console e não redirecionam.
  CHECKOUT_URL: "https://go.centerpag.com/PPU38CQHQQD",

  // TROCAR: descritor da fatura (o time fornece). Valor abaixo é só exemplo.
  STATEMENT_DESCRIPTOR: "EXAMPLE*DESCRIPTOR",

  // Âncora de preço do coach. Valor a confirmar antes de publicar.
  // A economia (SAVINGS) é calculada: número daqui menos PRICE, mantendo o "+".
  COACH_ANCHOR: "$300+ per session",

  // TROCAR: e-mail de suporte (o time fornece). Valor abaixo é só exemplo.
  SUPPORT_EMAIL: "support@example.com",

  /* ---- Prova social (só aparece com dado real) --------------------------- */
  // Se RATING e RATING_COUNT estiverem vazios, a linha de prova não aparece.
  RATING: "",
  RATING_COUNT: "",

  // Lista vazia = bloco 7 (Reviews) e item "Reviews" do menu ficam ocultos.
  // Formato de cada item:
  // { name: "John D.", age: 41, state: "Texas", text: "...",
  //   badge: "💦 First squirt", date: "Nov 2026" }
  TESTIMONIALS: [],

  /* ---- Fluxo ------------------------------------------------------------- */
  // true  = abre direto na página de vendas (Tela 3), sem escolha, sem 18+ e sem carregamento.
  //         Usa goal = all, ou o goal de ?goal=squirt|multiple|addicted|all se vier na URL.
  // false = fluxo completo do briefing (Tela 1 → Tela 2 → Tela 3).
  SKIP_GATE: true,

  /* ---- Rastreamento ------------------------------------------------------ */
  // Meta Pixel. Se vazio, nenhum evento é disparado.
  PIXEL_ID: "",

  /* ---- Variações por escolha (seção 9) ----------------------------------- */
  // HEADLINE_HIGHLIGHT: trecho da headline que recebe o gradiente.
  GOALS: {
    squirt: {
      GOAL_NAME: "Her First Squirting Orgasm",
      HEADLINE: "Ready to give her the first squirting orgasm of her life?",
      HEADLINE_HIGHLIGHT: "squirting orgasm",
      SUB_END: "She'll shake, gush and beg you not to stop.",
      MOCKUP_CHIP: "💦 She squirted, Lesson 3",
      FEATURED_LESSON: "Lesson 3 (The G-Spot Gush)"
    },
    multiple: {
      GOAL_NAME: "Multiple Orgasms",
      HEADLINE: "Ready to make her come again… and again… and again?",
      HEADLINE_HIGHLIGHT: "come again",
      SUB_END: "She'll lose count, and her legs won't stop shaking.",
      MOCKUP_CHIP: "🌊 Orgasm after orgasm",
      FEATURED_LESSON: "Lesson 4 (The Orgasm Wave)"
    },
    addicted: {
      GOAL_NAME: "Make Her Addicted",
      HEADLINE: "Ready to become the man she can't stop craving?",
      HEADLINE_HIGHLIGHT: "craving",
      SUB_END: "She'll think about your hands all day and text you first.",
      MOCKUP_CHIP: "📲 \"Come home now\" ❤️",
      FEATURED_LESSON: "Lesson 5 (The Yoni Massage)"
    },
    all: {
      GOAL_NAME: "The Complete Method",
      HEADLINE: "Ready to be the best she's ever had?",
      HEADLINE_HIGHLIGHT: "best",
      SUB_END: "She'll shake, gush and beg you for more.",
      MOCKUP_CHIP: "💦 First squirt, Lesson 3",
      FEATURED_LESSON: "" // nenhum card destacado
    }
  },

  /* ---- Aulas do Bloco 4 (imagens: /tantric/assets/lesson_N.jpg) ----------- */
  LESSONS: [
    { title: "The Tantric Opening",    line: "Warm her up until she's begging for your touch." },
    { title: "Full-Body Awakening",    line: "Wake up every inch of her body." },
    { title: "The G-Spot Gush",        line: "The stroke that makes her squirt." },
    { title: "The Orgasm Wave",        line: "One orgasm into the next, and the next." },
    { title: "The Yoni Massage",       line: "The sacred massage that drives her wild." },
    { title: "Edge Her Crazy",         line: "Keep her on the edge, then let her explode." }
  ]
};
