"""
Empirical Challenger Test Suite for Milestone 2 Round 2 (Frontend State Contracts & Zero Data)

Verifies:
1. ProductsView & SuppliersView zero-product handling (no NaN, no crashes, detects mockup fallback figures).
2. ExpensesView zero-expense states (verifies all sums/counters display ৳0 or empty, no mockups).
3. WhatsAppAssistantView zero-message state (verifies empty conversation array, no dummy transcripts).
4. SuppliersView memo upload workflow (null memoDraft, upload trigger, discard).
5. Build verification (Next.js build exit code 0).
"""

import os
import re
import subprocess
import pytest
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_DIR = ROOT_DIR / "frontend"
SRC_COMPONENTS = FRONTEND_DIR / "src" / "components"


def test_nextjs_build_exit_code_zero():
    """Verify that Next.js production build succeeds with exit code 0 and valid types."""
    res = subprocess.run(
        'cmd /c "cd frontend && npm run build"',
        cwd=str(ROOT_DIR),
        shell=True,
        capture_output=True,
        text=True,
        timeout=180,
    )
    assert res.returncode == 0, f"Next.js build failed:\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}"
    assert "Compiled successfully" in res.stdout
    assert "Generating static pages" in res.stdout


def test_whatsapp_assistant_zero_message_contract():
    """Verify that WhatsAppAssistantView initializes with an empty array and renders a clean empty state without dummy transcripts."""
    component_file = SRC_COMPONENTS / "WhatsAppAssistantView.tsx"
    assert component_file.exists(), "WhatsAppAssistantView.tsx not found"
    content = component_file.read_text(encoding="utf-8")

    # Verify initial messages state is empty array
    assert "useState<WhatsAppChatMessage[]>([])" in content, "Messages state not initialized as empty array"

    # Verify fallback dummy transcripts are NOT present
    forbidden_transcripts = ["init-1", "init-2", "EXP-1184"]
    for transcript in forbidden_transcripts:
        assert transcript not in content, f"Found mockup transcript '{transcript}' in WhatsAppAssistantView"

    # Verify empty message placeholder exists
    assert "No WhatsApp messages yet" in content, "Empty placeholder missing in WhatsAppAssistantView"


def test_expenses_view_zero_expense_and_recurring_contract():
    """Verify that ExpensesView displays ৳0 and zero counters when expenses and recurring items are empty."""
    component_file = SRC_COMPONENTS / "ExpensesView.tsx"
    assert component_file.exists(), "ExpensesView.tsx not found"
    content = component_file.read_text(encoding="utf-8")

    # Verify total operating expenses defaults to 0 and formatTaka(0)
    assert "total_operating_expenses_poisha || 0" in content

    # Verify recurring overhead counter falls back to 0
    assert "recurring?.active_count ?? 0" in content

    # Verify empty recurring items message
    assert "No active recurring overheads." in content

    # Verify empty recent entries message
    assert "No entries recorded for this period." in content

    # Verify empty withdrawals message
    assert "No withdrawals taken this month." in content

    # Verify that hardcoded fallback mockups from improvements are absent
    forbidden_literals = ["|| 4348", "|| 30000", "|| 300"]
    for literal in forbidden_literals:
        assert literal not in content, f"Found hardcoded expense fallback '{literal}'"


def test_suppliers_view_memo_upload_and_zero_product_contract():
    """Verify SuppliersView memo draft workflow and zero-product catalog handling."""
    component_file = SRC_COMPONENTS / "SuppliersView.tsx"
    assert component_file.exists(), "SuppliersView.tsx not found"
    content = component_file.read_text(encoding="utf-8")

    # 1. memoDraft initialized to null
    assert "useState<MemoDraftData | null>(null)" in content, "memoDraft not initialized cleanly as null"

    # 2. memo upload file input and handler exist
    assert "ref={memoFileInputRef}" in content
    assert "handleMemoUpload" in content
    assert "memoDraft && (" in content, "Memo OCR card not guarded by memoDraft condition"

    # 3. Discard resets memoDraft to null
    assert "setMemoDraft(null)" in content, "Discard action missing setMemoDraft(null)"

    # 4. Zero product catalog handling
    assert 'No products in catalog' in content, "Zero product option missing in SuppliersView"
    assert "productList.length === 0" in content, "productList.length === 0 check missing in product selector"

    # 5. Check no mockup supplier or product values are hardcoded
    assert "Rahim Fabrics" not in content, "Hardcoded supplier 'Rahim Fabrics' found in SuppliersView"
    assert "KRT-ROSE-M" not in content, "Hardcoded product 'KRT-ROSE-M' found in SuppliersView"


def test_products_view_zero_product_mockup_leakage():
    """
    Empirical check on ProductsView:
    When products list is empty ([]), does the Stock Count Adjustment drawer contain mockup fallbacks (114, 118, 350, 31 Oct)?
    """
    component_file = SRC_COMPONENTS / "ProductsView.tsx"
    assert component_file.exists(), "ProductsView.tsx not found"
    content = component_file.read_text(encoding="utf-8")

    # Check for mockup fallbacks in ProductsView stock adjustment drawer
    has_118 = "selectedAdjProduct?.stock_qty || 118" in content
    has_114 = "useState<number | ''>(114)" in content
    has_350 = "selectedAdjProduct?.cost_price ? selectedAdjProduct.cost_price / 100 : 350" in content
    has_31_oct = "Last count 31 Oct" in content

    # As an empirical challenger, we report whether mockup leakage exists
    leaks = []
    if has_118:
        leaks.append("adjSystemStock falls back to mockup 118")
    if has_114:
        leaks.append("adjCounted initialized to mockup 114")
    if has_350:
        leaks.append("adjUnitCost falls back to mockup ৳350")
    if has_31_oct:
        leaks.append("Hardcoded date 'Last count 31 Oct'")

    # Report findings
    if leaks:
        pytest.fail(f"ProductsView contains mockup fallback leaks from Improvements/6.jpeg: {', '.join(leaks)}")
