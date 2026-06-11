'use strict';

function normalizeEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') {
    return 'http://localhost:11434/v1';
  }
  return endpoint.trim().replace(/\/+$/, '');
}

function isChatModel(model) {
  return typeof model === 'string' && !/(embed|embedding|text-embedding)/i.test(model);
}

function normalizeModelList(parsed) {
  const normalize = (entries, selector) => entries
    .map((entry) => selector(entry) || String(entry))
    .filter(Boolean);

  const result = Array.isArray(parsed)
    ? normalize(parsed, (entry) => entry.name || entry.id)
    : Array.isArray(parsed.models)
      ? normalize(parsed.models, (entry) => entry.name || entry.id)
      : Array.isArray(parsed.data)
        ? normalize(parsed.data, (entry) => entry.id || entry.name)
        : normalize(Object.keys(parsed), (entry) => entry);

  const chatModels = result.filter(isChatModel);
  return chatModels.length ? chatModels : result;
}

function parseTemplateMarkdown(content) {
  const useCaseMatch = content.match(/##\s*Use case\s*\n([\s\S]*?)(?:\n##|$)/i);
  const questionsMatch = content.match(/##\s*Qualifying questions\s*\n([\s\S]*?)(?:\n##|$)/i);
  const nameMatch = content.match(/^# (.+)$/m);
  const description = useCaseMatch ? useCaseMatch[1].trim().split('\n')[0] : '';
  const questions = questionsMatch ? questionsMatch[1].trim().split(/\r?\n/).filter(Boolean) : [];
  return {
    title: nameMatch ? nameMatch[1].trim() : null,
    useCase: description,
    questions
  };
}

module.exports = { normalizeEndpoint, isChatModel, normalizeModelList, parseTemplateMarkdown };
