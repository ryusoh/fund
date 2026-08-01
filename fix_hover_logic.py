import re

with open('js/charts/allocationChartManager.js', 'r') as f:
    code = f.read()

# Fix the processHoverState and showAllRowsIfDesktop to maintain exactly original logic
original_func = """function showAllRowsIfDesktop(allDataRows) {
    if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
        for (let i = 0; i < allDataRows.length; i++) {
            allDataRows[i].classList.remove('hidden');
        }
        return true;
    }
    return false;
}

function processHoverState(chart, activeElements, isOverCenter, allDataRows) {
    if (isOverCenter) {
        return showAllRowsIfDesktop(allDataRows);
    }
    if (activeElements.length > 0 && chart.data.labels?.length > 0) {
        return updateActiveSegmentRow(chart, activeElements, allDataRows);
    }
    return false;
}"""

fixed_func = """function showAllRowsIfDesktop(allDataRows) {
    if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
        for (let i = 0; i < allDataRows.length; i++) {
            allDataRows[i].classList.remove('hidden');
        }
        return true;
    }
    return false; // Actually in original it did not return anything if false, but the flag tableShouldBeVisible would remain false
}

function processHoverState(chart, activeElements, isOverCenter, allDataRows) {
    if (isOverCenter) {
        if (window.innerWidth > UI_BREAKPOINTS.MOBILE) {
            for (let i = 0; i < allDataRows.length; i++) {
                allDataRows[i].classList.remove('hidden');
            }
            return true;
        }
    } else if (activeElements.length > 0 && chart.data.labels?.length > 0) {
        return updateActiveSegmentRow(chart, activeElements, allDataRows);
    }
    return false;
}"""
code = code.replace(original_func, fixed_func)

# And the original issue was that updateActiveSegmentRow was returning `true` inside the if but wasn't doing exactly the same as original logic.
# Original logic:
# let tableShouldBeVisible = false;
# specificRowToShow = document.querySelector(`tbody tr[data-ticker="${ticker}"]`);
# if (specificRowToShow) { tableShouldBeVisible = true; for... }

with open('js/charts/allocationChartManager.js', 'w') as f:
    f.write(code)
