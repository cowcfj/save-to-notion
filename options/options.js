document.addEventListener('DOMContentLoaded', () => {
    const apiKeyInput = document.getElementById('api-key');
    const databaseIdInput = document.getElementById('database-id');
    const saveButton = document.getElementById('save-button');
    const status = document.getElementById('status');

    // Load saved settings
    chrome.storage.sync.get(['notionApiKey', 'notionDatabaseId'], (result) => {
        if (result.notionApiKey) {
            apiKeyInput.value = result.notionApiKey;
        }
        if (result.notionDatabaseId) {
            databaseIdInput.value = result.notionDatabaseId;
        }
    });

    saveButton.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        let databaseId = databaseIdInput.value.trim();

        if (apiKey && databaseId) {
            // Clean the database ID: remove query parameters like ?v=...
            const queryParamIndex = databaseId.indexOf('?');
            if (queryParamIndex !== -1) {
                databaseId = databaseId.substring(0, queryParamIndex);
            }
            // Also remove hyphens, some Notion links have them
            databaseId = databaseId.replace(/-/g, '');

            // Update the input field to show the cleaned ID
            databaseIdInput.value = databaseId;

            chrome.storage.sync.set({
                notionApiKey: apiKey,
                notionDatabaseId: databaseId
            }, () => {
                status.textContent = 'Settings saved successfully!';
                status.style.color = 'green';
                setTimeout(() => {
                    status.textContent = '';
                }, 2000);
            });
        } else {
            status.textContent = 'Please fill in both fields.';
            status.style.color = 'red';
        }
    });
});