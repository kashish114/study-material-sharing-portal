const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const APP = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'studyshare_secret_key_2026';

// Detect Vercel Serverless environment
const IS_VERCEL = !!process.env.VERCEL;
const UPLOADS_DIR = IS_VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
const KASHISH_DIR = path.join(__dirname, 'kashish');
const DB_FILE = IS_VERCEL ? path.join('/tmp', 'db.json') : path.join(__dirname, 'db.json');

// Ensure uploads folder exists
if (!fs.existsSync(UPLOADS_DIR)) {
    try {
        fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    } catch (e) {
        console.error('Error creating uploads directory:', e);
    }
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        cb(null, `${baseName}-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB max
});

// Middleware
APP.use(cors());
APP.use(express.json());
APP.use(express.urlencoded({ extended: true }));
APP.use(express.static(__dirname));

// DB Helper Functions
function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            return { users: [], materials: [] };
        }
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading DB file:', err);
        return { users: [], materials: [] };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('Error writing DB file:', err);
    }
}

// Seed initial materials from kashish folder if DB is empty
function seedDatabase() {
    let db = readDB();
    
    // Seed default admin/demo user if empty
    if (!db.users || db.users.length === 0) {
        const hashedPassword = bcrypt.hashSync('student123', 10);
        db.users = [
            {
                id: 'u_1',
                name: 'Kashish Student',
                email: 'student@studyshare.edu',
                passwordHash: hashedPassword,
                createdAt: new Date().toISOString()
            }
        ];
    }

    // Seed materials from kashish folder if empty
    if (!db.materials || db.materials.length === 0) {
        db.materials = [];

        if (fs.existsSync(KASHISH_DIR)) {
            const files = fs.readdirSync(KASHISH_DIR);
            let count = 1;

            for (const file of files) {
                if (file.endsWith('.pdf')) {
                    const srcPath = path.join(KASHISH_DIR, file);
                    const destFileName = `seed-${count}-${Date.now()}-${file.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
                    const destPath = path.join(UPLOADS_DIR, destFileName);

                    try {
                        fs.copyFileSync(srcPath, destPath);
                        const stats = fs.statSync(destPath);

                        // Format nice titles and subjects
                        let title = file.replace(/ - Google Docs.pdf$/i, '').replace(/ - Colab.pdf$/i, '');
                        let type = 'Notes';
                        if (title.toLowerCase().includes('paper') || title.toLowerCase().includes('prac')) {
                            type = 'Question Paper';
                        } else if (title.toLowerCase().includes('format') || title.toLowerCase().includes('doc')) {
                            type = 'Assignment';
                        }

                        db.materials.push({
                            id: `mat_${count++}_${Date.now()}`,
                            title: title,
                            type: type,
                            subject: title.toLowerCase().includes('wt') ? 'Web Technology' : 
                                     title.toLowerCase().includes('cn') ? 'Computer Networks' : 
                                     title.toLowerCase().includes('daa') ? 'Design & Analysis of Algorithms' : 'B.Tech • General',
                            desc: `Real course document: ${file}`,
                            originalFileName: file,
                            storedFileName: destFileName,
                            fileSize: (stats.size / 1024).toFixed(1) + ' KB',
                            uploadedBy: 'u_1',
                            uploadedByName: 'Kashish Student',
                            downloadCount: Math.floor(Math.random() * 45) + 5,
                            createdAt: new Date().toISOString()
                        });
                    } catch (err) {
                        console.error(`Error seeding file ${file}:`, err);
                    }
                }
            }
        }
    }

    writeDB(db);
}

// Helper middleware for Vercel serverless execution
APP.use((req, res, next) => {
    seedDatabase();
    next();
});

// Authentication Middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
}

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ success: false, message: 'Login required to perform this action.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
        }
        req.user = user;
        next();
    });
}

// Initialize Seed Data
seedDatabase();

// ==================== AUTH ROUTES ==================== //

// User Registration
APP.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, message: 'Please provide name, email, and password.' });
        }

        const db = readDB();
        const existingUser = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (existingUser) {
            return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = {
            id: `u_${Date.now()}`,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            passwordHash: passwordHash,
            createdAt: new Date().toISOString()
        };

        db.users.push(newUser);
        writeDB(db);

        const token = jwt.sign(
            { id: newUser.id, name: newUser.name, email: newUser.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            message: 'Registration successful! Welcome to StudyShare.',
            token,
            user: { id: newUser.id, name: newUser.name, email: newUser.email }
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// User Login
APP.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Please enter both email and password.' });
        }

        const db = readDB();
        const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());

        if (!user) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id, name: user.name, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        return res.json({
            success: true,
            message: `Welcome back, ${user.name}!`,
            token,
            user: { id: user.id, name: user.name, email: user.email }
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});

// Get Current Logged in User Profile
APP.get('/api/auth/me', requireAuth, (req, res) => {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.id);
    if (!user) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }
    return res.json({
        success: true,
        user: { id: user.id, name: user.name, email: user.email }
    });
});

// ==================== MATERIALS ROUTES ==================== //

// Get All Study Materials
APP.get('/api/materials', authenticateToken, (req, res) => {
    const db = readDB();
    return res.json({
        success: true,
        count: db.materials.length,
        userCount: db.users.length,
        materials: db.materials
    });
});

// Upload New Material
APP.post('/api/materials/upload', requireAuth, upload.single('file'), (req, res) => {
    try {
        const { title, type, subject, desc } = req.body;
        const file = req.file;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Material title is required.' });
        }

        if (!file) {
            return res.status(400).json({ success: false, message: 'PDF or Document file is required.' });
        }

        const db = readDB();

        const newMaterial = {
            id: `mat_${Date.now()}`,
            title: title.trim(),
            type: type || 'Notes',
            subject: subject ? subject.trim() : 'B.Tech • General',
            desc: desc ? desc.trim() : 'Uploaded study material.',
            originalFileName: file.originalname,
            storedFileName: file.filename,
            fileSize: (file.size / 1024).toFixed(1) + ' KB',
            uploadedBy: req.user.id,
            uploadedByName: req.user.name,
            downloadCount: 0,
            createdAt: new Date().toISOString()
        };

        db.materials.unshift(newMaterial);
        writeDB(db);

        return res.json({
            success: true,
            message: 'Study material uploaded successfully!',
            material: newMaterial
        });
    } catch (err) {
        console.error('Upload error:', err);
        return res.status(500).json({ success: false, message: 'Server error during file upload.' });
    }
});

// Download PDF/Document File
APP.get('/api/materials/download/:id', (req, res) => {
    try {
        const materialId = req.params.id;
        const db = readDB();
        const material = db.materials.find(m => m.id === materialId);

        if (!material) {
            return res.status(404).send('Material not found.');
        }

        const filePath = path.join(UPLOADS_DIR, material.storedFileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).send('File not found on server.');
        }

        // Increment download counter
        material.downloadCount = (material.downloadCount || 0) + 1;
        writeDB(db);

        // Force browser download with original filename
        res.download(filePath, material.originalFileName, (err) => {
            if (err) {
                console.error('File download error:', err);
                if (!res.headersSent) {
                    res.status(500).send('Error downloading file.');
                }
            }
        });
    } catch (err) {
        console.error('Download route error:', err);
        return res.status(500).send('Server error.');
    }
});

if (!IS_VERCEL) {
    APP.listen(PORT, () => {
        console.log(`===================================================`);
        console.log(`🚀 StudyShare Backend running on http://localhost:${PORT}`);
        console.log(`===================================================`);
    });
}

module.exports = APP;
