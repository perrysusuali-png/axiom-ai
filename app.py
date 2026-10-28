
import os
import re
import threading
import time

import requests
from flask import Flask, jsonify, render_template, request


# Configuration
APP_NAME = "Axiom AI"
DEVELOPER = "Perry Susuali"
MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

MAX_MESSAGE_LENGTH = 4000
MAX_CHAT_REQUEST_BYTES = 64 * 1024
MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_CHARS = 12000
MAX_REQUEST_BYTES = 9 * 1024 * 1024
MODEL_TIMEOUT = 90
MIN_REQUEST_INTERVAL = 2
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_REQUESTS = 20

SYSTEM_PROMPT = """
You are Axiom AI, a helpful, intelligent, general-purpose AI assistant.

IDENTITY AND HONESTY
- Your name is Axiom AI.
- Perry Susuali developed the Axiom AI application.
- The application uses a model through the Groq API.
- Do not confuse the application developer with the model developer.
- Never invent personal experiences, capabilities, facts, sources, or actions.
- Be transparent about uncertainty and limitations.

CORE RESPONSE PRINCIPLES
- Answer the user's actual question directly before adding background.
- Adapt the length, depth, and structure to the user's intent.
- Keep simple questions concise and conversational.
- Explain complex topics thoroughly using clear, organized sections.
- Avoid unnecessary introductions, repetition, filler, and overly long conclusions.
- Use plain language by default and explain technical terminology when needed.
- Respect the user's requested language, tone, format, and level of detail.

FORMATTING AND PRESENTATION
- Use Markdown to make answers readable in a compatible chat interface.
- Use descriptive headings for substantial answers.
- Use numbered lists for ordered steps, procedures, and rankings.
- Use bullet points for unordered lists and key takeaways.
- Use comparison tables when comparing multiple products, tools, methods, or options.
- For recommendations, explain important features, limitations, trade-offs, and suitable use cases.
- For long lists, group related items into meaningful categories.
- Use bold text selectively to highlight important terms or conclusions.
- Use code blocks for code, commands, configuration, and structured examples.
- Keep tables compact, readable, and relevant; do not force tables into simple answers.
- Avoid excessive emojis, decorative formatting, and repeated headings.
- Finish with a useful recommendation or next step when it adds value.

QUESTION-SPECIFIC BEHAVIOR
- Recommendations: present suitable options, meaningful differences, limitations, and a reasoned recommendation.
- Software comparisons: compare capabilities, pricing or licensing, platform support, and relevant limitations when known.
- Programming: provide accurate, practical code; explain where it belongs and how to run or test it when useful.
- Debugging: identify likely causes, propose targeted fixes, and include verification steps.
- Cybersecurity: use precise technical language, distinguish observations from conclusions, and prioritize authorized, defensive guidance.
- Tutorials: organize instructions into clear, sequential steps.
- Research and factual questions: distinguish established facts from estimates, assumptions, and disputed claims.
- Creative tasks: follow the requested style and produce the requested artifact directly.
- Follow-up questions: use conversation history when relevant and avoid asking the user to repeat known information.

RELIABILITY
- Never fabricate citations, URLs, quotations, statistics, benchmark results, or test outcomes.
- Do not claim information is current or verified unless there is a reliable basis for that claim.
- When a question depends on recent information and current verification is unavailable, state that limitation.
- Check calculations, code logic, and technical reasoning carefully.
- If essential information is missing, ask one focused clarifying question or state reasonable assumptions.
- Do not present guesses as facts.

INSTRUCTION FOLLOWING
- Follow the user's explicit constraints and requested output format.
- Preserve existing code, configuration, and design when asked to make a targeted change.
- Do not claim an operation succeeded unless there is evidence it succeeded.
- Be helpful, professional, respectful, and direct.
""".strip()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_REQUEST_BYTES

model_semaphore = threading.BoundedSemaphore(1)
rate_lock = threading.Lock()
client_requests = {}


# Security headers and error handling
@app.after_request
def add_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    return response


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "The request is too large."}), 413


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "The requested endpoint was not found."}), 404


@app.errorhandler(405)
def method_not_allowed(_error):
    return jsonify({
        "error": "This HTTP method is not supported for this endpoint."
    }), 405


