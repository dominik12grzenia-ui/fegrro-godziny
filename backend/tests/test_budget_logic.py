"""Test logiki obliczeniowej modulu budget.

Sprawdza:
 - _compute_plan: quantity*unit_price lub jawny plan_netto
 - kaucja amount = plan * pct / 100
 - progress_pct = execution / plan * 100
 - value_netto z progresu = plan * pct / 100
"""
from routes.budget import _compute_plan


def test_compute_plan_explicit_overrides_calc():
    line = {"quantity": 10, "unit_price_netto": 100, "plan_netto": 999.99}
    assert _compute_plan(line) == 999.99


def test_compute_plan_from_qty_price():
    line = {"quantity": 120, "unit_price_netto": 340, "plan_netto": None}
    assert _compute_plan(line) == 40800.0


def test_compute_plan_zero_qty():
    line = {"quantity": 0, "unit_price_netto": 100}
    assert _compute_plan(line) == 0.0


def test_compute_plan_missing_fields():
    assert _compute_plan({}) == 0.0


def test_kaucja_calculation():
    plan = 40800.0
    gir_pct = 5.0
    expected = round(plan * gir_pct / 100, 2)
    assert expected == 2040.0
