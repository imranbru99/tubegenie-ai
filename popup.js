const API_KEY_STORAGE_KEY = 'blogcutter_api_key';
const HISTORY_KEY = 'blogcutter_history';
// API endpoint for your Laravel controller (full URL).
const API_ENDPOINT = 'https://blogcutter.com/api/youtube-generate';

function qs(id) { return document.getElementById(id); }

async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get([API_KEY_STORAGE_KEY], (res) => resolve(res[API_KEY_STORAGE_KEY]));
    });
}

async function saveToHistory(entry) {
    const cur = await new Promise(r => chrome.storage.local.get([HISTORY_KEY], o => r(o[HISTORY_KEY] || [])));
    cur.unshift(entry);
    await chrome.storage.local.set({ [HISTORY_KEY]: cur });
    renderHistory(cur);
}

function renderHistory(list) {
    const container = qs('history-list');
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-500">No history yet.</div>';
        return;
    }

    list.forEach((h, idx) => {
        const el = document.createElement('div');
        el.className = 'p-2 bg-white rounded border flex items-start justify-between gap-2';
        el.innerHTML = `
            <div class="flex-1">
                <div class="text-sm font-medium">${h.generatedTitle || '(no title)'}</div>
                <div class="text-xs text-gray-500">${new Date(h.ts).toLocaleString()}</div>
            </div>
            <div class="flex flex-col gap-1">
                <button class="retry-btn text-sm bg-indigo-600 text-white px-2 py-1 rounded" data-idx="${idx}">Apply</button>
                <button class="copy-btn text-sm bg-gray-100 px-2 py-1 rounded" data-idx="${idx}">Copy</button>
            </div>
        `;
        container.appendChild(el);
    });

    // wire buttons
    container.querySelectorAll('.retry-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const listNow = await new Promise(r => chrome.storage.local.get([HISTORY_KEY], o => r(o[HISTORY_KEY] || [])));
        const item = listNow[idx];
        if (item) applyToPage(item);
    }));

    container.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', async (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        const listNow = await new Promise(r => chrome.storage.local.get([HISTORY_KEY], o => r(o[HISTORY_KEY] || [])));
        const item = listNow[idx];
        if (item) {
            const out = `Title: ${item.generatedTitle}\n\nDescription:\n${item.description}\n\nTags:\n${item.tags}`;
            await navigator.clipboard.writeText(out);
        }
    }));
}

async function loadHistory() {
    const res = await new Promise(r => chrome.storage.local.get([HISTORY_KEY], o => r(o[HISTORY_KEY] || [])));
    renderHistory(res);
}

async function getActiveTabTitle() {
    const resp = await sendMessageToActiveTab({ type: 'GET_YT_TITLE' });
    return resp && resp.title ? resp.title : null;
}

async function callGenerateApi(inputTitle) {
    const apiKey = await getApiKey();
    const payload = { title: inputTitle };
    // If API key exists, include it in the body as `api` to match your controller
    if (apiKey) payload.api = apiKey;

    const res = await fetch(API_ENDPOINT, {
        method: 'POST', headers: {
            'Content-Type': 'application/json'
        }, body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json();
}

async function applyToPage(item) {
    // send message to content script to apply title/description/tags (with injection fallback)
    const resp = await sendMessageToActiveTab({ type: 'APPLY_GENERATED', data: item });
    if (!resp && chrome.runtime.lastError) {
        console.warn('applyToPage failed:', chrome.runtime.lastError.message);
    }
    return resp;
}

// Send message to active tab; if no receiver, attempt to inject content.js and retry once.
function sendMessageToActiveTab(message) {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const tab = tabs && tabs[0];
            if (!tab) return resolve(null);

            chrome.tabs.sendMessage(tab.id, message, function (resp) {
                if (!chrome.runtime.lastError) return resolve(resp);

                // No receiver — try injecting content script then retry
                console.warn('No content script, attempting to inject:', chrome.runtime.lastError.message);
                try {
                    chrome.scripting.executeScript({
                        target: { tabId: tab.id },
                        files: ['content.js']
                    }, () => {
                        if (chrome.runtime.lastError) {
                            console.error('Injection failed:', chrome.runtime.lastError.message);
                            return resolve(null);
                        }
                        // retry sendMessage
                        chrome.tabs.sendMessage(tab.id, message, function (resp2) {
                            if (chrome.runtime.lastError) {
                                console.error('Retry sendMessage failed:', chrome.runtime.lastError.message);
                                return resolve(null);
                            }
                            return resolve(resp2);
                        });
                    });
                } catch (e) {
                    console.error('scripting.executeScript error', e);
                    return resolve(null);
                }
            });
        });
    });
}

