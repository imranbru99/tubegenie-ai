
// Cleaned content script for BlogCutter YouTube extension
const API_KEY_STORAGE_KEY = 'blogcutter_api_key';
const HISTORY_KEY = 'blogcutter_history';
const API_ENDPOINT = 'https://blogcutter.com/api/youtube-generate';

try { console.log('blogcutter: content.js loaded'); } catch (e) {}

// storage wrappers: prefer chrome.storage.local when available, fallback to localStorage
function storageGet(keys, cb) {
    try {
        if (window.chrome && chrome.storage && chrome.storage.local && chrome.storage.local.get) return chrome.storage.local.get(keys, cb);
    } catch (e) {}
    const res = {};
    try {
        if (Array.isArray(keys)) {
            for (const k of keys) {
                try { res[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { res[k] = localStorage.getItem(k); }
            }
        } else if (typeof keys === 'string') {
            try { res[keys] = JSON.parse(localStorage.getItem(keys)); } catch (e) { res[keys] = localStorage.getItem(keys); }
        }
    } catch (e) {}
    setTimeout(() => cb && cb(res), 0);
}

function storageSet(obj, cb) {
    try {
        if (window.chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set) return chrome.storage.local.set(obj, cb);
    } catch (e) {}
    try {
        for (const k in obj) {
            try { localStorage.setItem(k, JSON.stringify(obj[k])); } catch (e) { localStorage.setItem(k, String(obj[k])); }
        }
    } catch (e) {}
    setTimeout(() => cb && cb(), 0);
}

function storageRemove(keys, cb) {
    try {
        if (window.chrome && chrome.storage && chrome.storage.local && chrome.storage.local.remove) return chrome.storage.local.remove(keys, cb);
    } catch (e) {}
    try {
        if (Array.isArray(keys)) for (const k of keys) localStorage.removeItem(k);
        else localStorage.removeItem(keys);
    } catch (e) {}
    setTimeout(() => cb && cb(), 0);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return;

    if (msg.type === 'OPEN_SIDEBAR') {
        try {
            createSidebarUI();
            const sb = document.getElementById('blogcutter-sidebar');
            if (sb) sb.style.transform = 'translateX(0)';
            sendResponse({ ok: true });
        } catch (e) { console.error('OPEN_SIDEBAR error', e); sendResponse({ ok: false, error: String(e) }); }
        return true;
    }

    if (msg.type === 'GET_YT_TITLE') {
        sendResponse({ title: extractYouTubeTitle() });
        return true;
    }

    if (msg.type === 'APPLY_GENERATED') {
        try {
            const result = applyGeneratedToStudio(msg.data || {});
            if (result && typeof result.then === 'function') {
                result.then(r => sendResponse(r)).catch(e => { console.error('Apply generated error', e); sendResponse({ title:false, description:false, tags:false, error: String(e) }); });
                return true; // indicate async
            }
            sendResponse(result);
        } catch (e) { console.error('Apply generated error', e); sendResponse({ title:false, description:false, tags:false, error: String(e) }); }
        return true;
    }

    return true;
});

// Helpers
function extractYouTubeTitle() {
    try {
        const selectors = [
            'ytcp-social-suggestion-input#input #textbox',
            'ytcp-video-title-input #textbox',
            'ytcp-form-input #textbox',
            'h1.title',
            'h1.ytd-video-primary-info-renderer'
        ];
        for (const s of selectors) {
            const el = document.querySelector(s) || querySelectorDeep(s);
            if (el) {
                const text = el.textContent || el.value || '';
                const clean = (text || '').trim();
                if (clean) return clean;
            }
        }
        return (document.title || '').replace(/ - YouTube$/, '').trim() || null;
    } catch (e) { return null; }
}

function isHeaderOrSearch(el) { if (!el) return false; return !!el.closest('yt-masthead, #masthead, #search, ytd-searchbox, .masthead-search, header'); }
function isLikelyEditorElement(el) { if (!el) return false; if (isHeaderOrSearch(el)) return false; return !!el.closest('ytcp-entity, ytcp-video-editor, ytcp-form-input-container, .ytcp-social-suggestions-textbox, #content, #primary'); }

function summarizeElement(el) {
    if (!el) return '<null>';
    try {
        const tag = el.tagName;
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className ? `.${String(el.className).split(' ').slice(0,2).join('.')}` : '';
        const ce = (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.isContentEditable)) ? ' contenteditable' : '';
        const val = ('value' in el) ? (` value="${String(el.value||'').slice(0,40)}"`) : '';
        return `<${tag}${id}${cls}${ce}${val}>`;
    } catch (e) { return '<el>'; }
}

