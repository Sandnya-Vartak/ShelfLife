const tokenKey = "shelflife_token";
const configuredApiBaseUrl = window.SHELFLIFE_API_BASE_URL || document.body?.dataset.apiBaseUrl || "";
let resolvedApiBaseUrl = "";

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email || "").trim());
}

function isValidPassword(password) {
    return typeof password === "string" && password.length >= 8 && /[A-Za-z]/.test(password);
}

function normalizeBaseUrl(baseUrl) {
    return (baseUrl || "").replace(/\/+$/, "");
}

function getApiBaseCandidates() {
    if (resolvedApiBaseUrl) {
        return [resolvedApiBaseUrl];
    }

    const candidates = [];
    const currentOrigin = normalizeBaseUrl(window.location.origin);
    const currentProtocol = window.location.protocol === "https:" ? "https:" : "http:";
    const localHosts = new Set(["127.0.0.1", "localhost", "0.0.0.0"]);
    const isLocalFile = window.location.protocol === "file:";
    const isLocalDevHost = localHosts.has(window.location.hostname);

    if (configuredApiBaseUrl) {
        candidates.push(normalizeBaseUrl(configuredApiBaseUrl));
    }

    if (!isLocalFile && currentOrigin) {
        candidates.push(currentOrigin);
    }

    if (isLocalFile || (isLocalDevHost && window.location.port !== "5000")) {
        candidates.push(`${currentProtocol}//127.0.0.1:5000`);
        candidates.push(`${currentProtocol}//localhost:5000`);
    }

    return [...new Set(candidates.filter(Boolean))];
}

function buildApiUrl(baseUrl, path) {
    return `${baseUrl}${path}`;
}

function persistToken(token) {
    localStorage.setItem(tokenKey, token);
    document.cookie = `${tokenKey}=${token}; path=/; SameSite=Lax`;
}

function getCookieValue(name) {
    const cookies = document.cookie ? document.cookie.split("; ") : [];
    const cookie = cookies.find((entry) => entry.startsWith(`${name}=`));
    return cookie ? decodeURIComponent(cookie.split("=").slice(1).join("=")) : "";
}

function getToken() {
    return localStorage.getItem(tokenKey) || getCookieValue(tokenKey);
}

function setMessage(message, type = "") {
    const messageBox = document.getElementById("message");
    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.className = `message ${type}`.trim();
}

async function apiRequest(url, options = {}) {
    const headers = {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(options.headers || {})
    };

    let response;

    for (const baseUrl of getApiBaseCandidates()) {
        try {
            response = await fetch(buildApiUrl(baseUrl, url), { ...options, headers, credentials: "include" });
            resolvedApiBaseUrl = baseUrl;
            break;
        } catch (error) {
            response = null;
        }
    }

    if (!response) {
        throw new Error("Unable to reach the ShelfLife server. Start the Flask app or set window.SHELFLIFE_API_BASE_URL to your API origin.");
    }

    const rawBody = await response.text();
    let data = {};

    if (rawBody) {
        try {
            data = JSON.parse(rawBody);
        } catch (error) {
            data = { rawBody };
        }
    }

    if (!response.ok) {
        const fallbackMessage = data.rawBody
            ? `Request failed (${response.status} ${response.statusText})`
            : `Request failed (${response.status})`;
        throw new Error(data.message || fallbackMessage);
    }

    return data;
}

async function redirectIfAuthenticated() {
    if (!getToken()) {
        return;
    }

    try {
        await apiRequest("/auth/me");
        window.location.href = "/dashboard/";
    } catch (error) {
        // Stay on the auth page when the stored token is no longer valid.
    }
}

const registerForm = document.getElementById("register-form");
if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("");

        const password = document.getElementById("register-password").value;
        const confirmPassword = document.getElementById("register-confirm-password").value;
        if (password !== confirmPassword) {
            setMessage("Passwords do not match.", "error");
            return;
        }

        try {
            const email = document.getElementById("register-email").value.trim();
            if (!isValidEmail(email)) {
                setMessage("Enter a valid email address.", "error");
                return;
            }

            if (!isValidPassword(password)) {
                setMessage("Password must be at least 8 characters and include letters.", "error");
                return;
            }

            const payload = {
                name: document.getElementById("register-name").value.trim(),
                email,
                password
            };

            const data = await apiRequest("/auth/register", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            setMessage(data.message + " Please log in to continue.", "success");
            persistToken("");
            registerForm.reset();
            window.setTimeout(() => {
                window.location.href = "/login/";
            }, 700);
        } catch (error) {
            setMessage(error.message, "error");
        }
    });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        setMessage("");

        try {
            const email = document.getElementById("login-email").value.trim();
            if (!isValidEmail(email)) {
                setMessage("Enter a valid email address.", "error");
                return;
            }

            const payload = {
                email,
                password: document.getElementById("login-password").value
            };

            const data = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            persistToken(data.access_token);
            window.location.href = "/dashboard/";
        } catch (error) {
            setMessage(error.message, "error");
        }
    });
}

redirectIfAuthenticated();