function showResults(data) {
    qs('results').classList.remove('hidden');
    qs('gen-title').value = data.title || '';
    qs('gen-desc').value = data.description || '';
    qs('gen-tags').value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || '');
}

document.addEventListener('DOMContentLoaded', async () => {
    const openOptionsEl = qs('open-options');
    if (openOptionsEl) openOptionsEl.addEventListener('click', () => chrome.runtime.openOptionsPage());

    const generateEl = qs('generate-all');
    if (generateEl) generateEl.addEventListener('click', async () => {
        qs('status').textContent = 'Fetching title from page...';
        qs('status').innerHTML = '<span class="inline-flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Fetching title...</span>';
        const title = await getActiveTabTitle();
        if (!title) { qs('status').textContent = 'Could not find title on this page.'; return; }
        qs('status').innerHTML = '<span class="inline-flex items-center gap-2"><svg class="animate-spin h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path></svg>Generating...</span>';
        try {
            const apiResp = await callGenerateApi(title);
            // normalize
            const item = {
                ts: Date.now(),
                inputTitle: title,
                generatedTitle: apiResp.title || '',
                description: apiResp.description || '',
                tags: apiResp.tags || []
            };
            showResults(item);
            await saveToHistory(item);
            qs('status').textContent = 'Generated and saved to history. Applying to page...';
            try {
                const applyResp = await applyToPage(item);
                if (applyResp && typeof applyResp === 'object') {
                    const appliedFields = Object.keys(applyResp).filter(k => applyResp[k]);
                    if (appliedFields.length) qs('status').textContent = 'Applied: ' + appliedFields.join(', ');
                    else qs('status').textContent = 'Generated but failed to apply fields. See page console.';
                } else if (applyResp) {
                    qs('status').textContent = 'Applied to page.';
                } else {
                    qs('status').textContent = 'Generated but content script did not respond.';
                }
            } catch (e) {
                console.error('apply after generate error', e);
                qs('status').textContent = 'Generated but failed to apply: ' + (e && e.message ? e.message : 'unknown');
            }
        } catch (err) {
            qs('status').textContent = 'Error: ' + err.message;
        }
    });

    // apply / copy buttons
    const applyTitleEl = qs('apply-title');
    if (applyTitleEl) applyTitleEl.addEventListener('click', () => {
        const item = { generatedTitle: qs('gen-title')?.value || '', description: qs('gen-desc')?.value || '', tags: (qs('gen-tags')?.value || '').split(',').map(s=>s.trim()) };
        applyToPage(item);
    });
    const applyDescEl = qs('apply-desc');
    if (applyDescEl) applyDescEl.addEventListener('click', () => {
        const item = { generatedTitle: qs('gen-title')?.value || '', description: qs('gen-desc')?.value || '', tags: (qs('gen-tags')?.value || '').split(',').map(s=>s.trim()) };
        applyToPage(item);
    });
    const copyTitleEl = qs('copy-title');
    if (copyTitleEl) copyTitleEl.addEventListener('click', async () => await navigator.clipboard.writeText(qs('gen-title')?.value || ''));
    const copyDescEl = qs('copy-desc');
    if (copyDescEl) copyDescEl.addEventListener('click', async () => await navigator.clipboard.writeText(qs('gen-desc')?.value || ''));
    const copyTagsEl = qs('copy-tags');
    if (copyTagsEl) copyTagsEl.addEventListener('click', async () => await navigator.clipboard.writeText(qs('gen-tags')?.value || ''));

    const clearHistoryEl = qs('clear-history');
    if (clearHistoryEl) clearHistoryEl.addEventListener('click', async () => {
        await chrome.storage.local.remove(HISTORY_KEY);
        loadHistory();
    });

    // load initial state
    const apiKey = await getApiKey();
    if (qs('status')) {
        if (apiKey) qs('status').textContent = 'API key is set. Ready.';
        else qs('status').textContent = 'No API key set — open Settings.';
    }
    loadHistory();
    // Ask page to create/open sidebar (ensures icon appears even if content script was not injected earlier)
    try { await sendMessageToActiveTab({ type: 'OPEN_SIDEBAR' }); } catch (e) { console.warn('OPEN_SIDEBAR request failed', e); }
});