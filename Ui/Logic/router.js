import { askChat } from './fetchAPI.js';
import { systemPrompt } from './systemPrompt.js';

/*/ 
 * Routes the user prompt to all selected models simultaneously.
 * @param {string} apiKey - The OpenRouter API key.
 * @param {Array<string>} activeModels - The list of selected model IDs.
 * @param {Object} chatHistories - The dictionary of chat histories.
 * @param {Function} onResponse - Callback when a model responds: (modelId, responseContent, isError)
 /*/
export async function routePromptToModels(apiKey, activeModels, chatHistories, onResponse) {

    /*/ Execute all requests in parallel to avoid race conditions and fetch instantly /*/
    const fetchPromises = activeModels.map(async (modelId) => {
        
        const history = chatHistories[modelId] || [];
        
        const messages = [
            { role: "system", content: systemPrompt }
        ];

        /*/ Map the UI chat history to OpenRouter roles /*/
        history.forEach(msg => {
            if (msg.role === 'user') {
                messages.push({ role: 'user', content: msg.content });
            } else if (msg.role === 'ai') {
                messages.push({ role: 'assistant', content: msg.content });
            }
        });

        const result = await askChat(apiKey, modelId, messages);
        
        if (result.success) {
            onResponse(modelId, result.content, false);
        } else {
            onResponse(modelId, result.error, true, result.rawError);
        }
    });

    /*/ Wait for all API requests to complete /*/
    await Promise.all(fetchPromises);
}