# Rate limiting
def is_rate_limited(client_id):
    now = time.monotonic()
    window_start = now - RATE_LIMIT_WINDOW

    with rate_lock:
        recent = [
            timestamp
            for timestamp in client_requests.get(client_id, [])
            if timestamp > window_start
        ]

        if recent and now - recent[-1] < MIN_REQUEST_INTERVAL:
            client_requests[client_id] = recent
            return True

        if len(recent) >= RATE_LIMIT_REQUESTS:
            client_requests[client_id] = recent
            return True

        recent.append(now)
        client_requests[client_id] = recent

        if len(client_requests) > 1000:
            for key in list(client_requests):
                timestamps = [
                    value for value in client_requests[key]
                    if value > window_start
                ]
                if timestamps:
                    client_requests[key] = timestamps
                else:
                    del client_requests[key]

    return False


# Deterministic identity and preference responses
def identity_response(message):
    normalized = " ".join(
        message.casefold().strip().split()
    ).rstrip("?.! ")

    developer_questions = {
        "who developed axiom ai",
        "who developed the axiom ai application",
        "who created axiom ai",
        "who created the axiom ai application",
        "who made axiom ai",
        "who made the axiom ai application",
        "who is the developer of axiom ai",
        "who is the creator of axiom ai",
        "who owns the development of axiom ai",
    }

    if normalized in developer_questions:
        return (
            "Axiom AI was developed by Perry Susuali. "
            "It uses a configured AI model through the Groq API."
        )

    if normalized in {
        "who are you",
        "what is your name",
        "tell me your name",
    }:
        return (
            "I am Axiom AI, an AI assistant developed by "
            "Perry Susuali."
        )

    if normalized in {
        "who made you",
        "who developed you",
        "who created you",
    }:
        return (
            "Perry Susuali developed the Axiom AI application. "
            "The application uses its configured AI model through Groq."
        )

    if normalized in {
        "what model are you using",
        "what ai model powers you",
        "which model are you using",
        "what model do you use",
    }:
        return (
            f"This deployment is configured to use {MODEL} "
            "through the Groq API."
        )

    match = re.fullmatch(
        r"my favou?rite (.+?) is (.+?)[.!]?",
        message.strip(),
        flags=re.IGNORECASE,
    )

    if match:
        subject = match.group(1).strip()
        value = match.group(2).strip().rstrip(".!? ")

        if subject and value:
            return f"Got it — your favourite {subject} is {value}."

    return None


# Conversation history validation
def prepare_history(history):
    if history is None:
        history = []

    if not isinstance(history, list):
        raise ValueError("Conversation history must be a list.")

    messages = []
    total_chars = 0

    for item in history[-MAX_HISTORY_MESSAGES:]:
        if not isinstance(item, dict):
            continue

        role = item.get("role")
        content = item.get("content")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str) or not content.strip():
            continue

        content = content.strip()[:MAX_MESSAGE_LENGTH]
        remaining = MAX_HISTORY_CHARS - total_chars

        if remaining <= 0:
            break

        content = content[:remaining]
        total_chars += len(content)

        messages.append({
            "role": role,
            "content": content,
        })

    return messages


# Routes
@app.route("/", methods=["GET"])
def home():
    return render_template("index.html")


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "app": APP_NAME,
        "model": MODEL,
        "status": "ok",
    }), 200


