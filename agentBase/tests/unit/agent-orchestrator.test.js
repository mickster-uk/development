jest.mock('../../lib/ollama-client', () => ({
  callChat: jest.fn(async () => ({
    choices: [{ message: { content: 'mock response' } }]
  }))
}));

const { AgentOrchestrator } = require('../../lib/agent-orchestrator');
const { callChat } = require('../../lib/ollama-client');

describe('AgentOrchestrator', () => {
  const dummyStore = {};
  const dummyCriteria = {};
  const dummyAudit = { recordInvocation: jest.fn() };
  let orchestrator;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestrator = new AgentOrchestrator({ projectStore: dummyStore, criteriaStore: dummyCriteria, auditStore: dummyAudit, config: {} });
  });

  test('executes a project and returns a result', async () => {
    const project = {
      id: 'project-1',
      name: 'Test project',
      canvas: {
        nodes: [
          { id: 'node-1', type: 'agent', label: 'Agent A' },
          { id: 'node-2', type: 'decision', label: 'Decision B' }
        ],
        edges: []
      }
    };

    const result = await orchestrator.executeProject(project, { audit: true });

    expect(result.projectId).toBe('project-1');
    expect(result.status).toBe('success');
    expect(result.nodes).toHaveLength(2);
    expect(result.auditEntry.status).toBe('completed');
  });
});