// deep selectors
function querySelectorAllDeep(selector, root = document) {
    const results = [];
    const collect = (node) => {
        try {
            const found = node.querySelectorAll && node.querySelectorAll(selector);
            if (found && found.length) results.push(...found);
        } catch (e) {}
        const children = node.children || [];
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.shadowRoot) collect(child.shadowRoot);
            collect(child);
        }
    };
    collect(root);
    return results;
}
function querySelectorDeep(selector, root = document) { const all = querySelectorAllDeep(selector, root); return (all && all.length) ? all[0] : null; }

async function setTextOnElement(el, value) {
    if (!el) return false;
    try {
        el.focus?.();
        const isCE = el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.isContentEditable);
        if (isCE) {
            // try direct set
            try { el.innerText = value; } catch (e) { el.textContent = value; }
            el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const cur = (el.innerText || el.textContent || '').trim();
            if (cur === String(value || '').trim()) { el.blur?.(); return true; }
            // non-blocking typing fallback
            const ok = await simulateTyping(el, value);
            el.blur?.();
            return ok;
        }
        if ('value' in el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            const cur = String(el.value || '').trim();
            if (cur === String(value || '').trim()) { el.blur?.(); return true; }
            const ok = await simulateTyping(el, value);
            el.blur?.();
            return ok;
        }
        el.textContent = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    } catch (e) { console.error('setTextOnElement error', e); return false; }
}

function simulateTyping(el, value) {
    return new Promise((resolve) => {
        if (!el) return resolve(false);
        try {
            el.focus?.();
            const isCE = el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.isContentEditable);
            const str = String(value || '');
            if (isCE) {
                // type in chunks to avoid blocking UI
                el.innerText = '';
                const chunkSize = 120;
                let i = 0;
                const step = () => {
                    const part = str.slice(i, i + chunkSize);
                    el.innerText += part;
                    el.dispatchEvent(new InputEvent('input', { data: part, bubbles: true, cancelable: true, inputType: 'insertText' }));
                    i += chunkSize;
                    if (i < str.length) setTimeout(step, 10);
                    else {
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        resolve(true);
                    }
                };
                step();
                return;
            }
            if ('value' in el) {
                const chunkSize = 500; // larger for plain inputs
                el.value = '';
                let i = 0;
                const step = () => {
                    const part = str.slice(i, i + chunkSize);
                    el.value += part;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    i += chunkSize;
                    if (i < str.length) setTimeout(step, 10);
                    else { el.dispatchEvent(new Event('change', { bubbles: true })); resolve(true); }
                };
                step();
                return;
            }
            el.textContent = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.blur?.();
            resolve(true);
        } catch (e) { console.error('simulateTyping error', e); resolve(false); }
    });
}

// Sidebar UI
function ensureSidebarUI() {
    if (document.getElementById('blogcutter-sidebar')) return;
    const anchors = ['ytcp-social-suggestion-input#input #textbox', '.ytcp-social-suggestions-textbox [contenteditable]', 'ytcp-video-editor', '#content', 'ytcp-form-input', 'ytcp-creator'];
    if (anchors.some(s => document.querySelector(s) || querySelectorDeep(s))) { createSidebarUI(); return; }
    const ob = new MutationObserver((mutations, observer) => {
        for (const s of anchors) if (document.querySelector(s) || querySelectorDeep(s)) { observer.disconnect(); createSidebarUI(); return; }
    });
    ob.observe(document.documentElement || document.body, { childList: true, subtree: true });
    setTimeout(() => { if (!document.getElementById('blogcutter-sidebar')) createSidebarUI(); }, 5000);
}

if (document.readyState === 'complete' || document.readyState === 'interactive') ensureSidebarUI();
else window.addEventListener('DOMContentLoaded', ensureSidebarUI);

