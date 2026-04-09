# StyleSync

StyleSync is a web-based tool that transforms any website into an interactive, living design system.
Users can scrape a URL, extract design tokens (colors, typography, spacing), lock selected tokens, edit values in real time, and preview a Figma-like component library driven by CSS custom properties.

## Tech Stack

- Frontend: React (Create React App)
- Backend: FastAPI + PyMongo
- Database: MongoDB (local or Atlas)
- Scraping: Requests + BeautifulSoup + optional Playwright fallback
- Image palette extraction: Pillow

## Repository Structure

- `frontend/`: token editor dashboard + live component preview grid
- `backend/`: scraping engine, token normalization, lock/version APIs
- `backend/mongodb_schema.js`: MongoDB collections + indexes setup script
- `screenshots/`: place assessment screenshots for three extracted style guides

## Local Setup

### 1. Backend Setup (FastAPI)

From `backend/`:

```bash
python -m venv venv
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe -m playwright install chromium
```

Set env variables (PowerShell):

```powershell
$env:MONGODB_URI="mongodb://localhost:27017"
$env:MONGODB_DB="stylesync"
```

If you use MongoDB Atlas, set `MONGODB_URI` to your Atlas connection string.

Run API:

```bash
venv\Scripts\uvicorn.exe main:app --reload
```

API base URL: `http://127.0.0.1:8000/api`

### 2. Frontend Setup (React)

From `frontend/`:

```bash
npm install
npm start
```

Frontend URL: `http://localhost:3000`

## Core Features Implemented

### Ingest and Extraction

- URL submission and resilient scraping flow
- Optional browser-driven extraction for SPAs (`use_browser=true`)
- Graceful fallback token generation when blocked (CORS/paywall/timeout scenarios)

### Token System

- Extracted tokens:
	- `colors`
	- `typography`
	- `spacing`
- Locked tokens stored in `locked_tokens`
- Computed tokens (preview shadow, border width, card padding) derived from spacing unit
- Re-scrape merge strategy: locked tokens always override freshly extracted values

### UI Dashboard

- Interactive color picker with live hex editing
- Typography inspector (font families, base size, line height)
- Drag-to-adjust spacing visualizer
- Lock/unlock controls per token path with animated state
- Component preview grid:
	- Primary/Secondary/Ghost buttons
	- Input states (default/focus/error)
	- Card elevation/radius variants
	- Type scale specimens (H1 to caption)

### Versioning and Export

- Audit history stored in `version_history`
- Restore previous snapshots via API
- Export tokens as:
	- CSS custom properties
	- JSON tokens
	- Tailwind theme extension JSON

## API Endpoints

- `GET /api/health`
- `POST /api/sites/analyze`
- `GET /api/sites/{site_id}/tokens`
- `PUT /api/sites/{site_id}/tokens`
- `POST /api/sites/{site_id}/locks`
- `GET /api/sites/{site_id}/versions`
- `POST /api/sites/{site_id}/versions/{version_id}/restore`
- `GET /api/sites/{site_id}/export?format=json|css|tailwind`

## MongoDB Schema

Required collections:

- `scraped_sites`
- `design_tokens` (embedded token objects for colors/typography/spacing)
- `locked_tokens`
- `version_history`

Schema/index bootstrap script:

`backend/mongodb_schema.js`

## Assessment Screenshot Deliverable

Capture and place at least three images in `screenshots/`, for example:

- `screenshots/corporate-site.png`
- `screenshots/creative-portfolio.png`
- `screenshots/ecommerce-site.png`

Each screenshot should show extracted tokens and the live component preview with the generated theme.

## Notes

- Some websites block automation/scraping. StyleSync handles this by returning a simulated coherent token set and allowing full manual token editing.
- The frontend is designed to update preview styles immediately through CSS variables without page reload.
