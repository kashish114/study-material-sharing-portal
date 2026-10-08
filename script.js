/* ==============================
   STATE MANAGEMENT & API BASE
================================ */

const API_BASE = window.location.protocol.startsWith('http') ? '' : 'http://localhost:3000';

let materials = [];
let currentUser = null;
let authToken = localStorage.getItem("studyshare_token") || null;

try {
    const savedUser = localStorage.getItem("studyshare_user");
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
    }
} catch (e) {
    currentUser = null;
}

/* ==============================
   INITIAL LOAD & AUTH HEADER
================================ */

document.addEventListener("DOMContentLoaded", () => {
    updateAuthUI();
    fetchMaterials();
});

function updateAuthUI() {
    const authNav = document.getElementById("authNav");
    if (!authNav) return;

    if (currentUser && authToken) {
        const initial = currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'S';
        authNav.innerHTML = `
            <div class="user-badge">
                <div class="user-avatar">${initial}</div>
                <span class="user-name">${escapeHtml(currentUser.name)}</span>
                <button class="btn-logout" onclick="logout()">Logout</button>
            </div>
        `;
    } else {
        authNav.innerHTML = `
            <button class="login" onclick="openLogin()">
                Student Login
            </button>
        `;
    }
}

/* ==============================
   FETCH MATERIALS FROM BACKEND
================================ */

async function fetchMaterials() {
    try {
        const response = await fetch(`${API_BASE}/api/materials`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data.success) {
            materials = data.materials || [];

            // Update Statistics
            const statResources = document.getElementById("statResources");
            const statStudents = document.getElementById("statStudents");

            if (statResources) statResources.textContent = data.count || materials.length;
            if (statStudents) statStudents.textContent = data.userCount || 1;

            render();
        } else {
            toast(data.message || "Failed to load study materials.");
        }
    } catch (err) {
        console.error("Error fetching materials:", err);
        toast("Unable to connect to backend. Please ensure node server.js is running.");
    }
}

/* ==============================
   DISPLAY MATERIALS
================================ */

function render() {
    const searchInput = document.getElementById("search");
    const filterInput = document.getElementById("filter");
    const grid = document.getElementById("grid");

    if (!grid) return;

    const q = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const f = filterInput ? filterInput.value : "all";

    const list = materials.filter(item => {
        const matchesType = f === "all" || item.type === f;
        const text = (
            (item.title || "") +
            (item.subject || "") +
            (item.desc || "") +
            (item.uploadedByName || "")
        ).toLowerCase();

        const matchesSearch = text.includes(q);
        return matchesType && matchesSearch;
    });

    grid.innerHTML = list.map((item) => {
        const downloads = item.downloadCount !== undefined ? item.downloadCount : 0;
        const sizeInfo = item.fileSize ? ` • ${item.fileSize}` : "";

        return `
            <article class="card">
                <span class="tag">
                    ${item.type}
                </span>

                <h3>
                    ${escapeHtml(item.title)}
                </h3>

                <div class="meta">
                    <b>${escapeHtml(item.subject)}</b>
                    <br>
                    ${escapeHtml(item.desc)}
                    <br>
                    <small class="muted">Uploaded by: ${escapeHtml(item.uploadedByName || 'Student')}</small>
                </div>

                <div class="card-foot">
                    <span class="muted" style="font-size: 12px;">
                        📥 ${downloads} downloads${sizeInfo}
                    </span>

                    <button
                        class="download"
                        onclick="downloadMaterial('${item.id}', '${escapeQuotes(item.title)}')">
                        Download PDF
                    </button>
                </div>
            </article>
        `;
    }).join("");

    if (list.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 40px; text-align: center;">
                <p class="muted">No study materials found matching your search.</p>
            </div>
        `;
    }
}

/* ==============================
   ACTUAL PDF DOWNLOAD
================================ */

function downloadMaterial(id, title) {
    if (!id) {
        toast("Download error: Invalid material ID.");
        return;
    }

    toast(`Downloading PDF: ${title}`);

    // Direct download URL pointing to backend
    const downloadUrl = `${API_BASE}/api/materials/download/${id}`;
    
    // Create hidden link to trigger file download
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.target = "_blank";
    anchor.setAttribute("download", true);
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Refresh after download to update download count badge
    setTimeout(fetchMaterials, 1200);
}

/* ==============================
   SUBMIT MATERIAL WITH FILE UPLOAD
================================ */

async function submitMaterial() {
    if (!authToken || !currentUser) {
        toast("Please log in first to share study material.");
        openLogin();
        return;
    }

    const title = document.getElementById("title").value.trim();
    const type = document.getElementById("type").value;
    const subject = document.getElementById("subject").value.trim();
    const desc = document.getElementById("desc").value.trim();
    const fileInput = document.getElementById("file");
    const file = fileInput.files[0];

    if (!title) {
        toast("Please enter a material title.");
        return;
    }

    if (!file) {
        toast("Please select a study file (PDF/Doc).");
        return;
    }

    const formData = new FormData();
    formData.append("title", title);
    formData.append("type", type);
    formData.append("subject", subject || "B.Tech • General");
    formData.append("desc", desc || "Uploaded study material.");
    formData.append("file", file);

    try {
        toast("Uploading file to server...");

        const response = await fetch(`${API_BASE}/api/materials/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            toast(data.message || "Material uploaded successfully!");
            
            // Clear input fields
            document.getElementById("title").value = "";
            document.getElementById("subject").value = "";
            document.getElementById("desc").value = "";
            fileInput.value = "";

            // Refresh materials list and scroll to materials
            fetchMaterials();
            go("materials");
        } else {
            toast(data.message || "Upload failed.");
        }
    } catch (err) {
        console.error("Upload error:", err);
        toast("Error connecting to server during upload.");
    }
}

