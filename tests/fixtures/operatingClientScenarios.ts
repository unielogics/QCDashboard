// Synthetic scenarios generated with earnings_improvement.evaluate + client_evaluation.
// No customer data or identities. Current annual NOI stays -6000 USD; canonical DSCR is 0.50x.
export const operatingClientScenarios = {
  "initial": {
    "body": {
      "schema_version": "operating-plan-v1",
      "business_name": "Example Studio",
      "period_start": "2025-01-01",
      "period_end": "2025-12-31",
      "projection_start": "2027-01-01",
      "currency": "USD",
      "basis": "cash",
      "no_operating_expenses_confirmed": false,
      "client_attestation": false,
      "notes": "",
      "expenses": [],
      "category_confirmations": {},
      "adjustments": [],
      "released_cash_flow": {
        "source_fingerprint": null,
        "allocations": []
      },
      "field_sources": {}
    },
    "reply": {
      "guidance": {
        "policy_version": "operating-guidance-v1",
        "business": {
          "name": "Example Studio",
          "industry": "Professional services",
          "naics_code": "541990",
          "questions": [
            "Which service will this marketing investment support?"
          ]
        },
        "reporting": {
          "period_start": "2025-01-01",
          "period_end": "2025-12-31",
          "currency": "USD",
          "basis": "cash",
          "source_file_id": "00000000-0000-4000-8000-000000000101",
          "source_label": "Example business return.pdf"
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "source_amount": 24000,
            "currency": "USD",
            "basis": "cash",
            "year": 2025,
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "source_label": "Example business return.pdf",
            "source_fact_keys": [
              "rent"
            ],
            "notes": [
              "Split this reference total into multiple expense lines; do not retain both the total and full breakdown."
            ]
          }
        ],
        "essentials": [
          {
            "category": "rent",
            "label": "Rent",
            "prompt": "Confirm premises costs."
          },
          {
            "category": "marketing",
            "label": "Marketing",
            "prompt": "Confirm current marketing spend."
          }
        ],
        "action_templates": [
          {
            "key": "marketing",
            "label": "Model a marketing investment",
            "kind": "marketing_investment",
            "category": "marketing",
            "explanation": "State spend, return and contribution margin."
          }
        ],
        "warnings": []
      },
      "evidence": {
        "files": [
          {
            "file_id": "00000000-0000-4000-8000-000000000101",
            "file_name": "Example business return.pdf",
            "classification": "business_tax_return",
            "eligible_for_review": true
          }
        ],
        "expense_candidates": [
          {
            "key": "tax-rent",
            "source_candidate_key": "tax-rent",
            "source_group_key": "tax-rent",
            "label": "Rent and premises",
            "category": "rent",
            "current_amount": 24000,
            "cadence": "annual",
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "currency": "USD",
            "year": 2025,
            "source_note": "Source aggregate; do not retain this together with its granular breakdown."
          }
        ],
        "merchant_sources": [],
        "merchant_offers": [],
        "warnings": []
      },
      "evaluation": {
        "baseline": {
          "period": "2025",
          "currency": "USD",
          "basis": "cash",
          "revenue": null,
          "earnings": 12000.0,
          "earnings_kind": "profit_and_loss",
          "noi": -6000.0,
          "noi_kind": "staff_reviewed_noi",
          "noi_label": "Staff-reviewed NOI",
          "noi_year": "2025",
          "noi_basis": "cash",
          "noi_staff_reviewed": true,
          "noi_governance": {
            "policy_version": "noi-policy-v2",
            "status": "reviewed",
            "review_needed": false,
            "status_reason": "Staff-reviewed annual NOI",
            "reason_codes": [],
            "kind": "staff_reviewed_noi",
            "label": "Staff-reviewed NOI",
            "year": "2025",
            "period": "2025",
            "currency": "USD"
          },
          "noi_period": "2025",
          "noi_currency": "USD",
          "dscr": 0.5,
          "annual_debt_service": 24000.0,
          "provisional": false,
          "noi_provisional": false
        },
        "disclosure": {
          "operating_monthly": 0.0,
          "cogs_monthly": 0.0,
          "operating_cash_monthly": 0.0,
          "non_operating_monthly": 0.0,
          "one_time_total": 0.0,
          "active_count": 0,
          "excluded_count": 0,
          "missing_inputs": [],
          "cost_issues": [],
          "cost_mix": [],
          "complete": false
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "currency": "USD",
            "year": 2025,
            "disclosed_annual_amount": null,
            "difference_annual": null,
            "status": "no_detail",
            "notes": [
              "A disclosed variance is a reconciliation question, not an automatic earnings improvement."
            ]
          }
        ],
        "released_cash_flow": {
          "required": false,
          "available": false,
          "status": "unavailable",
          "currency": "USD",
          "source_fingerprint": null,
          "amount_monthly": null,
          "allocated_monthly": 0,
          "unallocated_monthly": null,
          "complete": true,
          "missing": [],
          "allocations": [],
          "source": {
            "updated_at": null,
            "before_monthly": null,
            "after_monthly": null,
            "new_operating_expenses_monthly": 0.0,
            "new_financing_fees_monthly": 0.0,
            "reconciled_retained_override": false
          },
          "note": "Recurring cash allocation only. Debt-service relief does not increase historical earnings, EBITDA or NOI."
        },
        "projection": {
          "proposed": {
            "status": "no_actions",
            "earnings": null,
            "noi": null,
            "noi_status": "no_actions",
            "first_year_noi": null,
            "first_year_earnings": null,
            "first_year_coverage_impact": null,
            "first_year_coverage_earnings": null,
            "first_year_dscr_current": null,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": null,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": null,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": null,
            "target_gap_refinance": null
          },
          "approved": {
            "status": "awaiting_review",
            "earnings": null,
            "noi": null,
            "noi_status": "awaiting_review",
            "first_year_noi": null,
            "first_year_earnings": null,
            "first_year_coverage_impact": null,
            "first_year_coverage_earnings": null,
            "first_year_dscr_current": null,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": null,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": null,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": null,
            "target_gap_refinance": null
          }
        },
        "totals": {
          "proposed": {
            "annual_impact": 0,
            "monthly_impact": 0.0,
            "first_year_impact": 0,
            "one_time_cost": 0,
            "complete": false,
            "count": 0,
            "expected_count": 0,
            "known_annual_subtotal": null,
            "known_first_year_subtotal": null
          },
          "approved": {
            "annual_impact": 0,
            "monthly_impact": 0.0,
            "first_year_impact": 0,
            "one_time_cost": 0,
            "complete": false,
            "count": 0,
            "expected_count": 0,
            "known_annual_subtotal": null,
            "known_first_year_subtotal": null
          }
        },
        "targets": {
          "current": [
            {
              "ratio": 1.0,
              "earnings_required": 24000.0
            },
            {
              "ratio": 1.1,
              "earnings_required": 26400.0
            },
            {
              "ratio": 1.25,
              "earnings_required": 30000.0
            }
          ],
          "refinance": []
        },
        "missing": [],
        "risk_flags": [
          "Projected NOI starts from an explicit annual staff review; its tax-derived or manual basis is separate from the historical P&L and does not establish program eligibility."
        ],
        "notes": [
          "Historical earnings, NOI and current DSCR remain unchanged. Every improvement is a conditional operating illustration, not lender-approved income or a funding guarantee.",
          "Recurring annual coverage excludes one-time benefits. First-year illustrations prorate recurring changes by days active in the twelve-month horizon and deduct implementation costs.",
          "A refinance changes the debt-service denominator; principal, interest and financing proceeds are not operating earnings improvements."
        ],
        "all_actions_reviewed": false,
        "recommendation": {
          "threshold": 1.1,
          "recommended": null,
          "reason": "Current earnings and coverage must be established before checking the planning threshold.",
          "earnings_gap_annual": 14400.0
        },
        "actions": [],
        "schema_version": "earnings-improvement-v1"
      }
    }
  },
  "positive": {
    "body": {
      "schema_version": "operating-plan-v1",
      "business_name": "Example Studio",
      "period_start": "2025-01-01",
      "period_end": "2025-12-31",
      "projection_start": "2027-01-01",
      "currency": "USD",
      "basis": "cash",
      "no_operating_expenses_confirmed": false,
      "client_attestation": false,
      "notes": "",
      "expenses": [
        {
          "id": "00000000-0000-4000-8000-000000000201",
          "category": "rent",
          "label": "Rent and premises",
          "payee": "",
          "current_amount": 24000.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "current_unit_cost": null,
          "current_fixed_amount": null,
          "cadence": "annual",
          "essential": true,
          "source_file_ids": [
            "00000000-0000-4000-8000-000000000101"
          ],
          "source_group_key": "tax-rent",
          "source_candidate_key": "",
          "bank_vendor_key": null,
          "notes": "",
          "excluded": false,
          "duplicate_of": null
        },
        {
          "id": "00000000-0000-4000-8000-000000000202",
          "category": "marketing",
          "label": "Current marketing",
          "payee": "",
          "current_amount": 0.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "current_unit_cost": null,
          "current_fixed_amount": null,
          "cadence": "monthly",
          "essential": true,
          "source_file_ids": [],
          "source_group_key": "",
          "source_candidate_key": "",
          "bank_vendor_key": null,
          "notes": "",
          "excluded": false,
          "duplicate_of": null
        }
      ],
      "category_confirmations": {
        "rent": "confirmed",
        "marketing": "confirmed"
      },
      "adjustments": [
        {
          "id": "00000000-0000-4000-8000-000000000301",
          "kind": "marketing_investment",
          "label": "Model a marketing investment",
          "driver_key": "service-visits",
          "product_name": "Service visits",
          "expense_row_id": "00000000-0000-4000-8000-000000000202",
          "current_amount": 0.0,
          "proposed_amount": 1000.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "proposed_units_per_period": null,
          "current_fixed_amount": null,
          "proposed_fixed_amount": null,
          "cadence": "monthly",
          "units_per_period": null,
          "current_unit_price": null,
          "proposed_unit_price": null,
          "current_unit_cost": null,
          "proposed_unit_cost": null,
          "contribution_margin_pct": 50.0,
          "revenue_return_multiple": 4.0,
          "implementation_cost": 0.0,
          "implementation_cost_cadence": "one_time",
          "effective_date": "2027-01-01",
          "explanation": "Prior campaign evidence supports the test.",
          "source_file_ids": [],
          "source_note": "Synthetic assumption pending staff review.",
          "owner_name": "",
          "merchant_source_key": null,
          "merchant_offer_id": null,
          "processing_volume": null,
          "processing_transaction_count": null,
          "current_processing_rate_pct": null,
          "proposed_processing_rate_pct": null,
          "current_processing_fixed_fee": null,
          "proposed_processing_fixed_fee": null,
          "current_processing_per_transaction_fee": null,
          "proposed_processing_per_transaction_fee": null,
          "current_processing_rate_basis": "unknown",
          "proposed_processing_rate_basis": "unknown",
          "excluded": false,
          "duplicate_of": null,
          "status": "proposed",
          "reviewed_by_user_id": null,
          "reviewed_at": null,
          "review_reason": "",
          "review_source_stamp": null,
          "baseline_treatment": "unreconciled",
          "baseline_reconciliation_note": ""
        }
      ],
      "released_cash_flow": {
        "source_fingerprint": null,
        "allocations": []
      },
      "field_sources": {}
    },
    "reply": {
      "guidance": {
        "policy_version": "operating-guidance-v1",
        "business": {
          "name": "Example Studio",
          "industry": "Professional services",
          "naics_code": "541990",
          "questions": [
            "Which service will this marketing investment support?"
          ]
        },
        "reporting": {
          "period_start": "2025-01-01",
          "period_end": "2025-12-31",
          "currency": "USD",
          "basis": "cash",
          "source_file_id": "00000000-0000-4000-8000-000000000101",
          "source_label": "Example business return.pdf"
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "source_amount": 24000,
            "currency": "USD",
            "basis": "cash",
            "year": 2025,
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "source_label": "Example business return.pdf",
            "source_fact_keys": [
              "rent"
            ],
            "notes": [
              "Split this reference total into multiple expense lines; do not retain both the total and full breakdown."
            ]
          }
        ],
        "essentials": [
          {
            "category": "rent",
            "label": "Rent",
            "prompt": "Confirm premises costs."
          },
          {
            "category": "marketing",
            "label": "Marketing",
            "prompt": "Confirm current marketing spend."
          }
        ],
        "action_templates": [
          {
            "key": "marketing",
            "label": "Model a marketing investment",
            "kind": "marketing_investment",
            "category": "marketing",
            "explanation": "State spend, return and contribution margin."
          }
        ],
        "warnings": []
      },
      "evidence": {
        "files": [
          {
            "file_id": "00000000-0000-4000-8000-000000000101",
            "file_name": "Example business return.pdf",
            "classification": "business_tax_return",
            "eligible_for_review": true
          }
        ],
        "expense_candidates": [
          {
            "key": "tax-rent",
            "source_candidate_key": "tax-rent",
            "source_group_key": "tax-rent",
            "label": "Rent and premises",
            "category": "rent",
            "current_amount": 24000,
            "cadence": "annual",
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "currency": "USD",
            "year": 2025,
            "source_note": "Source aggregate; do not retain this together with its granular breakdown."
          }
        ],
        "merchant_sources": [],
        "merchant_offers": [],
        "warnings": []
      },
      "evaluation": {
        "baseline": {
          "period": "2025",
          "currency": "USD",
          "basis": "cash",
          "revenue": null,
          "earnings": 12000.0,
          "earnings_kind": "profit_and_loss",
          "noi": -6000.0,
          "noi_kind": "staff_reviewed_noi",
          "noi_label": "Staff-reviewed NOI",
          "noi_year": "2025",
          "noi_basis": "cash",
          "noi_staff_reviewed": true,
          "noi_governance": {
            "policy_version": "noi-policy-v2",
            "status": "reviewed",
            "review_needed": false,
            "status_reason": "Staff-reviewed annual NOI",
            "reason_codes": [],
            "kind": "staff_reviewed_noi",
            "label": "Staff-reviewed NOI",
            "year": "2025",
            "period": "2025",
            "currency": "USD"
          },
          "noi_period": "2025",
          "noi_currency": "USD",
          "dscr": 0.5,
          "annual_debt_service": 24000.0,
          "provisional": false,
          "noi_provisional": false
        },
        "disclosure": {
          "operating_monthly": 2000.0,
          "cogs_monthly": 0.0,
          "operating_cash_monthly": 2000.0,
          "non_operating_monthly": 0.0,
          "one_time_total": 0.0,
          "active_count": 2,
          "excluded_count": 0,
          "missing_inputs": [],
          "cost_issues": [],
          "cost_mix": [
            {
              "category": "rent",
              "annual_amount": 24000.0,
              "missing_count": 0,
              "count": 1,
              "quantified_count": 1
            },
            {
              "category": "marketing",
              "annual_amount": 0.0,
              "missing_count": 0,
              "count": 1,
              "quantified_count": 1
            }
          ],
          "complete": true
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "currency": "USD",
            "year": 2025,
            "disclosed_annual_amount": 24000.0,
            "difference_annual": 0.0,
            "status": "matches_source",
            "notes": [
              "A disclosed variance is a reconciliation question, not an automatic earnings improvement."
            ]
          }
        ],
        "released_cash_flow": {
          "required": false,
          "available": false,
          "status": "unavailable",
          "currency": "USD",
          "source_fingerprint": null,
          "amount_monthly": null,
          "allocated_monthly": 0,
          "unallocated_monthly": null,
          "complete": true,
          "missing": [],
          "allocations": [],
          "source": {
            "updated_at": null,
            "before_monthly": null,
            "after_monthly": null,
            "new_operating_expenses_monthly": 0.0,
            "new_financing_fees_monthly": 0.0,
            "reconciled_retained_override": false
          },
          "note": "Recurring cash allocation only. Debt-service relief does not increase historical earnings, EBITDA or NOI."
        },
        "projection": {
          "proposed": {
            "status": "unreviewed_illustration",
            "earnings": 24000.0,
            "noi": 6000.0,
            "noi_status": "unreviewed_illustration",
            "first_year_noi": 6000.0,
            "first_year_earnings": 24000.0,
            "first_year_coverage_impact": 12000.0,
            "first_year_coverage_earnings": 24000.0,
            "first_year_dscr_current": 1.0,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": 24000.0,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": 1.0,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": 6000.0,
            "target_gap_refinance": null
          },
          "approved": {
            "status": "awaiting_review",
            "earnings": null,
            "noi": null,
            "noi_status": "awaiting_review",
            "first_year_noi": null,
            "first_year_earnings": null,
            "first_year_coverage_impact": null,
            "first_year_coverage_earnings": null,
            "first_year_dscr_current": null,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": null,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": null,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": null,
            "target_gap_refinance": null
          }
        },
        "totals": {
          "proposed": {
            "annual_impact": 12000.0,
            "monthly_impact": 1000.0,
            "first_year_impact": 12000.0,
            "one_time_cost": 0,
            "complete": true,
            "count": 1,
            "expected_count": 1,
            "known_annual_subtotal": 12000.0,
            "known_first_year_subtotal": 12000.0
          },
          "approved": {
            "annual_impact": 0,
            "monthly_impact": 0.0,
            "first_year_impact": 0,
            "one_time_cost": 0,
            "complete": false,
            "count": 0,
            "expected_count": 0,
            "known_annual_subtotal": null,
            "known_first_year_subtotal": null
          }
        },
        "targets": {
          "current": [
            {
              "ratio": 1.0,
              "earnings_required": 24000.0
            },
            {
              "ratio": 1.1,
              "earnings_required": 26400.0
            },
            {
              "ratio": 1.25,
              "earnings_required": 30000.0
            }
          ],
          "refinance": []
        },
        "missing": [],
        "risk_flags": [
          "Projected NOI starts from an explicit annual staff review; its tax-derived or manual basis is separate from the historical P&L and does not establish program eligibility."
        ],
        "notes": [
          "Historical earnings, NOI and current DSCR remain unchanged. Every improvement is a conditional operating illustration, not lender-approved income or a funding guarantee.",
          "Recurring annual coverage excludes one-time benefits. First-year illustrations prorate recurring changes by days active in the twelve-month horizon and deduct implementation costs.",
          "A refinance changes the debt-service denominator; principal, interest and financing proceeds are not operating earnings improvements."
        ],
        "all_actions_reviewed": false,
        "recommendation": {
          "threshold": 1.1,
          "recommended": null,
          "reason": "Current earnings and coverage must be established before checking the planning threshold.",
          "earnings_gap_annual": 14400.0
        },
        "actions": [
          {
            "id": "00000000-0000-4000-8000-000000000301",
            "label": "Model a marketing investment",
            "kind": "marketing_investment",
            "product_name": "Service visits",
            "review_state": "proposed",
            "gross_annual_impact": 12000.0,
            "net_annual_impact": 12000.0,
            "first_year_impact": 12000.0,
            "implementation_recurring_annual": 0,
            "implementation_one_time": 0.0,
            "included_in_approved_projection": false,
            "effective_date": "2027-01-01",
            "explanation": "Prior campaign evidence supports the test.",
            "source_note": "Synthetic assumption pending staff review.",
            "owner_name": "",
            "issues": [],
            "risk_flags": [
              "No supporting file is linked; this remains a disclosed operating assumption.",
              "Marketing revenue return and contribution margin are explicit assumptions, not guaranteed sales. Incremental spend is deducted once from its modeled contribution."
            ],
            "source_file_ids": [],
            "calculation": {
              "cadence": "monthly",
              "cost_basis": "total",
              "unit_label": "",
              "current_units_per_period": null,
              "proposed_units_per_period": null,
              "current_fixed_amount": null,
              "proposed_fixed_amount": null,
              "units_per_period": null,
              "current_amount": 0.0,
              "proposed_amount": 1000.0,
              "current_unit_price": null,
              "proposed_unit_price": null,
              "current_unit_cost": null,
              "proposed_unit_cost": null,
              "contribution_margin_pct": 50.0,
              "product_name": "Service visits",
              "revenue_return_multiple": 4.0,
              "processing_volume": null,
              "processing_transaction_count": null,
              "current_processing_rate_pct": null,
              "proposed_processing_rate_pct": null,
              "current_processing_rate_basis": "unknown",
              "proposed_processing_rate_basis": "unknown",
              "current_processing_fixed_fee": null,
              "proposed_processing_fixed_fee": null,
              "current_processing_per_transaction_fee": null,
              "proposed_processing_per_transaction_fee": null,
              "incremental_spend": 1000.0,
              "incremental_revenue": 4000.0,
              "incremental_contribution": 2000.0,
              "formula": "(proposed spend - current spend) * (revenue return multiple * contribution margin / 100 - 1)"
            }
          }
        ],
        "schema_version": "earnings-improvement-v1"
      }
    }
  },
  "negative": {
    "body": {
      "schema_version": "operating-plan-v1",
      "business_name": "Example Studio",
      "period_start": "2025-01-01",
      "period_end": "2025-12-31",
      "projection_start": "2027-01-01",
      "currency": "USD",
      "basis": "cash",
      "no_operating_expenses_confirmed": false,
      "client_attestation": false,
      "notes": "",
      "expenses": [
        {
          "id": "00000000-0000-4000-8000-000000000201",
          "category": "rent",
          "label": "Rent and premises",
          "payee": "",
          "current_amount": 24000.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "current_unit_cost": null,
          "current_fixed_amount": null,
          "cadence": "annual",
          "essential": true,
          "source_file_ids": [
            "00000000-0000-4000-8000-000000000101"
          ],
          "source_group_key": "tax-rent",
          "source_candidate_key": "",
          "bank_vendor_key": null,
          "notes": "",
          "excluded": false,
          "duplicate_of": null
        },
        {
          "id": "00000000-0000-4000-8000-000000000202",
          "category": "marketing",
          "label": "Current marketing",
          "payee": "",
          "current_amount": 0.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "current_unit_cost": null,
          "current_fixed_amount": null,
          "cadence": "monthly",
          "essential": true,
          "source_file_ids": [],
          "source_group_key": "",
          "source_candidate_key": "",
          "bank_vendor_key": null,
          "notes": "",
          "excluded": false,
          "duplicate_of": null
        }
      ],
      "category_confirmations": {
        "rent": "confirmed",
        "marketing": "confirmed"
      },
      "adjustments": [
        {
          "id": "00000000-0000-4000-8000-000000000301",
          "kind": "marketing_investment",
          "label": "Model a marketing investment",
          "driver_key": "service-visits",
          "product_name": "Service visits",
          "expense_row_id": "00000000-0000-4000-8000-000000000202",
          "current_amount": 0.0,
          "proposed_amount": 1000.0,
          "cost_basis": "total",
          "unit_label": "",
          "current_units_per_period": null,
          "proposed_units_per_period": null,
          "current_fixed_amount": null,
          "proposed_fixed_amount": null,
          "cadence": "monthly",
          "units_per_period": null,
          "current_unit_price": null,
          "proposed_unit_price": null,
          "current_unit_cost": null,
          "proposed_unit_cost": null,
          "contribution_margin_pct": 50.0,
          "revenue_return_multiple": 1.0,
          "implementation_cost": 0.0,
          "implementation_cost_cadence": "one_time",
          "effective_date": "2027-01-01",
          "explanation": "Prior campaign evidence supports the test.",
          "source_file_ids": [],
          "source_note": "Synthetic assumption pending staff review.",
          "owner_name": "",
          "merchant_source_key": null,
          "merchant_offer_id": null,
          "processing_volume": null,
          "processing_transaction_count": null,
          "current_processing_rate_pct": null,
          "proposed_processing_rate_pct": null,
          "current_processing_fixed_fee": null,
          "proposed_processing_fixed_fee": null,
          "current_processing_per_transaction_fee": null,
          "proposed_processing_per_transaction_fee": null,
          "current_processing_rate_basis": "unknown",
          "proposed_processing_rate_basis": "unknown",
          "excluded": false,
          "duplicate_of": null,
          "status": "proposed",
          "reviewed_by_user_id": null,
          "reviewed_at": null,
          "review_reason": "",
          "review_source_stamp": null,
          "baseline_treatment": "unreconciled",
          "baseline_reconciliation_note": ""
        }
      ],
      "released_cash_flow": {
        "source_fingerprint": null,
        "allocations": []
      },
      "field_sources": {}
    },
    "reply": {
      "guidance": {
        "policy_version": "operating-guidance-v1",
        "business": {
          "name": "Example Studio",
          "industry": "Professional services",
          "naics_code": "541990",
          "questions": [
            "Which service will this marketing investment support?"
          ]
        },
        "reporting": {
          "period_start": "2025-01-01",
          "period_end": "2025-12-31",
          "currency": "USD",
          "basis": "cash",
          "source_file_id": "00000000-0000-4000-8000-000000000101",
          "source_label": "Example business return.pdf"
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "source_amount": 24000,
            "currency": "USD",
            "basis": "cash",
            "year": 2025,
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "source_label": "Example business return.pdf",
            "source_fact_keys": [
              "rent"
            ],
            "notes": [
              "Split this reference total into multiple expense lines; do not retain both the total and full breakdown."
            ]
          }
        ],
        "essentials": [
          {
            "category": "rent",
            "label": "Rent",
            "prompt": "Confirm premises costs."
          },
          {
            "category": "marketing",
            "label": "Marketing",
            "prompt": "Confirm current marketing spend."
          }
        ],
        "action_templates": [
          {
            "key": "marketing",
            "label": "Model a marketing investment",
            "kind": "marketing_investment",
            "category": "marketing",
            "explanation": "State spend, return and contribution margin."
          }
        ],
        "warnings": []
      },
      "evidence": {
        "files": [
          {
            "file_id": "00000000-0000-4000-8000-000000000101",
            "file_name": "Example business return.pdf",
            "classification": "business_tax_return",
            "eligible_for_review": true
          }
        ],
        "expense_candidates": [
          {
            "key": "tax-rent",
            "source_candidate_key": "tax-rent",
            "source_group_key": "tax-rent",
            "label": "Rent and premises",
            "category": "rent",
            "current_amount": 24000,
            "cadence": "annual",
            "source_file_ids": [
              "00000000-0000-4000-8000-000000000101"
            ],
            "currency": "USD",
            "year": 2025,
            "source_note": "Source aggregate; do not retain this together with its granular breakdown."
          }
        ],
        "merchant_sources": [],
        "merchant_offers": [],
        "warnings": []
      },
      "evaluation": {
        "baseline": {
          "period": "2025",
          "currency": "USD",
          "basis": "cash",
          "revenue": null,
          "earnings": 12000.0,
          "earnings_kind": "profit_and_loss",
          "noi": -6000.0,
          "noi_kind": "staff_reviewed_noi",
          "noi_label": "Staff-reviewed NOI",
          "noi_year": "2025",
          "noi_basis": "cash",
          "noi_staff_reviewed": true,
          "noi_governance": {
            "policy_version": "noi-policy-v2",
            "status": "reviewed",
            "review_needed": false,
            "status_reason": "Staff-reviewed annual NOI",
            "reason_codes": [],
            "kind": "staff_reviewed_noi",
            "label": "Staff-reviewed NOI",
            "year": "2025",
            "period": "2025",
            "currency": "USD"
          },
          "noi_period": "2025",
          "noi_currency": "USD",
          "dscr": 0.5,
          "annual_debt_service": 24000.0,
          "provisional": false,
          "noi_provisional": false
        },
        "disclosure": {
          "operating_monthly": 2000.0,
          "cogs_monthly": 0.0,
          "operating_cash_monthly": 2000.0,
          "non_operating_monthly": 0.0,
          "one_time_total": 0.0,
          "active_count": 2,
          "excluded_count": 0,
          "missing_inputs": [],
          "cost_issues": [],
          "cost_mix": [
            {
              "category": "rent",
              "annual_amount": 24000.0,
              "missing_count": 0,
              "count": 1,
              "quantified_count": 1
            },
            {
              "category": "marketing",
              "annual_amount": 0.0,
              "missing_count": 0,
              "count": 1,
              "quantified_count": 1
            }
          ],
          "complete": true
        },
        "expense_groups": [
          {
            "key": "tax-rent",
            "category": "rent",
            "label": "Rent and premises",
            "baseline_annual_amount": 24000,
            "currency": "USD",
            "year": 2025,
            "disclosed_annual_amount": 24000.0,
            "difference_annual": 0.0,
            "status": "matches_source",
            "notes": [
              "A disclosed variance is a reconciliation question, not an automatic earnings improvement."
            ]
          }
        ],
        "released_cash_flow": {
          "required": false,
          "available": false,
          "status": "unavailable",
          "currency": "USD",
          "source_fingerprint": null,
          "amount_monthly": null,
          "allocated_monthly": 0,
          "unallocated_monthly": null,
          "complete": true,
          "missing": [],
          "allocations": [],
          "source": {
            "updated_at": null,
            "before_monthly": null,
            "after_monthly": null,
            "new_operating_expenses_monthly": 0.0,
            "new_financing_fees_monthly": 0.0,
            "reconciled_retained_override": false
          },
          "note": "Recurring cash allocation only. Debt-service relief does not increase historical earnings, EBITDA or NOI."
        },
        "projection": {
          "proposed": {
            "status": "unreviewed_illustration",
            "earnings": 6000.0,
            "noi": -12000.0,
            "noi_status": "unreviewed_illustration",
            "first_year_noi": -12000.0,
            "first_year_earnings": 6000.0,
            "first_year_coverage_impact": -6000.0,
            "first_year_coverage_earnings": 6000.0,
            "first_year_dscr_current": 0.25,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": 6000.0,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": 0.25,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": 24000.0,
            "target_gap_refinance": null
          },
          "approved": {
            "status": "awaiting_review",
            "earnings": null,
            "noi": null,
            "noi_status": "awaiting_review",
            "first_year_noi": null,
            "first_year_earnings": null,
            "first_year_coverage_impact": null,
            "first_year_coverage_earnings": null,
            "first_year_dscr_current": null,
            "first_year_dscr_with_refinance": null,
            "first_year_earnings_with_refinance": null,
            "annual_new_operating_expenses": 0.0,
            "coverage_basis": "Stabilized run-rate coverage uses annual impact; first-year coverage uses effective-date proration and implementation costs against the selected annual debt-service window. One-time benefits do not increase recurring debt-service coverage.",
            "dscr_current": null,
            "dscr_with_refinance": null,
            "annual_debt_service": 24000.0,
            "refinance_annual_debt_service": null,
            "target_gap_current": null,
            "target_gap_refinance": null
          }
        },
        "totals": {
          "proposed": {
            "annual_impact": -6000.0,
            "monthly_impact": -500.0,
            "first_year_impact": -6000.0,
            "one_time_cost": 0,
            "complete": true,
            "count": 1,
            "expected_count": 1,
            "known_annual_subtotal": -6000.0,
            "known_first_year_subtotal": -6000.0
          },
          "approved": {
            "annual_impact": 0,
            "monthly_impact": 0.0,
            "first_year_impact": 0,
            "one_time_cost": 0,
            "complete": false,
            "count": 0,
            "expected_count": 0,
            "known_annual_subtotal": null,
            "known_first_year_subtotal": null
          }
        },
        "targets": {
          "current": [
            {
              "ratio": 1.0,
              "earnings_required": 24000.0
            },
            {
              "ratio": 1.1,
              "earnings_required": 26400.0
            },
            {
              "ratio": 1.25,
              "earnings_required": 30000.0
            }
          ],
          "refinance": []
        },
        "missing": [],
        "risk_flags": [
          "Projected NOI starts from an explicit annual staff review; its tax-derived or manual basis is separate from the historical P&L and does not establish program eligibility."
        ],
        "notes": [
          "Historical earnings, NOI and current DSCR remain unchanged. Every improvement is a conditional operating illustration, not lender-approved income or a funding guarantee.",
          "Recurring annual coverage excludes one-time benefits. First-year illustrations prorate recurring changes by days active in the twelve-month horizon and deduct implementation costs.",
          "A refinance changes the debt-service denominator; principal, interest and financing proceeds are not operating earnings improvements."
        ],
        "all_actions_reviewed": false,
        "recommendation": {
          "threshold": 1.1,
          "recommended": null,
          "reason": "Current earnings and coverage must be established before checking the planning threshold.",
          "earnings_gap_annual": 14400.0
        },
        "actions": [
          {
            "id": "00000000-0000-4000-8000-000000000301",
            "label": "Model a marketing investment",
            "kind": "marketing_investment",
            "product_name": "Service visits",
            "review_state": "proposed",
            "gross_annual_impact": -6000.0,
            "net_annual_impact": -6000.0,
            "first_year_impact": -6000.0,
            "implementation_recurring_annual": 0,
            "implementation_one_time": 0.0,
            "included_in_approved_projection": false,
            "effective_date": "2027-01-01",
            "explanation": "Prior campaign evidence supports the test.",
            "source_note": "Synthetic assumption pending staff review.",
            "owner_name": "",
            "issues": [],
            "risk_flags": [
              "No supporting file is linked; this remains a disclosed operating assumption.",
              "Marketing revenue return and contribution margin are explicit assumptions, not guaranteed sales. Incremental spend is deducted once from its modeled contribution."
            ],
            "source_file_ids": [],
            "calculation": {
              "cadence": "monthly",
              "cost_basis": "total",
              "unit_label": "",
              "current_units_per_period": null,
              "proposed_units_per_period": null,
              "current_fixed_amount": null,
              "proposed_fixed_amount": null,
              "units_per_period": null,
              "current_amount": 0.0,
              "proposed_amount": 1000.0,
              "current_unit_price": null,
              "proposed_unit_price": null,
              "current_unit_cost": null,
              "proposed_unit_cost": null,
              "contribution_margin_pct": 50.0,
              "product_name": "Service visits",
              "revenue_return_multiple": 1.0,
              "processing_volume": null,
              "processing_transaction_count": null,
              "current_processing_rate_pct": null,
              "proposed_processing_rate_pct": null,
              "current_processing_rate_basis": "unknown",
              "proposed_processing_rate_basis": "unknown",
              "current_processing_fixed_fee": null,
              "proposed_processing_fixed_fee": null,
              "current_processing_per_transaction_fee": null,
              "proposed_processing_per_transaction_fee": null,
              "incremental_spend": 1000.0,
              "incremental_revenue": 1000.0,
              "incremental_contribution": 500.0,
              "formula": "(proposed spend - current spend) * (revenue return multiple * contribution margin / 100 - 1)"
            }
          }
        ],
        "schema_version": "earnings-improvement-v1"
      }
    }
  }
};
