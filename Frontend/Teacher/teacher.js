const subjectsBody = document.getElementById('subjects-body');
const feedbackList = document.getElementById('feedback-list');
const dashboardError = document.getElementById('dashboard-error');
const logoutButton = document.getElementById('logout-button');
const openFeedbackButton = document.getElementById('open-feedback-button');

function addCell(row, text) {
    const cell = document.createElement('td');
    cell.textContent = text;
    row.append(cell);
}

function showEmptyState(container, message) {
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    container.append(paragraph);
}

function renderDashboard(data) {
    if (data.subjects.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = 'Tagasisidet pole veel saadetud.';
        row.append(cell);
        subjectsBody.append(row);
    } else {
        data.subjects.forEach((subject) => {
            const row = document.createElement('tr');
            addCell(row, subject.name);
            addCell(row, subject.teacher || '—');
            addCell(row, `${subject.averageRating.toFixed(1).replace('.', ',')} / 5`);
            addCell(row, String(subject.responseCount));
            subjectsBody.append(row);
        });
    }

    if (data.feedback.length === 0) {
        showEmptyState(feedbackList, 'Tagasisidet pole veel saadetud.');
        return;
    }

    data.feedback.forEach((item) => {
        const article = document.createElement('article');
        article.className = 'feedback';

        const selection = document.createElement('input');
        selection.className = 'feedback-selection';
        selection.type = 'radio';
        selection.name = 'selected-feedback';
        selection.value = String(item.id);
        selection.setAttribute('aria-label', `Vali tagasiside: ${item.subject}`);
        selection.addEventListener('change', () => {
            feedbackList.querySelectorAll('.feedback').forEach((feedback) => {
                feedback.classList.remove('selected');
            });
            article.classList.add('selected');
            openFeedbackButton.disabled = false;
            openFeedbackButton.dataset.feedbackId = selection.value;
        });

        const content = document.createElement('div');
        content.className = 'feedback-content';
        const heading = document.createElement('div');
        heading.className = 'feedback-heading';
        const title = document.createElement('h3');
        title.textContent = item.teacher ? `${item.subject} — ${item.teacher}` : item.subject;
        const date = document.createElement('time');
        date.dateTime = item.createdAt;
        date.textContent = new Intl.DateTimeFormat('et-EE', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        }).format(new Date(item.createdAt));
        heading.append(title, date);

        const rating = document.createElement('p');
        rating.className = 'rating';
        rating.textContent = 'Hinnang: ';
        const score = document.createElement('strong');
        score.textContent = `${item.rating} / 5`;
        rating.append(score);

        content.append(heading, rating);
        article.append(selection, content);
        feedbackList.append(article);
    });
}

async function loadDashboard() {
    try {
        const response = await fetch('/api/teacher/dashboard');
        if (response.status === 401) {
            window.location.replace('/Teacher/login.html');
            return;
        }
        if (!response.ok) {
            throw new Error('Dashboardi laadimine ebaõnnestus.');
        }
        renderDashboard(await response.json());
    } catch (error) {
        dashboardError.textContent = error.message;
        dashboardError.hidden = false;
    }
}

logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true;
    try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) {
            throw new Error('Väljalogimine ebaõnnestus.');
        }
        window.location.replace('/Teacher/login.html');
    } catch (error) {
        dashboardError.textContent = error.message;
        dashboardError.hidden = false;
        logoutButton.disabled = false;
    }
});

openFeedbackButton.addEventListener('click', () => {
    const feedbackId = openFeedbackButton.dataset.feedbackId;
    if (!feedbackId) {
        return;
    }
    window.location.href = `../Student/student.html?responseId=${encodeURIComponent(feedbackId)}`;
});

loadDashboard();
