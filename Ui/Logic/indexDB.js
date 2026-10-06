/*/
 * Manages storing and retrieving chat histories from IndexedDB.
 /*/

const DB_NAME = 'CommonAIChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'chatHistories';

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'modelId' });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

/*/ 
 * Saves the chat history array for a specific model ID.
 * @param {string} modelId 
 * @param {Array} historyArray 
 /*/
export async function saveChatHistory(modelId, historyArray) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.put({ modelId, history: historyArray });
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('IndexedDB Save Error:', e);
    }
}

/*/ 
 * Loads the chat history array for a specific model ID.
 * @param {string} modelId 
 * @returns {Promise<Array>}
 /*/
export async function loadChatHistory(modelId) {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.get(modelId);
            
            request.onsuccess = () => {
                if (request.result) {
                    resolve(request.result.history);
                } else {
                    resolve([]);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('IndexedDB Load Error:', e);
        return [];
    }
}

/*/
 * Loads all chat histories at once.
 * @returns {Promise<Object>} An object mapping modelId -> historyArray
 /*/
export async function loadAllChatHistories() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.getAll();
            
            request.onsuccess = () => {
                const result = {};
                request.result.forEach(item => {
                    result[item.modelId] = item.history;
                });
                resolve(result);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('IndexedDB LoadAll Error:', e);
        return {};
    }
}

/*/
 * Clears all chat histories from the database.
 /*/
export async function clearAllChatHistories() {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('IndexedDB Clear Error:', e);
    }
}
