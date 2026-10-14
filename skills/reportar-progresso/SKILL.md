---
name: reportar-progresso
description: Reporta o trabalho delegado na barra e no painel do agents-progress via mcp__agents-progress__progress, e instrui cada subagente a reportar seus próprios passos via mcp__agents-progress__step. Use ao delegar duas ou mais tarefas a subagentes (ferramenta Agent), ao planejar um trabalho delegado em várias etapas, ou quando a pessoa pedir para ver o progresso dos subagentes.
---

# Reportar progresso

O painel de agentes abre sozinho para qualquer subagente e mostra modelo, contexto, custo e tempo sem nenhuma chamada. Estas duas ferramentas acrescentam o plano e o progresso próprio de cada tarefa.

Se uma ferramenta aparece só pelo nome (deferred), carregue-a antes com ToolSearch (`select:mcp__agents-progress__progress,mcp__agents-progress__step`).

## Na sessão que delega

Chame `mcp__agents-progress__progress` nestes momentos. Campos omitidos mantêm o valor anterior.

1. Depois de apresentar o plano, antes da primeira chamada ao Agent: `title` (poucas palavras), `phase: "delegate"`, `tasks` em ordem.
   - O `title` de cada tarefa deve ser idêntico, palavra por palavra, à `description` que você vai passar à ferramenta Agent; é assim que o painel associa uma execução à sua tarefa.
   - `tier` indica o modelo em que a tarefa roda: `fable` = Fable, `heavy` = Opus para trabalho difícil, `careful` = Opus para trabalho delicado, `medium` = Sonnet, `light` = Haiku.
   - `after` lista os números (a partir de 1) das tarefas pelas quais ela espera.
2. A cada resultado de tarefa aceito: `done` com o total aceito até agora.
3. Numa mudança de fase (`plan`, `design`, `delegate`, `review`, `close`) ou num replanejamento: `phase`, ou as novas `tasks`.
4. No fim: `finished: true`.

Um único subagente rápido dispensa tudo isso.

## Em cada briefing entregue a um subagente

Acrescente este parágrafo ao prompt do Agent, para o painel mostrar a barra própria da tarefa em vez do preenchimento de contexto:

> Reporte seu progresso com `mcp__agents-progress__step`: logo depois de ler este briefing, chame-a com `total` (seu plano em 3 a 8 passos) e `done: 0`; chame de novo com o novo `done` e uma `note` curta a cada passo concluído.
