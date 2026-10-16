const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { Pool } = require('pg');

const app = express();
const serverRole = process.env.SERVER_ROLE || 'student';

if (!['student', 'teacher'].includes(serverRole)) {
    throw new Error('Unknown SERVER_ROLE');
}

const port = Number(process.env.PORT || 3000);
const responsesFile = path.join(__dirname, 'data', 'responses.txt');
const sqlResponsesFile = path.join(__dirname, 'data', 'responses.sql');
const frontendPath = path.join(__dirname, '..', 'Frontend');
const teacherUsername = process.env.TEACHER_USERNAME;
const teacherPassword = process.env.TEACHER_PASSWORD;
const sessionCookieName = 'teacher_session';
const sessionDurationMs = 8 * 60 * 60 * 1000;
const scrypt = promisify(crypto.scrypt);
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://feedback:feedback@localhost:5432/feedback'
});

app.use(express.json());

app.use((req, res, next) => {
    const pathname = req.path;

    if (serverRole === 'student') {
        if (pathname === '/api/feedback') {
            return next();
        }
        if (pathname === '/' || pathname === '/Student' || pathname.startsWith('/Student/')) {
            return next();
        }
        return res.sendStatus(404);
    }

    if (serverRole === 'teacher') {
        if (pathname === '/' || pathname === '/Teacher' || pathname.startsWith('/Teacher/') || pathname === '/api/teacher/dashboard' || pathname === '/api/auth/login' || pathname === '/api/auth/logout') {
            return next();
        }
        return res.sendStatus(404);
    }
});

function sqlLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
}

function getSessionToken(request) {
    const cookies = request.headers.cookie?.split(';') || [];
    const sessionCookie = cookies.find((cookie) => cookie.trim().startsWith(`${sessionCookieName}=`));
    return sessionCookie ? decodeURIComponent(sessionCookie.trim().slice(sessionCookieName.length + 1)) : null;
}

