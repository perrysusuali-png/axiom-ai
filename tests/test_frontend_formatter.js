const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

class FakeElement {
    constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.textContent = "";
        this.className = "";
        this.type = "";
        this.listeners = {};
    }

    appendChild(child) {
        this.children.push(child);
        return child;
    }

    append(...items) {
        this.children.push(...items);
    }

    replaceChildren(...items) {
        this.children = [...items];
    }

    addEventListener(name, callback) {
        this.listeners[name] = callback;
    }
}

const source = fs.readFileSync("static/app.js", "utf8");
const start = source.indexOf("function cleanMarkdownText(text) {");
const end = source.indexOf("function scrollToBottom() {", start);

assert.ok(start !== -1 && end > start, "Formatter functions must exist");

const context = {
    document: {
        createElement: (tag) => new FakeElement(tag),
    },
    navigator: {
        clipboard: {
            writeText: async () => {},
        },
    },
    showToast: () => {},
};

vm.createContext(context);
vm.runInContext(
    source.slice(start, end) +
        "\nglobalThis.formatterTests = { cleanMarkdownText, renderText };",
    context
);

const { cleanMarkdownText, renderText } = context.formatterTests;

test("cleans common Markdown markers", () => {
    const input =
        "## Title\n- **Important**\n`code` and [site](https://example.com)";
    assert.equal(
        cleanMarkdownText(input),
        "Title\nImportant\ncode and site (https://example.com)"
    );
});

test("renders paragraphs and repeated code blocks in order", () => {
    const container = new FakeElement("div");
    const input =
        "Before\n\n```python\nprint('same')\n```\n\nBetween\n\n```\nprint('same')\n```\n\nAfter";

    renderText(container, input);

    assert.deepEqual(
        container.children.map((element) => element.tagName),
        ["p", "button", "pre", "p", "button", "pre", "p"]
    );
    assert.equal(container.children[0].textContent, "Before");
    assert.equal(container.children[2].children[0].textContent, "print('same')");
    assert.equal(container.children[3].textContent, "Between");
    assert.equal(container.children[5].children[0].textContent, "print('same')");
    assert.equal(container.children[6].textContent, "After");
});

test("renders an unclosed fenced block without losing its content", () => {
    const container = new FakeElement("div");

    renderText(container, "Example:\n```python\nprint('hello')");

    assert.equal(container.children.length, 3);
    assert.equal(container.children[0].textContent, "Example:");
    assert.equal(container.children[2].children[0].textContent, "print('hello')");
});

test("clears existing content before rendering", () => {
    const container = new FakeElement("div");
    container.appendChild(new FakeElement("old"));

    renderText(container, "Fresh response");

    assert.equal(container.children.length, 1);
    assert.equal(container.children[0].textContent, "Fresh response");
});
