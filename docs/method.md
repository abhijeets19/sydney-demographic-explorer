# Method

## Catchments
A catchment is a circle of ground radius *r* around a pin. It includes each Mesh Block (MB) whose **point-on-surface** lies inside the circle. Inclusion is all-or-nothing per MB, so small radii step visibly as blocks cross the edge.

## Apportionment (Mesh Block–weighted SA1)
Census tables are published for SA1s (about 400 people each). Each included MB contributes a share of its SA1's counts:

| Tables | Weight |
|---|---|
| Person universe (G01, G04, G09, G13, G46, G62) | `w_p` = MB persons ÷ Σ MB persons in the SA1 |
| Dwelling / household universe (G33, G35–G42) | `w_d` = MB dwellings ÷ Σ MB dwellings in the SA1 |

MB counts come from *ABS Mesh Block Counts, 2021* (persons usually resident; dwellings). Weights sum to exactly 1 per SA1.

**Composition therefore resolves at SA1 level; counts resolve at MB level.** Every MB in an SA1 carries that SA1's age mix, tenure mix and so on.

**Fallbacks.** Where an SA1 has Census values but no MB count of the needed kind:
- `w_p` falls back to dwellings, then residential area, then an equal split. The 2021 build used this for 3 + 9 SA1s.
- `w_d` falls back to persons, then an equal split. The 2021 build used this for 53 + 3 SA1s.

923 MBs have usual residents but no private dwellings (aged care, hostels, colleges). This is why person and dwelling tables use separate weights.

## Medians
Medians are never averaged across SA1s. Each catchment's median is **interpolated** linearly within its median bracket, using the catchment's own bracketed distribution:
- Not-stated and partial-income categories are excluded.
- If the median falls in an open-ended top bracket, the app shows "≥ $X".

Checked against ABS-published SA1 medians (G02), SA1s with 30+ units, 2021 build:

| Median | SA1s | median abs. error | p90 abs. error | mean bias | open top bracket |
|---|---|---|---|---|---|
| Age | 11,738 | 0.7 yr (1.9%) | 1.9 yr | +0.3 yr | 6 SA1s |
| Weekly rent | 6,675 | $13 (2.9%) | $38 | +$10 | 548 SA1s (≥ $950) |
| Monthly mortgage | 8,068 | $121 (5.0%) | $390 | +$82 | 1,045 SA1s (≥ $4,000) |
| Weekly household income | 11,222 | $68 (3.4%) | $228 | +$23 | 457 SA1s (≥ $4,000) |

Linear interpolation runs slightly high, because the true distribution within a bracket is skewed toward its lower end.

## Precision and perturbation
The ABS randomly adjusts small cells, and adjusts each geography independently:
- Σ SA1 persons (5,230,951) differs from Σ MB persons (5,230,011) by 0.02%.
- Per SA1, MB counts and GCP totals agree to within ±10 persons in 95% of SA1s.

Display rules:
- Counts are rounded to 10.
- Percentages are whole numbers.
- Catchments under 500 persons carry a note.
- Every card states how many SA1s it draws from.

The Greater Sydney benchmark is the sum of all Greater Sydney SA1s (GCCSA 1GSYD).

## Caveats
Census night (10 Aug 2021) fell during the Greater Sydney COVID-19 lockdown. Method of travel to work and labour force status reflect that.

## Validation
`make data` writes `data/out/<build>/validation.json` and fails the build on any hard failure:
- MBs without counts;
- SA1s missing from the GCP;
- weight sums ≠ 1;
- apportionment not conserving SA1 totals (2021 build: max relative error 3 × 10⁻⁹);
- Uint16 overflow.

Source: ABS 2021 Census of Population and Housing, CC BY 4.0 · ASGS Edition 3 · © OpenStreetMap contributors.
