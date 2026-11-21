# /vsl — aula privada (vídeo + comentários)

Página única, mobile-first, HTML/CSS/JS puro. Dois blocos: vídeo (VTurb) e comentários, com barra superior de retenção e fundo em movimento.

## Variáveis (topo do `<script>` em `index.html`, objeto `CONFIG`)

| Variável | O que faz |
|---|---|
| `TRICK_START` | Segundo exato em que a demonstração começa (hoje `325` = 5:25). **Se o vídeo for editado, atualize.** |
| `TRICK_END` | Segundo em que a demonstração termina (hoje `505`, **confirmar**). Depois dele a barra volta para "Acesso privado · Conteúdo +18". |
| `VIDEO_DURATION` | Duração do vídeo (fallback até o player informar). |
| `TITLE` | Título em serifada (a opção B está comentada ao lado). |
| `COMMENTS_ENDPOINT` | Opcional: URL que recebe os envios (POST JSON) para moderação. Vazio = o envio só fica no navegador de quem enviou, marcado "Em análise". |
| `BG_VIDEO` / `BG_POSTER` | Opcional: vídeo de fundo (desktop, mudo, loop, ≤ 1,5 MB) e imagem poster (WebP). No celular nunca carrega vídeo. |

## Comentários (`comments.json`)

Só entram comentários **reais e autorizados**. O arquivo começa vazio (`[]`) e a página mostra o campo de envio e "Seja o primeiro a comentar".

```json
[
  {
    "id": "c1",
    "name": "Carlos M.",
    "avatar": "",
    "text": "texto real do cliente",
    "date": "2026-11-20T21:10:00-03:00",
    "likes": 0,
    "authorized": true,
    "source": "whatsapp",
    "replies": [
      { "id": "c1r1", "name": "Equipe", "team": true, "text": "…", "date": "2026-11-21T09:00:00-03:00", "likes": 0, "authorized": true }
    ]
  }
]
```

- `authorized: true` é obrigatório; sem isso o comentário não aparece. Guarde a autorização de uso fora do repositório.
- O contador "Comentários (N)" é calculado a partir do arquivo (comentários + respostas).
- Curtidas dos visitantes ficam só no navegador de cada um; o número exibido é o do arquivo.

## Barra superior

Usa o evento `video:timeupdate` do player VTurb. Estados: antes de `TRICK_START` (com "faltam m:ss"), de `TRICK_START` a `TRICK_END` ("O truque está sendo mostrado agora") e depois.
