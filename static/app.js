const elements = {
    sidebar: document.getElementById("sidebar"),
    openSidebar: document.getElementById("openSidebar"),
    closeSidebar: document.getElementById("closeSidebar"),
    newChat: document.getElementById("newChat"),
    historyList: document.getElementById("historyList"),
    conversationSearch: document.getElementById("conversationSearch"),
    clearHistory: document.getElementById("clearHistory"),
    memoryEnabled: document.getElementById("memoryEnabled"),
    memoryInput: document.getElementById("memoryInput"),
    saveMemory: document.getElementById("saveMemory"),
    memoryList: document.getElementById("memoryList"),
    clearMemories: document.getElementById("clearMemories"),
    welcome: document.getElementById("welcome"),
    messages: document.getElementById("messages"),
    chatForm: document.getElementById("chatForm"),
    messageInput: document.getElementById("messageInput"),
    sendButton: document.getElementById("sendButton"),
    imageButton: document.getElementById("imageButton"),
    languageSelect: document.getElementById("languageSelect"),
    voiceButton: document.getElementById("voiceButton"),
    speakButton: document.getElementById("speakButton"),
    stopSpeakingButton: document.getElementById("stopSpeakingButton"),
    errorMessage: document.getElementById("errorMessage"),
    toast: document.getElementById("toast")
};

const STORAGE_KEY = "axiom-ai-conversations-v1";
const MEMORY_STORAGE_KEY = "axiom-ai-memories-v1";
const MEMORY_ENABLED_KEY = "axiom-ai-memory-enabled-v1";
const MAX_MEMORIES = 10;
const MAX_MEMORY_LENGTH = 200;
const MAX_CONVERSATIONS = 30;
const MAX_STORED_MESSAGES = 100;
const MAX_HISTORY_MESSAGES = 12;
const LANGUAGE_STORAGE_KEY = "axiom-ai-language-v1";
const SUPPORTED_LANGUAGE_CODES = new Set(["en", "tw", "ee", "dag", "fat", "gaa"]);

let selectedLanguage = (() => {
    try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        return SUPPORTED_LANGUAGE_CODES.has(saved) ? saved : "en";
    } catch {
        return "en";
    }
})();

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
        return true;
    } catch {
        showToast("Browser storage is unavailable. This chat may not be saved.");
        return false;
    }
}

