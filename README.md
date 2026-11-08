# How Safe Is Cycling in London?

An interactive English-language data story built on the DO App Kit. It combines TfL's 2025 cyclist casualty extract with the official TfL injury-risk annex, so the dashboard can distinguish recorded counts from exposure-adjusted rates.

## Open the standalone interactive preview

Open the [live interactive preview](https://ada-sh3526.github.io/London-cycle-safety/interactive-preview.html) in a modern browser for a self-contained interactive dashboard using the included TfL 2025 data. in a modern browser for a self-contained interactive dashboard using the included TfL 2025 data. It works without installing packages. Select a borough in the filters, then turn on "Show casualty points" to expand and zoom the map to that borough; hover a borough or point for details.

## Run the app

Requirements: Node.js 22.12+ and pnpm 10.33+.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite. The root route is the interactive dashboard; `/screen` is a fullscreen wall view. The app reads the cyclist dataset at `apps/website/public/data/london-cyclist-safety-2025.json` and the official borough polygons at `apps/website/public/data/london-boroughs.geojson`. The self-contained preview embeds both files.

## Rebuild the data product

Download TfL's 2025 GLA attendant CSV, casualty CSV and Injury Risk Annex workbook from [TfL Road Safety](https://tfl.gov.uk/corporate/publications-and-reports/road-safety) and place them in `data/` with these exact filenames:

- `tfl-attendant-2025.csv`
- `tfl-casualty-2025.csv`
- `tfl-injury-risk-annex-2025.xlsx`

The map boundary file `apps/website/public/data/london-boroughs.geojson` comes from the [GLA London Boroughs layer](https://data.london.gov.uk/dataset/london-boroughs-e55pw), derived from Ordnance Survey Boundary-Line and licensed under OGL v3. It is included with the project. Borough totals are matched to official boundary names; the fill is a count choropleth. Severity-coloured casualty dots transform TfL's OSGB36 / British National Grid coordinates to WGS84 using the Ordnance Survey seven-parameter Helmert operation (EPSG:1314; about 3.5 m transformation accuracy). This does not establish the accuracy of TfL's source incident locations.

Then run:

```bash
python -m pip install -r requirements.txt
python analyze_cycling_safety.py
```

The script filters casualty rows to `Casualty Mode of Travel = Pedal Cycle`, joins attendant records by `_Collision Id`, derives descriptive summaries, reads the published injury, fatality and KSI rates from Tables 1-3 of the annex and journey exposure from Table 6, and writes the compact JSON consumed by the dashboard. Raw source files are not needed to run the app once that JSON is present.

## Main finding

TfL's annex reports 2.19 cyclist killed-or-seriously-injured casualties per million cycle journey stages in 2025. This is 6.9% above 2024 (2.05) and 17.4% below TfL's 2010-14 average (2.65). TfL estimates 546.1 million cycle journey stages in 2025, up 12.4% from 2024. Separately, the casualty extract contains 5,675 cyclist casualties in 5,614 distinct collisions: 6 fatal, 1,196 serious and 4,473 slight. Westminster has the highest raw borough count (465). Borough counts are not risk rates.

The two TfL products are reported separately: the displayed London-wide risk rate is taken directly from the official annex, not recomputed from casualty-extract totals, and is not borough-specific. Counts describe TfL-recorded personal-injury collisions; they do not include near misses or damage-only incidents. Raw Easting/Northing are retained in the JSON. The coordinate-transformation accuracy does not describe the source incident-location accuracy.

See [ANALYSIS.md](./ANALYSIS.md) for the full question, method, findings, caveats and next research steps.
