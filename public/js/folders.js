const TEMA_ICONS = {
  '': 'apps', 'Todos': 'apps',
  'Sistema Open': 'dns', 'Salesforce': 'cloud', 'Qupos': 'point_of_sale',
  'MBA Case': 'work', 'Agentes de Ayuda': 'support_agent', 'General': 'folder_open',
  'Otros': 'folder_open', 'Final': 'fact_check', 'Prácticas de refuerzo': 'fitness_center'
};

const TEMA_FOLDER_COLORS = {
  '': { back: '#00196E', f1: '#0072BC', f2: '#4FA8DE' },
  'Todos': { back: '#00196E', f1: '#0072BC', f2: '#4FA8DE' },
  'Sistema Open': { back: '#00568F', f1: '#0072BC', f2: '#4FA8DE' },
  'Salesforce': { back: '#124b6b', f1: '#1E77A8', f2: '#5AA9CE' },
  'Qupos': { back: '#8a5600', f1: '#C97600', f2: '#F0A02C' },
  'MBA Case': { back: '#4a3480', f1: '#6C4FBC', f2: '#9f7fe0' },
  'Agentes de Ayuda': { back: '#8a2b28', f1: '#C13F3B', f2: '#e2726e' },
  'General': { back: '#384049', f1: '#56636F', f2: '#8593a1' },
  'Otros': { back: '#384049', f1: '#56636F', f2: '#8593a1' },
  'Final': { back: '#5c1f66', f1: '#8e3f9c', f2: '#c68ad0' },
  'Prácticas de refuerzo': { back: '#0d5c4a', f1: '#12876c', f2: '#5cc4a8' }
};

function folderColor(cat) {
  return TEMA_FOLDER_COLORS[cat] || TEMA_FOLDER_COLORS['General'];
}

function folderItemHtml(cat, label, count, active) {
  const cl = folderColor(cat);
  return `
    <li class="folder-item${active ? ' act' : ''}" data-cat="${escapeHtml(cat)}"
        style="--folder-back:${cl.back};--folder-front1:${cl.f1};--folder-front2:${cl.f2}">
      <div class="folder-3d">
        <div class="folder-back"></div>
        <div class="folder-paper folder-paper-a"></div>
        <div class="folder-paper folder-paper-b"></div>
        <div class="folder-paper folder-paper-c"></div>
        <div class="folder-front"></div>
      </div>
      <div class="folder-label">
        <span class="msym">${TEMA_ICONS[cat] || 'folder_open'}</span>
        <span class="nombre">${escapeHtml(label)}</span>
        <span class="count">${count}</span>
      </div>
    </li>
  `;
}
