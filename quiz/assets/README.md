# V-SPOT Quiz — Assets

Arquivos de mídia do quiz. Lista completa do briefing do Diogo (Slack, 2026-05-07).

## Slots usados em `index.html`

| Slot | Arquivo esperado | Tipo |
|------|-----------------|------|
| `mediaIntro` | `intro.mp4` + `intro-poster.webp` | video (autoplay muted, tap for sound) |
| `mediaResult` | `result.mp4` + `result-poster.webp` | video (muted loop) |
| `mediaPerQuestion[0]` | `q1.webp` | image |
| `mediaPerQuestion[1]` | `q2.webp` | image |
| `mediaPerQuestion[2]` | `q3.webp` | image |
| `mediaPerQuestion[3]` | `q4.webp` | image |
| `mediaPerQuestion[4]` | `q5.webp` | image |
| `mediaPerQuestion[5]` | `q6.webp` | image |
| `mediaPerQuestion[6]` | `q7.webp` | image |

> **Lock performance (Pedro 11h33):** Max 2 vídeos no quiz (Landing + Result). Se Diogo confirmar vídeo numa questão (Q2/Q6 com cena de impacto): max 5s, WebM+MP4 fallback, `preload="none"`, e rodar `perf-audit` antes do launch.

## Fontes do briefing (Diogo, 11h–12h)

Pasta Drive principal: https://drive.google.com/drive/folders/140BEVnQ9d1CCCyMYhOyIM_zQ4FmiMgzK

| Hora | Tipo | Origem | Notas |
|------|------|--------|-------|
| 11:07 | Video | Drive `1dUuHEMw8yTGc9ieGpLlsvJej3OiILDMf` | **cortar 3:32 → 3:44** |
| 11:17 | Video | `The full, edited SQUIRTING Tutorial.mp4` (Miss Fox) | **cortar 3:32 → 3:44** |
| 11:23 | Video | Pornhub `ph5a4253f7bb75f` | **cortar 1:04 → 1:15** (squirting) |
| 11:26 | Video | Pornhub `66e989b7e9ace` | **cortar 4:50 → 5:00** |
| 11:29 | Image | Drive `1_W0nFZRWbnBzgTxLeP1cU2giwRprjUHg` | — |
| 11:38 | Video | Drive `1Rip4WeGEpRuS-i9bWCFXLhjPKVw1DcmC` | — |
| 11:40 | Image | Drive `1Dq48DXcj-wl7jbU7jfZWm30ucf4QUHI3` | — |
| 11:42 | Image | Drive `1AT506rJ453prO2GpvZrIasTwf1HU9GvD` | — |
| 11:59 | Image | Drive `1gN0L638Qi0KMgT2GMyteIiMQIdfS6diZ` | — |

## Mapeamento sugerido (revisar com Diogo)

- `intro.mp4` → corte 3:32–3:44 do video Drive `1dUuHEMw8yTGc9ieGpLlsvJej3OiILDMf` (gancho landing).
- `result.mp4` → Pornhub `ph5a4253f7bb75f` corte 1:04–1:15 (squirting bate com copy do result).
- `q6.mp4` → Pornhub `66e989b7e9ace` corte 4:50–5:00 (Q6 = "scream loud, lose control, squirt all over the bed").
- `q1.webp`–`q5.webp`, `q7.webp` → distribuir as 5 imagens do Drive entre as questões. Sobra 1 imagem se considerarmos `1Rip4WeGEpRuS...` (vídeo) também como fonte alternativa.

## Como baixar

Drive (precisa estar logado em conta com acesso):

```bash
# Manual: abrir cada link, baixar pra esta pasta com nome certo
# OU usar gdown (Python):
pip install gdown
gdown "https://drive.google.com/uc?id=1dUuHEMw8yTGc9ieGpLlsvJej3OiILDMf" -O raw-intro.mp4
# (repetir pra cada ID acima)
```

Pornhub: usar yt-dlp ou similar pra extrair, depois cortar com ffmpeg:

```bash
# Exemplo: corte 1:04 a 1:15 do vídeo já baixado em raw-result.mp4
ffmpeg -ss 00:01:04 -to 00:01:15 -i raw-result.mp4 -c:v libx264 -crf 23 -preset fast -an result.mp4
# -an = sem áudio (Diogo: vídeos auto-play muted; áudio fica em outro arquivo se preciso)
```

## Compressão recomendada (mobile-first)

```bash
# Vídeos: 720p, ~1.5Mbps, mp4 H264 (compatibilidade total iOS/Android)
ffmpeg -i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 26 -preset slow -an output.mp4

# Posters: webp 80% qualidade, max 1200px largura
ffmpeg -ss 00:00:01 -i output.mp4 -vframes 1 -vf scale=1200:-1 -q:v 80 output-poster.webp

# Imagens estáticas: webp <100KB
cwebp -q 80 input.jpg -o output.webp
```

## Status

- [ ] intro.mp4 + intro-poster.webp
- [ ] result.mp4 + result-poster.webp
- [ ] q1.webp
- [ ] q2.webp
- [ ] q3.webp
- [ ] q4.webp
- [ ] q5.webp
- [ ] q6.webp
- [ ] q7.webp

Enquanto não baixarem: `<video>` aponta pra arquivo inexistente → fallback SVG (gradiente) fica visível. Não quebra a página.
