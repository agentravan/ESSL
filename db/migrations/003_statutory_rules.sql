-- Starting set of statutory rules. Every row is marked verified = false:
-- an administrator must check each one against the official notification and
-- tick "verified" on the Rules page. Payroll shows a warning while any rule it
-- used is unverified.

set search_path = hrms;

-- ---------------------------------------------------------------- provident fund
insert into statutory_rules (kind, effective_from, effective_to, data, source) values
('pf', '2014-09-01', '2026-08-31',
 '{"wageCeiling": 15000, "employeeRate": 12, "epsRate": 8.33, "edliRate": 0.5, "adminRate": 0.5, "adminMin": 500}',
 'EPF Scheme para 2(f), wage ceiling Rs 15,000 from 1 Sep 2014'),
('pf', '2026-09-01', '2026-09-30',
 '{"wageCeiling": 19667, "employeeRate": 12, "epsRate": 8.33, "edliRate": 0.5, "adminRate": 0.5, "adminMin": 500}',
 'Transition month. Ceiling changed from Rs 15,000 to Rs 25,000 on 17 Sep 2026 (S.O. 5109(E)). 19,667 = (15,000 x 16 + 25,000 x 14) / 30. CONFIRM how EPFO wants September 2026 computed before relying on this.'),
('pf', '2026-10-01', null,
 '{"wageCeiling": 25000, "employeeRate": 12, "epsRate": 8.33, "edliRate": 0.5, "adminRate": 0.5, "adminMin": 500}',
 'Gazette S.O. 5109(E) dated 17 Sep 2026: wage ceiling Rs 25,000 for EPF, EPS and EDLI');

-- ---------------------------------------------------------------- ESI
insert into statutory_rules (kind, effective_from, data, source) values
('esi', '2019-07-01',
 '{"wageLimit": 21000, "wageLimitPwd": 25000, "employeeRate": 0.75, "employerRate": 3.25, "dailyWageExempt": 176}',
 'ESI contribution rates from 1 Jul 2019; wage limit Rs 21,000 (Rs 25,000 for persons with disability)');

-- ---------------------------------------------------------------- income tax (TDS on salary)
insert into statutory_rules (kind, effective_from, data, source) values
('tax_new', '2025-04-01',
 '{"standardDeduction": 75000,
   "slabs": [{"upTo": 400000, "rate": 0}, {"upTo": 800000, "rate": 5}, {"upTo": 1200000, "rate": 10},
             {"upTo": 1600000, "rate": 15}, {"upTo": 2000000, "rate": 20}, {"upTo": 2400000, "rate": 25},
             {"upTo": null, "rate": 30}],
   "rebate": {"incomeLimit": 1200000, "max": 60000, "marginalRelief": true},
   "surcharge": [{"above": 5000000, "rate": 10}, {"above": 10000000, "rate": 15}, {"above": 20000000, "rate": 25}],
   "cess": 4, "ptDeductible": false}',
 'New regime slabs from FY 2025-26; unchanged by Budget 2026 for FY 2026-27'),
('tax_old', '2025-04-01',
 '{"standardDeduction": 50000,
   "slabs": [{"upTo": 250000, "rate": 0}, {"upTo": 500000, "rate": 5}, {"upTo": 1000000, "rate": 20},
             {"upTo": null, "rate": 30}],
   "rebate": {"incomeLimit": 500000, "max": 12500, "marginalRelief": false},
   "surcharge": [{"above": 5000000, "rate": 10}, {"above": 10000000, "rate": 15}, {"above": 20000000, "rate": 25},
                 {"above": 50000000, "rate": 37}],
   "cess": 4, "ptDeductible": true}',
 'Old regime slabs for individuals below 60. Senior-citizen slabs are not modelled.');

-- ---------------------------------------------------------------- professional tax
-- "slabs" are on monthly gross salary. "feb" replaces the amount in February.
-- "female" (optional) replaces the slabs for women.
insert into statutory_rules (kind, state, effective_from, data, source) values
('pt', 'HR', '2000-01-01', '{"none": true}', 'Haryana does not levy professional tax'),
('pt', 'DL', '2000-01-01', '{"none": true}', 'Delhi does not levy professional tax'),
('pt', 'UP', '2000-01-01', '{"none": true}', 'Uttar Pradesh does not levy professional tax'),
('pt', 'RJ', '2000-01-01', '{"none": true}', 'Rajasthan does not levy professional tax'),
('pt', 'PB', '2000-01-01', '{"none": true}', 'Punjab levies Rs 200 per month only on income-tax payers through a separate state tax; not modelled'),
('pt', 'HP', '2000-01-01', '{"none": true}', 'Himachal Pradesh does not levy professional tax'),
('pt', 'UK', '2000-01-01', '{"none": true}', 'Uttarakhand does not levy professional tax'),
('pt', 'CH', '2000-01-01', '{"none": true}', 'Chandigarh does not levy professional tax'),
('pt', 'MH', '2023-04-01',
 '{"slabs": [{"upTo": 7500, "amount": 0}, {"upTo": 10000, "amount": 175}, {"upTo": null, "amount": 200, "feb": 300}],
   "female": [{"upTo": 25000, "amount": 0}, {"upTo": null, "amount": 200, "feb": 300}]}',
 'Maharashtra: men nil up to 7,500, 175 up to 10,000, then 200 (300 in February); women nil up to 25,000'),
('pt', 'KA', '2025-04-01',
 '{"slabs": [{"upTo": 24999, "amount": 0}, {"upTo": null, "amount": 200, "feb": 300}]}',
 'Karnataka: nil below 25,000; 200 per month from 25,000 (300 in February)'),
('pt', 'WB', '2014-04-01',
 '{"slabs": [{"upTo": 10000, "amount": 0}, {"upTo": 15000, "amount": 110}, {"upTo": 25000, "amount": 130},
             {"upTo": 40000, "amount": 150}, {"upTo": null, "amount": 200}]}',
 'West Bengal monthly slabs'),
('pt', 'GJ', '2022-04-01',
 '{"slabs": [{"upTo": 11999, "amount": 0}, {"upTo": null, "amount": 200}]}',
 'Gujarat: nil below 12,000; 200 per month from 12,000'),
('pt', 'TS', '2015-04-01',
 '{"slabs": [{"upTo": 15000, "amount": 0}, {"upTo": 20000, "amount": 150}, {"upTo": null, "amount": 200}]}',
 'Telangana monthly slabs'),
('pt', 'AP', '2015-04-01',
 '{"slabs": [{"upTo": 15000, "amount": 0}, {"upTo": 20000, "amount": 150}, {"upTo": null, "amount": 200}]}',
 'Andhra Pradesh monthly slabs');
