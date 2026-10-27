const elements = {
    sidebar: document.getElementById("sidebar"),
    openSidebar: document.getElementById("openSidebar"),
    closeSidebar: document.getElementById("closeSidebar"),
    newChat: document.getElementById("newChat"),
    historyList: document.getElementById("historyList"),
    clearHistory: document.getElementById("clearHistory"),
    welcome: document.getElementById("welcome"),
    messages: document.getElementById("messages"),
    chatForm: document.getElementById("chatForm"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    errorMessage: document.getElementById("errorMessage"),
    toast: document.getElementById("toast")
};

const STORAGE_KEY = "axiom-ai-conversations-v1";
const MAX_CONVERSATIONS = 30;
const MAX_STORED_MESSAGES = 100;
const MAX_HISTORY_MESSAGES = 12;

let conversations = loadConversations();
let activeConversationId = null;
let busy = false;
let toastTimer = null;

function loadConversations() {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        if (!Array.isArray(value)) return [];
        return value.filter(item =>
            item &&
            typeof item.id === "string" &&
            typeof item.title === "string" &&
            Array.isArray(item.messages)
        ).slice(0, MAX_CONVERSATIONS);
    } catch {
        return [];
    }
}

function saveConversations() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS))
        );
    } catch {
        showToast("Browser storage is unavailable. This chat may not be saved.");
    }
}

function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function activeConversation() {
    return conversations.find(item => item.id === activeConversationId) || null;
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        elements.toast.classList.remove("visible");
    }, 2600);
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.add("visible");
}

function clearError() {
    elements.errorMessage.textContent = "";
    elements.errorMessage.classList.remove("visible");
}

function createConversation() {
    const conversation = {
        id: makeId(),
        title: "New conversation",
        messages: [],
        updatedAt: Date.now()
    };

    conversations.unshift(conversation);
    conversations = conversations.slice(0, MAX_CONVERSATIONS);
    activeConversationId = conversation.id;
    saveConversations();
    renderHistory();
    renderConversation();
    elements.messageInput.focus();
    closeSidebar();
}

function renderHistory() {
    elements.historyList.replaceChildren();

    if (!conversations.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = "Your conversations will appear here.";
        elements.historyList.appendChild(empty);
        return;
    }

    for (const conversation of conversations) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-item";
        if (conversation.id === activeConversationId) {
            button.classList.add("active");
        }

        const icon = document.createElement("span");
        icon.textContent = "◌";
        icon.setAttribute("aria-hidden", "true");

        const title = document.createElement("span");
        title.textContent = conversation.title || "New conversation";
        title.title = title.textContent;

        button.append(icon, title);
        button.addEventListener("click", () => {
            activeConversationId = conversation.id;
            renderHistory();
            renderConversation();
            closeSidebar();
        });

        elements.historyList.appendChild(button);
    }
}

function renderConversation() {
    elements.messages.replaceChildren();
    const conversation = activeConversation();
    const hasMessages = Boolean(conversation && conversation.messages.length);

    elements.welcome.hidden = hasMessages;

    if (!conversation) return;

    for (const message of conversation.messages) {
        appendMessage(message.role, message.content);
    }

    scrollToBottom();
}

function appendMessage(role, content, options = {}) {
    const article = document.createElement("article");
    article.className = `message ${role === "user" ? "user" : "assistant"}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "Y" : "A";
    avatar.setAttribute("aria-hidden", "true");

    const contentArea = document.createElement("div");
    contentArea.className = "message-content";

    const author = document.createElement("div");
    author.className = "message-author";
    author.textContent = role === "user" ? "You" : "Axiom AI";

    const body = document.createElement("div");
    body.className = "message-body";

    if (options.typing) {
        const dots = document.createElement("div");
        dots.className = "typing-dots";
        dots.setAttribute("aria-label", "Axiom AI is thinking");

        for (let i = 0; i < 3; i += 1) {
            dots.appendChild(document.createElement("span"));
        }

        body.appendChild(dots);
    } else {
        renderText(body, content);
    }

    contentArea.append(author, body);
    article.append(avatar, contentArea);
    elements.messages.appendChild(article);
    scrollToBottom();

    return article;
}

function renderText(container, text) {
    const lines = String(text).split("\n");
    let paragraph = [];

    function flushParagraph() {
        if (!paragraph.length) return;
        const p = document.createElement("p");
        p.textContent = paragraph.join("\n");
        container.appendChild(p);
        paragraph = [];
    }

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            flushParagraph();
            continue;
        }

        if (trimmed.startsWith("```")) {
            flushParagraph();
            const codeLines = [];
            let foundEnd = false;

            const start = lines.indexOf(line);
            for (let i = start + 1; i < lines.length; i += 1) {
                if (lines[i].trim().startsWith("```")) {
                    foundEnd = true;
                    break;
                }
                codeLines.push(lines[i]);
            }

            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = codeLines.join("\n");
            pre.appendChild(code);

            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "copy-code";
            copy.textContent = "Copy code";
            copy.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(code.textContent);
                    copy.textContent = "Copied";
                } catch {
                    showToast("Unable to copy code in this browser.");
                }
            });

            container.append(copy, pre);

            if (!foundEnd) break;
            const endIndex = lines.indexOf(lines.slice(start + 1).find(item => item.trim().startsWith("```")));
            if (endIndex !== -1) {
                lines.splice(start, endIndex - start + 1);
            }
            return renderTextWithoutBlocks(container, text);
        }

        paragraph.push(line);
    }

    flushParagraph();
}

