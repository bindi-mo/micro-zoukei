// ============================================================================
// type definition (Types)
// ============================================================================

export interface ChatMessage {
    sender: 'user' | 'agent';
    text: string;
    timestamp: Date;
}

// ============================================================================
// Private functions (for internal markup generation)
// ============================================================================

/**
 * Generates the initial HTML markup for the chat screen
 */
const createChatMarkup = (): string => {
    return `
    <div class="agent-chat-container" style="display: flex; flex-direction: column; height: 100%; color: #fff; font-family: sans-serif;">
      <!-- header -->
      <div style="padding: 15px; border-bottom: 1px solid #333; background: #252526;">
        <h3 style="margin: 0; font-size: 16px;">🤖 AI Coding Agent</h3>
      </div>

      <!-- Message display area -->
      <div id="chat-message-log" style="flex: 1; padding: 20px; overflow-y: auto; background: #1e1e1e; display: flex; flex-direction: column; gap: 12px;">
        <p id="chat-placeholder" style="color: #888; text-align: center; margin-top: 20px;">Please submit your questions to the AI ​​coding agent here.</p>
      </div>

      <!-- Input footer -->
      <div style="padding: 15px; background: #252526; border-top: 1px solid #333; display: flex; gap: 10px;">
        <input type="text" id="chat-user-input" placeholder="Consult with an agent about the code...."
          style="flex: 1; padding: 10px; background: #3c3c3c; border: 1px solid #555; color: #fff; border-radius: 4px; outline: none;">
        <button id="chat-send-button"
          style="padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
          Send
        </button>
      </div>
    </div>
  `.trim();
};

// ============================================================================
// Public functions (to be called from external files like main.ts)
// ============================================================================

/**
 * Add a new message to the chat log and auto-scroll.
 */
export const appendMessageToLog = (message: ChatMessage): void => {
    const logContainer = document.getElementById('chat-message-log');
    if (!logContainer) return;

    // Once the first message is added, remove the placeholder
    const placeholder = document.getElementById('chat-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    // Generate a message frame
    const msgElement = document.createElement('div');

    // User and AI can switch appearances.
    if (message.sender === 'user') {
        msgElement.style.alignSelf = 'flex-end';
        msgElement.style.backgroundColor = '#007acc';
        msgElement.style.borderRadius = '8px 8px 0 8px';
    } else {
        msgElement.style.alignSelf = 'flex-start';
        msgElement.style.backgroundColor = '#333333';
        msgElement.style.borderRadius = '8px 8px 8px 0';
    }

    // Granting basic styles
    msgElement.style.maxWidth = '70%';
    msgElement.style.padding = '10px 14px';
    msgElement.style.lineHeight = '1.4';
    msgElement.style.wordBreak = 'break-word';
    msgElement.textContent = message.text; // Securely replace for XSS protection

    // Add to log and scroll to the bottom.
    logContainer.appendChild(msgElement);
    logContainer.scrollTop = logContainer.scrollHeight;
};

/**
 * Handles the logic when the send button is clicked or Enter is pressed
 */
export const handleSendMessage = (): void => {
    const inputEl = document.getElementById('chat-user-input') as HTMLInputElement;
    if (!inputEl || inputEl.value.trim() === '') return;

    const userText = inputEl.value;

    // 1. Display the user's message on the screen
    appendMessageToLog({
        sender: 'user',
        text: userText,
        timestamp: new Date()
    });

    // 2. Clear the input field
    inputEl.value = '';

    // 3. AI dummy response (In the future, call ai-service.ts from here)
    setTimeout(() => {
        appendMessageToLog({
            sender: 'agent',
            text: `Regarding "${userText}", I am currently analyzing the codebase...`,
            timestamp: new Date()
        });
    }, 800);
};

/**
 * Generates the chat window and initializes it within the #code-section element
 */
export const setupAgentChatWindow = (): void => {
    const codeSection = document.getElementById('code-section');
    if (!codeSection) {
        console.error('The chat screen could not be initialized because #code-section could not be found.');
        return;
    }

    // If it already exists, do nothing (prevent duplicate creation).
    if (document.getElementById('agent-chat-window')) return;

    // Generate the base for the chat window.
    const chatWindow = document.createElement('div');
    chatWindow.id = 'agent-chat-window';
    chatWindow.style.display = 'none'; // Initially, it is hidden (controlled by setSection).
    chatWindow.style.width = '100%';
    chatWindow.style.height = '100%';
    chatWindow.style.backgroundColor = '#1e1e1e';

    // Inject the markup and add it to the DOM.
    chatWindow.innerHTML = createChatMarkup();
    codeSection.appendChild(chatWindow);

    // Event linking for the submit button
    const sendBtn = chatWindow.querySelector('#chat-send-button');
    sendBtn?.addEventListener('click', handleSendMessage);

    // Linking the Enter key event to an input field
    const inputEl = chatWindow.querySelector('#chat-user-input');
    inputEl?.addEventListener('keydown', (e: Event) => {
        const keyEvent = e as KeyboardEvent;
        // Confirm that you pressed Enter, and not the Enter key used to
        // confirm conversion in Japanese input.
        if (keyEvent.key === 'Enter' && !keyEvent.isComposing) {
            e.preventDefault(); // Prevent default behavior such as line breaks.
            handleSendMessage();
        }
    });

    console.log('The UI for the Agent chat window is now ready.');
};
