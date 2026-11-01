---
name: reportar-progresso
description: Reporta à barra e ao painel do agents-progress o plano e o aceite de todo trabalho delegado, via mcp__agents-progress__progress. Use quando for chamar a ferramenta Agent, sempre, para um ou vários subagentes, e quando a pessoa pedir o progresso dos subagentes.
user-invocable: false
---

# Reportar progresso

O painel de agentes abre sozinho para qualquer subagente e mostra modelo, contexto, custo e tempo. O mod também acrescenta ao prompt de cada subagente o pedido para reportar os próprios passos (`mcp__agents-progress__step`), então escreva o prompt do Agent normalmente. O que só você sabe, e esta skill reporta, é o **plano** e o **aceite**.

Se `mcp__agents-progress__progress` aparece só pelo nome (deferred), carregue-a antes com ToolSearch (`select:mcp__agents-progress__progress`).

## Na sessão que delega

Chame `mcp__agents-progress__progress` nestes momentos. Campos omitidos mantêm o valor anterior.

1. Antes da primeira chamada ao Agent, já com o plano: `title` (poucas palavras), `phase: "delegate"`, `tasks` em ordem. Um único subagente é um plano de uma tarefa.
   - O `title` de cada tarefa é idêntico, palavra por palavra, à `description` que você vai passar à ferramenta Agent; é assim que o painel associa uma execução à sua tarefa.
   - `tier` indica o modelo em que a tarefa roda: `fable` = Fable, `heavy` = Opus para trabalho difícil, `careful` = Opus para trabalho delicado, `medium` = Sonnet, `light` = Haiku.
   - Não passe `effort` à ferramenta Agent. O mod roda em xhigh as tarefas `heavy`, a menos que a pessoa desligue a opção `heavyEffort` em `/config`, e as outras seguem o esforço que o Claude Code escolhe.
   - `after` lista os números (a partir de 1) das tarefas pelas quais ela espera.
2. A cada resultado de tarefa aceito: `done` com o total aceito até agora.
3. Numa mudança de fase (`plan`, `design`, `delegate`, `review`, `close`) ou num replanejamento: `phase`, ou as novas `tasks`.
4. No fim, com todos os resultados aceitos: `finished: true`.

## Com `stepBrief: off`

Se a pessoa desligou essa opção do mod em `/config`, os prompts seguem como escritos. Acrescente então a cada prompt do Agent:

> Reporte seu progresso com `mcp__agents-progress__step`: logo depois de ler este briefing, chame-a com `total` (seu plano em 3 a 8 passos) e `done: 0`; chame de novo com o novo `done` e uma `note` curta a cada passo concluído.
