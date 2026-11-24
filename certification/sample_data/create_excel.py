"""Script to create donnees.xlsx sample data file."""
import sys

try:
    import openpyxl
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
    import openpyxl

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
import os

wb = Workbook()
ws = wb.active
ws.title = "Participants"

# Headers
headers = ["email", "participant_name", "type", "presentation_title", "department", "city"]
ws.append(headers)

# Style header row
header_font = Font(bold=True, color="FFFFFF")
header_fill = PatternFill(start_color="1F4E79", end_color="1F4E79", fill_type="solid")
for col_idx, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col_idx)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = Alignment(horizontal="center")

# Sample data: 20 rows
# 5 Oral Communication, 5 Poster, 5 Attendees, 3 Organizers, 2 Workshop
rows = [
    # --- Oral Communication (5) ---
    [
        "ahmed.benali@example.com",
        "Ahmed Ben Ali",
        "Oral Communication",
        "Lobectomy via VATS in Locally Advanced Non-Small Cell Lung Cancer: A Single-Center Experience",
        "Service de Chirurgie Thoracique, Hôpital Charles Nicolle",
        "Tunis",
    ],
    [
        "fatma.trabelsi@example.com",
        "Fatma Trabelsi",
        "Oral Communication",
        "Outcomes of Sleeve Resection for Central Bronchial Tumors: 10-Year Retrospective Study",
        "Service de Chirurgie Thoracique, CHU Habib Bourguiba",
        "Sfax",
    ],
    [
        "mohamed.chaouech@example.com",
        "Mohamed Chaouech",
        "Oral Communication",
        "Robotic-Assisted Thymectomy for Myasthenia Gravis: Early Results",
        "Service de Chirurgie Thoracique, Hôpital La Rabta",
        "Tunis",
    ],
    [
        "sonia.belhaj@example.com",
        "Sonia Belhaj",
        "Oral Communication",
        "Management of Pleural Empyema: Comparison of VATS Decortication vs. Open Surgery",
        "Service de Chirurgie Thoracique, CHU Farhat Hached",
        "Sousse",
    ],
    [
        "karim.elloumi@example.com",
        "Karim Elloumi",
        "Oral Communication",
        "Mediastinal Mass Resection: Surgical Approaches and Complications in 85 Patients",
        "Service de Chirurgie Cardiovasculaire et Thoracique, CHU Mongi Slim",
        "La Marsa",
    ],
    # --- Poster (5) ---
    [
        "nadia.zaara@example.com",
        "Nadia Zaara",
        "Poster",
        "Spontaneous Pneumothorax in Young Athletes: Epidemiology and Surgical Indications",
        "Service de Chirurgie Thoracique, Hôpital Régional de Nabeul",
        "Nabeul",
    ],
    [
        "yassine.sfar@example.com",
        "Yassine Sfar",
        "Poster",
        "Post-Pneumonectomy Bronchopleural Fistula: Risk Factors and Preventive Strategies",
        "Service de Chirurgie Thoracique, CHU Habib Bourguiba",
        "Sfax",
    ],
    [
        "amira.gharbi@example.com",
        "Amira Gharbi",
        "Poster",
        "Chest Wall Tumors: A Multicenter Retrospective Analysis of Surgical Outcomes",
        "Service de Chirurgie Thoracique, Hôpital Charles Nicolle",
        "Tunis",
    ],
    [
        "bilel.meddeb@example.com",
        "Bilel Meddeb",
        "Poster",
        "Tracheal Stenosis: Combined Endoscopic and Surgical Management — Case Series",
        "Service de Chirurgie Thoracique, CHU Farhat Hached",
        "Sousse",
    ],
    [
        "rym.hannachi@example.com",
        "Rym Hannachi",
        "Poster",
        "Pulmonary Carcinoid Tumors: Conservative Resection and Long-Term Follow-Up",
        "Service d'Oncologie Médicale, Institut Salah Azaiez",
        "Tunis",
    ],
    # --- Attendee (5) ---
    [
        "omar.ksontini@example.com",
        "Omar Ksontini",
        "Attendee",
        "",
        "Service de Chirurgie Générale, Hôpital Régional de Gafsa",
        "Gafsa",
    ],
    [
        "leila.mzoughi@example.com",
        "Leila Mzoughi",
        "Attendee",
        "",
        "Service de Pneumologie, CHU Hédi Chaker",
        "Sfax",
    ],
    [
        "tarek.jebali@example.com",
        "Tarek Jebali",
        "Attendee",
        "",
        "Service de Chirurgie Thoracique, Hôpital Militaire Principal",
        "Tunis",
    ],
    [
        "ines.selmi@example.com",
        "Ines Selmi",
        "Attendee",
        "",
        "Service d'Anesthésiologie, CHU Mongi Slim",
        "La Marsa",
    ],
    [
        "walid.boubaker@example.com",
        "Walid Boubaker",
        "Attendee",
        "",
        "Service de Chirurgie Cardiovasculaire, Hôpital La Rabta",
        "Tunis",
    ],
    # --- Organizer (3) ---
    [
        "hassen.mezni@example.com",
        "Hassen Mezni",
        "Organizer",
        "",
        "Service de Chirurgie Thoracique, CHU Habib Bourguiba",
        "Sfax",
    ],
    [
        "asma.korbi@example.com",
        "Asma Korbi",
        "Organizer",
        "",
        "Service de Chirurgie Thoracique, CHU Habib Bourguiba",
        "Sfax",
    ],
    [
        "nabil.ayadi@example.com",
        "Nabil Ayadi",
        "Organizer",
        "",
        "Service de Chirurgie Thoracique, CHU Habib Bourguiba",
        "Sfax",
    ],
    # --- Workshop (2) ---
    [
        "sarra.chtioui@example.com",
        "Sarra Chtioui",
        "Workshop",
        "",
        "Service de Chirurgie Pédiatrique, Hôpital d'Enfants de Tunis",
        "Tunis",
    ],
    [
        "mabrouk.ferjaoui@example.com",
        "Mabrouk Ferjaoui",
        "Workshop",
        "",
        "Service de Chirurgie Thoracique, Hôpital Régional de Bizerte",
        "Bizerte",
    ],
]

for row in rows:
    ws.append(row)

# Column widths
col_widths = [32, 25, 22, 70, 50, 15]
for idx, width in enumerate(col_widths, 1):
    ws.column_dimensions[get_column_letter(idx)].width = width

# Alternate row colors
light_blue = PatternFill(start_color="DDEEFF", end_color="DDEEFF", fill_type="solid")
white = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
for row_idx in range(2, len(rows) + 2):
    fill = light_blue if row_idx % 2 == 0 else white
    for col_idx in range(1, len(headers) + 1):
        ws.cell(row=row_idx, column=col_idx).fill = fill

out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "donnees.xlsx")
wb.save(out_path)
print(f"Saved: {out_path}")
print(f"Rows written: {len(rows)}")

