const API_KEY_STORAGE_KEY = 'blogcutter_api_key';

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('api-key-input');
    const saveBtn = document.getElementById('save-api-key-btn');
    const status = document.getElementById('status-message');

    // Load saved key (mask it)
    chrome.storage.local.get([API_KEY_STORAGE_KEY], (res) => {
        const savedKey = res[API_KEY_STORAGE_KEY];
        if (savedKey) {
            input.value = '******** (Saved)';
            input.disabled = true;
            status.textContent = 'API Key is saved and ready.';
            status.className = 'text-sm text-green-600';
            status.classList.remove('hidden');
        }
    });

    saveBtn.addEventListener('click', () => {
        let apiKey = input.value.trim();
        if (apiKey === '******** (Saved)') {
            // no change
            status.textContent = 'No changes.';
            status.className = 'text-sm text-gray-600';
            status.classList.remove('hidden');
            return;
        }
        if (apiKey && apiKey.length > 10) { // Basic validation (adjust as needed)
            chrome.storage.local.set({ [API_KEY_STORAGE_KEY]: apiKey }, () => {
                input.value = '******** (Saved)';
                input.disabled = true;
                status.textContent = 'API Key saved successfully!';
                status.className = 'text-sm text-green-600';
                status.classList.remove('hidden');
            });
        } else {
            status.textContent = 'Please enter a valid API key (at least 10 characters).';
            status.className = 'text-sm text-red-600';
            status.classList.remove('hidden');
        }
    });
});