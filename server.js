const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const responsesFile = path.join(__dirname, 'data', 'responses.txt');
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://feedback:feedback@localhost:5432/feedback'
});

app.use(express.json());
app.use(express.static(__dirname));

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
}

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
        await pool.query(
            `INSERT INTO feedback
                (name, class_name, subject, rating, subject_progress, teaching_effectiveness, difficulty, comment)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [name, className, subject, rating, subjectProgress, teachingEffectiveness, difficulty, comment]
        );

        const textResponse = [
            `Kuupäev: ${new Date().toLocaleString('et-EE')}`,
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
        return response.json({ success: true });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ error: 'Could not save feedback.' });
    }
});

async function start() {
    await createTable();
    app.listen(port, () => console.log(`Feedback form is running on port ${port}`));
}

start().catch((error) => {
    console.error('Could not start server:', error);
    process.exit(1);
});