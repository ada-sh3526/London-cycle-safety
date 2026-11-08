#!/usr/bin/env python3
"""Build a reproducible London cycling safety story from TfL's 2025 open data."""

from __future__ import annotations

import csv
import json
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUT = ROOT / "apps" / "website" / "public" / "data"
OUT.mkdir(parents=True, exist_ok=True)


def rows(path: Path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


def number(value: str | None):
    try:
        return float(value) if value not in (None, "", "N/A", "N/A*") else None
    except (TypeError, ValueError):
        return None


def grid_to_wgs84(easting: float | None, northing: float | None):
    """Transform OSGB36 / British National Grid to WGS84 (EPSG operation 1314).

    The seven-parameter Helmert operation is accurate to about 3.5 m (95%)
    within Great Britain. It replaces the earlier city-scale affine guess.
    """
    if easting is None or northing is None:
        return None, None

    # Inverse National Grid projection on the Airy 1830 ellipsoid.
    a, b, scale = 6377563.396, 6356256.909, 0.9996012717
    e2 = 1 - (b * b) / (a * a)
    n = (a - b) / (a + b)
    lat0, lon0 = math.radians(49), math.radians(-2)
    north0, east0 = -100000, 400000
    lat = lat0
    while True:
        meridional = b * scale * (
            (1 + n + 5 / 4 * n**2 + 5 / 4 * n**3) * (lat - lat0)
            - (3 * n + 3 * n**2 + 21 / 8 * n**3) * math.sin(lat - lat0) * math.cos(lat + lat0)
            + (15 / 8 * n**2 + 15 / 8 * n**3) * math.sin(2 * (lat - lat0)) * math.cos(2 * (lat + lat0))
            - (35 / 24 * n**3) * math.sin(3 * (lat - lat0)) * math.cos(3 * (lat + lat0))
        )
        correction = (northing - north0 - meridional) / (a * scale)
        lat += correction
        if abs(correction) < 1e-12:
            break

    sin_lat, cos_lat = math.sin(lat), math.cos(lat)
    nu = a * scale / math.sqrt(1 - e2 * sin_lat**2)
    rho = a * scale * (1 - e2) / (1 - e2 * sin_lat**2) ** 1.5
    eta2 = nu / rho - 1
    tan_lat, sec_lat = math.tan(lat), 1 / cos_lat
    de = easting - east0
    vii = tan_lat / (2 * rho * nu)
    viii = tan_lat / (24 * rho * nu**3) * (5 + 3 * tan_lat**2 + eta2 - 9 * tan_lat**2 * eta2)
    ix = tan_lat / (720 * rho * nu**5) * (61 + 90 * tan_lat**2 + 45 * tan_lat**4)
    x = sec_lat / nu
    xi = sec_lat / (6 * nu**3) * (nu / rho + 2 * tan_lat**2)
    xii = sec_lat / (120 * nu**5) * (5 + 28 * tan_lat**2 + 24 * tan_lat**4)
    xiia = sec_lat / (5040 * nu**7) * (61 + 662 * tan_lat**2 + 1320 * tan_lat**4 + 720 * tan_lat**6)
    osgb_lat = lat - vii * de**2 + viii * de**4 - ix * de**6
    osgb_lon = lon0 + x * de - xi * de**3 + xii * de**5 - xiia * de**7

    # OSGB36 geodetic coordinates to Airy 1830 geocentric XYZ.
    x = nu * math.cos(osgb_lat) * math.cos(osgb_lon)
    y = nu * math.cos(osgb_lat) * math.sin(osgb_lon)
    z = (1 - e2) * nu * math.sin(osgb_lat)

    # OSGB36 -> WGS84 position-vector Helmert parameters (EPSG:1314).
    arcsec = math.pi / (180 * 3600)
    rx, ry, rz = 0.1502 * arcsec, 0.2470 * arcsec, 0.8421 * arcsec
    factor = 1 - 20.4894e-6
    x2 = 446.448 + factor * x - rz * y + ry * z
    y2 = -125.157 + rz * x + factor * y - rx * z
    z2 = 542.060 - ry * x + rx * y + factor * z

    # WGS84 geocentric XYZ to WGS84 longitude/latitude.
    wgs_a, wgs_b = 6378137.0, 6356752.3141
    wgs_e2 = 1 - (wgs_b * wgs_b) / (wgs_a * wgs_a)
    p = math.hypot(x2, y2)
    wgs_lat = math.atan2(z2, p * (1 - wgs_e2))
    for _ in range(10):
        wgs_nu = wgs_a / math.sqrt(1 - wgs_e2 * math.sin(wgs_lat) ** 2)
        wgs_lat = math.atan2(z2 + wgs_e2 * wgs_nu * math.sin(wgs_lat), p)
    return math.degrees(math.atan2(y2, x2)), math.degrees(wgs_lat)


# TfL's casualty extract has one record per casualty; its attendant extract
# supplies collision time, road type and junction context.
attendants = {r["_Collision Id"]: r for r in rows(DATA / "tfl-attendant-2025.csv")}
events = []
for casualty in rows(DATA / "tfl-casualty-2025.csv"):
    if casualty.get("Casualty Mode of Travel") != "Pedal Cycle":
        continue
    attendant = attendants.get(casualty.get("_Collision Id", ""), {})
    severity_label = casualty.get("_Casualty Severity", "Unknown")
    severity = {"Fatal": 1, "Serious": 2, "Slight": 3}.get(severity_label, 0)
    raw_date = attendant.get("_Collision Date") or casualty.get("_Collision Date", "")
    try:
        date = datetime.strptime(raw_date, "%d/%m/%Y %H:%M")
    except ValueError:
        date = None
    raw_time = attendant.get("Time", "")
    try:
        hour = int(raw_time[:2])
    except (ValueError, TypeError):
        hour = None
    easting = number(casualty.get("Easting"))
    northing = number(casualty.get("Northing"))
    # TfL coordinates are OSGB36 / British National Grid. Transform to WGS84
    # for map display; source grid coordinates remain in the output as well.
    longitude, latitude = grid_to_wgs84(easting, northing)
    events.append({
        "id": f"{casualty['_Collision Id']}-{casualty['_Casualty Id']}",
        "collisionId": casualty["_Collision Id"],
        "borough": casualty.get("Borough Name", "Unknown"),
        "severity": severity,
        "severityLabel": severity_label,
        "date": date.strftime("%Y-%m-%d") if date else None,
        "month": date.month if date else None,
        "hour": hour,
        "roadType": attendant.get("Road Type", "Unknown"),
        "junction": attendant.get("Junction Detail", "Unknown"),
        "easting": easting,
        "northing": northing,
        "longitude": longitude,
        "latitude": latitude,
        "age": number(casualty.get("Casualty Age")),
    })

by_borough = defaultdict(list)
for event in events:
    by_borough[event["borough"]].append(event)
boroughs = []
for name, borough_events in by_borough.items():
    boroughs.append({
        "name": name,
        "casualties": len(borough_events),
        "collisions": len({event["collisionId"] for event in borough_events}),
        "fatal": sum(event["severity"] == 1 for event in borough_events),
        "serious": sum(event["severity"] == 2 for event in borough_events),
        "slight": sum(event["severity"] == 3 for event in borough_events),
    })
boroughs.sort(key=lambda item: item["casualties"], reverse=True)


def risk_table(sheet_name: str, row_name: str):
    sheet = load_workbook(DATA / "tfl-injury-risk-annex-2025.xlsx", read_only=True, data_only=True)[sheet_name]
    values = next(r for r in sheet.iter_rows(values_only=True) if r and r[0] == row_name)
    header = next(r for r in sheet.iter_rows(values_only=True) if r and r[0] == "Mode")
    return {str(year): number(value) for year, value in zip(header[1:], values[1:]) if str(year).isdigit()}


injury_risk = risk_table("Table 1", "Pedal cyclist")
fatal_risk = risk_table("Table 2", "Pedal cyclist")
ksi_risk = risk_table("Table 3", "Pedal cyclist")
journeys = risk_table("Table 6", "Pedal cyclist*")
risk_years = sorted(set(injury_risk) | set(fatal_risk) | set(ksi_risk) | set(journeys))
risk_series = [{
    "year": int(year),
    "injuryPerMillionJourneys": injury_risk.get(year),
    "fatalPerMillionJourneys": fatal_risk.get(year),
    "ksiPerMillionJourneys": ksi_risk.get(year),
    "journeysMillions": journeys.get(year),
} for year in risk_years]

monthly = Counter(event["month"] for event in events if event["month"])
hourly = Counter(event["hour"] for event in events if event["hour"] is not None)
severity_counts = Counter(event["severityLabel"] for event in events)
road_types = Counter(event["roadType"] for event in events)
day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
days = Counter(datetime.strptime(event["date"], "%Y-%m-%d").weekday() for event in events if event["date"])
collision_ids = {event["collisionId"] for event in events}
coords = [event for event in events if event["easting"] is not None and event["northing"] is not None]
fatal_2025 = next((point for point in risk_series if point["year"] == 2025), {})

result = {
    "meta": {
        "title": "London cyclist injury collisions, 2025",
        "year": 2025,
        "source": "Transport for London, 2025 GLA collision data extracts and 2025 Injury Risk Annex",
        "sourceUrl": "https://tfl.gov.uk/corporate/publications-and-reports/road-safety",
        "riskSourceUrl": "https://content.tfl.gov.uk/casualties-in-greater-london-2025-injury-risk-annex.xlsx",
        "method": "TfL casualty rows filtered to Casualty Mode of Travel = Pedal Cycle and joined to attendant records by _Collision Id.",
        "scope": "TfL recorded personal-injury collisions. Risk rates are separately published TfL casualties per million cycle journey stages; 2020 and 2021 cycle journey-stage exposure is unavailable.",
        "mapNote": "TfL casualty coordinates are OSGB36 / British National Grid, transformed to WGS84 using the OS seven-parameter Helmert operation (EPSG:1314; approximately 3.5 m transformation accuracy). Original Easting/Northing are retained.",
        "generatedAt": "2026-10-31",
    },
    "summary": {
        "cyclistCasualties": len(events), "uniqueCollisions": len(collision_ids),
        "fatal": severity_counts["Fatal"], "serious": severity_counts["Serious"],
        "slight": severity_counts["Slight"], "ksi": severity_counts["Fatal"] + severity_counts["Serious"],
        "mappedCasualties": len(coords), "mappedShare": round(len(coords) / max(1, len(events)), 4),
        "topBorough": boroughs[0]["name"] if boroughs else None,
        "topBoroughCount": boroughs[0]["casualties"] if boroughs else 0,
        "ksiRate2025": fatal_2025.get("ksiPerMillionJourneys"),
        "injuryRate2025": fatal_2025.get("injuryPerMillionJourneys"),
        "cycleJourneysMillions2025": fatal_2025.get("journeysMillions"),
    },
    "boroughs": boroughs,
    "monthly": [{"month": month, "label": datetime(2025, month, 1).strftime("%b"), "count": monthly[month]} for month in range(1, 13)],
    "hourly": [{"hour": hour, "count": hourly[hour]} for hour in range(24)],
    "days": [{"day": i + 1, "label": day_names[(i + 6) % 7], "count": days[i]} for i in range(7)],
    "severity": [{"name": name, "count": severity_counts[name]} for name in ["Fatal", "Serious", "Slight"]],
    "roadTypes": [{"name": name or "Not recorded", "count": count} for name, count in road_types.most_common()],
    "riskSeries": risk_series,
    "events": events,
}

target = OUT / "london-cyclist-safety-2025.json"
target.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
print(json.dumps({"summary": result["summary"], "topBoroughs": boroughs[:10], "riskSeries": risk_series}, indent=2))
