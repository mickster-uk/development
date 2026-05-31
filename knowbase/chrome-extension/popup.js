const btn    = document.getElementById('btn');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.className = '';
  status.textContent = 'Reading list…';

  try {
    const items = await chrome.readingList.query({});

    if (!items.length) {
      status.className = 'error';
      status.textContent = 'Your Reading List is empty.';
      btn.disabled = false;
      return;
    }

    const res = await fetch('http://localhost:57420/reading-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    if (res.ok) {
      status.className = 'ok';
      status.textContent = `Exported ${items.length} item${items.length !== 1 ? 's' : ''}.`;
    } else {
      throw new Error('Server returned ' + res.status);
    }
  } catch (e) {
    status.className = 'error';
    status.textContent = e.message.includes('fetch')
      ? 'Could not reach Knowbase — is it open?'
      : e.message;
  }

  btn.disabled = false;
});
