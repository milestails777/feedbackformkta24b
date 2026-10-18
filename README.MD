All rights received to the company name Samirius Production 2015-2026.
This site and form was copyrighted by (c) Samirius Production 2015-2026 together with
Samir Cibis, Aleksander Kartuzov and Daniel Helmrosin. 
Developed by Samir Cibis, Daniel Helmrosin and Aleksander Kartuzov.

FIGMA design of our feedback form was designed by Aleksander Kartuzov and
located as a separate link in FIGMA site.

Guide how to open and run a site:

## 1. Install Docker Desktop with already installed WSL2 on your machine and run it first. 
## 2. Copy `.env.example` to `.env` and set a private teacher username and password.
    The teacher account is synchronized from these values whenever the app starts. The password is stored as a salted scrypt hash, so changing the credentials in `.env` also updates the existing account.
## 3. Open the `feedbackformkta24b` folder in Visual Studio Code and open a terminal in the project folder.
## 4. On Windows, run this command in PowerShell:
    docker compose up -d --build
    Do not use `sh server.sh` in PowerShell; `sh` is a Unix shell and is not installed by default on Windows.
    On Linux or macOS, you can run `sh server.sh` instead.
## 5. Open the site at http://localhost:3010 (student form) or http://localhost:3011 (teacher dashboard).
    To stop the containers, run `docker compose down`.

The student feedback form remains public. The teacher dashboard at `/Teacher/teacher.html` requires the account configured above. Dashboard data and subject averages are read from PostgreSQL.
For deployments outside local development, serve the application over HTTPS and set `NODE_ENV=production` so the session cookie is marked secure.

Feedback is stored in the PostgreSQL database and mirrored in `backend/data/responses.txt` and `backend/data/responses.sql`.
The SQL file contains an `INSERT` statement for each response.

-------------------------------------------------------------------

ENJOY THE USAGE!