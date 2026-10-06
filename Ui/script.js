import { checkAPI, fetchModels } from './Logic/fetchAPI.js';
import { routePromptToModels } from './Logic/router.js';
import { saveChatHistory, loadAllChatHistories, clearAllChatHistories } from './Logic/indexDB.js';

let AVAILABLE_MODELS = [];

const savedActive = sessionStorage.getItem('common_ai_active_models');
let activeModels = savedActive ? new Set(JSON.parse(savedActive)) : new Set();
let chatHistories = {}; /*/ Store chat histories per model /*/

/*/ Initialize UI /*/
const modelSelector = document.getElementById('modelSelector');
const modelSearchInput = document.getElementById('modelSearchInput');
const freeOnlyToggle = document.getElementById('freeOnlyToggle');
const chatGrid = document.getElementById('chatGrid');
const promptInput = document.getElementById('promptInput');
const sendBtn = document.getElementById('sendBtn');

/*/ Settings Elements /*/
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const openRouterKeyInput = document.getElementById('openRouterKey');
const masterDeleteBtn = document.getElementById('masterDeleteBtn');

/*/ Delete Modal DOM /*/
const deleteModal = document.getElementById('deleteModal');
const closeDeleteBtn = document.getElementById('closeDeleteBtn');
const deleteModalText = document.getElementById('deleteModalText');
const deleteConfirmInput = document.getElementById('deleteConfirmInput');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
let modelToDelete = null;

/*/ Load API Keys from LocalStorage /*/
let apiKeys = {
    openrouter: localStorage.getItem('common_ai_openrouter_key') || ''
};

async function init() {
    /*/ Load persisted chat histories from IndexedDB first /*/
    chatHistories = await loadAllChatHistories();
    
    freeOnlyToggle.checked = showFreeOnly;
    if (apiKeys.openrouter) {
        await loadModels(apiKeys.openrouter);
    }
    renderModelSelector();
    renderChatGrid();
    setupEventListeners();
}

async function loadModels(key) {
    const checkResult = await checkAPI(key);
    if (!checkResult.valid) {
        return { success: false, error: checkResult.error };
    }
    
    const models = await fetchModels(key);
    if (models) {
        /*/ Replace existing models entirely with fetched models /*/
        AVAILABLE_MODELS = models;
        
        /*/ Auto-select the first model if available and we have room /*/
        if (models.length > 0 && activeModels.size === 0) {
            activeModels.add(models[0].id);
            sessionStorage.setItem('common_ai_active_models', JSON.stringify([...activeModels]));
        }
        return { success: true };
    }
    return { success: false, error: 'Failed to fetch models list.' };
}

let modelSearchQuery = '';
let showFreeOnly = sessionStorage.getItem('common_ai_free_only') === 'true';

function renderModelSelector() {
    modelSelector.innerHTML = '';
    
    const filteredModels = AVAILABLE_MODELS.filter(model => {
        const matchesSearch = model.name.toLowerCase().includes(modelSearchQuery.toLowerCase()) || 
                              model.company.toLowerCase().includes(modelSearchQuery.toLowerCase());
        const matchesFree = showFreeOnly ? model.isFree : true;
        /*/ Always show the model if it is currently active, so the user can deselect it /*/
        return matchesSearch && (matchesFree || activeModels.has(model.id));
    });

    filteredModels.forEach(model => {
        const isActive = activeModels.has(model.id);
        const el = document.createElement('div');
        el.className = `model-toggle ${isActive ? 'active' : ''}`;
        el.innerHTML = `
            <div class="model-info">
                <div class="model-dot"></div>
                <div>
                    <div style="font-size: 14px; font-weight: 500;">${model.name}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${model.company}</div>
                </div>
            </div>
        `;
        el.addEventListener('click', () => toggleModel(model.id));
        modelSelector.appendChild(el);
    });
}

function toggleModel(id) {
    if (activeModels.has(id)) {
        activeModels.delete(id);
    } else {
        if(activeModels.size >= 4) {
            alert("Maximum 4 models allowed simultaneously for UI constraints.");
            return;
        }
        activeModels.add(id);
    }
    sessionStorage.setItem('common_ai_active_models', JSON.stringify([...activeModels]));
    renderModelSelector();
    renderChatGrid();
}