async function getAuthenticatedUser(request) {
    const token = getSessionToken(request);
    if (!token) {
        return null;
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const result = await pool.query(
        `SELECT teacher_id FROM teacher_sessions
         WHERE token_hash = $1 AND expires_at > NOW()`,
        [tokenHash]
    );
    return result.rows[0] || null;
}

function requireAuthenticatedPage(request, response, next) {
    getAuthenticatedUser(request)
        .then((user) => {
            if (!user) {
                response.redirect('/Teacher/login.html');
                return;
            }
            response.set('Cache-Control', 'no-store');
            response.sendFile(path.join(frontendPath, 'Teacher', 'teacher.html'));
        })
        .catch(next);
}

function subjectDetails(subject) {
    const details = {
        'matemaatika': { name: 'Matemaatika', teacher: 'Julia Tammela' },
        'eesti-keel': { name: 'Eesti keel', teacher: 'Lea Kreinin' },
        'inglise-keel': { name: 'Hajusrakenduse Alused I/II', teacher: 'Timo Triisa' },
        'füüsika': { name: 'Rakendustarkvara', teacher: 'Kaupo Nõlvak' },
        'keemia': { name: 'Andmebaasid I/II', teacher: 'Üllar Lindmaa' },
        'oop': { name: 'OOP', teacher: 'Md Rakuzzaman' }
    };
    return details[subject] || { name: subject, teacher: '' };
}

async function createTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS feedback (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            class_name TEXT NOT NULL,
            subject TEXT NOT NULL,
            rating INTEGER NOT NULL,
            subject_progress INTEGER NOT NULL,
            teaching_effectiveness INTEGER NOT NULL,
            difficulty INTEGER NOT NULL,
            comment TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS teacher_users (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS teacher_sessions (
            token_hash CHAR(64) PRIMARY KEY,
            teacher_id INTEGER NOT NULL REFERENCES teacher_users(id) ON DELETE CASCADE,
            expires_at TIMESTAMPTZ NOT NULL
        )
    `);

    if (!teacherUsername || !teacherPassword) {
        throw new Error('Set TEACHER_USERNAME and TEACHER_PASSWORD to configure dashboard access.');
    }

    const salt = crypto.randomBytes(16);
    const passwordHash = await scrypt(teacherPassword, salt, 64);
    await pool.query(
        `INSERT INTO teacher_users (id, username, password_hash) VALUES (1, $1, $2)
         ON CONFLICT (id) DO UPDATE
         SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash`,
        [teacherUsername, `${salt.toString('hex')}:${passwordHash.toString('hex')}`]
    );
}

app.get(['/Teacher', '/Teacher/', '/Teacher/teacher.html'], requireAuthenticatedPage);

app.post('/api/auth/login', async (request, response) => {
    const { username, password } = request.body || {};
    if (typeof username !== 'string' || typeof password !== 'string'
        || username.length > 100 || password.length > 1024) {
        return response.status(400).json({ error: 'Username and password are required.' });
    }

    try {
        const result = await pool.query(
            'SELECT id, password_hash FROM teacher_users WHERE username = $1',
            [username]
        );
        const teacher = result.rows[0];
        const [saltHex, storedHashHex] = teacher?.password_hash.split(':') || [];
        const salt = saltHex ? Buffer.from(saltHex, 'hex') : Buffer.alloc(16);
        const passwordHash = await scrypt(password, salt, 64);
        const storedHash = storedHashHex ? Buffer.from(storedHashHex, 'hex') : null;
        if (!teacher || !storedHash || storedHash.length !== passwordHash.length
            || !crypto.timingSafeEqual(storedHash, passwordHash)) {
            return response.status(401).json({ error: 'Invalid username or password.' });
        }

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
        await pool.query(
            `INSERT INTO teacher_sessions (token_hash, teacher_id, expires_at)
             VALUES ($1, $2, NOW() + INTERVAL '8 hours')`,
            [tokenHash, teacher.id]
        );
        response.cookie(sessionCookieName, sessionToken, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionDurationMs,
            path: '/'
        });
        return response.json({ success: true });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not sign in.' });
    }
});

app.post('/api/auth/logout', async (request, response) => {
    try {
        const token = getSessionToken(request);
        if (token) {
            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            await pool.query('DELETE FROM teacher_sessions WHERE token_hash = $1', [tokenHash]);
        }
        response.clearCookie(sessionCookieName, { httpOnly: true, sameSite: 'lax', path: '/' });
        return response.json({ success: true });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not sign out.' });
    }
});

app.get('/api/teacher/dashboard', async (request, response) => {
    try {
        const teacher = await getAuthenticatedUser(request);
        if (!teacher) {
            return response.status(401).json({ error: 'Authentication required.' });
        }
        response.set('Cache-Control', 'no-store');

        const [feedbackResult, subjectResult] = await Promise.all([
            pool.query(
                `SELECT id, subject, rating, created_at
                 FROM feedback
                 ORDER BY created_at DESC, id DESC`
            ),
            pool.query(
                `SELECT subject, ROUND(AVG(rating)::numeric, 1) AS average_rating, COUNT(*) AS response_count
                 FROM feedback
                 GROUP BY subject
                 ORDER BY subject`
            )
        ]);

        return response.json({
            feedback: feedbackResult.rows.map((row) => ({
                id: row.id,
                subject: subjectDetails(row.subject).name,
                teacher: subjectDetails(row.subject).teacher,
                rating: Number(row.rating),
                createdAt: row.created_at
            })),
            subjects: subjectResult.rows.map((row) => ({
                ...subjectDetails(row.subject),
                averageRating: Number(row.average_rating),
                responseCount: Number(row.response_count)
            }))
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not load dashboard data.' });
    }
});

app.get('/api/teacher/feedback/:id', async (request, response) => {
    try {
        const teacher = await getAuthenticatedUser(request);
        if (!teacher) {
            return response.status(401).json({ error: 'Authentication required.' });
        }
        response.set('Cache-Control', 'no-store');

        const feedbackId = Number(request.params.id);
        if (!Number.isSafeInteger(feedbackId) || feedbackId <= 0) {
            return response.status(400).json({ error: 'Invalid feedback ID.' });
        }

        const result = await pool.query(
            `SELECT name, class_name, subject, rating, subject_progress,
                    teaching_effectiveness, difficulty, comment
             FROM feedback
             WHERE id = $1`,
            [feedbackId]
        );
        if (result.rowCount === 0) {
            return response.status(404).json({ error: 'Feedback not found.' });
        }

        const row = result.rows[0];
        return response.json({
            feedback: {
                name: row.name,
                class: row.class_name,
                subject: row.subject,
                rating: Number(row.rating),
                subject_progress: Number(row.subject_progress),
                teaching_effectiveness: Number(row.teaching_effectiveness),
                difficulty: Number(row.difficulty),
                comment: row.comment || ''
            }
        });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not load feedback.' });
    }
});

app.post('/api/feedback', async (request, response) => {
    const {
        name,
        class: className,
        subject,
        rating,
        subject_progress: subjectProgress,
        teaching_effectiveness: teachingEffectiveness,
        difficulty,
        comment = ''
    } = request.body;

    if (!name || !className || !subject || !rating || !subjectProgress || !teachingEffectiveness || !difficulty) {
        return response.status(400).json({ error: 'All required fields must be filled in.' });
    }

    try {
        const createdAt = new Date();
        await pool.query(
            `INSERT INTO feedback
                (name, class_name, subject, rating, subject_progress, teaching_effectiveness, difficulty, comment, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [name, className, subject, rating, subjectProgress, teachingEffectiveness, difficulty, comment, createdAt]
        );

        const textResponse = [
            `Kuupäev: ${createdAt.toLocaleString('et-EE')}`,
            `Nimi: ${name}`,
            `Kursus: ${className}`,
            `Õppeaine: ${subject}`,
            `Hinne: ${rating}`,
            `Õppeainega hakkama saamine: ${subjectProgress}`,
            `Õpetamismeetodi tõhusus: ${teachingEffectiveness}`,
            `Raskus: ${difficulty}`,
            `Kommentaar: ${comment || '(puudub)'}`,
            '\n----------------------------------------\n'
        ].join('\n');

        await fs.appendFile(responsesFile, textResponse, 'utf8');
        const sqlResponse = `INSERT INTO feedback (name, class_name, subject, rating, subject_progress, teaching_effectiveness, difficulty, comment, created_at) VALUES (${[
            name,
            className,
            subject,
            rating,
            subjectProgress,
            teachingEffectiveness,
            difficulty,
            comment,
        ].map(sqlLiteral).join(', ')}, TIMESTAMPTZ ${sqlLiteral(createdAt.toISOString())});\n`;
        await fs.appendFile(sqlResponsesFile, sqlResponse, 'utf8');
        return response.json({ success: true });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not save feedback.' });
    }
});

if (serverRole === 'student') {
    app.use('/Student', express.static(path.join(frontendPath, 'Student')));
    app.get('/', (req, res) => {
        res.redirect('/Student/student.html')
    });
}

if (serverRole === 'teacher') {
    app.use('/Teacher', express.static(path.join(frontendPath, 'Teacher'), { index: false }));
    app.get('/', (req, res) => {
        res.redirect('/Teacher/login.html')
    });
}

async function start() {
    await createTable();
    app.listen(port, () => console.log(`Feedback form is running on port ${port}`));
}

start().catch((error) => {
    console.error('Could not start server:', error);
    process.exit(1);
});