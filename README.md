# SciPap - Paper Extraction tool

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/backend-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![React 18](https://img.shields.io/badge/frontend-React%2018%20%7C%20TypeScript-61dafb.svg)](https://react.dev/)
[![PyMuPDF](https://img.shields.io/badge/pdf-PyMuPDF-ff6f00.svg)](https://pymupdf.readthedocs.io/)
[![Docker](https://img.shields.io/badge/deployment-Docker%20Compose-2496ed.svg)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**SciPap** is an open-source scientific literature extraction and evidence-grounding platform designed for researchers, clinicians, and data scientists conducting systematic reviews and meta-analyses. 

The platform automates the extraction of multidimensional study variables from PDF literature using foundation models, while enforcing strict **spatial evidence grounding**: every extracted assertion is linked to its exact verbatim source quote and visual bounding-box coordinates on the original PDF document page.

---

## Architecture & Core Methodology

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     SCIPAP PIPELINE                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘

                         [ Scientific PDF Literature ]
                                      │
                                      ▼
                         [ PyMuPDF Document Engine ]
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   [ Text & Metadata Stream ]                     [ Coordinate Grid Mapping ]
              │                                               │
              ▼                                               │
   [ LLM Ingestion via OpenRouter ]                           │
   (Gemini, Qwen, Llama, Claude)                              │
   Structured JSON with verbatim provenance                   │
              │                                               │
              └───────────────────────┬───────────────────────┘
                                      ▼
                         [ Spatial Grounding Engine ]
                     Calculates [x0, y0, x1, y1] bounding boxes
                                      │
                                      ▼
                   [ Three-Pane Interactive Audit Workbench ]
  ┌───────────────────────┬───────────────────────────┬──────────────────────────────────┐
  │ 1. Paper Library      │ 2. Extraction Matrix      │ 3. PDF.js Document Viewer        │
  │ - Resizable sidebar   │ - Categorized schema      │ - Visual highlight overlays      │
  │ - Verification status │ - Manual override audits  │ - In-situ keyword search drawer  │
  │ - All/Checked/Pending │ - Multi-citation support  │ - Selectable / copyable text     │
  │ - Drag upload & scan  │ - Dynamic split resizer   │ - Direct click-to-page nav       │
  └───────────────────────┴───────────────────────────┴──────────────────────────────────┘
                                      │
                                      ▼
                        [ Audited Synthesis Export ]
                     CSV (Excel) & JSON for Meta-Analysis
                     Filtered to Human-Verified Studies
```

### Key Methodological Capabilities

1. **Spatial Evidence Grounding**
   - Foundation models extract structured values accompanied by continuous, verbatim source quotes.
   - PyMuPDF resolves exact document geometry, computing spatial bounding boxes `[x0, y0, x1, y1]` for each quote across single- and multi-line breaks.
   - Clicking any cell or citation in the extraction table immediately navigates to the target page and renders a calibrated highlight overlay over the supporting text.

2. **Three-Pane Interactive Auditing Workbench**
   - **Pane 1 (Paper Library & Queue)**: Resizable sidebar (220px–650px) with collapse toggle, quick paper switching, verification badges, and filtering tabs (*All*, *Checked / Verified*, *Pending Review*).
   - **Pane 2 (Extraction Matrix)**: Categorized tabular view with inline editing, multi-citation support, and audit status badges (distinguishing automated extractions from manual investigator overrides).
   - **Pane 3 (Precision PDF Viewer)**: PDF.js rendering engine with zoom, fit-to-width, selectable text layer, and bidirectional citation navigation.
   - **Interactive Layout Resizers**: Both split boundaries can be freely dragged to allocate screen space, with double-click shortcuts to reset to default layouts (320px sidebar, 50/50 table & PDF).

3. **In-Situ Document Keyword Search**
   - Embedded sub-millisecond keyword and phrase search powered by PyMuPDF.
   - Highlights all occurrences on the active page, navigates sequentially with <kbd>Enter</kbd> / <kbd>Shift+Enter</kbd>, and provides an expandable drawer with contextual snippets.

4. **Selectable & Copyable Text Layer**
   - Integrated transparent text layer matching the document raster geometry, enabling investigators to select and copy text directly from the PDF via standard shortcuts (<kbd>Cmd+C</kbd> / <kbd>Ctrl+C</kbd>), context menus, or the floating copy action pill.

5. **Standardized Systematic Review Schema**
   - Pre-configured with a 72-variable clinical and technical ontology defined in [`backend/schema_fields.json`](backend/schema_fields.json) covering 9 research domains:
     1. *Study Details* (Author, Year, DOI, Journal, Title)
     2. *Study Design* (Design, Main AI Use, Task, Care Setting, Multicenter Status, External Validation)
     3. *Study Population* (Cases, Demographics, Histopathology, Inclusion/Exclusion Criteria)
     4. *Reference Standard* (Benign/Malignant verification, Tumor distribution, Follow-up duration)
     5. *Imaging Data & Hardware* (Modality, Scanner & Vendor Specs, Image Type, Data Splits)
     6. *AI System* (Model Family, Version, Developer, Architecture, Decision Thresholds, Training Data)
     7. *Clinical Comparator & Readers* (Reader Counts, Experience, Reading Workflow, Blinding, Washout)
     8. *Performance & Endpoints* (AUROC, Sensitivity, Specificity, CDR, Recall, PPV, Workload Reduction)
     9. *Compliance & Regulatory* (Regulatory Clearance, Ethical Approval, Reporting Guidelines, Code/Data)
   - Interactive schema manager accessible from the navigation bar supporting custom variables, descriptions, and category organization.

6. **Audited Dataset Export**
   - Export extractions into standardized CSV or structured JSON formatted for statistical software (R, Python, Stata).
   - Default export filter targets verified (`is_checked`) papers, ensuring only human-audited extractions enter final meta-analysis pipelines.

---

## Deployment & Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- An [OpenRouter API Key](https://openrouter.ai/keys) (supports Gemini, Qwen, Llama, Claude, etc.)

---

### Method A: Docker Compose (Recommended)

1. **Clone the Repository**
   ```bash
   git clone https://github.com/pfeifferis/scipap.git
   cd scipap
   ```

2. **Configure Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` to supply your API key (optional; can also be entered directly in the web UI Settings modal):
   ```env
   OPENROUTER_API_KEY=sk-or-v1-your-key-here
   DEFAULT_MODEL=google/gemini-2.5-flash-lite:batch
   ```

3. **Start the Application**
   ```bash
   docker compose up --build
   ```

4. **Access the Workbench**
   - **Frontend Application**: [http://localhost:3000](http://localhost:3000)
   - **FastAPI Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### Method B: Native Local Development

#### Backend Setup (Python 3.11+)
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Frontend Setup (Node.js 18+)
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Document Ingestion

1. **Adding Research Papers**:
   - Place `.pdf` files into the `./papers/` directory on the host and click **Rescan** in the sidebar.
   - Alternatively, click the **Upload** button in the sidebar to upload files directly via the web interface.

2. **Schema Customization**:
   - All extraction variables are defined in [`backend/schema_fields.json`](backend/schema_fields.json).
   - Modifications made to this file are automatically synchronized into the database upon server boot.
   - You can also add or modify fields dynamically in the UI via **Schema Dictionary**.

---

## Repository Structure

```
.
├── backend/
│   ├── Dockerfile
│   ├── database.py              # SQLite connection, schema synchronization & settings
│   ├── llm_service.py           # OpenRouter API client, parallel chunking & JSON recovery
│   ├── main.py                  # FastAPI REST routes (papers, search, extraction, export)
│   ├── models.py                # SQLAlchemy ORM & Pydantic data schemas
│   ├── pdf_extractor.py         # PyMuPDF spatial search & layout extraction
│   ├── requirements.txt         # Python dependencies
│   └── schema_fields.json       # Canonical 72-field systematic review schema (SSOT)
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf               # Production Nginx reverse proxy
│   ├── package.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── ExtractionTable.tsx   # Categorized data matrix with inline editor & citations
│   │   │   ├── Navbar.tsx            # Header, model indicators, export controls
│   │   │   ├── PDFViewer.tsx         # PDF.js viewer, selectable text layer, spatial highlights
│   │   │   ├── PaperSidebar.tsx      # Document library, verified tabs & rescan/upload
│   │   │   ├── SchemaModal.tsx       # Interactive schema dictionary manager
│   │   │   └── SettingsModal.tsx     # LLM inference engine & API configuration
│   │   ├── api.ts                    # Typed API client
│   │   ├── types.ts                  # Domain TypeScript interfaces
│   │   ├── App.tsx                   # Three-pane resizable layout & state coordination
│   │   └── index.css                 # Styling & PDF textLayer selection rules
├── data/                             # Persistent SQLite storage (.gitignored)
│   └── .gitkeep
├── papers/                           # Document storage directory (.gitignored)
│   └── .gitkeep
├── docker-compose.yml                # Multi-container orchestration specification
├── .env.example                      # Environment configuration template
├── LICENSE                           # MIT License
└── README.md                         # System documentation
```

---

## API Specification

The backend exposes a standard REST API documented via OpenAPI at `http://localhost:8000/docs`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/papers` | List all ingested papers, extraction counts, and check statuses |
| `GET` | `/api/papers/{id}` | Retrieve single paper details with all extractions and citations |
| `GET` | `/api/papers/{id}/pdf` | Stream binary PDF document |
| `POST` | `/api/papers/upload` | Upload a new PDF document |
| `POST` | `/api/papers/scan` | Rescan `./papers/` directory for newly added files |
| `PATCH` | `/api/papers/{id}/checked` | Toggle manual verification status (`is_checked`) |
| `GET` | `/api/papers/{id}/search` | Sub-millisecond keyword spatial search across document pages |
| `POST` | `/api/papers/{id}/extract` | Run structured extraction pipeline for a single document |
| `POST` | `/api/papers/batch-extract` | Queue extraction across all unextracted documents |
| `PUT` | `/api/extractions/{id}` | Update extracted value or manual override status |
| `POST` | `/api/extractions/{id}/citations` | Add a manual citation with page number and verbatim quote |
| `DELETE` | `/api/citations/{id}` | Delete a specific citation |
| `GET` | `/api/schema` | Retrieve active extraction schema fields and categories |
| `POST` | `/api/schema` | Create a new schema extraction variable |
| `PUT` | `/api/schema/{id}` | Update an existing schema field |
| `DELETE` | `/api/schema/{id}` | Deactivate or delete a schema field |
| `GET` | `/api/export` | Export extractions in CSV or JSON format (`checked_only=true` supported) |
| `GET` | `/api/settings` | Retrieve active LLM inference configuration |
| `POST` | `/api/settings` | Update API key, extraction model, or system prompts |

---

## Security & Privacy Notice

- **Local Storage**: Research PDFs placed in `./papers/` and extraction databases in `./data/` remain strictly on your local infrastructure and are excluded from git version control.
- **Inference API**: Paper text streams are transmitted over TLS directly to OpenRouter endpoints according to your selected model provider's data retention policy. No third-party data tracking or telemetry is bundled.

---

## Citation

If you use SciPap in academic research or systematic literature reviews, please cite:

```bibtex
@software{SciPap2026,
  title = {SciPap: Scientific Paper Extraction and Auditing Tool},
  author = {Kevin Pfeiffer},
  year = {2026},
  url = {https://github.com/pfeifferis/scipap}
}
```

---

## License

This project is licensed under the [MIT License](LICENSE).
