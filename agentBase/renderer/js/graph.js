const GRAPH_NODE_WIDTH = 220;
const GRAPH_NODE_HEIGHT = 110;

let state = {
  project: null,
  selectedNodeId: null,
  draggingNodeId: null,
  dragOffset: { x: 0, y: 0 },
  linking: null,
  projectChanged: null
};

function initializeGraph(canvasEl, inspectorEl, onProjectChanged) {
  state.canvasEl = canvasEl;
  state.inspectorEl = inspectorEl;
  state.svgEl = canvasEl.querySelector('.graph-svg');
  state.nodeLayer = canvasEl.querySelector('.node-layer');
  state.projectChanged = onProjectChanged;

  canvasEl.addEventListener('click', (event) => {
    if (event.target === canvasEl || event.target === state.svgEl) {
      selectNode(null);
    }
  });

  window.addEventListener('pointermove', handleLinkDrag);
  window.addEventListener('pointerup', handleLinkEnd);
}

function setProject(project) {
  state.project = project;
  if (!state.project.canvas) {
    state.project.canvas = { nodes: [], edges: [] };
  }
  state.selectedNodeId = null;
  renderGraph();
  renderInspector();
}

function renderGraph() {
  state.nodeLayer.innerHTML = '';
  state.svgEl.innerHTML = '';

  if (!state.project || !state.project.canvas) {
    return;
  }

  state.project.canvas.edges?.forEach((edge) => {
    const fromNode = findNode(edge.from);
    const toNode = findNode(edge.to);
    if (!fromNode || !toNode) {
      return;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', edgePath(fromNode, toNode));
    path.setAttribute('stroke', '#5e9cff');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('marker-end', 'url(#arrowhead)');
    path.classList.add('edge-line');
    state.svgEl.appendChild(path);
  });

  if (!state.svgEl.querySelector('#arrowhead')) {
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'arrowhead');
    marker.setAttribute('markerWidth', '8');
    marker.setAttribute('markerHeight', '8');
    marker.setAttribute('refX', '7');
    marker.setAttribute('refY', '4');
    marker.setAttribute('orient', 'auto');
    const triangle = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    triangle.setAttribute('d', 'M0,0 L8,4 L0,8 Z');
    triangle.setAttribute('fill', '#5e9cff');
    marker.appendChild(triangle);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.appendChild(marker);
    state.svgEl.appendChild(defs);
  }

  state.project.canvas.nodes?.forEach((node) => {
    const nodeEl = createNodeElement(node);
    state.nodeLayer.appendChild(nodeEl);
  });

  drawLinkPreview();
}

function createNodeElement(node) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'node-card';
  if (node.id === state.selectedNodeId) {
    nodeEl.classList.add('selected');
  }
  nodeEl.style.left = `${node.x}px`;
  nodeEl.style.top = `${node.y}px`;
  nodeEl.dataset.nodeId = node.id;

  const title = document.createElement('div');
  title.className = 'node-title';
  title.textContent = node.label || `${node.type}`;
  nodeEl.appendChild(title);

  const typeLabel = document.createElement('div');
  typeLabel.className = 'node-subtitle';
  typeLabel.textContent = node.type;
  nodeEl.appendChild(typeLabel);

  const portRow = document.createElement('div');
  portRow.className = 'node-port-row';

  const sourcePort = document.createElement('span');
  sourcePort.className = 'node-port node-port-source';
  sourcePort.title = 'Drag from here to connect';
  sourcePort.addEventListener('pointerdown', (event) => handleLinkStart(event, node.id));

  const targetPort = document.createElement('span');
  targetPort.className = 'node-port node-port-target';
  targetPort.title = 'Drop here to connect';
  targetPort.addEventListener('pointerup', (event) => handleLinkDrop(event, node.id));

  portRow.appendChild(sourcePort);
  portRow.appendChild(targetPort);
  nodeEl.appendChild(portRow);

  nodeEl.addEventListener('pointerdown', (event) => handleNodeDragStart(event, node.id));
  nodeEl.addEventListener('click', (event) => {
    event.stopPropagation();
    selectNode(node.id);
  });

  return nodeEl;
}