async function applyGeneratedToStudio(data) {
    const applied = { title: false, description: false, tags: false };
    // Find both targets first so we can detect conflicts
    const titleRequested = !!(data.generatedTitle);
    const descRequested = !!(data.description);
    const tagsRequested = !!(data.tags);

    let titleEl = titleRequested ? findTitleElement() : null;
    let descEl = descRequested ? findDescriptionElement() : null;
    let tagsEl = tagsRequested ? findTagsElement() : null;

    console.log('bc: applyGeneratedToStudio targets', { titleEl: summarizeElement(titleEl), descEl: summarizeElement(descEl), tagsEl: summarizeElement(tagsEl) });

    // If title and description point to same node, avoid applying both to same element.
    if (titleEl && descEl && titleEl === descEl) {
        console.warn('bc: title and description resolved to the same element; choosing safer assignment');
        const genTitleLen = String(data.generatedTitle || '').length;
        const descLen = String(data.description || '').length;
        // If generated title looks long (more like a description), skip setting title here
        if (genTitleLen > 200 || descLen > genTitleLen * 2) {
            console.log('bc: skipping title apply because content looks like description');
            titleEl = null;
        } else {
            // try to find alternative title element by attribute-based search
            const alt = findAlternativeTitleCandidate();
            if (alt && alt !== descEl) { console.log('bc: using alternative title candidate', summarizeElement(alt)); titleEl = alt; }
            else { console.log('bc: no alternative title candidate found; will skip description apply to avoid clobbering'); descEl = null; }
        }
    }

    // Title
    if (titleRequested && titleEl) {
        console.log('bc: setting title into', summarizeElement(titleEl));
        try { const ok = await setTextOnElement(titleEl, data.generatedTitle); applied.title = !!ok; } catch (e) { console.error('bc: title apply error', e); }
    }

    // Description
    if (descRequested && descEl) {
        console.log('bc: setting description into', summarizeElement(descEl));
        try { const ok = await setTextOnElement(descEl, data.description); applied.description = !!ok; } catch (e) { console.error('bc: desc apply error', e); }
    } else if (descRequested && !descEl) {
        console.log('bc: description element not found or skipped');
    }

    // Tags
    if (tagsRequested) {
        if (!tagsEl) tagsEl = findTagsElement();
        console.log('bc: tags element found', summarizeElement(tagsEl));
        if (tagsEl) {
            const tagsValue = Array.isArray(data.tags) ? data.tags.join(', ') : data.tags;
            try { const ok = await setTextOnElement(tagsEl, tagsValue); applied.tags = !!ok; } catch (e) { console.error('bc: tags apply error', e); }
        }
    }

    console.log('applyGeneratedToStudio result', applied);
    return applied;
}

function findTitleElement() {
    // Studio specific selectors (use the IDed textbox containers when present)
    const precise = [
        '#title-textarea #textbox',
        '#title-textarea div[contenteditable]#textbox',
        'ytcp-video-title #textbox',
        'ytcp-video-title #title-textbox-container #textbox'
    ];
    for (const s of precise) {
        const el = querySelectorDeep(s) || document.querySelector(s);
        const refined = refineEditable(el, 'title');
        if (refined && !isLikelyDescriptionElement(refined)) return refined;
    }

    // Fallback: look for small editable elements that clearly reference "title" in attributes
    try {
        const candidates = querySelectorAllDeep('[id*="title"], [name*="title"], [aria-label*="title"], [placeholder*="title"]');
        for (const c of candidates) {
            const r = refineEditable(c, 'title');
            if (r && !isLikelyDescriptionElement(r)) return r;
        }
    } catch (e) {}
    return null;
}

function findDescriptionElement() {
    // Prefer the description container IDs used by Studio
    const precise = [
        '#description-textarea #textbox',
        '#description-textarea div[contenteditable]#textbox',
        'ytcp-video-description #textbox',
        '#description-wrapper #textbox'
    ];
    for (const s of precise) {
        const el = querySelectorDeep(s) || document.querySelector(s);
        const refined = refineEditable(el, 'description');
        if (refined) return refined;
    }
    // fallback: look for social suggestions textbox inside video description area
    try {
        const wrapper = querySelectorDeep('ytcp-video-description') || querySelectorDeep('#description-wrapper') || document.querySelector('#description-container');
        if (wrapper) {
            const el = querySelectorDeep.bind(null, '#textbox')(wrapper) || querySelectorDeep('[contenteditable="true"]', wrapper) || wrapper.querySelector('[contenteditable="true"]');
            if (el) return refineEditable(el, 'description');
        }
    } catch (e) {}
    // final fallback: any deep contenteditable
    const fallback = querySelectorDeep('[contenteditable="true"]');
    return refineEditable(fallback, 'description') || null;
}

function findTagsElement() {
    const sels = ['ytcp-tag-input input', 'input#keywords', 'input[name="keywords"]', 'input[aria-label*="tags"]'];
    for (const s of sels) {
        const el = querySelectorDeep(s) || document.querySelector(s);
        const refined = refineEditable(el, 'tags');
        if (refined) return refined;
    }
    return null;
}