function renderChatGrid() {
    if (activeModels.size === 0) {
        chatGrid.className = 'chat-grid';
        chatGrid.innerHTML = `
            <div class="empty-state">
                <h2>No models selected</h2>
                <p>Please select at least one model from the sidebar to begin.</p>
            </div>`;
        return;
    }

    chatGrid.className = `chat-grid layout-${activeModels.size}`;
    chatGrid.innerHTML = '';

    AVAILABLE_MODELS.forEach(model => {
        if (!activeModels.has(model.id)) return;
        
        const col = document.createElement('div');
        col.className = 'model-column';
        col.innerHTML = `
            <div class="column-header" style="justify-content: space-between;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="model-dot" style="background: #fff; box-shadow: 0 0 8px rgba(255, 255, 255, 0.8);"></div>
                    ${model.name}
                </div>
                <button class="column-clear-btn" title="Clear chat history">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
            <div class="column-body" id="chat-${model.id}">
            </div>
        `;
        
        const clearBtn = col.querySelector('.column-clear-btn');
        clearBtn.addEventListener('click', () => {
            modelToDelete = model.id;
            deleteModalText.innerHTML = `Type <strong>DELETE</strong> to confirm clearing chat history for <strong>${model.name}</strong>.`;
            deleteConfirmInput.value = '';
            
            /*/ Reset error state when opening /*/
            const errorText = document.getElementById('deleteErrorText');
            if (errorText) errorText.style.display = 'none';
            const modalContent = deleteModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.remove('shake');
            
            deleteModal.classList.add('active');
        });

        chatGrid.appendChild(col);
        
        /*/ Render existing history securely and with Markdown support /*/
        if (chatHistories[model.id]) {
            /*/ Make a shallow copy so we don't duplicate when iterating /*/
            const historyToRender = [...chatHistories[model.id]];
            chatHistories[model.id] = []; /*/ Clear to avoid duplicates from appendMessage /*/
            
            historyToRender.forEach(msg => {
                appendMessage(model.id, msg.role, msg.content, null, true);
            });
        }
    });
}

