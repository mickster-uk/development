const SEED_TEMPLATES = [
  {
    id: 'tpl-sceptical-reviewer',
    name: 'Sceptical reviewer',
    question: 'Would a hostile expert sign this off without edits?',
    text: 'Assess the output as a sceptical domain expert reviewing it for publication. It passes only if a hostile reviewer would sign it off without requiring edits: claims are precise, reasoning is shown, and nothing is hand-waved.'
  },
  {
    id: 'tpl-grounded-in-source',
    name: 'Grounded in source',
    question: 'Is every claim traceable to the provided input?',
    text: 'The output passes only if every factual claim it makes is directly traceable to the input it was given. Any claim that introduces outside knowledge, speculation, or invented detail fails.'
  },
  {
    id: 'tpl-scope-guard',
    name: 'Scope guard',
    question: 'Did the agent do only what was asked — nothing extra?',
    text: 'The output passes only if it addresses exactly what was asked: nothing requested is missing, and nothing beyond the request has been added (no unsolicited advice, features, or tangents).'
  },
  {
    id: 'tpl-devils-advocate',
    name: "Devil's advocate",
    question: 'State the strongest argument this output is wrong; is it survivable?',
    text: 'Construct the strongest argument that this output is wrong, incomplete, or misleading. The output passes only if it survives that argument without needing material changes.'
  },
  {
    id: 'tpl-confidence-gate',
    name: 'Confidence gate',
    question: "Would you stake the next step's cost on this being right?",
    text: 'The output passes only if it is reliable enough to act on immediately without human review — you would stake the cost of the next step on it being correct. Hedged, uncertain, or partially-complete outputs fail.'
  },
  {
    id: 'tpl-actionable',
    name: 'Actionable output',
    question: 'Could the next agent act on this without asking anything?',
    text: 'The output passes only if the next step could act on it without asking a single clarifying question: concrete, specific, and complete for its purpose.'
  },
  {
    id: 'tpl-structured',
    name: 'Contains structured data',
    question: 'Is the machine-readable part actually machine-readable?',
    text: 'The output passes only if it contains well-formed structured data (JSON, a table, or a clearly delimited list) that could be parsed programmatically without cleanup.'
  },
  {
    id: 'tpl-no-refusal',
    name: 'No refusal or deflection',
    question: 'Did the agent actually do the work?',
    text: 'The output fails if the agent refused, deflected, apologised instead of answering, asked questions back instead of working, or produced meta-commentary about the task rather than the task itself.'
  }
].map((t) => ({
  schema: 'agentbase/criteria-template@1',
  builtin: true,
  threshold: 7,
  ...t
}));

module.exports = { SEED_TEMPLATES };
