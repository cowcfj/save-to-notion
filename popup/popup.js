document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('save-button');
    const status = document.getElementById('status');

    // Check for API key and Database ID on popup open
    chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (result) => {
        if (!result.notionApiKey || !result.notionDatabaseId) {
            status.textContent = 'Please set API Key and Database ID in settings.';
            saveButton.disabled = true;
        }
    });

    saveButton.addEventListener('click', () => {
        status.textContent = 'Saving...';
        saveButton.disabled = true;

        // Send a message to the background script to start the saving process
        chrome.runtime.sendMessage({ action: 'savePage' }, (response) => {
            if (chrome.runtime.lastError) {
                // Handle potential errors (e.g., background script not ready)
                status.textContent = `Error: ${chrome.runtime.lastError.message}`;
                console.error(chrome.runtime.lastError);
            } else if (response && response.success) {
                const imageCount = response.imageCount || 0;
                const blockCount = response.blockCount || 0;
                status.textContent = `Saved successfully! (${blockCount} blocks, ${imageCount} images)`;
            } else {
                status.textContent = `Failed to save: ${response ? response.error : 'No response'}`;
                console.error('Error from background script:', response ? response.error : 'No response');
            }
            
            // Re-enable the button after a short delay
            setTimeout(() => {
                saveButton.disabled = false;
                // Optionally reset status text
                // status.textContent = 'Ready to save.';
            }, 3000);
        });
    });
});