function appendMessage(modelId, role, content, rawError = null, isRestore = false) {
    if (!chatHistories[modelId]) chatHistories[modelId] = [];
    
    if (!isRestore) {
        chatHistories[modelId].push({ role, content });
        saveChatHistory(modelId, chatHistories[modelId]);
    } else {
        /*/ If it's restore, just push it back so state is correct, don't trigger DB save again /*/
        chatHistories[modelId].push({ role, content });
    }
    
    const container = document.getElementById(`chat-${modelId}`);
    if (container) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`;
        
        if (role === 'ai') {
            try {
                const rawHtml = marked.parse(content);
                const cleanHtml = DOMPurify.sanitize(rawHtml);
                const mdContainer = document.createElement('div');
                mdContainer.className = 'markdown-body';
                mdContainer.innerHTML = cleanHtml;
                
                if (window.renderMathInElement) {
                    renderMathInElement(mdContainer, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '\\[', right: '\\]', display: true}
                        ],
                        throwOnError: false
                    });
                }
                msgDiv.appendChild(mdContainer);
            } catch (err) {
                /*/ Fallback if libraries fail to load /*/
                msgDiv.appendChild(document.createTextNode(content));
            }
        } else {
            /*/ Create text node for safe text rendering (prevents XSS) /*/
            msgDiv.appendChild(document.createTextNode(content));
        }
        
        if (rawError) {
            /*/ Escape rawError string for use in HTML attribute /*/
            const escapedError = rawError.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const btnContainer = document.createElement('div');
            btnContainer.style.marginTop = '8px';
            btnContainer.innerHTML = `
                <button class="error-details-btn" onclick="alert(this.dataset.error)" data-error="${escapedError}" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 4px 8px; border-radius: 4px; font-size: 11px; cursor: pointer;">
                    Show Real Error Code
                </button>
            `;
            msgDiv.appendChild(btnContainer);
        }
        
        container.appendChild(msgDiv);
        container.scrollTop = container.scrollHeight;
    }
}

function showTypingIndicator(modelId) {
    const container = document.getElementById(`chat-${modelId}`);
    if (container) {
        /*/ Remove any existing indicator first /*/
        removeTypingIndicator(modelId);
        
        const indicator = document.createElement('div');
        indicator.id = `typing-${modelId}`;
        indicator.className = 'typing-indicator';
        indicator.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
    }
}

function removeTypingIndicator(modelId) {
    const indicator = document.getElementById(`typing-${modelId}`);
    if (indicator) {
        indicator.remove();
    }
}

function setupEventListeners() {
    modelSearchInput.addEventListener('input', (e) => {
        modelSearchQuery = e.target.value.trim();
        renderModelSelector();
    });

    freeOnlyToggle.addEventListener('change', (e) => {
        showFreeOnly = e.target.checked;
        sessionStorage.setItem('common_ai_free_only', showFreeOnly);
        renderModelSelector();
    });

    promptInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        sendBtn.disabled = this.value.trim() === '';
    });

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) handleSend();
        }
    });

    sendBtn.addEventListener('click', handleSend);

    /*/ Settings Modal Listeners /*/
    settingsBtn.addEventListener('click', () => {
        openRouterKeyInput.value = apiKeys.openrouter;
        settingsModal.classList.add('active');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const key = openRouterKeyInput.value.trim();
        const apiErrorText = document.getElementById('apiErrorText');
        
        /*/ If user clears the input, clear the key and remove models /*/
        if (!key) {
            apiKeys.openrouter = '';
            localStorage.removeItem('common_ai_openrouter_key');
            AVAILABLE_MODELS = [];
            activeModels.clear();
            sessionStorage.removeItem('common_ai_active_models');
            
            renderModelSelector();
            renderChatGrid();
            settingsModal.classList.remove('active');
            return;
        }

        saveSettingsBtn.textContent = 'Validating...';
        saveSettingsBtn.disabled = true;
        apiErrorText.style.display = 'none';

        const result = await loadModels(key);
        
        if (result.success) {
            apiKeys.openrouter = key;
            localStorage.setItem('common_ai_openrouter_key', key);
            
            renderModelSelector();
            renderChatGrid();
            
            saveSettingsBtn.textContent = 'Saved!';
            setTimeout(() => {
                saveSettingsBtn.textContent = 'Save Keys';
                saveSettingsBtn.disabled = false;
                settingsModal.classList.remove('active');
            }, 1000);
        } else {
            apiErrorText.textContent = `Error: ${result.error}`;
            apiErrorText.style.display = 'block';
            saveSettingsBtn.textContent = 'Save Keys';
            saveSettingsBtn.disabled = false;
        }
    });

    /*/ Delete Modal Event Listeners /*/
    closeDeleteBtn.addEventListener('click', () => {
        deleteModal.classList.remove('active');
        modelToDelete = null;
    });

    deleteConfirmInput.addEventListener('input', () => {
        /*/ Hide the error text if they start typing again /*/
        const errorText = document.getElementById('deleteErrorText');
        if (errorText) errorText.style.display = 'none';
    });

    confirmDeleteBtn.addEventListener('click', async () => {
        const val = deleteConfirmInput.value.toUpperCase();
        
        /*/ If they type wrong, show error and shake /*/
        if (val !== 'DELETE') {
            const errorText = document.getElementById('deleteErrorText');
            if (errorText) errorText.style.display = 'block';
            
            const modalContent = deleteModal.querySelector('.modal-content');
            if (modalContent) {
                modalContent.classList.remove('shake');
                void modalContent.offsetWidth; /*/ Trigger reflow to restart animation /*/
                modalContent.classList.add('shake');
            }
            return;
        }

        if (modelToDelete === 'ALL') {
            chatHistories = {};
            await clearAllChatHistories();
            document.querySelectorAll('.column-body').forEach(container => {
                container.innerHTML = '';
            });
            deleteModal.classList.remove('active');
            modelToDelete = null;
        } else if (modelToDelete) {
            chatHistories[modelToDelete] = [];
            saveChatHistory(modelToDelete, []);
            const container = document.getElementById(`chat-${modelToDelete}`);
            if (container) container.innerHTML = '';
            
            deleteModal.classList.remove('active');
            modelToDelete = null;
        }
    });

    if (masterDeleteBtn) {
        masterDeleteBtn.addEventListener('click', () => {
            modelToDelete = 'ALL';
            deleteModalText.innerHTML = `Type <strong>DELETE</strong> to confirm clearing <strong>ALL chat histories for every model</strong>.`;
            deleteConfirmInput.value = '';
            
            const errorText = document.getElementById('deleteErrorText');
            if (errorText) errorText.style.display = 'none';
            const modalContent = deleteModal.querySelector('.modal-content');
            if (modalContent) modalContent.classList.remove('shake');
            
            deleteModal.classList.add('active');
        });
    }
}

async function handleSend() {
    const text = promptInput.value.trim();
    if (!text || activeModels.size === 0) return;

    promptInput.value = '';
    promptInput.style.height = 'auto';
    sendBtn.disabled = true;

    /*/ Append user message to all active columns and show typing indicator /*/
    activeModels.forEach(id => {
        appendMessage(id, 'user', text);
        showTypingIndicator(id);
    });

    /*/ Convert Set to Array and send requests via Router /*/
    const modelsList = Array.from(activeModels);
    
    /*/ Pass the FULL chat histories so the models have conversational context /*/
    await routePromptToModels(apiKeys.openrouter, modelsList, chatHistories, (modelId, responseContent, isError, rawError) => {
        removeTypingIndicator(modelId);
        if (isError) {
            appendMessage(modelId, 'error', responseContent, rawError);
        } else {
            appendMessage(modelId, 'ai', responseContent);
        }
    });

    sendBtn.disabled = false;
}

init();
