# Attestation Generator

A web application to generate and mass-send personalized PDF certificates via Gmail.

Built for the **5th National Tunisian Thoracic Surgery Congress** (TTSA), Sfax, November 6–7, 2026.

---

## Table of Contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [Gmail Configuration](#gmail-configuration)
5. [Usage Guide](#usage-guide)
6. [Excel File Format](#excel-file-format)
7. [Sample Data](#sample-data)
8. [Environment Variables](#environment-variables)
9. [Architecture](#architecture)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)
12. [License](#license)

---

## Features

- **Upload PDF certificate template** — Use any existing PDF as your certificate base; the app overlays personalised text at precise coordinates.
- **Upload Excel file with participant data** — Supports `.xlsx` files with multiple sheets; each sheet can be linked to an attestation type.
- **Multi-sheet Excel import** — After upload, choose which sheet to process; the app detects column names automatically.
- **Visual field placement editor** — Click-to-place text fields on a live PDF preview (powered by PDF.js); drag and resize to fine-tune positions without editing code.
- **Multiple attestation types** — Define distinct types: *Oral Communication*, *Poster*, *Attendee*, *Organizer*, *Workshop*, etc., each with its own field layout, font, and role description text.
- **Per-type column mapping** — Each attestation type can specify which Excel column holds the recipient's name, email address, and optional presentation title, accommodating different sheet structures.
- **Bulk PDF generation with Unicode/accent support** — Uses PyMuPDF (MuPDF) for high-fidelity text rendering; supports Latin extended characters and Arabic via `arabic-reshaper` and `python-bidi`.
- **Preview each certificate before sending** — View a rendered thumbnail or full PDF for every participant before triggering the send.
- **Send all certificates via Gmail** — Integrates with Gmail via OAuth2 (recommended) or App Password (SMTP fallback); each recipient receives their personalised PDF as an email attachment.
- **Real-time progress tracking** — Server-Sent Events (SSE) stream live status updates to the browser as emails are dispatched.
- **Retry failed sends** — Identify failed deliveries with one click and re-queue them without re-sending successful ones.
- **Export send history as CSV** — Download a full log of every send attempt: recipient, status, timestamp, error message.
- **Download all certificates as ZIP** — Package every generated PDF into a single downloadable archive.
- **Persistent configuration** — All settings (Gmail credentials, field layouts, attestation types) are stored in a local SQLite database via SQLAlchemy and survive restarts.

---

## Requirements

### System

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Python      | 3.11    | 3.14        |
| Node.js     | 18      | 22 LTS      |
| pnpm        | 8       | 9+          |
| RAM         | 2 GB    | 4 GB        |
| Disk space  | 500 MB  | 1 GB+       |
| OS          | Windows 10 / Ubuntu 20.04 / macOS 12 | Any modern OS |

### Python Packages (backend)

The backend `requirements.txt` lists:

```
fastapi>=0.115
uvicorn[standard]>=0.30
sqlalchemy>=2.0
aiosqlite>=0.20
pydantic-settings>=2.0
pymupdf>=1.24
pandas>=2.2
openpyxl>=3.1
python-multipart>=0.0.9
sse-starlette>=2.1
cryptography>=42.0
aiosmtplib>=3.0
google-auth>=2.30
google-auth-oauthlib>=1.2
google-api-python-client>=2.130
python-bidi>=0.4
arabic-reshaper>=3.0
Pillow>=10.4
```

### Node / Frontend

| Package | Purpose |
|---------|---------|
| React 18+ | UI framework |
| Vite 5+ | Dev server and bundler |
| PDF.js | In-browser PDF rendering for the visual editor |
| shadcn/ui + Tailwind CSS | Component library and styling |
| Axios | HTTP client for API calls |
| React Query | Server state management |

### Google Cloud (for Gmail OAuth2)

A Google Cloud project with the **Gmail API** enabled and an OAuth 2.0 credential (Desktop App or Web App type). See [Gmail Configuration](#gmail-configuration) for step-by-step instructions.

---

## Installation

### 1. Clone / Download the project

```bash
git clone https://github.com/your-org/attestation-generator.git
cd attestation-generator
```

Or download the ZIP from the Releases page and extract it.

### 2. Backend Setup

```bash
cd backend

# Copy the example environment file and edit it
copy .env.example .env
# (Linux/macOS: cp .env.example .env)

# Open .env in your editor and fill in the required fields
# (see Environment Variables section below)

# Install Python dependencies
pip install -r requirements.txt

# Run database migrations (creates tables on first run)
python -m app.db.init_db

# Start the development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive API documentation (Swagger UI) is at `http://localhost:8000/docs`.  
ReDoc alternative docs are at `http://localhost:8000/redoc`.

> **Note:** On Windows, if you use Python 3.14 from the Python Manager, invoke it explicitly:
> ```powershell
> $py = "C:\Users\ABC\AppData\Local\Python\pythoncore-3.14-64\python.exe"
> & $py -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
> ```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

The frontend will be available at `http://localhost:5173`.

> **Note:** pnpm is required. Install it globally with:
> ```bash
> npm install -g pnpm
> ```

### 4. Access the Application

| Service        | URL                          |
|----------------|------------------------------|
| Frontend (UI)  | http://localhost:5173        |
| Backend (API)  | http://localhost:8000        |
| Swagger docs   | http://localhost:8000/docs   |
| ReDoc docs     | http://localhost:8000/redoc  |

---

## Gmail Configuration

The application supports two methods of sending email via Gmail. **OAuth2 is strongly recommended** for production use because it does not require storing your password and cannot be accidentally leaked.

### Option A: OAuth2 (Recommended)

OAuth2 authenticates the app as a trusted client using a token that you can revoke at any time.

#### Step 1 — Create a Google Cloud Project

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/).
2. Click **Select a project** → **New Project**.
3. Enter a project name (e.g., `Attestation Generator`) and click **Create**.

#### Step 2 — Enable the Gmail API

1. In your project, go to **APIs & Services → Library**.
2. Search for **Gmail API**.
3. Click on it, then click **Enable**.

#### Step 3 — Configure the OAuth Consent Screen

1. Go to **APIs & Services → OAuth consent screen**.
2. Select **External** (unless all users are within a Google Workspace organisation).
3. Fill in:
   - **App name**: `Attestation Generator`
   - **User support email**: your email
   - **Developer contact**: your email
4. Click **Save and Continue**.
5. On the **Scopes** step, click **Add or Remove Scopes** and add:
   - `https://www.googleapis.com/auth/gmail.send`
6. Click **Update**, then **Save and Continue**.
7. On the **Test users** step, add your Gmail address (the one you will send from).
8. Click **Save and Continue**, then **Back to Dashboard**.

#### Step 4 — Create OAuth2 Credentials

1. Go to **APIs & Services → Credentials**.
2. Click **Create Credentials → OAuth client ID**.
3. For **Application type**, select **Desktop app**.
4. Enter a name (e.g., `Attestation Generator Desktop`) and click **Create**.
5. Click **Download JSON** on the confirmation dialog.
6. Save the downloaded file as `client_secret.json` inside the `backend/` folder.

#### Step 5 — Authorise the Application

On first launch, the backend will detect missing tokens and print an authorisation URL in the console. Open that URL in your browser, sign in with the Gmail account you want to send from, grant the requested permission, and copy the authorisation code back into the terminal (or the app will handle the redirect automatically if running on `localhost`).

The resulting `token.json` is stored in the `backend/` folder and refreshed automatically.

#### Step 6 — Set Environment Variables

In `backend/.env`, set:

```env
GMAIL_MODE=oauth2
GMAIL_CLIENT_SECRET_FILE=client_secret.json
GMAIL_TOKEN_FILE=token.json
GMAIL_SENDER_EMAIL=your.address@gmail.com
```

---

### Option B: App Password (SMTP)

App Passwords let you sign in with a 16-character password generated by Google, without enabling 2FA for your whole account (though 2FA must be enabled on the Google account).

#### Step 1 — Enable 2-Step Verification

1. Go to [https://myaccount.google.com/security](https://myaccount.google.com/security).
2. Under **How you sign in to Google**, click **2-Step Verification** and follow the prompts.

#### Step 2 — Generate an App Password

1. Return to [https://myaccount.google.com/security](https://myaccount.google.com/security).
2. Under **2-Step Verification**, scroll to the bottom and click **App passwords**.
3. For the app name, enter `Attestation Generator`, then click **Create**.
4. Google will show a 16-character password. **Copy it immediately** — it will not be shown again.

#### Step 3 — Set Environment Variables

In `backend/.env`, set:

```env
GMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your.address@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx   # 16-char app password (spaces are ignored)
GMAIL_SENDER_EMAIL=your.address@gmail.com
```

> **Security note:** Keep `.env` out of version control. The `.gitignore` already excludes it.

---

## Usage Guide

### Step 1: Configure Gmail

1. Open the app at `http://localhost:5173`.
2. Click **Settings** in the sidebar.
3. Under **Gmail**, select your method (OAuth2 or SMTP).
4. For OAuth2: paste the path to `client_secret.json` and click **Authorise**; a browser window will open for Google sign-in.
5. For SMTP: enter your Gmail address and app password.
6. Click **Test Connection** to verify sending works before importing any data.

---

### Step 2: Upload Template

1. Click **Template** in the sidebar.
2. Click **Upload PDF** and select your certificate PDF file (e.g., `Certification_template.pdf`).
3. The PDF will render in the preview panel using PDF.js.
4. The template is stored permanently; you can replace it at any time.

**Template dimensions for the TTSA certificate:**  
A4 Landscape — **841.89 × 595.28 points** (297 × 210 mm at 72 dpi).

---

### Step 3: Create Attestation Types

Each participation category (Oral Communication, Poster, Attendee, etc.) needs its own **Attestation Type**, which defines:

- The **role description text** inserted into the certificate (e.g., *"has participated as an attendee"*).
- Which **Excel sheet** to read (e.g., `Conference` or `Eposter`).
- Which **Excel column** holds the recipient's **name** (e.g., `Author`, `Submitter Name`).
- Which **Excel column** holds the recipient's **email** (e.g., `Email`, `Submitter Email`).
- The **email subject** and **email body** template (supports `{{participant_name}}` and `{{presentation_title}}` placeholders).

To create an attestation type:

1. Click **Attestation Types** in the sidebar.
2. Click **New Type**.
3. Fill in:
   - **Name**: e.g., `Oral Communication`
   - **Role description**: e.g., `has participated as an oral communication presenter`
   - **Sheet name**: e.g., `Conference`
   - **Name column**: e.g., `Author`
   - **Email column**: e.g., `Email`
   - **Email subject**: e.g., `Your Certificate — 5th TTSA Congress`
   - **Email body**: e.g., `Dear {{participant_name}},\n\nPlease find attached your certificate for the 5th National Tunisian Thoracic Surgery Congress.\n\nBest regards,\nThe TTSA Organising Committee`
4. Click **Save**.

Repeat for every participation type you need.

---

### Step 4: Configure Field Mapping

The **Field Mapping** editor lets you place text fields on the PDF template. For each attestation type, you define where each data field should be rendered.

**To open the editor:**

1. Click **Attestation Types**, then click **Edit Fields** on the type you want to configure.
2. The PDF template renders in the editor panel.
3. Click anywhere on the PDF to drop a new field, or select an existing field and drag it to reposition.

**Field properties:**

| Property     | Description |
|-------------|-------------|
| Field name  | Which data variable to insert (`participant_name`, `role_description`, `presentation_title`) |
| X position  | Horizontal coordinate in PDF points from the left edge |
| Y position  | Vertical coordinate in PDF points from the **bottom** edge (PDF coordinate system) |
| Font        | One of: `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique`, or a custom embedded font |
| Font size   | Text size in points |
| Alignment   | `Left`, `Center`, or `Right` |
| Max width   | Maximum text width in points; text wraps or scales down if exceeded |
| Color       | RGB hex color (default `#000000`) |

**Recommended field positions for the TTSA template:**

| Field | X | Y | Font | Size | Alignment | Max Width |
|-------|---|---|------|------|-----------|-----------|
| `participant_name`   | 430 | 285 | Helvetica-Bold    | 22 | Center | 400 |
| `role_description`   | 430 | 320 | Helvetica-Oblique | 14 | Center | 500 |
| `presentation_title` | 430 | 345 | Helvetica-Oblique | 12 | Center | 500 |

> **Note:** Y values are measured from the **bottom** of the page in PDF coordinates.  
> For an A4 Landscape page (595.28 pt tall), `y=285` is roughly 310 pt from the top.

---

### Step 5: Import Excel

1. Click **Import** in the sidebar.
2. Click **Upload Excel** and select your `.xlsx` file.
3. The API parses the file and returns a list of sheets. A **sheet selector** appears (tabs or dropdown).
4. Select the sheet to import (e.g., `Conference`).
5. Link it to an **Attestation Type** using the dropdown.
6. The table below previews the rows, showing the name and email columns as defined by the linked type.
7. Review the data, then click **Import Rows**.

**Validation:**
- Rows missing an email address are flagged in red and skipped.
- Duplicate email addresses within a session are highlighted with a warning.
- You can manually exclude individual rows by unchecking them before importing.

---

### Step 6: Preview & Send

#### Preview

1. Click **Recipients** in the sidebar to see the full list of imported participants.
2. Click **Preview** on any row to open a rendered PDF thumbnail for that participant.
3. The preview is generated on-the-fly by the backend; it shows exactly what will be attached to the email.

#### Send All

1. From the **Recipients** page, click **Send All** (or **Send Selected** to process only checked rows).
2. A progress panel opens at the bottom of the screen showing:
   - Total queued / sent / failed counts.
   - Live status for each recipient (streaming via SSE).
3. Failed rows are highlighted. Click **Retry Failed** to re-attempt only those recipients.

#### Export History

- Click **Export CSV** to download a full log with columns: `email`, `participant_name`, `type`, `status`, `sent_at`, `error_message`.

#### Download ZIP

- Click **Download ZIP** to package every successfully generated PDF into a single archive.

---

## Excel File Format

The application supports `.xlsx` files with one or more sheets.

### Standard Format (single sheet)

The simplest layout uses a single sheet with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| `email` | ✅ | Recipient email address |
| `participant_name` | ✅ | Full name of attendee |
| `type` | ✅ | Participation type (must match an attestation type name) |
| `presentation_title` | ✗ | Paper/poster title (leave blank for Attendee/Organizer) |
| `department` | ✗ | Hospital or department name |
| `city` | ✗ | City |

### Multi-Sheet Format (Conference / Eposter)

The user's real Excel has two sheets with **different column structures**:

#### Sheet: `Conference`

| Column | Maps to |
|--------|---------|
| `Title` | presentation title |
| `Author` | participant name |
| `Email` | email address |

#### Sheet: `Eposter`

| Column | Maps to |
|--------|---------|
| `Title` | presentation title |
| `Submitter Name` | participant name |
| `Submitter Email` | email address |
| `Authors & Affiliations` | additional info (not used for certificate) |

For each sheet, create a matching **Attestation Type** in the app with the correct column mappings (`name_column`, `email_column`).

---

## Sample Data

### `sample_data/donnees.xlsx`

A ready-to-use test dataset with **20 fictional Tunisian medical participants**:

| Count | Type | Has Title |
|-------|------|-----------|
| 5 | Oral Communication | ✅ |
| 5 | Poster | ✅ |
| 5 | Attendee | ✗ |
| 3 | Organizer | ✗ |
| 2 | Workshop | ✗ |

All email addresses use the `@example.com` domain and are entirely fictional.

Columns: `email`, `participant_name`, `type`, `presentation_title`, `department`, `city`.

### `Certification_template.pdf`

The official TTSA certificate template:

- **Page size**: A4 Landscape (841.89 × 595.28 points)
- **Congress**: 5th National Tunisian Thoracic Surgery Congress
- **Location**: Sfax, Tunisia
- **Date**: November 6–7, 2026
- **Static text**: Organisation name, congress title, city, date
- **Dynamic fields**: `participant_name`, `role_description`, `presentation_title`

---

## Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure the following:

### Application

```env
# Application secret key (generate with: python -c "import secrets; print(secrets.token_hex(32))")
SECRET_KEY=change_me_to_a_random_secret_key

# CORS origins allowed to call the API (comma-separated)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Directory where generated PDFs and uploaded files are stored
STORAGE_DIR=./storage

# SQLite database URL
DATABASE_URL=sqlite+aiosqlite:///./attestation.db

# Log level: DEBUG, INFO, WARNING, ERROR
LOG_LEVEL=INFO
```

### Gmail — OAuth2

```env
GMAIL_MODE=oauth2
GMAIL_CLIENT_SECRET_FILE=client_secret.json
GMAIL_TOKEN_FILE=token.json
GMAIL_SENDER_EMAIL=your.address@gmail.com
```

### Gmail — SMTP / App Password

```env
GMAIL_MODE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your.address@gmail.com
SMTP_PASSWORD=xxxx xxxx xxxx xxxx
GMAIL_SENDER_EMAIL=your.address@gmail.com
```

### Rate Limiting

```env
# Seconds to wait between emails (avoids Gmail sending limits)
EMAIL_SEND_DELAY_SECONDS=1.5

# Maximum concurrent send workers
EMAIL_MAX_CONCURRENCY=3
```

### PDF Generation

```env
# DPI for thumbnail previews
PDF_PREVIEW_DPI=150

# Default font search path (optional, leave blank to use bundled fonts)
PDF_FONT_DIR=
```

---

## Architecture

```
attestation-generator/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app factory, middleware, router registration
│   │   ├── config.py            # Pydantic Settings model; reads .env
│   │   ├── db/
│   │   │   ├── base.py          # SQLAlchemy declarative base
│   │   │   ├── session.py       # Async session factory
│   │   │   └── init_db.py       # Table creation script
│   │   ├── models/
│   │   │   ├── attestation_type.py   # AttestationType ORM model
│   │   │   ├── recipient.py          # Recipient ORM model
│   │   │   ├── send_log.py           # SendLog ORM model
│   │   │   └── field_config.py       # FieldConfig ORM model
│   │   ├── routers/
│   │   │   ├── attestation_types.py  # CRUD for attestation types
│   │   │   ├── recipients.py         # Import, list, preview endpoints
│   │   │   ├── send.py               # Bulk send + SSE progress stream
│   │   │   ├── excel.py              # Excel upload and sheet detection
│   │   │   ├── template.py           # PDF template upload
│   │   │   └── settings.py           # Gmail configuration
│   │   ├── services/
│   │   │   ├── pdf_generator.py      # PyMuPDF text overlay engine
│   │   │   ├── excel_parser.py       # openpyxl / pandas sheet reader
│   │   │   ├── gmail_oauth.py        # Google OAuth2 flow + send
│   │   │   ├── gmail_smtp.py         # aiosmtplib SMTP send
│   │   │   └── zip_builder.py        # ZIP archive creation
│   │   └── schemas/
│   │       ├── attestation_type.py   # Pydantic request/response models
│   │       ├── recipient.py
│   │       └── send.py
│   ├── requirements.txt
│   ├── .env.example
│   └── Certification_template.pdf    # (symlink or copy)
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Settings.tsx          # Gmail config form
│   │   │   ├── Template.tsx          # PDF template upload + preview
│   │   │   ├── AttestationTypes.tsx  # CRUD list; create/edit modal
│   │   │   ├── FieldEditor.tsx       # Visual click-to-place field editor
│   │   │   ├── ExcelImport.tsx       # Upload → sheet selector → type link → import
│   │   │   ├── Recipients.tsx        # Table of imported participants
│   │   │   ├── Preview.tsx           # Per-recipient PDF preview
│   │   │   └── SendProgress.tsx      # SSE progress panel + retry
│   │   ├── components/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── PdfViewer.tsx         # PDF.js wrapper
│   │   │   └── FieldOverlay.tsx      # Draggable field handles on PdfViewer
│   │   ├── api/
│   │   │   └── client.ts             # Axios instance + typed API helpers
│   │   ├── hooks/
│   │   │   ├── useAttestationTypes.ts
│   │   │   ├── useRecipients.ts
│   │   │   └── useSendProgress.ts    # SSE event subscription hook
│   │   └── App.tsx
│   ├── package.json
│   ├── pnpm-lock.yaml
│   └── vite.config.ts
│
├── sample_data/
│   └── donnees.xlsx
│
├── Certification_template.pdf
└── README.md
```

### Data Flow

```
User uploads Excel
       │
       ▼
excel_parser.py  ←── openpyxl reads sheets
       │
       ▼
Recipient rows stored in SQLite
       │
       ▼
User clicks "Send All"
       │
       ├──► pdf_generator.py  ←── PyMuPDF overlays text on PDF template
       │           │
       │           ▼
       │       Generated PDF saved to storage/
       │
       ├──► gmail_oauth.py / gmail_smtp.py  ←── attaches PDF, sends email
       │
       ▼
SendLog updated  ──► SSE stream ──► frontend progress panel
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.  
Interactive docs: `http://localhost:8000/docs`

### Attestation Types

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/attestation-types` | List all types |
| `POST` | `/attestation-types` | Create a new type |
| `GET`  | `/attestation-types/{id}` | Get a single type |
| `PUT`  | `/attestation-types/{id}` | Update a type |
| `DELETE` | `/attestation-types/{id}` | Delete a type |
| `GET`  | `/attestation-types/{id}/fields` | List field configs for a type |
| `PUT`  | `/attestation-types/{id}/fields` | Save field configs for a type |

### Excel Import

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/excel/upload` | Upload an Excel file; returns sheet names and column headers |
| `POST` | `/excel/import` | Import rows from a specific sheet, linked to an attestation type |
| `GET`  | `/excel/validate` | Re-validate previously uploaded data |

### Recipients

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/recipients` | List recipients (filterable by type, status) |
| `GET`  | `/recipients/{id}/preview` | Returns a rendered PDF binary for preview |
| `DELETE` | `/recipients/{id}` | Remove a recipient |

### Send

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/send/all` | Queue all pending recipients for sending |
| `POST` | `/send/selected` | Queue only the specified recipient IDs |
| `POST` | `/send/retry-failed` | Re-queue all failed recipients |
| `GET`  | `/send/progress` | **SSE stream** — real-time event stream of send progress |
| `GET`  | `/send/history` | Full send log |
| `GET`  | `/send/export-csv` | Download send history as CSV |

### Template

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/template/upload` | Upload a new PDF template |
| `GET`  | `/template/preview` | Returns the template PDF binary |

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/settings` | Get current Gmail configuration |
| `PUT`  | `/settings` | Save Gmail configuration |
| `POST` | `/settings/test-connection` | Send a test email to verify credentials |
| `GET`  | `/settings/oauth/authorize` | Start OAuth2 flow; returns auth URL |
| `GET`  | `/settings/oauth/callback` | Handle OAuth2 redirect; saves token |

### Download

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/download/zip` | Download all generated PDFs as a ZIP archive |

---

## Troubleshooting

### "python.exe is not recognized" on Windows

The Python Manager installs Python in a non-standard location. Use the full path:

```powershell
$py = "C:\Users\ABC\AppData\Local\Python\pythoncore-3.14-64\python.exe"
& $py --version
& $py -m uvicorn app.main:app --reload
```

### Gmail OAuth2 — "Access blocked: app not verified"

Your app is in test mode and only allows the test users you added in the OAuth Consent Screen. Add your Gmail address as a test user (see [Option A, Step 3](#step-3--configure-the-oauth-consent-screen)).

### Gmail OAuth2 — Token expired

Delete `backend/token.json` and restart the backend. The authorisation flow will re-run on the next API call.

### "No module named 'pymupdf'" / "No module named 'fitz'"

PyMuPDF's Python package name on PyPI is `pymupdf` but it imports as `fitz`:

```bash
pip install pymupdf
python -c "import fitz; print(fitz.__version__)"
```

### Arabic / accent characters not rendering

Ensure `arabic-reshaper` and `python-bidi` are installed, and that the font you selected supports the character set. For Arabic, use a TTF/OTF font file (e.g., Amiri or Cairo) referenced by absolute path in the field config.

### CORS errors in the browser

Ensure the frontend origin (`http://localhost:5173`) is listed in `CORS_ORIGINS` in `backend/.env`.

### SQLite "database is locked"

This can happen if two processes open the database simultaneously. Make sure only one instance of `uvicorn` is running. The connection pool is configured for SQLite's single-writer mode via `check_same_thread=False` and `pool_pre_ping=True`.

### Large Excel files are slow to import

pandas is used for initial parsing; it loads the entire sheet into memory. For files with thousands of rows, prefer splitting the sheet into smaller batches (500 rows each) before importing.

### PDFs generated but emails not arriving

1. Check the send log in **Recipients → Export CSV** for error messages.
2. Verify Gmail credentials with **Settings → Test Connection**.
3. Check Gmail's **Sent** folder — if emails appear there, the issue is on the recipient's side (spam filtering, full inbox).
4. Increase `EMAIL_SEND_DELAY_SECONDS` to avoid Gmail's rate limit (typically 100 emails/day for free accounts).

---

## License

MIT License

Copyright (c) 2026 TTSA Organising Committee

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