// Heuristic helper: given an element (possibly a container), prefer a precise editable child
function isEditableElement(el) {
    if (!el) return false;
    try {
        if (el.getAttribute && (el.getAttribute('contenteditable') === 'true' || el.isContentEditable)) return true;
        if ('value' in el) return true;
        if (el.tagName === 'TEXTAREA') return true;
        return false;
    } catch (e) { return false; }
}

function refineEditable(el, field) {
    if (!el) return null;
    try {
        // If element itself is an input/contenteditable, prefer it
        if (isEditableElement(el)) return el;

        const candidates = [];
        const selList = ['[contenteditable="true"]', '#textbox', 'div[role="textbox"]', 'textarea', 'input[type="text"]', 'input'];
        for (const s of selList) {
            try {
                const found = el.querySelectorAll ? el.querySelectorAll(s) : null;
                if (found && found.length) for (let i=0;i<found.length;i++) candidates.push(found[i]);
            } catch (e) { }
        }

        // Score candidates by heuristics (id/name/aria-label/placeholder matches, being editable, reasonable size)
        const fieldLower = (field||'').toLowerCase();
        const scored = candidates.map(c => {
            let score = 0;
            try {
                const id = (c.getAttribute && c.getAttribute('id')) || '';
                const name = (c.getAttribute && c.getAttribute('name')) || '';
                const aria = (c.getAttribute && c.getAttribute('aria-label')) || '';
                const ph = c.placeholder || '';
                const attrs = (id + ' ' + name + ' ' + aria + ' ' + ph).toLowerCase();
                if (attrs.includes(fieldLower)) score += 20;
                if (isEditableElement(c)) score += 8;
                const len = (c.textContent || c.value || '').length;
                // penalize overly large candidates for title
                if (fieldLower === 'title' && len > 300) score -= 10;
                // prefer shorter inputs for tags
                if (fieldLower === 'tags' && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA')) score += 5;
            } catch(e) {}
            return { c, score };
        });

        scored.sort((a,b)=>b.score-a.score);
        if (scored.length && scored[0].score > -100) return scored[0].c;
    } catch (e) { console.warn('refineEditable error', e); }
    return null;
}

function isLikelyDescriptionElement(el) {
    if (!el) return false;
    try {
        const txt = (el.textContent || el.value || '').trim();
        if (!txt) return false;
        // long text or many newlines -> description
        if (txt.length > 300) return true;
        if ((txt.match(/\n/g) || []).length >= 3) return true;
        // presence of multiple sentences (heuristic)
        const sentenceCount = (txt.match(/[\.\!\?]\s+/g) || []).length;
        if (sentenceCount >= 4) return true;
    } catch (e) {}
    return false;
}
 
function createSidebarUI() {
    if (document.getElementById('blogcutter-sidebar')) return;

    const toggle = document.createElement('button');
    toggle.id = 'blogcutter-toggle';
    Object.assign(toggle.style, { position: 'fixed', right: '16px', bottom: '24px', zIndex: 999999, width: '56px', height: '56px', borderRadius: '12px', background: 'linear-gradient(135deg,#6366f1,#ec4899)', color: 'white', border: 'none', boxShadow: '0 6px 18px rgba(0,0,0,0.2)', cursor: 'pointer' });
    toggle.title = 'Open BlogCutter';
    toggle.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20z"></path></svg>';
    document.body.appendChild(toggle);

    try {
        const leftCandidates = ['ytd-guide-renderer', '#guide', '.guide-renderer', '#left-content'];
        let leftRoot = null;
        for (const s of leftCandidates) { const f = document.querySelector(s); if (f) { leftRoot = f; break; } }
        if (leftRoot) {
            const leftBtn = document.createElement('button');
            leftBtn.id = 'blogcutter-left-btn'; leftBtn.textContent = 'BC';
            Object.assign(leftBtn.style, { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '6px', background: '#6366f1', color: 'white', border: 'none', margin: '8px', cursor: 'pointer', zIndex: 999999 });
            leftBtn.title = 'Open BlogCutter';
            leftBtn.addEventListener('click', () => { const sb = document.getElementById('blogcutter-sidebar'); if (sb) sb.style.transform = 'translateX(0)'; });
            try { leftRoot.insertBefore(leftBtn, leftRoot.firstChild); } catch (e) { console.warn('blogcutter: left insert failed', e); }
        }
    } catch (e) { console.warn('left rail error', e); }

    const sidebar = document.createElement('div');
    sidebar.id = 'blogcutter-sidebar';
    Object.assign(sidebar.style, { position: 'fixed', top: '64px', right: '0', height: 'calc(100vh - 80px)', width: '420px', background: '#fff', boxShadow: '-10px 0 30px rgba(2,6,23,0.2)', zIndex: 999998, transform: 'translateX(100%)', transition: 'transform 240ms ease-in-out', borderLeft: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' });
    document.body.appendChild(sidebar);

    sidebar.innerHTML = `
        <div style="padding:16px; background:linear-gradient(90deg,#6366f1,#ec4899); color:white; display:flex; align-items:center; justify-content:space-between;">
            <div style="font-weight:700;">YouTube Content AI</div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button id="blogcutter-close" style="background:transparent;border:none;color:white;cursor:pointer;font-size:16px">✕</button>
            </div>
        </div>
        <div style="padding:14px; overflow:auto; flex:1;">
            <div style="margin-bottom:12px;">
                <button id="bc-generate" style="width:100%; padding:12px; background:#4f46e5; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600;">Generate from Title</button>
            </div>
            <div id="bc-status" style="font-size:13px;color:#6b7280;margin-bottom:8px;"></div>

            <div id="bc-results" style="display:none;">
                <label style="font-size:12px;color:#374151">Title</label>
                <div style="display:flex; gap:8px; margin-top:6px;">
                    <input id="bc-title" readonly style="flex:1;padding:8px;border:1px solid #e5e7eb;border-radius:6px;" />
                    <button id="bc-apply-title" style="background:#10b981;color:white;border:none;padding:8px;border-radius:6px;cursor:pointer;">Apply</button>
                </div>

                <label style="font-size:12px;color:#374151;margin-top:10px;display:block;">Description</label>
                <textarea id="bc-desc" readonly rows="6" style="width:100%;margin-top:6px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;"></textarea>
                <div style="display:flex;gap:8px;margin-top:8px;">
                    <button id="bc-apply-desc" style="background:#10b981;color:white;border:none;padding:8px;border-radius:6px;cursor:pointer;">Apply Description</button>
                    <button id="bc-copy-desc" style="background:#f3f4f6;border:none;padding:8px;border-radius:6px;cursor:pointer;">Copy</button>
                </div>

                <label style="font-size:12px;color:#374151;margin-top:10px;display:block;">Tags</label>
                <input id="bc-tags" readonly style="width:100%;margin-top:6px;padding:8px;border:1px solid #e5e7eb;border-radius:6px;" />
                <div style="margin-top:10px;display:flex;gap:8px;"><button id="bc-copy-tags" style="background:#f3f4f6;border:none;padding:8px;border-radius:6px;cursor:pointer;">Copy Tags</button></div>
            </div>

            <div style="margin-top:14px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><strong>History</strong><button id="bc-clear-history" style="background:transparent;border:none;color:#ef4444;cursor:pointer;">Clear</button></div>
                <div id="bc-history" style="max-height:180px;overflow:auto;display:flex;flex-direction:column;gap:8px;"></div>
            </div>
        </div>
    `;

    const openSidebar = () => { sidebar.style.transform = 'translateX(0)'; };
    const closeSidebar = () => { sidebar.style.transform = 'translateX(100%)'; };
        toggle.addEventListener('click', () => { openSidebar(); loadHistory(); });
    document.getElementById('blogcutter-close').addEventListener('click', closeSidebar);

    document.getElementById('bc-generate').addEventListener('click', () => {
        const statusEl = document.getElementById('bc-status');
        statusEl.textContent = 'Fetching page title...';
        const title = extractYouTubeTitle();
        if (!title) { statusEl.textContent = 'Could not locate the page title.'; return; }
        statusEl.textContent = 'Generating...';

        storageGet([API_KEY_STORAGE_KEY], async (res) => {
            const apiKey = res && res[API_KEY_STORAGE_KEY];
            try {
                const body = { title };
                if (apiKey) body.api = apiKey;
                const resp = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
                if (!resp.ok) throw new Error('API ' + resp.status);
                const data = await resp.json();
                showSidebarResults(data);
                await saveHistoryItem({ ts: Date.now(), inputTitle: title, generatedTitle: data.title || '', description: data.description || '', tags: data.tags || [] });
                statusEl.textContent = 'Generated';
            } catch (err) { console.error('bc generate error', err); statusEl.textContent = 'Error: ' + err.message; }
        });
    });

    document.getElementById('bc-apply-title').addEventListener('click', async () => { await applyGeneratedToStudio({ generatedTitle: document.getElementById('bc-title').value }); });
    document.getElementById('bc-apply-desc').addEventListener('click', async () => { await applyGeneratedToStudio({ description: document.getElementById('bc-desc').value }); });
    document.getElementById('bc-copy-desc').addEventListener('click', async () => { await navigator.clipboard.writeText(document.getElementById('bc-desc').value); });
    document.getElementById('bc-copy-tags').addEventListener('click', async () => { await navigator.clipboard.writeText(document.getElementById('bc-tags').value); });
    document.getElementById('bc-clear-history').addEventListener('click', () => { storageRemove(HISTORY_KEY, loadHistory); });

    function showSidebarResults(data) { document.getElementById('bc-results').style.display = 'block'; document.getElementById('bc-title').value = data.title || ''; document.getElementById('bc-desc').value = data.description || ''; document.getElementById('bc-tags').value = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags || ''); }

    function saveHistoryItem(item) { return new Promise((resolve) => { storageGet([HISTORY_KEY], (res) => { const arr = (res && res[HISTORY_KEY]) || []; arr.unshift(item); const obj = {}; obj[HISTORY_KEY] = arr; storageSet(obj, () => { renderHistory(arr); resolve(); }); }); }); }
    function loadHistory() { storageGet([HISTORY_KEY], (res) => { renderHistory((res && res[HISTORY_KEY]) || []); }); }
    function renderHistory(list) {
        const cont = document.getElementById('bc-history');
        cont.innerHTML = '';
        if (!list || list.length === 0) {
            cont.innerHTML = '<div style="color:#6b7280;font-size:13px">No history yet.</div>';
            return;
        }
        list.forEach((h, idx) => {
            const el = document.createElement('div');
            el.style.display = 'flex';
            el.style.justifyContent = 'space-between';
            el.style.alignItems = 'center';
            el.style.gap = '8px';
            el.innerHTML = `<div style="flex:1"><div style="font-size:13px;font-weight:600">${escapeHtml(h.generatedTitle || h.inputTitle || '(no title)')}</div><div style="font-size:12px;color:#6b7280">${new Date(h.ts).toLocaleString()}</div></div>`;

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.gap = '6px';

            const applyBtn = document.createElement('button');
            applyBtn.textContent = 'Apply';
            applyBtn.style.padding = '6px';
            applyBtn.style.borderRadius = '6px';
            applyBtn.style.background = '#4f46e5';
            applyBtn.style.color = 'white';
            applyBtn.style.border = 'none';
            applyBtn.style.cursor = 'pointer';
            applyBtn.addEventListener('click', async () => {
                console.log('bc: history apply clicked', { title: h.generatedTitle, descLen: (h.description||'').length, tags: h.tags });
                await applyGeneratedToStudio({ generatedTitle: h.generatedTitle, description: h.description, tags: h.tags });
            });

            const copyBtn = document.createElement('button');
            copyBtn.textContent = 'Copy';
            copyBtn.style.padding = '6px';
            copyBtn.style.borderRadius = '6px';
            copyBtn.style.background = '#f3f4f6';
            copyBtn.style.border = 'none';
            copyBtn.style.cursor = 'pointer';
            copyBtn.addEventListener('click', async () => {
                await navigator.clipboard.writeText(`Title: ${h.generatedTitle}\n\nDescription:\n${h.description}\n\nTags:\n${(h.tags||[]).join(', ')}`);
            });

            actions.appendChild(applyBtn);
            actions.appendChild(copyBtn);
            el.appendChild(actions);
            cont.appendChild(el);
        });
    }

    function escapeHtml(s){ return String(s).replace(/[&<>"'`]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;","`":"&#96;"}[c]; }); }
}

function findAlternativeTitleCandidate() {
    try {
        const candidates = querySelectorAllDeep('[id*="title"], [name*="title"], [aria-label*="title"], [placeholder*="title"]');
        for (const c of candidates) {
            const r = refineEditable(c, 'title');
            if (r) return r;
        }
        // fallback: look for small editable elements in the editor area
        const small = querySelectorAllDeep('[contenteditable="true"], input, textarea') || [];
        for (const s of small) {
            try { const len = (s.textContent || s.value || '').length; if (len < 200 && isEditableElement(s)) return s; } catch (e) {}
        }
    } catch (e) { console.warn('findAlternativeTitleCandidate error', e); }
    return null;
}