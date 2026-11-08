# Full analysis: How Safe Is Cycling in London?

## Research questions

- How has London's cyclist injury risk changed when adjusted for cycle journeys, and what do 2025 TfL collision records show about where, when and how cyclist injuries are recorded?
- What would be needed to assess whether cycling infrastructure improves safety?

The infrastructure hypothesis is meaningful, but borough collision counts alone cannot test it. This analysis therefore pairs TfL's published exposure-adjusted citywide risk series with a separate descriptive analysis of 2025 casualty records.

## Sources and scope

| Source used | Official source name | Use |
| --- | --- | --- |
| TfL 2025 GLA casualty extract [1] | **[2025 GLA collision data extract - casualty CSV 3.09MB](https://content.tfl.gov.uk/2025-gla-data-extract-casualty.csv)** | Casualty-level data: filter `Casualty Mode of Travel = Pedal Cycle`; use severity, borough label, grid coordinates and age for summaries and charts. |
| TfL 2025 GLA attendant extract [2] | **[2025 GLA collision data extract - attendant CSV 5.90MB](https://content.tfl.gov.uk/2025-gla-extract-attendant.csv)** | Collision-level data: use `_Collision Id`, date/time, road type and junction detail; join to casualty records by `_Collision Id`. |
| TfL 2025 Injury Risk Annex [3] | **[Casualties in Greater London during 2025: Injury risk annex XLSX 115KB](https://content.tfl.gov.uk/casualties-in-greater-london-2025-injury-risk-annex.xlsx)** | Use Table 1, "Cyclist injury rates per million journey stages"; Table 2, "Cyclist fatality rates per million journey stages"; Table 3, "Cyclist KSI rates per million journey stages"; and Table 6, "Cycle journey stages." |
| GLA / Ordnance Survey London Boroughs polygons [4] | **[London Boroughs (E55PW)](https://data.london.gov.uk/dataset/london-boroughs-e55pw)** | Use official borough polygon geometry and names for map boundaries, fills and labels; licensed under OGL v3. |

**Record selection and joining**

- The casualty extract is filtered to `Casualty Mode of Travel = Pedal Cycle`.
- Casualty records are joined to attendant records using `_Collision Id`.
- Borough counts are joined to the GLA / Ordnance Survey polygons by normalized borough name; ampersands and punctuation are normalized.

**Counting units**

- Severity and location charts count casualties.
- Collision totals count distinct collision identifiers separately.

**Risk rates and exposure**

- TfL reports cyclist injury, fatality and KSI rates per million cycle journey stages in Tables 1-3 of the *Casualties in Greater London during 2025: Injury risk annex*; Table 6 reports journey-stage exposure.
- I use TfL's published rates directly rather than recomputing them from the casualty extract and Table 6, since the two outputs may use different processing or definitions. Table 6 has no reliable exposure estimates for 2020-21, so the trend chart leaves those years blank. [3]

## Results

### Exposure-adjusted trend

- **2025 KSI rate:** 2.19 cyclist killed-or-seriously-injured casualties per million cycle journey stages. 
- **2024 KSI rate:** approximately 2.05; the 2025 rate is **6.9% higher**.
- **2010-14 baseline average:** 2.65; the 2025 rate is **17.4% lower**.
- **2025 exposure:** 546.1 million cycle journey stages, **12.4% more** than 2024 (485.9 million) and 56.9% above the 2010-14 average (348.1 million).

These are descriptive comparisons of TfL's published point estimates; no uncertainty intervals or significance tests are reported here.

| Measure | 2025 | 2024 |
| --- | ---: | ---: |
| All-injury rate per million cycle journey stages | 10.37 | 10.10 |
| Fatality rate per million cycle journey stages | 0.011 | 0.0185 |

These outcomes are distinct from KSI and are reported separately in the interactive dataset.

### 2025 recorded casualties

The following casualty and collision counts are calculated from TfL’s 2025 casualty and attendant extracts [1, 2].

| Measure | Result |
| --- | ---: |
| Cyclist casualties in extract | 5,675 |
| Distinct collisions involving a cyclist | 5,614 |
| Fatal | 6 |
| Serious | 1,196 |
| Slight | 4,473 |
| Fatal or serious (KSI) | 1,202 (21.2%) |
| Casualties with source grid coordinates | 5,675 (100%) |

- The casualty extract and annex are distinct official outputs with their own processing.
- The casualty counts above are descriptive extract totals; the annex rate is the official exposure-adjusted measure.
- Do not infer a rate by combining these products.

### Place

- The five largest raw borough counts are Westminster (465), Southwark (404), Lambeth (383), Tower Hamlets (355) and Hackney (334). Together they represent 1,941 casualties (34.2%).[1]
- The app ranks boroughs by recorded cyclist casualty counts and notes that these figures are unadjusted for borough-level cycling exposure.
- More records can reflect more cycling, street/traffic conditions, reporting, or other factors. The count does not by itself establish a higher injury risk.

### Time and road context

- **Monthly counts:** July has the most casualty records (582), closely followed by June (581); September has 557 and May 537.[1,2]
- **Hourly peaks:** 18:00 (506), 08:00 (505), 17:00 (495) and 16:00 (411). These patterns do not have matching hour-by-hour cycle-flow denominators.[1,2]
- **Road type:** Single carriageways are the most common reported road type (3,655 records). Road type is not a proxy for cycle-lane protection or quality.[2]

## What the evidence supports

1. TfL's citywide exposure-adjusted KSI rate in 2025 was lower than its 2010-14 average, but higher than 2024.
2. There were 5,675 cyclist casualty records in the 2025 TfL extract, with 1,202 recorded as fatal or serious.
3. Westminster had the largest raw borough total in this extract; this is a candidate for further investigation, not a risk ranking.
4. Neither the rate trend nor the location counts show that infrastructure caused or prevented injuries.

## What is needed to test infrastructure effects

The London Datastore currently catalogs the Cycling Infrastructure Database as a 2017-18 survey snapshot, which is not contemporaneous with 2025 collisions[5]. A stronger study needs:

- A dated, current infrastructure inventory and infrastructure opening dates.
- Cycle counts or distance travelled matched to road segments and dates.
- Comparisons of rates with uncertainty, accounting for traffic and layout changes.
- A defensible comparison design, such as before/after corridors compared with similar untreated corridors.

A borough-level overlay of 2017-18 infrastructure and 2025 casualties would risk a misleading association.

## Data and visualization limits

- TfL injury collision data do not include near misses or damage-only incidents, and do not capture every unreported injury.
- Borough counts are unadjusted for cycling exposure. The citywide annex rate cannot be disaggregated to boroughs from these files.
- No reliable cycle-journey exposure is available for 2020-21 in the annex; those years are shown as a gap.
- Borough fills and labels use the official GLA / Ordnance Survey borough polygons (OGL v3)[4]. Casualty points are transformed from OSGB36 / British National Grid to WGS84 using the Ordnance Survey seven-parameter Helmert operation (EPSG:1314; about 3.5 m transformation accuracy). This is the transformation's accuracy, not TfL's stated incident-location accuracy. Raw Easting/Northing remain in the dataset, and summaries use TfL borough labels.
- A point represents a casualty; several cyclists can be injured in one collision.

## Interactive output storyboard

1. Lead with the official 2025 KSI rate and its comparison with 2024 and 2010-14.
2. Filter the 5,675 casualty records by severity, borough and month; the map and summary update together.
3. Compare borough counts with the "not rates" reminder.
4. Inspect the annual KSI rate per million cycle journey stages, including the 2020-21 exposure gap.
5. Close by stating what evidence would be needed to assess the infrastructure hypothesis.

## References

1. Transport for London (TfL) (2025) *2025 GLA collision data extract - casualty CSV* [CSV, 3.09 MB]. Available at: https://content.tfl.gov.uk/2025-gla-data-extract-casualty.csv (Accessed: 7 November 2026).
2. Transport for London (TfL) (2025) *2025 GLA collision data extract - attendant CSV* [CSV, 5.90 MB]. Available at: https://content.tfl.gov.uk/2025-gla-extract-attendant.csv (Accessed: 7 November 2026).
3. Transport for London (TfL) (2025) *Casualties in Greater London during 2025: Injury risk annex* [XLSX, 115 KB]. Available at: https://content.tfl.gov.uk/casualties-in-greater-london-2025-injury-risk-annex.xlsx (Accessed: 7 November 2026).
4. Greater London Authority (GLA) and Ordnance Survey (n.d.) *London Boroughs (E55PW)* [dataset]. Available at: https://data.london.gov.uk/dataset/london-boroughs-e55pw (Accessed: 7 November 2026).
5. London Datastore (n.d.) *Cycling Infrastructure Database*. Available at: https://data.london.gov.uk/dataset/cycling-infrastructure-database-23n1k (Accessed: 7 November 2026).