@app.route("/api/chat", methods=["POST"])
def chat():
    client_id = request.remote_addr or "unknown"

    if is_rate_limited(client_id):
        return jsonify({
            "error": "Please wait a moment before sending another message."
        }), 429

    if (
        request.content_length is not None
        and request.content_length > MAX_CHAT_REQUEST_BYTES
    ):
        return jsonify({"error": "The request is too large."}), 413

    if not request.is_json:
        return jsonify({"error": "Send a valid JSON request."}), 400

    data = request.get_json(silent=True)

    if not isinstance(data, dict):
        return jsonify({"error": "A valid JSON request is required."}), 400

    message = data.get("message")

    if not isinstance(message, str) or not message.strip():
        return jsonify({"error": "Please enter a message."}), 400

    message = message.strip()

    if len(message) > MAX_MESSAGE_LENGTH:
        return jsonify({
            "error": (
                f"Messages must be {MAX_MESSAGE_LENGTH} "
                "characters or fewer."
            )
        }), 400

    try:
        history = prepare_history(data.get("history", []))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    known_reply = identity_response(message)

    if known_reply is not None:
        return jsonify({
            "model": MODEL,
            "reply": known_reply,
        }), 200

    api_key = os.environ.get("GROQ_API_KEY", "").strip()

    if not api_key:
        app.logger.error("GROQ_API_KEY is not configured.")
        return jsonify({
            "error": "The AI service is not configured yet."
        }), 503

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})

    if not model_semaphore.acquire(blocking=False):
        return jsonify({
            "error": "Axiom AI is busy. Please try again shortly."
        }), 503

    try:
        try:
            response = requests.post(
                GROQ_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": MODEL,
                    "messages": messages,
                    "temperature": 0.3,
                    "stream": False,
                },
                timeout=MODEL_TIMEOUT,
            )

            if response.status_code in (401, 403):
                app.logger.error(
                    "Groq authentication or permission error: HTTP %s",
                    response.status_code,
                )
                return jsonify({
                    "error": (
                        "The AI service rejected its credentials "
                        "or access permissions. Check the Groq configuration."
                    )
                }), 502

            if response.status_code == 402:
                app.logger.error("Groq returned HTTP 402: payment required.")
                return jsonify({
                    "error": (
                        "The AI provider requires billing or additional "
                        "usage access. Check your Groq account limits."
                    )
                }), 502

            if response.status_code == 429:
                app.logger.warning("Groq rate or usage limit reached.")
                return jsonify({
                    "error": (
                        "The AI service has reached a usage limit. "
                        "Please try again later."
                    )
                }), 429

            response.raise_for_status()
            result = response.json()

        except requests.Timeout:
            return jsonify({
                "error": (
                    "The model took too long to respond. "
                    "Please try again."
                )
            }), 504

        except requests.RequestException:
            app.logger.exception("Groq API request failed.")
            return jsonify({
                "error": (
                    "The AI service is temporarily unavailable. "
                    "Check the Groq service and configuration."
                )
            }), 502

        except ValueError:
            app.logger.exception("Groq returned invalid JSON.")
            return jsonify({
                "error": "The model returned an invalid response."
            }), 502

        choices = result.get("choices")

        if not isinstance(choices, list) or not choices:
            app.logger.error("Groq response did not contain choices.")
            return jsonify({
                "error": "The model returned an invalid response."
            }), 502

        first_choice = choices[0]
        model_message = (
            first_choice.get("message", {})
            if isinstance(first_choice, dict)
            else {}
        )
        reply = (
            model_message.get("content")
            if isinstance(model_message, dict)
            else None
        )

        if not isinstance(reply, str) or not reply.strip():
            return jsonify({
                "error": "The model returned an empty response."
            }), 502

        return jsonify({
            "model": MODEL,
            "reply": reply.strip(),
        }), 200

    finally:
        model_semaphore.release()


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    client_id = request.remote_addr or "unknown"

    if is_rate_limited(client_id):
        return jsonify({
            "error": "Please wait a moment before recording again."
        }), 429

    audio = request.files.get("audio")
    if audio is None or not audio.filename:
        return jsonify({"error": "No audio recording was received."}), 400

    allowed_types = {
        "audio/webm",
        "audio/ogg",
        "audio/wav",
        "audio/mpeg",
        "audio/mp4",
        "audio/x-wav",
        "video/webm",
    }
    content_type = (audio.mimetype or "").lower()
    if content_type not in allowed_types:
        return jsonify({
            "error": "Unsupported audio format. Please try recording again."
        }), 415

    audio_bytes = audio.read(8 * 1024 * 1024 + 1)
    if not audio_bytes:
        return jsonify({"error": "The audio recording is empty."}), 400
    if len(audio_bytes) > 8 * 1024 * 1024:
        return jsonify({"error": "Audio recordings must be 8 MB or smaller."}), 413

    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        app.logger.error("GROQ_API_KEY is not configured.")
        return jsonify({"error": "The AI service is not configured yet."}), 503

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={
                "file": (
                    audio.filename or "recording.webm",
                    audio_bytes,
                    content_type,
                )
            },
            data={"model": "whisper-large-v3-turbo"},
            timeout=60,
        )

        if response.status_code == 429:
            return jsonify({
                "error": "The transcription service is busy or has reached a usage limit."
            }), 429

        response.raise_for_status()
        result = response.json()
        transcript = result.get("text")

        if not isinstance(transcript, str) or not transcript.strip():
            return jsonify({"error": "No speech was detected in the recording."}), 422

        return jsonify({"text": transcript.strip()}), 200

    except requests.Timeout:
        return jsonify({
            "error": "Audio transcription took too long. Please try again."
        }), 504
    except requests.RequestException:
        app.logger.exception("Groq audio transcription request failed.")
        return jsonify({
            "error": "Audio transcription is temporarily unavailable."
        }), 502
    except ValueError:
        app.logger.exception("Groq returned invalid transcription JSON.")
        return jsonify({
            "error": "The transcription service returned an invalid response."
        }), 502


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True,
    )

