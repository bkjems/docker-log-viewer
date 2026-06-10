let selectedId = null;

const elList = document.getElementById('container-list');
const elPlaceholder = document.getElementById('placeholder');
const elLogView = document.getElementById('log-view');
const elLogOutput = document.getElementById('log-output');
const elContainerName = document.getElementById('log-container-name');
const elContainerImage = document.getElementById('log-container-image');
const elStatusDot = document.getElementById('log-status-dot');
const elAnalysisSection = document.getElementById('analysis-section');
const elAnalysisOutput = document.getElementById('analysis-output');
const btnRefreshList = document.getElementById('btn-refresh-list');
const btnRefreshLogs = document.getElementById('btn-refresh-logs');
const btnAnalyze = document.getElementById('btn-analyze');

async function loadContainers() {
  btnRefreshList.disabled = true;
  try {
    const res = await fetch('/api/containers');
    const containers = await res.json();
    renderContainerList(containers);
  } catch (e) {
    elList.innerHTML = `<li class="error-text" style="padding:12px 16px;font-size:13px;">Failed to load containers</li>`;
  } finally {
    btnRefreshList.disabled = false;
  }
}

function renderContainerList(containers) {
  elList.innerHTML = '';
  containers.forEach(c => {
    const li = document.createElement('li');
    li.dataset.id = c.id;
    li.className = `state-${c.state}`;
    if (c.id === selectedId) li.classList.add('active');

    const dot = document.createElement('span');
    dot.className = `dot ${c.state}`;

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = c.name;
    name.title = c.name;

    const badge = document.createElement('span');
    badge.className = 'state-badge';
    badge.textContent = c.state;

    li.append(dot, name, badge);
    li.addEventListener('click', () => selectContainer(c));
    elList.appendChild(li);
  });
}

function selectContainer(c) {
  selectedId = c.id;
  document.querySelectorAll('#container-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === c.id);
  });

  elContainerName.textContent = c.name;
  elContainerImage.textContent = c.image;
  elStatusDot.className = `dot ${c.state}`;
  elAnalysisSection.classList.add('hidden');
  elLogOutput.textContent = 'Loading…';
  elPlaceholder.classList.add('hidden');
  elLogView.classList.remove('hidden');

  loadLogs(c.id);
}

async function loadLogs(id) {
  btnRefreshLogs.disabled = true;
  try {
    const res = await fetch(`/api/containers/${id}/logs`);
    const { logs, error } = await res.json();
    elLogOutput.textContent = error ? `Error: ${error}` : (logs || '(no log output)');
    elLogOutput.scrollTop = elLogOutput.scrollHeight;
  } catch (e) {
    elLogOutput.textContent = 'Failed to fetch logs.';
  } finally {
    btnRefreshLogs.disabled = false;
  }
}

async function analyzeLogs() {
  if (!selectedId) return;
  btnAnalyze.disabled = true;
  btnAnalyze.innerHTML = '<span class="spinner"></span>Analyzing…';
  elAnalysisSection.classList.remove('hidden');
  elAnalysisOutput.textContent = 'Sending logs to Claude…';

  try {
    const res = await fetch(`/api/containers/${selectedId}/analyze`, { method: 'POST' });
    const { analysis, error } = await res.json();
    if (error) {
      elAnalysisOutput.innerHTML = `<span class="error-text">Error: ${escapeHtml(error)}</span>`;
    } else {
      elAnalysisOutput.innerHTML = renderMarkdown(analysis);
    }
  } catch (e) {
    elAnalysisOutput.innerHTML = `<span class="error-text">Request failed.</span>`;
  } finally {
    btnAnalyze.disabled = false;
    btnAnalyze.textContent = 'Analyze with AI';
  }
}

// Minimal markdown → HTML (headers, bold, bullets, code, paragraphs)
function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/```[\s\S]*?```/g, m => `<pre><code>${m.slice(3, -3).trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hup])/gm, '')
    .replace(/^(.+)$/gm, m => (m.startsWith('<') ? m : `<p>${m}</p>`));
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

btnRefreshList.addEventListener('click', loadContainers);
btnRefreshLogs.addEventListener('click', () => selectedId && loadLogs(selectedId));
btnAnalyze.addEventListener('click', analyzeLogs);

loadContainers();