function handleNodeDragStart(event, nodeId) {
  if (event.target.closest('.node-port')) {
    return;
  }
  state.draggingNodeId = nodeId;
  const node = findNode(nodeId);
  const rect = event.currentTarget.getBoundingClientRect();
  state.dragOffset = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
  window.addEventListener('pointermove', handleNodeDragMove);
  window.addEventListener('pointerup', handleNodeDragEnd);
}

function handleNodeDragMove(event) {
  if (!state.draggingNodeId) {
    return;
  }
  const node = findNode(state.draggingNodeId);
  if (!node) {
    return;
  }
  const canvasRect = state.canvasEl.getBoundingClientRect();
  node.x = Math.max(8, Math.min(canvasRect.width - GRAPH_NODE_WIDTH - 8, event.clientX - canvasRect.left - state.dragOffset.x));
  node.y = Math.max(8, Math.min(canvasRect.height - GRAPH_NODE_HEIGHT - 8, event.clientY - canvasRect.top - state.dragOffset.y));
  renderGraph();
}

function handleNodeDragEnd() {
  state.draggingNodeId = null;
  window.removeEventListener('pointermove', handleNodeDragMove);
  window.removeEventListener('pointerup', handleNodeDragEnd);
  notifyProjectChanged();
}

function handleLinkStart(event, nodeId) {
  event.stopPropagation();
  const nodeEl = event.currentTarget.closest('.node-card');
  const rect = nodeEl.getBoundingClientRect();
  state.linking = {
    source: nodeId,
    startX: rect.left + rect.width,
    startY: rect.top + rect.height / 2
  };
  drawLinkPreview(event.clientX, event.clientY);
}

function handleLinkDrag(event) {
  if (!state.linking) {
    return;
  }
  drawLinkPreview(event.clientX, event.clientY);
}

function handleLinkDrop(event, targetNodeId) {
  if (!state.linking) {
    return;
  }
  event.stopPropagation();
  const sourceId = state.linking.source;
  if (sourceId && sourceId !== targetNodeId) {
    addEdge(sourceId, targetNodeId);
  }
  state.linking = null;
  renderGraph();
  notifyProjectChanged();
}

function handleLinkEnd() {
  state.linking = null;
  renderGraph();
}

