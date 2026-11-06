SYNTHETIC REFRIGERANT BATCH CSV DATA — DEMO ONLY

These are fictional partners and invented values, not Icorium measurements or industry specifications.
Each row is an incoming refrigerant blend batch. Components R-32, R-125 and R-134a are used solely for demonstration.

FILES
- partner_a_baseline.csv: 25 rows, source A, kilograms and percentages.
- partner_a_followup.csv: 25 rows, source A, next period; matching batch IDs enable comparisons.
- partner_b_baseline.csv: 25 rows, source B, pounds and percentages.
- partner_b_followup.csv: 25 rows, source B, next period; matching batch IDs enable comparisons.
- partner_c_baseline.csv: 25 rows, source C, grams and fractions (0 to 1).

NORMALIZED SCHEMA
batch_id, sample_date, feed_mass_kg, r32_pct, r125_pct, r134a_pct, source_company

CONVERSIONS
- A: use data directly.
- B: weight_lb * 0.45359237 = feed_mass_kg; map alternate column names.
- C: quantity_g / 1000 = feed_mass_kg; fractions * 100 = percentages.
- Percentages should be between 0 and 100 and sum approximately to 100 (allow rounding tolerance).

INTENTIONAL DATA QUALITY TEST CASES (one per file)
- A baseline row 8 (data row): missing feed_mass_kg.
- A followup row 13: negative r125_pct.
- B baseline row 5: nonnumeric weight_lb.
- B followup row 11: duplicate lot_number (same as row 10).
- C baseline row 18: mixture fractions do not sum to 1.

Suggested selectable processing functions:
1. Validate composition and identify issues.
2. Calculate individual refrigerant masses (feed mass * component percentage / 100).
3. Classify blend type using EXPLICITLY DEMO-ONLY configurable thresholds.

Output CSVs should retain source columns and add derived fields. No real-world purity or recovery can be inferred from feed composition alone.
