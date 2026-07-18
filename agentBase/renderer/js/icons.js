window.ABIcons = (() => {
  const ICONS = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M19.4 4.6l-2.1 2.1M6.7 17.3l-2.1 2.1"/>',
    theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    'zoom-in': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6M11 8v6"/>',
    'zoom-out': '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>',
    'zoom-fit': '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/>',
    play: '<path d="M6 4l14 8-14 8z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    import: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    export: '<path d="M12 15V4M7 9l5-5 5 5M4 20h16"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sparkles: '<path d="M11 3l1.7 4.8 4.8 1.7-4.8 1.7L11 16l-1.7-4.8L4.5 9.5l4.8-1.7zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/>',
    orchestrator: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M10.8 7.2L6.2 15.9M13.2 7.2l4.6 8.7M7.5 18h9"/>',
    agent: '<rect x="5" y="8" width="14" height="11" rx="2.5"/><path d="M12 8V5M9.5 12.8v1.4M14.5 12.8v1.4"/><circle cx="12" cy="4" r="1"/>',
    subagent: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8.5 6c4 0 7 2.5 7 6M8.5 18c4 0 7-2.5 7-6"/>'
  };

  function icon(name, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  function swap(id, name, size) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = '';
    el.appendChild(icon(name, size));
  }

  function mount() {
    swap('btn-sidebar', 'menu');
    swap('btn-settings', 'settings');
    swap('btn-theme', 'theme');
    swap('btn-inspector', 'panel');
    swap('btn-drawer', 'chevron');
    swap('btn-zoom-in', 'zoom-in');
    swap('btn-zoom-out', 'zoom-out');
    swap('btn-zoom-fit', 'zoom-fit');
  }

  return { icon, mount };
})();