function loadMemories() {
    try {
        const saved = JSON.parse(localStorage.getItem(MEMORY_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved
            .filter(item => typeof item === "string" && item.trim())
            .map(item => item.trim().slice(0, MAX_MEMORY_LENGTH))
            .slice(0, MAX_MEMORIES);
    } catch {
        return [];
    }
}

function saveMemories() {
    try {
        localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(memories));
        return true;
    } catch {
        showToast("Memory could not be saved in this browser.");
        return false;
    }
}

function loadMemoryEnabled() {
    try {
        return localStorage.getItem(MEMORY_ENABLED_KEY) === "true";
    } catch {
        return false;
    }
}

let memories = loadMemories();
let memoryEnabled = loadMemoryEnabled();

function renderMemories() {
    elements.memoryEnabled.checked = memoryEnabled;
    elements.memoryList.replaceChildren();

    if (!memories.length) {
        const empty = document.createElement("p");
        empty.textContent = "No saved memories yet.";
        elements.memoryList.appendChild(empty);
        return;
    }

    memories.forEach((memory, index) => {
        const row = document.createElement("div");
        const text = document.createElement("span");
        text.textContent = memory;

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";
        edit.setAttribute("aria-label", `Edit memory ${index + 1}`);
        edit.addEventListener("click", () => {
            const updated = window.prompt("Edit this memory:", memories[index]);
            if (updated === null) return;

            const value = updated.trim().slice(0, MAX_MEMORY_LENGTH);
            if (!value) {
                showToast("Memory cannot be empty. Use Delete to remove it.");
                return;
            }

            if (memories.some((item, otherIndex) =>
                otherIndex !== index && item.toLowerCase() === value.toLowerCase()
            )) {
                showToast("That memory is already saved.");
                return;
            }

            const previous = memories[index];
            memories[index] = value;
            if (saveMemories()) {
                renderMemories();
                showToast("Memory updated.");
            } else {
                memories[index] = previous;
            }
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.setAttribute("aria-label", `Delete memory ${index + 1}`);
        remove.addEventListener("click", () => {
            if (!window.confirm("Delete this saved memory?")) return;

            const previous = memories.slice();
            memories.splice(index, 1);
            if (saveMemories()) {
                renderMemories();
                showToast("Memory deleted.");
            } else {
                memories = previous;
                renderMemories();
            }
        });

        row.append(text, edit, remove);
        elements.memoryList.appendChild(row);
    });
}

elements.saveMemory.addEventListener("click", () => {
    const value = elements.memoryInput.value.trim().slice(0, MAX_MEMORY_LENGTH);

    if (!value) {
        showToast("Enter a memory first.");
        return;
    }

    if (memories.length >= MAX_MEMORIES) {
        showToast("You can save up to 10 memories. Delete one first.");
        return;
    }

    if (memories.some(item => item.toLowerCase() === value.toLowerCase())) {
        showToast("That memory is already saved.");
        return;
    }

    memories.push(value);
    if (saveMemories()) {
        elements.memoryInput.value = "";
        renderMemories();
        showToast("Memory saved in this browser.");
    } else {
        memories.pop();
    }
});

elements.memoryEnabled.addEventListener("change", () => {
    memoryEnabled = elements.memoryEnabled.checked;
    try {
        localStorage.setItem(MEMORY_ENABLED_KEY, String(memoryEnabled));
        showToast(memoryEnabled
            ? "Saved memories will be included in chat requests."
            : "Saved memories are disabled for chat requests.");
    } catch {
        memoryEnabled = false;
        elements.memoryEnabled.checked = false;
        showToast("Memory preference could not be saved.");
    }
});

elements.clearMemories.addEventListener("click", () => {
    if (!memories.length) {
        showToast("There are no saved memories to delete.");
        return;
    }

    if (!window.confirm("Delete all saved memories from this browser?")) return;

    const previous = memories;
    memories = [];
    if (saveMemories()) {
        renderMemories();
        showToast("All saved memories deleted.");
    } else {
        memories = previous;
        renderMemories();
    }
});

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

    const query = elements.conversationSearch.value.trim().toLowerCase();
    const ordered = [...conversations].sort((a, b) =>
        Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
        (b.updatedAt || 0) - (a.updatedAt || 0)
    );
    const visible = ordered.filter(conversation =>
        (conversation.title || "New conversation").toLowerCase().includes(query)
    );

    if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent = conversations.length
            ? "No conversations match your search."
            : "Your conversations will appear here.";
        elements.historyList.appendChild(empty);
        return;
    }

    for (const conversation of visible) {
        const row = document.createElement("div");
        row.className = "history-row";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "history-item";
        if (conversation.id === activeConversationId) {
            button.classList.add("active");
        }

        const icon = document.createElement("span");
        icon.textContent = conversation.pinned ? "📌" : "◌";
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

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const pin = document.createElement("button");
        pin.type = "button";
        pin.textContent = conversation.pinned ? "Unpin" : "Pin";
        pin.setAttribute(
            "aria-label",
            `${conversation.pinned ? "Unpin" : "Pin"} ${conversation.title || "conversation"}`
        );
        pin.addEventListener("click", () => {
            conversation.pinned = !conversation.pinned;
            if (saveConversations()) {
                renderHistory();
                showToast(conversation.pinned ? "Conversation pinned." : "Conversation unpinned.");
            } else {
                conversation.pinned = !conversation.pinned;
                renderHistory();
            }
        });

        const rename = document.createElement("button");
        rename.type = "button";
        rename.textContent = "Rename";
        rename.addEventListener("click", () => {
            const updated = window.prompt(
                "Rename conversation:",
                conversation.title || "New conversation"
            );
            if (updated === null) return;

            const value = updated.trim().slice(0, 80);
            if (!value) {
                showToast("Conversation title cannot be empty.");
                return;
            }

            const previousTitle = conversation.title;
            const previousUpdatedAt = conversation.updatedAt;
            conversation.title = value;
            conversation.updatedAt = Date.now();

            if (saveConversations()) {
                renderHistory();
                showToast("Conversation renamed.");
            } else {
                conversation.title = previousTitle;
                conversation.updatedAt = previousUpdatedAt;
                renderHistory();
            }
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => {
            if (!window.confirm(
                `Delete "${conversation.title || "New conversation"}"? This cannot be undone.`
            )) return;

            const previousConversations = conversations;
            const previousActiveId = activeConversationId;

            conversations = conversations.filter(item => item.id !== conversation.id);
            if (activeConversationId === conversation.id) {
                activeConversationId = null;
            }

            if (saveConversations()) {
                renderHistory();
                renderConversation();
                showToast("Conversation deleted.");
            } else {
                conversations = previousConversations;
                activeConversationId = previousActiveId;
                renderHistory();
                renderConversation();
            }
        });

        actions.append(pin, rename, remove);
        row.append(button, actions);
        elements.historyList.appendChild(row);
    }
}

function renderConversation() {
    elements.messages.replaceChildren();
    const conversation = activeConversation();
    const hasMessages = Boolean(conversation && conversation.messages.length);

    elements.welcome.hidden = hasMessages;

    if (!conversation) return;

    for (const message of conversation.messages) {
        appendMessage(message.role, message.content, { sources: message.sources });
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

    if (role !== "user" && Array.isArray(options.sources)) {
        const safeSources = options.sources.filter((source) => {
            if (!source || typeof source.url !== "string") return false;
            try {
                const url = new URL(source.url);
                return url.protocol === "https:" || url.protocol === "http:";
            } catch {
                return false;
            }
        }).slice(0, 10);

        if (safeSources.length) {
            const section = document.createElement("section");
            section.className = "message-sources";

            const heading = document.createElement("p");
            heading.textContent = "Sources";
            section.appendChild(heading);

            const list = document.createElement("ul");

            for (const source of safeSources) {
                const item = document.createElement("li");
                const link = document.createElement("a");
                const url = new URL(source.url);

                link.href = url.href;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = (
                    typeof source.title === "string" && source.title.trim()
                        ? source.title.trim().slice(0, 200)
                        : url.hostname
                );

                item.appendChild(link);
                list.appendChild(item);
            }

            section.appendChild(list);
            contentArea.appendChild(section);
        }
    }
    article.append(avatar, contentArea);
    elements.messages.appendChild(article);
    scrollToBottom();

    return article;
}

function cleanMarkdownText(text) {
    return String(text)
        .replace(/^\s{0,3}#{1,6}\s+/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*>\s?/gm, "")
        .replace(/^\s*[-*_]{3,}\s*$/gm, "")
        .replace(/\*\*([^\n]+?)\*\*/g, "$1")
        .replace(/__([^\n]+?)__/g, "$1")
        .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "$1")
        .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "$1")
        .replace(/`([^`\n]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)");
}

function renderText(container, text) {
    container.replaceChildren();

    const lines = String(text).split("\n");
    let paragraph = [];

    function flushParagraph() {
        if (!paragraph.length) return;

        const p = document.createElement("p");
        p.textContent = cleanMarkdownText(paragraph.join("\n"));
        container.appendChild(p);
        paragraph = [];
    }

    function appendCodeBlock(codeText) {
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
                await navigator.clipboard.writeText(code.textContent);
                copy.textContent = "Copied";
            } catch {
                showToast("Unable to copy code in this browser.");
            }
        });

        container.append(copy, pre);
    }

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];

        if (line.trim().startsWith("```")) {
            flushParagraph();

            const codeLines = [];
            i += 1;

            while (
                i < lines.length &&
                !lines[i].trim().startsWith("```")
            ) {
                codeLines.push(lines[i]);
                i += 1;
            }

            appendCodeBlock(codeLines.join("\n"));
            continue;
        }

        if (!line.trim()) {
            flushParagraph();
            continue;
        }

        paragraph.push(line);
    }

    flushParagraph();
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

