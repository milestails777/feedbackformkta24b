All rights received to the company name Samirius Production 2015-2026.
This site and form was copyrighted by (c) Samirius Production 2015-2026 together with
Samir Cibis, Aleksander Kartuzov and Daniel Helmrosin. 
Developed by Samir Cibis, Daniel Helmrosin and Aleksander Kartuzov.

FIGMA design of our feedback form was designed by Aleksander Kartuzov and
located as a separate link in FIGMA site.

Guide how to open and run a site:

## 1. Install Docker Desktop with already installed WSL2 on your machine and run it first. 
## 2. Copy `.env.example` to `.env` and set a private teacher username and password.
    The teacher account is created in PostgreSQL on first startup. The password is stored as a salted scrypt hash.
## 3. By using Visual Studio Code open folder feedbackformkta24b and then open terminal in VS Code.
    You can also run it from PowerShell.
## 4. in Terminal write a command sh server.sh to run a program.
## 5. Open link that has appeared in the description down below.

The student feedback form remains public. The teacher dashboard at `/Teacher/teacher.html` requires the account configured above. Dashboard data and subject averages are read from PostgreSQL.
For deployments outside local development, serve the application over HTTPS and set `NODE_ENV=production` so the session cookie is marked secure.

Feedback is stored in the PostgreSQL database and mirrored in `backend/data/responses.txt` and `backend/data/responses.sql`.
The SQL file contains an `INSERT` statement for each response.

-------------------------------------------------------------------

ENJOY THE USAGE!