function renderTextWithoutBlocks(container, text) {
    container.replaceChildren();
    const blocks = String(text).split(/```[\s\S]*?```/g);
    const codeBlocks = String(text).match(/```[\s\S]*?```/g) || [];
    let cursor = 0;

    for (let i = 0; i < blocks.length; i += 1) {
        const block = blocks[i].trim();
        if (block) {
            const p = document.createElement("p");
            p.textContent = block;
            container.appendChild(p);
        }

        if (codeBlocks[i]) {
            const codeText = codeBlocks[i].replace(/^```[^\n]*\n?/, "").replace(/```$/, "").trimEnd();
            const copy = document.createElement("button");
            copy.type = "button";
            copy.className = "copy-code";
            copy.textContent = "Copy code";

            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.textContent = codeText;
            pre.appendChild(code);

            copy.addEventListener("click", async () => {
                try {
                    await navigator.clipboard.writeText(codeText);
                    copy.textContent = "Copied";
                } catch {
                    showToast("Unable to copy code in this browser.");
                }
            });

            container.append(copy, pre);
        }

        cursor += block.length;
    }
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        elements.chatForm.scrollIntoView({ block: "end", behavior: "smooth" });
    });
}

function setBusy(value) {
    busy = value;
    elements.sendButton.disabled = value;
    elements.messageInput.disabled = value;
    elements.sendButton.querySelector("span").textContent = value ? "…" : "↑";
}

function updateConversationTitle(conversation) {
    const firstUserMessage = conversation.messages.find(message => message.role === "user");
    if (firstUserMessage) {
        conversation.title = firstUserMessage.content
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 38) || "New conversation";
    }
    conversation.updatedAt = Date.now();
}

async function sendMessage(text) {
    if (busy) return;

    const message = text.trim();
    if (!message) return;

    if (message.length > 4000) {
        showError("Please keep your message under 4,000 characters.");
        return;
    }

    clearError();

    if (!activeConversation()) {
        createConversation();
    }

    const conversation = activeConversation();
    const previousMessages = conversation.messages.slice(-MAX_HISTORY_MESSAGES);

    conversation.messages.push({ role: "user", content: message });
    updateConversationTitle(conversation);
    saveConversations();
    renderHistory();
    renderConversation();

    elements.messageInput.value = "";
    resizeInput();
    setBusy(true);
    const typing = appendMessage("assistant", "", { typing: true });

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message,
                history: previousMessages
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || `Request failed (${response.status}).`);
        }

        const reply = typeof result.reply === "string" ? result.reply.trim() : "";
        if (!reply) throw new Error("Axiom AI returned an empty response.");

        typing.remove();
        conversation.messages.push({ role: "assistant", content: reply });
        conversation.messages = conversation.messages.slice(-MAX_STORED_MESSAGES);
        updateConversationTitle(conversation);
        saveConversations();
        renderHistory();
        renderConversation();
    } catch (error) {
        typing.remove();
        showError(error.message || "Something went wrong. Please try again.");
        conversation.messages.pop();
        saveConversations();
        renderConversation();
    } finally {
        setBusy(false);
        elements.messageInput.focus();
    }
}

function resizeInput() {
    elements.messageInput.style.height = "auto";
    elements.messageInput.style.height =
        `${Math.min(elements.messageInput.scrollHeight, 180)}px`;
}

function closeSidebar() {
    elements.sidebar.classList.remove("open");
}

elements.chatForm.addEventListener("submit", event => {
    event.preventDefault();
    sendMessage(elements.messageInput.value);
});

elements.messageInput.addEventListener("input", resizeInput);

elements.messageInput.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        elements.chatForm.requestSubmit();
    }
});

elements.newChat.addEventListener("click", createConversation);

elements.clearHistory.addEventListener("click", () => {
    if (!conversations.length) {
        showToast("There is no saved history to clear.");
        return;
    }

    if (!window.confirm("Clear all Axiom AI conversations saved in this browser?")) {
        return;
    }

    conversations = [];
    activeConversationId = null;
    saveConversations();
    renderHistory();
    renderConversation();
    clearError();
    showToast("Browser conversation history cleared.");
});

elements.openSidebar.addEventListener("click", () => {
    elements.sidebar.classList.add("open");
});

elements.closeSidebar.addEventListener("click", closeSidebar);

document.querySelectorAll(".suggestion").forEach(button => {
    button.addEventListener("click", () => {
        elements.messageInput.value = button.dataset.prompt || "";
        resizeInput();
        elements.messageInput.focus();
    });
});

window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEY) {
        conversations = loadConversations();
        if (!conversations.some(item => item.id === activeConversationId)) {
            activeConversationId = null;
        }
        renderHistory();
        renderConversation();
    }
});

renderHistory();
renderConversation();