function extractImagePrompt(message) {
    const imageTypes = "image|picture|illustration|artwork|logo|poster|wallpaper|graphic";
    const verbs = "generate|create|make|draw|render|design|illustrate|visualize";
    const polite = "(?:(?:please|can you|could you|would you)\\s+)*";

    const directPattern = new RegExp(
        "^\\s*" + polite + "(?:" + verbs + ")\\s+(?:(?:me|an?|a)\\s+)*(?:" +
        imageTypes + ")\\b(?:\\s+(?:of|for|about|showing|featuring|with))?\\s*",
        "i"
    );

    const subjectFirstPattern = new RegExp(
        "^\\s*" + polite + "(?:" + verbs + ")\\s+(?:me\\s+)?(?:an?\\s+)?(.+?)\\s+(?:" +
        imageTypes + ")\\s*(?:for me)?\\s*[.!?]*$",
        "i"
    );

    if (directPattern.test(message)) {
        return message.replace(directPattern, "").trim().replace(/[.!?]+$/, "").trim();
    }

    const subjectFirstMatch = message.match(subjectFirstPattern);
    if (subjectFirstMatch) {
        return subjectFirstMatch[1].trim().replace(/[.!?]+$/, "").trim();
    }

    return null;
}
async function sendMessage(text) {
    if (busy) return;

    const message = text.trim();
    if (!message) return;

    const imagePrompt = extractImagePrompt(message);
    if (imagePrompt !== null) {
        clearError();
        if (!activeConversation()) createConversation();
        const conversation = activeConversation();
        conversation.messages.push({ role: "user", content: message });
        updateConversationTitle(conversation);
        saveConversations();
        renderHistory();
        renderConversation();
        elements.messageInput.value = "";
        resizeInput();
        await generateImage(imagePrompt);
        return;
    }

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
                history: previousMessages,
                language: selectedLanguage,
                memories: memoryEnabled ? memories : []
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || `Request failed (${response.status}).`);
        }

        const reply = typeof result.reply === "string" ? result.reply.trim() : "";
        const sources = Array.isArray(result.sources)
            ? result.sources.filter((source) =>
                source &&
                typeof source.url === "string" &&
                (source.url.startsWith("https://") || source.url.startsWith("http://")) &&
                (source.title === undefined || typeof source.title === "string")
            ).slice(0, 10)
            : [];
        if (!reply) throw new Error("Axiom AI returned an empty response.");

        typing.remove();
        conversation.messages.push({ role: "assistant", content: reply, sources });
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

