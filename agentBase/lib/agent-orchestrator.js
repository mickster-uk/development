const { callChat } = require('./ollama-client');

class AgentOrchestrator {
  constructor({ projectStore, criteriaStore, auditStore, config }) {
    this.projectStore = projectStore;
    this.criteriaStore = criteriaStore;
    this.auditStore = auditStore;
    this.config = config || {};
  }

  async executeProject(project, options = {}) {
    const runId = `run-${Date.now()}`;
    const auditEntry = {
      id: runId,
      projectId: project.id,
      projectName: project.name,
      status: 'running',
      startedAt: new Date().toISOString(),
      options,
      nodes: [],
      summary: null
    };

    const result = {
      runId,
      projectId: project.id,
      status: 'success',
      startedAt: auditEntry.startedAt,
      finishedAt: null,
      nodes: [],
      auditEntry
    };

    try {
      const nodes = project.canvas?.nodes || [];
      let lastOutput = null;

      for (const node of nodes) {
        const record = {
          id: node.id,
          label: node.label || node.type,
          type: node.type,
          startedAt: new Date().toISOString(),
          status: 'completed',
          request: null,
          response: null,
          details: null
        };

        if (node.type === 'agent' || node.type === 'subagent') {
          const prompt = node.prompt || `Run agent ${node.label || node.id}`;
          const model = node.model || project.settings?.defaultModel || this.config.defaultModel || 'llama3';
          const messages = [
            { role: 'system', content: node.system || 'You are an agent.' },
            { role: 'user', content: prompt }
          ];

          const raw = await callChat(
            project.settings?.endpoint || this.config.endpoint,
            project.settings?.apiKey || this.config.apiKey,
            model,
            messages,
            project.settings?.timeoutMs || this.config.timeoutMs || 60000
          );

          record.request = { model, messages };
          record.response = raw;
          record.details = 'Agent call completed.';
          lastOutput = raw;
        } else if (node.type === 'decision') {
          const expression = node.expression || 'true';
          record.request = { expression, input: lastOutput };
          record.response = String(expression);
          record.details = 'Decision node evaluated as static expression.';
        } else {
          record.request = { nodeType: node.type };
          record.response = lastOutput;
          record.details = 'Node recorded without execution.';
        }

        record.finishedAt = new Date().toISOString();
        result.nodes.push(record);
        auditEntry.nodes.push(record);
      }

      result.finishedAt = new Date().toISOString();
      auditEntry.status = 'completed';
      auditEntry.finishedAt = result.finishedAt;
      auditEntry.summary = `Executed ${result.nodes.length} node(s).`;
    } catch (err) {
      result.status = 'failed';
      result.finishedAt = new Date().toISOString();
      auditEntry.status = 'failed';
      auditEntry.finishedAt = result.finishedAt;
      auditEntry.summary = err.message;
      throw err;
    }

    return result;
  }
}

module.exports = { AgentOrchestrator };
