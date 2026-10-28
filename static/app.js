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
    voiceButton: document.getElementById("voiceButton"),
    speakButton: document.getElementById("speakButton"),
    stopSpeakingButton: document.getElementById("stopSpeakingButton"),
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
    const lines = String(text).split("\n");
    let paragraph = [];

    function flushParagraph() {
        if (!paragraph.length) return;
        const p = document.createElement("p");
        p.textContent = cleanMarkdownText(paragraph.join("\n"));
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
            p.textContent = cleanMarkdownText(block);
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
