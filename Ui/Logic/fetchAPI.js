/*/ *
 * Helper file for API calls (OpenRouter) /*/

/*/
 * Checks if the API key is valid.
 * @param {string} apiKey - The OpenRouter API Key
 * @returns {Promise<{valid: boolean, error?: string}>}
 /*/
export async function checkAPI(apiKey) {
    if (!apiKey) return { valid: false, error: 'No API key provided.' };
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            return { valid: true };
        } else {
            const err = await response.json();
            return { valid: false, error: err.error?.message || `API Error: ${response.status}` };
        }
    } catch (error) {
        console.error("API Check Error:", error);
        return { valid: false, error: 'Network error or CORS issue. Check browser console.' };
    }
}

/*/
 * Fetches available FREE tier models from OpenRouter.
 * @param {string} apiKey - The OpenRouter API Key
 * @returns {Promise<Array|null>} Array of models if valid, null if invalid.
 /*/
export async function fetchModels(apiKey) {
    if (!apiKey) return null;
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Common AI Chat'
            }
        });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        /*/ Tag models with isFree based on OpenRouter pricing data /*/
        const models = data.data
            .map(model => {
                const promptCost = parseFloat(model.pricing?.prompt || "1");
                const completionCost = parseFloat(model.pricing?.completion || "1");
                const isFree = (promptCost === 0 && completionCost === 0);
                
                /*/ OpenRouter IDs look like "google/gemini-flash-1.5" /*/
                const companyName = model.id.split('/')[0];
                return {
                    id: model.id,
                    name: model.name || model.id,
                    company: companyName.charAt(0).toUpperCase() + companyName.slice(1),
                    isFree: isFree
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name)); /*/ Alphabetical sorting /*/
            
        return models;
    } catch (error) {
        console.error("Fetch Models Error:", error);
        return null;
    }
}

/*/ 
 * Sends a chat request to a specific model.
 * @param {string} apiKey - The OpenRouter API Key
 * @param {string} modelId - The OpenRouter model ID
 * @param {Array} messages - Array of message objects {role, content}
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 /*/
export async function askChat(apiKey, modelId, messages) {
    if (!apiKey) return { success: false, error: 'No API key provided.' };
    
    try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Common AI Chat'
            },
            body: JSON.stringify({
                model: modelId,
                messages: messages,
                max_tokens: 1000
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            return { success: true, content: data.choices[0].message.content };
        } else {
            const err = await response.json();
            return { 
                success: false, 
                error: err.error?.message || `API Error: ${response.status}`,
                rawError: JSON.stringify(err, null, 2)
            };
        }
    } catch (error) {
        console.error(`Ask Chat Error [${modelId}]:`, error);
        return { 
            success: false, 
            error: 'Network error or CORS issue.',
            rawError: String(error)
        };
    }
}