/* ==============================
   LOGIN & REGISTER MODAL CONTROLS
================================ */

function openLogin() {
    document.getElementById("loginModal").style.display = "grid";
}

function closeLogin() {
    document.getElementById("loginModal").style.display = "none";
}

function switchAuthTab(tab) {
    const tabLogin = document.getElementById("tabLogin");
    const tabRegister = document.getElementById("tabRegister");
    const loginView = document.getElementById("loginFormView");
    const registerView = document.getElementById("registerFormView");

    if (tab === 'login') {
        tabLogin.classList.add("active");
        tabRegister.classList.remove("active");
        loginView.style.display = "block";
        registerView.style.display = "none";
    } else {
        tabRegister.classList.add("active");
        tabLogin.classList.remove("active");
        registerView.style.display = "block";
        loginView.style.display = "none";
    }
}

/* ==============================
   AUTHENTICATION API CALLS
================================ */

async function login() {
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value.trim();

    if (!email || !password) {
        toast("Please enter both email and password.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;

            localStorage.setItem("studyshare_token", authToken);
            localStorage.setItem("studyshare_user", JSON.stringify(currentUser));

            updateAuthUI();
            closeLogin();
            toast(data.message || "Login successful!");
        } else {
            toast(data.message || "Invalid credentials.");
        }
    } catch (err) {
        console.error("Login request failed:", err);
        toast("Server error during login.");
    }
}

async function register() {
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const password = document.getElementById("regPassword").value.trim();

    if (!name || !email || !password) {
        toast("Please fill in all fields to register.");
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        const data = await response.json();

        if (data.success) {
            authToken = data.token;
            currentUser = data.user;

            localStorage.setItem("studyshare_token", authToken);
            localStorage.setItem("studyshare_user", JSON.stringify(currentUser));

            updateAuthUI();
            closeLogin();
            toast(data.message || "Registration successful!");
        } else {
            toast(data.message || "Registration failed.");
        }
    } catch (err) {
        console.error("Register error:", err);
        toast("Server error during registration.");
    }
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("studyshare_token");
    localStorage.removeItem("studyshare_user");
    updateAuthUI();
    toast("Logged out successfully.");
}

/* ==============================
   TOAST MESSAGE & UTILS
================================ */

function toast(message) {
    const element = document.getElementById("toast");
    if (!element) return;

    element.textContent = message;
    element.style.display = "block";

    setTimeout(() => {
        element.style.display = "none";
    }, 3000);
}

function go(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth" });
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeQuotes(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'");
}

// Initial fetch call
fetchMaterials();