function drawLinkPreview(mouseX, mouseY) {
  const existing = state.svgEl.querySelector('.preview-line');
  if (existing) {
    existing.remove();
  }
  if (!state.linking) {
    return;
  }
  const sourceNode = findNode(state.linking.source);
  if (!sourceNode) {
    return;
  }
  const from = getPortCoordinates(sourceNode, 'source');
  const to = {
    x: mouseX - state.canvasEl.getBoundingClientRect().left,
    y: mouseY - state.canvasEl.getBoundingClientRect().top
  };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M${from.x} ${from.y} C${from.x + 80} ${from.y}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`);
  path.setAttribute('stroke', '#6ddbff');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.classList.add('preview-line');
  state.svgEl.appendChild(path);
}

function getPortCoordinates(node, type) {
  const x = node.x + (type === 'source' ? GRAPH_NODE_WIDTH : 0);
  const y = node.y + GRAPH_NODE_HEIGHT / 2;
  return { x, y };
}

function edgePath(fromNode, toNode) {
  const from = getPortCoordinates(fromNode, 'source');
  const to = getPortCoordinates(toNode, 'target');
  return `M${from.x} ${from.y} C${from.x + 80} ${from.y}, ${to.x - 80} ${to.y}, ${to.x} ${to.y}`;
}

function selectNode(nodeId) {
  state.selectedNodeId = nodeId;
  renderGraph();
  renderInspector();
}

function renderInspector() {
  if (!state.inspectorEl) {
    return;
  }

  if (!state.project) {
    state.inspectorEl.innerHTML = '<p>No project selected.</p>';
    return;
  }

  const node = state.project.canvas.nodes.find((item) => item.id === state.selectedNodeId);
  if (!node) {
    state.inspectorEl.innerHTML = `
      <div>
        <h3>${state.project.name}</h3>
        <p>${state.project.description || 'No description provided.'}</p>
        <p><strong>Nodes:</strong> ${state.project.canvas.nodes.length}</p>
        <p><strong>Edges:</strong> ${state.project.canvas.edges.length}</p>
      </div>
    `;
    return;
  }

  state.inspectorEl.innerHTML = '';
  const title = document.createElement('h3');
  title.textContent = node.label || node.type;
  const typeLine = document.createElement('p');
  typeLine.textContent = `Type: ${node.type}`;
  typeLine.className = 'inspector-meta';

  const labelField = createField('Label', node.label || '', (value) => updateNode(node.id, { label: value }));
  const modelField = createField('Model', node.model || state.project.settings.defaultModel || 'llama3', (value) => updateNode(node.id, { model: value }));
  const promptField = createTextArea('Prompt', node.prompt || '', (value) => updateNode(node.id, { prompt: value }));
  const expressionField = createTextArea('Expression', node.expression || '', (value) => updateNode(node.id, { expression: value }));

  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete node';
  deleteButton.addEventListener('click', () => {
    removeNode(node.id);
  });

  state.inspectorEl.appendChild(title);
  state.inspectorEl.appendChild(typeLine);
  state.inspectorEl.appendChild(labelField);
  if (node.type === 'agent' || node.type === 'subagent') {
    state.inspectorEl.appendChild(modelField);
    state.inspectorEl.appendChild(promptField);
  }
  if (node.type === 'decision') {
    state.inspectorEl.appendChild(expressionField);
  }
  state.inspectorEl.appendChild(deleteButton);
}

function createField(labelText, value, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'inspector-field';
  const label = document.createElement('label');
  label.textContent = labelText;
  const input = document.createElement('input');
  input.value = value;
  input.addEventListener('input', (event) => onChange(event.target.value));
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function createTextArea(labelText, value, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'inspector-field';
  const label = document.createElement('label');
  label.textContent = labelText;
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.rows = 4;
  textarea.addEventListener('input', (event) => onChange(event.target.value));
  wrapper.appendChild(label);
  wrapper.appendChild(textarea);
  return wrapper;
}

function updateNode(nodeId, patch) {
  const node = findNode(nodeId);
  if (!node) {
    return;
  }
  Object.assign(node, patch);
  renderGraph();
  renderInspector();
  notifyProjectChanged();
}

function addNode(type) {
  if (!state.project) {
    return;
  }
  const id = `node-${Date.now()}`;
  const node = {
    id,
    type,
    label: `${type[0].toUpperCase() + type.slice(1)} node`,
    x: 24 + (state.project.canvas.nodes.length % 4) * 240,
    y: 24 + Math.floor(state.project.canvas.nodes.length / 4) * 140,
    prompt: type === 'agent' || type === 'subagent' ? 'Describe your task here.' : undefined,
    model: type === 'agent' || type === 'subagent' ? state.project.settings.defaultModel : undefined,
    expression: type === 'decision' ? 'true' : undefined
  };
  state.project.canvas.nodes.push(node);
  selectNode(id);
  renderGraph();
  notifyProjectChanged();
}

function addEdge(fromId, toId) {
  if (!state.project) {
    return;
  }
  const existing = state.project.canvas.edges.find((edge) => edge.from === fromId && edge.to === toId);
  if (existing) {
    return;
  }
  state.project.canvas.edges.push({ id: `edge-${Date.now()}`, from: fromId, to: toId });
}

function removeNode(nodeId) {
  if (!state.project) {
    return;
  }
  state.project.canvas.nodes = state.project.canvas.nodes.filter((node) => node.id !== nodeId);
  state.project.canvas.edges = state.project.canvas.edges.filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  state.selectedNodeId = null;
  renderGraph();
  renderInspector();
  notifyProjectChanged();
}

function findNode(nodeId) {
  return state.project?.canvas.nodes.find((node) => node.id === nodeId) || null;
}

function notifyProjectChanged() {
  if (!state.project) {
    return;
  }
  state.project.updatedAt = new Date().toISOString();
  if (typeof state.projectChanged === 'function') {
    state.projectChanged(state.project);
  }
}

function getProject() {
  return state.project;
}

export { initializeGraph, setProject, addNode, getProject };