async function generateImage(prompt) {
    if (busy) {
        showError("Wait for the current message to finish first.");
        return;
    }

    const imagePrompt = prompt.trim();
    if (!imagePrompt) {
        showError("Describe the image you want, then click the image button.");
        elements.messageInput.focus();
        return;
    }

    if (imagePrompt.length > 1000) {
        showError("Image prompts must be 1,000 characters or fewer.");
        return;
    }

    clearError();
    elements.imageButton.disabled = true;
    elements.imageButton.setAttribute("aria-busy", "true");
    elements.imageButton.title = "Generating image...";
    showToast("Generating your image. This may take a moment.");

    try {
        const response = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: imagePrompt })
        });

        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || "Image generation failed.");
        }
        if (typeof result.image !== "string" || !result.image) {
            throw new Error("The server returned no image.");
        }

        const article = appendMessage(
            "assistant",
            "Generated image for: " + imagePrompt
        );
        const body = article.querySelector(".message-body");
        const image = document.createElement("img");
        image.src = "data:" + (result.mime_type === "image/png" ? result.mime_type : "image/png") + ";base64," + result.image;
        image.alt = "AI-generated image for: " + imagePrompt;
        image.loading = "lazy";
        image.style.display = "block";
        image.style.width = "100%";
        image.style.maxWidth = "640px";
        image.style.height = "auto";
        image.style.borderRadius = "12px";
        image.style.marginTop = "12px";
        image.addEventListener("error", () => {
            image.replaceWith(document.createTextNode("The generated image could not be displayed."));
        }, { once: true });
        body.appendChild(image);
        scrollToBottom();
        showToast("Image generated successfully.");
    } catch (error) {
        showError(error.message || "Image generation failed. Please try again.");
    } finally {
        elements.imageButton.disabled = false;
        elements.imageButton.removeAttribute("aria-busy");
        elements.imageButton.title = "Generate an image";
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

renderMemories();
elements.languageSelect.value = selectedLanguage;
elements.languageSelect.addEventListener("change", () => {
    const nextLanguage = elements.languageSelect.value;
    selectedLanguage = SUPPORTED_LANGUAGE_CODES.has(nextLanguage) ? nextLanguage : "en";
    try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    } catch {
        showToast("Language selection could not be saved in this browser.");
    }
});

elements.imageButton.addEventListener("click", () => {
    generateImage(elements.messageInput.value);
});

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

elements.conversationSearch.addEventListener("input", renderHistory);
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


let mediaRecorder = null;
let recordedChunks = [];
let isListening = false;

async function startVoiceRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        showToast("Audio recording is not supported in this browser.");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const preferredType = [
            "audio/webm;codecs=opus",
            "audio/webm",
            "audio/ogg;codecs=opus",
            "audio/mp4"
        ].find(type => MediaRecorder.isTypeSupported(type));

        mediaRecorder = preferredType
            ? new MediaRecorder(stream, { mimeType: preferredType })
            : new MediaRecorder(stream);

        recordedChunks = [];

        mediaRecorder.addEventListener("dataavailable", event => {
            if (event.data && event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        });

        mediaRecorder.addEventListener("error", () => {
            stream.getTracks().forEach(track => track.stop());
            isListening = false;
            elements.voiceButton.classList.remove("utility-active");
            showToast("Recording failed. Please try again.");
        });

        mediaRecorder.addEventListener("stop", async () => {
            stream.getTracks().forEach(track => track.stop());
            isListening = false;
            elements.voiceButton.classList.remove("utility-active");

            if (!recordedChunks.length) {
                showToast("No audio was recorded. Please try again.");
                return;
            }

            const mimeType = mediaRecorder.mimeType || "audio/webm";
            const extension = mimeType.includes("ogg") ? "ogg"
                : mimeType.includes("mp4") ? "mp4"
                : mimeType.includes("wav") ? "wav"
                : "webm";

            const audioBlob = new Blob(recordedChunks, { type: mimeType });
            if (audioBlob.size > 8 * 1024 * 1024) {
                showToast("Recording is too large. Please record a shorter message.");
                return;
            }

            const formData = new FormData();
            formData.append("audio", audioBlob, `recording.${extension}`);

            showToast("Transcribing your voice…");

            try {
                const response = await fetch("/api/transcribe", {
                    method: "POST",
                    body: formData
                });
                const result = await response.json();

                if (!response.ok) {
                    showToast(result.error || "Transcription failed. Please try again.");
                    return;
                }

                const transcript = typeof result.text === "string"
                    ? result.text.trim()
                    : "";

                if (!transcript) {
                    showToast("No speech was detected. Please try again.");
                    return;
                }

                const existing = elements.messageInput.value.trim();
                elements.messageInput.value = existing
                    ? `${existing} ${transcript}`
                    : transcript;
                resizeInput();
                elements.messageInput.focus();
                showToast("Voice message added. Review it before sending.");
            } catch {
                showToast("Could not reach the transcription service. Check your connection.");
            }
        });

        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }

        mediaRecorder.start();
        isListening = true;
        elements.voiceButton.classList.add("utility-active");
        showToast("Recording. Click the microphone again to finish.");
    } catch (error) {
        if (error.name === "NotAllowedError" || error.name === "SecurityError") {
            showToast("Microphone permission denied. Check browser permissions.");
        } else if (error.name === "NotFoundError") {
            showToast("No microphone was found on this device.");
        } else {
            showToast("Could not start recording. Check microphone access.");
        }
    }
}

elements.voiceButton.addEventListener("click", () => {
    if (isListening && mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.stop();
        return;
    }

    if (!isListening) {
        startVoiceRecording();
    }
});

elements.speakButton.addEventListener("click", () => {
    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
        showToast("Read-aloud is not supported in this browser.");
        return;
    }

    const conversation = activeConversation();
    const lastReply = conversation
        ? [...conversation.messages].reverse().find(item =>
            item.role === "assistant" && typeof item.content === "string" && item.content.trim()
        )
        : null;

    if (!lastReply) {
        showToast("There is no Axiom AI response to read yet.");
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(lastReply.content);
    utterance.lang = navigator.language || "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onerror = () => showToast("The browser could not read this response aloud.");
    window.speechSynthesis.speak(utterance);
});

elements.stopSpeakingButton.addEventListener("click", () => {
    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        showToast("Read-aloud stopped.");
    }
});

setupVoiceInput();

renderHistory();
renderConversation();
